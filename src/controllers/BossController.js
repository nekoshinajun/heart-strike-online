import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { BossPartManager } from '../boss/BossPartManager.js';
import { BossView2D } from '../boss/BossView2D.js';
import { Live2DBossView } from '../boss/Live2DBossView.js';
import { live2dById } from '../data/Live2DData.js';

/**
 * ボス(推しVTuber)のロジック:TotalHeart・部位ごとの PartHeart(BossPartManager)・当たり判定Collider。
 * 見た目は view(BossView2D / Live2D のボスは Live2DBossView)に委譲。攻撃モーションは持たない(返球は ReturnBallController)。
 *
 * Collider は 2D イラストの表示面付近に置いた透明な3D形状。
 *   head / chest / stomach / rightArm / leftArm / rightLeg / leftLeg(左右はキャラクター自身の左右)
 * 位置・サイズは Config.colliderLayouts のデータで決まる(画像差し替え時はレイアウトを切り替えて調整)。
 */
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

/**
 * ボスの命中判定 = 2D の「攻撃面」(Hit Plane)
 *   ボス(2D のイラスト)の表示面を1枚の平面として扱い、ハートの軌道がその面を通った瞬間の X / Y で HIT / MISS と部位を確定する
 *   → 画面で見て重なっていれば当たり。奥行き(厚み)による「奥へ飛びすぎて MISS」は無い。面を通った後に判定し直さない
 *   部位:各部位の Collider を面に投影した形(円 / 回転した四角)に入っているか。複数なら中心に近い方
 *   部位の間のすき間:イラストの不透明な部分(アルファ)なら HIT とし、いちばん近い部位にする(見た目でキャラに重なっているのに MISS にしない)
 *   判定は止まった姿勢(hitRoot)で行うので、MULTI の全員で同じ結果になる
 */
class BossHitPlane {
  constructor(boss) { this.boss = boss; this.isHitPlane = true; this.alphaCache = new WeakMap(); }
  /** 攻撃面のワールド Z(止まった姿勢のイラストの面)*/
  get z() { return this.boss.hitRoot.matrixWorld.elements[14]; }
  /** 線分 prev → pos が面を通ったら、その点で判定 → result / null(まだ通っていない)*/
  resolve(prev, pos) {
    const z = this.z;
    if (!(prev.z > z && pos.z <= z)) return null;
    const k = (prev.z - z) / (prev.z - pos.z);
    return this.judge(prev.clone().lerp(pos, k));
  }
  /** 面の上の点 P(ワールド)→ { type: 'hit', part, point, object } / MISS { type: 'wide' | 'over' | 'low', point } */
  judge(P) {
    const B = this.boss, local = B.hitRoot.worldToLocal(P.clone());
    let best = null;
    for (const c of B.hitColliders) {
      const d = this.inside(c, local);
      if (d != null && (!best || d < best.d)) best = { c, d };
    }
    if (!best && this.onSilhouette(local)) {
      // 部位の間のすき間でも、イラストに重なっていれば HIT(いちばん近い部位)
      for (const c of B.hitColliders) { const d = this.distance(c, local); if (!best || d < best.d) best = { c, d }; }
    }
    if (best) return { type: 'hit', part: best.c.userData.part, point: P.clone(), object: best.c };
    // MISS:どちらへ外れたか(左右 / 上 / 下)
    const bb = this.bounds();
    const type = local.y > bb.maxY ? 'over' : local.y < bb.minY ? 'low' : 'wide';
    return { type, point: P.clone() };
  }
  /** 面に投影した部位の形の中なら「中心からの近さ(0 = 中心 / 1 = 端)」、外なら null */
  inside(c, p) {
    const g = c.geometry.parameters, dx = p.x - c.position.x, dy = p.y - c.position.y;
    if (g.radius != null) { const d = Math.hypot(dx, dy) / g.radius; return d <= 1 ? d : null; }
    const r = -c.rotation.z, x = dx * Math.cos(r) - dy * Math.sin(r), y = dx * Math.sin(r) + dy * Math.cos(r);
    const ax = Math.abs(x) / (g.width / 2), ay = Math.abs(y) / (g.height / 2);
    return ax <= 1 && ay <= 1 ? Math.max(ax, ay) : null;
  }
  /** 部位の形の外側までの距離(すき間の HIT で、いちばん近い部位を選ぶ)*/
  distance(c, p) {
    const g = c.geometry.parameters, dx = p.x - c.position.x, dy = p.y - c.position.y;
    if (g.radius != null) return Math.max(0, Math.hypot(dx, dy) - g.radius);
    const r = -c.rotation.z, x = dx * Math.cos(r) - dy * Math.sin(r), y = dx * Math.sin(r) + dy * Math.cos(r);
    return Math.hypot(Math.max(0, Math.abs(x) - g.width / 2), Math.max(0, Math.abs(y) - g.height / 2));
  }
  bounds() {
    let minY = Infinity, maxY = -Infinity;
    for (const c of this.boss.hitColliders) {
      const g = c.geometry.parameters, e = g.radius ?? Math.max(g.width, g.height) / 2;
      minY = Math.min(minY, c.position.y - e); maxY = Math.max(maxY, c.position.y + e);
    }
    return { minY, maxY };
  }
  /** イラストの不透明な部分か(画像のアルファ。イラストが無い / 読めない時は false = 部位の形だけで判定)*/
  onSilhouette(p) {
    const mesh = this.boss.view.imageMesh, img = mesh?.material?.map?.image;
    if (!mesh || !img || !(img.width > 0)) return false;
    let a = this.alphaCache.get(img);
    if (!a) {
      try {
        const W = 160, H = Math.max(1, Math.round((W * img.height) / img.width));
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, H);
        a = { W, H, data: cx.getImageData(0, 0, W, H).data };
      } catch { a = { W: 0 }; }
      this.alphaCache.set(img, a);
    }
    if (!a.W) return false;
    // 体(colliderRoot と同じ座標)→ 板ポリのローカル(止まった姿勢では体の中の位置そのまま)
    _m.copy(mesh.matrix).invert();
    _v.set(p.x, p.y, 0).applyMatrix4(_m);
    const g = mesh.geometry; g.computeBoundingBox();
    const bb = g.boundingBox, u = (_v.x - bb.min.x) / (bb.max.x - bb.min.x), v = (_v.y - bb.min.y) / (bb.max.y - bb.min.y);
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    const ix = Math.min(a.W - 1, Math.floor(u * a.W)), iy = Math.min(a.H - 1, Math.floor((1 - v) * a.H));
    return a.data[(iy * a.W + ix) * 4 + 3] > 96;
  }
}

