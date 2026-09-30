import { Config, catchWin } from '../core/Config.js';
import { BallController } from '../controllers/BallController.js';

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
    this.world = null;
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
    this.el.classList.toggle('near', Math.abs(progress) < 0.08);
  }

  flash(ok) { this.el.classList.add(ok ? 'hit' : 'miss'); }
}
