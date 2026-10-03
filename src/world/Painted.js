import * as THREE from '../lib/three.js';

/**
 * 2.5D 背景の「仮の絵」(Canvas で描く)。本番のイラストができたら、各関数が同じ大きさ・同じ透過の画像を返すように差し替える。
 *   farCastles  … 遠景:お城・塔・浮島(上は透明 → 空のグラデーションが見える)
 *   archBridge  … 中景:アーチの橋 + 手前の雲
 *   cloudSea    … 足元:雲の海(道の外側の床)
 *   pathTiles   … 道:ラベンダーの石畳 + 金の目地(縦にリピート)
 *   ribbonPillar / roseBush / floatIsland … 道の脇・空に立てる板(ビルボード)
 *   heartArch   … Heart Gate:金の輪 + 上のハートの宝石 + 羽
 *   petal       … 舞う花びら
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
function cloudPuff(g, cx, cy, w, color, rnd) {
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = cx - w / 2 + t * w;
    const r = w * (0.12 + Math.sin(t * Math.PI) * 0.14) * (0.8 + rnd() * 0.4);
    blob(g, x, cy - Math.sin(t * Math.PI) * w * 0.08, r, color);
  }
}
function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.9, y - s * 0.2, x - s * 0.45, y - s * 0.85, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.2, x, y + s * 0.35);
  g.closePath();
}

/** 塔(とんがり屋根 + 光る窓) */
function tower(g, x, base, w, h, body, roof, rnd) {
  g.fillStyle = body;
  g.fillRect(x - w / 2, base - h, w, h);
  g.fillStyle = roof;
  g.beginPath(); g.moveTo(x - w * 0.62, base - h); g.lineTo(x, base - h - w * 1.6); g.lineTo(x + w * 0.62, base - h); g.closePath(); g.fill();
  // 旗
  g.strokeStyle = roof; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, base - h - w * 1.6); g.lineTo(x, base - h - w * 2.0); g.stroke();
  // 窓
  g.fillStyle = 'rgba(255,236,190,0.9)';
  for (let y = base - h + w * 0.5; y < base - w * 0.6; y += w * 0.9) {
    if (rnd() < 0.55) { g.beginPath(); g.ellipse(x, y, w * 0.12, w * 0.2, 0, 0, Math.PI * 2); g.fill(); }
  }
}

export function farCastles() {
  return tex('farCastles', 2048, 820, (g, W, H) => {
    const rnd = rng(11);
    // 遠くの浮島とお城(淡いラベンダー → 下ほどピンク)
    const body = g.createLinearGradient(0, H * 0.2, 0, H);
    body.addColorStop(0, '#d9c6f4'); body.addColorStop(1, '#f6c9e4');
    const roof = '#b79ce6';
    const castle = (cx, base, s) => {
      // 土台の浮島
      g.fillStyle = '#c7aee8';
      g.beginPath(); g.moveTo(cx - 150 * s, base); g.quadraticCurveTo(cx, base + 170 * s, cx + 150 * s, base); g.closePath(); g.fill();
      g.fillStyle = '#9fd3b4';
      g.fillRect(cx - 150 * s, base - 8 * s, 300 * s, 12 * s);
      // 城壁 + 塔
      g.fillStyle = body;
      g.fillRect(cx - 110 * s, base - 120 * s, 220 * s, 120 * s);
      tower(g, cx - 95 * s, base - 110 * s, 34 * s, 120 * s, body, roof, rnd);
      tower(g, cx + 95 * s, base - 110 * s, 34 * s, 120 * s, body, roof, rnd);
      tower(g, cx - 40 * s, base - 110 * s, 42 * s, 190 * s, body, roof, rnd);
      tower(g, cx + 40 * s, base - 110 * s, 42 * s, 170 * s, body, roof, rnd);
      tower(g, cx, base - 110 * s, 56 * s, 280 * s, body, roof, rnd);
      // 大きなステンドグラスの窓
      g.fillStyle = 'rgba(255,214,236,0.95)';
      g.beginPath(); g.ellipse(cx, base - 70 * s, 26 * s, 38 * s, 0, 0, Math.PI * 2); g.fill();
      heartPath(g, cx, base - 70 * s, 26 * s); g.fillStyle = '#ff9fcf'; g.fill();
    };
    castle(W * 0.5, H * 0.66, 1.25);
    castle(W * 0.16, H * 0.6, 0.7);
    castle(W * 0.84, H * 0.56, 0.8);
    castle(W * 0.33, H * 0.5, 0.45);
    castle(W * 0.68, H * 0.46, 0.42);
    // 下の雲の帯(お城の足元を隠す)
    for (let i = 0; i < 26; i++) cloudPuff(g, (i / 25) * W + (rnd() - 0.5) * 60, H * (0.86 + rnd() * 0.08), 260 + rnd() * 160, i % 3 ? '#fff1f8' : '#f3e6ff', rnd);
    g.fillStyle = '#fff1f8';
    g.fillRect(0, H * 0.94, W, H * 0.06);
    // 遠くのキラキラ
    for (let i = 0; i < 60; i++) blob(g, rnd() * W, rnd() * H * 0.6, 1.5 + rnd() * 2, 'rgba(255,255,255,0.85)');
  });
}

