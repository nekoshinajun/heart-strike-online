import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/**
 * カメラ演出。基準ポーズ(見上げ構図)+ 各種オフセット(前進・FOVキック・シェイク)。
 * シェイク等はヒットストップ中も動くよう実時間dtで更新する。
 */
export class CameraController {
  constructor(aspect) {
    const c = Config.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, aspect, 0.1, 200);
    // シェイク無しの基準カメラ(ボール構え位置などの計算用)
    this.base = new THREE.PerspectiveCamera(c.fov, aspect, 0.1, 200);

    this.basePos = new THREE.Vector3(c.pos.x, c.pos.y, c.pos.z);
    this.baseLook = new THREE.Vector3(c.lookAt.x, c.lookAt.y, c.lookAt.z);

    this.playerX = 0; this.playerXTarget = 0;
    this.dolly = 0; this.dollyTarget = 0;
    this.lookOffset = new THREE.Vector3(); this.lookOffsetTarget = new THREE.Vector3();
    this.fovKick = 0;
    this.fovHold = 0; this.fovHoldTarget = 0;
    this.trauma = 0;
    this.t = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.update(0);
  }

  setAspect(aspect) {
    this.camera.aspect = this.base.aspect = aspect;
    // 縦長ほど横が狭くなるので、極端に細い端末ではFOVを少し広げる
    const extra = aspect < 0.5 ? (0.5 - aspect) * 30 : 0;
    this.fovBase = Config.camera.fov + extra;
    this.camera.updateProjectionMatrix();
    this.base.updateProjectionMatrix();
  }

  setPlayerX(x) { this.playerXTarget = x; }
  /** 攻撃時:ボールを追って前進 */
  follow(target) {
    this.dollyTarget = 1.6;
    this.lookOffsetTarget.set(target.x * 0.15, (target.y - this.baseLook.y) * 0.12, 0);
    this.fovHoldTarget = 3;
  }
  /** 防御時:迫るボールに備えてわずかに引く+FOV拡大 */
  brace() { this.dollyTarget = -0.4; this.lookOffsetTarget.set(0, -0.6, 0); this.fovHoldTarget = 4; }
  /** 会話イベント:ボス(顔)を少し大きく見せる。reset() で戻る */
  focusOn(point, zoom = 14) {
    this.dollyTarget = 0.6;
    this.lookOffsetTarget.set((point.x - this.baseLook.x) * 0.45, (point.y - this.baseLook.y) * 0.45, 0);
    this.fovHoldTarget = -zoom;
  }
  reset() { this.dollyTarget = 0; this.lookOffsetTarget.set(0, 0, 0); this.fovHoldTarget = 0; }

  /**
   * 演出(前進・FOV・シェイク・手番の左右)を含まない基準の姿勢のカメラ。端末ごとの演出のタイミングに左右されない計算用
   * (返球の軌道が画面に収まるかの判定:MULTI で全員が同じ結果になる)
   */
  restCamera() {
    const c = this.rest ?? (this.rest = new THREE.PerspectiveCamera());
    c.fov = this.fovBase ?? Config.camera.fov; c.aspect = this.base.aspect; c.near = this.base.near; c.far = this.base.far;
    c.position.copy(this.basePos); c.lookAt(this.baseLook);
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    return c;
  }

  /** 補間中の値を目標値へ即座に揃える(Energy Orb 配置など、構え位置を確定させたい時) */
  settle() {
    this.playerX = this.playerXTarget;
    this.dolly = this.dollyTarget;
    this.lookOffset.copy(this.lookOffsetTarget);
    this.fovHold = this.fovHoldTarget;
    this.fovKick = 0;   // 一時的な FOV キックも残さない(構え位置 = ゲート / Energy の配置が端末ごとの演出のタイミングでずれないように。MULTI で全員一致)
    this.update(0);
  }

  shake(amount) {
    const a = this.reducedMotion ? amount * 0.3 : amount;
    this.trauma = Math.min(1, this.trauma + a);
  }
  kickFov(deg) { this.fovKick = Math.max(this.fovKick, deg); }

  update(dt) {
    this.t += dt;
    this.playerX = damp(this.playerX, this.playerXTarget, 5, dt);
    this.dolly = damp(this.dolly, this.dollyTarget, 4, dt);
    this.fovHold = damp(this.fovHold, this.fovHoldTarget, 4, dt);
    this.lookOffset.x = damp(this.lookOffset.x, this.lookOffsetTarget.x, 4, dt);
    this.lookOffset.y = damp(this.lookOffset.y, this.lookOffsetTarget.y, 4, dt);
    this.fovKick = damp(this.fovKick, 0, 6, dt);

    const pos = this.basePos.clone();
    pos.x += this.playerX;
    const look = this.baseLook.clone().add(this.lookOffset);
    look.x += this.playerX * 0.4;
    const fwd = look.clone().sub(pos).normalize();
    pos.addScaledVector(fwd, this.dolly);

    const fov = (this.fovBase ?? Config.camera.fov) + this.fovHold + this.fovKick;

    this.base.position.copy(pos);
    this.base.lookAt(look);
    this.base.fov = fov;
    this.base.updateProjectionMatrix();
    this.base.updateMatrixWorld(true);

    // シェイク(trauma^2、複数sin波のノイズ)
    const s = this.trauma * this.trauma;
    const t = this.t * 38;
    const ox = (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.7) * 0.5) * 0.28 * s;
    const oy = (Math.sin(t * 1.7 + 0.3) + Math.sin(t * 2.9) * 0.5) * 0.28 * s;
    const roll = Math.sin(t * 1.3 + 2.1) * 0.035 * s;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);

    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.camera.translateX(ox);
    this.camera.translateY(oy);
    this.camera.rotateZ(roll);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  /** 基準カメラのローカル座標 → ワールド */
  localToWorld(offset, out = new THREE.Vector3()) {
    return this.base.localToWorld(out.set(offset.x, offset.y, offset.z));
  }
}
