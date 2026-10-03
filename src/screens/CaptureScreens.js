import { SHOPS, shopById, castsOf, isShopOpen, shopLockText, shopProgress } from '../data/ShopData.js';
import { BOSS_IMAGES } from '../assets/bossImages.js';
import { Config, difficultyData } from '../core/Config.js';
import { reducedMotion } from '../app/Platform.js';
import { CityMap } from './CityMap.js';

/**
 * 攻略の入口:① お店を選ぶ(コンカフェ街マップ)→ ② お店の中(キャスト一覧)→ ③ キャストの攻略(MenuFlow.showStageSelect)
 *   画面は MenuFlow の #menu に描く(ルート:stage = ① / shop = ② / cast = ③。下部ナビは3画面とも「攻略」)
 */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const phrase = (s) => esc(s).replace(/([、。！？!?…—]+\s*)/g, '$1<wbr>');
export const castArt = (stage) => BOSS_IMAGES[stage.boss.image] ?? BOSS_IMAGES[stage.boss.fallbackImage] ?? '';
/** 画像の見せ方(GameData の boss.art。省略時はリリスの画像の構図)*/
const ART_DEFAULT = { face: { u: 0.545, v: 0.2, w: 0.14 }, stage: { x: -0.4, h: 1 } };
export const castArtData = (stage) => ({ face: { ...ART_DEFAULT.face, ...stage.boss.art?.face }, stage: { ...ART_DEFAULT.stage, ...stage.boss.art?.stage } });
/** 顔を中心に切り抜く画像(親の .face-crop の中で、CSS 変数 --bx / --by / --fpx の位置・大きさに顔を合わせる)*/
export function faceCrop(stage) {
  const f = castArtData(stage).face;
  return `<img class="face-img" src="${castArt(stage)}" alt="" style="--fu:${f.u};--fv:${f.v};--fw:${f.w}" draggable="false">`;
}
export const castLine = (heroine, stage) => heroine?.line ?? stage?.line ?? 'あなたのハート、ちゃんと届くかな？';
/** 画面上部:戻る + ロゴ */
export const capTop = (back) => `<div class="cap-top">${back ? '<button type="button" class="cap-back" data-act="back" aria-label="戻る"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 7.5 12l7 7"/></svg></button>' : ''}<div class="cap-logo"><i>♡</i>HEART STRIKE</div></div>`;

// ---------------- ① お店を選ぶ ----------------
export function showShopMap(m, { shopId } = {}) {
  m.frame('shopmap', '攻略', 'お店を選ぶ');
  const isOpen = (s) => isShopOpen(m.progress, s);
  m.shopSel = shopId ?? m.shopSel ?? SHOPS.find(isOpen)?.id ?? SHOPS[0].id;
  m.body.innerHTML = `
    <div class="smap">
      <div class="sm-city"></div>
      <div class="sm-shade" aria-hidden="true"></div>
      ${capTop(false)}
      <header class="sm-head"><h1>お店を選ぶ<em class="script">Shop Select</em></h1><p>今日は、どのお店に行こう？<i>♡</i></p></header>
      <section class="sm-card" aria-live="polite"></section>
    </div>`;
  if (!m.city) {
    m.city = new CityMap({ shops: SHOPS, isOpen, reduced: reducedMotion(), onSelect: (id) => { m.shopSel = id; renderShopCard(m); m.g.audio?.tick?.(); }, onEnter: (id) => enterShop(m, id) });
    m.city.portrait = (s) => { const c = castsOf(s)[0]; return c ? faceCrop(c.stage) : ''; };
    m.city.renderMarkers();
    // 看板の筆記体フォントがまだなら、読み込めたら街を描き直す
    const font = '12px "Great Vibes"';
    if (document.fonts && !document.fonts.check(font)) document.fonts.load(font).then(() => { if (document.fonts.check(font)) { m.city.rebuild(); if (m.screen === 'shopmap') renderShopCard(m); } }).catch(() => {});
  }
  m.city.isOpen = isOpen;
  m.city.sel = m.shopSel;
  renderShopCard(m);
  m.city.mount(m.body.querySelector('.sm-city'));
  // 選んだお店は「見出し」と「情報カード」の間に来るように(名札は建物の上に出るので少し下寄せ)
  const vh = m.body.clientHeight || 1, head = m.body.querySelector('.sm-head')?.getBoundingClientRect(), card = m.body.querySelector('.sm-card')?.getBoundingClientRect(), top = m.body.getBoundingClientRect().top;
  if (head && card) { m.city.band = { top: head.bottom - top, bottom: card.top - top }; m.city.focusY = Math.min(0.7, ((head.bottom - top + card.top - top) / 2 + 56) / vh); }
  m.city.select(m.shopSel, { snap: true, silent: true });
}