export function archBridge() {
  return tex('archBridge', 2048, 512, (g, W, H) => {
    const rnd = rng(23);
    const top = H * 0.38, bot = H * 0.78;
    // 橋の本体(ラベンダーの石)
    const stone = g.createLinearGradient(0, top, 0, bot);
    stone.addColorStop(0, '#cdb6ee'); stone.addColorStop(1, '#a98fd8');
    g.fillStyle = stone;
    g.fillRect(0, top, W, bot - top);
    // アーチ(くり抜き)
    g.globalCompositeOperation = 'destination-out';
    const n = 14, aw = W / n;
    for (let i = 0; i < n; i++) {
      const cx = aw * (i + 0.5);
      g.beginPath();
      g.moveTo(cx - aw * 0.32, bot);
      g.lineTo(cx - aw * 0.32, top + (bot - top) * 0.45);
      g.arc(cx, top + (bot - top) * 0.45, aw * 0.32, Math.PI, 0);
      g.lineTo(cx + aw * 0.32, bot);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // 手すりと金の飾り線
    g.fillStyle = '#e6d8fb';
    g.fillRect(0, top - 14, W, 16);
    g.fillStyle = '#f5d48a';
    g.fillRect(0, top + 2, W, 3);
    // 手すりの上のランタン(光)
    for (let i = 0; i < n; i++) {
      const x = aw * i;
      const grd = g.createRadialGradient(x, top - 30, 0, x, top - 30, 26);
      grd.addColorStop(0, 'rgba(255,240,200,0.95)'); grd.addColorStop(1, 'rgba(255,200,230,0)');
      g.fillStyle = grd; g.fillRect(x - 30, top - 60, 60, 60);
    }
    // 手前の雲(橋の足を隠す)
    for (let i = 0; i < 22; i++) cloudPuff(g, (i / 21) * W, H * (0.86 + rnd() * 0.08), 220 + rnd() * 140, i % 2 ? '#fff4fa' : '#f6e8ff', rnd);
    g.fillStyle = '#fff4fa';
    g.fillRect(0, H * 0.94, W, H * 0.06);
  });
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

export function pathTiles() {
  return tex('pathTiles', 512, 512, (g, W, H) => {
    // 石畳:ラベンダーの大理石(2×2 枚)+ 金の目地 + うっすら映り込み
    const tile = (x, y, w, h, c0, c1) => {
      const grd = g.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, c0); grd.addColorStop(1, c1);
      g.fillStyle = grd; g.fillRect(x, y, w, h);
    };
    tile(0, 0, W / 2, H / 2, '#d8c6f2', '#bfa6e6');
    tile(W / 2, 0, W / 2, H / 2, '#c9b3ee', '#e2d3f8');
    tile(0, H / 2, W / 2, H / 2, '#cbb6ef', '#e6d9fa');
    tile(W / 2, H / 2, W / 2, H / 2, '#dccbf4', '#bea5e5');
    // 大理石の筋
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    const rnd = rng(3);
    for (let i = 0; i < 10; i++) {
      g.beginPath(); let x = rnd() * W, y = rnd() * H; g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rnd() - 0.3) * 80; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    // 金の目地(タイルの縁)
    g.strokeStyle = '#f2cf7e'; g.lineWidth = 6;
    g.strokeRect(3, 3, W / 2 - 3, H / 2 - 3); g.strokeRect(W / 2, 3, W / 2 - 3, H / 2 - 3);
    g.strokeRect(3, H / 2, W / 2 - 3, H / 2 - 3); g.strokeRect(W / 2, H / 2, W / 2 - 3, H / 2 - 3);
    // 小さなハートの模様
    g.fillStyle = 'rgba(255,170,215,0.55)';
    heartPath(g, W * 0.25, H * 0.27, 18); g.fill();
    heartPath(g, W * 0.75, H * 0.77, 18); g.fill();
  }, { repeat: true });
}

/** 道の両脇の金の縁(1 枚の細長い板に貼る) */
export function pathEdge() {
  return tex('pathEdge', 64, 256, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#c99a3f'); grd.addColorStop(0.5, '#ffe9a8'); grd.addColorStop(1, '#c99a3f');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff9fcf';
    for (let y = 32; y < H; y += 64) { heartPath(g, W / 2, y, 14); g.fill(); }
  }, { repeat: true });
}

