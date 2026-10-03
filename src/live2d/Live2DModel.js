import { startCubism, CUBISM_SHADER_PATH } from './Live2DRuntime.js';

/**
 * Live2D モデル1体(Cubism SDK for Web の CubismUserModel)。自分専用の WebGL キャンバスへ描画する。
 * ゲーム側(Three.js)はこのキャンバスをテクスチャとして板ポリに貼る → ボスは3D空間の中に表示され、ハートは手前を飛ぶ。
 *
 *   ・model3.json の参照(moc3 / テクスチャ / physics3 / pose3)はファイルの中身どおりに読む(パスを推測しない)
 *   ・idle モーション(定義の idle.motion)をループ再生し続ける
 *   ・パラメータのワンショット(pulse):モーションの上からパラメータを一時的に上書きする(例:hit 0 → 1 → 0)
 *     モーションを切り替えないので idle は止まらない。再生中にもう一度呼べば最初からやり直す
 *
 * 定義(data/Live2DData.js の1件)
 *   model     … model3.json のパス
 *   idle      … { motion: model3.json のフォルダからの相対パス, fadeIn, fadeOut }
 *   reactions … { 名前: { param, value, attackSec, holdSec, releaseSec } }
 *   view      … 描画範囲(モデルのキャンバスに対する割合 u0 / v0 / u1 / v1。v は上から)と解像度(heightPx)
 */
const PRIORITY_IDLE = 1;

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Live2D: ${res.status} ${url}`);
  return res.arrayBuffer();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Live2D: failed to load ${url}`));
    img.src = url;
  });
}

/** パラメータのワンショット:0(元の値)→ value → 0。t は再トリガーで 0 に戻る */
class ParamPulse {
  constructor(id, def) {
    this.id = id;
    this.value = def.value ?? 1;
    this.attack = Math.max(0, def.attackSec ?? 0);
    this.hold = Math.max(0, def.holdSec ?? 0.1);
    this.release = Math.max(0, def.releaseSec ?? 0);
    this.t = -1;   // -1 = 停止中(パラメータを上書きしない)
  }
  trigger() { this.t = 0; }
  get active() { return this.t >= 0; }
  /** 今の強さ 0〜1 */
  weight() {
    const { t, attack, hold, release } = this;
    if (t < 0) return 0;
    if (t < attack) return t / attack;
    if (t < attack + hold) return 1;
    if (t < attack + hold + release) return 1 - (t - attack - hold) / release;
    return 0;
  }
  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    if (this.t >= this.attack + this.hold + this.release) this.t = -1;
  }
}

/** 定義から Live2D モデルを読み込む(Cubism の起動も含む)→ 読み込み完了後に resolve */
export async function loadLive2DModel(def) {
  const F = await startCubism();
  ModelClass ??= defineModelClass(F);
  const m = new ModelClass(def);
  await m.loadAssets();
  return m;
}

