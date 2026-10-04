import { GIFTS, GIFT_RANKS, giftName, giftIcon, giftRank, giftExp } from './RomanceData.js';
import { ABILITY_RESET_ITEM, FAVORITE_GIFT_MUL } from './GrowthData.js';

/**
 * コレクション「所持アイテム」の定義(表示用のカタログ)。
 *   所持数はここでは持たない:各アイテムの count(progress) が既存の所持データ(PlayerProgress.inventory)をそのまま読む。
 *
 *   ITEM_CATEGORIES … 種類(表示順・絞り込みのチップ)。新しい種類はここに1件足す
 *   EXTRA_ITEMS     … プレゼント / リコネクトハート以外のアイテム(イベントアイテム・交換アイテム・強化素材など)。
 *                     ここに1件足すだけでコレクションに出る(所持数は inventory.goods[id]、増やすのは progress.addGoods(id, n))
 *                     1件の形:{ id, category, name, icon, image?, rank?, desc, usage, source? }
 *
 * 1件の形(collectionItems() が返すもの)
 *   key      … 一意のキー(`${category}:${id}`)。入手時刻 inventory.acquiredAt のキーにも使う
 *   category / name / icon / image / desc / usage / source
 *   rank     … レアリティ { id, label, order, color }(無いアイテムは null)
 *   count(p) … 今の所持数(PlayerProgress から読む)
 */
export const ITEM_CATEGORIES = [
  { id: 'present', label: 'プレゼント', icon: '🎁' },
  { id: 'growth', label: '育成', icon: '✦' },
  { id: 'event', label: 'イベント', icon: '🎪' },
  { id: 'exchange', label: '交換', icon: '🔁' },
  { id: 'material', label: '強化素材', icon: '🔧' },
];

/** 今後のアイテム(イベント / 交換 / 強化素材など)。★ まだ無い */
export const EXTRA_ITEMS = [];

const presentItem = (g, i) => ({
  key: `present:${g.id}`, id: g.id, category: 'present', order: i,
  name: giftName(g), icon: giftIcon(g), image: g.image ?? null, rank: giftRank(g),
  desc: g.desc ?? '味方の女の子に渡せるプレゼント。気持ちを込めて渡すと喜んでくれます。',
  usage: g.usage ?? `育成 → キャラクター詳細 →「プレゼント」で渡すと 親密度 EXP +${giftExp(g)}(好きな種類なら ×${FAVORITE_GIFT_MUL})`,
  source: g.source ?? 'ガチャのおまけ / 攻略のクリア報酬',
  count: (p) => p.itemCount(g.id),
});

const abilityItem = {
  key: `growth:${ABILITY_RESET_ITEM.id}`, id: ABILITY_RESET_ITEM.id, category: 'growth', order: 0,
  name: ABILITY_RESET_ITEM.name, icon: ABILITY_RESET_ITEM.icon, image: null, rank: null,
  desc: 'もう一度つながり直すためのハート。選んだアビリティを付け替えられます。',
  usage: '現在アビリティの付け替えは無料のため、使う場面はありません',
  source: null,
  count: (p) => p.abilityResetItems,
};

const rankOf = (id) => (id ? GIFT_RANKS.find((r) => r.id === id) ?? null : null);
const extraItem = (x, i) => ({
  key: `goods:${x.id}`, id: x.id, category: x.category ?? 'event', order: i,
  name: x.name, icon: x.icon ?? '🎀', image: x.image ?? null, rank: rankOf(x.rank),
  desc: x.desc ?? '', usage: x.usage ?? '', source: x.source ?? null,
  count: (p) => p.goodsCount(x.id),
});

/** 全アイテム(所持数 0 も含む・定義順)*/
export function collectionItems() {
  return [...GIFTS.map(presentItem), abilityItem, ...EXTRA_ITEMS.map(extraItem)].map((x, i) => ({ ...x, order: i }));
}
export const itemCategory = (id) => ITEM_CATEGORIES.find((c) => c.id === id) ?? { id, label: id, icon: '🎀' };
export const itemByKey = (key) => collectionItems().find((x) => x.key === key) ?? null;
