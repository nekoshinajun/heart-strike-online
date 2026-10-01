import { Config } from '../core/Config.js';
import { InputManager } from '../managers/InputManager.js';
import { simulate } from '../physics/BallPhysics.js';
import { PreSpinDetector } from '../throw/PreSpinDetector.js';
import { effectLabel } from '../throw/BallEffects.js';
import { RotationCurve } from '../throw/RotationCurve.js';

const nowMs = () => performance.now();

/** MaxChargeDistance(px)。画面高さ比で指定(ratio が null なら固定 px) */
export function maxChargeDistancePx(viewH) {
  const P = Config.power;
  return P.maxChargeDistanceRatio != null ? Math.max(40, P.maxChargeDistanceRatio * viewH) : P.maxChargeDistance;
}
/** finalPower = Lerp(MinThrowPower, 1.0, chargeRatio) */
export function powerFromCharge(chargeRatio) {
  const m = Config.power.minThrowPower;
  return m + (1 - m) * Math.min(1, Math.max(0, chargeRatio));
}
/** POWER → 0..1 の「強さ」(MinThrowPower = 0 / 100% = 1)。見た目・HEART の補間に使う */
export function powerStrength(power) {
  const m = Config.power.minThrowPower;
  return Math.min(1, Math.max(0, (power - m) / Math.max(1e-6, 1 - m)));
}

/** 投球入力の内部フェーズ */
export const ThrowPhase = Object.freeze({
  IDLE: 'IDLE',
  BALL_TOUCH: 'BALL_TOUCH',       // ボールに触れた
  POWER_CHARGE: 'POWER_CHARGE',   // 下へ引いて Power を溜めている
  THROW_GESTURE: 'THROW_GESTURE', // 上方向へ動かし始めた(Power 固定・軌跡を記録)
  RELEASE: 'RELEASE',             // 離した瞬間に POWER / AIM / SPIN を確定
  BALL_FLYING: 'BALL_FLYING',
});

/**
 * 投球操作(Config.throwInput.curveMode = 'rotate'):
 *   ハートに触る → ハートの周りを回す(カーブ:時計回り = 右 / 反時計回り = 左。ハートは動かず、指に合わせて回る)
 *   → 下へ引く(球速)→ 上へ弾いて離す(狙い)。離した時点のカーブ値で投げる。回転を止めて2秒でストレートに戻る
 *   ハート中心の周り(ringRadius の内側)= カーブの入力。外へ出たら引く / 弾く(回している間に引き・弾きにならない)
 * 'flick' の時は従来どおり:ボールに触る →(球質を仕込む)→ 下へ引いて POWER → 上へジェスチャー(AIM / SPIN)→ 離して投球。
 * 球質(PRE-SPIN / DRIVE):掴んでいる間に円を描く / 上下に素早く往復すると成立(PreSpinDetector)。
 *   成立したら、そこを起点に POWER の引きからやり直せる(同じタッチのまま引いて弾ける)。指を離して掴み直しても保持
 *   保持はこの手番の投球まで:投げたら必ずリセット(MISS でも)。次の手番(PLAYER_ATTACK の開始)でもリセット
 * パチンコ方式ではない:下へ引いて離すだけでは投げない(構えに戻る)。
 * 物理計算は CurveThrowCalculator / BallPhysics に任せ、ここは「操作」の責務だけを持つ。
 */
export class ThrowController {
  constructor(g) {
    this.g = g;
    this.phase = ThrowPhase.IDLE;
    this.power = 0;
    this.drag = null;
    this.effects = {};        // 仕込んだ球質 { preSpin?: { type, dir, strength }, drive?: { type, strength } }
    this.detector = null;
    this.curve = new RotationCurve(Config.throwInput.rotate);   // 円運動のカーブ入力
  }
  get rotateMode() { return Config.throwInput?.curveMode === 'rotate'; }
  /** 今のカーブ入力(-1〜1。+ = 右)*/
  get curveInput() { return this.rotateMode && this.grabbing ? this.curve.value : 0; }
  /** ハート中心(画面)と画面半径 */
  heartCenter() { const s = this.g.player.heldBallScreen(); return { x: s.x, y: s.y, r: s.r }; }
  /** カーブ入力の表示(ハートの回転 + まわりの弧と表示)を今の値に */
  showCurve() {
    const g = this.g, c = this.heartCenter(), v = this.curve.value;
    g.ball.setCurveRoll?.(this.grabbing ? this.curve.angle * (Config.throwInput.rotate.heartRollMul ?? 1) : 0);
    g.ui.setCurveInput?.(this.grabbing ? v : null, c, this.curve.decayed);
  }
  /** 毎フレーム(PlayerAttackState.update):回転を止めて2秒たったらストレートへ */
  tick() {
    if (!this.rotateMode || !this.grabbing) return;
    if (this.curve.update(nowMs())) { this.showCurve(); this.g.audio.whiff?.(); }
  }

