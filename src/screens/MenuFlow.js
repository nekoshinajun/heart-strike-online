import { STAGES, CHARACTERS, ATTRIBUTES, RANKS, TYPES } from '../data/GameData.js';
import { attributeRelation } from '../data/BattleCalc.js';
import { BOSS_IMAGES } from '../assets/bossImages.js';
import { portraitStyle } from '../data/CharacterArt.js';
import { Config, difficultyData } from '../core/Config.js';
import { devInput, storage, Haptic } from '../app/Platform.js';

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

/** キャラクターカード(ランク・画像・名前・属性・タイプ・Lv・ATK・DEF) */
export function cardHTML(ch, { slot = '', badge = '', compact = false } = {}) {
  const a = ATTRIBUTES[ch.attribute], r = RANKS[ch.rank], t = TYPES[ch.type];
  const ps = portraitStyle(ch);
  const img = ps
    ? `<div class="avatar" style="${ps}"><i>${a.icon}</i></div>`
    : `<div class="avatar ph" style="--ac:${a.color}"><span>${esc(ch.name[0])}</span><i>${a.icon}</i></div>`;
  return `<div class="ccard${compact ? ' compact' : ''}" style="--rc:${r.color};--ac:${a.color}">
    <div class="crank">${r.id}</div>${slot ? `<div class="cslot">${slot}</div>` : ''}${badge}
    ${img}
    <div class="cname">${esc(ch.name)}</div>
    <div class="cmeta"><span title="${a.label}">${a.icon}</span><span>${t.label}</span></div>
    <div class="cstat"><span>Lv.${ch.level}</span><span>ATK ${ch.atk}</span><span>DEF ${ch.def}</span></div>
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
      if (this.screen === 'diff' && e.key.startsWith('Arrow')) {
        e.preventDefault(); e.stopPropagation();
        const order = Config.difficultyOrder, i = order.indexOf(this.diff);
        const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
        this.selectDiff(order[(i + d + order.length) % order.length]);
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
    this.el.hidden = false;
    this.g.container.classList.add('menuopen');
    this.el.dataset.screen = screen;
    this.titleEl.textContent = title;
    if (diff) this.titleEl.insertAdjacentHTML('beforeend', ` ${diffChip(diff, 'intitle')}`);
    this.el.dataset.diff = screen === 'diff' ? this.diff : '';
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
    if (this.screen === 'stage') return this.pickStage(this.stage);
    this.onPrimary();
  }

  onPrimary() {
    switch (this.screen) {
      case 'stage': return this.pickStage(this.stage);
      case 'diff': return this.confirmDiff();
      case 'party': return this.partyMode === 'sortie' ? this.router.go('chars') : null;
      case 'chars': return this.startGame();
      case 'result': return this.g.backToMenu();          // ステージ選択
      case 'over': return this.g.online ? this.g.backToMenu() : this.g.retryStage(); // Online は再戦しない
    }
  }

  onBack() {
    switch (this.screen) {
      case 'diff': case 'party': case 'chars': return this.router.back();
      case 'result': return this.g.retryStage();          // もう一度
      case 'over': return this.g.backToMenu();            // ステージ選択
    }
  }

  /** RESULT / TRY AGAIN → HOME(推しがクリア後の一言 = afterClear。Guidance は次に HOME を開いた時)*/
  onHome() {
    if (this.screen === 'result') this.g.app.home.queueTrigger('afterClear');
    this.g.backToMenu('home');
  }

  // ---------------- STAGE SELECT ----------------
  /** @param stageId Deep Link で選択状態にしてスクロールするステージ */
  showStageSelect({ stageId } = {}) {
    if (stageId) this.stage = STAGES.find((s) => s.id === stageId) ?? this.stage;
    this.frame('stage', '攻略', '今日、誰を口説きに行く？', { primary: '♡ 挑戦する' });
    const selected = this.stage ?? STAGES[0];
    const bossArt = (s) => BOSS_IMAGES[s.boss.image] ?? BOSS_IMAGES[s.boss.fallbackImage] ?? '';
    const portrait = (id) => {
      const ch = this.progress.character(id);
      return ch ? artUrl(ch, 'cutout') : '';
    };
    const gifts = [
      ['🥤','スペシャルドリンク','3'],['👜','バッグ','1'],['💎','アクセ','5'],['🍰','スイーツ','12'],['💐','花束','8']
    ];
    this.body.innerHTML = `
      <div class="capture-stage" style="--boss:url('${bossArt(selected)}')">
        <div class="capture-glow"></div>
        <section class="capture-profile">
          <small>CAST ${String(selected.no).padStart(2,'0')}</small>
          <strong>${esc(selected.boss.name)}</strong>
          <span>♡ LOVE <b>${this.progress.isCleared(selected.id) ? '100' : '0'}%</b></span>
          <p>${esc(selected.concept ?? 'あなたのハート、ちゃんと届くかな？')}</p>
        </section>
        <button type="button" class="capture-start" data-act="start">♡<b>挑戦する</b><small>START</small></button>
      </div>
      <div class="cast-strip">${STAGES.map((s)=>`<button type="button" class="cast-tab${s===selected?' sel':''}" data-act="stage" data-id="${s.id}" style="background-image:url('${bossArt(s)}')"><i>${s.no}</i><span>${esc(s.boss.name)}</span>${this.progress.isCleared(s.id)?'<em>CLEAR</em>':''}</button>`).join('')}<button class="cast-tab locked" disabled><i>04</i><span>???</span>🔒</button><button class="cast-tab locked" disabled><i>05</i><span>???</span>🔒</button></div>
      <section class="date-panel"><header><b>♡ デートメンバー</b><span>PARTY 1</span><button type="button" data-act="party">編成</button></header><div class="date-party">${this.progress.party.map((id,i)=>`<div><img src="${portrait(id)}" alt=""><small>${'ABCD'[i]}</small></div>`).join('')}</div></section>
      <section class="gift-panel"><header><b>🎁 プレゼント</b><span>持っていくと攻略をちょっと有利に</span></header><div class="gift-list">${gifts.map(g=>`<button type="button" class="gift-item"><i>${g[0]}</i><span>${g[1]}</span><b>×${g[2]}</b></button>`).join('')}</div></section>
      <div class="playmode-tabs capture-mode"><button type="button" data-mode="solo" class="${this.playMode==='solo'?'sel':''}">SOLO</button><button type="button" data-mode="multi" class="${this.playMode==='multi'?'sel':''}">MULTI <small>2–4</small></button></div>`;
    for (const b of this.body.querySelectorAll('[data-mode]')) b.addEventListener('click',()=>{this.playMode=b.dataset.mode;for(const x of this.body.querySelectorAll('[data-mode]'))x.classList.toggle('sel',x===b)});
    for (const b of this.body.querySelectorAll('[data-act="stage"]')) b.addEventListener('click',()=>{const st=STAGES.find(s=>s.id===b.dataset.id);if(!st)return;this.stage=st;this.showStageSelect({stageId:st.id})});
    this.body.querySelector('[data-act="start"]')?.addEventListener('click',()=>this.pickStage(this.stage));
    this.body.querySelector('[data-act="party"]')?.addEventListener('click',()=>this.router.go('partyTab'));
    this.primary.hidden = true;
    this.back.hidden = true;
    this.homeBtn.hidden = true;
    this.focus(this.body.querySelector('.capture-start'));
  }

  markSel(el, sel) {
    for (const x of this.body.querySelectorAll(sel)) x.classList.toggle('sel', x === el);
  }

  /** @param recommend Deep Link の推奨難易度(選択状態にするだけ。決定は必ずプレイヤー)*/
  pickStage(stage, { recommend = null } = {}) {
    this.stage = stage;
    this.recommended = recommend;
    this.diff = recommend ?? 'NORMAL';          // 難易度選択は NORMAL から(Deep Link は推奨を選択状態に)
    this.g.setDifficulty(this.diff);
    this.g.prepareStage(stage);
    this.router.go('diff', { stageId: stage.id, recommend });
  }

  // ---------------- DIFFICULTY SELECT ----------------
  /** NORMAL / HARD / HELL。locked:true の難易度は選べない(今は全て解放。将来のロック用) */
  showDifficultySelect() {
    const st = this.stage;
    this.frame('diff', 'DIFFICULTY', `STAGE ${String(st.no).padStart(2, '0')}:${st.boss.name}`, { primary: 'NEXT ▶', back: '◀ BACK' });
    const pct = (v) => `×${+v.toFixed(2)}`;
    this.body.innerHTML = `<div class="difflist">${Config.difficultyOrder.map((id) => {
      const D = difficultyData(id), r = this.progress.record(st.id, id);
      const heart = Math.round(st.boss.maxHeart * Config.battle.heartCapacityScale * D.heartCapacity);
      return `<button type="button" class="diffcard${id === this.diff ? ' sel' : ''}${D.locked ? ' locked' : ''}" data-act="diff" data-id="${id}" style="--dc:${D.color}"${D.locked ? ' aria-disabled="true"' : ''}>
        <div class="dhead"><span class="dlabel">${D.label}</span><span class="dja">${esc(D.ja)}</span>${id === this.recommended ? '<em class="rec">おすすめ</em>' : ''}${r?.clearCount ? '<em>CLEAR</em>' : ''}${D.locked ? '<em class="lock">🔒 LOCKED</em>' : ''}</div>
        <div class="ddesc">${esc(D.desc)}</div>
        <div class="dnote">${esc(D.note ?? '')}</div>
        <div class="dstats"><span>HEART <b>${heart.toLocaleString()}</b></span><span>返球 <b>${pct(D.returnSpeed)}</b></span><span>Gate <b>${pct(D.gateSize)}</b></span><span>被ダメ <b>${pct(D.damageTaken)}</b></span><span>EXP <b>+${Math.round(st.exp * D.exp)}</b></span></div>
        ${r ? `<div class="drec">CLEAR ${r.clearCount} / BEST RALLY ${r.bestRally} / GATE CHAIN ${r.bestGateChain} / BEST HEART ${r.bestHeartPerThrow.toLocaleString()}</div>` : ''}
      </button>`;
    }).join('')}</div>
    <div class="hellwarn">⚠ キャッチ判定の厳しさは全難易度共通。HELL は Gate がかなり小さく、受けるダメージが大きい最高難易度です</div>
`;
    for (const b of this.body.querySelectorAll('[data-act="diff"]')) {
      b.addEventListener('click', (e) => { this.selectDiff(b.dataset.id); if (e.detail === 0) this.confirmDiff(); });
    }
    this.selectDiff(this.diff);
    this.focus();
  }

  selectDiff(id) {
    const D = difficultyData(id);
    this.diff = D.id;
    this.el.dataset.diff = D.id;
    for (const x of this.body.querySelectorAll('.diffcard')) x.classList.toggle('sel', x.dataset.id === D.id);
    this.primary.disabled = !!D.locked;
    if (this.el.dataset.lastDiff !== D.id) { this.el.dataset.lastDiff = D.id; this.g.audio?.tick?.(); }
  }

  /** NEXT:HELL を初めて選んだ時だけ確認 → PARTY EDIT */
  confirmDiff() {
    const D = difficultyData(this.diff);
    if (D.locked) return;
    if (D.id === 'HELL' && !this.progress.flag('hellConfirmed')) return this.openConfirm();
    this.g.setDifficulty(D.id);
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
    el.querySelector('[data-cf="go"]').addEventListener('click', () => { this.closeConfirm(); this.progress.setFlag('hellConfirmed'); this.confirmDiff(); });
    this.el.appendChild(el);
    this.confirmEl = el;
    this.focus(el.querySelector('[data-cf="go"]'));
  }

  closeConfirm() {
    if (!this.confirmEl) return;
    this.confirmEl.remove();
    this.confirmEl = null;
    if (this.screen === 'diff') this.focus();
  }
  get selectedDifficulty() { return this.diff; }

  // ---------------- PARTY EDIT ----------------
  /**
   * PARTY EDIT(同じ Party データを2つのモードで使う)
   *   standalone … Bottom Nav「編成」から(TAB_ROOT)。NEXT なし
   *   sortie     … 難易度の後の出撃フロー(PARTY確認)。NEXT → CHARACTER SELECT
   * 表示するのは所持キャラだけ
   */
  showPartyEdit({ mode } = {}) {
    if (mode) this.partyMode = mode;
    const sortie = this.partyMode === 'sortie';
    const keepScroll = this.screen === 'party' ? this.body.scrollTop : 0;
    if (sortie) this.frame('party', 'PARTY確認', `STAGE ${this.stage.no}:${this.stage.boss.name} ─ 4人を編成`, { primary: 'NEXT ▶', back: '◀ BACK', diff: this.diff });
    else this.frame('party', '編成', '4人のパーティを編成(A が最初に投げます)', {});
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
    this.frame('chars', 'CHARACTER SELECT', '最初に投げるキャラを選んでね(A になります)', { primary: 'GAME START', back: '◀ BACK' });
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
        <div><b>THROW</b>ハート玉を下へ引いてPOWER→上へ弾いて狙う。切り返すとカーブ</div>
        <div><b>CATCH</b>◎の位置を、リングが重なる瞬間にタップ</div>
        <div><b>TYPE</b>STRAIGHT=速い球 / CURVE=よく曲がる</div>
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
    this.frame('result', 'RESULT', `STAGE ${res.stage.no}:${res.stage.boss.name} HEART MAX!`, { primary: 'ステージ選択', back: this.g.online ? null : 'もう一度', home: 'HOME' });
    const D = res.difficulty ?? difficultyData('NORMAL'), exp = res.exp ?? res.stage.exp, rec = res.record;
    this.body.innerHTML = `
      <div class="rhead">STAGE ${String(res.stage.no).padStart(2, '0')} ${diffChip(D.id, 'big')}</div>
      <div class="clearlogo">CLEAR!</div>
      <div class="expgain">EXP <b>+${exp}</b>${D.exp !== 1 ? `<small>(${res.stage.exp} × ${D.exp})</small>` : ''}</div>
      ${rec?.firstClearGem ? `<div class="fcgem">初回クリア報酬 <b>♦ +${rec.firstClearGem}</b></div>` : ''}
      ${rec ? `<div class="drec r">${D.label} CLEAR ${rec.clearCount} / BEST RALLY ${rec.bestRally} / GATE CHAIN ${rec.bestGateChain} / BEST HEART ${rec.bestHeartPerThrow.toLocaleString()}</div>` : ''}
      <div class="exprows">${res.results.map((r, i) => {
        const a = r.after;
        return `<div class="exprow" data-i="${i}">
          ${cardHTML(a, { compact: true })}
          <div class="expinfo">
            <div class="expname">${esc(a.name)} <span class="lv">Lv.<b>${r.before.level}</b></span><em class="lvup" hidden>LEVEL UP!</em></div>
            <div class="expbar"><i></i></div>
            <div class="expnum"><span>+${r.gained} EXP</span><span class="expnext"></span></div>
            <div class="growth" hidden>ATK +${a.atk - r.before.atk} / DEF +${a.def - r.before.def}</div>
          </div>
        </div>`;
      }).join('')}</div>
      <div class="rstats">${res.stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    this.animateExp(res.results);
    this.focus();
  }

  animateExp(results) {
    const rows = this.body.querySelectorAll('.exprow');
    results.forEach((r, i) => {
      const row = rows[i];
      const bar = row.querySelector('.expbar i');
      const next = row.querySelector('.expnext');
      const lv = row.querySelector('.lv b');
      const ratio = (c) => (c.nextExp ? Math.min(1, c.exp / c.nextExp) : 1);
      const set = (v, anim) => { bar.style.transition = anim ? 'transform 500ms ease-out' : 'none'; bar.style.transform = `scaleX(${v})`; };
      set(ratio(r.before), false);
      next.textContent = r.before.nextExp ? `${r.before.exp} / ${r.before.nextExp}` : 'MAX';
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
          next.textContent = r.after.nextExp ? `${r.after.exp} / ${r.after.nextExp}` : 'MAX';
          this.g.audio?.rallyUp?.();
        }, t0 + 550);
      } else {
        setTimeout(() => { set(ratio(r.after), true); next.textContent = r.after.nextExp ? `${r.after.exp} / ${r.after.nextExp}` : 'MAX'; }, t0);
      }
    });
  }

  // ---------------- GAME OVER ----------------
  showGameOver(stage, stats) {
    this.frame('over', 'TRY AGAIN', `STAGE ${stage.no}:${stage.boss.name}`, { primary: this.g.online ? 'ステージ選択' : 'もう一度', back: this.g.online ? null : 'ステージ選択', home: 'HOME', diff: this.g.difficulty });
    this.body.innerHTML = `
      <div class="clearlogo over">TRY AGAIN</div>
      <div class="menuhint">4人ともダウンしちゃった… EXP はクリア時にもらえます</div>
      <div class="rstats">${stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
`;
    this.focus();
  }
}

