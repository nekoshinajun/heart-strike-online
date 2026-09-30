import { Config } from '../core/Config.js';
import { maxChargeDistancePx, powerFromCharge, powerStrength, ThrowPhase } from '../controllers/ThrowController.js';

/**
 * GachaThrowInput:本編の投球操作(ThrowController)と同じフェーズ・同じ POWER 計算を使い、
 * 出力だけを「演出パラメータ」に差し替えるラッパー(本編の ThrowController は改造しない)。
 *   IDLE → BALL_TOUCH → POWER_CHARGE(下へ引く)→ THROW_GESTURE(上へ)→ RELEASE
 * ガチャに失敗は無い:上方向の成分があれば必ず投げる。引いて離すだけ / 下・横へ弾くだけ なら投げない(Heart が元へ戻る)。
 * 返す値 { power, strength, aimX, aimY, spin } は見た目(Trail の長さ・最初の傾き・Gate 1 までの曲がり)にだけ使う。抽選には一切使わない。
 */
export class GachaThrowInput {
  constructor(el, { heartScreen, heartRadius, onGrab, onMove, onRelease, onCancel }) {
    this.el = el;
    this.cb = { heartScreen, heartRadius, onGrab, onMove, onRelease, onCancel };
    this.phase = ThrowPhase.IDLE;
    this.enabled = false;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', () => this.cancel());
  }
  local(e) { const r = this.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), H: r.height, W: r.width }; }

  down(e) {
    if (!this.enabled || this.phase !== ThrowPhase.IDLE) return;
    const p = this.local(e), h = this.cb.heartScreen();
    if (Math.hypot(p.x - h.x, p.y - h.y) > Math.max(46, this.cb.heartRadius() * 1.9)) return;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    this.phase = ThrowPhase.BALL_TOUCH;
    this.start = p; this.low = p; this.samples = [p]; this.power = Config.power.minThrowPower; this.charged = false;
    this.cb.onGrab?.();
  }
  move(e) {
    if (this.phase === ThrowPhase.IDLE || this.phase === ThrowPhase.RELEASE) return;
    const p = this.local(e);
    this.samples.push(p); if (this.samples.length > 60) this.samples.shift();
    const P = Config.power;
    if (this.phase === ThrowPhase.BALL_TOUCH && p.y - this.start.y > P.chargeThreshold) { this.phase = ThrowPhase.POWER_CHARGE; this.charged = true; }
    if (this.phase === ThrowPhase.POWER_CHARGE) {
      if (p.y > this.low.y) this.low = p;
      this.power = powerFromCharge((this.low.y - this.start.y) / maxChargeDistancePx(p.H));
      if (this.low.y - p.y > P.lockThreshold) { this.phase = ThrowPhase.THROW_GESTURE; this.gestureFrom = this.low; }
    } else if (this.phase === ThrowPhase.BALL_TOUCH && this.start.y - p.y > P.lockThreshold) {
      this.phase = ThrowPhase.THROW_GESTURE; this.gestureFrom = this.start;     // 引かずに投げる(POWER 30%)
    }
    this.cb.onMove?.({ x: p.x, y: p.y, pull: Math.max(0, (this.phase === ThrowPhase.POWER_CHARGE ? p.y : this.low.y) - this.start.y), power: this.power, phase: this.phase });
  }
  up(e) {
    if (this.phase === ThrowPhase.IDLE) return;
    const p = this.local(e);
    const from = this.gestureFrom ?? this.low ?? this.start;
    const dx = p.x - from.x, dy = p.y - from.y;
    if (this.phase === ThrowPhase.THROW_GESTURE && dy < -18) {
      // SPIN:弦からの最大の横ずれ(最後に切り返した向き)
      const seg = this.samples.filter((s) => s.t >= from.t);
      const L = Math.hypot(dx, dy) || 1;
      let dev = 0;
      for (const s of seg) { const c = ((s.x - from.x) * dy - (s.y - from.y) * dx) / L; if (Math.abs(c) > Math.abs(dev)) dev = c; }
      const spin = Math.max(-1, Math.min(1, (-dev / L) * 3));
      const out = { power: this.power, strength: powerStrength(this.power), aimX: Math.max(-1, Math.min(1, dx / (p.W * 0.4))), aimY: Math.max(0, Math.min(1, -dy / (p.H * 0.35))), spin: Math.abs(spin) < 0.12 ? 0 : spin };
      this.phase = ThrowPhase.RELEASE;
      this.cb.onRelease?.(out);
      return;
    }
    this.cancel();
  }
  cancel() { if (this.phase === ThrowPhase.IDLE) return; this.phase = ThrowPhase.IDLE; this.gestureFrom = null; this.cb.onCancel?.(); }
  reset() { this.phase = ThrowPhase.IDLE; this.gestureFrom = null; }
}
