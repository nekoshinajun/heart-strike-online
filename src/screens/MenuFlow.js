import { STAGES, CHARACTERS, ATTRIBUTES, RANKS } from '../data/GameData.js';
import { attributeRelation } from '../data/BattleCalc.js';
import { portraitStyle } from '../data/CharacterArt.js';
import { Config, difficultyData } from '../core/Config.js';
import { devInput, storage, Haptic } from '../app/Platform.js';
import { artUrl } from '../data/CharacterArt.js';
import { CAPTURE_SUPPORT_ITEMS, heroineByStage, heroineById, giftById, giftIcon, giftName } from '../data/RomanceData.js';
import { STAT_LABELS } from '../data/GrowthData.js';
import { roleTag, rewardLabel } from '../app/Roles.js';
import { rarityAttr, rarityBadge, raritySparkle, charAccent } from '../app/Rarity.js';
import { shopOfStage, castsOf } from '../data/ShopData.js';
import { showShopMap, showShop, capTop, castArt, castArtData, faceCrop, castLine } from './CaptureScreens.js';

const LONG_PRESS_MS = 450;   // 長押し判定(スマホ基準 0.4〜0.5秒)
const LONG_PRESS_MOVE = 10;  // これ以上指が動いたら長押しをやめる(スクロールを邪魔しない)

/**
 * ゲーム外の画面フロー(DOMオーバーレイ)。
 *   (HOME →) STAGE SELECT → DIFFICULTY SELECT → PARTY確認 → CHARACTER SELECT → GAME → RESULT(もう一度 / ステージ選択 / HOME)
 * 画面の移動は ScreenRouter(g.app.router)経由。製品はタッチ操作のみ(キーボードは DevInput = 開発用)。
 *
 * ゲーム本体とは g.startStage(stage, orderedParty) / g.backToMenu() だけでつながる。
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** セリフを句読点のところでだけ改行する(単語の途中で折り返さない)*/
const phrase = (s) => esc(s).replace(/([、。！？!?…]+\s*)/g, '$1<wbr>');
const SLOT_IDS = ['A', 'B', 'C', 'D'];

/** 難易度の小さなバッジ */
export function diffChip(id, cls = '') {
  const D = difficultyData(id);
  return `<span class="dchip ${cls}" data-d="${D.id}" style="--dc:${D.color}">${D.label}</span>`;
}

function attrTag(id) {
  const a = ATTRIBUTES[id];
  return `<span class="attr" style="--ac:${a.color}">${a.icon} ${a.label}</span>`;
}

/** STAMINA の小さな表示(0 は「疲労中 EXP×10%」。出撃はできる)*/
export function staminaHTML(ch, cls = '') {
  if (ch.staminaMax == null || ch.remote) return '';
  const k = Math.max(0, Math.min(1, ch.stamina / ch.staminaMax));
  return `<span class="stam ${ch.tired ? 'tired' : ''} ${cls}" title="STAMINA ${ch.stamina} / ${ch.staminaMax}"><i style="--k:${k}"></i><b>${ch.tired ? '疲労中 EXP×10%' : `STA ${ch.stamina}`}</b></span>`;
}

/** キャラクターカード(ランク・画像・名前・属性・親密度 Lv・HP・ATTACK・DEFENCE・STAMINA)。mini はランク・画像・名前だけ */
export function cardHTML(ch, { slot = '', badge = '', compact = false, mini = false } = {}) {
  const a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank];
  const ps = portraitStyle(ch);
  const img = ps
    ? `<div class="avatar" style="${ps}"><i>${a.icon}</i></div>`
    : `<div class="avatar ph" style="--ac:${a.color}"><span>${esc(ch.name[0])}</span><i>${a.icon}</i></div>`;
  void r;
  return `<div class="ccard rar-frame${compact ? ' compact' : ''}${mini ? ' mini' : ''}" ${rarityAttr(ch.rank)} style="--ac:${a.color}">
    ${rarityBadge(ch.rank, 'crank')}${raritySparkle(ch.rank)}${charAccent(ch)}${slot ? `<div class="cslot">${slot}</div>` : ''}${badge}
    ${img}
    <div class="cname">${esc(ch.name)}</div>
    ${mini ? '' : `<div class="cmeta"><span title="${a.label}">${a.icon}</span><span>${a.label}</span></div>
    <div class="cstat cstat-lv"><span>♡Lv.${ch.level}</span><span class="chp">HP ${ch.maxHp ?? '-'}</span></div>
    <div class="cstat"><span>ATK ${(ch.totalStats ?? ch.stats)?.attack ?? '-'}</span><span>DEF ${(ch.totalStats ?? ch.stats)?.defence ?? '-'}</span></div>
    ${staminaHTML(ch)}`}
  </div>`;
}