export class BossController {
  constructor(scene) {
    this.maxHeart = Config.boss.maxHeart;   // ステージの Heart Capacity(GameManager.prepareStage が設定)
    this.heart = 0;          // TotalHeart
    this.full = false;       // HEART MAX(クリア)
    this.colliders = [];

    this.root = new THREE.Group();
    this.root.position.set(0, 0, Config.boss.z);
    this.root.scale.setScalar(Config.boss.scale);
    scene.add(this.root);

    // 見た目:ステージの boss.live2d があれば Live2D(data/Live2DData.js)、無ければ従来の 2D
    const l2d = live2dById(Config.boss.live2d);
    this.view = l2d ? new Live2DBossView(this.root, l2d) : new BossView2D(this.root);
    this.parts = new BossPartManager();
    this.parts.onStateChange = (part, before, after) => {
      // v25: PartHeart は内部互換用に維持するが、ボス見た目へ部位状態を反映しない。
      this.onPartStateChange?.(part, before, after);
    };

    this.colliderMat = new THREE.MeshBasicMaterial({
      color: '#00ff88', wireframe: true, transparent: true, opacity: 0.6,
      visible: Config.debug.showColliders, depthTest: false,
    });
    this.colliderRoot = new THREE.Group();   // 表示と一緒に揺れる(呼吸・のけぞり)
    this.view.anchors.body.add(this.colliderRoot);
    // 当たり判定用:Collider の「止まった姿勢」の写し(ワールドに固定)。ボスの揺れ(呼吸・揺れの時刻)は端末ごとに違うので、
    // 判定をここで行えば同じ投球 = 同じ命中部位・位置になる(MULTI の全員で一致)。見た目と着弾マークは揺れる方(colliderRoot)
    this.hitRoot = new THREE.Group();
    this.hitRoot.matrixAutoUpdate = false;
    scene.add(this.hitRoot);
    this.hitColliders = [];
    this.hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitPlane = new BossHitPlane(this);   // 投球の命中判定(2D の攻撃面)
    // 返球の発射点(胸の前。レイアウトに追従)
    this.spawnAnchor = new THREE.Object3D();
    this.view.anchors.body.add(this.spawnAnchor);
    this.buildColliders();
  }

  get layout() { return Config.colliderLayouts[Config.boss.layout]; }

