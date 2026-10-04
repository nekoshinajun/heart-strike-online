/**
 * 攻略開始の演出:光の扉(お店の扉が開いて光があふれ、その光が晴れるとインゲーム)
 *   メニュー → インゲームへ切り替わった瞬間に、閉じた扉で画面を覆ってから開く(バトルの開始処理は待たせない)
 *   0      閉じた扉(すき間から光が漏れる)
 *   .20s   扉が左右に開いて光があふれる
 *   .45s   扉の中へ進む
 *   .70s   画面が光で満たされる
 *   1.15s  光が晴れてインゲームが見える
 * タップでスキップ(光だけ短く消す)。CSS の transform / opacity だけで動かす(スマホでも軽い)
 * 見た目は online.html の .lightdoor(1.3s のアニメーションを .16s 進めた所から再生)
 */
import { reducedMotion } from '../app/Platform.js';
import { shopOfStage } from '../data/ShopData.js';

const END_MS = 1300 - 160, SKIP_FADE_MS = 180;
let active = null;

/** host(#game)に扉を重ねて開く */
export function playDoorTransition(host, { accent = '#ff7fb0', glow = '#ffd6e7', audio = null } = {}) {
  if (active?.isConnected) active.remove();
  if (!host || reducedMotion()) return;
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
  const timers = [];
  const finish = () => { timers.forEach(clearTimeout); el.remove(); if (active === el) active = null; };
  const skip = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (el.classList.contains('skip')) return;
    timers.forEach(clearTimeout);
    el.classList.add('skip');
    timers.push(setTimeout(finish, SKIP_FADE_MS));
  };
  el.addEventListener('pointerdown', skip);
  el.addEventListener('click', (e) => e.stopPropagation());
  host.appendChild(el);
  active = el;
  // 扉のベル(カラン)
  timers.push(setTimeout(() => { audio?.chime?.(2); audio?.chime?.(3); }, 100));
  timers.push(setTimeout(finish, END_MS));
}

/** 攻略開始(メニュー → インゲーム):攻略相手のお店の色の扉を開く */
export function openBattleDoor(g, stage) {
  const theme = shopOfStage(stage?.id)?.theme;
  playDoorTransition(g?.container, { accent: theme?.accent, glow: theme?.glow, audio: g?.audio });
}
