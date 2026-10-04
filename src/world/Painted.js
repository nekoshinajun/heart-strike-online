import * as THREE from '../lib/three.js';

/**
 * Canvas で描く小物の絵(背景のレイヤー絵は assets/bg/ の画像)。
 *   cloudSea  … 足元:雲の海(道の外側の床)
 *   heartArch … Heart Gate:金の輪 + 上のハートの宝石 + 羽
 *   petal     … 舞う花びら
 */
const cache = {};
const tex = (key, w, h, draw, opt = {}) => {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  cache[key] = t;
  return t;
};

// 決まった乱数(毎回同じ絵になるように)
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function blob(g, x, y, r, fill) {
  g.fillStyle = fill;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.9, y - s * 0.2, x - s * 0.45, y - s * 0.85, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.2, x, y + s * 0.35);
  g.closePath();
}

export function cloudSea() {
  return tex('cloudSea', 512, 512, (g, W, H) => {
    const rnd = rng(5);
    g.fillStyle = '#efd9f3';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 60;
      const c = ['#fff3fa', '#f6e4ff', '#ffe3f1', '#e9dcff'][i % 4];
      // 端をまたぐ時は反対側にも描いて継ぎ目を消す
      for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) blob(g, x + dx, y + dy, r, c);
    }
  }, { repeat: true });
}

/** Heart Gate の絵:金の輪(内径 = 板の幅 × innerRatio)+ 上のハートの宝石 + 羽 */
export const HEART_ARCH = { innerRatio: 0.3125 };   // 512px の板で内径 160px
export function heartArch() {
  return tex('heartArch', 512, 512, (g, W, H) => {
    const cx = W / 2, cy = H / 2, r0 = W * HEART_ARCH.innerRatio, r1 = r0 + 26;
    // 金の輪(外 → 内のグラデーションで立体感)
    const gold = g.createRadialGradient(cx, cy, r0, cx, cy, r1);
    gold.addColorStop(0, '#b9852e'); gold.addColorStop(0.35, '#ffe9a8'); gold.addColorStop(0.7, '#f2c96a'); gold.addColorStop(1, '#a8742a');
    g.fillStyle = gold;
    g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.arc(cx, cy, r0, 0, Math.PI * 2, true); g.fill();
    // 輪の外側のつる飾り
    g.strokeStyle = '#f5d48a'; g.lineWidth = 4; g.lineCap = 'round';
    for (let k = 0; k < 10; k++) {
      const a = Math.PI * 0.62 + (k / 9) * Math.PI * 1.76;
      const x = cx + Math.cos(a) * (r1 + 4), y = cy + Math.sin(a) * (r1 + 4);
      g.beginPath(); g.arc(x + Math.cos(a) * 10, y + Math.sin(a) * 10, 10, a + Math.PI, a + Math.PI * 2.4); g.stroke();
    }
    // 羽
    const top = cy - r1 - 6;
    g.fillStyle = '#fff6fb';
    g.strokeStyle = '#f2cf7e'; g.lineWidth = 3;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * 30, top + 6);
      g.quadraticCurveTo(cx + s * 130, top - 70, cx + s * 150, top + 10);
      g.quadraticCurveTo(cx + s * 110, top + 2, cx + s * 100, top + 36);
      g.quadraticCurveTo(cx + s * 70, top + 16, cx + s * 30, top + 34);
      g.closePath(); g.fill(); g.stroke();
    }
    // ハートの宝石
    const gem = g.createRadialGradient(cx - 14, top - 18, 4, cx, top, 60);
    gem.addColorStop(0, '#fff0f7'); gem.addColorStop(0.45, '#ff8cc6'); gem.addColorStop(1, '#d1438c');
    heartPath(g, cx, top + 12, 66);
    g.fillStyle = gem; g.fill();
    g.lineWidth = 7; g.strokeStyle = '#f2c96a'; g.stroke();
    blob(g, cx - 14, top - 10, 7, 'rgba(255,255,255,0.9)');
  });
}

export function petal() {
  return tex('petal', 64, 64, (g) => {
    const grd = g.createLinearGradient(16, 8, 48, 56);
    grd.addColorStop(0, '#ffe1ef'); grd.addColorStop(1, '#ff9fcf');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(32, 32, 14, 24, 0.5, 0, Math.PI * 2); g.fill();
  });
}
