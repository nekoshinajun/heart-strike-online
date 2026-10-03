import { stageById } from './GameData.js';
import { heroineById } from './RomanceData.js';

/**
 * 攻略の「お店」(コンカフェ街のメイドカフェ / コンセプトカフェ)。攻略は お店 → 所属キャスト → 攻略(挑戦する)の3段階
 *   「個性豊かなコンセプトカフェを巡って、かわいいキャストを攻略していく」。お店ごとにコンセプト・外観・内装が違う
 *
 *   お店・キャストの追加はここにデータを足すだけ(画面・マップはデータから作る):
 *     concept    … お店のコンセプト(一覧・情報カードに出す短い説明。例:'猫メイドカフェ')
 *     casts      … 所属キャストの heroineId(一覧の並び順)。キャスト ↔ ステージは RomanceData.HEROINES[].stageId
 *     soonSlots  … 一覧の最後に出す「近日登場」の枠の数(シルエット)
 *     unlock     … null = 最初から入れる / { type: 'soon' } = 準備中 / { type: 'clear', stageId, difficulty } = クリアで入店できる
 *     map        … コンカフェ街マップ上の位置(u, v = マップ全体の 0〜1)・外観(style)・名札の向き(label)
 *                  style:'maid'(王道メイド)/ 'cat'(猫)/ 'star'(星・宇宙)/ 'gothic'(ゴシック)/ 'wa'(和風)/ 'sweets'(スイーツ)
 *     theme      … お店の色(accent / glow / wall / roof / window / trim)と内装(interior:壁・腰板・カーテン・灯り・看板)
 *     badge      … 名札に付ける小さな札(例:'NEW')。省略可
 */
export const SHOPS = [
  {
    id: 'eclat', name: 'Éclat', ja: 'エクラ', concept: 'ゴシックメイドカフェ',
    tagline: '薔薇とレースの、ちょっぴり小悪魔なゴシックメイドカフェ。',
    intro: '薔薇とレースに囲まれた、ちょっぴり小悪魔なゴシックメイドカフェ。ティータイムのおともに、特別な出会いを——',
    detail: 'ステンドグラスのやわらかな光と、ラベンダー色のレースのカーテン。アンティークの家具が並ぶ店内で、小悪魔なキャストたちがあなたを待っている。',
    casts: ['lilith', 'siren'], soonSlots: 1, unlock: null,
    map: { u: 0.36, v: 0.5, style: 'gothic', size: 3, label: 'left' },
    theme: { accent: '#a879d8', glow: '#e4cdfa', wall: '#efe6f6', roof: '#8e74b8', window: '#fff1d2', trim: '#ffffff',
      interior: { wall: '#f4eef9', wall2: '#d6c4ea', curtain: '#b596d9', light: '#fff0d4', sign: '#8d63bf' } },
  },
  {
    id: 'ruban', name: 'Maison Ruban', ja: 'メゾン・リュバン', concept: '王道メイドカフェ',
    tagline: 'リボンとハートの、王道メイドカフェ。',
    intro: 'リボンとハートの、王道メイドカフェ。「おかえりなさいませ」の声がいちばん似合うお店。',
    casts: [], soonSlots: 3, unlock: { type: 'soon' },
    map: { u: 0.74, v: 0.36, style: 'maid', size: 3, label: 'left' },
    theme: { accent: '#ff7fb0', glow: '#ffd3e4', wall: '#fffaf6', roof: '#f59ac0', window: '#fff3da', trim: '#ffffff',
      interior: { wall: '#fff6f8', wall2: '#f7c9da', curtain: '#ff9cc2', light: '#fff1d6', sign: '#f2679e' } },
  },
  {
    id: 'stella', name: 'Stella', ja: 'ステラ', concept: '星と月のコンセプトカフェ',
    tagline: '星降る天文台の、ちょっと不思議なコンセプトカフェ。',
    intro: '星降る天文台の、ちょっと不思議なコンセプトカフェ。',
    casts: ['rato'], soonSlots: 2, unlock: null, badge: 'NEW',
    map: { u: 0.8, v: 0.58, style: 'star', size: 2, label: 'left' },
    theme: { accent: '#7f97f0', glow: '#d2dcff', wall: '#e6eaff', roof: '#8a92dc', window: '#fff6d6', trim: '#ffffff',
      interior: { wall: '#eef0ff', wall2: '#c9d0f5', curtain: '#9fb0f2', light: '#fff4d8', sign: '#6f83de' } },
  },
  {
    id: 'lumiere', name: 'Lumière', ja: 'ルミエール', concept: '猫メイドカフェ',
    tagline: '猫耳メイドがお出迎え。ひだまりの猫メイドカフェ。',
    intro: '猫耳メイドがお出迎え。ひだまりのような猫メイドカフェで、甘えん坊のキャストがにゃんとお待ちかね——',
    detail: '大きな窓から差し込むひだまりと、木のぬくもり。肉球マークのティーカップで、ゆっくりひと休みしていって。',
    casts: ['milk'], soonSlots: 2, unlock: null, badge: 'NEW',   // みるくは Éclat から Lumière へ移籍(所属はここだけで決まる)
    map: { u: 0.18, v: 0.72, style: 'cat', size: 3, label: 'right' },
    theme: { accent: '#f59a6c', glow: '#ffdcc2', wall: '#fff3e3', roof: '#e8a274', window: '#fff6d8', trim: '#ffffff',
      interior: { wall: '#fff6ea', wall2: '#e6c39c', curtain: '#ffb48c', light: '#fff1cf', sign: '#e07f4f' } },
  },
  {
    id: 'mille', name: 'Pâtisserie Mille', ja: 'パティスリー・ミル', concept: 'スイーツメイドカフェ',
    tagline: 'ケーキの香りに包まれる、スイーツメイドカフェ。',
    intro: 'ケーキの香りに包まれる、スイーツメイドカフェ。',
    casts: [], soonSlots: 3, unlock: { type: 'soon' },
    map: { u: 0.64, v: 0.84, style: 'sweets', size: 2, label: 'left' },
    theme: { accent: '#43c2ad', glow: '#c8f2e9', wall: '#fff2f4', roof: '#ffb3c4', window: '#fff6dc', trim: '#ffffff',
      interior: { wall: '#f2fbf8', wall2: '#bfe9df', curtain: '#ffb3c4', light: '#fff4dc', sign: '#2fa995' } },
  },
  {
    id: 'sakura', name: 'Sakura', ja: '桜茶房', concept: '和風メイドカフェ',
    tagline: '桜と抹茶の、はんなり和風メイドカフェ。',
    intro: '桜と抹茶の、はんなり和風メイドカフェ。',
    casts: [], soonSlots: 3, unlock: { type: 'soon' },
    map: { u: 0.3, v: 0.17, style: 'wa', size: 2, label: 'right' },
    theme: { accent: '#7aae62', glow: '#d6edc8', wall: '#f7ecdb', roof: '#6c8a95', window: '#fff3d8', trim: '#c9965f',
      interior: { wall: '#f8f1e4', wall2: '#cfa979', curtain: '#9ccb86', light: '#fff2d2', sign: '#5f9448' } },
  },
];

