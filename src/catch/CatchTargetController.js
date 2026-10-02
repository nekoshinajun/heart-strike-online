import { Config, catchWin } from '../core/Config.js';
import { BallController } from '../controllers/BallController.js';

const ARROW = { L: '←', R: '→', U: '↑', D: '↓' };

/**
 * Catch Marker(◎)の表示。到達予定地点(3D)を毎フレーム画面へ投影して追従させる。
 *  - 中央リング:到達時のボールの見かけの大きさ
 *  - 外側リング:到達までの残り時間で縮小 → 中央リングと重なる瞬間が PERFECT
 *  - 判定ゾーン(薄い点線):GOOD 半径(練習用)
 */
export class CatchTargetController {
  constructor(player, cam, viewport) {
    this.player = player;
    this.cam = cam;
    this.viewport = viewport;
    this.el = document.getElementById('catchMarker');
    this.outer = document.getElementById('cmOuter');
    this.inner = document.getElementById('cmInner');
    this.zone = document.getElementById('cmZone');
    this.badge = document.getElementById('cmBadge');
    this.holdRing = document.getElementById('cmHold');
    this.world = null;
  }

  /** DEFENCE のハートの種類:HOLD は「HOLD」+ 押し続けるゲージ / FLICK は弾く方向の矢印 / NORMAL は何も出さない */
  setNote(note) {
    const t = note?.type ?? null;
    this.el.dataset.note = t ?? '';
    if (!this.badge) return;
    this.badge.hidden = !(t === 'HOLD' || t === 'FLICK');
    this.badge.textContent = t === 'HOLD' ? 'HOLD' : t === 'FLICK' ? ARROW[note.dir] ?? '↑' : '';
    this.badge.dataset.dir = t === 'FLICK' ? note.dir ?? 'U' : '';
    this.setHold(null);
  }

  /** HOLD の押し続けゲージ(0..1)。null で隠す */
  setHold(k) {
    if (!this.holdRing) return;
    this.holdRing.hidden = k == null;
    if (k != null) this.holdRing.style.setProperty('--k', `${Math.round(k * 360)}deg`);
    this.el.classList.toggle('holding', k != null);
  }

  show(world, color) {
    this.world = world.clone();
    this.el.hidden = false;
    this.el.style.setProperty('--pc', color);
    this.el.classList.remove('hit', 'miss');
  }

  hide() { this.el.hidden = true; this.world = null; }

  /** 現在のマーカー中心(px) */
  screen() { return this.world ? this.player.toScreen(this.world) : null; }

  /** @param progress 1(リング開始)→0(到達)。>1 の間は外側リング最大で待機 */
  update(progress) {
    if (!this.world) return;
    const s = this.screen();
    const short = Math.min(this.viewport.w, this.viewport.h);
    const r = BallController.screenRadius(this.cam.camera, this.world, this.viewport.h);
    const k = Math.max(-0.35, Math.min(1, progress));
    const outer = r * (1 + k * 2.6);
    this.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    this.inner.style.width = this.inner.style.height = `${r * 2}px`;
    this.outer.style.width = this.outer.style.height = `${Math.max(0, outer) * 2}px`;
    this.outer.style.opacity = progress > 1 ? 0.35 : 1;
    const zr = catchWin('goodRadius') * short;
    this.zone.style.width = this.zone.style.height = `${zr * 2}px`;
    if (this.holdRing) this.holdRing.style.width = this.holdRing.style.height = `${r * 2 + 18}px`;
    if (this.badge) this.badge.style.setProperty('--r', `${r}px`);
    this.el.classList.toggle('near', Math.abs(progress) < 0.08);
  }

  flash(ok) { this.el.classList.add(ok ? 'hit' : 'miss'); }
}
