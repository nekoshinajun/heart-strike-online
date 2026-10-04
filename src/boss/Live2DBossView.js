import * as THREE from '../lib/three.js';
import { loadLive2DModel } from '../live2d/Live2DModel.js';

/**
 * Live2D のボスの「見た目」だけを担当するビュー(BossView2D と同じインターフェース)。ロジック・当たり判定は持たない。
 *   ・Live2D モデル(data/CharacterAssets.js の live2d)を自分専用のキャンバスに描き、3D 空間の板ポリに貼って表示する
 *   ・motions.idle はずっとループ。HIT の瞬間だけ parameters.hit をワンショットで動かす(onHeartHit)
 *   ・当たり判定は従来どおり Collider(Config.colliderLayouts)だけ。Live2D の ArtMesh は判定に使わない
 *     (imageMesh を持たないので BossHitPlane のアルファ判定も使われない)
 */
export class Live2DBossView {
  constructor(parent, def) {
    this.def = def;
    this.time = 0;
    this.heartMax = false;
    this.clearT = 0;

    this.root = new THREE.Group();
    parent.add(this.root);

    // 足元の影(浮いているポーズなので薄め)
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 32),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.3, 0.45, 1);
    shadow.position.y = 0.03;
    this.root.add(shadow);

    // Collider・表情オーバーレイの親(BossView2D の body と同じ役割)
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.ready = loadLive2DModel(def).then((model) => {
      if (this.disposed) { model.dispose(); return; }
      this.model = model;
      this.buildMesh();
    }).catch((e) => console.error('[Live2D]', e));
  }

  buildMesh() {
    const { height, y = 0, x = 0 } = this.def.display;
    const w = height * this.model.aspect;
    const geo = new THREE.PlaneGeometry(w, height);
    geo.translate(x, height / 2 + y, 0);
    this.texture = new THREE.CanvasTexture(this.model.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false }));
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;   // 最初の1枚が描けるまで(シェーダーの読み込み中)は出さない
    this.body.add(this.mesh);
  }

  /** Collider を配置する親(すべて body。Live2D は体の中で動くので部位ごとの親は持たない) */
  get anchors() { return { body: this.body, head: this.body, rightArm: this.body, leftArm: this.body }; }

  // ---- ゲームのイベント → 定義(CharacterAssets の live2d)にあるものだけ再生。無ければ何もしない ----
  /** ハートが HIT した瞬間(BossController.addHeart から。MISS では呼ばれない):parameters.hit + motions.damage */
  onHeartHit() { this.model?.trigger('hit'); this.model?.playMotion('damage'); }
  /** ボス攻撃の溜め(DefenseStates。何度か呼ばれるので再生中なら続ける):motions.attack */
  playCharge() { this.model?.playMotion('attack', { restart: false }); }
  /** 表情(AffectionSystem / BossController の 'normal' / 'happy' / 'love' など):expressions[名前] */
  setExpression(expr) { this.model?.setExpression(expr); }
  /** TotalHeart 100%:motions.defeat(BossView2D と同じく軽く弾む) */
  setHeartMax() { this.heartMax = true; this.clearT = 0; this.model?.playMotion('defeat'); }

  // ---- BossView2D と共通のインターフェースで、Live2D では使わないもの ----
  setPartAnchors() {}
  setPartState() {}
  playHit() {}
  playSpeak() {}
  setLook() {}

  update(dt) {
    this.time += dt;
    // 好感度の表情ポーズ(視線をそらす=少し顔を背ける 等)。AffectionSystem が pose を設定
    this.pose ??= { tilt: 0, x: 0, tTilt: 0, tX: 0 };
    this.pose.tilt += (this.pose.tTilt - this.pose.tilt) * Math.min(1, dt * 3);
    this.pose.x += (this.pose.tX - this.pose.x) * Math.min(1, dt * 3);
    this.body.rotation.z = this.pose.tilt;
    this.body.position.x = this.pose.x;

    if (this.heartMax) {
      this.clearT += dt;
      this.root.position.y = Math.abs(Math.sin(this.clearT * 5)) * 0.6 * Math.max(0, 1 - this.clearT / 3);
    }

    // 画面に出ていない間(メニュー・HOME 等)は Live2D を動かさない・描かない(別の WebGL で毎フレーム描くので重い)
    if (!this.model || this.offscreen) return;
    this.model.update(dt);
    if (!this.model.draw()) return;
    this.mesh.visible = true;
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.model?.dispose();
    this.texture?.dispose();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
  }
}
