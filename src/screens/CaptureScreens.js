import { SHOPS, shopById, castsOf, isShopOpen, shopLockText, shopProgress } from '../data/ShopData.js';
import { BOSS_IMAGES } from '../assets/bossImages.js';
import { Config, difficultyData } from '../core/Config.js';
import { reducedMotion } from '../app/Platform.js';
import { CityMap } from './CityMap.js';

/**
 * 攻略の入口:① お店を選ぶ(夜の街マップ)→ ② お店の中(キャスト一覧)→ ③ キャストの攻略(MenuFlow.showStageSelect)
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
      <header class="sm-head"><h1>お店を選ぶ<em class="script">Shop Select</em></h1><p>今夜は、どのお店に行こう？<i>♡</i></p></header>
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
    <div class="shp" style="--ac:${s.theme.accent};--gl:${s.theme.glow};--w1:${I.wall};--w2:${I.wall2};--cu:${I.curtain};--li:${I.light};--sg:${I.sign}">
      <div class="shp-hero">
        <div class="shp-room" aria-hidden="true">
          <i class="shp-arch a1"></i><i class="shp-arch a2"></i><i class="shp-arch a3"></i>
          <i class="shp-curtain l"></i><i class="shp-curtain r"></i>
          ${chandelier()}
          <span class="shp-neon">${esc(s.name)}</span>
          <i class="shp-floor"></i>
          <i class="shp-table t1"></i><i class="shp-table t2"></i><i class="shp-table t3"></i>
          <i class="shp-bokeh"></i>
        </div>
        ${capTop(true)}
        <div class="shp-title">
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

function castCard({ heroine, stage, st }, k) {
  return `<button type="button" class="cc" data-cast="${esc(heroine.id)}" data-stage="${esc(stage.id)}" style="--i:${k}">
    <span class="cc-art face-crop">${faceCrop(stage)}<i class="cc-heart" aria-hidden="true">♥</i></span>
    <span class="cc-body">
      <span class="cc-name"><b>${esc(stage.boss.name)}</b>${heroine.roman ? `<em class="script">${esc(heroine.roman)}</em>` : ''}</span>
      <p>${phrase(`「${castLine(heroine, stage)}」`)}</p>
      <span class="cc-diffs">${st.map((x) => `<i class="${x.clear ? 'clear' : x.open ? 'open' : 'lock'}" style="--dc:${x.D.color}">${x.D.label}${x.clear ? ' ✓' : x.open ? '' : ' 🔒'}</i>`).join('')}</span>
    </span>
    <i class="cc-go" aria-hidden="true">›</i></button>`;
}
function soonCard(k) {
  return `<div class="cc soon" style="--i:${k}" aria-label="近日登場">
    <span class="cc-art"></span>
    <span class="cc-body"><span class="cc-name"><b>？？？</b></span><p>「…………」</p><span class="cc-diffs"><i>???</i><i>???</i><i>???</i></span></span>
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

/** シャンデリア(SVG)。色は CSS 変数 --li */
function chandelier() {
  const arms = [-3, -2, -1, 1, 2, 3].map((k) => {
    const x = 100 + k * 27, y = 66 + Math.abs(k) * 3;
    return `<path d="M100 58 Q${100 + k * 12} ${84} ${x} ${y}" /><rect x="${x - 2}" y="${y - 10}" width="4" height="10" rx="1"/><circle class="fl" cx="${x}" cy="${y - 13}" r="3.2"/>${[0, 1, 2].map((j) => `<path class="cr" d="M${x - 3 + j * 3} ${y + 4 + j * 2} l2 4 l-2 4 l-2 -4z"/>`).join('')}`;
  }).join('');
  const drops = Array.from({ length: 9 }, (_, i) => { const x = 64 + i * 9, y = 86 + Math.sin((i / 8) * Math.PI) * 10; return `<path class="cr" d="M${x} ${y} l2.5 5 l-2.5 5 l-2.5 -5z"/>`; }).join('');
  return `<svg class="shp-chand" viewBox="0 0 200 120" aria-hidden="true"><line x1="100" y1="0" x2="100" y2="40"/><ellipse cx="100" cy="44" rx="14" ry="5"/><path d="M86 46 Q100 70 114 46"/>${arms}${drops}<ellipse class="glow" cx="100" cy="70" rx="80" ry="34"/></svg>`;
}
