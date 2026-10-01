import * as THREE from '../lib/three.js';

const cache = {};

export function glowTexture() {
  if (cache.glow) return cache.glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  cache.glow = new THREE.CanvasTexture(c);
  return cache.glow;
}

export function shadowTexture() {
  if (cache.shadow) return cache.shadow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  cache.shadow = new THREE.CanvasTexture(c);
  return cache.shadow;
}

// ボール表面(縫い目入り)
export function ballTexture() {
  if (cache.ball) return cache.ball;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#ff3d6e';
  g.lineWidth = 7;
  for (const off of [0, 128]) {
    g.beginPath();
    for (let x = 0; x <= 128; x += 4) {
      const y = 64 + Math.sin((x / 128) * Math.PI * 2) * 34;
      x === 0 ? g.moveTo(x + off, y) : g.lineTo(x + off, y);
    }
    g.stroke();
  }
  cache.ball = new THREE.CanvasTexture(c);
  cache.ball.colorSpace = THREE.SRGBColorSpace;
  return cache.ball;
}

// ハート(パーティクル用)
export function heartTexture() {
  if (cache.heart) return cache.heart;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(32, 54);
  g.bezierCurveTo(4, 36, 10, 8, 32, 20);
  g.bezierCurveTo(54, 8, 60, 36, 32, 54);
  g.fill();
  cache.heart = new THREE.CanvasTexture(c);
  return cache.heart;
}

/**
 * 障害物(壁)の表面:暗い石のレンガ + 赤黒の警告ストライプの縁 + 中央の赤い ✕(当ててはいけない)。
 * ゲート(ピンクの光る輪)とは色も形もはっきり分ける。aspect = 幅 / 高さ(壁の形ごとにストライプの太さを揃える)
 */
export function wallTexture(aspect = 1) {
  const key = `wall${aspect.toFixed(2)}`;
  if (cache[key]) return cache[key];
  const H = 256, W = Math.round(H * aspect);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // 石のレンガ
  g.fillStyle = '#2b2430';
  g.fillRect(0, 0, W, H);
  const bh = 32, bw = 64;
  g.strokeStyle = '#46394f'; g.lineWidth = 4;
  for (let y = 0, row = 0; y < H; y += bh, row++) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    for (let x = (row % 2) * (bw / 2); x < W; x += bw) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + bh); g.stroke(); }
  }
  // 縁:赤と黒の警告ストライプ
  const band = 26;
  g.save();
  g.beginPath(); g.rect(0, 0, W, H); g.rect(band, band, W - band * 2, H - band * 2); g.clip('evenodd');
  g.fillStyle = '#16121a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ff3b3b';
  for (let x = -H; x < W + H; x += 36) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 0); g.lineTo(x + 18 + H, H); g.lineTo(x + H, H); g.closePath(); g.fill(); }
  g.restore();
  // 中央の ✕(赤く光る)
  const s = Math.min(W, H) * 0.24, cx = W / 2, cy = H / 2;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,59,59,0.35)'; g.lineWidth = 34;
  g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s); g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s); g.stroke();
  g.strokeStyle = '#ff4646'; g.lineWidth = 18;
  g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s); g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
  cache[key] = t;
  return t;
}