  /** 仕込んだ球質(投球計算に渡す配列)*/
  get effectList() { return Object.values(this.effects).filter(Boolean); }
  resetEffects() { this.effects = {}; this.g.ui.setBallEffects?.(null); }
  /** 球質が成立:同じ向きの回転を重ねると少し強くなる。逆向きは置き換え。表示を更新 */
  addEffect(r) {
    const prev = this.effects[r.type];
    const e = r.type === 'preSpin' && prev && prev.dir === r.dir ? { ...r, strength: Math.min(1, prev.strength + r.strength * 0.5) } : { ...r };
    this.effects[r.type] = e;
    this.g.ui.setBallEffects?.(this.effects);
    this.g.ui.flashBallEffect?.(effectLabel(e), e);
    this.g.audio.rallyUp?.();
    return e;
  }

  get grabbing() { return this.phase === ThrowPhase.BALL_TOUCH || this.phase === ThrowPhase.POWER_CHARGE || this.phase === ThrowPhase.THROW_GESTURE; }
  canGrab() { const m = this.g.ball.mode; return this.phase === ThrowPhase.IDLE && (m === 'held' || m === 'catching'); }

  /** Touch Start:ボールの上なら掴む */
  tryGrab(start) {
    const g = this.g;
    if (!this.canGrab()) return false;
    if (!g.player.isOnBall(start.x, start.y, g.ball.pos)) return false;
    this.phase = ThrowPhase.BALL_TOUCH;
    this.chargeRatio = 0;
    this.power = powerFromCharge(0);   // 引かずに投げた時 = MinThrowPower
    this.charged = false;
    this.lowest = start;          // POWER_CHARGE 中の最下点
    this.gesture = null;          // ジェスチャー区間の軌跡
    this.drag = { start, current: start, samples: [start] };
    this.origin = start;          // POWER の引きの起点(球質が成立したらそこへ移す)
    // 投球前の球質(PRE-SPIN / DRIVE)は今は操作に出さない(Config で無効)。有効にした時だけ判定する
    this.detector = Config.preSpin.enabled || Config.drive.enabled ? new PreSpinDetector(g.viewport.h) : null;
    this.detector?.reset(start);
    this.lastFed = start;
    this.lastCurveFed = start;
    if (this.rotateMode) { this.curve.reset(nowMs()); g.ball.grab(g.player.holdAnchor()); this.showCurve(); }   // ハートは所定位置に固定(指では動かない)
    else g.ball.grab(g.player.fingerToWorld(start.x, start.y));
    g.ui.setThrowType?.(g.turn.current.chara?.type);
    g.ui.setPowerGauge(this.power, false, { ...g.player.toScreen(g.ball.pos), r: g.player.heldBallScreen().r });
    return true;
  }

  /** Touch Move */
  move(d) {
    if (!this.grabbing) return;
    const P = Config.power;
    this.drag = d;
    const cur = d.current;
    // 球質の判定(掴んでいる間の新しいサンプルだけを渡す)。成立したら POWER の引きをその場からやり直す
    if (this.detector) {
      const i = d.samples.lastIndexOf(this.lastFed);
      for (const p of d.samples.slice(i + 1)) {
        const r = this.detector.feed(p);
        if (r) { this.addEffect(r); this.rearm(p); }
      }
      this.lastFed = d.samples[d.samples.length - 1];
    }
    // 円運動のカーブ入力:ハートの周り(リングの内側)を回している間だけ。指の向き(atan2)の差を累積
    if (this.rotateMode && this.phase === ThrowPhase.BALL_TOUCH) {
      const c = this.heartCenter(), i = d.samples.lastIndexOf(this.lastCurveFed);
      let changed = false;
      for (const p of d.samples.slice(i + 1)) changed = this.curve.feed(p, c, c.r, nowMs()) || changed;
      this.lastCurveFed = d.samples[d.samples.length - 1];
      if (changed) this.showCurve();
    }
    const s = this.origin;
    if (this.phase === ThrowPhase.BALL_TOUCH) {
      if (this.rotateMode) {
        // リングの外へ:下なら引き始め(そこを起点に球速)/ 上なら弾き(ハート中心から)
        const c = this.heartCenter(), ring = (Config.throwInput.rotate.ringRadius ?? 1.9) * c.r, dx = cur.x - c.x, dy = cur.y - c.y;
        const leave = () => { if (this.curve.discardStraightTail(c.r)) this.showCurve(); };   // まっすぐ引いた / 弾いた分は回転に数えない
        if (dy > ring && dy > Math.abs(dx)) { leave(); this.phase = ThrowPhase.POWER_CHARGE; this.charged = true; this.origin = cur; this.lowest = cur; }
        else if (-dy > ring && -dy > Math.abs(dx)) { leave(); this.beginGesture(d.samples.length - 1, { x: c.x, y: c.y, t: cur.t }); }
      } else if (cur.y - s.y >= P.chargeThreshold) { this.phase = ThrowPhase.POWER_CHARGE; this.charged = true; }
      else if (s.y - cur.y >= P.lockThreshold) this.beginGesture(d.samples.length - 1, s);
    }
    if (this.phase === ThrowPhase.POWER_CHARGE) {
      if (cur.y >= this.lowest.y) this.lowest = cur;
      // chargeRatio = Clamp01(下へ引いた距離 / MaxChargeDistance) → finalPower = Lerp(MinThrowPower, 1, chargeRatio)
      this.chargeRatio = Math.min(1, Math.max(0, (this.lowest.y - s.y) / maxChargeDistancePx(this.g.viewport.h)));
      this.power = powerFromCharge(this.chargeRatio);
      // 最下点から上へ動き始めたら Power を固定してジェスチャーへ
      if (this.lowest.y - cur.y >= P.lockThreshold) {
        const idx = d.samples.lastIndexOf(this.lowest);
        this.beginGesture(idx >= 0 ? idx : d.samples.length - 1, this.lowest);
      }
    }
    // ジェスチャーの軌跡を別配列に記録(入力側の配列は古いサンプルが間引かれるため)
    if (this.phase === ThrowPhase.THROW_GESTURE) {
      const i = d.samples.lastIndexOf(this.lastSample);
      for (const p of d.samples.slice(i + 1)) this.gesture.push(p);
      this.lastSample = d.samples[d.samples.length - 1];
    }
    if (!this.rotateMode) this.g.ball.setGrabTarget(this.g.player.fingerToWorld(cur.x, cur.y));   // 回す方式ではハートは動かない
    // POWER は下へ引いている時だけ表示(ボールの左上)
    const bs = { ...this.g.player.toScreen(this.g.ball.pos), r: this.g.player.heldBallScreen().r };
    this.g.ui.setPowerGauge(this.power, this.phase === ThrowPhase.THROW_GESTURE, bs);
  }

