import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { applyBallEffects, throwFeel } from '../throw/BallEffects.js';
import { abilityMul } from '../data/Growth.js';

/**
 * 投球パラメータの計算。POWER / AIM / SPIN を分離して扱う。自動エイム・乱数なし。
 *  - POWER:下へ引いた量(ThrowController で確定)→ 初速の大きさ
 *  - AIM  :ジェスチャーの向き(左右)と長さ(高さ)→ ボス面上の狙い点 → その点を通る放物線を解く
 *  - SPIN :ジェスチャー中の切り返し(analyzeCurve)
 *  - BallEffect(PRE-SPIN / DRIVE …):投球前に仕込んだ球質。投げた瞬間に BallEffects で SPIN・飛行へ合成
 * 旧仕様(フリックの速さ=高さ)は廃止。以下は旧コメント:
 *
 *  1. フリック区間の切り出し:離す直前から遡り、指が止まっていた/下へ動いていた所で区切る
 *     (掴んだ後の位置調整はフリックとして扱わない)
 *  2. Throw Velocity:離す直前 sampleWindowMs の上方向の速さ(画面高さ/秒)→ 初速の大きさ
 *     弱い→手前に落ちる / 適正→胴〜頭 / 強すぎ→頭上を越える
 *  3. Throw Direction:フリック区間の始点→終点(弦)の角度 → 左右
 *  4. Spin:最後に切り返した向き(符号)と、切り返し角+横の膨らみ(大きさ)。↑→← = 左カーブ
 *  5. Curve Strength:|spin| × curve.strength(横加速度 units/s²)
 * 3D変換はカメラ基準:カメラの水平前方・右方向ベクトルで初速を組み立てる。
 */
