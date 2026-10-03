/**
 * コレクションの並び替え(表示順だけ。所持データの保存順は変えない)
 *   COLLECTION_SORTS[カテゴリ] = { def: 既定の条件, options: [{ key, label, dirs?: { desc, asc }, defDir?, value(x) }] }
 *     dirs がある項目 … 同じ項目をもう一度選ぶと 高い順 ⇄ 低い順 を切り替える
 *     dirs が無い項目 … 向きは1つ(名前順など)
 *     value(x)        … 並べる値(数値 / 文字列)。null は向きに関係なく後ろ
 *   選んだ条件は settings.collectionSort[カテゴリ] に保存(カテゴリごと・リロード後も残る)
 *   新しいカテゴリは COLLECTION_SORTS に1件足すだけ
 */
const HIGH_LOW = { desc: '高い順', asc: '低い順' };
const NEW_OLD = { desc: '新しい順', asc: '古い順' };
const MANY_FEW = { desc: '多い順', asc: '少ない順' };

export const COLLECTION_SORTS = {
  items: {
    def: { key: 'acquired', dir: 'desc' },
    options: [
      { key: 'acquired', label: '入手順', dirs: NEW_OLD, defDir: 'desc', value: (x) => x.acquiredAt ?? 0 },   // 入手時刻が無い(この機能より前に入手)= いちばん古い
      { key: 'count', label: '所持数', dirs: MANY_FEW, defDir: 'desc', value: (x) => x.count },
      { key: 'rarity', label: 'レアリティ', dirs: HIGH_LOW, defDir: 'desc', value: (x) => x.rank?.order ?? null },
      { key: 'name', label: '名前順', value: (x) => x.name },
    ],
  },
  ally: {
    def: { key: 'acquired', dir: 'desc' },
    options: [
      { key: 'acquired', label: '入手順', dirs: NEW_OLD, defDir: 'desc', value: (x) => x.obtainedAt ?? 0 },
      { key: 'level', label: 'レベル', dirs: HIGH_LOW, defDir: 'desc', value: (x) => x.level },
      { key: 'rarity', label: 'レアリティ', dirs: HIGH_LOW, defDir: 'desc', value: (x) => x.rankOrder },
      { key: 'atk', label: 'ATK', dirs: HIGH_LOW, defDir: 'desc', value: (x) => x.atk },
      { key: 'hp', label: 'HP', dirs: HIGH_LOW, defDir: 'desc', value: (x) => x.hp },
      { key: 'name', label: '名前順', value: (x) => x.name },
    ],
  },
  heroine: {
    def: { key: 'progress', dir: 'asc' },
    options: [
      { key: 'progress', label: '攻略進行順', value: (x) => x.stageNo },
      { key: 'clearedFirst', label: '攻略済み優先', value: (x) => x.clears, fixedDir: 'desc' },
      { key: 'unclearedFirst', label: '未攻略優先', value: (x) => x.clears, fixedDir: 'asc' },
      { key: 'name', label: '名前順', value: (x) => x.name },
    ],
  },
};

const optionOf = (cat, key) => COLLECTION_SORTS[cat]?.options.find((o) => o.key === key) ?? null;

/** 保存されている条件(壊れていたら既定)*/
export function currentSort(settings, cat) {
  const S = COLLECTION_SORTS[cat], saved = settings?.collectionSort?.[cat];
  const o = optionOf(cat, saved?.key);
  if (!o) return { ...S.def };
  return { key: o.key, dir: o.dirs ? (saved.dir === 'asc' ? 'asc' : 'desc') : o.fixedDir ?? 'asc' };
}

/** 項目を選んだ時の次の条件:同じ項目(向きあり)なら向きを反転、違う項目ならその項目の既定の向き */
export function nextSort(cur, cat, key) {
  const o = optionOf(cat, key);
  if (!o) return cur;
  if (!o.dirs) return { key, dir: o.fixedDir ?? 'asc' };
  if (cur.key === key) return { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' };
  return { key, dir: o.defDir ?? 'desc' };
}

/** 「レベル 高い順」/「名前順」*/
export function sortLabel(cat, sort) {
  const o = optionOf(cat, sort.key);
  if (!o) return '';
  return o.dirs ? `${o.label} ${o.dirs[sort.dir]}` : o.label;
}

/**
 * 並べ替えた新しい配列を返す(元の配列は変えない)。
 *   同じ値は元の順(定義順)のまま。値が null(入手時刻が無い古いセーブなど)は向きに関係なく後ろ
 */
export function sortList(list, cat, sort) {
  const o = optionOf(cat, sort.key);
  if (!o) return [...list];
  const sign = sort.dir === 'desc' ? -1 : 1;
  return list.map((x, i) => ({ x, i, v: o.value(x) })).sort((a, b) => {
    const an = a.v == null, bn = b.v == null;
    if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
    const c = typeof a.v === 'string' || typeof b.v === 'string' ? String(a.v).localeCompare(String(b.v), 'ja') : a.v - b.v;
    return c ? c * sign : a.i - b.i;
  }).map((e) => e.x);
}