  /**
   * レイアウト定義(Config.colliderLayouts)から透明Colliderを作り直す。
   * 調整パネルで数値を変えた時・キャラ画像を差し替えた時に呼ぶ。
   */
  buildColliders() {
    for (const c of this.colliders) { c.geometry.dispose(); this.colliderRoot.remove(c); }
    this.colliders.length = 0;
    for (const c of this.hitColliders ?? []) this.hitRoot.remove(c);
    this.hitColliders = [];
    for (const p of this.parts.list) p.colliders.length = 0;
    for (const [part, d] of Object.entries(this.layout)) {
      if (!this.parts.get(part)) continue;
      const geo = d.shape === 'sphere'
        ? new THREE.SphereGeometry(d.r, 16, 12)
        : new THREE.BoxGeometry(d.w, d.h, d.d ?? 1.6);
      const c = new THREE.Mesh(geo, this.colliderMat);
      c.position.set(d.x, d.y, d.z ?? 0.3);
      c.rotation.z = THREE.MathUtils.degToRad(d.rot ?? 0);
      c.userData.part = part;
      c.renderOrder = 20; // 画像より手前に枠を描く
      this.colliderRoot.add(c);
      this.colliders.push(c);
      this.parts.get(part).colliders.push(c);
      const h = new THREE.Mesh(geo, this.hitMat);   // 判定用の写し(同じ形・同じローカル位置)
      h.position.copy(c.position); h.rotation.copy(c.rotation);
      h.userData.part = part; h.userData.live = c;   // live:見た目側の Collider(着弾マークはこちらに付ける)
      this.hitRoot.add(h);
      this.hitColliders.push(h);
    }
    this.syncHitRoot();
    const ch = this.layout.chest;
    if (ch) this.spawnAnchor.position.set(ch.x, ch.y - 0.6, 1.6);
    this.view.setPartAnchors?.(this.layout);
  }

  /** 判定用の写しを「体が止まった姿勢」(呼吸・揺れ・のけぞり無し)のワールド位置に置く */
  syncHitRoot() {
    const body = this.view.anchors.body, parent = body.parent ?? this.root;
    this.root.updateMatrixWorld(true);
    const rest = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    this.hitRoot.matrix.copy(parent.matrixWorld).multiply(rest).multiply(this.colliderRoot.matrix);
    this.hitRoot.matrixWorldNeedsUpdate = true;
    this.hitRoot.updateMatrixWorld(true);
  }

  /** 返球の発射位置・体が止まった姿勢(揺れ・溜めの動きに左右されない計算用。MULTI で全員同じ)*/
  restSpawnPoint(out = new THREE.Vector3()) {
    const body = this.view.anchors.body, parent = body.parent ?? this.root;
    this.root.updateMatrixWorld(true);
    return out.copy(this.spawnAnchor.position).applyMatrix4(parent.matrixWorld);   // 体の揺れ・のけぞり(body の動き)を除いた位置
  }

  /** 部位の中心(ワールド) */
  partCenter(part, out = new THREE.Vector3()) {
    const c = this.parts.get(part)?.colliders[0];
    return c ? c.getWorldPosition(out) : out.set(0, 0, 0);
  }

  /**
   * 部位の中心(ワールド)・体が止まった姿勢(判定用の写し)。呼吸・揺れのタイミングに左右されないので
   * ゲート / Energy の配置(お手本の1投の狙い点)に使う → MULTI で全クライアントが同じ位置になる
   */
  restPartCenter(part, out = new THREE.Vector3()) {
    this.syncHitRoot();
    const h = this.hitColliders?.find((c) => c.userData.part === part);
    return h ? h.getWorldPosition(out) : this.partCenter(part, out);
  }

  setDebugColliders(on) { this.colliderMat.visible = on; }
  get heartRate() { return this.heart / this.maxHeart; }
  get clearT() { return this.view.clearT; }

  /**
   * ハート玉が届いた:TotalHeart と PartHeart の両方が増える
   * @param damage 最終ダメージ(BattleCalc.finalDamage で確定した整数。ここでは倍率を掛けない)
   * @param reaction 命中リアクションの大きさ
   * @returns { heartGain, partGain, part, before, after, changed }
   */
  addHeart(partId, damage, reaction = 1) {
    const heartGain = Math.max(0, Math.round(Number(damage) || 0));
    this.heart = Math.min(this.maxHeart, this.heart + heartGain);
    const r = this.parts.addHeart(partId, heartGain);
    this.view.playHit(partId, Math.min(2.5, reaction));
    this.view.onHeartHit?.(partId);   // HIT が確定した瞬間のリアクション(Live2D の hit パラメータ)
    if (r.changed && r.after === 'HEART_MAX') this.view.setExpression('love', 1.6);
    else this.view.setExpression('happy', 0.7);
    if (this.heart >= this.maxHeart && !this.full) { this.full = true; this.view.setHeartMax(); }
    return { heartGain, ...r };
  }

  lookAtPlayer(x) { this.view.setLook(x); }

  /** 返球の発射位置(ワールド) */
  spawnPoint(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.spawnAnchor.getWorldPosition(out);
  }

  update(dt) { this.view.update(dt); }

  /** ボスを作り直す時に呼ぶ(Live2D の WebGL を解放)*/
  dispose() { this.view.dispose?.(); }
}
