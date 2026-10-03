import { Config } from '../core/Config.js';
import { GestureAnalyzer } from '../throw/GestureAnalyzer.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** 表示用:POWER(minThrowPower〜1)→ 強さ 0〜1(演出の大きさだけに使う。HEART は変わらない)*/
export function powerStrength(power) {
  const m = Config.power.minThrowPower;
  return clamp01((power - m) / Math.max(1e-6, 1 - m));
}

export const ThrowPhase = Object.freeze({ IDLE: 'IDLE', GRABBED: 'GRABBED', BALL_FLYING: 'BALL_FLYING' });

/**
 * 投球の入力(Pokémon GO 型)。操作はこれだけ:
 *   ハートを触る → 指にハートがついてくる(指の位置 = ハートの位置)→ フリックして離した瞬間に投げる
 *
 * 責務の流れ:
 *   指の軌跡(InputManager の samples)
 *     → GestureAnalyzer:リリース方向(離す直前)/ 速さ / 回転(軌跡全体。事前に回すのも弧を描いて投げるのも同じ量)
 *     → CurveThrowCalculator.compute:2D → 3D(向き・強さ・カーブ → 初速と横の力)
 *     → BallPhysics(飛行)
 *   発射位置 = 離した瞬間にハートが画面上にあった場所(構えの位置ではない)
 */
export class ThrowController {
  constructor(g) {
    this.g = g;
    this.phase = ThrowPhase.IDLE;
    this.gesture = new GestureAnalyzer(Config.throwInput);
    this.lastFed = null;
    this.finger = null;
    this.spinTurns = 0;   // 今の掴みで鳴らした回転 SE の数(1回転ごとに1つ)
  }

  get grabbing() { return this.phase === ThrowPhase.GRABBED; }
  /** 今のカーブ入力(-1〜1。+ = 右)*/
  get curveInput() { return this.grabbing ? this.gesture.spin : 0; }
  canGrab() { const m = this.g.ball.mode; return this.phase === ThrowPhase.IDLE && (m === 'held' || m === 'catching'); }

  /** 回転の表示:ハートが回転量だけ回り、まわりの弧で RIGHT / LEFT CURVE を示す(ハートと一緒に動く)*/
  showCurve() {
    const g = this.g, f = this.finger, v = this.gesture.spin;
    g.ball.setCurveRoll?.(this.grabbing ? this.gesture.turn * (Config.throwInput.heartRollMul ?? 1) : 0);
    g.ui.setCurveInput?.(this.grabbing && v ? v : null, f ? { x: f.x, y: f.y, r: g.player.heldBallScreen().r } : null);
    this.spinTick();
  }

  /** 1回転するごとに小さな SE(回すほど音が上がる)。逆回しで戻った分は鳴らさず、もう一度回し直したらまた鳴る */
  spinTick() {
    if (!this.grabbing) { this.spinTurns = 0; return; }
    const n = Math.floor(Math.abs(this.gesture.turn) / (Math.PI * 2));
    if (n > this.spinTurns) this.g.audio?.spinTick?.(n);
    this.spinTurns = n;
  }

  /** Touch Start:ハートの上なら掴む(ハートは指の位置へ)*/
  tryGrab(start) {
    const g = this.g;
    if (!this.canGrab() || !g.player.isOnBall(start.x, start.y, g.ball.pos)) return false;
    this.phase = ThrowPhase.GRABBED;
    this.gesture.reset(start);
    this.lastFed = start;
    this.finger = start;
    g.ball.grab(g.player.fingerToWorld(start.x, start.y));
    g.ui.setThrowType?.(null);
    this.showCurve();
    return true;
  }

  /** 新しい指の点だけを解析へ渡す(InputManager の samples は押してからの全点)*/
  feed(samples) {
    const i = samples.lastIndexOf(this.lastFed);
    for (let k = i + 1; k < samples.length; k++) this.gesture.add(samples[k]);
    if (samples.length) this.lastFed = samples[samples.length - 1];
  }

  /** Touch Move:ハートは指にそのままついてくる */
  move(d) {
    if (!this.grabbing) return;
    this.feed(d.samples);
    this.finger = d.current;
    this.g.ball.setGrabTarget(this.g.player.fingerToWorld(d.current.x, d.current.y));
    this.showCurve();
  }

  updatePreview() { this.g.preview.hideLive(); }
  tick() { /* 回転は時間で消えない(Pokémon GO と同じく、回している間はそのまま)*/ }

  /** Touch End:離した瞬間に投げる。投げにならない(止めて離した・下や横へ払った)時は構えへ戻る → null */
  release(flick) {
    const g = this.g;
    if (!this.grabbing) return undefined;
    this.feed(flick.samples ?? []);
    const end = flick.end;
    const gest = this.gesture.release(end, g.viewport.h);
    g.ui.setCurveInput?.(null); g.ball.setCurveRoll?.(0);
    const start = g.player.fingerToWorld(end.x, end.y);   // 離した瞬間のハートの位置から発射
    const th = g.player.computeThrow(gest, start);
    if (!th) {
      g.ball.catchTo(g.player.holdAnchor, 0.16);
      this.phase = ThrowPhase.IDLE;
      return null;
    }
    th.gesture = { dir: gest.dir, speed: gest.speed, turnDeg: gest.turnDeg, spin: gest.spin, end: { x: end.x, y: end.y } };
    this.phase = ThrowPhase.BALL_FLYING;
    return th;
  }

  cancel() {
    this.phase = ThrowPhase.IDLE;
    this.lastFed = null; this.finger = null;
    this.gesture.reset(null);
    this.g.preview.hideLive();
    this.g.ui.setThrowType?.(null);
    this.g.ui.setCurveInput?.(null); this.g.ball.setCurveRoll?.(0);
  }
}
