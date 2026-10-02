import { Config } from '../core/Config.js';
import { characterById, ATTRIBUTES, TYPES, RANKS, CHARACTERS } from '../data/GameData.js';
import { artUrl, portraitStyle, isPlaceholderArt } from '../data/CharacterArt.js';
import { GachaService } from './GachaService.js';
import { GachaDirector } from './GachaDirector.js';
import { Log } from '../app/Platform.js';
import { roleTag } from '../app/Roles.js';
import { rarityBadge, raritySparkle, charAccent } from '../app/Rarity.js';
import { GIFTS, giftById, giftName, giftIcon, giftRank } from '../data/RomanceData.js';

/** プレゼント1個の表示(アイコン / 画像・名前・ランク)*/
export function presentHTML(present, cls = '') {
  const g = giftById(present?.giftId);
  if (!g) return '';
  const rk = giftRank(g);
  return `<span class="gp ${cls}"${rk?.color ? ` style="--gk:${rk.color}"` : ''}>${g.image ? `<img src="${esc(g.image)}" alt="">` : `<i>${giftIcon(g)}</i>`}<b>${esc(giftName(g))}</b>${rk ? `<em>${esc(rk.label)}</em>` : ''}</span>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RANK_ORDER = { N: -1, R: 0, SR: 1, SSR: 2 };

/** GachaHomeBridge:ガチャ → HOME は「results を渡す」「HOME へ戻る」だけ(ホームのキャラは育成 → キャラクター詳細でのみ変更)*/
export class GachaHomeBridge {
  constructor(app) { this.app = app; }
  results(tx) { return tx.items.map((x) => ({ id: x.characterId, isNew: x.isNew })); }
  toHome(tx) { if (tx) this.app.home.receiveGachaResults(this.results(tx)); this.app.router.go('home'); }
}

/**
 * ガチャ画面(レイヤー 'gacha')
 *   Gacha Top(TAB_ROOT)/ Confirm・提供割合(SHEET)/ 演出(FLOW:GachaDirector)/ 獲得結果(FLOW:GachaResultView)
 * 価格・提供割合は Config.gacha.banners の仮値(正式バランスは未決定)。
 */
export class GachaUI {
  constructor(app, layer) {
    this.app = app;
    this.p = app.progress;
    this.service = new GachaService(this.p);
    this.bridge = new GachaHomeBridge(app);
    this.debug = { forceItems: null, seed: null };   // テスト / Debug 専用
    layer.innerHTML = '<section class="ga-topv"></section><section class="ga-stage" hidden></section><section class="ga-result" hidden></section>';
    this.topEl = layer.querySelector('.ga-topv');
    this.stageEl = layer.querySelector('.ga-stage');
    this.resEl = layer.querySelector('.ga-result');
    for (const ev of ['pointerdown', 'pointerup']) layer.addEventListener(ev, (e) => e.stopPropagation());
    this.director = new GachaDirector(app, this.stageEl);
  }
  /** 開催中のガチャ(TOP の並び)と、いま選んでいるガチャ */
  get banners() { return this.service.activeBanners(); }
  get banner() { return this.service.banner(this.bannerId ?? this.focusBanner().id); }
  focusBanner() { const l = this.banners; return l.find((b) => b.focus) ?? l.find((b) => !b.isDefault) ?? l[0] ?? this.service.defaultBanner; }
  section(which) { this.topEl.hidden = which !== 'top'; this.stageEl.hidden = which !== 'stage'; this.resEl.hidden = which !== 'result'; }

  // ---------------- Gacha Top(TAB_ROOT)----------------
  /**
   * 開催中のガチャを左右スワイプで選ぶ(PC は左右の矢印 / キーボードの ← →)。中央 = 選択中、左右 = 隣のバナーが少し見える(端はつながっている)
   *   開いた時は必ず focus のガチャ(ヨルナ PICK UP)。演出・結果から戻った時は選んでいたガチャのまま
   */
  showTop(params = {}, ctx = {}) {
    this.section('top');
    const list = this.banners;
    if (!ctx.restore || !list.some((b) => b.id === this.bannerId)) this.bannerId = this.focusBanner().id;
    this.renderTop();
    this.app.refreshNotifications();
  }

  /** バナー1枚(テーマ・大きな立ち絵・コピー)*/
  bannerHTML(b, pos) {
    const c = b.copy ?? {};
    const hero = b.bannerCharacter ? characterById(b.bannerCharacter) : null;
    const feat = hero ? [] : [...this.service.pool(b.id)].sort((x, y) => (isPlaceholderArt(characterById(x.characterId), 'cutout') - isPlaceholderArt(characterById(y.characterId), 'cutout')) || (RANK_ORDER[y.rarity] - RANK_ORDER[x.rarity])).slice(0, 3);
    const art = hero
      ? `<div class="gt-hero"><img src="${artUrl(hero, 'cutout')}" alt="${esc(hero.name)}" draggable="false"></div>`
      : `<div class="gt-art">${feat.map((e, i) => `<img src="${artUrl(characterById(e.characterId), 'cutout')}" alt="" style="--i:${i}" draggable="false">`).join('')}</div><div class="gt-heart">♥</div>`;
    return `<article class="gt-banner" data-id="${esc(b.id)}" data-pos="${pos}" data-theme="${esc(b.theme ?? 'default')}" aria-hidden="${pos === 0 ? 'false' : 'true'}">
        <div class="gt-fx" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        ${art}
        ${c.badge ? `<div class="gt-badge">${esc(c.badge)}</div>` : ''}
        <div class="gt-copy">${c.epithet ? `<small>${esc(c.epithet)}</small>` : ''}<b>${esc(c.name ? `「${c.name}」` : b.name)}</b><span>${esc(c.catch ?? b.sub ?? '')}</span>${c.status ? `<em>${esc(c.status)}</em>` : ''}</div>
      </article>`;
  }

  renderTop() {
    const list = this.banners, b = this.banner, gem = this.p.gem;
    const i = Math.max(0, list.findIndex((x) => x.id === b.id)), n = list.length;
    if (!this.p.data.seen.banners[b.id]) { this.p.data.seen.banners[b.id] = Date.now(); this.p.save(); }
    // 中央 = 選択中 / 左右 = 隣(端はつながる)。バナーが1つなら左右は出さない
    const at = (k) => list[(i + k + n) % n];
    const slides = n > 1 ? [[-1, at(-1)], [0, b], [1, at(1)]] : [[0, b]];
    this.topEl.dataset.theme = b.theme ?? 'default';
    this.topEl.innerHTML = `
      <header class="gt-head"><div class="gt-title">${esc(b.title ?? 'ガチャ')}<small>${b.isDefault ? '新しい仲間との出会い' : esc(b.copy?.status ?? '')}</small></div><div class="gt-gem"><i>♦</i><b>${gem.toLocaleString()}</b></div></header>
      <div class="gt-car" role="group" aria-roledescription="carousel" aria-label="開催中のガチャ" tabindex="0">
        <div class="gt-track">${slides.map(([pos, x]) => this.bannerHTML(x, pos)).join('')}</div>
        ${n > 1 ? '<button type="button" class="gt-arrow prev" data-dir="-1" aria-label="前のガチャ">‹</button><button type="button" class="gt-arrow next" data-dir="1" aria-label="次のガチャ">›</button>' : ''}
      </div>
      ${n > 1 ? `<div class="gt-dots" aria-hidden="true">${list.map((x, k) => `<i class="${k === i ? 'on' : ''}">${k === i ? '♥' : '♡'}</i>`).join('')}</div>` : ''}
      <div class="gt-actions">
        <button type="button" class="gt-btn" data-n="1"><b>1回引く</b><small>仲間 1人 ＋ プレゼント 1個</small><span>♦ ${b.cost.single.toLocaleString()}</span></button>
        <button type="button" class="gt-btn ten" data-n="10"><b>10回引く</b><small>仲間 10人 ＋ プレゼント 10個</small><span>♦ ${b.cost.ten.toLocaleString()}</span></button>
      </div>
      <button type="button" class="gt-rates">提供割合 / 詳細</button>`;
    for (const x of this.topEl.querySelectorAll('[data-n]')) x.addEventListener('click', () => this.app.router.go('gachaConfirm', { count: +x.dataset.n, bannerId: this.banner.id }));
    this.topEl.querySelector('.gt-rates').addEventListener('click', () => this.app.router.go('gachaRates', { bannerId: this.banner.id }));
    for (const x of this.topEl.querySelectorAll('.gt-arrow')) x.addEventListener('click', () => this.slide(+x.dataset.dir));
    this.bindSwipe(this.topEl.querySelector('.gt-car'));
  }

  /** 隣のガチャへ(dir = -1 左 / +1 右)。トラックを滑らせてから描き直す */
  slide(dir) {
    const list = this.banners, n = list.length;
    if (n < 2 || this.sliding) return;
    const i = list.findIndex((x) => x.id === this.banner.id);
    const next = list[(i + dir + n) % n];
    const track = this.topEl.querySelector('.gt-track');
    this.sliding = true;
    const done = () => { this.sliding = false; this.bannerId = next.id; this.renderTop(); };
    const a = track?.animate?.([{ transform: getComputedStyle(track).transform === 'none' ? 'translateX(0)' : getComputedStyle(track).transform }, { transform: `translateX(${-dir * 84}%)` }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    if (a) { a.finished.then(done, done); setTimeout(() => { if (this.sliding) done(); }, 600); } else done();
  }

  /** 横スワイプ(指に合わせてトラックが動く → 離した時の距離 / 速さで隣へ)*/
  bindSwipe(car) {
    if (!car) return;
    const track = car.querySelector('.gt-track');
    let s = null;
    car.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; s = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, dx: 0, lock: null }; });
    car.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      s.dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.lock && Math.hypot(s.dx, dy) > 8) s.lock = Math.abs(s.dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.lock === 'x') { track.style.transform = `translateX(${s.dx}px)`; try { car.setPointerCapture(e.pointerId); } catch { /* noop */ } }
    });
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const { dx, t, lock } = s; s = null;
      const v = dx / Math.max(1, performance.now() - t);
      if (lock === 'x' && (Math.abs(dx) > car.clientWidth * 0.18 || Math.abs(v) > 0.45)) this.slide(dx < 0 ? 1 : -1);
      else track.style.transform = '';
    };
    car.addEventListener('pointerup', end);
    car.addEventListener('pointercancel', end);
    car.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') this.slide(-1); else if (e.key === 'ArrowRight') this.slide(1); });
  }

  // ---------------- Confirm(SHEET)----------------
  showConfirm({ count = 1, bannerId = null }) {
    if (bannerId) this.bannerId = bannerId;
    const b = this.banner, cost = this.service.cost(b, count), gem = this.p.gem, ok = gem >= cost;
    const body = this.app.sheet.open(`${esc(b.title ?? 'ガチャ')} ×${count}`, `
      <div class="gc-get">${roleTag('ally')} ×${count} <span>＋</span> 🎁 プレゼント ×${count}</div>
      <div class="gc-rows"><div><span>必要</span><b>♦ ${cost.toLocaleString()}</b></div><div><span>所持</span><b>♦ ${gem.toLocaleString()}</b></div><div><span>届けた後</span><b class="${ok ? '' : 'ng'}">♦ ${(gem - cost).toLocaleString()}</b></div></div>
      ${ok ? '' : '<p class="gc-ng">HEART GEM が足りません</p>'}
      <button type="button" class="sh-primary" data-act="go" ${ok ? '' : 'disabled'}>ハートを届ける</button>`);
    body.querySelector('[data-act="go"]').addEventListener('click', () => this.start(count));
  }

  // ---------------- 提供割合(SHEET)----------------
  showRates({ bannerId = null } = {}) {
    if (bannerId) this.bannerId = bannerId;
    const b = this.banner, odds = this.service.odds(b.id);
    const pct = (v) => `${(v * 100).toFixed(v * 100 < 1 ? 3 : 2).replace(/\.?0+$/, '')}%`;
    const byR = ['SSR', 'SR', 'R', 'N'].filter((r) => odds[r]).map((r) => ({ r, ...odds[r] }));
    this.app.sheet.open('提供割合 / 詳細', `
      <div class="gr sh-scroll">
        <p class="gr-note">投げ方(POWER・AIM・SPIN・タイミング)によって抽選結果は変化しません。</p>
        <p class="gr-title">${esc(b.title ?? b.name)}</p>
        ${byR.map(({ r, rate, chars }) => `<h4 style="color:${RANKS[r].color}">${r} ${pct(rate)}</h4><ul>${chars.map((e) => { const c = characterById(e.characterId); const own = this.p.isOwned(c.id); return `<li class="${e.pickup ? 'pu' : ''}"><span>${e.pickup ? '<b class="gr-pu">PICK UP</b>' : ''}${esc(c.name)}</span><em>${pct(e.rate)}</em><i class="${own ? 'own' : 'new'}">${own ? '所持' : 'NEW'}</i></li>`; }).join('')}</ul>`).join('')}
        <h4 class="gr-present">🎁 プレゼント(毎回1個・キャラとは別の抽選)</h4><ul>${GIFTS.filter((g) => g.drop?.enabled !== false && (!b.presents?.pool || b.presents.pool.includes(g.id))).map((g) => `<li><span>${giftIcon(g)} ${esc(giftName(g))}</span>${giftRank(g) ? `<em>${esc(giftRank(g).label)}</em>` : ''}</li>`).join('')}</ul>
        <p class="gr-note small">※ プレゼントの排出率・ランクは準備中です。</p>
        <p class="gr-note small">※ 価格・提供割合・PICK UP 率・10連保証(SR 以上1体)は Prototype の仮値です。天井は未定です。</p>
      </div>`);
  }

  // ---------------- 実行 ----------------
  start(count) {
    const d = this.debug;
    const r = this.service.commit(this.banner.id, count, { seed: d.seed ?? undefined, forceItems: d.forceItems });
    this.app.router.closeSheet();
    if (r.status !== 'COMMITTED') { this.app.toast(r.reason === 'GEM' ? 'HEART GEM が足りません' : 'まだ表示していない結果があります'); if (r.reason === 'PENDING_REVEAL') this.restore(); return; }
    const first = !this.p.flag('gachaTutorialShown');
    if (first) this.p.setFlag('gachaTutorialShown');
    void first;
    this.playTx(r.result, { mode: this.p.data.settings.gachaPlaybackMode });
  }

  playTx(tx, { mode = 'FULL' } = {}) {
    this.app.router.go('gachaSeq', { txId: tx.txId });
    this.app.audio?.unlock?.();
    this.director.play(tx, { mode, onDone: () => this.revealed(tx.txId) });
  }

  /** 起動時:COMMITTED + pendingReveal → 最低保証 Reveal(初獲得 SSR)→ Result */
  restore() {
    const tx = this.service.pending;
    if (!tx) return false;
    Log.info('GACHA', `restore pending ${tx.txId}`);
    this.playTx(tx, { mode: 'SKIP_TO_NEW' });
    return true;
  }

  revealed(txId) {
    this.service.markRevealed(txId);
    this.app.router.replace('gachaResult', { txId });
  }

  // ---------------- 獲得結果(FLOW)----------------
  showResult({ txId }) {
    this.section('result');
    const tx = this.service.tx(txId);
    if (!tx) { this.app.router.go('gacha'); return; }
    if (tx.status !== 'REVEALED') this.service.markRevealed(txId);
    this.tx = tx;
    const items = tx.items;
    // 初期選択:NEW の SSR → NEW の最高レアリティ → 抽選順の先頭
    const newSSR = items.find((x) => x.isNew && x.rarity === 'SSR');
    const newBest = [...items].filter((x) => x.isNew).sort((a, b) => RANK_ORDER[b.rarity] - RANK_ORDER[a.rarity])[0];
    this.sel = (newSSR ?? newBest ?? items[0]).drawIndex;
    this.renderResult();
  }

  renderResult() {
    const tx = this.tx, it = tx.items[this.sel], ch = characterById(it.characterId);
    const ten = tx.count >= 10;
    const txb = this.service.banner(tx.bannerId), cost = this.service.cost(txb, tx.count), canAgain = this.p.gem >= cost;
    // 主ボタン1つ + 副ボタン(ホームのキャラの変更はここには置かない:育成 → キャラクター詳細だけ)
    const primary = { act: 'again', label: `もう一度 ♦${cost.toLocaleString()}`, disabled: !canAgain };
    const secondary = [
      { act: 'detail', label: 'プロフィール' },
      { act: 'toHome', label: 'ホームへ' },
    ];
    const btn = (b, cls) => `<button type="button" class="${cls}" data-act="${b.act}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`;
    const info = `<div class="gz-info">${rarityBadge(ch.rank, 'gz-rank')}<b>${esc(ch.name)}</b><span>${ATTRIBUTES[ch.attribute].label} / ${TYPES[ch.type].label}</span>${it.isNew ? '<em class="gz-new">NEW!</em>' : ''}</div>`;
    // プレゼント(キャラと同じ1回分)。10連は全10個のまとめも出す
    const presents = tx.items.map((x) => x.present).filter(Boolean);
    const sum = new Map(); for (const p of presents) sum.set(p.giftId, (sum.get(p.giftId) ?? 0) + 1);
    const bonus = it.present ? `<div class="gz-present"><small>＋ BONUS PRESENT</small>${presentHTML(it.present)}${ten ? `<div class="gz-psum">${[...sum].map(([id, n]) => `<span>${giftIcon(giftById(id))}×${n}</span>`).join('')}<em>計 ${presents.length}個</em></div>` : ''}</div>` : '';
    this.resEl.dataset.kind = ten ? 'ten' : 'single';
    this.resEl.dataset.rarity = ch.rank;
    this.resEl.style.setProperty('--ac', ATTRIBUTES[ch.attribute].color);
    this.resEl.innerHTML = `
      <div class="gz-sky"></div>
      <div class="gz-fig" data-rarity="${ch.rank}"><div class="gz-halo"></div><img src="${artUrl(ch, 'cutout')}" alt="${esc(ch.name)}" draggable="false"></div>
      ${ten ? `<div class="gz-grid">${tx.items.map((x) => { const c = characterById(x.characterId); return `<button type="button" class="gz-ic rar-frame${x.drawIndex === this.sel ? ' sel' : ''}" data-i="${x.drawIndex}" data-rarity="${x.rarity}" aria-label="${esc(c.name)}"><span class="gz-face"><img src="${artUrl(c, 'cutout')}" alt="" draggable="false"></span>${rarityBadge(x.rarity, 'gz-ib')}${raritySparkle(x.rarity)}${charAccent(c)}${x.isNew ? '<i class="gz-nb">NEW</i>' : ''}${x.present ? `<i class="gz-pb">${giftIcon(giftById(x.present.giftId))}</i>` : ''}</button>`; }).join('')}</div>` : ''}
      <div class="gz-bottom">${info}${bonus}${btn(primary, 'gz-primary')}<div class="gz-sec">${secondary.map((b) => btn(b, 'gz-s')).join('')}</div></div>`;
    for (const b of this.resEl.querySelectorAll('[data-act]')) b.addEventListener('click', () => this.act(b.dataset.act));
    for (const b of this.resEl.querySelectorAll('[data-i]')) this.bindIcon(b);
  }
  bindIcon(b) {
    let timer = null;
    b.addEventListener('pointerdown', () => { timer = setTimeout(() => { timer = null; this.app.router.go('detail', { id: this.tx.items[+b.dataset.i].characterId }); }, Config.home.longPressMs); });
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; return true; } return false; };
    b.addEventListener('pointerup', () => { if (cancel()) { this.sel = +b.dataset.i; this.renderResult(); } });
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('pointerleave', cancel);
  }
  act(a) {
    const it = this.tx.items[this.sel];
    if (a === 'toHome') this.bridge.toHome(this.tx);
    else if (a === 'detail') this.app.router.go('detail', { id: it.characterId });
    else if (a === 'again') this.app.router.go('gachaConfirm', { count: this.tx.count, bannerId: this.tx.bannerId });
  }

  hideAll() { this.director.stop(); }
}
