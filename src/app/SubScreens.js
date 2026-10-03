import { Config } from '../core/Config.js';
import { CHARACTERS, ATTRIBUTES, RANKS, TYPES, characterById, stageById, DEFAULT_SPECIAL } from '../data/GameData.js';
import { HEROINES, GIFTS, heroineById, giftName, giftIcon, giftRank, giftExp } from '../data/RomanceData.js';
import { STAT_KEYS, STAT_LABELS, STAT_DISPLAY_MAX, ABILITY_RESET_ITEM } from '../data/GrowthData.js';
import { staminaNextMs, HP_MAX } from '../data/Growth.js';
import { artUrl } from '../data/CharacterArt.js';
import { staminaHTML } from '../screens/MenuFlow.js';
import { RewardService } from '../home/Guidance.js';
import { statRadarSVG } from '../screens/StatRadar.js';
export { statRadarSVG };
import { Haptic } from './Platform.js';
import { roleTag, clearChips, voiceStatus, rewardLabel, rewardLockText } from './Roles.js';
import { rarityAttr, rarityBadge, raritySparkle, charAccent } from './Rarity.js';
import { ITEM_CATEGORIES, collectionItems, itemCategory } from '../data/ItemCatalog.js';
import { COLLECTION_SORTS, currentSort, nextSort, sortLabel, sortList } from './CollectionSort.js';

/** コレクションの上部カテゴリ(表示順。開いた時は先頭の「所持アイテム」)*/
const COLLECTION_TABS = [
  { id: 'items', label: '所持アイテム', icon: '🎁' },
  { id: 'ally', label: '仲間', icon: '♡' },
  { id: 'heroine', label: '攻略対象', icon: '🎧' },
];
/** 並び替えの向きの印(向きの無い項目は無し)*/
const sortArrow = (cat, sort) => (COLLECTION_SORTS[cat]?.options.find((o) => o.key === sort.key)?.dirs ? (sort.dir === 'desc' ? '↓' : '↑') : '');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** プレゼントを受け取った時のセリフ(GIFTS.reactions が未登録の時だけ使う。仕様書の例文)*/
const GIFT_FALLBACK_LINES = ['えっ、これ私に？', 'ありがとう♡'];
const fmtTime = (sec) => (Number.isFinite(sec) ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : '--:--');

/**
 * 明るい HEART STRIKE テーマの汎用画面(レイヤー 'app')
 *   TAB_ROOT:育成(仲間の一覧)・コレクション(所持アイテム / 仲間 / 攻略対象)
 *   SUB     :仲間の育成画面(trainChar)・攻略対象の画面(heroine:クリア報酬ボイス)・MISSION・PRESENT・SETTINGS
 * どれもデータが空でも破綻しない(空状態の表示あり)。
 */
export const TRAINING_FEATURES = [
  // 将来の育成(限界突破 / Skill / 衣装 / 親愛度)はここに1件足し、CHARACTER DETAIL の DETAIL_SECTIONS に表示を足す
  { id: 'level', label: '親密度 Lv(= レベル)', ready: true },
  { id: 'ability', label: 'アビリティ', ready: true },
  { id: 'limitBreak', label: '限界突破', ready: false },
  { id: 'skill', label: 'スキル', ready: false },
  { id: 'costume', label: '衣装', ready: false },
];


/** 必殺技の表示用(CharacterData.special → 画面用の文字)。{heartMul} などは Config から */
export function specialView(ch) {
  const sp = ch?.special ?? DEFAULT_SPECIAL;
  const fill = (t) => String(t ?? '').replace(/\{heartMul\}/g, String(Config.special.heartMul));
  const custom = sp !== DEFAULT_SPECIAL && sp.name !== DEFAULT_SPECIAL.name;
  return {
    name: sp.name, description: fill(sp.description), note: sp.note ? fill(sp.note) : null, effectType: sp.effectType ?? 'attack',
    highlight: { value: fill(sp.highlight?.value ?? ''), label: fill(sp.highlight?.label ?? '') },
    // 固有の必殺技も、土台は共通の SPECIAL HEART(次の1投の HEART 倍率)
    base: custom ? `＋ SPECIAL HEART:届く HEART ×${Config.special.heartMul}` : null,
  };
}
/** 育成画面のキャラ詳細の「SPECIAL / 必殺技名 ›」(1行。タップで詳細のシート:必殺技名・効果・重要な数値・固有効果)*/
export function specialCardHTML(ch) {
  const sp = specialView(ch);
  return `<button type="button" class="td-special" data-act="special" data-effect="${esc(sp.effectType)}" aria-label="必殺技 ${esc(sp.name)} の詳細を開く">
    <small>SPECIAL</small><b class="tsp-name">${esc(sp.name)}</b><i class="tsp-go" aria-hidden="true">›</i>
  </button>`;
}
export class AppScreens {
  constructor(app, el) {
    this.app = app;
    this.p = app.progress;
    this.rewards = new RewardService(this.p);
    this.el = el;
    el.innerHTML = `<header class="as-head"><button type="button" class="as-back" aria-label="戻る">‹</button><div class="as-title"></div><div class="as-side"></div></header><div class="as-body ascroll"></div>`;
    this.body = el.querySelector('.as-body');
    this.title = el.querySelector('.as-title');
    this.side = el.querySelector('.as-side');
    this.backBtn = el.querySelector('.as-back');
    this.backBtn.addEventListener('click', () => app.router.back());
    for (const ev of ['pointerdown', 'pointerup']) el.addEventListener(ev, (e) => e.stopPropagation());
  }

  frame(screen, title, { back = false, side = '' } = {}) {
    this.screen = screen;
    this.el.dataset.screen = screen;
    this.title.textContent = title;
    this.backBtn.hidden = !back;
    this.side.innerHTML = side;
    this.body.scrollTop = 0;
  }

