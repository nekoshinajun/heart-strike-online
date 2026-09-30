import { devInput } from '../app/Platform.js';
import { Config } from '../core/Config.js';

/**
 * タッチ/マウス入力をゲーム用イベントに変換する。解釈(掴めたか・投げたか)は各ステート側が行う。
 *  - 'tap'       : 押した瞬間(防御タイミング判定用。遅延を減らすため pointerdown で発火)
 *  - 'dragstart' : 押した瞬間 { start }
 *  - 'drag'      : 押下中の移動 { start, current, samples }
 *  - 'release'   : 離した瞬間 FlickInfo(下記)
 * キーボード: Space / Enter = tap(PC確認用。位置は最後のマウス位置)
 *
 * FlickInfo = {
 *   start, end          : {x,y,t} 開始/終了位置(px, ms)
 *   dx, dy, distance    : 総移動量(px)
 *   direction           : {x,y} 正規化方向(総移動)
 *   velocity            : {x,y} 離す直前 sampleWindowMs の速度(px/ms)
 *   speed               : |velocity|
 *   duration            : 押してから離すまで(ms)
 *   samples             : [{x,y,t}] 軌跡(カーブ計算用)
 * }
 */
export class InputManager {
  constructor(el, bus) {
    this.el = el;
    this.bus = bus;
    this.active = null;

    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('blur', () => (this.active = null));
    window.addEventListener('keydown', (e) => {
      if (!devInput()) return;   // DevInput:Space / Enter = タップ(開発用)
      if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
        e.preventDefault();
        // キーボードのタップは最後のマウス位置で判定(PC確認用:マーカーにカーソルを合わせて Space)
        const h = this.hover;
        this.bus.emit('tap', { time: performance.now(), key: true, x: h?.x, y: h?.y });
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  }

  down(e) {
    // マルチタッチは最初の指のみ。ただし「離した通知を取りこぼして押しっぱなし扱い」が残っていたら破棄する
    // (PCで枠外に出て離した等。これが残るとクリックが一切効かなくなる)
    if (this.active && e.pointerType === 'touch' && e.pointerId !== this.active.id && performance.now() - this.active.start.t < 3000) return;
    this.active = null;
    // マウス(DevInput)では preventDefault しない
    if (e.pointerType === 'touch') e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* 非対応環境 */ }
    const p = this.local(e);
    this.active = { id: e.pointerId, start: p, samples: [p] };
    // キャッチ判定は ms ベース:タッチが実際に起きた時刻(event.timeStamp)を使う(フレームレート・処理落ちに左右されない)
    const ts = e.timeStamp > 0 && e.timeStamp <= performance.now() + 1 && performance.now() - e.timeStamp < 250 ? e.timeStamp : p.t;
    this.bus.emit('tap', { time: ts, x: p.x, y: p.y });
    this.bus.emit('dragstart', { start: p });
  }

  move(e) {
    this.hover = this.local(e);
    if (!this.active || e.pointerId !== this.active.id) return;
    // 高リフレッシュ端末の取りこぼし防止に coalesced events も拾う
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ce of (list.length ? list : [e])) this.active.samples.push(this.local(ce));
    const s = this.active.samples;
    if (s.length > 160) s.splice(1, s.length - 160);
    this.bus.emit('drag', { start: this.active.start, current: s[s.length - 1], samples: s });
  }

  up(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    const p = this.local(e);
    const { start, samples } = this.active;
    samples.push(p);
    this.active = null;
    this.bus.emit('release', InputManager.flickInfo(start, p, samples));
  }

  /** サンプル列から FlickInfo を作る(押下中のプレビューにも使用) */
  static flickInfo(start, end, samples) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    const velocity = InputManager.velocity(samples, end);
    return {
      start, end, dx, dy, distance,
      direction: distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 },
      velocity,
      speed: Math.hypot(velocity.x, velocity.y),
      duration: end.t - start.t,
      samples,
    };
  }

  /**
   * 離す直前 sampleWindowMs の移動から速度(px/ms)。
   * 指を止めてから離すと速度はほぼ0になる(=投げていない)。
   */
  static velocity(samples, end) {
    const win = Config.throw.sampleWindowMs;
    let ref = end;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (end.t - samples[i].t > win) break;
      ref = samples[i];
    }
    if (ref === end && samples.length > 1) ref = samples[samples.length - 2];
    const dt = Math.max(8, end.t - ref.t);
    return { x: (end.x - ref.x) / dt, y: (end.y - ref.y) / dt };
  }
}
