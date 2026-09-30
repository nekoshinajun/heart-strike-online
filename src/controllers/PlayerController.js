import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { CurveThrowCalculator } from '../physics/CurveThrowCalculator.js';
import { BallController } from './BallController.js';

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const v3 = new THREE.Vector3();

/**
 * プレイヤー側の座標ユーティリティ:構え位置、掴み判定、指位置→3D追従点、画面→3D変換、フリック→初速。
 * 1台で4人を切り替えるため、手番プレイヤーの情報は TurnManager から受け取る。
 */
export class PlayerController {
  constructor(cameraCtrl, boss, viewport) {
    this.cam = cameraCtrl;
    this.boss = boss;
    this.viewport = viewport; // { w, h }
    this.thrower = new CurveThrowCalculator(cameraCtrl, viewport);
    // 構え位置:画面比 idlePositionY の高さ・画面中央、カメラから holdOffset.z の奥行き(カメラ基準なので手番の移動にも追従)
    this.holdAnchor = () => this.idleWorld(new THREE.Vector3());
  }

  /** Safe Area 下端(px)。env() を読むための計測用要素を1つだけ作る */
  safeBottom() {
    if (!this.safeProbe) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:0;padding-bottom:env(safe-area-inset-bottom,0px)';
      document.body.appendChild(d);
      this.safeProbe = d;
    }
    return parseFloat(getComputedStyle(this.safeProbe).paddingBottom) || 0;
  }

  /** ハート玉の待機位置の画面Y(px) */
  idleScreenY() {
    const h = this.viewport.h, B = Config.ball;
    if (this.idleCacheH !== h) { this.idleCacheH = h; this.idleSafe = this.safeBottom(); }
    const maxY = h - this.idleSafe - h * B.idleMinChargeSpace;   // 下に操作空間を確保
    return Math.min(h * B.idlePositionY, maxY);
  }

  idleWorld(out) {
    const { w } = this.viewport;
    const y = this.idleScreenY();
    ndc.set(0, -(y / this.viewport.h) * 2 + 1);
    ray.setFromCamera(ndc, this.cam.base);
    const depth = -Config.ball.holdOffset.z;
    const fwd = this.cam.base.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, this.cam.base.position.clone().addScaledVector(fwd, depth));
    return ray.ray.intersectPlane(plane, out) ?? this.cam.localToWorld(Config.ball.holdOffset, out);
  }

  /** 画面上の点(px) → カメラから depth 離れた3D点(キャッチ地点の算出に使う) */
  screenToWorld(x, y, depth, out = new THREE.Vector3()) {
    const { w, h } = this.viewport;
    ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    ray.setFromCamera(ndc, this.cam.base);
    return out.copy(ray.ray.origin).addScaledVector(ray.ray.direction, depth);
  }

  toScreen(world, camera = this.cam.camera) {
    v3.copy(world).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * this.viewport.w, y: (-v3.y * 0.5 + 0.5) * this.viewport.h, z: v3.z };
  }

  /** 構えたボールの画面位置と見かけ半径 */
  heldBallScreen() {
    const p = this.holdAnchor();
    const s = this.toScreen(p, this.cam.base);
    s.r = BallController.screenRadius(this.cam.base, p, this.viewport.h);
    return s;
  }

  /** タッチ位置がボールの上か(指で直接触る) */
  isOnBall(x, y, ballWorld) {
    const T = Config.throw;
    const s = this.toScreen(ballWorld, this.cam.base);
    const r = BallController.screenRadius(this.cam.base, ballWorld, this.viewport.h);
    return Math.hypot(x - s.x, y - s.y) <= Math.max(T.grabRadiusMin, r * T.grabRadiusScale);
  }

  /**
   * 指の画面位置 → 構え位置と同じ奥行きの3D点(ボールが指に追従する先)。
   * 上方向には followMaxUp までしか持ち上がらない(投げる前に奥へ行きすぎない)。
   */
  fingerToWorld(x, y) {
    const { w, h } = this.viewport;
    const hold = this.heldBallScreen();
    const cy = THREE.MathUtils.clamp(y, hold.y - Config.throw.followMaxUp * h, hold.y + Config.power.maxPullDown * h);
    ndc.set((x / w) * 2 - 1, -(cy / h) * 2 + 1);
    ray.setFromCamera(ndc, this.cam.base);
    const depth = -Config.ball.holdOffset.z;
    const fwd = this.cam.base.getWorldDirection(new THREE.Vector3());
    const planePoint = this.cam.base.position.clone().addScaledVector(fwd, depth);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, planePoint);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ?? this.holdAnchor();
  }

  /** FlickInfo → 初速(null なら投球にならない) */
  /** ジェスチャー + POWER → 投球パラメータ(AIM の起点は構え位置の画面座標) */
  computeThrow(flick, power, start) {
    const hs = this.heldBallScreen();
    const oy = Config.aim.originY;
    this.thrower.holdScreen = oy == null ? hs : { x: hs.x, y: oy * this.viewport.h };
    return this.thrower.compute(flick, power, start ?? this.holdAnchor());
  }
}
