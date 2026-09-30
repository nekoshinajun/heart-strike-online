/**
 * 2Dボス「ルル」の仮イラストをCanvasで描く(外部画像なし)。
 * 表情差分・部位破壊(衣装)差分を引数で切り替えて描き直す。
 * 本番では BossSkin(boss/BossSkin.js)で各レイヤー×状態をPNGに差し替える想定。
 *
 * レイヤー:hairBack / body(脚・スカート・胴) / armL / armR(ラケット) / head
 * 座標はワールド単位。各レイヤーは pivot を原点にしたローカル座標で描く。
 */
const PPU = 72; // pixels per unit

const C = {
  line: '#3b1d3f',
  skin: '#ffe3d3', skinShade: '#f6bfa9',
  hair: '#ff5fa2', hairDark: '#c93479', hairLight: '#ffa3cb',
  shirt: '#ffffff', shirtShade: '#dfe3f5', shirtWorn: '#e9e3ea',
  accent: '#20c9c0', accentDark: '#11928c',
  inner: '#26305f', innerLight: '#3a4786',   // インナー(ハイネックのコンプレッションウェア)
  skirt: '#2d2f6e', skirtLight: '#454a9a',
  eye: '#27b7c9', eyeDark: '#4b2a86',
  blush: 'rgba(255,110,150,0.45)',
  dirt: 'rgba(90,70,90,0.35)',
  racket: '#ff3d7f',
  bandage: '#fff4e6',
};

function makeLayer(xMin, xMax, yMin, yMax) {
  const c = document.createElement('canvas');
  c.width = Math.round((xMax - xMin) * PPU);
  c.height = Math.round((yMax - yMin) * PPU);
  const g = c.getContext('2d');
  g.setTransform(PPU, 0, 0, -PPU, -xMin * PPU, yMax * PPU);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { canvas: c, g, bounds: { xMin, xMax, yMin, yMax } };
}

/** 輪郭付きの太線(手足) */
function limb(g, pts, width, color) {
  for (const [w, col] of [[width + 0.14, C.line], [width, color]]) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineWidth = w;
    g.strokeStyle = col;
    g.stroke();
  }
}

function fillStroke(g, fill, lw = 0.07) {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = C.line;
  g.stroke();
}

function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** 決定的な擬似乱数(差分の傷の位置を毎回同じにする) */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** 引っかき傷 */
function scratches(g, cx, cy, w, h, n, seed) {
  const r = rng(seed);
  g.strokeStyle = 'rgba(59,29,63,0.5)';
  g.lineWidth = 0.035;
  for (let i = 0; i < n; i++) {
    const x = cx + (r() - 0.5) * w, y = cy + (r() - 0.5) * h;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.25 + r() * 0.2, y - 0.12 - r() * 0.1); g.stroke();
  }
}

/** 汚れ */
function smudge(g, x, y, rx, ry) {
  g.fillStyle = C.dirt;
  ellipse(g, x, y, rx, ry, 0.3); g.fill();
}

/** ギザギザの破れ縁(左→右) */
function jagged(g, x0, x1, y, amp, n, seed) {
  const r = rng(seed);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n);
    g.lineTo(x, y + (i % 2 ? amp : -amp * 0.4) * (0.6 + r() * 0.6));
  }
}

function bandage(g, x, y, w, h, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath(); g.rect(-w / 2, -h / 2, w, h); fillStroke(g, C.bandage, 0.04);
  g.fillStyle = '#f2c9b0'; g.fillRect(-w * 0.18, -h / 2, w * 0.36, h);
  g.restore();
}

