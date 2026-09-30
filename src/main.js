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
  window.__app.start();
  setStatus(`${__Cfg.app.title} ${BUILD}`);
  Log.info('INIT', `boot ${BUILD}`);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