export function ribbonPillar() {
  return tex('ribbonPillar', 256, 640, (g, W, H) => {
    const cx = W / 2;
    // 柱(白〜ラベンダーの円柱っぽいグラデーション)
    const body = g.createLinearGradient(cx - 44, 0, cx + 44, 0);
    body.addColorStop(0, '#b9a2e6'); body.addColorStop(0.45, '#f6efff'); body.addColorStop(1, '#a88fdc');
    g.fillStyle = body;
    g.fillRect(cx - 44, 170, 88, H - 210);
    // 台座 / 柱頭
    g.fillStyle = '#e9ddfb';
    g.fillRect(cx - 62, H - 52, 124, 52);
    g.fillRect(cx - 58, 150, 116, 26);
    g.fillStyle = '#f2cf7e';
    g.fillRect(cx - 62, H - 56, 124, 6); g.fillRect(cx - 58, 174, 116, 5);
    // 巻きついたリボン
    g.strokeStyle = '#ff9fcf'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath();
    for (let y = 200; y < H - 70; y += 4) { const x = cx + Math.sin(y * 0.035) * 46; y === 200 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    // 大きなリボン結び
    g.fillStyle = '#ff8cc6';
    g.beginPath(); g.ellipse(cx - 40, 250, 40, 24, -0.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + 40, 250, 40, 24, 0.4, 0, Math.PI * 2); g.fill();
    blob(g, cx, 252, 15, '#ff6fb2');
    // 上のハートの宝石 + 羽
    g.fillStyle = '#fff6fb';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * 20, 92);
      g.quadraticCurveTo(cx + s * 110, 30, cx + s * 118, 110);
      g.quadraticCurveTo(cx + s * 80, 92, cx + s * 70, 128);
      g.quadraticCurveTo(cx + s * 50, 110, cx + s * 22, 122);
      g.closePath(); g.fill();
    }
    const gem = g.createRadialGradient(cx - 12, 74, 4, cx, 96, 56);
    gem.addColorStop(0, '#ffe6f3'); gem.addColorStop(0.5, '#ff8cc6'); gem.addColorStop(1, '#d94f97');
    heartPath(g, cx, 106, 62); g.fillStyle = gem; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#f2cf7e'; g.stroke();
  });
}

export function roseBush() {
  return tex('roseBush', 256, 160, (g, W, H) => {
    const rnd = rng(31);
    for (let i = 0; i < 22; i++) blob(g, 30 + rnd() * (W - 60), 60 + rnd() * (H - 70), 18 + rnd() * 16, i % 2 ? '#8fcf9f' : '#a7dcb3');
    for (let i = 0; i < 11; i++) {
      const x = 30 + rnd() * (W - 60), y = 40 + rnd() * (H - 80), r = 12 + rnd() * 9;
      blob(g, x, y, r, ['#ff9fcf', '#ffc2e0', '#ff7ab8'][i % 3]);
      g.strokeStyle = 'rgba(200,60,130,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 1.5); g.stroke();
    }
  });
}

export function floatIsland() {
  return tex('floatIsland', 512, 512, (g, W, H) => {
    const rnd = rng(41);
    // 岩(下へとがる)
    const rock = g.createLinearGradient(0, H * 0.45, 0, H);
    rock.addColorStop(0, '#b8a0e2'); rock.addColorStop(1, '#8e74c8');
    g.fillStyle = rock;
    g.beginPath(); g.moveTo(40, H * 0.5); g.quadraticCurveTo(W * 0.5, H * 1.15, W - 40, H * 0.5); g.closePath(); g.fill();
    g.fillStyle = '#a8dcb6';
    g.beginPath(); g.ellipse(W / 2, H * 0.5, W / 2 - 40, 26, 0, 0, Math.PI * 2); g.fill();
    // 小さなお城
    const body = '#efe4fd', roof = '#c3a6ee';
    g.fillStyle = body; g.fillRect(W * 0.3, H * 0.32, W * 0.4, H * 0.18);
    tower(g, W * 0.3, H * 0.5, 40, 150, body, roof, rnd);
    tower(g, W * 0.7, H * 0.5, 40, 130, body, roof, rnd);
    tower(g, W * 0.5, H * 0.5, 56, 220, body, roof, rnd);
    for (let i = 0; i < 8; i++) blob(g, 70 + rnd() * (W - 140), H * 0.5 - 6, 10 + rnd() * 8, ['#ff9fcf', '#ffc2e0'][i % 2]);
  });
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
