import { Log, reducedMotion } from './Platform.js';

/**
 * ScreenRouter:画面を4種類で管理する
 *   TAB_ROOT … HOME / 育成 / 攻略(STAGE SELECT)/ ガチャ / コレクション。タブ切替で履歴はリセット
 *   SUB      … CHARACTER DETAIL / 編成 / MISSION / PRESENT / SETTINGS。BACK で元へ
 *   SHEET    … Favorite Select / Gacha Confirm / Gacha Rates。× / 外側タップ / 下スワイプで閉じる
 *   FLOW     … DIFFICULTY / PARTY確認 / CHARACTER SELECT / GAME / RESULT / GACHA SEQUENCE / GACHA RESULT
 * Bottom Navigation は画面の種類では決めない:インゲーム(battle:true の画面 = GAME)だけ非表示、それ以外はすべて表示
 *   = 通常画面(ソシャゲ側 UI・共通メニュー BGM)/ インゲーム(バトル・バトル BGM)の2モード。BGM の切り替えと同じ境界
 * 画面は「レイヤー」(DOM のまとまり)に載る。overlay:true の画面(CHARACTER DETAIL)は下のレイヤーを隠さない(戻った時に編成・スクロールがそのまま)
 * Game 中(HEART50 / SPECIAL / FEVER を含む)は常に FLOW なので Bottom Navigation は絶対に出ない。
 */
export const KIND = { TAB_ROOT: 'TAB_ROOT', SUB: 'SUB', SHEET: 'SHEET', FLOW: 'FLOW' };

export class ScreenRouter {
  constructor(container) {
    this.container = container;
    this.screens = new Map();
    this.layers = new Map();
    this.stack = [];
    this.sheets = [];
    this.listeners = new Set();
    this.lastTab = 'home';
  }

  registerLayer(name, el) { this.layers.set(name, el); }
  register(id, def) { this.screens.set(id, { id, ...def }); return this; }
  def(id) { const d = this.screens.get(id); if (!d) throw new Error(`unknown screen ${id}`); return d; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get top() { return this.stack[this.stack.length - 1] ?? null; }
  get currentId() { return this.top?.id ?? null; }
  get currentKind() { return this.top ? this.def(this.top.id).kind : null; }
  get sheetOpen() { return this.sheets.length > 0; }
  /** インゲーム(バトル)中か:battle:true の画面(GAME)*/
  get inBattle() { return !!this.top && !!this.def(this.top.id).battle; }
  /** Bottom Navigation を出すか:インゲーム以外はすべて表示(SHEET は暗幕の下に Nav を残す)*/
  get navVisible() { return !!this.top && !this.inBattle; }

  /** 画面へ移動 */
  go(id, params = {}) {
    const d = this.def(id);
    if (d.kind === KIND.SHEET) return this.openSheet(id, params);
    this.closeAllSheets();
    const prev = this.top;
    if (d.kind === KIND.TAB_ROOT) {
      for (const e of [...this.stack].reverse()) if (e.id !== id) this.def(e.id).hide?.(e.params);
      this.stack = [{ id, params }];
      this.lastTab = id;
    } else if (d.resetTo) {
      // GAME:戻る先は攻略タブ(DIFFICULTY → PARTY → CHARACTER の履歴は捨てる)
      for (const e of [...this.stack].reverse()) if (e.id !== id) this.def(e.id).hide?.(e.params);
      this.stack = [{ id: d.resetTo, params: {} }, { id, params }];
    } else if (prev && prev.id === id) {
      this.stack[this.stack.length - 1] = { id, params };
    } else {
      if (prev && !d.overlay) this.def(prev.id).leave?.(prev.params);
      this.stack.push({ id, params });
    }
    this.activate(this.top, { restore: false, from: prev?.id });
  }

  /** 履歴ごと置き換えて一番上の画面だけを開く(下の階層は「戻る」で開く)。先頭は TAB_ROOT */
  reset(entries) {
    this.closeAllSheets();
    const prev = this.top;
    for (const e of [...this.stack].reverse()) if (!entries.some((x) => x.id === e.id)) this.def(e.id).hide?.(e.params);
    this.stack = entries.map((e) => ({ id: e.id, params: e.params ?? {} }));
    this.lastTab = entries[0]?.id ?? this.lastTab;
    this.activate(this.top, { restore: false, from: prev?.id });
  }

  /** 今の画面を置き換える(履歴を増やさない) */
  replace(id, params = {}) {
    const prev = this.stack.pop();
    if (prev && prev.id !== id) this.def(prev.id).hide?.(prev.params);
    this.go(id, params);
  }

  /** 1つ戻る。SHEET が開いていればそれを閉じる */
  back() {
    if (this.sheetOpen) { this.closeSheet(); return true; }
    if (this.stack.length <= 1) return false;
    const cur = this.stack.pop();
    this.def(cur.id).hide?.(cur.params);
    this.activate(this.top, { restore: true, from: cur.id });
    return true;
  }

  activate(entry, ctx) {
    const d = this.def(entry.id);
    // 表示するレイヤー:overlay の画面はその下の画面のレイヤーも残す
    const visible = new Set();
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const di = this.def(this.stack[i].id);
      if (di.layer) visible.add(di.layer);
      if (!di.overlay) break;
    }
    for (const [name, el] of this.layers) el.hidden = !visible.has(name);
    const root = this.stack[0] ? this.def(this.stack[0].id) : null;
    this.container.dataset.screen = entry.id;
    this.container.dataset.kind = d.kind;
    this.container.classList.toggle('nav-on', this.navVisible);
    this.container.classList.toggle('app-opaque', !!d.opaque || (d.overlay && !!root?.opaque));
    Log.info('ROUTER', `${ctx.restore ? 'back to' : 'go'} ${entry.id} (${d.kind})`);
    d.show?.(entry.params ?? {}, ctx);
    for (const fn of this.listeners) fn(entry.id, d, ctx);
  }