  // ---------------- 育成(TAB_ROOT):上 = 今の編成 / 下 = 所持キャラクター一覧 ----------------
  /** キャラクターカード(画像・名前・親密度 Lv・レアリティ・属性 / タイプ・STAMINA・編成中 ✓・ホーム設定中)*/
  trainCardHTML(id, { party = false, extra = '' } = {}) {
    const ch = this.p.character(id), a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank], t = TYPES[ch.type];
    const si = this.p.party.indexOf(id), home = this.p.favoriteId === id;
    void r;
    return `<button type="button" class="tl-card rar-frame${party ? ' party' : ''}${si >= 0 ? ' in' : ''}" data-id="${id}" ${rarityAttr(ch.rank)} style="--ac:${a.color}" aria-label="${esc(ch.name)}${si >= 0 ? `(編成中 ${'ABCD'[si]})` : ''}">
      <span class="tl-art"><img src="${artUrl(ch, 'cutout')}" alt="" draggable="false" loading="lazy"></span>
      ${rarityBadge(ch.rank, 'tl-rank')}${raritySparkle(ch.rank)}${charAccent(ch)}
      ${si >= 0 ? `<span class="tl-in" title="編成中"><i>✓</i>${'ABCD'[si]}</span>` : ''}
      ${home ? '<span class="tl-home" title="ホーム設定中">⌂</span>' : ''}
      <span class="tl-info"><b class="tl-name">${esc(ch.name)}</b><span class="tl-lv">Lv.<b>${ch.level}</b></span>
        <span class="tl-type">${a.icon} ${t.label}</span><span class="tl-row">${staminaHTML(ch, 'sm')}<span class="tl-hp">HP <b>${ch.maxHp}</b></span></span></span>${extra}
    </button>`;
  }
  showTraining() {
    this.frame('training', '育成');
    const ids = this.p.ownedIds, party = this.p.party;
    this.body.innerHTML = `
      <section class="tl-sec">
        <header class="tl-head"><b>♡ 編成</b><small>攻略に連れていく4人</small><button type="button" class="tl-edit" data-act="party">編成を変更 ›</button></header>
        <div class="tl-party">${party.map((id, i) => (this.p.isOwned(id) ? this.trainCardHTML(id, { party: true }) : `<div class="tl-card empty"><span>${'ABCD'[i]}</span></div>`)).join('')}</div>
      </section>
      <section class="tl-sec">
        <header class="tl-head"><b>所持キャラクター</b><small>${ids.length}人 ・ タップで詳細</small></header>
        <div class="tl-grid">${ids.map((id) => this.trainCardHTML(id)).join('')}</div>
      </section>`;
    for (const b of this.body.querySelectorAll('.tl-card[data-id]')) b.addEventListener('click', () => this.app.router.go('trainChar', { id: b.dataset.id }));
    this.body.querySelector('[data-act="party"]').addEventListener('click', () => this.app.router.go('partyTab'));
  }

  // ---------------- キャラクター詳細(SUB):画面全体がキャラクター。右側に情報パネル、アビリティ / プレゼントはボタンで開くシート ----------------
  /** 必殺技の詳細(シート)。内容は CharacterData.special だけから作る */
  showSpecialSheet({ id } = {}) {
    const ch = this.p.character(id ?? this.trainId), sp = specialView(ch);
    this.app.sheet.open('SPECIAL / 必殺技', `
      <div class="sp-sheet" data-effect="${esc(sp.effectType)}">
        <small class="sp-chara">${esc(ch.name)}</small>
        <h3 class="sp-name">${esc(sp.name)}</h3>
        <div class="sp-hl"><b>${esc(sp.highlight.value)}</b><span>${esc(sp.highlight.label)}</span></div>
        <p class="sp-desc">${esc(sp.description)}</p>
        ${sp.note ? `<p class="sp-note">${esc(sp.note)}</p>` : ''}
        ${sp.base ? `<p class="sp-base">${esc(sp.base)}</p>` : ''}
      </div>`);
  }

  showTrainChar({ id, focus } = {}) {
    if (!id || !this.p.isOwned(id)) { this.app.router.back(); return; }
    if (this.trainId !== id) this.abilityOpen = null;   // キャラを替えた時は「変更」を閉じた状態から
    this.trainId = id;
    const ch = this.p.character(id), a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank], t = TYPES[ch.type];
    const ids = this.p.ownedIds, n = ids.length;
    const si = this.p.party.indexOf(id), home = this.p.favoriteId === id;
    this.frame('trainChar', '育成', { back: true });
    const expRatio = ch.maxLevel ? 1 : ch.expNeed ? Math.min(1, ch.expInto / ch.expNeed) : 1;
    const pd = this.p.data.characters[id];
    const nextMs = staminaNextMs(ch.stamina, pd.lastStaminaUpdate);
    const stamNote = ch.tired ? '疲労中 ・ 獲得 EXP ×10%(出撃はできます)' : nextMs == null ? '満タン' : `あと ${Math.ceil(nextMs / 60000)} 分で +5`;
    const board = this.p.abilityBoard(id);
    const pending = board.some((row) => !row.ultimate && row.unlocked && !row.selected);
    const active = ch.abilities ?? [];
    // 五角形:HP(バトルの最大 HP)+ ATTACK / DEFENCE / CONTROL / CURVE(育成のステータス)。STAMINA は消費リソースなので別のゲージ
    const radar = statRadarSVG([{ key: 'hp', label: 'HP', value: ch.maxHp ?? Config.playerMaxHp, max: HP_MAX }, ...STAT_KEYS.map((k) => ({ key: k, label: STAT_LABELS[k], value: (ch.totalStats ?? ch.stats)[k], max: STAT_DISPLAY_MAX }))]);   // 表示はレベル + アビリティの合計
    this.body.innerHTML = `
      <div class="td" data-id="${id}" style="--ac:${a.color};--rc:${r.color}">
        <div class="td-bg"></div>
        <div class="td-art"><img src="${artUrl(ch, 'cutout')}" alt="${esc(ch.name)}" draggable="false"></div>
        <div class="td-bubble tc-bubble" hidden></div>
        ${n > 1 ? `<button type="button" class="td-nav prev" data-nav="-1" aria-label="前のキャラクター">‹</button><button type="button" class="td-nav next" data-nav="1" aria-label="次のキャラクター">›</button>` : ''}
        <div class="td-side">
        <section class="td-plate">
          <div class="td-badges">${rarityBadge(ch.rank, 'td-rank')}<span class="td-attr">${a.icon} ${a.label}</span><span class="td-type">${t.label}</span></div>
          <h2 class="td-name">${esc(ch.name)}</h2>
          <div class="td-lv"><small>♡ AFFECTION</small><b>Lv.${ch.level}</b>${ch.maxLevel ? '<em>MAX</em>' : ''}</div>
          <div class="td-exp"><i class="tc-bar exp"><i style="transform:scaleX(${expRatio})"></i></i><small>${ch.maxLevel ? 'MAX' : `EXP ${ch.expInto} / ${ch.expNeed}`}</small></div>
          ${si >= 0 || home ? `<div class="td-chips">${si >= 0 ? `<span class="td-chip in">✓ 編成中 ${'ABCD'[si]}</span>` : ''}${home ? '<span class="td-chip home">⌂ ホーム設定中</span>' : ''}</div>` : ''}
        </section>
        ${specialCardHTML(ch)}
        <section class="td-panel">
          <div class="td-radar">${radar}</div>
          <div class="td-meta"><div class="td-stam${ch.tired ? ' tired' : ''}"><div class="td-stamrow"><span>STAMINA</span><i class="tc-bar stam"><i style="transform:scaleX(${ch.stamina / ch.staminaMax})"></i></i><small><b>${ch.stamina}</b>/${ch.staminaMax}</small></div>${ch.tired ? `<p>${stamNote}</p>` : ''}</div>
          <div class="td-abil"><small>ABILITY${pending ? '<em class="td-abnew">NEW</em>' : ''}</small><div class="td-abs">${active.length ? active.slice(0, 2).map((x) => `<span class="td-ab${x.ultimate ? ' ult' : ''}">${esc(x.name)}</span>`).join('') + (active.length > 2 ? `<span class="td-ab more" title="${esc(active.slice(2).map((x) => x.name).join(' / '))}">+${active.length - 2}</span>` : '') : '<span class="td-ab none">まだありません</span>'}</div></div></div>
        </section>
        </div>
        <nav class="td-actions">
          <button type="button" data-act="gift"><i>🎁</i><span>プレゼント</span></button>
          <button type="button" data-act="ability"><i>✦</i><span>アビリティ</span>${pending ? '<em class="dot" aria-label="新しいアビリティ"></em>' : ''}</button>
          <button type="button" data-act="home" class="${home ? 'on' : ''}" ${home ? 'aria-pressed="true"' : ''}><i>⌂</i><span>${home ? 'ホーム設定中' : 'ホームに設定'}</span></button>
        </nav>
      </div>`;
    const go = (d) => this.app.router.go('trainChar', { id: ids[(ids.indexOf(id) + d + n) % n] });
    for (const b of this.body.querySelectorAll('[data-nav]')) b.addEventListener('click', () => go(Number(b.dataset.nav)));
    // イラストを左右にスワイプしても前後のキャラへ
    const art = this.body.querySelector('.td-art');
    let sx = null;
    art.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    art.addEventListener('pointerup', (e) => { if (sx == null || n < 2) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); });
    this.body.querySelector('[data-act="special"]')?.addEventListener('click', () => this.app.router.go('trainSpecial', { id }));
    this.body.querySelector('[data-act="gift"]').addEventListener('click', () => this.app.router.go('trainGift'));
    this.body.querySelector('[data-act="ability"]').addEventListener('click', () => this.app.router.go('trainAbility'));
    this.body.querySelector('[data-act="home"]').addEventListener('click', () => this.setHomeCharacter(id));
    if (focus === 'ability') setTimeout(() => { if (this.screen === 'trainChar' && this.trainId === id) this.app.router.go('trainAbility'); }, 0);
  }

  /**
   * ★ ホームのキャラを変える唯一の操作(育成 → キャラクター詳細 →「ホームに設定」)。
   *   ほかの画面(HOME / ガチャ結果 / プロフィール / シート)からは変えられない
   */
  setHomeCharacter(id) {
    if (this.screen !== 'trainChar' || this.trainId !== id || !this.p.isOwned(id)) return false;
    if (this.p.favoriteId === id) return false;
    if (!this.app.home.setFavorite(id)) return false;
    Haptic.light?.();
    this.app.toast?.(`${characterById(id).name} をホームに設定しました ♡`);
    this.showTrainChar({ id });
    return true;
  }

  // ---------------- 育成メニュー(ボトムシート):アビリティ / プレゼント ----------------
  openTrainSheet(kind) {
    if (!this.trainId) return;
    this.trainSheet = kind;
    this.abilityOpen = null;
    this.giftLine = null;
    this.app.sheet.open(kind === 'ability' ? '✦ アビリティ' : '🎁 プレゼント', '');
    this.renderTrainSheet();
  }
  renderTrainSheet() {
    const body = this.app.sheet.body, id = this.trainId, kind = this.trainSheet;
    if (!body || !id) return;
    const top = body.querySelector('.sh-scroll')?.scrollTop ?? 0;
    const ch = this.p.character(id);
    const who = `<div class="ts-who"><span class="ts-face" style="background-image:url('${artUrl(ch, 'cutout')}')"></span><b>${esc(ch.name)}</b><small>♡ Lv.${ch.level}</small></div>`;
    if (kind === 'ability') {
      body.innerHTML = `${who}<div class="sh-scroll ts-scroll">${this.abilityBoardHTML(id)}</div>`;
      this.wireAbilityBoard(id, body);
    } else {
      body.innerHTML = `${who}
        ${this.giftLine ? `<div class="ts-react"><p>${esc(this.giftLine.line)}</p>${this.giftLine.gains ? `<small>${this.giftLine.gains}</small>` : ''}</div>` : '<p class="ts-lead">渡すと親密度 EXP がもらえる(好きなものは多め)</p>'}
        <div class="sh-scroll ts-scroll"><div class="tg-list">${GIFTS.map((g) => { const n = this.p.itemCount(g.id), rk = giftRank(g); return `<button type="button" class="tg-item" data-gift="${g.id}" ${n ? '' : 'disabled'}${rk?.color ? ` style="--gk:${rk.color}"` : ''}>${g.image ? `<img src="${esc(g.image)}" alt="">` : `<i>${giftIcon(g)}</i>`}<span>${esc(giftName(g))}</span>${rk ? `<em class="tg-rank">${esc(rk.label)}</em>` : ''}<small class="tg-exp">+${giftExp(g, ch)}</small><b>×${n}</b></button>`; }).join('')}</div>
        ${GIFTS.every((g) => !this.p.itemCount(g.id)) ? '<p class="as-note">プレゼントはまだ持っていません。ガチャのおまけや攻略のクリア報酬でもらえます</p>' : ''}</div>`;
      for (const b of body.querySelectorAll('[data-gift]')) b.addEventListener('click', () => this.giveGift(b.dataset.gift));
    }
    const sc = body.querySelector('.sh-scroll'); if (sc) sc.scrollTop = top;
  }
  /** 育成の操作の後:後ろの詳細と開いているシートの両方を描き直す */
  refreshTrain() {
    if (this.screen === 'trainChar') this.showTrainChar({ id: this.trainId });
    if (this.trainSheet && !this.app.sheet.root.hidden) this.renderTrainSheet();
  }

  /** アビリティ:Lv10〜100 は候補から1つ(未選択は無料・変更はリコネクトハート ×1)/ Lv100 は ULTIMATE(自動)も */
  abilityBoardHTML(id) {
    const rows = this.p.abilityBoard(id), items = this.p.abilityResetItems, I = ABILITY_RESET_ITEM;
    const open = this.abilityOpen ?? null;
    const rowHTML = (row) => {
      const sel = row.candidates.find((c) => c.id === row.selected);
      if (row.ultimate) {
        return `<li class="ab-row ult${row.unlocked ? '' : ' locked'}" data-lv="100"><span class="ab-lv">Lv.100</span>
          <div class="ab-main"><small>ULTIMATE</small><b>${row.unlocked ? esc(sel.name) : '？？？'}</b><p>${row.unlocked ? esc(sel.desc) : 'Lv.100 で解放(キャラ固有)'}</p></div></li>`;
      }
      if (!row.unlocked) return `<li class="ab-row locked" data-lv="${row.level}"><span class="ab-lv">Lv.${row.level}</span><div class="ab-main"><b>🔒</b><p>Lv.${row.level} で解放</p></div></li>`;
      const choosing = !sel || open === row.level;
      const cands = choosing ? `<div class="ab-cands">${row.candidates.map((c) => {
        const isCur = c.id === row.selected;
        return `<button type="button" class="ab-cand${isCur ? ' cur' : ''}" data-lv="${row.level}" data-ab="${c.id}" ${isCur || (sel && items < 1) ? 'disabled' : ''}><b>${esc(c.name)}</b><small>${esc(c.desc)}</small>${sel && !isCur ? `<em>${I.icon} ×1 で変更</em>` : ''}${isCur ? '<em>選択中</em>' : ''}</button>`;
      }).join('')}</div>` : '';
      return `<li class="ab-row${sel ? ' set' : ' new'}" data-lv="${row.level}"><span class="ab-lv">Lv.${row.level}</span>
        <div class="ab-main">${sel ? `<b>${esc(sel.name)}</b><p>${esc(sel.desc)}</p>` : '<b class="ab-pick">NEW ♡ 1つ選んでね</b>'}${cands}</div>
        ${sel ? `<button type="button" class="ab-change" data-lv="${row.level}">${open === row.level ? 'やめる' : '変更'}</button>` : ''}</li>`;
    };
    return `<section class="tc-ability">
      <header><b>✦ ABILITY</b><span>${I.icon} ${esc(I.name)} ×<b class="ab-items">${items}</b></span></header>
      <ul class="ab-list">${rows.map(rowHTML).join('')}</ul></section>`;
  }
  wireAbilityBoard(id, root = this.body) {
    for (const b of root.querySelectorAll('.ab-change')) b.addEventListener('click', () => { const lv = Number(b.dataset.lv); this.abilityOpen = this.abilityOpen === lv ? null : lv; this.renderTrainSheet(); });
    for (const b of root.querySelectorAll('.ab-cand')) b.addEventListener('click', () => {
      const r = this.p.selectAbility(id, Number(b.dataset.lv), b.dataset.ab);
      if (!r.ok) { this.app.toast?.(r.reason === 'noItem' ? `${ABILITY_RESET_ITEM.name}が足りません` : 'このアビリティは選べません'); return; }
      this.abilityOpen = null;
      Haptic.light?.();
      this.app.toast?.(r.changed ? `アビリティを変更しました(${ABILITY_RESET_ITEM.name} 残り ${r.itemsLeft})` : 'アビリティを習得しました♡');
      this.refreshTrain();
    });
  }
  giveGift(giftId) {
    const r = this.p.giveGift(this.trainId, giftId);
    if (!r) return;
    Haptic.light();
    const line = r.reaction ?? GIFT_FALLBACK_LINES[Math.floor(Math.random() * GIFT_FALLBACK_LINES.length)];
    const gains = [r.gainedExp > 0 ? `♡ 親密度EXP +${r.gainedExp}` : '', r.levelUps > 0 ? `LEVEL UP! Lv.${r.after.level}` : ''].filter(Boolean).join(' ・ ');
    this.giftLine = { line, gains };
    this.refreshTrain();
    // 後ろの詳細:キャラの吹き出し + リアクション
    const bub = this.body.querySelector('.td-bubble');
    if (bub) {
      bub.innerHTML = `<p>${esc(line)}</p>${gains ? `<small>${gains}</small>` : ''}`;
      bub.hidden = false; bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in');
      const img = this.body.querySelector('.td-art img'); img.classList.remove('react'); void img.offsetWidth; img.classList.add('react');
      clearTimeout(this.bubTimer); this.bubTimer = setTimeout(() => { bub.hidden = true; }, 3200);
    }
    if (r.newAbilitySlots?.length || r.ultimate) this.showAbilityUnlock(r);
  }
  /** レベルアップで Lv10 ごとのアビリティが解放された時のお祝い(NEW ABILITY UNLOCKED ♡)*/
  showAbilityUnlock(r) {
    const host = this.trainSheet && !this.app.sheet.root.hidden ? this.app.sheet.body : this.body.querySelector('.td');
    if (!host) return;
    host.querySelector('.ab-burst')?.remove();
    const el = document.createElement('div');
    el.className = 'ab-burst';
    el.innerHTML = `<div class="au-fx" aria-hidden="true">${'<i>♡</i>'.repeat(8)}</div><small>${r.ultimate ? 'ULTIMATE ABILITY UNLOCKED' : 'NEW ABILITY UNLOCKED ♡'}</small><b>${r.newAbilitySlots.map((lv) => `Lv.${lv}`).join(' / ')}${r.ultimate ? ' ULTIMATE' : ''}</b>`;
    host.appendChild(el);
    this.app.audio?.loveMax?.();
    setTimeout(() => el.remove(), 2600);
  }

  // ---------------- コレクション(TAB_ROOT):所持アイテム / 仲間 / 攻略対象 ----------------
  /**
   * 開いた時は「所持アイテム」。戻る(育成 / 攻略対象の画面から)の時は見ていたカテゴリのまま。
   * どのカテゴリも既存の所持データ(inventory / characters / records)をそのまま読む。並び替えは表示順だけ
   */
  showCollection({ tab } = {}, ctx = {}) {
    if (tab && COLLECTION_TABS.some((t) => t.id === tab)) this.collectionTab = tab;
    else if (!ctx.restore) this.collectionTab = 'items';
    const cur = this.collectionTab ?? 'items';
    const keepScroll = ctx.restore || ctx.keepScroll ? this.body.scrollTop : 0;
    this.frame('collection', 'コレクション');
    const view = cur === 'items' ? this.collectionItemsView() : cur === 'ally' ? this.collectionAllyView() : this.collectionHeroineView();
    const sort = currentSort(this.p.data.settings, cur);
    const tabs = `<div class="col-tabs" role="tablist">${COLLECTION_TABS.map((t) => `<button type="button" class="${t.id}${cur === t.id ? ' sel' : ''}" data-tab="${t.id}" role="tab" aria-selected="${cur === t.id}"><span>${t.icon} ${t.label}</span><small>${t.id === cur ? view.count : this.collectionCount(t.id)}</small></button>`).join('')}</div>`;
    const bar = `<div class="col-bar"><p class="col-lead">${view.lead}</p><button type="button" class="col-sort" data-act="sort" aria-label="並び替え(${esc(sortLabel(cur, sort))})"><small>⇅ 並び替え</small><b>${esc(sortLabel(cur, sort))}</b><i aria-hidden="true">${sortArrow(cur, sort)}</i></button></div>`;
    this.body.innerHTML = `<div class="col-head">${tabs}${bar}${view.filters ?? ''}</div>${view.html}`;
    this.body.scrollTop = keepScroll;
    for (const b of this.body.querySelectorAll('.col-tabs [data-tab]')) b.addEventListener('click', () => { if (b.dataset.tab !== this.collectionTab) this.showCollection({ tab: b.dataset.tab }); });
    for (const b of this.body.querySelectorAll('[data-act="sort"]')) b.addEventListener('click', () => this.app.router.go('collectionSort', { cat: cur }));
    view.wire?.();
  }
  /** タブの数字(所持数 / 全体)*/
  collectionCount(tab) {
    if (tab === 'items') return `${this.ownedItems().length}`;
    if (tab === 'ally') return `${this.p.ownedIds.length} / ${CHARACTERS.length}`;
    return `${HEROINES.filter((h) => this.p.isCleared(h.stageId)).length} / ${HEROINES.length}`;
  }
  /** 所持数 1 以上のアイテム(+ 所持数・入手時刻)。定義は ItemCatalog、所持数は PlayerProgress から */
  ownedItems() {
    return collectionItems().map((x) => ({ ...x, count: x.count(this.p), acquiredAt: this.p.acquiredAt(x.key) })).filter((x) => x.count > 0);
  }
  itemIconHTML(x, cls = 'ci-icon') {
    return `<span class="${cls}">${x.image ? `<img src="${esc(x.image)}" alt="" draggable="false">` : `<i>${esc(x.icon)}</i>`}</span>`;
  }
  collectionItemsView() {
    const all = this.ownedItems();
    const cats = ITEM_CATEGORIES.filter((c) => all.some((x) => x.category === c.id));
    if (this.itemFilter && !cats.some((c) => c.id === this.itemFilter)) this.itemFilter = null;
    const f = this.itemFilter;
    const list = sortList(all.filter((x) => !f || x.category === f), 'items', currentSort(this.p.data.settings, 'items'));
    const filters = cats.length > 1 ? `<div class="col-filter" role="group" aria-label="種類で絞り込み">${[{ id: '', label: 'すべて', icon: '' }, ...cats].map((c) => `<button type="button" class="${(f ?? '') === c.id ? 'sel' : ''}" data-filter="${c.id}">${c.icon ? `${c.icon} ` : ''}${esc(c.label)}</button>`).join('')}</div>` : '';
    const tile = (x) => `<button type="button" class="ci-item" data-item="${esc(x.key)}"${x.rank ? ` style="--gk:${x.rank.color}"` : ''} aria-label="${esc(x.name)} ×${x.count}">
        ${this.itemIconHTML(x)}${x.rank ? `<em class="ci-rank">${esc(x.rank.label)}</em>` : ''}<b class="ci-count">×${x.count.toLocaleString()}</b>
        <span class="ci-name">${esc(x.name)}</span><small class="ci-cat">${esc(itemCategory(x.category).label)}</small></button>`;
    return {
      count: `${all.length}`,
      lead: 'タップで詳細',
      filters,
      html: list.length ? `<div class="ci-grid">${list.map(tile).join('')}</div>` : '<div class="col-empty"><i>🎁</i><b>アイテムはまだありません</b><span>ガチャのおまけや攻略のクリア報酬で<br>プレゼントがもらえます</span></div>',
      wire: () => {
        for (const b of this.body.querySelectorAll('[data-filter]')) b.addEventListener('click', () => { this.itemFilter = b.dataset.filter || null; this.showCollection({}, { keepScroll: true, restore: true }); });
        for (const b of this.body.querySelectorAll('[data-item]')) b.addEventListener('click', () => this.app.router.go('collectionItem', { key: b.dataset.item }));
      },
    };
  }
  /** アイテムの詳細(シート):名前・説明・所持数・用途 */
  showItemSheet({ key } = {}) {
    const x = this.ownedItems().find((i) => i.key === key) ?? collectionItems().map((i) => ({ ...i, count: i.count(this.p) })).find((i) => i.key === key);
    if (!x) return;
    const cat = itemCategory(x.category);
    this.app.sheet.open('アイテム', `
      <div class="ci-sheet"${x.rank ? ` style="--gk:${x.rank.color}"` : ''}>
        <div class="cis-top">${this.itemIconHTML(x, 'cis-icon')}
          <div class="cis-main"><div class="cis-tags"><span class="cis-cat">${cat.icon} ${esc(cat.label)}</span>${x.rank ? `<em class="ci-rank">${esc(x.rank.label)}</em>` : ''}</div>
            <h3>${esc(x.name)}</h3><div class="cis-count"><small>所持数</small><b>${x.count.toLocaleString()}</b></div></div></div>
        ${x.desc ? `<p class="cis-desc">${esc(x.desc)}</p>` : ''}
        ${x.usage ? `<section class="cis-sec"><small>用途</small><p>${esc(x.usage)}</p></section>` : ''}
        ${x.source ? `<section class="cis-sec"><small>入手方法</small><p>${esc(x.source)}</p></section>` : ''}
      </div>`);
  }
  collectionAllyView() {
    const ids = this.p.ownedIds;
    const rows = ids.map((id) => {
      const ch = this.p.character(id);
      return { id, name: ch.name, level: ch.level, rankOrder: RANKS[ch.rank]?.order ?? null, atk: (ch.totalStats ?? ch.stats).attack, hp: ch.maxHp, obtainedAt: this.p.data.characters[id]?.obtainedAt ?? null };
    });
    const sort = currentSort(this.p.data.settings, 'ally');
    const list = sortList(rows, 'ally', sort);
    const unowned = CHARACTERS.filter((c) => !this.p.isOwned(c.id));
    const atk = (r) => (sort.key === 'atk' ? `<span class="col-val">ATK <b>${r.atk}</b></span>` : '');
    return {
      count: `${ids.length} / ${CHARACTERS.length}`,
      lead: `${roleTag('ally')} タップで育成`,
      html: `${list.length ? `<div class="tl-grid col-ally">${list.map((r) => this.trainCardHTML(r.id, { extra: atk(r) })).join('')}</div>` : '<div class="col-empty"><i>♡</i><b>仲間はまだいません</b><span>ガチャで出会えます</span></div>'}
        ${unowned.length ? `<header class="col-sub"><b>まだ出会っていない仲間</b><small>${unowned.length}人 ・ ガチャで出会える</small></header>
        <div class="as-grid">${unowned.map((c) => `<div class="as-card unowned rar-frame" data-rank="${c.rank}" ${rarityAttr(c.rank)}>${rarityBadge(c.rank, 'un-rank')}<div class="un-sil" style="background-image:url('${artUrl(c, 'cutout')}')"></div><div class="un-q">？？？</div><div class="un-how">ガチャで出会える</div></div>`).join('')}</div>` : ''}`,
      wire: () => { for (const b of this.body.querySelectorAll('.tl-card[data-id]')) b.addEventListener('click', () => this.app.router.go('trainChar', { id: b.dataset.id })); },
    };
  }
  /** 攻略状況:未攻略 / 攻略中(クリアした難易度の数)/ 完全攻略(全難易度クリア)*/
  heroineState(h) {
    const order = Config.difficultyOrder, n = order.filter((d) => this.p.isCleared(h.stageId, d)).length;
    return { clears: n, total: order.length, id: n === 0 ? 'none' : n >= order.length ? 'complete' : 'progress', label: n === 0 ? '未攻略' : n >= order.length ? '完全攻略 ♡' : `攻略中 ${n} / ${order.length}` };
  }
  collectionHeroineView() {
    const rows = HEROINES.map((h) => { const st = stageById(h.stageId); return { h, st, stageNo: st.no, name: st.boss.name, state: this.heroineState(h), clears: this.heroineState(h).clears }; });
    const list = sortList(rows, 'heroine', currentSort(this.p.data.settings, 'heroine'));
    return {
      count: `${rows.filter((r) => r.clears > 0).length} / ${rows.length}`,
      lead: `${roleTag('heroine')} クリアでボイス解放`,
      html: `<div class="hc-list">${list.map(({ h, st, state }) => `<button type="button" class="hc-card" data-heroine="${h.id}" data-state="${state.id}">
            <span class="hc-art" style="background-image:url('${this.app.bossThumb(st)}');${this.app.bossFocus(st)}"></span>
            <span class="hc-main"><small>STAGE ${st.no}</small><b>${esc(st.boss.name)}</b><em class="hc-state ${state.id}">${esc(state.label)}</em>${clearChips(this.p, st.id, Config.difficultyOrder)}${voiceStatus(this.p, h)}</span>
          </button>`).join('')}</div>`,
      wire: () => { for (const b of this.body.querySelectorAll('[data-heroine]')) b.addEventListener('click', () => this.app.router.go('heroine', { id: b.dataset.heroine })); },
    };
  }
  /** 並び替え(シート):項目を選ぶ。向きのある項目は、選択中のものをもう一度押すと 高い順 ⇄ 低い順 */
  showCollectionSortSheet({ cat } = {}) {
    cat = COLLECTION_SORTS[cat] ? cat : this.collectionTab ?? 'items';
    const render = (first) => {
      const cur = currentSort(this.p.data.settings, cat);
      const html = `
        <p class="cs-now">並び替え:<b>${esc(sortLabel(cat, cur))}</b></p>
        <ul class="cs-list">${COLLECTION_SORTS[cat].options.map((o) => {
          const on = o.key === cur.key;
          const dirs = o.dirs ? `<span class="cs-dirs">${['desc', 'asc'].map((d) => `<i class="${on && cur.dir === d ? 'on' : ''}">${esc(o.dirs[d])}</i>`).join('')}</span>` : '';
          return `<li><button type="button" class="cs-opt${on ? ' sel' : ''}" data-sort="${o.key}" aria-pressed="${on}"><span class="cs-check" aria-hidden="true">${on ? '✓' : ''}</span><b>${esc(o.label)}</b>${dirs}</button></li>`;
        }).join('')}</ul>
        <p class="cs-hint">選択中の項目をもう一度タップすると、順番が逆になります</p>`;
      const body = first ? this.app.sheet.open('並び替え', html) : this.app.sheet.body;
      if (!first) body.innerHTML = html;
      for (const b of body.querySelectorAll('[data-sort]')) b.addEventListener('click', () => {
        const st = this.p.data.settings;
        st.collectionSort = { ...(st.collectionSort ?? {}), [cat]: nextSort(currentSort(st, cat), cat, b.dataset.sort) };
        this.p.save();
        Haptic.light?.();
        if (this.screen === 'collection') this.showCollection({}, { restore: true });
        render(false);
      });
    };
    render(true);
  }

  // ---------------- 攻略対象の画面(SUB):プロフィール + クリア状況 + クリア報酬ボイス ----------------
  showHeroine({ id } = {}) {
    const h = heroineById(id);
    if (!h) { this.app.router.back(); return; }
    this.stopVoice();
    this.heroineId = id;
    const st = stageById(h.stageId);
    const slots = this.p.rewardVoices(id);
    this.frame('heroine', '攻略対象', { back: true });
    // 難易度ごとの枠:NORMAL VOICE / HARD VOICE / HELL ASMR(ASMR の枠だけ特別な見た目)
    const row = (v) => {
      const D = Config.difficulties?.[v.difficulty];
      const state = !v.unlocked ? `🔒 ${esc(rewardLockText(v))}` : !v.src ? '音声準備中' : v.durationSec ? fmtTime(v.durationSec) : 'タップで再生';
      return `<li class="am-row${v.unlocked ? '' : ' locked'}${v.playable ? ' playable' : ''}${v.type === 'asmr' ? ' asmr' : ''}" data-track="${v.difficulty}" style="--dc:${D?.color ?? 'var(--heroine)'}">
        <button type="button" class="am-play" ${v.playable ? '' : 'disabled'} aria-label="${v.playable ? '再生' : '再生できません'}">${!v.unlocked ? '🔒' : v.playable ? '▶' : '…'}</button>
        <div class="am-main"><b><i class="am-kind">${esc(rewardLabel(v))}</i>${v.title ? esc(v.title) : ''}${v.isNew ? ' <em>NEW</em>' : ''}</b><span class="am-state">${state}</span>
          <div class="am-seek" hidden><input type="range" min="0" max="1000" value="0" aria-label="再生位置"><small><span class="am-cur">0:00</span> / <span class="am-dur">${fmtTime(v.durationSec)}</span></small></div></div>
      </li>`;
    };
    this.body.innerHTML = `
      <section class="hr-hero" style="background-image:url('${this.app.bossThumb(st)}');${this.app.bossFocus(st)}">
        <div class="hr-tags">${roleTag('heroine')}</div>
        <div class="hr-name"><small>STAGE ${st.no} ・ ${esc(st.name)}</small><b>${esc(st.boss.name)}</b>${h.cv ? `<span>CV ${esc(h.cv)}</span>` : ''}</div>
      </section>
      <section class="hr-card">
        ${st.concept ? `<p class="hr-concept">${esc(st.concept)}</p>` : ''}
        ${h.collab?.name ? `<p class="hr-collab">コラボ:${esc(h.collab.name)}</p>` : ''}
        <div class="hr-clear"><span>攻略状況</span>${clearChips(this.p, st.id, Config.difficultyOrder)}</div>
        <button type="button" class="r-btn hr-go" data-act="stage">♡ この子を攻略する</button>
      </section>
      <section class="hr-asmr">
        <header><b>🎧 VOICE</b><span>クリアした難易度のボイスが聴けます ・ HELL は ASMR</span></header>
        <ul class="am-list">${slots.map(row).join('')}</ul>
      </section>`;
    this.body.querySelector('[data-act="stage"]').addEventListener('click', () => this.app.deepLink({ screen: 'stage', stageId: st.id }));
    for (const r of this.body.querySelectorAll('.am-row.playable')) r.querySelector('.am-play').addEventListener('click', () => this.toggleVoice(r.dataset.track));
    for (const v of slots) if (v.unlocked) this.p.markVoiceSeen(id, v.id);   // 開いたら NEW は既読
  }
  /** 報酬ボイスの再生 / 一時停止(1つずつ)。シークバーと再生時間 */
  toggleVoice(difficulty) {
    const v = this.p.rewardVoices(this.heroineId).find((x) => x.difficulty === difficulty);
    if (!v?.playable) return;   // 未解放は再生しない
    const row = this.body.querySelector(`.am-row[data-track="${difficulty}"]`);
    if (this.voice?.difficulty === difficulty) {
      if (this.voice.audio.paused) this.voice.audio.play().catch(() => {}); else this.voice.audio.pause();
      return;
    }
    this.stopVoice();
    const audio = new Audio(v.src);
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, this.app.audio?.volumes?.voice ?? 1));   // ボイス音量(iPhone Safari では無視され、端末の音量になる)
    const seek = row.querySelector('.am-seek'), range = seek.querySelector('input'), cur = seek.querySelector('.am-cur'), dur = seek.querySelector('.am-dur'), btn = row.querySelector('.am-play');
    seek.hidden = false; row.classList.add('on');
    const sync = () => { const d = audio.duration; if (Number.isFinite(d) && d > 0) { range.value = String(Math.round((audio.currentTime / d) * 1000)); dur.textContent = fmtTime(d); } cur.textContent = fmtTime(audio.currentTime); btn.textContent = audio.paused ? '▶' : '⏸'; };
    for (const ev of ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended']) audio.addEventListener(ev, sync);
    // ボイス / ASMR を聴いている間は共通 BGM を一時停止(止めた位置から再開)
    audio.addEventListener('play', () => this.app.audio?.bgm?.hold?.('rewardVoice'));
    for (const ev of ['pause', 'ended', 'error']) audio.addEventListener(ev, () => this.app.audio?.bgm?.release?.('rewardVoice'));
    range.addEventListener('input', () => { const d = audio.duration; if (Number.isFinite(d)) audio.currentTime = (Number(range.value) / 1000) * d; });
    this.voice = { difficulty, audio, row };
    audio.play().catch(() => {});
  }
  stopVoice() {
    if (!this.voice) return;
    this.voice.audio.pause(); this.voice.audio.src = '';
    this.app.audio?.bgm?.release?.('rewardVoice');
    this.voice.row?.classList.remove('on');
    this.voice = null;
  }

  // ---------------- ミッション(SUB)----------------
  showMission() {
    this.frame('mission', 'ミッション', { back: true });
    const ms = this.rewards.missions;
    this.body.innerHTML = ms.length ? `<ul class="as-list">${ms.map((m) => `
      <li class="as-row${m.claimed ? ' done' : ''}">
        <div class="r-main"><b>${esc(m.label)}</b><span>${m.value} / ${m.goal}　報酬 ◆${m.reward.heartGem ?? 0}</span><i class="r-bar"><i style="transform:scaleX(${m.goal ? m.value / m.goal : 0})"></i></i></div>
        <button type="button" class="r-btn" data-claim="${m.id}" ${m.done && !m.claimed ? '' : 'disabled'}>${m.claimed ? '受取済' : '受け取る'}</button>
      </li>`).join('')}</ul><p class="as-note">※ ミッションと報酬は Prototype の仮データです</p>` : '<div class="as-empty">いまはミッションがありません</div>';
    for (const b of this.body.querySelectorAll('[data-claim]')) b.addEventListener('click', () => {
      const gem = this.rewards.claimMission(b.dataset.claim);
      if (gem) { Haptic.light(); this.app.toast(`HEART GEM +${gem}`); this.app.game?.audio?.orb?.(3); }
      this.showMission();
    });
  }

  // ---------------- プレゼント(SUB)----------------
  showPresent() {
    this.frame('present', 'プレゼント', { back: true });
    const ps = this.rewards.presents;
    const fmt = (t) => { const h = Math.max(0, Math.round((t - Date.now()) / 3600e3)); return h >= 48 ? `あと${Math.round(h / 24)}日` : `あと${h}時間`; };
    this.body.innerHTML = ps.length ? `<ul class="as-list">${ps.map((x) => `
      <li class="as-row">
        <div class="r-main"><b>${esc(x.label ?? 'プレゼント')}</b><span>◆${x.reward?.heartGem ?? 0}${x.expiresAt ? `　<em class="${this.rewards.expiringSoon(x) ? 'soon' : ''}">⏱ ${fmt(x.expiresAt)}</em>` : ''}</span></div>
        <button type="button" class="r-btn" data-claim="${x.id}">受け取る</button>
      </li>`).join('')}</ul>` : '<div class="as-empty">プレゼントはありません</div>';
    for (const b of this.body.querySelectorAll('[data-claim]')) b.addEventListener('click', () => {
      const gem = this.rewards.claimPresent(b.dataset.claim);
      if (gem) { Haptic.light(); this.app.toast(`HEART GEM +${gem}`); }
      this.showPresent();
    });
  }

  // ---------------- 設定(SUB)----------------
  showSettings() {
    this.frame('settings', '設定', { back: true });
    const st = this.p.data.settings;
    const row = (key, label, on) => `<li class="as-row"><div class="r-main"><b>${label}</b></div><button type="button" class="r-tgl${on ? ' on' : ''}" data-tgl="${key}" aria-pressed="${on}">${on ? 'ON' : 'OFF'}</button></li>`;
    this.body.innerHTML = `
      <ul class="as-list">
        <li class="as-row"><div class="r-main"><b>プレイヤー名</b><span>${esc(this.p.data.player.name)}</span></div><button type="button" class="r-btn ghost" data-act="name">変更</button></li>
        <li class="as-row snd-row"><div class="r-main"><b>BGM</b><span>メニューとバトルで流れる音楽</span>
          <div class="snd-ctl"><input type="range" min="0" max="100" step="1" value="${Math.round((st.audio?.bgmVolume ?? 0.5) * 100)}" data-vol="bgm" aria-label="BGM 音量"${st.audio?.bgmMuted ? ' disabled' : ''}><output>${st.audio?.bgmMuted ? 'ミュート' : `${Math.round((st.audio?.bgmVolume ?? 0.5) * 100)}%`}</output></div></div>
          <button type="button" class="r-tgl${st.audio?.bgmMuted ? '' : ' on'}" data-mute="bgm" aria-pressed="${!st.audio?.bgmMuted}">${st.audio?.bgmMuted ? 'OFF' : 'ON'}</button></li>
        ${row('haptic', '振動(対応端末のみ)', st.haptic)}
        <li class="as-row"><div class="r-main"><b>ガチャ演出</b><span>FULL:すべて / FAST:短く(山場は残す)/ SKIP:初めての SSR だけ</span></div><button type="button" class="r-btn ghost" data-act="speed">${st.gachaPlaybackMode}</button></li>
      </ul>
      <div class="as-ver">${Config.app.title} ${Config.app.version}</div>`;
    for (const b of this.body.querySelectorAll('[data-tgl]')) b.addEventListener('click', () => { st[b.dataset.tgl] = !st[b.dataset.tgl]; this.p.save(); this.app.applySettings(); this.showSettings(); });
    // BGM 音量:動かしている間は即反映、離したら保存 / ミュート ON・OFF(旧設定 bgm とも同期)
    const vol = this.body.querySelector('[data-vol="bgm"]');
    vol?.addEventListener('input', () => { st.audio.bgmVolume = Number(vol.value) / 100; vol.nextElementSibling.textContent = `${vol.value}%`; this.app.applySettings(); });
    vol?.addEventListener('change', () => this.p.save());
    this.body.querySelector('[data-mute="bgm"]')?.addEventListener('click', () => { st.audio.bgmMuted = !st.audio.bgmMuted; st.bgm = !st.audio.bgmMuted; this.p.save(); this.app.applySettings(); this.showSettings(); });
    this.body.querySelector('[data-act="speed"]').addEventListener('click', () => {
      const order = ['FULL', 'FAST', 'SKIP_TO_NEW'];
      st.gachaPlaybackMode = order[(order.indexOf(st.gachaPlaybackMode) + 1) % order.length];
      this.p.save(); this.showSettings();
    });
    this.body.querySelector('[data-act="name"]').addEventListener('click', () => {
      const v = window.prompt('プレイヤー名(12文字まで)', this.p.data.player.name);
      if (v && v.trim()) { this.p.data.player.name = v.trim().slice(0, 12); this.p.save(); this.showSettings(); }
    });
  }
}
