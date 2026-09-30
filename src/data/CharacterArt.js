import { CHARA_IMAGES } from '../assets/charaImages.js';

/**
 * CharacterData.art のキー → 画像URL。kind: 'portrait' | 'fullBody' | 'specialCutIn'
 * 画像が未登録なら null(呼び出し側は属性色の仮アイコン等にフォールバック)
 */
export function artUrl(ch, kind) {
  const key = ch?.art?.[kind];
  const url = key && CHARA_IMAGES[key];
  if (url) return url;
  if (kind === 'cutout') return artUrl(ch, 'fullBody');   // 切り抜きが無ければ全身イラスト(仮シルエット)
  // 画像未登録のキャラ:全身・カットインは仮のシルエットを出す(アイコンは属性色の仮アイコンのまま)
  if (ch && (kind === 'fullBody' || kind === 'specialCutIn')) return placeholderArt(ch);
  return null;
}

/** 画像が未登録(仮シルエット表示)か */
export function isPlaceholderArt(ch, kind = 'fullBody') {
  const key = ch?.art?.[kind];
  return !(key && CHARA_IMAGES[key]);
}

const ATTR_COLORS = { WATER: ['#bff3ff', '#3ec5ff'], FIRE: ['#ffd9c2', '#ff6a3d'], THUNDER: ['#fff6c2', '#ffd23e'] };
const phCache = new Map();
/** 仮の全身シルエット(SVG・縦 2:3)。本番画像を CharacterData.art に登録すれば自動で置き換わる */
function placeholderArt(ch) {
  if (phCache.has(ch.id)) return phCache.get(ch.id);
  const [c1, c2] = ATTR_COLORS[ch.attribute] ?? ['#ffffff', '#ff7ab8'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 960" width="640" height="960">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="r" cx="0.5" cy="0.35" r="0.6"><stop offset="0" stop-color="${c2}" stop-opacity="0.45"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="320" cy="360" rx="300" ry="420" fill="url(#r)"/>
<g fill="url(#g)" stroke="#1b1030" stroke-width="10" stroke-linejoin="round" opacity="0.92">
<path d="M190 250 Q170 120 320 90 Q470 120 450 250 Q470 380 430 430 L210 430 Q170 380 190 250Z"/>
<circle cx="320" cy="230" r="112"/>
<path d="M235 360 Q320 330 405 360 L440 560 Q470 700 520 760 L120 760 Q170 700 200 560Z"/>
<path d="M232 380 Q150 450 120 560" fill="none" stroke-width="44" stroke-linecap="round"/>
<path d="M408 380 Q500 430 540 330" fill="none" stroke-width="44" stroke-linecap="round"/>
<path d="M260 760 L250 900 M380 760 L390 900" fill="none" stroke-width="46" stroke-linecap="round"/>
</g>
<text x="320" y="245" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="96" fill="#1b1030">${ch.name[0]}</text>
<text x="320" y="940" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="30" fill="#ffffff" opacity="0.8">ILLUSTRATION COMING SOON</text>
</svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  phCache.set(ch.id, url);
  return url;
}

/**
 * 丸アイコン用の background-size / position(顔が中心に来るように)。
 *   画像幅 = 枠幅 × zoom。background-position の % は (枠 - 画像) × P なので逆算する
 */
export function portraitStyle(ch) {
  const url = artUrl(ch, 'portrait');
  if (!url) return null;
  const f = ch.portraitFocus ?? { x: 0.5, y: 0.2, zoom: 4 };
  const k = f.zoom, kh = k * 1.5;           // 縦長 2:3 画像
  const px = ((0.5 - f.x * k) / (1 - k)) * 100;
  const py = ((0.5 - f.y * kh) / (1 - kh)) * 100;
  return `background-image:url('${url}');background-size:${k * 100}% auto;background-position:${px.toFixed(1)}% ${py.toFixed(1)}%`;
}