  // ---------------- SHEET ----------------
  openSheet(id, params = {}) {
    const d = this.def(id);
    this.sheets.push({ id, params });
    this.container.classList.add('sheet-on');
    d.show?.(params, { sheet: true });
    for (const fn of this.listeners) fn(id, d, { sheet: true });
  }
  closeSheet(result) {
    const s = this.sheets.pop();
    if (!s) return;
    this.def(s.id).hide?.(s.params, result);
    if (!this.sheets.length) this.container.classList.remove('sheet-on');
    for (const fn of this.listeners) fn(this.currentId, this.top ? this.def(this.top.id) : null, { sheetClosed: s.id });
  }
  closeAllSheets() { while (this.sheets.length) this.closeSheet(); }
}

/** Bottom Navigation(5項目固定:HOME / 育成 / 攻略 / ガチャ / コレクション)*/
export const NAV_TABS = [
  { id: 'home', label: 'HOME', icon: 'home' },
  { id: 'training', label: '育成', icon: 'train' },
  { id: 'stage', label: '攻略', icon: 'heart', center: true },
  { id: 'gacha', label: 'ガチャ', icon: 'gift' },
  { id: 'collection', label: 'コレクション', icon: 'cards' },
];
const ICONS = {
  home: '<path d="M3 11.3 12 3l9 8.3"/><path d="M5.2 10.4V21h5.1v-6.1h3.4V21h5.1V10.4"/><path d="M7.4 6.9V4.2h3"/>',
  train: '<path d="M12 3c-1.3 3.1-3.2 5.1-6.2 6.2 2.9.8 5 2.8 6.2 5.8 1.2-3 3.3-5 6.2-5.8C15.2 8.1 13.3 6.1 12 3Z"/><path d="M5 16.8c2.8-.2 5.1-1.1 7-2.7 1.9 1.6 4.2 2.5 7 2.7"/><path d="M7.2 18.2c1.7.4 3.3 1.2 4.8 2.8 1.5-1.6 3.1-2.4 4.8-2.8"/>',
  heart: '<path d="M12 21s-8-4.8-8-11.1C4 6.5 6.4 4.5 9.1 4.5c1.4 0 2.5.7 2.9 1.6.4-.9 1.5-1.6 2.9-1.6 2.7 0 5.1 2 5.1 5.4C20 16.2 12 21 12 21Z"/><path d="M3 13c1.7.5 3 1.4 4 2.7M21 13c-1.7.5-3 1.4-4 2.7M4.5 16c1.2.2 2.2.7 3.1 1.5M19.5 16c-1.2.2-2.2.7-3.1 1.5"/>',
  gift: '<path d="M3 9h18v4H3z"/><path d="M5 13h14v8H5z"/><path d="M12 9v12"/><path d="M12 8C8 8 6.5 6.7 6.5 5.2c0-1.3 1-2.2 2.2-2.2C10.8 3 12 6 12 8Zm0 0c4 0 5.5-1.3 5.5-2.8 0-1.3-1-2.2-2.2-2.2C13.2 3 12 6 12 8Z"/>',
  cards: '<path d="m6 6 9.8-2.2 2.8 12.4-9.8 2.2z"/><path d="M5.8 7.3 3.4 9l5.2 10.8 8.5-4"/><path d="m11.1 10.3 1.6-2.2 2.2 1.6-1.6 2.2z"/>'
};
export const iconSvg = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