export class MenuFlow {
  constructor(g, progress) {
    this.g = g;
    this.progress = progress;
    this.el = document.getElementById('menu');
    this.body = document.getElementById('menuBody');
    this.titleEl = document.getElementById('menuTitle');
    this.stepEl = document.getElementById('menuStep');
    this.primary = document.getElementById('menuPrimary');
    this.back = document.getElementById('menuBack');
    this.homeBtn = document.getElementById('menuHome');
    this.partyMode = 'sortie';
    this.stage = STAGES[0];
    this.firstId = null;
    this.selectedSlot = 0;
    this.diff = 'NORMAL';
    this.playMode = 'solo';

    // メニュー上の操作はゲーム入力(投球・タップ)へ流さない
    for (const ev of ['pointerdown', 'pointerup']) this.el.addEventListener(ev, (e) => e.stopPropagation());
    this.el.addEventListener('pointerdown', () => { this.kbNav = false; }, true);
    // リストがスクロールしたら長押しをやめる
    this.body.addEventListener('scroll', () => this.lpCancel?.(), { passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) this.kbNav = true; }, true);
    this.primary.addEventListener('click', () => this.onPrimary());
    this.back.addEventListener('click', () => this.onBack());
    this.homeBtn.addEventListener('click', () => this.onHome());
    // DevInput(開発用):Enter / Space = 主ボタン、Esc = BACK、矢印 = 難易度。製品の操作はタッチのみ
    document.addEventListener('keydown', (e) => {
      if (!devInput() || this.el.hidden || e.repeat) return;
      if (this.detail.isOpen) { e.stopPropagation(); this.detail.onKey(e); return; }
      if (this.confirmEl) {   // HELL 確認:Enter = CHALLENGE / Esc = CANCEL
        e.stopPropagation();
        if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); this.confirmEl.querySelector(document.activeElement?.dataset.cf ? `[data-cf="${document.activeElement.dataset.cf}"]` : '[data-cf="go"]').click(); }
        else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); this.closeConfirm(); }
        else if (e.key.startsWith('Arrow') || e.key === 'Tab') { e.preventDefault(); const o = document.activeElement?.dataset.cf === 'go' ? 'no' : 'go'; this.confirmEl.querySelector(`[data-cf="${o}"]`).focus(); }
        return;
      }
      if (this.screen === 'cast' && e.key.startsWith('Arrow')) {
        e.preventDefault(); e.stopPropagation();
        const order = Config.difficultyOrder, i = order.indexOf(this.diff);
        const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
        const next = order[(i + d + order.length) % order.length];
        if (this.diffUnlocked(this.stage.id, next)) this.selectDiff(next);
        return;
      }
      if (e.key === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        e.preventDefault(); e.stopPropagation();
        this.onEnter();
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        if (!this.back.hidden) { e.preventDefault(); this.onBack(); }
      }
    }, true);
  }

  get visible() { return !this.el.hidden; }
  get detail() { return this.g.app.detail; }
  get router() { return this.g.app.router; }

  hide() { this.el.hidden = true; this.g.container.classList.remove('menuopen'); }

  frame(screen, title, step, { primary, back, diff, home } = {}) {
    this.screen = screen;
    if (screen !== 'shopmap') this.city?.stop();   // コンカフェ街マップのアニメーションは表示中だけ
    this.el.hidden = false;
    this.g.container.classList.add('menuopen');
    this.el.dataset.screen = screen;
    this.titleEl.textContent = title;
    if (diff) this.titleEl.insertAdjacentHTML('beforeend', ` ${diffChip(diff, 'intitle')}`);
    this.el.dataset.diff = '';
    this.stepEl.textContent = step;
    this.primary.textContent = primary ?? '';
    this.primary.hidden = !primary;
    this.back.textContent = back ?? '';
    this.back.hidden = !back;
    this.homeBtn.hidden = !home;
    this.body.scrollTop = 0;
  }

  /** DevInput 用のフォーカス(タッチ操作の挙動は変えない)*/
  focus(el) {
    if (!devInput()) return;
    try { (el ?? this.primary).focus({ preventScroll: true }); } catch { /* noop */ }
  }

  onEnter() {
    const a = document.activeElement;
    // フォーカス中のカード(Tab移動した場合)はそれを押したことにする
    // Tab キーで移動してきたカードだけ「押したこと」にする(マウス / タッチで触ったカードに Enter を取られない)
    if (a && this.kbNav && this.el.contains(a) && a !== this.primary && a !== this.back && a.dataset.act && a.dataset.act !== 'diff') { a.click(); return; }
    if (this.screen === 'cast') return this.startStage();
    this.onPrimary();
  }

  onPrimary() {
    switch (this.screen) {
      case 'cast': return this.startStage();
      case 'party': return this.partyMode === 'sortie' ? this.router.go('chars') : null;
      case 'chars': return this.startGame();   // 攻略開始:すぐインゲームへ(ボス紹介はインゲームの開始演出)
      case 'result': return this.g.backToMenu();          // ステージ選択
      case 'over': return this.g.online ? this.g.backToMenu() : this.g.retryStage(); // Online は再戦しない
    }
  }

  onBack() {
    switch (this.screen) {
      case 'party': case 'chars': return this.router.back();
      case 'result': return this.g.retryStage();          // もう一度
      case 'over': return this.g.backToMenu();            // ステージ選択
    }
  }

  /** RESULT / TRY AGAIN → HOME(推しがクリア後の一言 = afterClear。Guidance は次に HOME を開いた時)*/
  onHome() {
    if (this.screen === 'result') this.g.app.home.queueTrigger('afterClear');
    this.g.backToMenu('home');
  }

  // ---------------- STAGE SELECT(攻略)----------------
  /**
   * 攻略画面:攻略対象の女の子が主役。SOLO / MULTI → ステージ → 難易度 → 挑戦する(難易度はこの画面で選んでインゲームへ渡す)
   *   難易度の解放:NORMAL は最初から / NORMAL クリアで HARD / HARD クリアで HELL(progress.isDifficultyUnlocked)
   * @param stageId    Deep Link で選択状態にするステージ
   * @param difficulty Deep Link の推奨難易度(解放済みなら選択状態にするだけ。決定は必ずプレイヤー)
   */
  showStageSelect({ stageId, difficulty } = {}) {
    if (stageId) this.stage = STAGES.find((s) => s.id === stageId) ?? this.stage;
    const selected = this.stage ?? STAGES[0];
    if (stageId || difficulty) this.diff = difficulty ?? 'NORMAL';   // キャストを選び直したら NORMAL から
    if (!this.diffUnlocked(selected.id, this.diff)) this.diff = 'NORMAL';
    this.recommended = difficulty ?? null;
    this.frame('cast', '攻略', '今日は、誰に会いに行く？');
    const heroine = heroineByStage(selected.id);
    const shop = shopOfStage(selected.id);
    this.shopSel = shop?.id ?? this.shopSel;
    const bossArt = castArt;
    const order = Config.difficultyOrder;
    // ステージの状態:CLEAR(どれかの難易度でクリア)/ NEW(まだ一度もクリアしていない)/ LOCK(未公開の枠)
    const status = (s) => (this.progress.isCleared(s.id) ? '<em class="st clear">CLEAR</em>' : '<em class="st new">NEW</em>');
    // 下のキャスト一覧:同じお店のキャスト(+ 近日登場の枠)
    const mates = shop ? castsOf(shop).map((c) => c.stage) : STAGES;
    const soon = Array.from({ length: shop?.soonSlots ?? 0 }, (_, k) => mates.length + k + 1);
    const diffRow = (id) => {
      const D = difficultyData(id), open = this.diffUnlocked(selected.id, id), clear = this.progress.isCleared(selected.id, id);
      // 状態の文言:狭い画面では .long を隠してアイコンだけ(🔒 / ✓)
      const state = !open ? '未解放' : clear ? 'クリア済' : id === this.recommended ? 'おすすめ' : '未クリア';
      return `<button type="button" class="diffcard${clear ? ' clear' : ''}${open ? '' : ' locked'}" data-act="diff" data-id="${id}" style="--dc:${D.color}" aria-disabled="${!open}" aria-pressed="false">
        <b>${D.label}${clear ? ' ✓' : open ? '' : ' 🔒'}</b><small>${state}</small></button>`;
    };
    const voices = heroine ? this.progress.rewardVoices(heroine.id) : [];
    const voiceRow = voices.some((v) => v.voice)
      ? `<div class="sg-voice"><span>🎧<span class="long"> ボイス</span></span>${voices.map((v) => `<i class="${v.unlocked ? 'on' : ''}" style="--dc:${difficultyData(v.difficulty).color}" title="${esc(rewardLabel(v))}">${v.type === 'asmr' ? 'ASMR' : difficultyData(v.difficulty).label[0]}</i>`).join('')}<em>${voices.filter((v) => v.unlocked).length} / ${voices.length}</em></div>`
      : '<div class="sg-voice"><span>🎧 ボイス準備中</span></div>';
    // 攻略補助アイテム(持ち込み)は未実装。データ(RomanceData.CAPTURE_SUPPORT_ITEMS)が入った時だけ欄を出す
    const support = CAPTURE_SUPPORT_ITEMS.length ? `<section class="support-panel"><header><b>攻略アイテム</b></header><div class="gift-list">${CAPTURE_SUPPORT_ITEMS.map((g) => `<button type="button" class="gift-item" data-support="${esc(g.id)}"><i>${esc(g.icon ?? '')}</i><span>${esc(g.name)}</span></button>`).join('')}</div></section>` : '';
    this.body.innerHTML = `
      <div class="sg" style="--boss:url('${bossArt(selected)}')">
        <div class="sg-bg"></div>
        <img class="sg-art" src="${bossArt(selected)}" alt="${esc(selected.boss.name)}" style="--ax:${castArtData(selected).stage.x * 100}%;--ah:${castArtData(selected).stage.h}">
        <div class="sg-fx" aria-hidden="true"><i></i><i></i><i></i></div>
        ${capTop(true)}
        <div class="sg-modes" role="tablist">
          <button type="button" role="tab" data-mode="solo"><b>ソロプレイ</b><small>SOLO PLAY</small></button>
          <button type="button" role="tab" data-mode="multi"><b>マルチプレイ</b><small>MULTI PLAY ・ 2–4人</small></button>
        </div>
        <header class="sg-head"><h1>攻略<em class="script">Story</em></h1><p>今日は、誰に会いに行く？<i>♡</i></p></header>
        <section class="sg-card">
          <header>${roleTag('heroine', 'sm')}<small>STAGE ${String(selected.no).padStart(2, '0')}</small></header>
          <h2>${esc(selected.boss.name)}${heroine?.roman ? `<em class="script">${esc(heroine.roman)}</em>` : ''}</h2>
          ${heroine?.cv ? `<span class="cv">CV ${esc(heroine.cv)}</span>` : ''}
          ${selected.name ? `<span class="sg-title">${esc(selected.name)}</span>` : ''}
          <p class="sg-line">${phrase(`「${castLine(heroine, selected)}」`)}</p>
          <div class="sg-diff"><small>難易度選択</small>${order.map(diffRow).join('')}</div>
          ${voiceRow}
          <p class="sg-note" hidden></p>
        </section>
        <button type="button" class="capture-start sg-start" data-act="start"><span class="h">♡</span><span class="t"><b>挑戦する</b><small>START</small></span><em class="sub"></em></button>
        <div class="sg-strip cast-strip">${mates.map((s) => `<button type="button" class="cast-tab face-crop${s === selected ? ' sel' : ''}" data-act="stage" data-id="${s.id}">${faceCrop(s)}<i>${String(s.no).padStart(2, '0')}</i><span>${esc(s.boss.name)}</span>${status(s)}</button>`).join('')}${soon.map((no) => `<button type="button" class="cast-tab locked" disabled><i>${String(no).padStart(2, '0')}</i><b class="lk" aria-hidden="true"></b><span>???</span><em class="st lock">LOCK</em></button>`).join('')}</div>
        ${support}
      </div>`;
    for (const b of this.body.querySelectorAll('[data-mode]')) b.addEventListener('click', () => this.setPlayMode(b.dataset.mode));
    for (const b of this.body.querySelectorAll('[data-act="stage"]')) b.addEventListener('click', () => { const st = STAGES.find((s) => s.id === b.dataset.id); if (!st || st === this.stage) return; this.g.audio?.tick?.(); this.router.go('cast', { stageId: st.id }); });
    this.body.querySelector('[data-act="back"]')?.addEventListener('click', () => this.router.back());
    for (const b of this.body.querySelectorAll('[data-act="diff"]')) b.addEventListener('click', () => this.selectDiff(b.dataset.id));
    this.body.querySelector('[data-act="start"]')?.addEventListener('click', () => this.startStage());
    this.setPlayMode(this.playMode, { quiet: true });
    this.selectDiff(this.diff, { quiet: true });
    // 選んだキャストを一覧の中央へ(scrollIntoView は画面全体まで動かすので、一覧だけをスクロール)
    const strip = this.body.querySelector('.sg-strip'), tab = strip?.querySelector('.cast-tab.sel');
    if (strip && tab) strip.scrollLeft = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    this.focus(this.body.querySelector('.sg-start'));
  }

  /** ① コンカフェ街マップ(お店を選ぶ)/ ② お店の中(キャスト一覧)。中身は CaptureScreens.js */
  showShopMap(p) { showShopMap(this, p); }
  showShop(p) { showShop(this, p); }

  /** 難易度の解放(NORMAL は最初から / ひとつ下の難易度をクリアで解放。上の難易度をクリア済みなら解放扱い)*/
  diffUnlocked(stageId, id) { return this.progress.isDifficultyUnlocked(stageId, id, Config.difficultyOrder); }

  setPlayMode(mode, { quiet = false } = {}) {
    this.playMode = mode === 'multi' ? 'multi' : 'solo';
    for (const x of this.body.querySelectorAll('[data-mode]')) { const on = x.dataset.mode === this.playMode; x.classList.toggle('sel', on); x.setAttribute('aria-selected', on); }
    this.syncStart();
    if (!quiet) this.g.audio?.tick?.();
  }

  /** 難易度を選ぶ(まだ解放されていない難易度は選べない。理由をカードに出す)*/
  selectDiff(id, { quiet = false } = {}) {
    const D = difficultyData(id), note = this.body.querySelector('.sg-note');
    if (this.screen === 'cast' && !this.diffUnlocked(this.stage.id, D.id)) {
      if (note) { const prev = Config.difficultyOrder[Config.difficultyOrder.indexOf(D.id) - 1]; note.textContent = `${difficultyData(prev).label} をクリアすると ${D.label} が解放されます`; note.hidden = false; }
      const b = this.body.querySelector(`.diffcard[data-id="${D.id}"]`);
      b?.classList.remove('deny'); void b?.offsetWidth; b?.classList.add('deny');
      return;
    }
    if (note) note.hidden = true;
    this.diff = D.id;
    this.el.dataset.diff = D.id;
    for (const x of this.body.querySelectorAll('.diffcard')) { const on = x.dataset.id === D.id; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on); }
    this.syncStart();
    if (!quiet && this.el.dataset.lastDiff !== D.id) { this.el.dataset.lastDiff = D.id; this.g.audio?.tick?.(); }
  }

  /** 挑戦するボタンの下に「いま選んでいる難易度 ・ SOLO / MULTI」*/
  syncStart() {
    const sub = this.body.querySelector('.sg-start .sub');
    if (!sub) return;
    const D = difficultyData(this.diff);
    sub.innerHTML = `<i style="--dc:${D.color}">${D.label}</i> ・ ${this.playMode === 'multi' ? 'MULTI' : 'SOLO'}`;
  }

  /** Deep Link など:ステージ(と推奨難易度)を選択状態で攻略画面を開く。決定は必ずプレイヤー */
  pickStage(stage, { recommend = null } = {}) {
    this.stage = stage;
    this.showStageSelect({ stageId: stage.id, difficulty: recommend ?? 'NORMAL' });
  }

  /** 挑戦する:選んだ難易度をインゲームへ渡す。HELL は初回だけ確認 → SOLO はデートメンバー / MULTI はロビー */
  startStage() {
    const D = difficultyData(this.diff);
    if (!this.diffUnlocked(this.stage.id, D.id)) return this.selectDiff(D.id);
    if (D.id === 'HELL' && !this.progress.flag('hellConfirmed')) return this.openConfirm();
    this.g.setDifficulty(D.id);
    this.g.prepareStage(this.stage);
    if (this.playMode === 'multi') {
      window.__online?.openLobby?.(this.stage, D.id);
      return;
    }
    this.router.go('party');
  }

  openConfirm() {
    this.closeConfirm();
    const el = document.createElement('div');
    el.className = 'hellconfirm';
    el.innerHTML = `<div class="hcbox" role="dialog" aria-modal="true">
      <div class="hctitle">HELL</div>
      <div class="hctext">最高難易度です。<br>それでも挑戦しますか？</div>
      <div class="hcbtns"><button type="button" data-cf="no">CANCEL</button><button type="button" data-cf="go" class="go">CHALLENGE</button></div>
    </div>`;
    for (const ev of ['pointerdown', 'pointerup']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.querySelector('[data-cf="no"]').addEventListener('click', () => this.closeConfirm());
    el.querySelector('[data-cf="go"]').addEventListener('click', () => { this.closeConfirm(); this.progress.setFlag('hellConfirmed'); this.startStage(); });
    this.el.appendChild(el);
    this.confirmEl = el;
    this.focus(el.querySelector('[data-cf="go"]'));
  }

  closeConfirm() {
    if (!this.confirmEl) return;
    this.confirmEl.remove();
    this.confirmEl = null;
    if (this.screen === 'cast') this.focus(this.body.querySelector('.sg-start'));
  }
  get selectedDifficulty() { return this.diff; }

  // ---------------- PARTY EDIT ----------------
  /**
   * PARTY EDIT(同じ Party データを2つのモードで使う)
   *   standalone … 攻略画面の「編成」ボタンから(SUB)。NEXT なし・BACK で攻略へ
   *   sortie     … 難易度の後の出撃フロー(PARTY確認)。NEXT → CHARACTER SELECT
   * 表示するのは所持キャラだけ
   */
  showPartyEdit({ mode } = {}) {
    if (mode) this.partyMode = mode;
    const sortie = this.partyMode === 'sortie';
    const keepScroll = this.screen === 'party' ? this.body.scrollTop : 0;
    if (sortie) this.frame('party', 'デートメンバー', `STAGE ${this.stage.no}:${this.stage.boss.name} に会いに行く4人`, { primary: 'NEXT ▶', back: '◀ BACK', diff: this.diff });
    else this.frame('party', 'デートメンバー編成', '仲間から4人を選ぼう(A が最初に投げます)', { back: '◀ BACK' });
    this.el.dataset.mode = this.partyMode;
    const party = this.progress.party;
    const boss = this.stage.boss.attribute;
    const rel = (ch) => {
      const r = attributeRelation(ch.attribute, boss);
      return r === 'advantage' ? '<div class="cbadge good">有利</div>' : r === 'disadvantage' ? '<div class="cbadge bad">不利</div>' : '';
    };
    this.body.innerHTML = `
      <div class="slots">${party.map((id, i) => `<button type="button" class="slot${i === this.selectedSlot ? ' sel' : ''}" data-act="slot" data-i="${i}">
        ${cardHTML(this.progress.character(id), { slot: SLOT_IDS[i], badge: rel(this.progress.character(id)), compact: true })}</button>`).join('')}</div>
      <div class="menuhint">枠を選んで → 下のキャラをタップで入れ替え(同じキャラは1人まで)</div>
      ${this.showLongPressHint() ? '<div class="lphint">👆 キャラクターを長押しすると詳細を確認できます</div>' : ''}
      <div class="owned">${CHARACTERS.filter((c) => this.progress.isOwned(c.id)).map((c) => {
        const ch = this.progress.character(c.id);
        const at = party.indexOf(c.id);
        return `<button type="button" class="own${at >= 0 ? ' inparty' : ''}" data-act="own" data-id="${c.id}">
          ${cardHTML(ch, { slot: at >= 0 ? SLOT_IDS[at] : '', badge: rel(ch) })}</button>`;
      }).join('')}</div>`;
    for (const b of this.body.querySelectorAll('[data-act="slot"]')) this.bindCard(b, this.progress.party[+b.dataset.i], () => { this.selectedSlot = +b.dataset.i; this.showPartyEdit({ mode: this.partyMode }); });
    for (const b of this.body.querySelectorAll('[data-act="own"]')) this.bindCard(b, b.dataset.id, () => this.assign(b.dataset.id));
    this.body.scrollTop = keepScroll;
    this.focus();
  }

  /**
   * キャラクターカード:通常タップ = これまで通り(編成 / 選択)、長押し = CHARACTER DETAIL。
   * 長押しが成立したらその後の click は捨てる(両方は発火しない)。指が動いたら長押しをやめる
   */
  bindCard(el, charaId, onTap) {
    let timer = null, start = null;
    const cancel = () => { clearTimeout(timer); timer = null; start = null; el.classList.remove('lp-hold'); };
    const moved = (x, y) => { if (start && timer && Math.hypot(x - start.x, y - start.y) > LONG_PRESS_MOVE) { cancel(); el.dataset.lp = 'moved'; } };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      cancel();
      delete el.dataset.lp;
      start = { x: e.clientX, y: e.clientY };
      this.lpCancel = () => { if (timer) { cancel(); el.dataset.lp = 'moved'; } };
      el.classList.add('lp-hold');
      timer = setTimeout(() => {
        timer = null;
        el.dataset.lp = '1';           // この後の click を無視する
        el.classList.remove('lp-hold');
        el.classList.add('lp-fire');   // 少し縮む
        Haptic.light();
        this.g.audio?.grab?.();
        setTimeout(() => { el.classList.remove('lp-fire'); this.router.go('detail', { id: charaId }); }, 140);
      }, LONG_PRESS_MS);
    });
    // 指(マウス)が大きく動いた = スクロール等。長押しも通常タップも起こさない
    el.addEventListener('pointermove', (e) => moved(e.clientX, e.clientY));
    // タッチでスクロールが始まると pointermove が来ない端末もあるので touchmove でも見る
    el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) moved(t.clientX, t.clientY); }, { passive: true });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { if (timer) cancel(); else el.classList.remove('lp-hold'); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      // 長押し / ドラッグ直後のポインター由来の click だけ捨てる(Enter キー等の click は e.detail === 0 なので通す)
      const skip = el.dataset.lp && e.detail !== 0;
      delete el.dataset.lp;
      if (skip) { e.preventDefault(); return; }
      onTap();
    });
  }

  /** 「長押しで詳細」のヒントは、まだ一度も詳細を開いていない間だけ(最大3回)表示 */
  showLongPressHint() {
    const v = storage.get('squash-titan-hint-longpress');
    if (v === 'used') return false;
    const n = Number(v) || 0;
    if (n >= 3) return false;
    if (this.hintShownThisVisit !== this.stage) { storage.set('squash-titan-hint-longpress', String(n + 1)); this.hintShownThisVisit = this.stage; }
    return true;
  }

  /** キャラを選択中の枠へ。既に別の枠にいる場合は入れ替え(重複しない) */
  assign(id) {
    const party = [...this.progress.party];
    const slot = this.selectedSlot;
    const at = party.indexOf(id);
    if (at === slot) return;
    if (at >= 0) [party[at], party[slot]] = [party[slot], party[at]];
    else party[slot] = id;
    this.progress.setParty(party);
    if (this.firstId && !party.includes(this.firstId)) this.firstId = null;
    this.selectedSlot = (slot + 1) % 4;
    this.showPartyEdit({ mode: this.partyMode });
  }

  // ---------------- CHARACTER SELECT ----------------
  showCharacterSelect() {
    const party = this.progress.party;
    if (!this.firstId || !party.includes(this.firstId)) this.firstId = party[0];
    this.frame('chars', '最初に投げる子', '最初にハートを投げる子を選んでね(A になります)', { primary: '攻略開始♡', back: '◀ BACK' });
    const stageLine = `<div class="stageline">STAGE ${String(this.stage.no).padStart(2, '0')} / ♡ ${esc(this.stage.boss.name)} / ${diffChip(this.diff)}</div>`;
    const order = this.order();
    this.body.innerHTML = `${stageLine}
      <div class="firstpick">${party.map((id) => {
        const ch = this.progress.character(id);
        const idx = order.indexOf(id);
        return `<button type="button" class="pick${id === this.firstId ? ' sel' : ''}" data-act="first" data-id="${id}">
          ${cardHTML(ch, { slot: SLOT_IDS[idx] })}${id === this.firstId ? '<div class="firsttag">FIRST</div>' : ''}</button>`;
      }).join('')}</div>
      <div class="vsbox">VS ♡ ${esc(this.stage.boss.name)} ${attrTag(this.stage.boss.attribute)}</div>
      <div class="howto mini">
        <div><b>THROW</b>ハート玉を下へ引いて球速を決める(浅い=よく曲がる・深い=まっすぐ)→上へ弾いて狙う。切り返すとカーブ</div>
        <div><b>CATCH</b>◎の位置を、リングが重なる瞬間にタップ</div>
      </div>`;
    for (const b of this.body.querySelectorAll('[data-act="first"]')) this.bindCard(b, b.dataset.id, () => { this.firstId = b.dataset.id; this.showCharacterSelect(); });
    this.focus();
  }

  /** 先頭キャラ → 残り3人はパーティ順(A→B→C→D) */
  order() {
    const party = this.progress.party;
    const first = this.firstId && party.includes(this.firstId) ? this.firstId : party[0];
    return [first, ...party.filter((id) => id !== first)];
  }

  startGame() {
    const party = this.order().map((id) => this.progress.character(id));
    this.hide();
    this.g.startStage(this.stage, party);
  }

  // ---------------- RESULT ----------------
  /**
   * @param res { stage, results:[{before, after, levelUps, gained}], stats:[[k,v]] }
   */
  showResult(res) {
    this.frame('result', '攻略成功！', `STAGE ${res.stage.no}:${res.stage.boss.name} をメロメロにした♡`, { primary: 'ステージ選択', back: this.g.online ? null : 'もう一度', home: 'HOME' });
    const D = res.difficulty ?? difficultyData('NORMAL'), rec = res.record;
    this.body.innerHTML = `
      <div class="rhead">STAGE ${String(res.stage.no).padStart(2, '0')} ${diffChip(D.id, 'big')}</div>
      <div class="clearlogo">LOVE MAX♡</div>
      ${this.voiceUnlockHTML(rec)}
      ${this.abilityUnlockHTML(res.growth)}
      ${rec?.firstClearGem ? `<div class="fcgem">初回クリア報酬 <b>♦ +${rec.firstClearGem}</b></div>` : ''}
      ${res.presents?.length ? `<div class="fcgem rpresent">クリア報酬 ${res.presents.map((id) => { const gi = giftById(id); return `<b>${giftIcon(gi)} ${esc(giftName(gi))}</b>`; }).join(' ')} <small>育成で渡すと親密度 EXP</small></div>` : ''}
      ${rec ? `<div class="drec r">${D.label} CLEAR ${rec.clearCount} / BEST RALLY ${rec.bestRally} / GATE CHAIN ${rec.bestGateChain} / BEST HEART ${rec.bestHeartPerThrow.toLocaleString()}</div>` : ''}
      ${this.growthRowsHTML(res.growth)}
      <div class="rstats">${res.stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    this.animateExp(res.growth);
    this.wireAbilityGo();
    for (const b of this.body.querySelectorAll('[data-asmr-go]')) b.addEventListener('click', () => this.router.go('heroine', { id: b.dataset.asmrGo }));
    this.focus();
  }

  /** 参加した味方の育成(親密度 Lv・EXP バー・STAMINA)。MULTI は自分のキャラだけ */
  growthRowsHTML(growth = []) {
    if (!growth.length) return '';
    return `<div class="exprows">${growth.map((r, i) => {
      const a = r.after, b = r.before;
      const ups = Object.keys(a.stats).filter((k) => a.stats[k] !== b.stats[k]).map((k) => `${STAT_LABELS[k]} +${a.stats[k] - b.stats[k]}`).join(' / ');
      return `<div class="exprow" data-i="${i}">
        ${cardHTML(a, { compact: true, mini: true })}
        <div class="expinfo">
          <div class="expname">${esc(a.name)} <span class="lv">AFFECTION Lv.<b>${b.level}</b></span><em class="lvup" hidden>LEVEL UP!</em></div>
          <div class="expbar"><i></i></div>
          <div class="expnum"><span>+${r.gained} EXP${r.tired ? ' <em class="tiredx">疲労中 ×10%</em>' : ''}</span><span class="expnext"></span></div>
          <div class="expstam">STAMINA ${r.stamina.before} → <b>${r.stamina.after}</b> / ${a.staminaMax}${r.stamina.after <= 0 ? ' <em>疲労中(次は EXP×10%)</em>' : ''}</div>
          <div class="growth" hidden>${ups || '成長'}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  /** Lv10 ごとのアビリティ解放(NEW ABILITY UNLOCKED ♡)。Lv100 は特殊枠 + ULTIMATE */
  abilityUnlockHTML(growth = []) {
    const list = growth.filter((r) => r.newAbilitySlots?.length || r.ultimate);
    if (!list.length) return '';
    return list.map((r) => `<section class="ability-unlock"><div class="au-fx" aria-hidden="true">${'<i>♡</i>'.repeat(8)}</div>
      <small>${r.ultimate ? 'ULTIMATE ABILITY UNLOCKED' : 'NEW ABILITY UNLOCKED ♡'}</small><b>${esc(r.after.name)}</b>
      <p>${[...(r.newAbilitySlots ?? []).map((lv) => `Lv.${lv} のアビリティを選べます`), r.ultimate ? `ULTIMATE「${esc(r.after.abilities.find((x) => x.ultimate)?.name ?? '')}」` : ''].filter(Boolean).join(' / ')}</p>
      <button type="button" class="r-btn" data-ability-go="${esc(r.id)}">♡ アビリティを選ぶ</button></section>`).join('');
  }
  wireAbilityGo() { for (const b of this.body.querySelectorAll('[data-ability-go]')) b.addEventListener('click', () => this.router.go('trainChar', { id: b.dataset.abilityGo, focus: 'ability' })); }

  /** クリア報酬ボイスが解放された時のご褒美(リザルトの一番上)。解放が無ければ何も出さない。HELL の ASMR は「ASMR」と分かる表示 */
  voiceUnlockHTML(rec) {
    const list = rec?.voiceUnlocked ?? [];
    if (!list.length) return '';
    const byH = new Map();
    for (const u of list) byH.set(u.heroineId, [...(byH.get(u.heroineId) ?? []), u]);
    return [...byH].map(([hid, us]) => {
      const slots = this.progress.rewardVoices(hid);
      const names = us.map((u) => { const v = slots.find((x) => x.id === u.voiceId); return esc(v?.title ? `${rewardLabel(v)} ${v.title}` : rewardLabel(v ?? u)); });
      const asmr = us.some((u) => u.type === 'asmr');
      const st = STAGES.find((s) => s.id === heroineById(hid)?.stageId) ?? this.stage;
      return `<section class="asmr-unlock"><div class="au-fx" aria-hidden="true">${'<i>♡</i>'.repeat(8)}</div>
        <small>${asmr ? 'NEW ASMR UNLOCKED' : 'NEW VOICE UNLOCKED'}</small><b>${esc(st.boss.name)}</b><p>${names.join(' / ')}</p>
        <button type="button" class="r-btn" data-asmr-go="${esc(hid)}">🎧 聴いてみる</button></section>`;
    }).join('');
  }

  animateExp(results = []) {
    const rows = this.body.querySelectorAll('.exprow');
    results.forEach((r, i) => {
      const row = rows[i];
      if (!row) return;
      const bar = row.querySelector('.expbar i');
      const next = row.querySelector('.expnext');
      const lv = row.querySelector('.lv b');
      const ratio = (c) => (c.maxLevel ? 1 : c.expNeed ? Math.min(1, c.expInto / c.expNeed) : 1);
      const label = (c) => (c.maxLevel ? 'MAX' : `${c.expInto} / ${c.expNeed}`);
      const set = (v, anim) => { bar.style.transition = anim ? 'transform 500ms ease-out' : 'none'; bar.style.transform = `scaleX(${v})`; };
      set(ratio(r.before), false);
      next.textContent = label(r.before);
      const t0 = 350 + i * 180;
      if (r.levelUps > 0) {
        setTimeout(() => set(1, true), t0);
        setTimeout(() => {
          lv.textContent = r.after.level;
          row.classList.add('leveled');
          row.querySelector('.lvup').hidden = false;
          row.querySelector('.growth').hidden = false;
          set(0, false);
          requestAnimationFrame(() => requestAnimationFrame(() => set(ratio(r.after), true)));
          next.textContent = label(r.after);
          this.g.audio?.rallyUp?.();
        }, t0 + 550);
      } else {
        setTimeout(() => { set(ratio(r.after), true); next.textContent = label(r.after); }, t0);
      }
    });
  }

  // ---------------- GAME OVER ----------------
  showGameOver(stage, stats, growth = []) {
    this.frame('over', 'もう一度デート', `STAGE ${stage.no}:${stage.boss.name}`, { primary: this.g.online ? 'ステージ選択' : 'もう一度', back: this.g.online ? null : 'ステージ選択', home: 'HOME', diff: this.g.difficulty });
    this.body.innerHTML = `
      <div class="clearlogo over">TRY AGAIN</div>
      <div class="menuhint">みんなメロメロにされちゃった… 敗北でも、参加した仲間は親密度 EXP を少しもらえます</div>
      ${this.abilityUnlockHTML(growth)}
      ${this.growthRowsHTML(growth)}
      <div class="rstats">${stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
`;
    this.animateExp(growth);
    this.wireAbilityGo();
    this.focus();
  }
}

