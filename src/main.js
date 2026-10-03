// エントリーポイント(ビルド時にこのファイルから1本のスクリプトへバンドルする)
import { GameManager } from './GameManager.js';
import { simulate } from './physics/BallPhysics.js';
import { InputManager } from './managers/InputManager.js';
window.__simulate = simulate; // デバッグ/調整用
window.__InputManager = InputManager;
import { Config as __C } from './core/Config.js';
window.__routes = __C.energy.routes;
window.__cfgSpace = () => __C.space;
window.__cfg = __C;
import { CHARA_IMAGES as __CI } from './assets/charaImages.js';
window.__charaImages = __CI;

import { Config as __Cfg } from './core/Config.js';
import { App } from './app/App.js';
import { Log } from './app/Platform.js';
import { OnlineSession } from './online/OnlineSession.js';
import { characterById } from './data/GameData.js';
import { artUrl } from './data/CharacterArt.js';
import { BOSS_IMAGES } from './assets/bossImages.js';

const BUILD = __Cfg.app.version;
function setStatus(text, bad = false) {
  const el = document.getElementById('bootStatus');
  if (el) { el.textContent = text; el.dataset.bad = bad ? '1' : '0'; }
}
/** 起動できない時だけ画面に出す(通常のエラーはコンソールのみ。製品画面に Debug ログは出さない)*/
function showFatal(msg) {
  setStatus('エラー: ' + msg, true);
  let el = document.getElementById('bootError');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'bootError';
    el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#300;color:#fff;font:12px/1.4 monospace;padding:8px;white-space:pre-wrap;border-radius:6px;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = String(msg);
}
window.addEventListener('error', (e) => { Log.warn('INIT', e.message); if (!window.__app || __Cfg.debug.showDebugUI) showFatal(e.message); });
window.addEventListener('unhandledrejection', (e) => Log.warn('INIT', e.reason?.message || e.reason));

function boot() {
  if (window.__app) return; // 二重起動防止
  const container = document.getElementById('game');
  // Critical:Save / CharacterData / Router / HOME
  try {
    window.__app = new App(container);
  } catch (e) { showFatal('起動エラー: ' + (e?.message || e)); return; }
  // 3D ゲーム本体(WebGL)。失敗しても HOME / ガチャは使える
  try {
    window.__game = new GameManager(container, document.getElementById('view'), window.__app);
    window.__app.attachGame(window.__game);
    window.__online = new OnlineSession(window.__game);
  } catch (e) {
    const m = String(e?.message || e);
    window.__app.gameError = /WebGL/i.test(m) ? 'WebGL を使えません' : m;
    Log.warn('INIT', 'game init failed (isolated):', m);
  }
  showTitle(container, () => window.__app.start());
  setStatus(`${__Cfg.app.title} ${BUILD}`);
  Log.info('INIT', `boot ${BUILD}`);
}

function showTitle(container, onStart) {
  const ally = characterById('minamo') ?? characterById('hinoka');
  const allyArt = artUrl(ally, 'cutout') || '';
  const targetArt = BOSS_IMAGES.milk || BOSS_IMAGES.demon || '';   // 猫メイドカフェ Lumière のみるく(明るい背景でカフェの世界観に合う)
  const el = document.createElement('section');
  el.id = 'titleScreen';
  el.className = 'hs-title';
  el.setAttribute('aria-label', 'HEART STRIKE タイトル');
  el.innerHTML = `
    <div class="ht-sky"></div><div class="ht-city" aria-hidden="true"></div>
    <div class="ht-glow" aria-hidden="true"></div>
    <img class="ht-girl ht-ally" src="${allyArt}" alt="">
    <img class="ht-girl ht-target" src="${targetArt}" alt="">
    <div class="ht-hearts" aria-hidden="true"><i>♡</i><i>♡</i><i>♡</i><b>♥</b></div>
    <div class="ht-copy">
      <div class="ht-kicker">CONCEPT CAFÉ × HEART BATTLE</div>
      <h1><span>HEART</span><em>STRIKE</em><b>♡</b></h1>
      <p class="ht-jp">ハートを届けて、あの娘を攻略しよう♡</p>
    </div>
    <button class="ht-start" type="button"><span>TOUCH TO START</span><b>♡</b></button>
    <p class="ht-loop">お店をめぐって、推しを攻略。<br><small>最高難易度のその先に、彼女だけの特別な声。</small></p>
    <div class="ht-note">© HEART STRIKE</div>`;
  container.appendChild(el);
  let started = false;
  const start = () => {
    if (started) return; started = true;
    try { window.__app?.audio?.tick?.(); } catch {}
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); onStart(); }, 420);
  };
  el.querySelector('.ht-start').addEventListener('click', start);
  el.addEventListener('pointerup', (e) => { if (!e.target.closest('.ht-start')) start(); });
  window.addEventListener('keydown', (e) => { if (!started && (e.key === 'Enter' || e.key === ' ')) start(); }, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