export class BottomNav {
  constructor(router, el) {
    this.router = router;
    this.el = el;
    el.innerHTML = NAV_TABS.map((t) => `<button type="button" class="nv${t.center ? ' center' : ''}" data-tab="${t.id}" aria-label="${t.label}">
      <span class="nv-ic">${iconSvg(t.icon)}<i class="nv-dot" hidden></i></span><span class="nv-l">${t.label}</span></button>`).join('');
    for (const b of el.querySelectorAll('[data-tab]')) b.addEventListener('click', () => router.go(b.dataset.tab));
    for (const ev of ['pointerdown', 'pointerup']) el.addEventListener(ev, (e) => e.stopPropagation());
    router.onChange((id) => this.sync(id));
  }
  sync() {
    const root = this.router.stack[0]?.id;
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === root);
    this.el.hidden = !this.router.navVisible;
  }
  setDot(tab, on) { const d = this.el.querySelector(`[data-tab="${tab}"] .nv-dot`); if (d) d.hidden = !on; }
  /** 攻略の Pulse(新Stage / 新Difficulty / Tutorial / Event の時だけ)。reduced motion では静的な発光だけ */
  setPulse(tab, on) {
    const b = this.el.querySelector(`[data-tab="${tab}"]`);
    if (!b) return;
    b.classList.toggle('pulse', on && !reducedMotion());
    b.classList.toggle('glow', on);
  }
}

/** SHEET の外枠(暗幕 + 下から出るパネル)。× / 外側タップ / 下スワイプで閉じる */
export class SheetHost {
  constructor(router, root) {
    this.router = router;
    this.root = root;
    root.innerHTML = '<div class="sh-scrim"></div><section class="sh-panel" role="dialog" aria-modal="true"><div class="sh-grip"></div><button type="button" class="sh-x" aria-label="閉じる">×</button><div class="sh-title"></div><div class="sh-body"></div></section>';
    this.panel = root.querySelector('.sh-panel');
    this.body = root.querySelector('.sh-body');
    this.title = root.querySelector('.sh-title');
    for (const ev of ['pointerdown', 'pointerup']) root.addEventListener(ev, (e) => e.stopPropagation());
    root.querySelector('.sh-scrim').addEventListener('click', () => router.closeSheet());
    root.querySelector('.sh-x').addEventListener('click', () => router.closeSheet());
    // 下スワイプ(パネルの上部 / グリップから)
    let start = null;
    this.panel.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .sh-scroll')) return; start = { y: e.clientY, t: performance.now() }; });
    this.panel.addEventListener('pointermove', (e) => { if (!start) return; const dy = Math.max(0, e.clientY - start.y); this.panel.style.transform = `translateY(${dy}px)`; });
    const end = (e) => {
      if (!start) return;
      const dy = e.clientY - start.y; start = null;
      this.panel.style.transform = '';
      if (dy > 70) router.closeSheet();
    };
    this.panel.addEventListener('pointerup', end);
    this.panel.addEventListener('pointercancel', () => { start = null; this.panel.style.transform = ''; });
  }
  open(title, html) {
    this.title.textContent = title;
    this.body.innerHTML = html;
    this.root.hidden = false;
    this.panel.classList.remove('in'); void this.panel.offsetWidth; this.panel.classList.add('in');
    return this.body;
  }
  close() { this.root.hidden = true; this.body.innerHTML = ''; }
}
