/**
 * レアリティの共通ルール(すべてのキャラクターカードで同じ見た目)
 *   N = シルバー / グレー ・ R = ブルー ・ SR = パープル ・ SSR = ゴールド + ピンク(発光 + 控えめなキラキラ)
 *
 * 使い方(どの画面でも同じ):
 *   カードの要素に class="rar-frame" と rarityAttr(rank)      → 枠(グラデーションのリング)・影
 *   カードの中に rarityBadge(rank)                            → N / R / SR / SSR の表記
 *   カードの中に raritySparkle(rank)                          → SSR だけキラキラ(ほかは空)
 * 色・光の強さは online.html の「レアリティ(全キャラクターカード共通)」の CSS 変数だけで決まる
 */
export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR'];
export const rarityId = (rank) => (RARITY_ORDER.includes(rank) ? rank : 'N');
export const rarityAttr = (rank) => `data-rarity="${rarityId(rank)}"`;
export const rarityBadge = (rank, cls = '') => `<i class="rar-badge${cls ? ` ${cls}` : ''}" data-rarity="${rarityId(rank)}">${rarityId(rank)}</i>`;
export const raritySparkle = (rank) => (rarityId(rank) === 'SSR' ? '<i class="rar-sparkle" aria-hidden="true"></i>' : '');
/** 要素(既にある DOM)にレアリティの見た目を付ける */
export function applyRarity(el, rank) { if (el) el.dataset.rarity = rarityId(rank); return el; }