let ModelClass = null;
// Framework は Core の読み込み後にしか import できないので、クラスもその後で作る
const defineModelClass = ({ CubismUserModel, CubismModelSettingJson, CubismMatrix44, CubismFramework, CubismShaderManager_WebGL }) => class Live2DModel extends CubismUserModel {
  constructor(def) {
    super();
    this.def = def;
    this.dir = def.model.slice(0, def.model.lastIndexOf('/') + 1);
    this.pulses = {};
    this.projection = new CubismMatrix44();
  }

  async loadAssets() {
    const def = this.def;
    const settingBuf = await fetchBuffer(def.model);
    const setting = new CubismModelSettingJson(settingBuf, settingBuf.byteLength);
    this.setting = setting;

    // moc3
    const moc = await fetchBuffer(this.dir + setting.getModelFileName());
    this.loadModel(moc);

    // 物理演算・ポーズ(model3.json に書いてあれば)
    const physics = setting.getPhysicsFileName();
    if (physics) { const b = await fetchBuffer(this.dir + physics); this.loadPhysics(b, b.byteLength); }
    const pose = setting.getPoseFileName();
    if (pose) { const b = await fetchBuffer(this.dir + pose); this.loadPose(b, b.byteLength); }

    // idle モーション(ループ)
    if (def.idle?.motion) {
      const b = await fetchBuffer(this.dir + def.idle.motion);
      const motion = this.loadMotion(b, b.byteLength, 'idle');
      // model3.json の Groups(EyeBlink / LipSync)を渡す(モーション側の目パチ・口パクの対象)
      const eye = Array.from({ length: setting.getEyeBlinkParameterCount() }, (_, i) => setting.getEyeBlinkParameterId(i));
      const lip = Array.from({ length: setting.getLipSyncParameterCount() }, (_, i) => setting.getLipSyncParameterId(i));
      motion.setEffectIds(eye, lip);
      motion.setLoop(true);
      motion.setLoopFadeIn(false);   // ループの継ぎ目でフェードし直さない
      if (def.idle.fadeIn != null) motion.setFadeInTime(def.idle.fadeIn);
      if (def.idle.fadeOut != null) motion.setFadeOutTime(def.idle.fadeOut);
      this.idleMotion = motion;
    }

    // リアクション(パラメータのワンショット)
    const ids = CubismFramework.getIdManager();
    for (const [name, r] of Object.entries(def.reactions ?? {})) {
      const id = ids.getId(r.param);
      if (this._model.getParameterIndex(id) < 0) { console.warn(`Live2D: parameter "${r.param}" not found`); continue; }
      this.pulses[name] = new ParamPulse(id, r);
    }

    // 描画先(自分専用の WebGL キャンバス)
    const cw = this._model.getCanvasWidth(), ch = this._model.getCanvasHeight();
    const v = { u0: 0, v0: 0, u1: 1, v1: 1, ...def.view };
    const aspect = ((v.u1 - v.u0) * cw) / ((v.v1 - v.v0) * ch);
    const H = Math.round(def.view?.heightPx ?? 1024), W = Math.max(1, Math.round(H * aspect));
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.aspect = aspect;
    const opts = { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true };
    const gl = this.canvas.getContext('webgl2', opts) ?? this.canvas.getContext('webgl', opts);
    if (!gl) throw new Error('Live2D: WebGL is not available');
    this.gl = gl;

    // モデル座標(高さ 2 = -1〜1、幅は ±cw/ch)→ 描画範囲 → クリップ座標
    const A = cw / ch;
    const x0 = -A + 2 * A * v.u0, x1 = -A + 2 * A * v.u1, y0 = 1 - 2 * v.v1, y1 = 1 - 2 * v.v0;
    const sx = 2 / (x1 - x0), sy = 2 / (y1 - y0);
    this.projection.setMatrix(new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, -(x1 + x0) * sx / 2, -(y1 + y0) * sy / 2, 0, 1]));
    this.projection.multiplyByMatrix(this._modelMatrix);

    this.createRenderer(W, H);
    const renderer = this.getRenderer();
    renderer.startUp(gl);
    renderer.setIsPremultipliedAlpha(true);
    renderer.loadShaders(CUBISM_SHADER_PATH);

    // テクスチャ(model3.json の Textures の順番 = テクスチャ番号)
    for (let i = 0; i < setting.getTextureCount(); i++) {
      const img = await loadImage(this.dir + setting.getTextureFileName(i));
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      renderer.bindTexture(i, tex);
    }

    this.startIdle();
    this.setInitialized(true);
  }

  startIdle() {
    if (this.idleMotion) this._motionManager.startMotionPriority(this.idleMotion, false, PRIORITY_IDLE);
  }

  /** リアクション(パラメータのワンショット)を最初から再生 */
  trigger(name) { this.pulses[name]?.trigger(); }

  /** パラメータの今の値(確認用) */
  paramValue(name) { return this._model.getParameterValueById(CubismFramework.getIdManager().getId(name)); }

  update(dt) {
    const model = this._model;
    if (!model) return;
    // idle:モーションの値 → 保存(次のフレームはここから)
    model.loadParameters();
    if (this.idleMotion && this._motionManager.isFinished()) this.startIdle();   // 念のため(ループなので通常は終わらない)
    this._motionManager.updateMotion(model, dt);
    model.saveParameters();
    // リアクション:モーションの上から一時的に上書き(保存しないので次のフレームには残らない)
    for (const p of Object.values(this.pulses)) {
      p.update(dt);
      if (!p.active) continue;
      const base = model.getParameterValueById(p.id);
      model.setParameterValueById(p.id, base + (p.value - base) * p.weight());
    }
    this._physics?.evaluate(model, dt);
    this._pose?.updateParameters(model, dt);
    model.update();
  }

  /** シェーダー(fetch で非同期に読み込まれる)の準備ができたか。できるまでは描かない */
  get shaderReady() { return !!this.gl && CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded; }

  /** 描画 → true(シェーダーの読み込み中は描かずに false)*/
  draw() {
    const gl = this.gl;
    if (!gl || !this.getRenderer()) return false;
    if (!this.shaderReady) { this.getRenderer().loadShaders(CUBISM_SHADER_PATH); return false; }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const renderer = this.getRenderer();
    renderer.setRenderState(null, [0, 0, this.canvas.width, this.canvas.height]);
    renderer.setMvpMatrix(this.projection);
    renderer.drawModel(CUBISM_SHADER_PATH);
    return true;
  }

  dispose() {
    this.release();
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
};
