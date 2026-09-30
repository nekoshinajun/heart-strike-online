/**
 * iPhone / スマホ対応(iOS Safari・アプリ内ブラウザ・claude.ai のアーティファクト表示)
 *  - viewport:拡大縮小を止め、Safe Area(ノッチ・ホームバー)を env() で取れるようにする
 *  - スクロール / ピンチズーム / ダブルタップズーム / 引っぱり更新 を止める(メニュー・調整パネルの縦スクロールだけ許可)
 *  - 効果音:iOS は「ユーザー操作の中」で AudioContext を resume しないと鳴らないので、タップ(touchend / click)で解除
 *  - アプリ切替から戻った時に AudioContext を再開
 */
export function setupMobile(game) {
  // viewport(アーティファクトの枠が別の viewport を持っていても viewport-fit=cover を足す)
  try {
    let m = document.querySelector('meta[name="viewport"]');
    if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
    const want = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    if (!/viewport-fit=cover/.test(m.content) || !/user-scalable=no/.test(m.content)) m.content = want;
  } catch { /* noop */ }

  const scrollable = (t) => t instanceof Element && t.closest('.mbody, .ibody, .ascroll, .sh-scroll, .gr, .cd-panel');
  // iOS はページ全体が弾む(ラバーバンド)ので、スクロール可能な領域以外の touchmove を止める
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) { e.preventDefault(); return; }       // ピンチ
    if (!scrollable(e.target)) e.preventDefault();
  }, { passive: false });
  // iOS Safari 固有のピンチ操作
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  // ダブルタップズーム(touch-action が効かない古い iOS 向け)
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastEnd < 300 && !scrollable(e.target) && !(e.target instanceof Element && e.target.closest('button'))) e.preventDefault();
    lastEnd = now;
  }, { passive: false });

  // 効果音の解除(ユーザー操作の中で)
  const unlock = () => game.audio.unlock();
  for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) game.audio.resume(); });

  // 端末判定(CSS 側の調整用)
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.documentElement.classList.toggle('touch', touch);
  if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) document.documentElement.classList.add('ios');
}
