import { CHARACTERS, ATTRIBUTES, RANKS, TYPES } from '../data/GameData.js';
import { artUrl, isPlaceholderArt } from '../data/CharacterArt.js';
import { storage } from '../app/Platform.js';
import { roleTag } from '../app/Roles.js';
import { applyRarity } from '../app/Rarity.js';
import { STAT_KEYS, STAT_LABELS } from '../data/GrowthData.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * キャラクター特徴(★5段階):ステータス ATTACK / DEFENCE / CONTROL / CURVE(0〜100)を ★ に換算して見せるだけ
 */
export function characterTraits(ch) {
  const s5 = (v) => clamp(Math.round((Number(v) || 0) / 20), 1, 5);
  return STAT_KEYS.map((k) => ({ id: k, label: STAT_LABELS[k], value: s5(ch.stats?.[k]) }));
}

/**
 * CHARACTER DETAIL の中身はセクションの配列。将来(ボイス / プロフィール / 衣装 / スキル / 育成 / 親愛度 /
 * 3D Route 適性 / SPECIAL 演出確認 …)はここに { id, render(ch) } を1件足すだけで増やせる
 */
export const DETAIL_SECTIONS = [
  {
    id: 'status',
    render: (ch) => {
      const ratio = ch.maxLevel ? 1 : ch.expNeed ? clamp(ch.expInto / ch.expNeed, 0, 1) : 0;
      const st = ch.totalStats ?? ch.stats ?? {};   // 表示はレベル + アビリティの合計
      return `<div class="cd-stat"><span class="cd-lv">♡ AFFECTION Lv.<b>${ch.level}</b></span><span>HP <b>${ch.maxHp ?? '-'}</b></span>${STAT_KEYS.map((k) => `<span>${STAT_LABELS[k].slice(0, 3)} <b>${st[k] ?? '-'}</b></span>`).join('')}</div>
        <div class="cd-exp"><span>EXP</span><div class="cd-expbar"><i style="transform:scaleX(${ratio})"></i></div><b>${ch.maxLevel ? 'MAX' : `${ch.expInto ?? 0} / ${ch.expNeed ?? 0}`}</b></div>`;
    },
  },
  {
    id: 'traits',
    render: (ch) => `<div class="cd-traits">${characterTraits(ch).map((t) => `<div data-trait="${t.id}"><span>${t.label}</span><em>${stars(t.value)}</em></div>`).join('')}</div>`,
  },
  {
    id: 'about',
    render: (ch) => (ch.description ? `<p class="cd-desc">${esc(ch.description)}</p>` : ''),
  },
  // ホームのキャラの設定はここには置かない(育成 → キャラクター詳細の「ホームに設定」だけ)
];

/**
 * キャラクター専用画面(閲覧専用)。全身イラスト(FullBodySprite)を主役に、必要最低限の情報を重ねる。
 *   開く:PARTY EDIT / CHARACTER SELECT のカードを長押し
 *   切替:左右スワイプ / ◀ ▶ ボタン / ←→ キー(全キャラを循環)
 *   閉じる:BACK / Esc → 開く直前の画面へ(メニューは再描画しないので編成・選択中の枠・スクロール位置はそのまま)
 *   イラストをタップすると UI を隠して鑑賞できる
 */
