import { Config } from '../core/Config.js';
import { InputManager } from '../managers/InputManager.js';
import { simulate } from '../physics/BallPhysics.js';
import { PreSpinDetector } from '../throw/PreSpinDetector.js';
import { effectLabel } from '../throw/BallEffects.js';

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
 * 投球操作:ボールに触る →(球質を仕込む)→ 下へ引いて POWER → 上へジェスチャー(AIM / SPIN)→ 離して投球。
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
    this.detector = new PreSpinDetector(g.viewport.h);
    this.detector.reset(start);
    this.lastFed = start;
    g.ball.grab(g.player.fingerToWorld(start.x, start.y));
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
    const s = this.origin;
    if (this.phase === ThrowPhase.BALL_TOUCH) {
      if (cur.y - s.y >= P.chargeThreshold) { this.phase = ThrowPhase.POWER_CHARGE; this.charged = true; }
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
    this.g.ball.setGrabTarget(this.g.player.fingerToWorld(cur.x, cur.y));
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
    const th = wasGesture ? g.player.computeThrow(this.gestureFlick(flick.end), this.power, start, this.effectList, g.throwRoute) : null;
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
  }
}
