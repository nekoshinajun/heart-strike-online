/**
 * ガチャ演出の光の粒(Canvas 1枚・上限つき)。DOM を増やさずに「集まる光」「弾けるハート / 花びら / リボン / 星」「漂うキラキラ」を描く
 *   粒は生きている間だけ rAF を回す(何も無ければ止まる)。端末の負荷に合わせて scale(0.5 など)で数を減らせる
 */
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class GachaParticles {
  constructor(canvas, { max = 260, scale = 1 } = {}) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.max = max; this.scale = scale;
    this.list = []; this.ambientOn = null; this.raf = null; this.last = 0;
  }

  resize() {
    const r = this.c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = d;
    this.c.width = Math.round(this.w * d); this.c.height = Math.round(this.h * d);
  }

  n(count) { return Math.max(1, Math.round(count * this.scale)); }
  add(p) { if (this.list.length < this.max) this.list.push(p); this.run(); }

  /** 画面の外側から中心(x, y)へ集まる光・小さなハート・星 */
  gather(x, y, colors, count = 60, ms = 1200) {
    for (let i = 0; i < this.n(count); i++) {
      const a = rand(0, TAU), d = Math.max(this.w, this.h) * rand(0.45, 0.8), delay = rand(0, ms * 0.55);
      this.add({ kind: pick(['dot', 'dot', 'heart', 'star']), mode: 'gather', x0: x + Math.cos(a) * d, y0: y + Math.sin(a) * d, x1: x, y1: y,
        swirl: rand(-1.2, 1.2), t: -delay, life: ms * rand(0.45, 0.6), size: rand(2, 5.5), color: pick(colors), rot: rand(0, TAU) });
    }
  }

  /** (x, y)から弾ける。kinds:shard / heart / petal / ribbon / star / dot / flame(キャラ固有演出の炎)*/
  burst(x, y, { colors, kinds = ['shard', 'heart', 'dot'], count = 70, speed = 1, size = 1, gravity = 0.35 } = {}) {
    for (let i = 0; i < this.n(count); i++) {
      const a = rand(0, TAU), v = rand(2.5, 9) * speed;
      const kind = pick(kinds);
      this.add({ kind, mode: 'fly', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(0, 2), g: gravity * (kind === 'petal' || kind === 'ribbon' ? 0.35 : 1),
        drag: kind === 'petal' || kind === 'ribbon' ? 0.965 : 0.975, t: 0, life: rand(900, 1700), size: rand(3, kind === 'shard' ? 11 : 7) * size,
        color: pick(colors), rot: rand(0, TAU), vr: rand(-0.25, 0.25), sway: rand(0, TAU) });
    }
  }

  /** 波紋(画面全体に広がるハートの輪)*/
  ripple(x, y, color, ms = 900) { this.add({ kind: 'ring', mode: 'ring', x, y, t: 0, life: ms, color, size: 1 }); }

  /** 漂うキラキラ(SSR の見せ場)。null で止める */
  ambient(colors) { this.ambientOn = colors; if (colors) this.run(); }

  clear() { this.list.length = 0; this.ambientOn = null; }
  stop() { this.clear(); if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; this.g.clearRect(0, 0, this.c.width, this.c.height); }

  run() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(48, now - this.last); this.last = now;
      if (this.ambientOn && Math.random() < 0.55 * this.scale) {
        this.add({ kind: pick(['star', 'heart', 'dot', 'dot']), mode: 'float', x: rand(0, this.w), y: this.h + 10, vx: rand(-0.2, 0.2), vy: rand(-1.4, -0.6), t: 0, life: rand(1800, 3200), size: rand(2, 5), color: pick(this.ambientOn), rot: rand(0, TAU), vr: rand(-0.03, 0.03) });
      }
      this.step(dt);
      this.draw();
      if (this.list.length || this.ambientOn) this.raf = requestAnimationFrame(loop);
      else { this.raf = null; this.g.clearRect(0, 0, this.c.width, this.c.height); }
    };
    this.raf = requestAnimationFrame(loop);
  }

  step(dt) {
    const k = dt / 16.67;
    for (const p of this.list) {
      p.t += dt;
      if (p.mode === 'fly') { p.vx *= p.drag ** k; p.vy = p.vy * p.drag ** k + p.g * k; p.x += p.vx * k + (p.kind === 'petal' ? Math.sin(p.t / 180 + p.sway) * 0.6 : 0); p.y += p.vy * k; p.rot += p.vr * k; }
      else if (p.mode === 'float') { p.x += p.vx * k + Math.sin(p.t / 400) * 0.2; p.y += p.vy * k; p.rot += p.vr * k; }
    }
    this.list = this.list.filter((p) => p.t < p.life);
  }

  draw() {
    const g = this.g, d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (p.t < 0) continue;
      const u = p.t / p.life;
      let x = p.x, y = p.y, a = 1, s = p.size;
      if (p.mode === 'gather') {
        const e = u * u * (3 - 2 * u), sw = (1 - e) * p.swirl;
        const dx = p.x0 - p.x1, dy = p.y0 - p.y1;
        x = p.x1 + (dx * Math.cos(sw) - dy * Math.sin(sw)) * (1 - e); y = p.y1 + (dx * Math.sin(sw) + dy * Math.cos(sw)) * (1 - e);
        a = Math.min(1, u * 4) * (1 - Math.max(0, (u - 0.85) / 0.15)); s = p.size * (1 - e * 0.4);
      } else if (p.mode === 'ring') {
        const r = Math.max(this.w, this.h) * 0.85 * (1 - (1 - u) ** 3);
        g.globalAlpha = (1 - u) * 0.75; g.strokeStyle = p.color; g.lineWidth = 2 + 10 * (1 - u);
        this.heartPath(g, x, y, r); g.stroke();
        continue;
      } else a = 1 - u ** 1.6;
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = p.color;
      g.save(); g.translate(x, y); g.rotate(p.rot);
      switch (p.kind) {
        case 'heart': this.heartPath(g, 0, 0, s * 1.4); g.fill(); break;
        case 'star': this.starPath(g, s * 1.3); g.fill(); break;
        case 'shard': g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.6, s * 0.7); g.lineTo(-s * 0.5, s * 0.4); g.closePath(); g.fill(); break;
        case 'petal': g.beginPath(); g.ellipse(0, 0, s * 0.55, s, 0, 0, TAU); g.fill(); break;
        case 'ribbon': g.fillRect(-s * 0.25, -s * 1.2, s * 0.5, s * 2.4); break;
        case 'flame': g.beginPath(); g.moveTo(0, -s * 1.6); g.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s * 0.8); g.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s * 1.6); g.fill(); break;
        default: g.beginPath(); g.arc(0, 0, s * 0.6, 0, TAU); g.fill();
      }
      g.restore();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /** ハートの形(中心 x, y・大きさ r = 横幅の半分くらい)*/
  heartPath(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y + r * 0.9);
    g.bezierCurveTo(x - r * 1.25, y + r * 0.05, x - r * 0.9, y - r * 0.95, x, y - r * 0.38);
    g.bezierCurveTo(x + r * 0.9, y - r * 0.95, x + r * 1.25, y + r * 0.05, x, y + r * 0.9);
    g.closePath();
  }
  starPath(g, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, q = i % 2 ? r * 0.35 : r; g.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
    g.closePath();
  }
}
