import { stageById } from './GameData.js';
import { heroineById } from './RomanceData.js';

/**
 * 攻略の「お店」(夜の街のコンカフェ / ラウンジ)。攻略は お店 → 所属キャスト → 攻略(挑戦する)の3段階
 *
 *   お店・キャストの追加はここにデータを足すだけ(画面・マップはデータから作る):
 *     casts      … 所属キャストの heroineId(一覧の並び順)。キャスト ↔ ステージは RomanceData.HEROINES[].stageId
 *     soonSlots  … 一覧の最後に出す「近日登場」の枠の数(シルエット)
 *     unlock     … null = 最初から入れる / { type: 'soon' } = 準備中 / { type: 'clear', stageId, difficulty } = クリアで入店できる
 *     map        … 夜の街マップ上の位置(u, v = マップ全体の 0〜1)・建物の形(style)・名札の向き(label)
 *     theme      … お店の色(accent / glow / wall / roof)と内装(interior)
 *     badge      … 名札に付ける小さな札(例:'NEW')。省略可
 */
export const SHOPS = [
  {
    id: 'eclat', name: 'Éclat', ja: 'エクラ',
    tagline: '甘くて、ちょっと危険な大人のコンカフェ。',
    intro: '甘くて、ちょっと危険な大人のコンカフェ。今夜、特別な出会いを——',
    detail: 'シャンデリアの灯りとワインレッドのカーテン。小悪魔なキャストたちが、あなたのハートを待っている。',
    casts: ['lilith', 'siren', 'milk'], soonSlots: 1, unlock: null,
    map: { u: 0.36, v: 0.5, style: 'palace', size: 3, label: 'left' },
    theme: { accent: '#ff4fa3', glow: '#ff86c4', wall: '#3a1a33', roof: '#2b1030', window: '#ffc9a0',
      interior: { wall: '#2a0a18', wall2: '#4a0f26', curtain: '#7a1435', light: '#ffc9e0', sign: '#ff5fae' } },
  },
  {
    id: 'moonlight', name: 'Moonlight', ja: 'ムーンライト',
    tagline: '月明かりの下、静かに微笑むラウンジ。',
    intro: '月明かりの下、静かに微笑むラウンジ。',
    casts: [], soonSlots: 3, unlock: { type: 'soon' },
    map: { u: 0.74, v: 0.36, style: 'manor', size: 3, label: 'left' },
    theme: { accent: '#9fb4ff', glow: '#c3cfff', wall: '#22264a', roof: '#1a1d3a', window: '#cfe0ff',
      interior: { wall: '#0c1230', wall2: '#1b2350', curtain: '#2a3470', light: '#dfe6ff', sign: '#a9bcff' } },
  },
  {
    id: 'noir', name: 'Noir', ja: 'ノワール',
    tagline: '黒薔薇の香る、秘密のバー。',
    intro: '黒薔薇の香る、秘密のバー。',
    casts: [], soonSlots: 3, unlock: { type: 'soon' },
    map: { u: 0.8, v: 0.58, style: 'tower', size: 2, label: 'left' },
    theme: { accent: '#c86bff', glow: '#dda6ff', wall: '#1d1426', roof: '#120b1a', window: '#e3b8ff',
      interior: { wall: '#0d0812', wall2: '#22122e', curtain: '#3a1650', light: '#e9c8ff', sign: '#c86bff' } },
  },
  {
    id: 'lumiere', name: 'Lumière', ja: 'ルミエール',
    tagline: '光あふれる、お嬢様たちのサロン。',
    intro: '光あふれる、お嬢様たちのサロン。',
    casts: [], soonSlots: 3, unlock: { type: 'soon' },
    map: { u: 0.18, v: 0.72, style: 'dome', size: 3, label: 'right' },
    theme: { accent: '#ffc46b', glow: '#ffe0a8', wall: '#3a2a2c', roof: '#2a1f30', window: '#ffe2a8',
      interior: { wall: '#2a1a0c', wall2: '#4a3016', curtain: '#7a5420', light: '#fff0cc', sign: '#ffc46b' } },
  },
  {
    id: 'reve', name: 'Rêve', ja: 'レーヴ',
    tagline: '夢と現のあいだ、幻想のティーハウス。',
    intro: '夢と現のあいだ、幻想のティーハウス。',
    casts: [], soonSlots: 3, unlock: { type: 'soon' },
    map: { u: 0.64, v: 0.84, style: 'gazebo', size: 2, label: 'left' },
    theme: { accent: '#6fe3d0', glow: '#b4fff1', wall: '#1c2c36', roof: '#142028', window: '#c8fff4',
      interior: { wall: '#081a1c', wall2: '#123236', curtain: '#1d4a4e', light: '#dcfff8', sign: '#6fe3d0' } },
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
