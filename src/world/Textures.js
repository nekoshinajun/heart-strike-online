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