// ---------------- 体(root原点=足元中央) ----------------
/** @param st { chest, stomach, rightLeg, leftLeg } 各 'NORMAL' | 'DAMAGED' | 'BROKEN' */
export function drawBody(st = {}) {
  const L = makeLayer(-3.2, 3.2, -0.2, 13.9);
  const g = L.g;
  const S = (k) => st[k] ?? 'NORMAL';

  // 脚
  // 左右はキャラ自身の左右:右脚=画面左(s=-1)
  for (const [s, key] of [[-1, 'rightLeg'], [1, 'leftLeg']]) {
    const state = S(key);
    const x = s * 0.62;
    limb(g, [[s * 0.72, 7.4], [s * 0.66, 3.9]], 1.12, C.skin);
    limb(g, [[s * 0.66, 3.9], [x, 0.9]], 0.86, C.skin);
    g.fillStyle = C.skinShade;
    ellipse(g, x, 3.9, 0.3, 0.12); g.fill();
    // ソックス
    const sockTop = state === 'NORMAL' ? 2.9 : 2.0;
    g.beginPath();
    g.moveTo(x - 0.45, 0.7);
    if (state === 'BROKEN') { g.lineTo(x - 0.45, sockTop); jagged(g, x - 0.45, x + 0.45, sockTop, 0.12, 5, 11 + s); g.lineTo(x + 0.45, 0.7); }
    else g.rect(x - 0.45, 0.7, 0.9, sockTop - 0.7);
    fillStroke(g, state === 'BROKEN' ? C.shirtWorn : C.shirt, 0.06);
    if (state === 'NORMAL') { g.fillStyle = C.accent; g.fillRect(x - 0.45, 2.55, 0.9, 0.18); }
    if (state === 'DAMAGED') { g.strokeStyle = 'rgba(59,29,63,0.35)'; g.lineWidth = 0.04; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 0.4, 1.7 + i * 0.12); g.lineTo(x + 0.4, 1.75 + i * 0.12); g.stroke(); } }
    // シューズ
    g.beginPath();
    g.moveTo(x - 0.55, 0.95);
    g.quadraticCurveTo(x - 0.75, 0.0, x, 0.0);
    g.quadraticCurveTo(x + 0.75, 0.0, x + 0.55, 0.95);
    g.closePath();
    fillStroke(g, state === 'BROKEN' ? '#8fa3a8' : C.accent);
    g.fillStyle = C.shirt;
    g.fillRect(x - 0.5, 0.12, 1.0, 0.16);
    if (state !== 'NORMAL') { smudge(g, x + 0.2, 0.5, 0.25, 0.12); scratches(g, x, 5.5, 0.6, 2.4, state === 'BROKEN' ? 5 : 3, 20 + s); }
    if (state === 'BROKEN') bandage(g, x, 3.9, 0.9, 0.34, s * 0.2);
  }

  // スカート(プリーツ)
  g.beginPath();
  g.moveTo(-1.45, 9.3);
  g.lineTo(1.45, 9.3);
  g.lineTo(2.55, 6.3);
  g.quadraticCurveTo(0, 5.9, -2.55, 6.3);
  g.closePath();
  const sk = g.createLinearGradient(0, 9.3, 0, 6.0);
  sk.addColorStop(0, C.skirtLight); sk.addColorStop(1, C.skirt);
  fillStroke(g, sk);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 0.05;
  for (let i = -3; i <= 3; i++) {
    g.beginPath(); g.moveTo(i * 0.42, 9.25); g.lineTo(i * 0.78, 6.15); g.stroke();
  }
  g.fillStyle = C.accent;
  g.fillRect(-2.5, 6.25, 5.0, 0.16);

  // 首
  g.beginPath(); g.rect(-0.38, 12.3, 0.76, 1.6); fillStroke(g, C.skin, 0.06);
  g.fillStyle = C.skinShade; g.fillRect(-0.38, 12.3, 0.76, 0.35);

  // インナー(ハイネック・胴全体を覆う。破壊差分で見える)
  const chest = S('chest'), stomach = S('stomach');
  if (chest === 'BROKEN' || stomach === 'BROKEN') {
    g.beginPath();
    g.moveTo(-1.2, 9.0); g.lineTo(-1.65, 12.3); g.lineTo(-0.45, 13.05); g.lineTo(0.45, 13.05); g.lineTo(1.65, 12.3); g.lineTo(1.2, 9.0);
    g.closePath();
    const ig = g.createLinearGradient(-1.6, 0, 1.6, 0);
    ig.addColorStop(0, C.inner); ig.addColorStop(0.4, C.innerLight); ig.addColorStop(1, C.inner);
    fillStroke(g, ig);
    g.strokeStyle = C.accent; g.lineWidth = 0.08;
    g.beginPath(); g.moveTo(-0.45, 13.0); g.lineTo(0.45, 13.0); g.stroke();
  }

  // 上着(スポーツウェア)
  g.save();
  g.beginPath();
  g.moveTo(-1.25, 9.1);
  g.quadraticCurveTo(-1.45, 10.6, -1.7, 11.6);
  g.quadraticCurveTo(-2.0, 12.5, -1.3, 12.75);
  g.lineTo(-0.45, 12.9);
  g.lineTo(0, 12.1);
  g.lineTo(0.45, 12.9);
  g.lineTo(1.3, 12.75);
  g.quadraticCurveTo(2.0, 12.5, 1.7, 11.6);
  g.quadraticCurveTo(1.45, 10.6, 1.25, 9.1);
  g.closePath();
  g.clip();
  // 破壊状態に応じて上着の残る範囲を決める(クリップ内で描く)
  const shirtPath = new Path2D();
  if (chest === 'BROKEN') {
    // 胸部は大きく破れてベスト状に(インナーが見える)
    shirtPath.moveTo(-2.1, 8.8); shirtPath.lineTo(-2.1, 13.2); shirtPath.lineTo(-0.95, 13.2);
    const r = rng(7);
    for (let i = 0; i <= 8; i++) shirtPath.lineTo(-0.95 + Math.sin(i) * 0.12 * r(), 12.7 - i * 0.28);
    shirtPath.lineTo(-0.9, 10.2);
    for (let i = 0; i <= 8; i++) shirtPath.lineTo(-0.9 + i * 0.225, 10.2 + (i % 2 ? 0.18 : -0.1));
    for (let i = 0; i <= 8; i++) shirtPath.lineTo(0.95 - Math.sin(i) * 0.12 * r(), 10.4 + i * 0.28);
    shirtPath.lineTo(0.95, 13.2); shirtPath.lineTo(2.1, 13.2); shirtPath.lineTo(2.1, 8.8); shirtPath.closePath();
  } else {
    shirtPath.rect(-2.1, 8.8, 4.2, 4.5);
  }
  let hemTop = 8.8;
  if (stomach === 'BROKEN') hemTop = 9.9; // 裾が破れて短くなる(下はインナー)
  const clipHem = new Path2D();
  clipHem.moveTo(-2.1, 13.3); clipHem.lineTo(2.1, 13.3); clipHem.lineTo(2.1, hemTop);
  if (stomach === 'BROKEN') { const r = rng(3); for (let i = 0; i <= 12; i++) clipHem.lineTo(2.1 - i * 0.35, hemTop + (i % 2 ? -0.25 : 0.1) * (0.6 + r())); }
  clipHem.lineTo(-2.1, hemTop); clipHem.closePath();
  g.clip(clipHem);
  const sh = g.createLinearGradient(-1.8, 0, 1.8, 0);
  const base = chest === 'NORMAL' && stomach === 'NORMAL' ? C.shirt : C.shirtWorn;
  sh.addColorStop(0, C.shirtShade); sh.addColorStop(0.35, base); sh.addColorStop(1, C.shirtShade);
  g.fillStyle = sh;
  g.fill(shirtPath, 'nonzero');
  g.lineWidth = 0.06; g.strokeStyle = C.line; g.stroke(shirtPath);
  // 胸のライン
  if (chest !== 'BROKEN') {
    g.strokeStyle = 'rgba(59,29,63,0.35)'; g.lineWidth = 0.05;
    g.beginPath(); g.moveTo(-1.2, 11.1); g.quadraticCurveTo(-0.6, 10.75, -0.1, 11.1); g.stroke();
    g.beginPath(); g.moveTo(1.2, 11.1); g.quadraticCurveTo(0.6, 10.75, 0.1, 11.1); g.stroke();
  }
  // サイドライン
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 1.28, 9.2); g.quadraticCurveTo(s * 1.5, 10.6, s * 1.72, 11.7);
    g.strokeStyle = C.accent; g.lineWidth = 0.2; g.stroke();
  }
  if (chest === 'DAMAGED') { scratches(g, 0, 11.6, 2.6, 1.6, 7, 5); smudge(g, -0.7, 11.4, 0.4, 0.2); smudge(g, 0.9, 12.0, 0.3, 0.15); }
  if (stomach === 'DAMAGED') { scratches(g, 0, 9.7, 2.2, 0.9, 5, 9); smudge(g, 0.4, 9.6, 0.45, 0.18); }
  g.restore();
  // 上着の輪郭
  g.beginPath();
  g.moveTo(-1.3, 12.75); g.lineTo(-0.45, 12.9); g.lineTo(0, 12.1); g.lineTo(0.45, 12.9); g.lineTo(1.3, 12.75);
  g.strokeStyle = C.accent; g.lineWidth = chest === 'BROKEN' ? 0 : 0.16;
  if (chest !== 'BROKEN') g.stroke();
  // 番号(DAMAGEDで剥がれかけ、BROKENで消失)
  if (chest !== 'BROKEN') {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = chest === 'DAMAGED' ? 0.45 : 1;
    g.fillStyle = C.accentDark; g.font = `bold ${Math.round(0.62 * PPU)}px sans-serif`; g.textAlign = 'center';
    g.translate((0.62 - L.bounds.xMin) * PPU, (L.bounds.yMax - 11.55) * PPU);
    if (chest === 'DAMAGED') g.rotate(0.18);
    g.fillText('01', 0, 0);
    g.restore();
  }
  // ベルト
  if (stomach === 'NORMAL') { g.fillStyle = C.accentDark; g.fillRect(-1.3, 9.05, 2.6, 0.22); }
  else if (stomach === 'DAMAGED') {
    g.fillStyle = C.accentDark; g.fillRect(-1.3, 9.05, 1.15, 0.22);
    g.save(); g.translate(0.1, 9.1); g.rotate(-0.25); g.fillRect(0, 0, 1.2, 0.22); g.restore();
  }
  return L;
}

