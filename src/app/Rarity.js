/**
 * レアリティの共通ルール(すべてのキャラクターカードで同じ見た目)
 *   N = シルバー / グレー ・ R = ブルー ・ SR = パープル ・ SSR = ゴールド + ピンク(発光 + 控えめなキラキラ)
 *
 * 使い方(どの画面でも同じ):
 *   カードの要素に class="rar-frame" と rarityAttr(rank)      → 枠(グラデーションのリング)・影
 *   カードの中に rarityBadge(rank)                            → N / R / SR / SSR の表記
 *   カードの中に raritySparkle(rank)                          → SSR だけキラキラ・光のすじ・パール(ほかは空)
 *   カードの中に charAccent(ch)                               → キャラ固有のアクセント(あるキャラだけ。レアリティとは別)
 * 色・光の強さは online.html の「レアリティ(全キャラクターカード共通)」の CSS 変数だけで決まる
 */
export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR'];
export const rarityId = (rank) => (RARITY_ORDER.includes(rank) ? rank : 'N');
export const rarityAttr = (rank) => `data-rarity="${rarityId(rank)}"`;
export const rarityBadge = (rank, cls = '') => `<i class="rar-badge${cls ? ` ${cls}` : ''}" data-rarity="${rarityId(rank)}">${rarityId(rank)}</i>`;
// SSR 共通:キラキラ(Sparkle)+ 光のすじ(Shimmer)+ 四隅のパール。どの SSR でも同じ
export const raritySparkle = (rank) => (rarityId(rank) === 'SSR' ? '<i class="rar-sparkle" aria-hidden="true"><i class="rar-shimmer"></i><i class="rar-pearl"></i></i>' : '');
/**
 * キャラ固有のアクセント(CharacterData.accent)。レアリティ共通の枠・光とは別の要素で重ねる(枠の CSS は触らない)
 *   例:ヨルナ = 紫〜ダークピンクのごく薄い光。accent が無いキャラは空
 */
export const charAccent = (ch) => (ch?.accent ? `<i class="char-accent" data-accent="${String(ch.accent.id ?? ch.id).replace(/[^\w-]/g, '')}" style="--accent:${String(ch.accent.glow ?? '#b14dff').replace(/[^#\w(),.% -]/g, '')}" aria-hidden="true"></i>` : '');
/** 要素(既にある DOM)にレアリティの見た目を付ける */
export function applyRarity(el, rank) { if (el) el.dataset.rarity = rarityId(rank); return el; }
