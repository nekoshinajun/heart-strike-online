import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { BossPartManager } from '../boss/BossPartManager.js';
import { BossView2D } from '../boss/BossView2D.js';

/**
 * ボス(推しVTuber)のロジック:TotalHeart・部位ごとの PartHeart(BossPartManager)・当たり判定Collider。
 * 見た目は view(BossView2D)に委譲。攻撃モーションは持たない(返球は ReturnBallController)。
 *
 * Collider は 2D イラストの表示面付近に置いた透明な3D形状。
 *   head / chest / stomach / rightArm / leftArm / rightLeg / leftLeg(左右はキャラクター自身の左右)
 * 位置・サイズは Config.colliderLayouts のデータで決まる(画像差し替え時はレイアウトを切り替えて調整)。
 */
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

    this.view = new BossView2D(this.root);
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

  /** 部位の中心(ワールド) */
  partCenter(part, out = new THREE.Vector3()) {
    const c = this.parts.get(part)?.colliders[0];
    return c ? c.getWorldPosition(out) : out.set(0, 0, 0);
  }

  setDebugColliders(on) { this.colliderMat.visible = on; }
  get heartRate() { return this.heart / this.maxHeart; }
  get clearT() { return this.view.clearT; }

  /**
   * ハート玉が届いた:TotalHeart と PartHeart の両方が増える
   * @param mul 倍率(POWER × RALLY × Energy × SPECIAL)
   * @returns { heartGain, partGain, part, before, after, changed, loveSpot }
   */
  addHeart(partId, mul, reaction = mul) {
    const def = Config.parts[partId];
    const loveSpot = this.parts.loveSpotMul(partId) > 1;
    const heartGain = Math.round(def.heartGain * mul * this.parts.loveSpotMul(partId));
    this.heart = Math.min(this.maxHeart, this.heart + heartGain);
    const r = this.parts.addHeart(partId, heartGain);
    this.view.playHit(partId, Math.min(2.5, reaction));
    if (r.changed && r.after === 'HEART_MAX') this.view.setExpression('love', 1.6);
    else this.view.setExpression('happy', 0.7);
    if (this.heart >= this.maxHeart && !this.full) { this.full = true; this.view.setHeartMax(); }
    return { heartGain, loveSpot, ...r };
  }

  lookAtPlayer(x) { this.view.setLook(x); }

  /** 返球の発射位置(ワールド) */
  spawnPoint(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.spawnAnchor.getWorldPosition(out);
  }

  update(dt) { this.view.update(dt); }
}
