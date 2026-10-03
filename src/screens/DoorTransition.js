/**
 * 入店の演出:光の扉(お店の扉が開いて光があふれ、その光の中でお店の中へ切り替わる)
 *   0      扉が現れる(すき間から光が漏れる)
 *   .35s   扉が左右に開いて光があふれる
 *   .60s   扉の中へ進む
 *   .86s   画面が光で満たされる → covered() で画面を切り替える
 *   1.3s   光が晴れてお店の中が見える
 * タップでスキップ(すぐ切り替えて光だけ短く消す)。CSS の transform / opacity だけで動かす(スマホでも軽い)
 * 見た目は online.html の .lightdoor
 */
import { reducedMotion } from '../app/Platform.js';

const COVER_MS = 860, END_MS = 1300, SKIP_FADE_MS = 180;
let active = null;

/** host に扉を重ねる。covered はちょうど1回呼ぶ(画面が光で隠れている間 / スキップ時はすぐ)*/
export function playDoorTransition(host, { accent = '#ff7fb0', glow = '#ffd6e7', audio = null, covered } = {}) {
  if (active?.isConnected) return;   // 連打で二重に開かない
  if (!host || reducedMotion()) { covered?.(); return; }
  const el = document.createElement('div');
  el.className = 'lightdoor';
  el.style.setProperty('--ac', accent);
  el.style.setProperty('--gl', glow);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<i class="ld-veil"></i><div class="ld-stage">
      <i class="ld-light"></i><i class="ld-rays"></i>
      <div class="ld-frame"><i class="ld-leaf l"><i class="ld-pane"></i><i class="ld-knob"></i></i><i class="ld-leaf r"><i class="ld-pane"></i><i class="ld-knob"></i></i><i class="ld-sign">OPEN</i></div>
    </div>
    <i class="ld-flash"></i>
    <span class="ld-sparks">${Array.from({ length: 8 }, (_, k) => `<i style="--k:${k}">♡</i>`).join('')}</span>`;
  let done = false;
  const timers = [];
  const cover = () => { if (done) return; done = true; covered?.(); };
  const finish = () => { timers.forEach(clearTimeout); el.remove(); if (active === el) active = null; };
  const skip = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (el.classList.contains('skip')) return;
    cover();
    timers.forEach(clearTimeout);
    el.classList.add('skip');
    timers.push(setTimeout(finish, SKIP_FADE_MS));
  };
  el.addEventListener('pointerdown', skip);
  el.addEventListener('click', (e) => e.stopPropagation());
  host.appendChild(el);
  active = el;
  // 扉のベル(カラン)
  timers.push(setTimeout(() => { audio?.chime?.(2); audio?.chime?.(3); }, 260));
  timers.push(setTimeout(cover, COVER_MS));
  timers.push(setTimeout(finish, END_MS));
}