// ---------------- ツインテール(pivot=首の付け根 (0,13.4)) ----------------
export function drawHairBack() {
  const L = makeLayer(-4.6, 4.6, -5.2, 5.2);
  const g = L.g;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 1.9, 3.9);
    g.bezierCurveTo(s * 4.2, 3.6, s * 4.4, 0.2, s * 3.6, -2.4);
    g.bezierCurveTo(s * 3.2, -3.8, s * 3.9, -4.6, s * 3.2, -5.0);
    g.bezierCurveTo(s * 2.4, -3.8, s * 2.1, -1.2, s * 2.4, 0.6);
    g.bezierCurveTo(s * 2.5, 2.0, s * 2.1, 2.8, s * 1.6, 3.0);
    g.closePath();
    const hg = g.createLinearGradient(s * 2, 4, s * 3.4, -5);
    hg.addColorStop(0, C.hair); hg.addColorStop(1, C.hairDark);
    fillStroke(g, hg);
    g.strokeStyle = 'rgba(120,20,70,0.35)'; g.lineWidth = 0.05;
    g.beginPath(); g.moveTo(s * 2.6, 2.8); g.bezierCurveTo(s * 3.5, 1, s * 3.4, -1.8, s * 3.1, -3.4); g.stroke();
  }
  g.beginPath();
  g.moveTo(-2.2, 3.6);
  g.quadraticCurveTo(-2.6, 0.8, -1.9, -0.6);
  g.lineTo(1.9, -0.6);
  g.quadraticCurveTo(2.6, 0.8, 2.2, 3.6);
  g.closePath();
  fillStroke(g, C.hairDark);
  return L;
}

