import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { abilityMul } from '../data/Growth.js';

/**
 * 投球の 2D → 3D 変換(Pokémon GO 型)。入力は GestureAnalyzer の解析結果だけ:
 *   リリース方向 dir(画面)→ 水平の向き(yaw)。↑ = 正面 / ↗ = 右上 / ↖ = 左上
 *   リリースの速さ speed(画面高さ/秒)→ 強さ 0〜1 → 水平の初速(発射角は一定)
 *        = 弱い → 手前に落ちる / 普通 → ボスに届く / 強い → 奥(頭の上)まで届く。HEART(ダメージ)は変わらない
 *   回転 spin(-1〜1)→ カーブ(キャラクターの CURVE ステータスで強さを補正)
 *   発射位置 start = 離した瞬間にハートが画面上にあった場所(呼び出し側で渡す)
 * 自動エイムなし。CONTROL(キャラ性能)の小さなずれだけ乱数(MULTI は投球データごと全員へ送る)。
 */
/** 弾道の基準の構え位置(Config.throwInput.refStart。無ければ実際の構え位置)。左右(x)は実際の位置 */
function refStart(start) {
  const R = Config.throwInput.refStart;
  return R ? new THREE.Vector3(start.x, R.y, R.z) : start;
}

export class CurveThrowCalculator {
  constructor(cameraCtrl, viewport) {
    this.cam = cameraCtrl;
    this.viewport = viewport;
    // キャラクター(CURVE / CONTROL ステータス・アビリティ)による補正。入力(POWER/AIM/SPIN)とは独立に掛かる。手番ごとに差し替える
    this.mods = { curveMul: 1, controlError: 0, abilities: [] };
    this.rng = Math.random;   // CONTROL の誤差に使う乱数(テストでは差し替えられる)
  }

  /** カメラ基準の水平前方・右(右 = fwd × up = ワールド +X = 画面右) */
  basis() {
    const fwd = new THREE.Vector3();
    this.cam.base.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    return { fwd, right };
  }

  /**
   * 弾道:水平の向き H(単位)・ボスの面までの水平距離 d・到達の高さ dy(発射位置から)を、水平の速さ vh で通る初速
   */
  ballistic(H, d, dy, vh) {
    const g = Config.throw.gravity, T = d / Math.max(0.5, vh);
    return { velocity: H.clone().multiplyScalar(vh).add(new THREE.Vector3(0, (dy + 0.5 * g * T * T) / T, 0)), T };
  }

  /** 基準の弾道(発射角 launchDeg 一定)で水平の速さ vh0 の時、距離 d 先での高さの変化 */
  baseRise(d, vh0) {
    const g = Config.throw.gravity, k = Math.tan(THREE.MathUtils.degToRad(Config.throwInput.launchDeg)), T = d / Math.max(0.5, vh0);
    return vh0 * k * T - 0.5 * g * T * T;
  }

  /**
   * お手本の1投(Heart Gate / Energy の配置・テスト用):start から target を通る、実際の投球と同じ物理の弾道
   *   基準の発射角で target に届く速さを解く。power は使わない(互換のため残す)
   */
  buildThrow(start, target, power, spin) {
    void power;
    const g = Config.throw.gravity, G = Config.throwInput;
    // 届く速さ・飛ぶ時間は「基準の構え位置(refStart)」から解く → 実際の構え位置から、同じ時間で同じ点へ届く弾道にする
    const S0 = refStart(start);
    const Hv = new THREE.Vector3(target.x - S0.x, 0, target.z - S0.z);
    const d = Math.max(0.01, Hv.length());
    const dy = target.y - S0.y, k = Math.tan(THREE.MathUtils.degToRad(G.launchDeg));
    const den = d * k - dy;
    const vh0 = den > 0.05 ? Math.sqrt((g * d * d) / (2 * den)) : G.maxVelocity * 1.3;
    const T0 = d / Math.max(0.5, vh0);
    const Hn = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
    const dn = Math.max(0.01, Hn.length()); Hn.normalize();
    const { velocity, T } = this.ballistic(Hn, dn, target.y - start.y, dn / T0);
    const cv = this.curveFor(spin, T);
    if (cv) velocity.add(cv.dv);
    return { velocity, curveAccel: cv?.accel ?? null, drive: null, speed3d: velocity.length(), launchDeg: G.launchDeg, reachable: den > 0.05, flightTime: T };
  }

  /** カーブの横運動:飛行時間 T で「逆側へ bulge 膨らみ → 到達時に shift だけ曲がる」(+ = 右)→ { dv(初速の横), accel(横加速度)} */
  curveFor(spin, T) {
    if (!spin) return null;
    const C = Config.curve, { right } = this.basis();
    const s = Math.sign(spin), m = Math.abs(spin) * this.mods.curveMul;
    const B = Math.max(0.001, C.bulge * m), L = C.shift * m;
    const A = (2 * (Math.sqrt(B) + Math.sqrt(B + L)) ** 2) / (T * T);
    const K = Math.sqrt(2 * A * B);
    return { dv: right.clone().multiplyScalar(-s * K), accel: right.clone().multiplyScalar(s * A) };
  }

