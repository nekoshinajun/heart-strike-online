import { Config } from '../core/Config.js';

/**
 * アプリの土台(Web プロトタイプ → 将来 WebView / Capacitor へ包める形)
 *   Log            … [INIT] [ASSET] [AUDIO] [SAVE] [TOUCH] [STAGE] [GACHA] [HOME] のカテゴリ付きログ(コンソールのみ・製品画面には出さない)
 *   safe           … 初期化の失敗を隔離(BGM / SE / Particle / Haptic が失敗してもゲームは起動する)
 *   StorageAdapter … 保存の抽象化(今は localStorage。ネイティブ Storage へ差し替え可能)
 *   Haptic         … HapticAdapter(navigator.vibrate に直接依存しない。非対応端末では何もしない)
 *   devInput       … PC のマウス / キーボード操作は開発専用(Config.debug.enableDevInput)
 */
export const Log = {
  on() { return !!Config.debug?.log; },
  info(tag, ...a) { if (this.on()) console.log(`[${tag}]`, ...a); },
  warn(tag, ...a) { console.warn(`[${tag}]`, ...a); },
};

export function safe(tag, fn, fallback = null) {
  try { return fn(); } catch (e) { Log.warn(tag, 'init failed (isolated):', e?.message || e); return typeof fallback === 'function' ? fallback() : fallback; }
}

/** どんなメソッドを呼んでも何もしないオブジェクト(Audio 等の初期化に失敗した時の代わり) */
export function nullObject(name) {
  return new Proxy({}, { get: (t, k) => (k === 'isNull' ? true : k === 'toString' ? () => `[null ${name}]` : () => undefined) });
}

export class StorageAdapter {
  constructor() {
    this.mem = new Map();
    try { const k = '__hs_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); this.ls = localStorage; } catch { this.ls = null; Log.warn('SAVE', 'localStorage unavailable → memory only'); }
  }
  get(key) { try { return this.ls ? this.ls.getItem(key) : this.mem.get(key) ?? null; } catch { return this.mem.get(key) ?? null; } }
  set(key, value) {
    try { if (this.ls) { this.ls.setItem(key, value); return true; } } catch (e) { Log.warn('SAVE', 'write failed', e?.message); }
    this.mem.set(key, value); return false;
  }
  remove(key) { try { this.ls?.removeItem(key); } catch { /* noop */ } this.mem.delete(key); }
  getJSON(key) { const v = this.get(key); if (v == null) return null; try { return JSON.parse(v); } catch { return undefined; } }
  setJSON(key, obj) { return this.set(key, JSON.stringify(obj)); }
}
export const storage = new StorageAdapter();

export const Haptic = {
  enabled: true,
  supported() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; },
  pulse(ms) { if (!this.enabled || !this.supported()) return; try { navigator.vibrate(ms); } catch { /* 非対応 */ } },
  light() { this.pulse(10); },
  medium() { this.pulse(22); },
  heavy() { this.pulse([30, 40, 30]); },
};

export const devInput = () => !!Config.debug?.enableDevInput;

/** OS / 設定の「視差効果を減らす」 */
export function reducedMotion() {
  const m = Config.app?.reducedMotion ?? 'auto';
  if (m === 'on') return true;
  if (m === 'off') return false;
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
