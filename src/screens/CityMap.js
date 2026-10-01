/**
 * 夜の街マップ(攻略 ① お店を選ぶ)。Canvas 2D で描くアイソメトリックの歓楽街
 *   水路・橋・街灯・桜並木・建物の窓明かり・水面の映り込み・光の粒。お店の建物はデータ(ShopData.map / theme)から作る
 *   静的な街は一度だけオフスクリーンに描き、毎フレームは「水面のゆらぎ・選択中のお店の光・光の粒」だけを重ねる
 *   ドラッグで街を見回せる。お店の建物 / 名札をタップで選択(onSelect)
 */
const WW = 520, WH = 940;          // 街の大きさ(CSS px)
const HW = 22, HH = 11;             // タイルの半分の幅 / 高さ(2:1 のアイソメトリック)
const OX = WW / 2;

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a = 1) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const shade = (h, f) => { const [r, g, b] = hex(h); const k = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)))); return `rgb(${k(r)},${k(g)},${k(b)})`; };
const tileXY = (i, j) => ({ x: OX + (i - j) * HW, y: (i + j) * HH });
const toTile = (x, y) => { const a = (x - OX) / HW, b = y / HH; return { i: Math.round((a + b) / 2), j: Math.round((b - a) / 2) }; };

// 水路(u, v)と湖。ここを変えれば街の形が変わる
const CANALS = [
  { w: 40, pts: [[-0.1, 0.2], [0.2, 0.3], [0.46, 0.35], [0.6, 0.37], [1.1, 0.3]] },
  { w: 34, pts: [[0.6, 0.37], [0.58, 0.5], [0.52, 0.6], [0.6, 0.67], [0.85, 0.64], [1.1, 0.6]] },
  { w: 30, pts: [[0.52, 0.6], [0.34, 0.63], [0.16, 0.6], [-0.1, 0.62]] },
  { w: 32, pts: [[0.6, 0.67], [0.5, 0.8], [0.44, 0.9], [0.34, 1.1]] },
];
const LAKES = [{ u: 0.1, v: 0.45, rx: 74, ry: 40 }];
const BRIDGES = [{ c: 0, at: 0.3 }, { c: 0, at: 0.74 }, { c: 1, at: 0.3 }, { c: 2, at: 0.5 }, { c: 1, at: 0.75 }, { c: 3, at: 0.38 }];

const WALLS = ['#2a2446', '#30264c', '#3a2344', '#262d4e', '#2f2040', '#35203a'];
const ROOFS = ['#3e2b58', '#4a2442', '#24315a', '#3a1f3e'];
const LIT = ['#ffcf86', '#ffbb70', '#ffe0b0', '#ffd27a', '#ffcf86', '#ffc27a', '#ffb0d8'];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const canalPts = (c) => c.pts.map(([u, v]) => [u * WW, v * WH]);
function waterDist(x, y) {
  let d = Infinity;
  for (const c of CANALS) { const p = canalPts(c); for (let k = 1; k < p.length; k++) d = Math.min(d, segDist(x, y, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]) - c.w / 2); }
  for (const l of LAKES) { const cx = l.u * WW, cy = l.v * WH, e = Math.hypot((x - cx) / l.rx, (y - cy) / l.ry); d = Math.min(d, (e - 1) * Math.min(l.rx, l.ry)); }
  return d;
}
/** 水路の上の点(at = 0〜1)とその向き */
function canalAt(c, at) {
  const p = canalPts(c); const lens = []; let tot = 0;
  for (let k = 1; k < p.length; k++) { const l = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); lens.push(l); tot += l; }
  let r = at * tot;
  for (let k = 1; k < p.length; k++) {
    if (r <= lens[k - 1]) { const f = r / lens[k - 1]; const dx = (p[k][0] - p[k - 1][0]) / lens[k - 1], dy = (p[k][1] - p[k - 1][1]) / lens[k - 1]; return { x: p[k - 1][0] + f * (p[k][0] - p[k - 1][0]), y: p[k - 1][1] + f * (p[k][1] - p[k - 1][1]), dx, dy, w: c.w }; }
    r -= lens[k - 1];
  }
  return null;
}

export class CityMap {
  /** @param shops ShopData.SHOPS / isOpen(shop) / portrait(shop) → 画像 URL / onSelect(id) / onEnter(id) */
  constructor({ shops, isOpen, onSelect, onEnter, reduced = false }) {
    this.shops = shops; this.isOpen = isOpen; this.onSelect = onSelect; this.onEnter = onEnter; this.reduced = reduced;
    this.cam = { x: 0, y: 0 }; this.target = null; this.sel = null; this.t = 0;
    this.el = document.createElement('div');
    this.el.className = 'cm';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cm-canvas';
    this.markers = document.createElement('div');
    this.markers.className = 'cm-markers';
    this.tilt = document.createElement('div');
    this.tilt.className = 'cm-tilt';   // 上下だけぼかす(ジオラマのような奥行き)
    this.el.append(this.canvas, this.tilt, this.markers);
    this.build();
    this.bindPointer();
  }