function renderShopCard(m) {
  const s = shopById(m.shopSel), el = m.body.querySelector('.sm-card');
  if (!s || !el) return;
  const open = isShopOpen(m.progress, s), pr = shopProgress(m.progress, s, Config.difficultyOrder);
  const thumb = m.city?.snapshot(s.id) ?? '';
  el.style.setProperty('--ac', s.theme.accent);
  el.style.setProperty('--gl', s.theme.glow);
  el.classList.toggle('locked', !open);
  el.innerHTML = `
    <span class="sm-thumb" style="background-image:url('${thumb}')">${open ? '' : '<i class="cm-lock" aria-hidden="true"></i>'}</span>
    <span class="sm-info">
      <span class="sm-name"><b class="script">${esc(s.name)}</b><small>${esc(s.ja)}</small></span>
      ${s.concept ? `<span class="sm-concept">${esc(s.concept)}</span>` : ''}
      <p>${phrase(s.intro ?? s.tagline)}</p>
      <span class="sm-prog">${open
        ? `<i>キャスト ${pr.total}人</i><i>攻略 ${pr.cleared} / ${pr.total}</i><i class="mk">♥ ${pr.marks} / ${pr.maxMarks}</i>`
        : `<i class="lock">🔒 ${esc(shopLockText(s))}</i>`}</span>
    </span>
    <button type="button" class="sm-enter" data-act="enter" ${open ? '' : 'disabled'}>${open ? '<b>入店する</b><small>ENTER</small>' : '<b>準備中</b><small>SOON</small>'}</button>`;
  el.querySelector('[data-act="enter"]')?.addEventListener('click', () => enterShop(m, s.id));
}

function enterShop(m, id) {
  const s = shopById(id);
  if (!s || !isShopOpen(m.progress, s)) return;
  m.city?.stop();
  m.router.go('shop', { shopId: id });
}

// ---------------- ② お店の中:キャスト一覧 ----------------
const FILTERS = [['all', 'すべて', '♡'], ['open', '攻略可能', '♢'], ['locked', '未解放', '🔒'], ['clear', 'クリア済', '♛']];

export function showShop(m, { shopId } = {}) {
  const s = shopById(shopId ?? m.shopSel) ?? SHOPS[0];
  m.shopSel = s.id;
  m.frame('shop', s.name, s.ja);
  const I = s.theme.interior;
  m.body.innerHTML = `
    <div class="shp" data-style="${esc(s.map?.style ?? '')}" style="--ac:${s.theme.accent};--gl:${s.theme.glow};--w1:${I.wall};--w2:${I.wall2};--cu:${I.curtain};--li:${I.light};--sg:${I.sign}">
      <div class="shp-hero">
        <div class="shp-room" aria-hidden="true">
          ${motifWall(s.map?.style)}
          <i class="shp-win w1"><i class="shp-lace l"></i><i class="shp-lace r"></i></i>
          <i class="shp-win w2"><i class="shp-lace l"></i><i class="shp-lace r"></i></i>
          ${garland()}
          <span class="shp-sign"><b class="script">${esc(s.name)}</b></span>
          <i class="shp-wains"></i>
          <i class="shp-floor"></i>
          ${cafeTable('t1')}${cafeTable('t2')}
          <i class="shp-bokeh"></i>
        </div>
        ${capTop(true)}
        <div class="shp-title">
          ${s.concept ? `<span class="shp-concept">${esc(s.concept)}</span>` : ''}
          <h1><b class="script">${esc(s.name)}</b><span>${esc(s.ja)}</span></h1>
          <p>${phrase(s.tagline)}</p>
          <button type="button" class="shp-detail" data-act="detail">お店の詳細<i>›</i></button>
        </div>
      </div>
      <nav class="shp-filters" role="tablist">${FILTERS.map(([id, label, ic]) => `<button type="button" role="tab" data-filter="${id}"><i>${ic}</i>${label}</button>`).join('')}</nav>
      <div class="shp-list"></div>
    </div>`;
  m.body.querySelector('[data-act="back"]').addEventListener('click', () => m.router.back());
  m.body.querySelector('[data-act="detail"]').addEventListener('click', () => openShopDetail(m, s));
  for (const b of m.body.querySelectorAll('[data-filter]')) b.addEventListener('click', () => { m.castFilter = b.dataset.filter; renderCasts(m, s); });
  renderCasts(m, s);
}