export class CharacterDetail {
  constructor(app, progress, root) {
    this.app = app;
    this.progress = progress;
    const el = document.createElement('div');
    el.id = 'charDetail';
    el.hidden = true;
    el.innerHTML = `<div class="cd-bg"></div><div class="cd-fx">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <div class="cd-art"><img alt=""></div>
      <div class="cd-scrim"></div>
      <header class="cd-head"><div class="cd-title">PROFILE</div><div class="cd-rank"></div><div class="cd-name"></div><div class="cd-meta"></div><div class="cd-ph" hidden>仮イラスト</div></header>
      <button type="button" class="cd-nav prev" aria-label="前のキャラクター">◀</button>
      <button type="button" class="cd-nav next" aria-label="次のキャラクター">▶</button>
      <div class="cd-panel"><div class="cd-sections"></div><button type="button" class="cd-back">◀ BACK</button></div>`;
    root.appendChild(el);
    this.el = el;
    this.img = el.querySelector('.cd-art img');
    this.ids = CHARACTERS.map((c) => c.id);
    for (const ev of ['pointerdown', 'pointerup', 'click']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.querySelector('.cd-back').addEventListener('click', () => this.close());
    el.querySelector('.cd-back').textContent = '‹ BACK';
    el.querySelector('.prev').addEventListener('click', () => this.step(-1));
    el.querySelector('.next').addEventListener('click', () => this.step(1));
    // スワイプ(左右)/ イラストのタップで UI 表示切替
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      this.swipe = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
      const s = this.swipe; this.swipe = null;
      if (!s || e.target.closest('button')) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) this.step(dx < 0 ? 1 : -1);
      else if (Math.hypot(dx, dy) < 8 && performance.now() - s.t < 400) el.classList.toggle('viewonly');
    });
    el.addEventListener('pointercancel', () => { this.swipe = null; });
  }

  get isOpen() { return !this.el.hidden; }

  /** 開く(ScreenRouter の SUB 'detail')。左右の切替は所持キャラだけを循環 */
  open(id) {
    const owned = this.progress.ownedIds;
    this.ids = owned.includes(id) ? owned : [id];
    this.index = Math.max(0, this.ids.indexOf(id));
    this.el.hidden = false;
    this.el.classList.remove('viewonly');
    this.render(0);
    this.opened = (this.opened ?? 0) + 1;
    storage.set('squash-titan-hint-longpress', 'used');
  }

  /** BACK:ScreenRouter で1つ戻る(開く直前の画面へ。メニューは再描画しないので編成・スクロールはそのまま)*/
  close() {
    if (!this.isOpen) return;
    this.app.router.back();
  }
  hide() { this.el.hidden = true; }

  step(d) {
    this.index = (this.index + d + this.ids.length) % this.ids.length;
    this.render(d);
  }

  get current() { return this.progress.character(this.ids[this.index]); }

  render(dir) {
    const ch = this.current;   // CharacterData + PlayerProgress(レベル・EXP 反映済み)
    const a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank], t = TYPES[ch.type];
    const el = this.el;
    el.dataset.attr = ch.attribute;
    el.dataset.chara = ch.id;
    el.style.setProperty('--ac', a.color);
    el.style.setProperty('--rc', r.color);
    const rk = el.querySelector('.cd-rank'); rk.textContent = r.id; rk.classList.add('rar-badge'); applyRarity(rk, ch.rank);
    el.querySelector('.cd-name').textContent = ch.name;
    el.querySelector('.cd-meta').innerHTML = `${roleTag('ally', 'sm')} <span class="cd-attr">${a.icon} ${a.label}</span> / <span>${t.label}</span>`;
    el.querySelector('.cd-ph').hidden = !isPlaceholderArt(ch, 'fullBody');
    // 全身イラスト(FullBodySprite)。DetailPosition / DetailScale / DetailRotation で配置(画像は加工しない)
    const d = ch.detail ?? { x: 0.5, y: 0.52, scale: 1, rot: 0 };
    const art = el.querySelector('.cd-art');
    art.style.setProperty('--dx', d.x);
    art.style.setProperty('--dy', d.y);
    art.style.setProperty('--ds', d.scale);
    art.style.setProperty('--dr', `${d.rot ?? 0}deg`);
    this.img.src = artUrl(ch, 'fullBody');
    this.img.alt = ch.name;
    const ctx = {};
    el.querySelector('.cd-sections').innerHTML = DETAIL_SECTIONS.map((s) => `<section data-section="${s.id}">${s.render(ch, ctx)}</section>`).join('');
    this.progress.markIntroduced(ch.id);
    if (dir) { art.classList.remove('in-l', 'in-r'); void art.offsetWidth; art.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
  }

  /** キー操作(MenuFlow から):←→ で切替 / Esc・Enter・Backspace で戻る */
  onKey(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
    else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); this.close(); }
  }
}