export class CurveThrowCalculator {
  constructor(cameraCtrl, viewport) {
    this.cam = cameraCtrl;
    this.viewport = viewport;
    this.holdScreen = null;   // 構え位置の画面座標(AIMの起点)。PlayerController が設定
    // キャラクター(タイプ)による補正。入力(POWER/AIM/SPIN)とは独立に掛かる。手番ごとに差し替える
    this.mods = { speedMul: 1, curveMul: 1, controlError: 0, abilities: [] };
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

  /** POWER(0〜1)→ 初速の大きさ */
  speedFor(power) {
    const P = Config.power;
    return (P.minSpeed + (P.maxSpeed - P.minSpeed) * THREE.MathUtils.clamp(power, 0, 1)) * this.mods.speedMul;
  }

  /**
   * AIM:ジェスチャーの向きと長さ → 画面上の狙い点 → ボス面上のワールド座標
   *   向き = 左右 / 長さ = 高さ(長く弾くほど上)
   */
  aimTarget(dirX, dirY, lenPx) {
    const { w, h } = this.viewport;
    const A = Config.aim;
    const o = this.holdScreen ?? { x: w / 2, y: h * 0.8 };
    const reach = h * (A.base + A.gain * (lenPx / h));
    const sx = THREE.MathUtils.clamp(o.x + dirX * reach, -w * 0.2, w * 1.2);
    const sy = THREE.MathUtils.clamp(o.y + dirY * reach, -h * 0.3, h);
    const ndc = new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam.base);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(Config.boss.z + 0.5));
    const out = new THREE.Vector3();
    const world = ray.ray.intersectPlane(plane, out) ?? out.set(0, 5, Config.boss.z);
    world.y = Math.max(0.4, world.y);   // 床より下は狙えない(足元)
    return { world, screen: { x: sx, y: sy } };
  }

  /**
   * POWER + AIM + SPIN → 初速と横力。
   * AIM の地点を通る放物線(低い弾道)を初速の大きさ固定で解く → Power が高いほど低く速い弾道。
   * 届かない(Power不足)場合は最大到達角で投げる → 手前に落ちる。
   * SPIN は「曲がる向きと逆へ bulge 膨らんでから、狙い点より shift だけ曲がる向きへ」着弾する横運動を解く。
   */
  buildThrow(start, target, power, spin, driveSink = 0) {
    const T = Config.throw, C = Config.curve;
    const g = T.gravity;
    const v = this.speedFor(power);
    const H = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
    const d = Math.max(0.01, H.length());
    H.normalize();
    const dy = target.y - start.y;
    const disc = v ** 4 - g * (g * d * d + 2 * dy * v * v);
    let theta, reachable = true;
    if (disc >= 0) theta = Math.atan((v * v - Math.sqrt(disc)) / (g * d));
    else { theta = (Math.atan2(dy, d) + Math.PI / 2) / 2; reachable = false; }
    const velocity = H.clone().multiplyScalar(v * Math.cos(theta)).add(new THREE.Vector3(0, v * Math.sin(theta), 0));
    const { right } = this.basis();
    let curveAccel = null;
    if (spin !== 0) {
      // 飛行時間 T に合わせて「逆側へ bulge 膨らみ → 着弾で shift 曲がる」横運動を解く(Power が変わっても曲がり量は一定)
      //   x(t) = -s·K·t + ½·s·A·t²   … 頂点で -s·B、t=T で +s·L
      const T = d / Math.max(1, v * Math.cos(theta));
      const s = Math.sign(spin), m = Math.abs(spin) * this.mods.curveMul;
      const B = Math.max(0.001, C.bulge * m), L = C.shift * m;
      const A = (2 * (Math.sqrt(B) + Math.sqrt(B + L)) ** 2) / (T * T);
      const K = Math.sqrt(2 * A * B);
      velocity.addScaledVector(right, -s * K);
      curveAccel = right.clone().multiplyScalar(s * A);
    }
    // DRIVE:前半は通常の軌道、ボスへ近づくほど下向きの力を強める(t0 から T まで直線的に強く)→ ボスの位置で driveSink だけ沈む
    //   沈む量 = a·(T−t0)²/6 → a = 6·sink/(T−t0)²。時間で決めるので同じ入力 = 同じ軌道(MULTI の再現も同じ)
    let drive = null;
    if (driveSink > 0) {
      const T = d / Math.max(1, v * Math.cos(theta));
      const t0 = T * Config.drive.startFrac, span = Math.max(0.05, T - t0);
      drive = { accel: (6 * driveSink) / (span * span), t0, t1: T };
    }
    return { velocity, curveAccel, drive, speed3d: v, launchDeg: THREE.MathUtils.radToDeg(theta), reachable };
  }

  /**
   * ジェスチャー(POWER 固定後の指の動き)→ 投球パラメータ
   * @param flick  ジェスチャー区間の FlickInfo(samples はジェスチャー開始から)
   * @param power  0〜1(下へ引いた量)
   * @param start  ボールの発射位置(ワールド)
   * @param effects 投球前に仕込んだ球質(BallEffect の配列。PRE-SPIN / DRIVE …)
   * @param route   投球ルート('DIRECT' / 'CURVE'。プレイヤーの選択)
   */
  compute(flick, power, start, effects = [], route = null) {
    const C = Config.curve;
    const h = this.viewport.h;
    const samples = flick.samples?.length ? flick.samples : [flick.start, flick.end];
    const a = samples[0], b = flick.end;
    const cx = b.x - a.x, cy = b.y - a.y;
    const len = Math.hypot(cx, cy);
    if (len / h < Config.aim.minGesture || cy > -4) return null;   // 上へ弾いていない

    // SPIN
    const curve = C.enableCurveBall ? this.analyzeCurve(samples, a, b, flick.velocity, len) : null;
    const throwSpin = curve?.spin ?? 0;
    // 球質の合成(ダメージには関係しない):
    //   最終カーブ = キャラクター性能(mods.curveMul:buildThrow で掛かる)× 投球ルート × 投球の SPIN × PRE-SPIN 補正 × 引っ張り量(Curve Resistance)
    //   引っ張り量 pull = 球速を決めた引きの割合(浅い = 遅い・曲がりやすい / 深い = 速い・まっすぐ。0 にはならない)
    const m = Config.power.minThrowPower;
    const pull = THREE.MathUtils.clamp((power - m) / Math.max(1e-6, 1 - m), 0, 1);
    const feel = throwFeel(route ?? Config.throwRoute.default, pull);
    const fx = applyBallEffects(effects, throwSpin, feel);
    // アビリティ(条件つき):カーブ / DRIVE の効き(例:PRE-SPIN を仕込んだカーブ ×1.15、DRIVE の沈み ×1.2)
    const actx = { pull, throwSpin, effects };
    const ab = this.mods.abilities ?? [];
    const lim = C.maxSpin * Math.max(1, Config.preSpin.sameDirMul) * 2;
    const spin = THREE.MathUtils.clamp(fx.spin * feel.curveScale * abilityMul(ab, 'curve', actx), -lim, lim);
    const driveSink = fx.driveSink * abilityMul(ab, 'drive', actx);
    // AIM(弦の向きと長さ)
    const aim = this.aimTarget(cx / len, cy / len, len);
    // CONTROL:狙った点から小さくずれる(キャラの性能。半径 controlError の円の中。0 なら入力どおり)
    //   ずれは初速に含まれるので、MULTI でも全員に同じ投球として届く
    //   アビリティの条件つき CONTROL(例:深く引いた球のブレ ×0.6)はここで投球ごとに掛ける
    const ctl = Math.max(0, (this.mods.controlError ?? 0) * abilityMul(ab, 'control', actx, { onlyWhen: true }));
    const controlOffset = { x: 0, y: 0 };
    if (ctl > 0) {
      const r = ctl * Math.sqrt(this.rng()), t = this.rng() * Math.PI * 2;
      controlOffset.x = r * Math.cos(t); controlOffset.y = r * Math.sin(t);
      aim.world.x += controlOffset.x; aim.world.y += controlOffset.y;
    }
    const th = this.buildThrow(start, aim.world, power, spin, driveSink);
    return {
      ...th,
      power, spin, throwSpin, aim, pull, route: feel.route, feel,
      effects: (effects ?? []).map((e) => ({ ...e })),
      driveSink, controlOffset, controlError: ctl,
      direction: th.velocity.clone().normalize(),
      curveStrength: Math.abs(spin) * C.shift * this.mods.curveMul,   // 最終的に適用された曲がり量(units)
      curveDir: spin > 0 ? 'right' : spin < 0 ? 'left' : 'straight',
      turnDeg: curve ? THREE.MathUtils.radToDeg(curve.turn) : 0,
      angleDeg: THREE.MathUtils.radToDeg(Math.atan2(cx, -cy)),
      gestureN: len / h,
      segmentMs: b.t - a.t,
      strong: power >= 0.9,
    };
  }

  /**
   * 指の軌跡からカーブを解析する。
   *   earlyDir … フリック区間の前半(〜45%)の向き = ボールを振り出す向き
   *   lateDir  … 離す直前の速度の向き
   *   turn     … earlyDir → lateDir の回転角(画面上で左回り=正)
   *   Spin の符号:最後に切り返した向き(右へ切り返し=右カーブ=正 / 左へ切り返し=左カーブ=負)
   *   Spin の大きさ:切り返し角と軌跡の横の膨らみ(弦からの最大ずれ/弦長)から算出 → 弱い横操作=弱いカーブ
   * 例:↑→← は「右へ振り出し → 左へ切り返し」なので左カーブ(右に膨らんでから左へ巻き込む)
   *     ↑←→ はその鏡写しで右カーブ
   */
  analyzeCurve(seg, a, b, releaseVel, chord) {
    const C = Config.curve;
    if (chord < 30 || seg.length < 4) return null;
    // 弦から最も横に離れた点(=切り返し点)で軌跡を「振り出し」と「切り返し」に分ける
    const cx0 = b.x - a.x, cy0 = b.y - a.y;
    let peak = seg[Math.floor(seg.length / 2)], peakDev = -1;
    for (const p of seg) {
      const d = Math.abs(((p.x - a.x) * cy0 - (p.y - a.y) * cx0) / chord);
      if (d > peakDev) { peakDev = d; peak = p; }
    }
    let ex = peak.x - a.x, ey = peak.y - a.y;          // 振り出し:始点 → 切り返し点
    let lx = b.x - peak.x, ly = b.y - peak.y;          // 切り返し:切り返し点 → 離した点
    if (Math.hypot(ex, ey) < 8 || Math.hypot(lx, ly) < 8) { ex = cx0; ey = cy0; lx = releaseVel.x; ly = releaseVel.y; }
    // 画面座標(y下向き)を「上向き正」に直して角度計算
    const early = { x: ex, y: -ey };
    const late = { x: lx, y: -ly };
    const turn = Math.atan2(early.x * late.y - early.y * late.x, early.x * late.x + early.y * late.y); // 左回り=正
    // 横の膨らみ(符号なし)
    const cx = b.x - a.x, cy = b.y - a.y;
    let maxDev = 0;
    for (const p of seg) maxDev = Math.max(maxDev, Math.abs(((p.x - a.x) * cy - (p.y - a.y) * cx) / chord));
    const amount = (maxDev / chord) * C.spinGain + (Math.abs(turn) / Math.PI) * C.turnGain;
    let spin = THREE.MathUtils.clamp(amount, 0, C.maxSpin) * (turn > 0 ? -1 : 1); // 左へ切り返し → 左(負)
    if (Math.abs(spin) < C.deadZone || Math.abs(turn) < THREE.MathUtils.degToRad(C.minTurnDeg)) spin = 0;
    return { spin, turn, earlyAngle: Math.atan2(ex, -ey), bulge: maxDev / chord };
  }
}