  // ---------------- 街を作る(一度だけ)----------------
  build() {
    const dpr = this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const R = rng(20240917);
    const st = this.static = document.createElement('canvas');
    st.width = WW * dpr; st.height = WH * dpr;
    const g = st.getContext('2d');
    g.scale(dpr, dpr);
    this.lights = []; this.streaks = []; this.twinkles = [];
    this.shopGeo = new Map();

    // 地面:夜の石畳(遠くほど暗く、中央に少しだけ街の明かり)
    const bg = g.createLinearGradient(0, 0, 0, WH);
    bg.addColorStop(0, '#0b0816'); bg.addColorStop(0.5, '#140c22'); bg.addColorStop(1, '#0d0918');
    g.fillStyle = bg; g.fillRect(0, 0, WW, WH);

    // タイル:陸 / 水辺の遊歩道 / 水
    const tiles = [];
    for (let i = -40; i < 110; i++) for (let j = -40; j < 110; j++) {
      const { x, y } = tileXY(i, j);
      if (x < -HW * 2 || x > WW + HW * 2 || y < -HH * 2 || y > WH + 60) continue;
      const wd = waterDist(x, y);
      const street = ((i % 5) + 5) % 5 === 0 || ((j % 4) + 4) % 4 === 0;
      tiles.push({ i, j, x, y, wd, kind: wd < 2 ? 'water' : wd < 18 ? 'walk' : street ? 'street' : 'land' });
    }
    this.tiles = tiles;
    // お店の敷地(建物 + 前の広場)
    const reserve = new Set();
    for (const s of this.shops) {
      const c = toTile(s.map.u * WW, s.map.v * WH), n = s.map.size ?? 2, pad = 2;
      const geo = { i: c.i, j: c.j, n };
      this.shopGeo.set(s.id, geo);
      for (let a = -pad; a < n + pad; a++) for (let b = -pad; b < n + pad + 1; b++) reserve.add(`${c.i + a},${c.j + b}`);
    }
    // 石畳
    for (const t of tiles) {
      if (t.kind === 'water') continue;
      const v = R();
      g.fillStyle = t.kind === 'walk' ? (v < 0.5 ? '#2b2342' : '#2f2648') : t.kind === 'street' ? (v < 0.5 ? '#241c38' : '#271e3c') : (v < 0.33 ? '#18122a' : v < 0.66 ? '#1b142e' : '#161026');
      this.diamond(g, t.x, t.y, HW, HH); g.fill();
    }
    // お店の前の広場(丸い石畳 + 光)
    for (const s of this.shops) {
      const geo = this.shopGeo.get(s.id), base = this.shopBase(geo);
      const open = this.isOpen(s);
      g.save(); g.translate(base.x, base.y + HH * 1.6); g.scale(1, 0.5);
      const rr = HH * (geo.n + 2.6) * 2;
      const pg = g.createRadialGradient(0, 0, 4, 0, 0, rr);
      pg.addColorStop(0, open ? rgba(s.theme.accent, 0.42) : 'rgba(80,70,110,.22)'); pg.addColorStop(0.55, open ? rgba(s.theme.accent, 0.12) : 'rgba(60,50,90,.1)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = '#2a2140'; g.beginPath(); g.arc(0, 0, rr * 0.82, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,190,225,.18)'; g.lineWidth = 2;
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(0, 0, rr * 0.82 * k / 3.2, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = pg; g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // 水:岸の石 → 水面(深い紺)→ 映り込みはあとで
    const waterPath = this.waterPath = new Path2D();
    const strokeCanals = (w, color) => {
      g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const c of CANALS) { const p = canalPts(c); g.lineWidth = c.w + w; g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) g.lineTo(p[k][0], p[k][1]); g.stroke(); }
      for (const l of LAKES) { g.lineWidth = w; g.fillStyle = color; g.beginPath(); g.ellipse(l.u * WW, l.v * WH, l.rx + w / 2, l.ry + w / 4, 0, 0, Math.PI * 2); g.fill(); }
    };
    strokeCanals(12, '#3b3058');
    strokeCanals(7, '#55467a');
    strokeCanals(0, '#0a1433');
    // 水面の形(映り込みのクリップ用):水のタイルの集まりで近似
    for (const t of tiles) if (t.wd < -1) waterPath.rect(t.x - HW - 1, t.y - HH - 1, HW * 2 + 2, HH * 2 + 2);
    // 水面のグラデーション(中央が少し明るい)
    g.save(); g.clip(waterPath);
    const wg = g.createLinearGradient(0, 0, WW, WH);
    wg.addColorStop(0, 'rgba(40,60,140,.25)'); wg.addColorStop(0.5, 'rgba(120,60,150,.22)'); wg.addColorStop(1, 'rgba(30,40,110,.25)');
    g.fillStyle = wg; g.fillRect(0, 0, WW, WH);
    g.restore();
    // 湖の噴水(小島)
    for (const l of LAKES) {
      const cx = l.u * WW, cy = l.v * WH;
      g.fillStyle = '#3a2f55'; g.beginPath(); g.ellipse(cx, cy, 14, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a4a80'; g.beginPath(); g.ellipse(cx, cy - 2, 10, 5, 0, 0, Math.PI * 2); g.fill();
      this.lights.push({ x: cx, y: cy - 8, r: 34, c: '#9fd8ff', a: 0.5 });
      this.fountain = { x: cx, y: cy - 4 };
    }

    // 建物・木・街灯・橋・お店を奥から順に
    const objs = [];
    for (const t of tiles) {
      if (t.kind === 'water' || reserve.has(`${t.i},${t.j}`)) continue;
      if (t.kind === 'walk' || t.kind === 'street') {
        if (R() < (t.kind === 'walk' ? 0.16 : 0.1) && t.wd > 6) objs.push({ y: t.y, draw: () => this.lamp(g, t.x, t.y) });
        else if (R() < (t.kind === 'walk' ? 0.22 : 0.06) && t.wd > 8) objs.push({ y: t.y, draw: () => this.tree(g, t.x, t.y, R) });
        continue;
      }
      const r = R();
      if (r < 0.12) objs.push({ y: t.y, draw: () => this.tree(g, t.x, t.y, R) });
      else if (r < 0.86) {
        const tall = R() < 0.05, h = tall ? 46 + R() * 22 : 14 + R() * 20;
        const wall = WALLS[Math.floor(R() * WALLS.length)], roof = ROOFS[Math.floor(R() * ROOFS.length)];
        const style = tall ? 'spire' : (['flat', 'gable', 'pyramid', 'gable', 'mansard', 'mansard'])[Math.floor(R() * 6)];
        const lit = 0.25 + R() * 0.45, k = 0.78 + R() * 0.14;
        objs.push({ y: t.y, draw: () => this.building(g, t.x, t.y, HW * k, HH * k, h, { wall, roof, style, lit, R }) });
      }
    }
    for (const b of BRIDGES) { const p = canalAt(CANALS[b.c], b.at); if (p) objs.push({ y: p.y + 6, draw: () => this.bridge(g, p) }); }
    for (const s of this.shops) {
      const geo = this.shopGeo.get(s.id), base = this.shopBase(geo);
      objs.push({ y: base.y + HH * geo.n, draw: () => this.shop(g, s, geo) });
    }
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) o.draw();

    // 光(加算):窓・街灯・お店。水面への映り込み
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const L of this.lights) {
      const rg = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      rg.addColorStop(0, rgba(L.c, L.a)); rg.addColorStop(1, rgba(L.c, 0));
      g.fillStyle = rg; g.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    g.restore();
    // 映り込み:水辺の光を真下へ伸ばす(水面だけ)
    for (const L of this.lights) {
      if (L.a < 0.2) continue;
      for (let dy = 8; dy < 70; dy += 6) {
        const y = L.y + dy, wd = waterDist(L.x, y);
        if (wd < -3) { this.streaks.push({ x: L.x, y, len: 26 + L.r * 0.4, c: L.c, ph: R() * 6.28, a: Math.min(0.55, L.a) }); break; }
      }
    }
    g.save(); g.clip(waterPath); g.globalCompositeOperation = 'lighter';
    for (const s of this.streaks) {
      const lg = g.createLinearGradient(s.x, s.y, s.x, s.y + s.len);
      lg.addColorStop(0, rgba(s.c, s.a * 0.6)); lg.addColorStop(1, rgba(s.c, 0));
      g.fillStyle = lg; g.fillRect(s.x - 2.5, s.y, 5, s.len);
    }
    g.restore();
    // 空気感:上下の暗がりと中央のピンクのもや
    const vg = g.createRadialGradient(WW * 0.45, WH * 0.48, WH * 0.15, WW * 0.45, WH * 0.48, WH * 0.75);
    vg.addColorStop(0, 'rgba(255,80,170,.07)'); vg.addColorStop(0.6, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,2,10,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, WW, WH);
  }

  /** フォントの読み込み後など:街を描き直す(同じ seed なので形は同じ)*/
  rebuild() { this.build(); this.snaps?.clear(); if (this.raf || this.reduced) this.draw(); }

  shopBase(geo) { const n = geo.n; const a = tileXY(geo.i + (n - 1) / 2, geo.j + (n - 1) / 2); return a; }

  diamond(g, x, y, hw, hh) { g.beginPath(); g.moveTo(x, y - hh); g.lineTo(x + hw, y); g.lineTo(x, y + hh); g.lineTo(x - hw, y); g.closePath(); }
  poly(g, pts, fill) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } }

  /** 箱の建物(左面は月明かりで明るく、右面は暗く)+ 窓 + 屋根 */
  building(g, x, y, hw, hh, h, { wall, roof, style, lit, R, windowColor = null, accent = null, arched = false }) {
    const L = [x - hw, y], B = [x, y + hh], Rr = [x + hw, y], T = [x, y - hh];
    const up = (p, d = h) => [p[0], p[1] - d];
    this.poly(g, [L, B, up(B), up(L)], shade(wall, 0.12));
    this.poly(g, [B, Rr, up(Rr), up(B)], shade(wall, -0.22));
    // 窓
    const face = (P, Q, dark) => {
      const cols = Math.max(1, Math.round(hw / 7)), rows = Math.max(1, Math.floor((h - 6) / 8));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const s0 = (c + 0.28) / cols, s1 = (c + 0.72) / cols, z0 = 4 + r * 8, z1 = z0 + (arched ? 6 : 4.2);
        const on = R() < lit, col = on ? (windowColor ?? LIT[Math.floor(R() * LIT.length)]) : dark;
        const pt = (s, z) => [P[0] + s * (Q[0] - P[0]), P[1] + s * (Q[1] - P[1]) - z];
        this.poly(g, [pt(s0, z0), pt(s1, z0), pt(s1, z1), pt(s0, z1)], col);
        if (on && R() < 0.35) { const m = pt((s0 + s1) / 2, (z0 + z1) / 2); this.lights.push({ x: m[0], y: m[1], r: 9, c: col, a: 0.22 }); if (R() < 0.05) this.twinkles.push({ x: m[0], y: m[1], c: col, ph: R() * 6.28 }); }
      }
    };
    face(L, B, '#140e22'); face(B, Rr, '#0e0a18');
    // 1階の店先の灯り(通りに漏れる光)
    if (R() < lit * 0.6) this.lights.push({ x: x - hw * 0.3, y: y + hh * 0.4, r: 18, c: LIT[Math.floor(R() * LIT.length)], a: 0.32 });
    // 屋根
    const tL = up(L), tB = up(B), tR = up(Rr), tT = up(T);
    if (style === 'pyramid' || style === 'spire') {
      const ap = [x, y - h - hh * (style === 'spire' ? 4.2 : 1.6)];
      this.poly(g, [tT, tL, ap], shade(roof, -0.1)); this.poly(g, [tT, tR, ap], shade(roof, -0.3));
      this.poly(g, [tL, tB, ap], shade(roof, 0.14)); this.poly(g, [tB, tR, ap], shade(roof, -0.15));
      if (style === 'spire') this.lights.push({ x: ap[0], y: ap[1], r: 8, c: '#ff9fd0', a: 0.5 });
    } else if (style === 'gable') {
      const r1 = [(tL[0] + tT[0]) / 2, (tL[1] + tT[1]) / 2 - hh * 1.3], r2 = [(tB[0] + tR[0]) / 2, (tB[1] + tR[1]) / 2 - hh * 1.3];
      this.poly(g, [tT, tR, r2, r1], shade(roof, -0.28)); this.poly(g, [tL, tB, r2, r1], shade(roof, 0.12)); this.poly(g, [tB, tR, r2], shade(wall, -0.3));
    } else if (style === 'mansard') {
      const k = 0.62, c = [x, y - h], inner = (p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k - hh * 0.9];
      this.poly(g, [tL, tB, inner(tB), inner(tL)], shade(roof, 0.1)); this.poly(g, [tB, tR, inner(tR), inner(tB)], shade(roof, -0.25));
      this.poly(g, [inner(tT), inner(tR), inner(tB), inner(tL)], shade(roof, -0.05));
    } else {
      this.poly(g, [tT, tR, tB, tL], shade(roof, -0.15));
      g.strokeStyle = shade(wall, 0.25); g.lineWidth = 1; g.beginPath(); g.moveTo(tL[0], tL[1]); g.lineTo(tB[0], tB[1]); g.lineTo(tR[0], tR[1]); g.stroke();
    }
    if (accent) { g.strokeStyle = rgba(accent, 0.9); g.lineWidth = 1.2; g.beginPath(); g.moveTo(tL[0], tL[1] + 1); g.lineTo(tB[0], tB[1] + 1); g.lineTo(tR[0], tR[1] + 1); g.stroke(); }
  }

  tree(g, x, y, R) {
    const pink = R() < 0.55, r = 6 + R() * 4;
    g.fillStyle = '#1a1020'; g.fillRect(x - 1, y - 8, 2, 8);
    const cg = g.createRadialGradient(x - 2, y - 12 - r * 0.4, 1, x, y - 10, r * 1.2);
    cg.addColorStop(0, pink ? '#c2558f' : '#3d5470'); cg.addColorStop(0.6, pink ? '#6a2453' : '#1f2b44'); cg.addColorStop(1, pink ? '#3a1232' : '#121a2c');
    g.fillStyle = cg; g.beginPath(); g.ellipse(x, y - 10, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
    if (pink) { this.lights.push({ x, y: y - 10, r: 14, c: '#ff7cc0', a: 0.12 }); g.fillStyle = 'rgba(255,190,225,.8)'; for (let k = 0; k < 4; k++) g.fillRect(x - r + R() * r * 2, y - 10 - r * 0.6 + R() * r, 1, 1); }
  }

  lamp(g, x, y) {
    g.fillStyle = '#0c0814'; g.fillRect(x - 0.6, y - 13, 1.2, 13);
    g.fillStyle = '#ffe0a0'; g.beginPath(); g.arc(x, y - 14, 1.8, 0, Math.PI * 2); g.fill();
    this.lights.push({ x, y: y - 14, r: 22, c: '#ffc070', a: 0.55 });
    this.twinkles.push({ x, y: y - 14, c: '#ffd590', ph: x * 0.1 });
  }

  bridge(g, p) {
    const nx = -p.dy, ny = p.dx, L = p.w / 2 + 12, a = [p.x - nx * L, p.y - ny * L], b = [p.x + nx * L, p.y + ny * L];
    const mid = [p.x, p.y - 9], half = 4.5, ox = p.dx * half, oy = p.dy * half;
    const curve = (o, s) => { g.moveTo(a[0] + o[0], a[1] + o[1]); g.quadraticCurveTo(mid[0] + o[0], mid[1] + o[1] - s, b[0] + o[0], b[1] + o[1]); };
    // 橋の側面(アーチ)
    g.fillStyle = '#2c2342'; g.beginPath(); curve([ox, oy], 0); g.lineTo(b[0] + ox, b[1] + oy + 6); g.quadraticCurveTo(mid[0] + ox, mid[1] + oy + 2, a[0] + ox, a[1] + oy + 6); g.closePath(); g.fill();
    // 路面
    g.beginPath(); curve([-ox, -oy], 0); g.lineTo(b[0] + ox, b[1] + oy); g.quadraticCurveTo(mid[0] + ox, mid[1] + oy, a[0] + ox, a[1] + oy); g.closePath(); g.fillStyle = '#5a4a78'; g.fill();
    // 欄干の灯り
    g.strokeStyle = 'rgba(255,200,150,.55)'; g.lineWidth = 0.8; g.beginPath(); curve([ox, oy], 3); g.stroke(); g.beginPath(); curve([-ox, -oy], 3); g.stroke();
    for (const t of [0.12, 0.5, 0.88]) {
      for (const s of [-1, 1]) {
        const q = (1 - t) * (1 - t), m = 2 * (1 - t) * t, e = t * t;
        const x = q * a[0] + m * mid[0] + e * b[0] + ox * s, y = q * a[1] + m * mid[1] + e * b[1] + oy * s - 4;
        g.fillStyle = '#ffd9a0'; g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        this.lights.push({ x, y, r: 10, c: '#ffc080', a: 0.4 });
      }
    }
  }

  /** お店の建物(style ごとに屋根・塔・ドーム)+ ネオン看板 */
  shop(g, s, geo) {
    const R = rng(s.id.length * 977 + s.id.charCodeAt(0));
    const open = this.isOpen(s), th = s.theme, base = this.shopBase(geo), n = geo.n;
    const hw = HW * n * 0.92, hh = HH * n * 0.92;
    const wall = open ? th.wall : shade(th.wall, -0.35), roof = open ? th.roof : shade(th.roof, -0.3);
    const lit = open ? 0.92 : 0.18, windowColor = open ? th.window : '#5d5370';
    const x = base.x, y = base.y;
    let top = y - 40, h = 40;
    // 基壇
    this.building(g, x, y + 3, hw + 4, hh + 2, 5, { wall: '#4a3d68', roof: '#5a4a7c', style: 'flat', lit: 0, R });
    switch (s.map.style) {
      case 'palace': {
        h = 30; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'mansard', lit, R, windowColor, accent: open ? th.accent : null, arched: true });
        // 左右の翼棟 + 中央のドーム
        this.building(g, x - hw * 0.62, y - hh * 0.05, hw * 0.34, hh * 0.34, h + 10, { wall: shade(wall, 0.06), roof, style: 'pyramid', lit, R, windowColor, arched: true });
        this.building(g, x + hw * 0.62, y - hh * 0.05, hw * 0.34, hh * 0.34, h + 10, { wall: shade(wall, 0.06), roof, style: 'pyramid', lit, R, windowColor, arched: true });
        this.dome(g, x, y - h - hh * 0.55, hw * 0.3, roof, open ? th.accent : null);
        top = y - h - hh * 0.55 - hw * 0.5;
        break;
      }
      case 'manor': {
        h = 30; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'gable', lit, R, windowColor, arched: true });
        this.building(g, x - hw * 0.45, y - hh * 0.2, hw * 0.3, hh * 0.3, h + 26, { wall: shade(wall, 0.05), roof, style: 'pyramid', lit, R, windowColor });
        top = y - h - 26 - hh * 0.5;
        break;
      }
      case 'tower': {
        h = 26; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'flat', lit, R, windowColor });
        this.building(g, x, y - 2, hw * 0.55, hh * 0.55, h + 30, { wall: shade(wall, 0.06), roof, style: 'spire', lit, R, windowColor, arched: true });
        top = y - h - 30 - hh * 2.4;
        break;
      }
      case 'dome': {
        h = 30; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'flat', lit, R, windowColor, arched: true });
        this.dome(g, x, y - h + 2, hw * 0.62, roof, open ? th.accent : null);
        top = y - h - hw * 0.75;
        break;
      }
      default: { // gazebo
        h = 24; this.building(g, x, y, hw * 0.9, hh * 0.9, h, { wall, roof, style: 'flat', lit, R, windowColor, arched: true });
        this.dome(g, x, y - h + 1, hw * 0.75, roof, open ? th.accent : null);
        top = y - h - hw * 0.8;
      }
    }
    // ネオン看板(右の壁)
    const sx = x + hw * 0.08, sy = y + hh * 0.55 - h * 0.62;
    g.save(); g.setTransform(this.dpr, -0.5 * this.dpr, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    g.font = `italic 700 ${n >= 3 ? 11 : 9}px "Great Vibes", "Cormorant Garamond", Georgia, serif`;
    g.textBaseline = 'middle';
    g.shadowColor = open ? th.accent : 'transparent'; g.shadowBlur = open ? 8 : 0;
    g.fillStyle = open ? shade(th.glow, 0.3) : '#4e4560';
    g.fillText(s.name, 2, 0);
    g.restore();
    // 入口の灯り
    const door = [x - hw * 0.5, y + hh * 0.5];
    g.fillStyle = open ? shade(th.window, 0.1) : '#2a2238';
    this.poly(g, [[door[0] - 3, door[1] - 1.5], [door[0] + 3, door[1] + 1.5], [door[0] + 3, door[1] - 9], [door[0] - 3, door[1] - 12]]);
    g.fill();
    if (open) {
      this.lights.push({ x: door[0], y: door[1] - 6, r: 30, c: th.window, a: 0.5 }, { x, y: y - h * 0.5, r: 70, c: th.accent, a: 0.3 }, { x: sx + 20, y: sy - 8, r: 34, c: th.accent, a: 0.45 });
      // ガーランド(屋根の縁の電飾)
      for (let k = 0; k <= 10; k++) {
        // 左の角 → 手前の角 → 右の角(屋根の縁)
        const t = k / 10, px = x - hw + t * hw * 2, py = y - h + (t <= 0.5 ? t : 1 - t) * 2 * hh + 2;
        g.fillStyle = k % 2 ? '#ffd5ea' : '#ffe9b0'; g.fillRect(px - 0.8, py - 0.8, 1.6, 1.6);
      }
    } else {
      this.lights.push({ x, y: y - h * 0.5, r: 40, c: '#6a5a9a', a: 0.12 });
    }
    this.shopGeo.set(s.id, { ...geo, x, y, top, hw, h, box: { x0: x - hw - 6, x1: x + hw + 6, y0: top - 6, y1: y + hh + 6 } });
  }

  dome(g, x, y, r, roof, accent) {
    const dg = g.createRadialGradient(x - r * 0.4, y - r * 0.8, 1, x, y - r * 0.3, r * 1.3);
    dg.addColorStop(0, shade(roof, 0.35)); dg.addColorStop(0.6, roof); dg.addColorStop(1, shade(roof, -0.4));
    g.fillStyle = dg; g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI); g.lineTo(x - r, y); g.ellipse(x, y, r, r * 1.05, 0, Math.PI, 0); g.fill();
    if (accent) { g.strokeStyle = rgba(accent, 0.8); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI); g.stroke(); }
    g.fillStyle = accent ?? '#7a6a9a'; g.fillRect(x - 0.8, y - r * 1.05 - 8, 1.6, 8);
    if (accent) this.lights.push({ x, y: y - r * 1.05 - 8, r: 12, c: accent, a: 0.7 });
  }

  // ---------------- 表示 ----------------
  mount(host) {
    host.appendChild(this.el);
    this.resize();
    this.renderMarkers();
    if (!this.sel) this.select(this.shops.find((s) => this.isOpen(s))?.id ?? this.shops[0]?.id, { snap: true, silent: true });
    else this.focus(this.sel, true);
    this.start();
  }
  resize() {
    const r = this.el.getBoundingClientRect();
    this.vw = Math.max(1, r.width); this.vh = Math.max(1, r.height);
    this.canvas.width = Math.round(this.vw * this.dpr); this.canvas.height = Math.round(this.vh * this.dpr);
    this.clampCam();
  }
  /** お店の名札(建物の上)*/
  renderMarkers() {
    this.markers.innerHTML = this.shops.map((s) => {
      const geo = this.shopGeo.get(s.id), open = this.isOpen(s);
      return `<button type="button" class="cm-pin ${s.map.label === 'right' ? 'r' : 'l'}${open ? '' : ' locked'}" data-shop="${s.id}" style="left:${geo.x}px;top:${geo.top}px;--ac:${s.theme.accent};--gl:${s.theme.glow}">
        <span class="cm-face face-crop">${open ? this.portrait?.(s) ?? '' : '<i class="cm-lock" aria-hidden="true"></i>'}</span>
        <span class="cm-plate"><b>${s.name}</b><small>${s.ja}</small></span>${s.badge ? `<em class="cm-new">${s.badge}</em>` : ''}<i class="cm-heart" aria-hidden="true">♥</i></button>`;
    }).join('');
    this.pins = [...this.markers.querySelectorAll('[data-shop]')];
    for (const b of this.pins) b.addEventListener('click', (e) => { e.stopPropagation(); if (this.dragged) return; const id = b.dataset.shop; if (id === this.sel && this.isOpen(this.shops.find((s) => s.id === id))) this.onEnter?.(id); else this.select(id); });
  }
  select(id, { snap = false, silent = false } = {}) {
    if (!id) return;
    this.sel = id;
    for (const b of this.markers.querySelectorAll('[data-shop]')) b.classList.toggle('sel', b.dataset.shop === id);
    this.focus(id, snap);
    if (!silent) this.onSelect?.(id);
  }
  /** 選んだお店が画面の見やすい位置へ来るようにカメラを動かす */
  focus(id, snap = false) {
    const geo = this.shopGeo.get(id); if (!geo) return;
    const tx = geo.x - this.vw * 0.5, ty = geo.y - this.vh * (this.focusY ?? 0.5);
    this.target = { x: tx, y: ty };
    if (snap || this.reduced) { this.cam.x = tx; this.cam.y = ty; this.clampCam(); this.target = null; this.place(); }
  }
  clampCam() {
    this.cam.x = Math.max(0, Math.min(WW - this.vw, this.cam.x));
    this.cam.y = Math.max(0, Math.min(WH - this.vh, this.cam.y));
  }
  place() {
    this.markers.style.transform = `translate(${-this.cam.x}px, ${-this.cam.y}px)`;
    // 見出し / 情報カードの下に隠れる名札は薄く(画面の上下の重なりを減らす)
    const lo = this.band?.top ?? -Infinity, hi = this.band?.bottom ?? Infinity;
    for (const b of this.pins ?? []) {
      const geo = this.shopGeo.get(b.dataset.shop), y0 = geo.top - this.cam.y - 70, y1 = geo.top - this.cam.y;
      const f = Math.min(1, Math.max(0, (y0 - lo + 30) / 50), Math.max(0, (hi - y1 + 20) / 50));
      b.style.opacity = f.toFixed(2); b.style.pointerEvents = f < 0.3 ? 'none' : '';
    }
  }

  bindPointer() {
    let start = null, last = null, vel = { x: 0, y: 0 };
    this.el.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, t: performance.now() }; last = { x: e.clientX, y: e.clientY, t: start.t }; this.dragged = false; this.target = null; vel = { x: 0, y: 0 }; this.inertia = null; });
    this.el.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!this.dragged && Math.hypot(dx, dy) > 7) { this.dragged = true; try { this.el.setPointerCapture(e.pointerId); } catch { /* noop */ } }
      if (!this.dragged) return;
      const now = performance.now(), dt = Math.max(1, now - last.t);
      vel = { x: (e.clientX - last.x) / dt, y: (e.clientY - last.y) / dt }; last = { x: e.clientX, y: e.clientY, t: now };
      this.cam.x = start.cx - dx; this.cam.y = start.cy - dy; this.clampCam(); this.place();
    });
    const end = (e) => {
      if (!start) return;
      if (!this.dragged) {
        // タップ:建物に当たったお店を選ぶ
        const r = this.el.getBoundingClientRect(), wx = e.clientX - r.left + this.cam.x, wy = e.clientY - r.top + this.cam.y;
        const hit = this.shops.find((s) => { const b = this.shopGeo.get(s.id).box; return wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1; });
        if (hit) { if (hit.id === this.sel && this.isOpen(hit)) this.onEnter?.(hit.id); else this.select(hit.id); }
      } else if (!this.reduced) this.inertia = { x: -vel.x * 16, y: -vel.y * 16 };
      start = null;
      setTimeout(() => { this.dragged = false; }, 0);
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', () => { start = null; this.dragged = false; });
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
      if (this.target) {
        const k = 1 - Math.exp(-dt * 6);
        this.cam.x += (this.target.x - this.cam.x) * k; this.cam.y += (this.target.y - this.cam.y) * k;
        const before = { ...this.cam }; this.clampCam();
        if (Math.hypot(this.target.x - before.x, this.target.y - before.y) < 0.5 || (before.x !== this.cam.x && before.y !== this.cam.y)) this.target = null;
        this.place();
      } else if (this.inertia) {
        this.cam.x += this.inertia.x * dt * 6; this.cam.y += this.inertia.y * dt * 6; this.inertia.x *= 0.9; this.inertia.y *= 0.9;
        this.clampCam(); this.place();
        if (Math.hypot(this.inertia.x, this.inertia.y) < 0.3) this.inertia = null;
      }
      this.draw();
      if (this.reduced) this.stop();
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }

  draw() {
    const g = this.canvas.getContext('2d'), d = this.dpr, t = this.t;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.static, this.cam.x * d, this.cam.y * d, this.vw * d, this.vh * d, 0, 0, this.vw * d, this.vh * d);
    g.setTransform(d, 0, 0, d, -this.cam.x * d, -this.cam.y * d);
    g.save(); g.globalCompositeOperation = 'lighter';
    // 水面のゆらぎ(映り込みの横線が揺れる)
    g.save(); g.clip(this.waterPath);
    for (const s of this.streaks) {
      if (s.x < this.cam.x - 20 || s.x > this.cam.x + this.vw + 20 || s.y < this.cam.y - 80 || s.y > this.cam.y + this.vh + 10) continue;
      for (let k = 0; k < 5; k++) {
        const y = s.y + 3 + k * s.len / 5, w = (5 - k) * 1.6 + 2 * Math.sin(t * 2.2 + s.ph + k), a = s.a * (0.5 + 0.5 * Math.sin(t * 3 + s.ph + k * 1.7)) * (1 - k / 5);
        g.fillStyle = rgba(s.c, a); g.fillRect(s.x - w + Math.sin(t * 1.6 + k + s.ph) * 1.5, y, w * 2, 1.1);
      }
    }
    g.restore();
    // 窓・街灯のまたたき
    for (const w of this.twinkles) { const a = 0.18 + 0.18 * Math.sin(t * 2.4 + w.ph); const rg = g.createRadialGradient(w.x, w.y, 0, w.x, w.y, 12); rg.addColorStop(0, rgba(w.c, a)); rg.addColorStop(1, rgba(w.c, 0)); g.fillStyle = rg; g.fillRect(w.x - 12, w.y - 12, 24, 24); }
    // 噴水
    if (this.fountain) { const f = this.fountain; for (let k = 0; k < 14; k++) { const p = (t * 0.9 + k / 14) % 1, ang = k * 2.4; const x = f.x + Math.cos(ang) * p * 9, y = f.y - Math.sin(p * Math.PI) * 14 + p * 4; g.fillStyle = `rgba(190,230,255,${0.7 * (1 - p)})`; g.fillRect(x - 0.7, y - 0.7, 1.4, 1.4); } }
    // 選んだお店:足元の光・光の柱
    const s = this.shops.find((x) => x.id === this.sel), geo = s && this.shopGeo.get(s.id);
    if (geo) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.6), c = this.isOpen(s) ? s.theme.accent : '#8a7ab8';
      g.save(); g.translate(geo.x, geo.y + HH * 1.2); g.scale(1, 0.5);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, geo.hw * 2.4); rg.addColorStop(0, rgba(c, 0.5 * pulse)); rg.addColorStop(1, rgba(c, 0)); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, geo.hw * 2.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(c, 0.55 * pulse); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, geo.hw * (1.5 + 0.25 * ((t * 0.8) % 1)), 0, Math.PI * 2); g.stroke();
      g.restore();
      const bg = g.createLinearGradient(0, geo.top - 70, 0, geo.y);
      bg.addColorStop(0, rgba(c, 0)); bg.addColorStop(1, rgba(c, 0.16 * pulse));
      g.fillStyle = bg; g.fillRect(geo.x - geo.hw * 0.9, geo.top - 70, geo.hw * 1.8, geo.y - geo.top + 70);
    }
    g.restore();
    // 光の粒(画面に対して漂う)
    g.setTransform(d, 0, 0, d, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 26; k++) {
      const sx = ((k * 97.3 + t * (4 + (k % 5))) % (this.vw + 40)) - 20, sy = (this.vh - ((k * 61.7 + t * (7 + (k % 7))) % (this.vh + 40))) + 20;
      const r = 1 + (k % 4) * 0.8, a = 0.25 + 0.2 * Math.sin(t * 1.3 + k);
      g.fillStyle = k % 3 ? `rgba(255,150,205,${a})` : `rgba(255,220,160,${a})`; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  /** お店の建物だけを切り出した画像(情報カードのサムネイル)*/
  snapshot(id, w = 120, h = 84) {
    const geo = this.shopGeo.get(id); if (!geo) return '';
    this.snaps ??= new Map();
    if (this.snaps.has(id)) return this.snaps.get(id);
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d'), d = this.dpr;
    const bw = (geo.hw * 2 + 50), bh = bw * h / w, cx = geo.x, cy = (geo.top + geo.y) / 2 + 6;
    g.drawImage(this.static, (cx - bw / 2) * d, (cy - bh / 2) * d, bw * d, bh * d, 0, 0, c.width, c.height);
    let url = '';
    try { url = c.toDataURL('image/jpeg', 0.82); } catch { /* noop */ }
    this.snaps.set(id, url);
    return url;
  }
}