function castState(m, stage) {
  const order = Config.difficultyOrder;
  return order.map((id) => ({ id, D: difficultyData(id), open: m.progress.isDifficultyUnlocked(stage.id, id, order), clear: m.progress.isCleared(stage.id, id) }));
}

function renderCasts(m, s) {
  const filter = m.castFilter ?? 'all';
  for (const b of m.body.querySelectorAll('[data-filter]')) { const on = b.dataset.filter === filter; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); }
  const casts = castsOf(s).map((c) => ({ ...c, st: castState(m, c.stage) }));
  const soon = Array.from({ length: s.soonSlots ?? 0 }, () => null);
  const show = [
    ...casts.filter((c) => filter === 'all' || filter === 'open' || (filter === 'clear' && c.st.some((x) => x.clear))),
    ...(filter === 'all' || filter === 'locked' ? soon : []),
  ];
  const list = m.body.querySelector('.shp-list');
  list.innerHTML = show.length ? show.map((c, k) => (c ? castCard(c, k) : soonCard(k))).join('') : '<p class="shp-empty">まだいません</p>';
  for (const b of list.querySelectorAll('[data-stage]')) b.addEventListener('click', () => m.router.go('cast', { stageId: b.dataset.stage }));
}

/** キャスト = このお店で働く攻略相手。1行1人の横長カード(左に大きな立ち絵 / 名前・攻略状態・難易度 / 右に遷移アイコン)*/
function castCard({ heroine, stage, st }, k) {
  const all = st.every((x) => x.clear), open = st.some((x) => x.open);
  const state = all ? ['done', '♛ 完全攻略'] : open ? ['open', '♡ 攻略可能'] : ['lock', '🔒 ロック中'];
  return `<button type="button" class="cc" data-cast="${esc(heroine.id)}" data-stage="${esc(stage.id)}" style="--i:${k}" aria-label="${esc(stage.boss.name)}(${state[1].slice(2)})">
    <span class="cc-art face-crop">${faceCrop(stage)}</span>
    <span class="cc-body">
      <span class="cc-name"><b>${esc(stage.boss.name)}</b></span>
      <span class="cc-state ${state[0]}">${state[1]}</span>
      <span class="cc-diffs">${st.map((x) => `<i class="${x.clear ? 'clear' : x.open ? 'open' : 'lock'}" style="--dc:${x.D.color}">${x.D.label}${x.clear ? '<b>✓</b>' : x.open ? '' : '<b>🔒</b>'}</i>`).join('')}</span>
    </span>
    <i class="cc-go" aria-hidden="true">›</i></button>`;
}
function soonCard(k) {
  return `<div class="cc soon" style="--i:${k}" aria-label="近日登場(未解放)">
    <span class="cc-art"><i class="cc-soon">COMING<br>SOON</i></span>
    <span class="cc-body"><span class="cc-name"><b>？？？</b></span><span class="cc-state lock">🔒 未解放</span><span class="cc-diffs"><i>???</i><i>???</i><i>???</i></span></span>
    <i class="cc-go" aria-hidden="true">🔒</i></div>`;
}

function openShopDetail(m, s) {
  const pr = shopProgress(m.progress, s, Config.difficultyOrder);
  const el = document.createElement('div');
  el.className = 'shp-pop';
  el.innerHTML = `<div class="shp-popbox" role="dialog" aria-modal="true" style="--ac:${s.theme.accent}">
    <header><b class="script">${esc(s.name)}</b><span>${esc(s.ja)}</span></header>
    <p>${phrase(s.detail ?? s.intro)}</p>
    <dl><div><dt>キャスト</dt><dd>${pr.total}人${s.soonSlots ? `<small> + 近日 ${s.soonSlots}</small>` : ''}</dd></div><div><dt>攻略</dt><dd>${pr.cleared} / ${pr.total}</dd></div><div><dt>難易度クリア</dt><dd>♥ ${pr.marks} / ${pr.maxMarks}</dd></div></dl>
    <button type="button" data-act="close">閉じる</button></div>`;
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('[data-act="close"]').addEventListener('click', close);
  m.body.appendChild(el);
}

