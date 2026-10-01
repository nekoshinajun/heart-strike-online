import { Config } from '../core/Config.js';
import { characterById, ATTRIBUTES, TYPES, RANKS, CHARACTERS } from '../data/GameData.js';
import { artUrl, portraitStyle, isPlaceholderArt } from '../data/CharacterArt.js';
import { GachaService } from './GachaService.js';
import { GachaSequencePlanner } from './GachaPlanner.js';
import { GachaDirector } from './GachaDirector.js';
import { Log } from '../app/Platform.js';
import { roleTag } from '../app/Roles.js';
import { GIFTS, giftById, giftName, giftIcon, giftRank } from '../data/RomanceData.js';

/** プレゼント1個の表示(アイコン / 画像・名前・ランク)*/
export function presentHTML(present, cls = '') {
  const g = giftById(present?.giftId);
  if (!g) return '';
  const rk = giftRank(g);
  return `<span class="gp ${cls}"${rk?.color ? ` style="--gk:${rk.color}"` : ''}>${g.image ? `<img src="${esc(g.image)}" alt="">` : `<i>${giftIcon(g)}</i>`}<b>${esc(giftName(g))}</b>${rk ? `<em>${esc(rk.label)}</em>` : ''}</span>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RANK_ORDER = { R: 0, SR: 1, SSR: 2 };

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
    this.planner = new GachaSequencePlanner();
    this.bridge = new GachaHomeBridge(app);
    this.debug = { forceItems: null, forceRoute: null, seed: null, fragmentHintMode: null, revealOrderMode: null };   // テスト / Debug 専用
    layer.innerHTML = '<section class="ga-topv"></section><section class="ga-stage" hidden></section><section class="ga-result" hidden></section>';
    this.topEl = layer.querySelector('.ga-topv');
    this.stageEl = layer.querySelector('.ga-stage');
    this.resEl = layer.querySelector('.ga-result');
    for (const ev of ['pointerdown', 'pointerup']) layer.addEventListener(ev, (e) => e.stopPropagation());
    this.director = new GachaDirector(app, this.stageEl);
  }
  get banner() { return this.service.banner(Config.gacha.banners[0].id); }
  section(which) { this.topEl.hidden = which !== 'top'; this.stageEl.hidden = which !== 'stage'; this.resEl.hidden = which !== 'result'; }

  // ---------------- Gacha Top(TAB_ROOT)----------------
  showTop() {
    this.section('top');
    const b = this.banner, gem = this.p.gem;
    if (!this.p.data.seen.banners[b.id]) { this.p.data.seen.banners[b.id] = Date.now(); this.p.save(); }
    const feat = [...this.service.pool(b.id)].sort((x, y) => (isPlaceholderArt(characterById(x.characterId), 'cutout') - isPlaceholderArt(characterById(y.characterId), 'cutout')) || (RANK_ORDER[y.rarity] - RANK_ORDER[x.rarity])).slice(0, 3);
    this.topEl.innerHTML = `
      <header class="gt-head"><div class="gt-title">ガチャ<small>新しい仲間との出会い</small></div><div class="gt-gem"><i>♦</i><b>${gem.toLocaleString()}</b></div></header>
      <div class="gt-banner">
        <div class="gt-role">${roleTag('ally')}</div>
        <div class="gt-art">${feat.map((e, i) => `<img src="${artUrl(characterById(e.characterId), 'cutout')}" alt="" style="--i:${i}" draggable="false">`).join('')}</div>
        <div class="gt-heart">♥</div>
        <div class="gt-copy"><b>${esc(b.name)}</b><span>${esc(b.sub)}</span></div>
      </div>
      <div class="gt-actions">
        <button type="button" class="gt-btn" data-n="1"><b>ハートを届ける ×1</b><small>仲間 1人 ＋ プレゼント 1個</small><span>♦ ${b.cost.single.toLocaleString()}</span></button>
        <button type="button" class="gt-btn ten" data-n="10"><b>ハートを届ける ×10</b><small>仲間 10人 ＋ プレゼント 10個</small><span>♦ ${b.cost.ten.toLocaleString()}</span></button>
      </div>
      <p class="gt-note">毎回<b>仲間の女の子</b>と<b>プレゼント</b>をセットでもらえます。プレゼントは「育成」で仲間に渡せます。攻略対象の女の子とは「攻略」で出会えます</p>
      <button type="button" class="gt-rates">提供割合 / 詳細</button>`;
    for (const x of this.topEl.querySelectorAll('[data-n]')) x.addEventListener('click', () => this.app.router.go('gachaConfirm', { count: +x.dataset.n }));
    this.topEl.querySelector('.gt-rates').addEventListener('click', () => this.app.router.go('gachaRates'));
    this.app.refreshNotifications();
  }

  // ---------------- Confirm(SHEET)----------------
  showConfirm({ count = 1 }) {
    const b = this.banner, cost = this.service.cost(b, count), gem = this.p.gem, ok = gem >= cost;
    const body = this.app.sheet.open(`ハートを届ける ×${count}`, `
      <div class="gc-get">${roleTag('ally')} ×${count} <span>＋</span> 🎁 プレゼント ×${count}</div>
      <div class="gc-rows"><div><span>必要</span><b>♦ ${cost.toLocaleString()}</b></div><div><span>所持</span><b>♦ ${gem.toLocaleString()}</b></div><div><span>届けた後</span><b class="${ok ? '' : 'ng'}">♦ ${(gem - cost).toLocaleString()}</b></div></div>
      ${ok ? '' : '<p class="gc-ng">HEART GEM が足りません</p>'}
      <button type="button" class="sh-primary" data-act="go" ${ok ? '' : 'disabled'}>ハートを届ける</button>`);
    body.querySelector('[data-act="go"]').addEventListener('click', () => this.start(count));
  }

  // ---------------- 提供割合(SHEET)----------------
  showRates() {
    const b = this.banner, pool = this.service.pool(b.id);
    const byR = ['SSR', 'SR', 'R'].map((r) => ({ r, list: pool.filter((e) => e.rarity === r) })).filter((x) => x.list.length);
    this.app.sheet.open('提供割合 / 詳細', `
      <div class="gr sh-scroll">
        <p class="gr-note">投げ方(POWER・AIM・SPIN・タイミング)によって抽選結果は変化しません。</p>
        ${byR.map(({ r, list }) => `<h4 style="color:${RANKS[r].color}">${r} ${(b.rates[r] * 100).toFixed(1)}%</h4><ul>${list.map((e) => { const c = characterById(e.characterId); const own = this.p.isOwned(c.id); return `<li><span>${esc(c.name)}</span><em>${ATTRIBUTES[c.attribute].label}</em><i class="${own ? 'own' : 'new'}">${own ? '所持' : 'NEW'}</i></li>`; }).join('')}</ul>`).join('')}
        <h4 class="gr-present">🎁 プレゼント(毎回1個・キャラとは別の抽選)</h4><ul>${GIFTS.filter((g) => g.drop?.enabled !== false && (!b.presents?.pool || b.presents.pool.includes(g.id))).map((g) => `<li><span>${giftIcon(g)} ${esc(giftName(g))}</span>${giftRank(g) ? `<em>${esc(giftRank(g).label)}</em>` : ''}</li>`).join('')}</ul>
        <p class="gr-note small">※ プレゼントの排出率・ランクは準備中です。</p>
        <p class="gr-note small">※ 価格・提供割合・10連保証(SR 以上1体)は Prototype の仮値です。天井は未定です。</p>
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
    this.playTx(r.result, { mode: this.p.data.settings.gachaPlaybackMode, firstTime: first });
  }

  playTx(tx, { mode = 'FULL', firstTime = false } = {}) {
    const d = this.debug;
    const plan = this.planner.plan(tx, { mode, forceRoute: d.forceRoute, fragmentHintMode: d.fragmentHintMode, revealOrderMode: d.revealOrderMode });
    this.lastPlan = plan;
    this.app.router.go('gachaSeq', { txId: tx.txId });
    this.app.audio?.unlock?.();
    this.director.play(plan, tx, { firstTime, onDone: () => this.revealed(tx.txId) });
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
    const cost = this.service.cost(this.banner, tx.count), canAgain = this.p.gem >= cost;
    // 主ボタン1つ + 副ボタン(ホームのキャラの変更はここには置かない:育成 → キャラクター詳細だけ)
    const primary = { act: 'again', label: `もう一度 ♦${cost.toLocaleString()}`, disabled: !canAgain };
    const secondary = [
      { act: 'detail', label: 'プロフィール' },
      { act: 'toHome', label: 'ホームへ' },
    ];
    const btn = (b, cls) => `<button type="button" class="${cls}" data-act="${b.act}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`;
    const info = `<div class="gz-info"><span class="gz-rank" style="color:${RANKS[ch.rank].color}">${ch.rank}</span><b>${esc(ch.name)}</b><span>${ATTRIBUTES[ch.attribute].label} / ${TYPES[ch.type].label}</span>${it.isNew ? '<em class="gz-new">NEW!</em>' : ''}</div>`;
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
      ${ten ? `<div class="gz-grid">${tx.items.map((x) => { const c = characterById(x.characterId); const ps = portraitStyle(c); return `<button type="button" class="gz-ic${x.drawIndex === this.sel ? ' sel' : ''}" data-i="${x.drawIndex}" data-rarity="${x.rarity}" aria-label="${esc(c.name)}"><span class="gz-face"${ps ? ` style="${ps}"` : ''}>${ps ? '' : esc(c.name[0])}</span>${x.isNew ? '<i class="gz-nb">NEW</i>' : ''}${x.present ? `<i class="gz-pb">${giftIcon(giftById(x.present.giftId))}</i>` : ''}</button>`; }).join('')}</div>` : ''}
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
    else if (a === 'again') this.app.router.go('gachaConfirm', { count: this.tx.count });
  }

  hideAll() { this.director.stop(); }
}