// ---------------- 頭(pivot=首の付け根 (0,13.4)) ----------------
export const EXPRESSIONS = ['normal', 'happy', 'love', 'surprised', 'hurt', 'angry', 'break'];

/**
 * @param expr  'normal' | 'hurt' | 'surprised' | 'angry' | 'break'(部位破壊時)
 * @param state 頭部の破壊状態(ヘッドバンド・髪の乱れ)
 */
export function drawHead(expr = 'normal', state = 'NORMAL') {
  const L = makeLayer(-3.0, 3.0, -0.6, 5.6);
  const g = L.g;

  // 顔
  g.beginPath();
  g.moveTo(-1.62, 2.3);
  g.quadraticCurveTo(-1.62, 0.9, -0.7, 0.35);
  g.quadraticCurveTo(0, -0.05, 0.7, 0.35);
  g.quadraticCurveTo(1.62, 0.9, 1.62, 2.3);
  g.quadraticCurveTo(1.6, 3.9, 0, 3.95);
  g.quadraticCurveTo(-1.6, 3.9, -1.62, 2.3);
  fillStroke(g, C.skin);
  g.fillStyle = ['break', 'angry', 'happy', 'love'].includes(expr) ? 'rgba(255,90,130,0.62)' : C.blush;
  ellipse(g, -1.02, 1.12, 0.38, 0.17); g.fill();
  ellipse(g, 1.02, 1.12, 0.38, 0.17); g.fill();

  // 目
  for (const s of [-1, 1]) {
    const ex = s * 0.64, ey = 1.72;
    if (expr === 'happy') {
      // ^ ^ の笑顔
      g.beginPath(); g.moveTo(ex - 0.34, ey - 0.05); g.quadraticCurveTo(ex, ey + 0.42, ex + 0.34, ey - 0.05);
      g.strokeStyle = C.line; g.lineWidth = 0.12; g.stroke();
      continue;
    }
    if (expr === 'love') {
      // ハートの目
      g.beginPath();
      g.moveTo(ex, ey - 0.34);
      g.bezierCurveTo(ex - 0.5, ey - 0.02, ex - 0.36, ey + 0.42, ex, ey + 0.16);
      g.bezierCurveTo(ex + 0.36, ey + 0.42, ex + 0.5, ey - 0.02, ex, ey - 0.34);
      g.fillStyle = '#ff4fa8'; g.fill(); g.lineWidth = 0.05; g.strokeStyle = C.line; g.stroke();
      continue;
    }
    if (expr === 'hurt') {
      g.beginPath();
      g.moveTo(ex - s * 0.32, ey + 0.28); g.lineTo(ex + s * 0.22, ey); g.lineTo(ex - s * 0.32, ey - 0.28);
      g.strokeStyle = C.line; g.lineWidth = 0.13; g.stroke();
      continue;
    }
    const big = expr === 'surprised' || expr === 'break';
    ellipse(g, ex, ey, big ? 0.38 : 0.34, big ? 0.52 : 0.46); g.fillStyle = '#fff'; g.fill();
    const irisR = expr === 'surprised' ? 0.5 : 1;
    const ig = g.createLinearGradient(0, ey + 0.4, 0, ey - 0.4);
    ig.addColorStop(0, C.eyeDark); ig.addColorStop(1, C.eye);
    ellipse(g, ex + s * 0.02, ey - 0.03, 0.27 * irisR, 0.4 * irisR); g.fillStyle = ig; g.fill();
    ellipse(g, ex + s * 0.02, ey, 0.12 * irisR, 0.2 * irisR); g.fillStyle = '#1b0f33'; g.fill();
    ellipse(g, ex - 0.09, ey + 0.16, 0.09, 0.11); g.fillStyle = '#fff'; g.fill();
    ellipse(g, ex + 0.1, ey - 0.2, 0.05, 0.05); g.fill();
    // まつげ
    g.beginPath();
    g.moveTo(ex - 0.4, ey + 0.26);
    g.quadraticCurveTo(ex, ey + 0.62, ex + 0.4, ey + 0.26);
    g.lineTo(ex + s * 0.52, ey + 0.4);
    g.strokeStyle = C.line; g.lineWidth = 0.1; g.stroke();
    // まゆ
    g.beginPath();
    if (expr === 'angry') { g.moveTo(ex - s * 0.35, ey + 0.95); g.lineTo(ex + s * 0.3, ey + 0.7); }
    else if (expr === 'break') { g.moveTo(ex - s * 0.3, ey + 0.72); g.lineTo(ex + s * 0.32, ey + 0.95); }
    else if (expr === 'surprised') { g.moveTo(ex - 0.3, ey + 0.95); g.quadraticCurveTo(ex, ey + 1.1, ex + 0.3, ey + 0.97); }
    else { g.moveTo(ex - 0.3, ey + 0.82); g.quadraticCurveTo(ex, ey + 0.95, ex + 0.3, ey + 0.84); }
    g.lineWidth = 0.07; g.stroke();
    // 涙(部位破壊)
    if (expr === 'break') {
      g.beginPath(); g.moveTo(ex + s * 0.3, ey - 0.35); g.quadraticCurveTo(ex + s * 0.45, ey - 0.8, ex + s * 0.3, ey - 0.9);
      g.quadraticCurveTo(ex + s * 0.15, ey - 0.8, ex + s * 0.3, ey - 0.35);
      g.fillStyle = '#9fe6ff'; g.fill();
    }
  }

  // 口
  g.beginPath();
  if (expr === 'hurt') {
    ellipse(g, 0, 0.72, 0.2, 0.16); g.fillStyle = '#9b2c4a'; g.fill();
    g.lineWidth = 0.05; g.strokeStyle = C.line; g.stroke();
  } else if (expr === 'happy' || expr === 'love') {
    g.moveTo(-0.32, 0.78); g.quadraticCurveTo(0, 0.2, 0.32, 0.78); g.closePath();
    g.fillStyle = '#b8325a'; g.fill(); g.lineWidth = 0.05; g.strokeStyle = C.line; g.stroke();
  } else if (expr === 'surprised') {
    ellipse(g, 0, 0.66, 0.14, 0.2); g.fillStyle = '#9b2c4a'; g.fill();
    g.lineWidth = 0.05; g.strokeStyle = C.line; g.stroke();
  } else if (expr === 'angry') {
    g.moveTo(-0.28, 0.66); g.lineTo(0.28, 0.66); g.lineTo(0.18, 0.5); g.lineTo(-0.18, 0.5); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = 0.05; g.strokeStyle = C.line; g.stroke();
  } else if (expr === 'break') {
    g.moveTo(-0.3, 0.62);
    for (let i = 1; i <= 6; i++) g.lineTo(-0.3 + i * 0.1, 0.62 + (i % 2 ? 0.08 : 0));
    g.lineWidth = 0.06; g.strokeStyle = C.line; g.stroke();
  } else {
    g.moveTo(-0.22, 0.74); g.quadraticCurveTo(0, 0.55, 0.22, 0.74);
    g.lineWidth = 0.06; g.strokeStyle = C.line; g.stroke();
  }
  // 汗
  if (expr === 'hurt' || expr === 'surprised') {
    g.beginPath(); g.moveTo(1.55, 3.0); g.quadraticCurveTo(1.85, 2.5, 1.62, 2.35); g.quadraticCurveTo(1.35, 2.5, 1.55, 3.0);
    g.fillStyle = '#9fe6ff'; g.fill();
  }
  // 怒りマーク
  if (expr === 'angry') {
    g.strokeStyle = '#ff3d5a'; g.lineWidth = 0.1;
    for (const [a, b, c2, d] of [[1.9, 4.3, 2.2, 4.3], [2.05, 4.15, 2.05, 4.45]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
  }

  // 前髪(BROKEN で乱れ毛)
  g.beginPath();
  g.moveTo(-1.95, 1.4);
  g.quadraticCurveTo(-2.1, 4.3, 0, 4.75);
  g.quadraticCurveTo(2.1, 4.3, 1.95, 1.4);
  g.lineTo(1.55, 2.4);
  g.lineTo(1.2, 2.55); g.lineTo(0.95, 2.95);
  g.lineTo(0.62, 2.45); g.lineTo(0.3, 3.05);
  g.lineTo(0.0, 2.5); g.lineTo(-0.35, 3.05);
  g.lineTo(-0.66, 2.42); g.lineTo(-1.0, 2.95);
  g.lineTo(-1.25, 2.55); g.lineTo(-1.58, 2.4);
  g.closePath();
  const hg = g.createLinearGradient(0, 4.8, 0, 1.4);
  hg.addColorStop(0, C.hairLight); hg.addColorStop(0.4, C.hair); hg.addColorStop(1, C.hairDark);
  fillStroke(g, hg);
  g.beginPath(); g.ellipse(-0.6, 4.05, 0.6, 0.14, 0.25, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
  // アホ毛
  g.lineWidth = 0.12; g.strokeStyle = C.hairDark;
  g.beginPath(); g.moveTo(0.1, 4.7); g.bezierCurveTo(0.4, 5.4, 1.0, 5.3, 0.9, 4.95); g.stroke();
  if (state !== 'NORMAL') {
    // 乱れ毛
    g.beginPath(); g.moveTo(-0.9, 4.5); g.bezierCurveTo(-1.4, 5.2, -1.8, 5.0, -1.9, 4.6); g.stroke();
    if (state === 'BROKEN') { g.beginPath(); g.moveTo(0.9, 4.4); g.bezierCurveTo(1.5, 5.3, 2.0, 5.1, 2.2, 4.4); g.stroke(); }
  }
  // ヘアゴム
  if (state !== 'BROKEN') for (const s of [-1, 1]) { ellipse(g, s * 1.95, 3.85, 0.26, 0.26); fillStroke(g, C.accent, 0.05); }
  // ヘッドバンド:NORMAL 正位置 / DAMAGED ずれ / BROKEN 無し
  if (state === 'NORMAL') {
    g.beginPath(); g.moveTo(-1.85, 3.3); g.quadraticCurveTo(0, 4.55, 1.85, 3.3);
    g.lineWidth = 0.22; g.strokeStyle = C.accent; g.stroke();
  } else if (state === 'DAMAGED') {
    g.beginPath(); g.moveTo(-1.9, 3.8); g.quadraticCurveTo(0.2, 4.7, 1.7, 2.9);
    g.lineWidth = 0.22; g.strokeStyle = C.accent; g.stroke();
  } else {
    bandage(g, 1.05, 1.35, 0.55, 0.22, -0.4); // ほっぺの絆創膏
  }
  return L;
}

// ---------------- 腕(pivot=肩) s=-1:画面左=右腕 / +1:画面右=左腕(ラケット) ----------------
export function drawArm(s, state = 'NORMAL') {
  const racket = s > 0;
  const L = racket ? makeLayer(-1.0, 2.6, -9.4, 0.8) : makeLayer(-1.3, 1.3, -5.2, 0.8);
  const g = L.g;
  limb(g, [[s * 0.15, -0.6], [s * 0.42, -2.6]], 0.66, C.skin);
  limb(g, [[s * 0.42, -2.6], [s * 0.5, -4.2]], 0.56, C.skin);
  // 袖:NORMAL 半袖 / DAMAGED 破れ / BROKEN 上着の袖が取れてインナーの袖
  g.beginPath();
  if (state === 'BROKEN') {
    g.moveTo(-0.45 * s, 0.35); g.quadraticCurveTo(s * 0.5, 0.65, s * 0.66, -0.2);
    g.lineTo(s * 0.58, -0.8); g.lineTo(-0.1 * s, -0.7); g.closePath();
    fillStroke(g, C.inner);
  } else {
    g.moveTo(-0.45 * s, 0.35); g.quadraticCurveTo(s * 0.5, 0.65, s * 0.72, -0.2);
    if (state === 'DAMAGED') { g.lineTo(s * 0.66, -1.1); g.lineTo(s * 0.45, -0.85); g.lineTo(s * 0.3, -1.2); g.lineTo(s * 0.05, -0.9); g.lineTo(-0.15 * s, -1.05); }
    else { g.lineTo(s * 0.62, -1.35); g.lineTo(-0.15 * s, -1.2); }
    g.closePath();
    fillStroke(g, state === 'DAMAGED' ? C.shirtWorn : C.shirt);
    if (state === 'NORMAL') {
      g.beginPath(); g.moveTo(s * 0.62, -1.3); g.lineTo(-0.15 * s, -1.15);
      g.strokeStyle = C.accent; g.lineWidth = 0.14; g.stroke();
    }
  }
  if (state !== 'NORMAL') scratches(g, s * 0.45, -2.8, 0.5, 1.4, state === 'BROKEN' ? 5 : 3, 30 + s);
  // リストバンド(BROKEN で包帯)
  if (state === 'BROKEN') { bandage(g, s * 0.48, -3.3, 0.66, 0.3, s * 0.05); bandage(g, s * 0.49, -3.62, 0.64, 0.28, -s * 0.06); }
  else limb(g, [[s * 0.48, -3.75], [s * 0.5, -4.05]], 0.62, C.accent);

  if (racket) {
    limb(g, [[0.5, -4.4], [0.95, -6.35]], 0.22, '#e8e8f0');
    ellipse(g, 1.25, -7.75, 0.95, 1.35, 0.22);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill();
    g.lineWidth = 0.22; g.strokeStyle = C.line; g.stroke();
    g.lineWidth = 0.14; g.strokeStyle = C.racket; g.stroke();
    g.save();
    ellipse(g, 1.25, -7.75, 0.88, 1.28, 0.22); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.025;
    g.translate(1.25, -7.75); g.rotate(0.22);
    for (let i = -6; i <= 6; i++) {
      g.beginPath(); g.moveTo(i * 0.16, -1.5); g.lineTo(i * 0.16, 1.5); g.stroke();
      g.beginPath(); g.moveTo(-1.2, i * 0.2); g.lineTo(1.2, i * 0.2); g.stroke();
    }
    g.restore();
  }
  ellipse(g, s * 0.5, -4.45, 0.36, 0.4); fillStroke(g, C.skin, 0.06);
  return L;
}

export { PPU };