  /**
   * ジェスチャー(GestureAnalyzer.release の結果)→ 投球パラメータ。null = 投げていない(下 / 横へ動かしただけ・遅すぎる)
   * @param gest  { dir:{x,y}, speed(画面高さ/秒), spin(-1〜1), turnDeg }
   * @param start 発射位置(ワールド)= 離した瞬間のハートの位置
   */
  compute(gest, start) {
    const G = Config.throwInput, C = Config.curve;
    if (!gest || gest.speed < G.minReleaseSpeed || -gest.dir.y < G.minUpward) return null;
    // 強さ:リリースの速さ → 0〜1(速さ以外は見ない)
    const p = THREE.MathUtils.clamp((gest.speed - G.weakSpeed) / Math.max(1e-6, G.strongSpeed - G.weakSpeed), 0, 1);
    const vh0 = G.minVelocity + (G.maxVelocity - G.minVelocity) * p;   // 基準の水平の速さ(強さだけで決まる)
    // 向き:画面のリリース方向の左右の傾き → 水平の向き(画面の上 = 正面)
    const up = -gest.dir.y;
    const yaw = THREE.MathUtils.clamp(Math.atan2(gest.dir.x, up) * G.yawGain, -THREE.MathUtils.degToRad(G.maxYawDeg), THREE.MathUtils.degToRad(G.maxYawDeg));
    const { fwd, right } = this.basis();
    const H = fwd.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(right, Math.sin(yaw));
    // ボスの面までの水平距離 → 基準の弾道(発射角一定)での到達の高さ
    //   到達点と飛ぶ時間は基準の構え位置(refStart = 見上げカメラの頃のハートの位置)から計算 → カメラの構図を変えても
    //   同じフリックなら同じ所へ同じ時間で届く。実際の構え位置からはその点へ向かう弾道で飛ばす
    const S0 = refStart(start);
    const depth = Math.max(1, (S0.z - (Config.boss.z + 0.5)) / Math.max(0.2, -H.z));
    const T0 = depth / Math.max(0.5, vh0);
    const arrive = new THREE.Vector3(start.x + H.x * depth, S0.y + this.baseRise(depth, vh0), S0.z + H.z * depth);
    const Hn = new THREE.Vector3(arrive.x - start.x, 0, arrive.z - start.z);
    const dn = Math.max(0.01, Hn.length()); Hn.normalize();
    const { velocity, T } = this.ballistic(Hn, dn, arrive.y - start.y, dn / T0);
    // カーブ:入力の回転 × キャラクターの CURVE(mods.curveMul は curveFor の中)× アビリティ
    const ab = this.mods.abilities ?? [];
    const actx = { pull: p, throwSpin: gest.spin, effects: [] };
    const lim = C.maxSpin;
    const spin = THREE.MathUtils.clamp(gest.spin * (G.maxSpin ?? 1) * abilityMul(ab, 'curve', actx), -lim, lim);
    let curveAccel = null;
    const cv = this.curveFor(spin, T);
    if (cv) { velocity.add(cv.dv); curveAccel = cv.accel; }
    // CONTROL:到達点が半径 controlError の円の中で小さくずれる(キャラの性能。0 なら入力どおり)
    const ctl = Math.max(0, (this.mods.controlError ?? 0) * abilityMul(ab, 'control', actx, { onlyWhen: true }));
    const controlOffset = { x: 0, y: 0 };
    if (ctl > 0) {
      const r = ctl * Math.sqrt(this.rng()), t = this.rng() * Math.PI * 2;
      controlOffset.x = r * Math.cos(t); controlOffset.y = r * Math.sin(t);
      velocity.addScaledVector(right, controlOffset.x / T); velocity.y += controlOffset.y / T;
    }
    const m = Config.power.minThrowPower;
    return {
      velocity, curveAccel, drive: null, start: start.clone(),
      power: m + (1 - m) * p,          // 表示用(0〜1 の強さ p を従来の POWER の尺度へ)。HEART は変わらない
      strength: p, pull: p,
      speed3d: velocity.length(), launchDeg: G.launchDeg, reachable: true, flightTime: T,
      spin, throwSpin: gest.spin, turnDeg: gest.turnDeg,
      yawDeg: THREE.MathUtils.radToDeg(yaw), angleDeg: THREE.MathUtils.radToDeg(Math.atan2(gest.dir.x, up)),
      gestureN: (gest.path ?? 0) / this.viewport.h, segmentMs: 0,
      effects: [], route: null, feel: null, driveSink: 0,
      controlOffset, controlError: ctl,
      direction: velocity.clone().normalize(),
      curveStrength: Math.abs(spin) * C.shift * this.mods.curveMul,
      curveDir: spin > 0 ? 'right' : spin < 0 ? 'left' : 'straight',
      strong: p >= 0.9,
    };
  }
}