export const shopById = (id) => SHOPS.find((s) => s.id === id) ?? null;
/** キャスト(heroineId)が所属するお店 */
export const shopOfHeroine = (heroineId) => SHOPS.find((s) => s.casts.includes(heroineId)) ?? null;
/** ステージ(= キャストの攻略)が属するお店 */
export const shopOfStage = (stageId) => SHOPS.find((s) => s.casts.some((id) => heroineById(id)?.stageId === stageId)) ?? null;

/** お店のキャスト一覧 → [{ heroine, stage }](データが欠けたキャストは出さない)*/
export function castsOf(shop) {
  return (shop?.casts ?? []).map((id) => {
    const heroine = heroineById(id), stage = heroine ? stageById(heroine.stageId) : null;
    return heroine && stage ? { heroine, stage } : null;
  }).filter(Boolean);
}

/** 入店できるか(準備中 / クリア条件)*/
export function isShopOpen(progress, shop) {
  const u = shop?.unlock;
  if (!u) return true;
  if (u.type === 'clear') return progress.isCleared(u.stageId, u.difficulty);
  return false;
}

/** お店の入店条件の説明 */
export function shopLockText(shop) {
  const u = shop?.unlock;
  if (!u) return '';
  if (u.type === 'clear') { const st = stageById(u.stageId); return `STAGE ${st?.no ?? '?'} ${u.difficulty ?? ''}クリアで入店`; }
  return 'COMING SOON';
}

/** お店の進み具合 → { total, cleared(どれかの難易度でクリアしたキャスト), mastered(全難易度クリア), marks(クリアした難易度の数), maxMarks } */
export function shopProgress(progress, shop, order = ['NORMAL', 'HARD', 'HELL']) {
  const casts = castsOf(shop);
  let cleared = 0, mastered = 0, marks = 0;
  for (const { stage } of casts) {
    const n = order.filter((d) => progress.isCleared(stage.id, d)).length;
    marks += n; if (n) cleared++; if (n === order.length) mastered++;
  }
  return { total: casts.length, cleared, mastered, marks, maxMarks: casts.length * order.length };
}