/** 天井のガーランド(三角の小旗)+ ペンダントライト。色は CSS 変数 --ac / --li */
function garland() {
  const flags = Array.from({ length: 11 }, (_, i) => { const x = 8 + i * 18.4, y = 14 + Math.sin((i / 10) * Math.PI) * 12; return `<path class="${i % 2 ? 'f2' : 'f1'}" d="M${x - 7} ${y - 2} L${x + 7} ${y - 1} L${x} ${y + 11}z"/>`; }).join('');
  const lamps = [44, 100, 156].map((x, i) => `<line x1="${x}" y1="0" x2="${x}" y2="${i === 1 ? 40 : 30}"/><path class="sh" d="M${x - 11} ${(i === 1 ? 52 : 42)} Q${x} ${(i === 1 ? 34 : 24)} ${x + 11} ${(i === 1 ? 52 : 42)}z"/><circle class="bulb" cx="${x}" cy="${(i === 1 ? 53 : 43)}" r="3.6"/>`).join('');
  return `<svg class="shp-garland" viewBox="0 0 200 70" preserveAspectRatio="none" aria-hidden="true"><path class="rope" d="M0 12 Q100 40 200 12"/>${flags}${lamps}</svg>`;
}
/** 壁紙のモチーフ(お店のコンセプトごと:リボン / 肉球 / 星 / バラ / 桜 / ケーキ)*/
const MOTIF = {
  maid: '<path d="M12 12 q-7 -6 -8 1 q1 5 8 -1 q7 6 8 -1 q-1 -7 -8 1z"/><circle cx="12" cy="12" r="1.8"/>',
  cat: '<ellipse cx="12" cy="14" rx="4" ry="3.4"/><circle cx="6.5" cy="9" r="1.8"/><circle cx="10" cy="6.5" r="1.8"/><circle cx="14" cy="6.5" r="1.8"/><circle cx="17.5" cy="9" r="1.8"/>',
  star: '<path d="M12 3 l2.4 6 6.4 .4 -5 4 1.7 6.3 -5.5 -3.6 -5.5 3.6 1.7 -6.3 -5 -4 6.4 -.4z"/>',
  gothic: '<circle cx="12" cy="10" r="4.4"/><path d="M12 14 q-1 5 -5 6 M12 14 q1 5 5 6" fill="none" stroke-width="1.4"/>',
  wa: '<g transform="translate(12 12)">' + [0, 72, 144, 216, 288].map((a) => `<ellipse rx="2.6" ry="4.4" transform="rotate(${a}) translate(0 -4.4)"/>`).join('') + '</g>',
  sweets: '<path d="M5 14 h14 l-2 6 h-10z"/><path d="M5 14 q0 -7 7 -7 q7 0 7 7z"/><circle cx="12" cy="5.6" r="1.8"/>',
};
function motifWall(style) {
  const m = MOTIF[style] ?? MOTIF.maid;
  return `<svg class="shp-motif" aria-hidden="true"><defs><pattern id="shpMotif" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)"><g transform="translate(11 11)">${m}</g></pattern></defs><rect width="100%" height="100%" fill="url(#shpMotif)"/></svg>`;
}
/** カフェのテーブル(白いクロス + ティーカップ + ケーキ)*/
function cafeTable(cls) {
  return `<svg class="shp-table ${cls}" viewBox="0 0 100 56" aria-hidden="true"><ellipse class="sd" cx="50" cy="52" rx="40" ry="4"/><path class="leg" d="M48 30 h4 v20 h-4z"/><ellipse class="top" cx="50" cy="26" rx="44" ry="10"/><path class="cloth" d="M8 26 q42 18 84 0 v5 q-6 6 -10 2 q-6 6 -12 1 q-8 6 -16 1 q-8 6 -16 0 q-6 6 -12 0 q-6 5 -10 -1 q-5 4 -8 -1z"/><path class="cup" d="M30 14 h12 v5 q0 5 -6 5 q-6 0 -6 -5z"/><path class="cupr" d="M42 15.5 q4 0 3 3 q-1 2 -3 1.6" fill="none"/><ellipse class="sau" cx="36" cy="24" rx="9" ry="2"/><path class="cake" d="M56 11 l14 4 v8 h-14z"/><path class="cream" d="M56 11 l14 4 v2 l-14 -4z"/><circle class="berry" cx="62" cy="10.5" r="2.4"/></svg>`;
}