  /** 球質の成立後:その位置を起点に、POWER なし・ジェスチャーなしの状態へ戻す(この後 引いて弾けば投げられる)*/
  rearm(p) {
    this.phase = ThrowPhase.BALL_TOUCH;
    this.origin = p;
    this.lowest = p;
    this.chargeRatio = 0;
    this.power = powerFromCharge(0);
    this.charged = false;
    this.gesture = null;
  }

  beginGesture(index, from) {
    this.phase = ThrowPhase.THROW_GESTURE;
    // 起点(引いた最下点)以降のサンプルから記録を開始
    this.gesture = this.drag.samples.slice(Math.max(0, index));
    if (this.gesture[0] !== from) this.gesture.unshift(from);
    this.lastSample = this.drag.samples[this.drag.samples.length - 1];
  }

  /** ジェスチャー区間の FlickInfo(POWER_CHARGE の引き動作は含めない) */
  gestureFlick(end) {
    const smp = this.gesture.slice();
    const last = smp[smp.length - 1];
    if (!last || last.x !== end.x || last.y !== end.y || last.t !== end.t) smp.push(end);
    return InputManager.flickInfo(smp[0], end, smp);
  }

  /**
   * 投球前の予測ライン。通常はハート玉の直後の短いラインだけ(Config.space.shortPreview)。
   * 最終的なカーブ・到達点は見せない(3D 空間を読むゲームにするため)。デバッグ時は全軌道
   */
  updatePreview() {
    // v25: 投球前の軌道プレビューは表示しない。物理シミュレーション自体は投球後に従来通り使用する。
    this.g.preview.hideLive();
  }

  /**
   * Touch End:POWER / AIM / SPIN を確定して投球パラメータを返す。
   * null = 投げていない(下へ引いて離しただけ等)→ 構えに戻す / undefined = 掴んでいなかった
   */
  release(flick) {
    const g = this.g;
    if (!this.grabbing) return undefined;
    const wasGesture = this.phase === ThrowPhase.THROW_GESTURE;
    this.phase = ThrowPhase.RELEASE;
    g.preview.hideLive();
    g.ui.setPowerGauge(null);
    g.ui.setThrowType?.(null);
    const start = g.player.holdAnchor();
    this.detector = null;
    const curveSpin = this.rotateMode ? this.curve.value * (Config.throwInput.rotate.maxSpin ?? 1) : null;   // 離した時点のカーブ値
    g.ui.setCurveInput?.(null);
    g.ball.setCurveRoll?.(0);
    const th = wasGesture ? g.player.computeThrow(this.gestureFlick(flick.end), this.power, start, this.effectList, g.throwRoute, curveSpin) : null;
    if (th) th.start = start;
    if (!th) { g.ball.catchTo(g.player.holdAnchor, 0.2); this.phase = ThrowPhase.IDLE; return null; }   // 投げていない:仕込んだ球質はこの手番の間 保持
    this.phase = ThrowPhase.BALL_FLYING;
    this.resetEffects();   // 投げた:球質は使い切り(当たっても MISS でも次へ持ち越さない)
    return th;
  }

  /** 次の投球に備える */
  cancel() {
    this.phase = ThrowPhase.IDLE;
    this.drag = null;
    this.detector = null;
    this.resetEffects();   // 手番の開始・終了:前の投球 / 前のキャラの球質を持ち越さない
    this.g.preview.hideLive();
    this.g.ui.setPowerGauge(null);
    this.g.ui.setThrowType?.(null);
    this.curve.reset(nowMs());
    this.g.ui.setCurveInput?.(null);
    this.g.ball.setCurveRoll?.(0);
  }
}
