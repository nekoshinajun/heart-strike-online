/**
 * コンカフェ街マップ(攻略 ① お店を選ぶ)。Canvas 2D で描くアイソメトリックの「かわいいお店が並ぶ昼の街」
 *   水色の水路・白い橋・テラス席・並木・花壇・パステルの街並み。お店の建物はデータ(ShopData.map / theme)から作り、
 *   外観(style)だけでコンセプトが分かる:王道メイド / 猫 / 星・宇宙 / ゴシック / 和風 / スイーツ
 *   静的な街は一度だけオフスクリーンに描き、毎フレームは「水面のきらめき・選択中のお店のリング・舞う花びら」だけを重ねる
 *   ドラッグで街を見回せる。お店の建物 / 名札をタップで選択(onSelect)
 */
const WW = 520, WH = 940;          // 街の大きさ(CSS px)
const HW = 22, HH = 11;             // タイルの半分の幅 / 高さ(2:1 のアイソメトリック)
const OX = WW / 2;

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a = 1) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const shade = (h, f) => { const [r, g, b] = hex(h); const k = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)))); return `#${[k(r), k(g), k(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`; };   // hex を返す(結果をまた shade / rgba に渡せる)
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

// 昼のコンカフェ街:白・アイボリー・淡いピンク・水色・ミント・ラベンダー・木目。夜の黒・ネオンは使わない
const WALLS = ['#fff7ee', '#ffeef3', '#eef8f3', '#f2eefb', '#edf5fd', '#fdf2df', '#fff3f6'];
const ROOFS = ['#f3a5b8', '#9ccfd6', '#c7b2e4', '#e8b48c', '#f6c3a6', '#a8c7ec', '#b9dcc4'];
const GLASS = ['#d6edf7', '#cfe6f3', '#e2f2f8'];
const LIT = ['#ffe9b8', '#ffe2a8', '#fff0c8'];   // 店内の暖色の照明(昼でも少し見える)
const AWN = ['#ff9cbf', '#8fd3c4', '#b9a6e6', '#ffb88a', '#8fc3ec'];   // 店先のストライプのひさし

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
    this.lights = []; this.sparkles = []; this.twinkles = [];
    this.shopGeo = new Map();

    // 地面:昼の石畳(アイボリー〜あたたかいベージュ)
    const bg = g.createLinearGradient(0, 0, 0, WH);
    bg.addColorStop(0, '#fbf4ec'); bg.addColorStop(0.5, '#f8eee4'); bg.addColorStop(1, '#f6eadf');
    g.fillStyle = bg; g.fillRect(0, 0, WW, WH);

    // タイル:陸 / 水辺の遊歩道 / 通り / 水
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
    // 石畳 + 芝生(小さな公園)
    for (const t of tiles) {
      if (t.kind === 'water') continue;
      const v = R();
      t.grass = t.kind === 'land' && ((Math.sin(t.i * 0.7) + Math.cos(t.j * 0.55)) > 1.15 || v < 0.06);
      g.fillStyle = t.kind === 'walk' ? (v < 0.5 ? '#ecdccb' : '#efe1d1') : t.kind === 'street' ? (v < 0.5 ? '#f6e9dc' : '#f4e6d8')
        : t.grass ? (v < 0.5 ? '#d8eccb' : '#d2e8c4') : (v < 0.33 ? '#f3e7da' : v < 0.66 ? '#f1e4d6' : '#f5eadf');
      this.diamond(g, t.x, t.y, HW, HH); g.fill();
      // 目地(ごく薄く)
      g.strokeStyle = 'rgba(190,160,140,.16)'; g.lineWidth = 0.6; g.stroke();
    }
    // お店の前の広場(丸いタイル + お店の色)
    for (const s of this.shops) {
      const geo = this.shopGeo.get(s.id), base = this.shopBase(geo);
      const open = this.isOpen(s);
      g.save(); g.translate(base.x, base.y + HH * 1.6); g.scale(1, 0.5);
      const rr = HH * (geo.n + 2.6) * 2;
      g.fillStyle = '#fbf3ea'; g.beginPath(); g.arc(0, 0, rr * 0.86, 0, Math.PI * 2); g.fill();
      g.fillStyle = rgba(s.theme.accent, open ? 0.16 : 0.07); g.beginPath(); g.arc(0, 0, rr * 0.86, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(s.theme.accent, open ? 0.35 : 0.15); g.lineWidth = 2;
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(0, 0, rr * 0.86 * k / 3.2, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, rr * 0.86, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    // 水:岸の石 → 水色の水面(きらきらはあとで)
    const waterPath = this.waterPath = new Path2D();
    const strokeCanals = (w, color) => {
      g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const c of CANALS) { const p = canalPts(c); g.lineWidth = c.w + w; g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) g.lineTo(p[k][0], p[k][1]); g.stroke(); }
      for (const l of LAKES) { g.lineWidth = w; g.fillStyle = color; g.beginPath(); g.ellipse(l.u * WW, l.v * WH, l.rx + w / 2, l.ry + w / 4, 0, 0, Math.PI * 2); g.fill(); }
    };
    strokeCanals(12, '#dccab6');
    strokeCanals(7, '#fffaf3');
    strokeCanals(0, '#a9dfe8');
    for (const t of tiles) if (t.wd < -1) waterPath.rect(t.x - HW - 1, t.y - HH - 1, HW * 2 + 2, HH * 2 + 2);
    g.save(); g.clip(waterPath);
    const wg = g.createLinearGradient(0, 0, WW, WH);
    wg.addColorStop(0, 'rgba(255,255,255,.28)'); wg.addColorStop(0.5, 'rgba(190,235,240,.1)'); wg.addColorStop(1, 'rgba(255,255,255,.22)');
    g.fillStyle = wg; g.fillRect(0, 0, WW, WH);
    // 水面のさざ波(白い短い線)
    for (const t of tiles) {
      if (t.wd >= -3 || R() > 0.22) continue;
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(t.x - 5, t.y); g.quadraticCurveTo(t.x, t.y - 2, t.x + 5, t.y); g.stroke();
      if (R() < 0.35) this.sparkles.push({ x: t.x + (R() - 0.5) * 16, y: t.y + (R() - 0.5) * 8, ph: R() * 6.28 });
    }
    g.restore();
    // 湖の噴水(白い大理石)
    for (const l of LAKES) {
      const cx = l.u * WW, cy = l.v * WH;
      g.fillStyle = '#e9ddd0'; g.beginPath(); g.ellipse(cx, cy, 15, 7.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fffaf4'; g.beginPath(); g.ellipse(cx, cy - 2, 11, 5.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#bfe9ef'; g.beginPath(); g.ellipse(cx, cy - 2.5, 7, 3.2, 0, 0, Math.PI * 2); g.fill();
      this.fountain = { x: cx, y: cy - 4 };
    }

    // 建物・木・街灯・テラス席・橋・お店を奥から順に
    const objs = [];
    for (const t of tiles) {
      if (t.kind === 'water' || reserve.has(`${t.i},${t.j}`)) continue;
      if (t.kind === 'walk' || t.kind === 'street') {
        const r = R();
        if (r < (t.kind === 'walk' ? 0.1 : 0.07) && t.wd > 6) objs.push({ y: t.y, draw: () => this.lamp(g, t.x, t.y) });
        else if (r < (t.kind === 'walk' ? 0.2 : 0.11) && t.wd > 8) objs.push({ y: t.y, draw: () => this.tree(g, t.x, t.y, R) });
        else if (r < (t.kind === 'walk' ? 0.27 : 0.14) && t.wd > 8) objs.push({ y: t.y, draw: () => this.terrace(g, t.x, t.y, R) });
        continue;
      }
      if (t.grass) { if (R() < 0.35) objs.push({ y: t.y, draw: () => this.tree(g, t.x, t.y, R) }); else if (R() < 0.3) this.flowers(g, t.x, t.y, R); continue; }
      const r = R();
      if (r < 0.1) objs.push({ y: t.y, draw: () => this.tree(g, t.x, t.y, R) });
      else if (r < 0.84) {
        const tall = R() < 0.05, h = tall ? 40 + R() * 18 : 14 + R() * 18;
        const wall = WALLS[Math.floor(R() * WALLS.length)], roof = ROOFS[Math.floor(R() * ROOFS.length)];
        const style = tall ? 'spire' : (['gable', 'gable', 'pyramid', 'mansard', 'mansard', 'flat'])[Math.floor(R() * 6)];
        const lit = 0.15 + R() * 0.25, k = 0.78 + R() * 0.14, awning = R() < 0.4 ? AWN[Math.floor(R() * AWN.length)] : null;
        objs.push({ y: t.y, draw: () => this.building(g, t.x, t.y, HW * k, HH * k, h, { wall, roof, style, lit, R, awning }) });
      }
    }
    for (const b of BRIDGES) { const p = canalAt(CANALS[b.c], b.at); if (p) objs.push({ y: p.y + 6, draw: () => this.bridge(g, p) }); }
    for (const s of this.shops) {
      const geo = this.shopGeo.get(s.id), base = this.shopBase(geo);
      objs.push({ y: base.y + HH * geo.n, draw: () => this.shop(g, s, geo) });
    }
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) o.draw();

    // やわらかな光(店内の暖色の灯り・お店の色)。昼なので控えめに重ねる
    for (const L of this.lights) {
      const rg = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      rg.addColorStop(0, rgba(L.c, L.a * 0.55)); rg.addColorStop(1, rgba(L.c, 0));
      g.fillStyle = rg; g.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    // 空気感:上からのやわらかい日差し + 端の白いもや(ジオラマのような明るさ)
    const sun = g.createLinearGradient(0, 0, WW, WH);
    sun.addColorStop(0, 'rgba(255,248,225,.22)'); sun.addColorStop(0.5, 'rgba(255,255,255,0)'); sun.addColorStop(1, 'rgba(255,220,235,.14)');
    g.fillStyle = sun; g.fillRect(0, 0, WW, WH);
  }

  /** フォントの読み込み後など:街を描き直す(同じ seed なので形は同じ)*/
  rebuild() { this.build(); this.snaps?.clear(); if (this.raf || this.reduced) this.draw(); }

  shopBase(geo) { const n = geo.n; const a = tileXY(geo.i + (n - 1) / 2, geo.j + (n - 1) / 2); return a; }

  diamond(g, x, y, hw, hh) { g.beginPath(); g.moveTo(x, y - hh); g.lineTo(x + hw, y); g.lineTo(x, y + hh); g.lineTo(x - hw, y); g.closePath(); }
  poly(g, pts, fill) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } }

  /** 箱の建物(左面は日の当たる明るい面・右面は少し影)+ 窓 + 屋根 + 店先のひさし */
  building(g, x, y, hw, hh, h, { wall, roof, style, lit, R, windowColor = null, accent = null, arched = false, awning = null, trim = '#ffffff' }) {
    const L = [x - hw, y], B = [x, y + hh], Rr = [x + hw, y], T = [x, y - hh];
    const up = (p, d = h) => [p[0], p[1] - d];
    this.poly(g, [L, B, up(B), up(L)], shade(wall, 0.04));
    this.poly(g, [B, Rr, up(Rr), up(B)], shade(wall, -0.1));
    g.strokeStyle = 'rgba(176,140,158,.6)'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(...L); g.lineTo(...B); g.lineTo(...Rr); g.moveTo(...B); g.lineTo(...up(B)); g.stroke();
    // 窓(白い枠 + 水色のガラス。ところどころ店内の暖かい灯り)
    const face = (P, Q, dim) => {
      const cols = Math.max(1, Math.round(hw / 7)), rows = Math.max(1, Math.floor((h - 6) / 8));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const s0 = (c + 0.26) / cols, s1 = (c + 0.74) / cols, z0 = 4 + r * 8, z1 = z0 + (arched ? 6 : 4.6);
        const on = R() < lit, glass = on ? (windowColor ?? LIT[Math.floor(R() * LIT.length)]) : GLASS[Math.floor(R() * GLASS.length)];
        const pt = (s, z) => [P[0] + s * (Q[0] - P[0]), P[1] + s * (Q[1] - P[1]) - z];
        this.poly(g, [pt(s0 - 0.04, z0 - 0.8), pt(s1 + 0.04, z0 - 0.8), pt(s1 + 0.04, z1 + 0.8), pt(s0 - 0.04, z1 + 0.8)], trim);
        this.poly(g, [pt(s0, z0), pt(s1, z0), pt(s1, z1), pt(s0, z1)], dim ? shade(glass, -0.08) : glass);
        if (on && R() < 0.3) { const m = pt((s0 + s1) / 2, (z0 + z1) / 2); this.lights.push({ x: m[0], y: m[1], r: 8, c: glass, a: 0.35 }); }
      }
    };
    face(L, B, false); face(B, Rr, true);
    // 店先のストライプのひさし(手前の左面・1階)+ 植木鉢の花
    if (awning) {
      const z0 = 7.5, z1 = 10.5, out = 3;
      const pt = (s, z, o = 0) => [L[0] + s * (B[0] - L[0]) - o, L[1] + s * (B[1] - L[1]) - z + o * 0.5];
      for (let k = 0; k < 6; k++) {
        const s0 = 0.08 + k * 0.14, s1 = s0 + 0.14;
        this.poly(g, [pt(s0, z1), pt(s1, z1), pt(s1, z0, out), pt(s0, z0, out)], k % 2 ? '#ffffff' : awning);
      }
    }
    if (R() < 0.45) this.flowerBox(g, L, B, R);
    // 屋根
    const tL = up(L), tB = up(B), tR = up(Rr), tT = up(T);
    if (style === 'pyramid' || style === 'spire') {
      const ap = [x, y - h - hh * (style === 'spire' ? 4.2 : 1.6)];
      this.poly(g, [tT, tL, ap], shade(roof, -0.06)); this.poly(g, [tT, tR, ap], shade(roof, -0.18));
      this.poly(g, [tL, tB, ap], shade(roof, 0.1)); this.poly(g, [tB, tR, ap], shade(roof, -0.1));
      if (style === 'spire') { g.fillStyle = '#ffd77a'; g.beginPath(); g.arc(ap[0], ap[1] - 1.5, 1.6, 0, Math.PI * 2); g.fill(); }
    } else if (style === 'gable') {
      const r1 = [(tL[0] + tT[0]) / 2, (tL[1] + tT[1]) / 2 - hh * 1.3], r2 = [(tB[0] + tR[0]) / 2, (tB[1] + tR[1]) / 2 - hh * 1.3];
      this.poly(g, [tT, tR, r2, r1], shade(roof, -0.16)); this.poly(g, [tL, tB, r2, r1], shade(roof, 0.08)); this.poly(g, [tB, tR, r2], shade(wall, -0.06));
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(...tL); g.lineTo(...r1); g.lineTo(...r2); g.lineTo(...tB); g.stroke();
    } else if (style === 'mansard') {
      const k = 0.62, c = [x, y - h], inner = (p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k - hh * 0.9];
      this.poly(g, [tL, tB, inner(tB), inner(tL)], shade(roof, 0.08)); this.poly(g, [tB, tR, inner(tR), inner(tB)], shade(roof, -0.16));
      this.poly(g, [inner(tT), inner(tR), inner(tB), inner(tL)], shade(roof, -0.02));
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(...tL); g.lineTo(...tB); g.lineTo(...tR); g.stroke();
    } else {
      this.poly(g, [tT, tR, tB, tL], shade(roof, -0.04));
      g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.moveTo(tL[0], tL[1]); g.lineTo(tB[0], tB[1]); g.lineTo(tR[0], tR[1]); g.stroke();
    }
    if (accent) { g.strokeStyle = rgba(accent, 0.9); g.lineWidth = 1.2; g.beginPath(); g.moveTo(tL[0], tL[1] + 1); g.lineTo(tB[0], tB[1] + 1); g.lineTo(tR[0], tR[1] + 1); g.stroke(); }
  }

  /** 窓辺の植木鉢(左面の1階)*/
  flowerBox(g, L, B, R) {
    const s = 0.2 + R() * 0.5, p = [L[0] + s * (B[0] - L[0]), L[1] + s * (B[1] - L[1]) - 1.5];
    g.fillStyle = '#c99a6a'; g.fillRect(p[0] - 3, p[1] - 1.5, 6, 2.2);
    const cols = ['#ff8fb4', '#ffd36e', '#ffffff', '#b8a2ea'];
    for (let k = 0; k < 4; k++) { g.fillStyle = cols[Math.floor(R() * cols.length)]; g.beginPath(); g.arc(p[0] - 2.4 + k * 1.6, p[1] - 2.4 - R(), 1, 0, Math.PI * 2); g.fill(); }
  }

  /** 芝生の花壇 */
  flowers(g, x, y, R) {
    const cols = ['#ff9fbf', '#ffe08a', '#ffffff', '#c4b2f0', '#ffb59a'];
    for (let k = 0; k < 6; k++) { g.fillStyle = cols[Math.floor(R() * cols.length)]; g.beginPath(); g.arc(x + (R() - 0.5) * 22, y + (R() - 0.5) * 10, 1.2, 0, Math.PI * 2); g.fill(); }
  }

  tree(g, x, y, R) {
    const pink = R() < 0.4, r = 6 + R() * 4;
    g.fillStyle = 'rgba(150,120,110,.18)'; g.beginPath(); g.ellipse(x + 1, y + 1, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a77b5c'; g.fillRect(x - 1, y - 8, 2, 8);
    const cg = g.createRadialGradient(x - 2, y - 12 - r * 0.4, 1, x, y - 10, r * 1.2);
    cg.addColorStop(0, pink ? '#ffe1ea' : '#cdeec2'); cg.addColorStop(0.55, pink ? '#ffb3c9' : '#9fd398'); cg.addColorStop(1, pink ? '#f08fae' : '#74b77e');
    g.fillStyle = cg; g.beginPath(); g.ellipse(x, y - 10, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x - r * 0.4 + R() * r * 0.6, y - 12 - R() * r * 0.4, 0.8, 0, Math.PI * 2); g.fill(); }
  }

  /** 街灯(クラシックな白い街灯。昼なので灯りはごく控えめ)*/
  lamp(g, x, y) {
    g.fillStyle = '#9e97b8'; g.fillRect(x - 0.7, y - 13, 1.4, 13);
    g.fillStyle = '#fffaf0'; g.strokeStyle = '#9e97b8'; g.lineWidth = 0.8; g.beginPath(); g.arc(x, y - 14.5, 2.2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ff9fc2'; g.beginPath(); g.moveTo(x - 2.6, y - 11); g.lineTo(x, y - 9.2); g.lineTo(x + 2.6, y - 11); g.fill();   // 小さなリボン
    this.twinkles.push({ x, y: y - 14.5, c: '#fff3c8', ph: x * 0.1 });
  }

  /** テラス席(丸テーブル + ストライプのパラソル)*/
  terrace(g, x, y, R) {
    const c = AWN[Math.floor(R() * AWN.length)];
    g.fillStyle = 'rgba(150,120,110,.2)'; g.beginPath(); g.ellipse(x, y + 1, 8, 3.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y - 4, 4.2, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9a98a'; g.fillRect(x - 0.5, y - 4, 1, 4);
    for (const dx of [-6, 6]) { g.fillStyle = '#e9d6c4'; g.beginPath(); g.ellipse(x + dx, y - 1.5, 2, 1, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#8f8aa8'; g.fillRect(x - 0.4, y - 16, 0.8, 12);
    for (let k = 0; k < 8; k++) {
      const a0 = Math.PI + (k / 8) * Math.PI, a1 = Math.PI + ((k + 1) / 8) * Math.PI;
      g.fillStyle = k % 2 ? '#ffffff' : c; g.beginPath(); g.moveTo(x, y - 18);
      g.lineTo(x + Math.cos(a0) * 9, y - 13 + Math.sin(a0) * -1.5); g.lineTo(x + Math.cos(a1) * 9, y - 13 + Math.sin(a1) * -1.5); g.closePath(); g.fill();
    }
  }

  bridge(g, p) {
    const nx = -p.dy, ny = p.dx, L = p.w / 2 + 12, a = [p.x - nx * L, p.y - ny * L], b = [p.x + nx * L, p.y + ny * L];
    const mid = [p.x, p.y - 9], half = 4.5, ox = p.dx * half, oy = p.dy * half;
    const curve = (o, s) => { g.moveTo(a[0] + o[0], a[1] + o[1]); g.quadraticCurveTo(mid[0] + o[0], mid[1] + o[1] - s, b[0] + o[0], b[1] + o[1]); };
    g.fillStyle = '#e8dacb'; g.beginPath(); curve([ox, oy], 0); g.lineTo(b[0] + ox, b[1] + oy + 6); g.quadraticCurveTo(mid[0] + ox, mid[1] + oy + 2, a[0] + ox, a[1] + oy + 6); g.closePath(); g.fill();
    g.beginPath(); curve([-ox, -oy], 0); g.lineTo(b[0] + ox, b[1] + oy); g.quadraticCurveTo(mid[0] + ox, mid[1] + oy, a[0] + ox, a[1] + oy); g.closePath(); g.fillStyle = '#fbf3ea'; g.fill();
    g.strokeStyle = '#d9c3ad'; g.lineWidth = 1; g.beginPath(); curve([ox, oy], 3); g.stroke(); g.beginPath(); curve([-ox, -oy], 3); g.stroke();
    for (const t of [0.12, 0.5, 0.88]) for (const sgn of [-1, 1]) {
      const q = (1 - t) * (1 - t), m = 2 * (1 - t) * t, e = t * t;
      const x = q * a[0] + m * mid[0] + e * b[0] + ox * sgn, y = q * a[1] + m * mid[1] + e * b[1] + oy * sgn - 4;
      g.fillStyle = t === 0.5 ? '#ff9fc2' : '#ffffff'; g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill();
    }
  }

  // ---- お店の外観のパーツ ----
  /** 円柱(ケーキの段・天文台の塔)。top = 上面の中心 */
  cylinder(g, x, y, rx, ry, h, side, top, drip = null) {
    g.fillStyle = side; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.lineTo(x - rx, y - h); g.ellipse(x, y - h, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
    const sg = g.createLinearGradient(x - rx, 0, x + rx, 0); sg.addColorStop(0, 'rgba(255,255,255,.35)'); sg.addColorStop(0.5, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(120,80,100,.14)');
    g.fillStyle = sg; g.fill();
    g.fillStyle = top; g.beginPath(); g.ellipse(x, y - h, rx, ry, 0, 0, Math.PI * 2); g.fill();
    if (drip) {   // 生クリームのたれ
      g.fillStyle = drip; g.beginPath(); g.ellipse(x, y - h, rx, ry, 0, 0, Math.PI);
      for (let k = 8; k >= 0; k--) { const a = (k / 8) * Math.PI, px = x + Math.cos(a) * rx, py = y - h + Math.sin(a) * ry; g.lineTo(px, py + (k % 2 ? 5 : 2.5)); }
      g.closePath(); g.fill();
    }
  }
  /** レースの縁飾り(p0 → p1 に沿った白い半円の列)*/
  scallop(g, p0, p1, n, r, color = '#ffffff') {
    g.fillStyle = color;
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t; g.beginPath(); g.arc(x, y, r, 0, Math.PI); g.fill(); }
  }
  /** リボン(蝶結び)*/
  bow(g, x, y, s, color) {
    g.fillStyle = color; g.strokeStyle = shade(color, -0.25); g.lineWidth = 0.8;
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + d * s * 1.4, y - s * 1.1, x + d * s * 1.3, y + s * 0.2); g.quadraticCurveTo(x + d * s * 0.7, y + s * 0.3, x, y); g.fill(); g.stroke(); }
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + d * s * 0.7, y + s * 1.3); g.lineTo(x + d * s * 0.3, y + s * 1.25); g.closePath(); g.fill(); }
    g.beginPath(); g.arc(x, y, s * 0.32, 0, Math.PI * 2); g.fillStyle = shade(color, 0.15); g.fill(); g.stroke();
  }
  star(g, x, y, r, color) {
    g.fillStyle = color; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  heart(g, x, y, s, color) {
    g.fillStyle = color; g.beginPath(); g.moveTo(x, y + s * 0.9);
    g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
    g.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); g.fill();
  }

  /** お店の建物:外観だけでコンセプトが分かる形(style)+ 小さな看板 */
  shop(g, s, geo) {
    const R = rng(s.id.length * 977 + s.id.charCodeAt(0));
    const open = this.isOpen(s), th = s.theme, base = this.shopBase(geo), n = geo.n;
    const hw = HW * n * 0.92, hh = HH * n * 0.92;
    // 準備中のお店も明るいまま(少しだけ淡く)。夜のように暗くしない
    const soft = (c) => (open ? c : shade(c, 0.35));
    const wall = soft(th.wall), roof = soft(th.roof), acc = soft(th.accent), trim = th.trim ?? '#ffffff';
    const lit = open ? 0.55 : 0.1, windowColor = open ? th.window : null;
    const x = base.x, y = base.y;
    let top = y - 40, h = 40;
    // 基壇(白い石の段)
    this.building(g, x, y + 3, hw + 4, hh + 2, 4, { wall: '#f1e5d8', roof: '#fbf5ee', style: 'flat', lit: 0, R });
    const front = (s0, z, d = 0) => [x - hw + s0 * hw - d, y + s0 * hh - z + d * 0.5];   // 手前の左面の上の点(s0 = 0..1, z = 高さ)
    switch (s.map.style) {
      case 'maid': {   // 王道メイドカフェ:白い壁 + ピンクのマンサード屋根 + ストライプのひさし + 大きなリボン
        h = 30; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'mansard', lit, R, windowColor, arched: true, awning: acc, trim });
        this.scallop(g, [x - hw, y - h], [x, y - h + hh], 9, 2.2); this.scallop(g, [x, y - h + hh], [x + hw, y - h], 9, 2.2);   // レースの縁
        this.bow(g, x, y - h - hh * 1.3, 11, acc);
        this.heart(g, ...front(0.5, h * 0.62), 5, acc);
        top = y - h - hh * 1.3 - 14;
        break;
      }
      case 'cat': {   // 猫メイドカフェ:三角屋根に猫耳 + 丸窓の肉球 + しっぽ
        h = 28; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'gable', lit, R, windowColor, arched: true, awning: acc, trim });
        const r1 = [x - hw * 0.5, y - h - hh * 0.5 - hh * 1.3], r2 = [x + hw * 0.5, y - h + hh * 0.5 - hh * 1.3];
        for (const [ex, ey] of [r1, r2]) {
          this.poly(g, [[ex - 8, ey + 3], [ex + 1, ey - 15], [ex + 8, ey + 1]], shade(roof, -0.05));
          this.poly(g, [[ex - 4, ey + 1.5], [ex + 0.8, ey - 9], [ex + 4.4, ey + 0.5]], '#ffc9d6');
        }
        const pw = front(0.5, h * 0.66);
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(pw[0], pw[1], 5.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = acc; g.beginPath(); g.ellipse(pw[0], pw[1] + 1, 2.2, 1.8, 0, 0, Math.PI * 2); g.fill();
        for (const [dx, dy] of [[-2.6, -1.8], [-0.9, -3], [0.9, -3], [2.6, -1.8]]) { g.beginPath(); g.arc(pw[0] + dx, pw[1] + dy, 0.9, 0, Math.PI * 2); g.fill(); }
        g.strokeStyle = shade(roof, -0.1); g.lineWidth = 2.6; g.lineCap = 'round';   // しっぽ(右の壁)
        g.beginPath(); g.moveTo(x + hw * 0.9, y - 6); g.bezierCurveTo(x + hw + 8, y - 12, x + hw + 2, y - 26, x + hw + 9, y - 30); g.stroke();
        top = Math.min(r1[1], r2[1]) - 14;
        break;
      }
      case 'star': {   // 星・宇宙系:天文台のドーム + 星の飾り + 三日月の旗
        h = 22; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'flat', lit, R, windowColor, arched: true, trim });
        const dr = hw * 0.62, dy = y - h + 1;
        const dg = g.createRadialGradient(x - dr * 0.4, dy - dr * 0.8, 1, x, dy - dr * 0.3, dr * 1.3);
        dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.5, shade(roof, 0.25)); dg.addColorStop(1, roof);
        g.fillStyle = dg; g.beginPath(); g.ellipse(x, dy, dr, dr * 0.5, 0, 0, Math.PI); g.lineTo(x - dr, dy); g.ellipse(x, dy, dr, dr * 1.05, 0, Math.PI, 0); g.fill();
        g.fillStyle = shade(roof, -0.25); g.beginPath(); g.moveTo(x - 2.5, dy - dr * 1.02); g.lineTo(x + 2.5, dy - dr * 1.02); g.lineTo(x + 3.5, dy - dr * 0.1); g.lineTo(x - 3.5, dy - dr * 0.1); g.fill();   // 観測窓
        for (let k = 0; k < 7; k++) this.star(g, x - dr * 0.8 + R() * dr * 1.6, dy - dr * 0.15 - R() * dr * 0.8, 1.2 + R(), '#fff3b0');
        this.star(g, x, dy - dr * 1.05 - 7, 5, '#ffd76a');
        g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(x + hw * 0.7, y - h - 16, 4.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = wall; g.beginPath(); g.arc(x + hw * 0.7 + 2.2, y - h - 17, 4, 0, Math.PI * 2); g.fill();   // 三日月
        top = dy - dr * 1.05 - 16;
        break;
      }
      case 'gothic': {   // ゴシック:ラベンダーの石の館 + 尖塔 + バラ窓 + 鉄の手すり + バラ
        h = 30; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'mansard', lit, R, windowColor, arched: true, trim });
        this.scallop(g, [x - hw, y - h], [x, y - h + hh], 9, 2, '#fbf6ff'); this.scallop(g, [x, y - h + hh], [x + hw, y - h], 9, 2, '#fbf6ff');   // レースの縁
        { // 正面の尖った破風(バラ窓)
          const g0 = front(0.3, h), g1 = front(0.7, h), ap = front(0.5, h + 16);
          this.poly(g, [g0, g1, ap], shade(wall, 0.02)); g.strokeStyle = shade(roof, -0.1); g.lineWidth = 1.4; g.beginPath(); g.moveTo(...g0); g.lineTo(...ap); g.lineTo(...g1); g.stroke();
        }
        for (const d of [-1, 1]) this.building(g, x + d * hw * 0.62, y - hh * 0.05, hw * 0.3, hh * 0.3, h + 14, { wall: shade(wall, 0.04), roof, style: 'spire', lit, R, windowColor, arched: true, trim });
        const rw = front(0.5, h + 5);
        const cols = ['#ffb3cf', '#b9a2ef', '#9fd4f0', '#ffe08a'];
        for (let k = 0; k < 8; k++) { g.fillStyle = cols[k % 4]; g.beginPath(); g.moveTo(rw[0], rw[1]); g.arc(rw[0], rw[1], 5.5, k * Math.PI / 4, (k + 1) * Math.PI / 4); g.fill(); }
        g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath(); g.arc(rw[0], rw[1], 5.5, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = shade(acc, -0.35); g.lineWidth = 0.8;   // バルコニーの手すり(深いプラム。黒は使わない)
        const b0 = front(0.15, h * 0.42), b1 = front(0.85, h * 0.42); g.beginPath(); g.moveTo(...b0); g.lineTo(...b1); g.stroke();
        for (let k = 0; k <= 8; k++) { const p = front(0.15 + k * 0.0875, h * 0.42); g.beginPath(); g.moveTo(...p); g.lineTo(p[0], p[1] + 3); g.stroke(); }
        for (let k = 0; k < 6; k++) { const p = front(0.08 + R() * 0.84, 1); g.fillStyle = k % 2 ? '#ff8fb2' : '#e05a8a'; g.beginPath(); g.arc(p[0], p[1] - 1.2, 1.3, 0, Math.PI * 2); g.fill(); }
        top = y - h - 14 - hh * 0.3 * 4.2 - 6;
        break;
      }
      case 'wa': {   // 和風:木の壁 + 瓦の寄棟屋根(反り)+ のれん + 赤ちょうちん + 桜
        h = 18; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'flat', lit, R, windowColor, trim });
        this.building(g, x, y - h + 1, hw * 1.08, hh * 1.08, 2, { wall: roof, roof, style: 'pyramid', lit: 0, R });   // 1階の瓦屋根
        this.building(g, x, y - h - 2, hw * 0.62, hh * 0.62, 10, { wall, roof, style: 'pyramid', lit, R, windowColor, trim });   // 2階
        h = 30;
        g.strokeStyle = shade(roof, -0.2); g.lineWidth = 1.6; g.lineCap = 'round';   // 軒の反り
        g.beginPath(); g.moveTo(x - hw - 4, y - h - 3); g.quadraticCurveTo(x - hw * 0.4, y - h + hh * 0.5, x, y - h + hh + 1); g.quadraticCurveTo(x + hw * 0.4, y - h + hh * 0.5, x + hw + 4, y - h - 3); g.stroke();
        for (let k = 0; k < 4; k++) {   // のれん
          const p = front(0.32 + k * 0.1, 11);
          this.poly(g, [p, [p[0] + hw * 0.1, p[1] + hh * 0.1], [p[0] + hw * 0.1, p[1] + hh * 0.1 + 6], [p[0], p[1] + 6]], k % 2 ? shade(acc, -0.1) : acc);
        }
        for (const s0 of [0.12, 0.88]) { const p = front(s0, 12); g.fillStyle = '#ff8a7a'; g.beginPath(); g.ellipse(p[0], p[1], 3, 4, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffe9c8'; g.fillRect(p[0] - 2.2, p[1] - 0.4, 4.4, 0.8); g.fillRect(p[0] - 2.2, p[1] - 1.8, 4.4, 0.5); }
        this.tree(g, x - hw - 4, y + 6, () => 0.1); this.tree(g, x + hw + 2, y + 2, () => 0.1);   // 桜(ピンク)
        top = y - h - hh * 1.6 - 6;
        break;
      }
      default: {   // sweets:3段のケーキの建物 + 生クリーム + いちご
        this.building(g, x, y, hw * 0.92, hh * 0.92, 10, { wall: soft('#fffaf2'), roof: soft('#fffaf2'), style: 'flat', lit: 0, R });
        this.cylinder(g, x, y - 10, hw * 0.92, hh * 0.92, 16, wall, soft('#fff8f0'), '#ffffff');
        this.cylinder(g, x, y - 26, hw * 0.66, hh * 0.66, 13, roof, soft('#fff8f0'), '#ffffff');
        this.cylinder(g, x, y - 39, hw * 0.4, hh * 0.4, 10, soft(th.glow), soft('#fff8f0'), '#ffffff');
        for (let k = 0; k < 5; k++) { const a = Math.PI * (0.15 + k * 0.17); g.fillStyle = '#ff6f8a'; g.beginPath(); g.arc(x + Math.cos(a) * hw * 0.62, y - 27 + Math.sin(a) * hh * 0.5, 1.8, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ff5f7a'; g.beginPath(); g.ellipse(x, y - 52, 4.2, 4.8, 0, 0, Math.PI * 2); g.fill();   // いちご
        g.fillStyle = '#7cc97a'; g.beginPath(); g.ellipse(x, y - 56.5, 3, 1.2, 0, 0, Math.PI * 2); g.fill();
        h = 40; top = y - 66;
      }
    }
    // 小さな看板(右の壁に掛けた白い板。ネオンではない)
    const sx = x + hw * 0.08, sy = y + hh * 0.55 - Math.min(h, 30) * 0.62;
    g.save(); g.setTransform(this.dpr, -0.5 * this.dpr, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    const label = s.name.length > 10 ? s.name.split(' ')[0] : s.name;
    g.font = `italic 700 ${n >= 3 ? 11 : 9}px "Great Vibes", "Cormorant Garamond", Georgia, serif`;
    const tw = g.measureText(label).width;
    g.fillStyle = '#ffffff'; g.strokeStyle = rgba(acc, 0.9); g.lineWidth = 1;
    g.beginPath(); g.roundRect?.(-1, -7, tw + 8, 13, 3); if (!g.roundRect) g.rect(-1, -7, tw + 8, 13); g.fill(); g.stroke();
    g.textBaseline = 'middle'; g.fillStyle = shade(acc, -0.2); g.fillText(label, 3, 0);
    g.restore();
    // 入口(木の扉)
    const door = [x - hw * 0.5, y + hh * 0.5];
    g.fillStyle = open ? '#c99a6a' : '#e0cbb6';
    this.poly(g, [[door[0] - 3, door[1] - 1.5], [door[0] + 3, door[1] + 1.5], [door[0] + 3, door[1] - 9], [door[0] - 3, door[1] - 12]]);
    g.fill();
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(door[0] + 1.6, door[1] - 4, 0.6, 0, Math.PI * 2); g.fill();
    if (open) {
      this.lights.push({ x: door[0], y: door[1] - 6, r: 22, c: th.window, a: 0.55 }, { x, y: y - h * 0.5, r: 56, c: th.accent, a: 0.22 });
      for (let k = 0; k <= 10; k++) {   // ガーランド(屋根の縁の小さな旗)
        const t = k / 10, px = x - hw + t * hw * 2, py = y - h + (t <= 0.5 ? t : 1 - t) * 2 * hh + 2;
        g.fillStyle = k % 2 ? '#ffffff' : th.accent; g.beginPath(); g.moveTo(px - 1.6, py - 1); g.lineTo(px + 1.6, py - 1); g.lineTo(px, py + 2.2); g.fill();
      }
    }
    this.shopGeo.set(s.id, { ...geo, x, y, top, hw, h, box: { x0: x - hw - 6, x1: x + hw + 6, y0: top - 6, y1: y + hh + 6 } });
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
    // 水面のきらめき
    for (const s of this.sparkles) {
      if (s.x < this.cam.x - 10 || s.x > this.cam.x + this.vw + 10 || s.y < this.cam.y - 10 || s.y > this.cam.y + this.vh + 10) continue;
      const a = Math.max(0, Math.sin(t * 2.2 + s.ph)) * 0.9;
      if (a < 0.05) continue;
      g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(s.x - 2, s.y - 0.4, 4, 0.8); g.fillRect(s.x - 0.4, s.y - 2, 0.8, 4);
    }
    // 街灯のやわらかな光
    for (const w of this.twinkles) { const a = 0.12 + 0.1 * Math.sin(t * 2.4 + w.ph); const rg = g.createRadialGradient(w.x, w.y, 0, w.x, w.y, 9); rg.addColorStop(0, rgba(w.c, a)); rg.addColorStop(1, rgba(w.c, 0)); g.fillStyle = rg; g.fillRect(w.x - 9, w.y - 9, 18, 18); }
    // 噴水
    if (this.fountain) { const f = this.fountain; for (let k = 0; k < 14; k++) { const p = (t * 0.9 + k / 14) % 1, ang = k * 2.4; const x = f.x + Math.cos(ang) * p * 9, y = f.y - Math.sin(p * Math.PI) * 14 + p * 4; g.fillStyle = `rgba(150,215,235,${0.85 * (1 - p)})`; g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6); } }
    // 選んだお店:足元のリング + まわりのきらきら(ネオンの光の柱は出さない)
    const s = this.shops.find((x) => x.id === this.sel), geo = s && this.shopGeo.get(s.id);
    if (geo) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.6), c = this.isOpen(s) ? s.theme.accent : '#a99ac8';
      g.save(); g.translate(geo.x, geo.y + HH * 1.2); g.scale(1, 0.5);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, geo.hw * 2.2); rg.addColorStop(0, rgba(c, 0.28 * pulse)); rg.addColorStop(1, rgba(c, 0)); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, geo.hw * 2.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(c, 0.75 * pulse); g.lineWidth = 2.5; g.setLineDash([6, 5]); g.lineDashOffset = -t * 12; g.beginPath(); g.arc(0, 0, geo.hw * 1.55, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, geo.hw * (1.6 + 0.3 * ((t * 0.8) % 1)), 0, Math.PI * 2); g.stroke();
      g.restore();
      for (let k = 0; k < 5; k++) {
        const a = t * 0.8 + k * 1.26, rx = geo.hw * 1.15, x = geo.x + Math.cos(a) * rx, y = (geo.top + geo.y) / 2 + Math.sin(a) * rx * 0.35 - 6;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + k);
        this.star(g, x, y, 2 + tw * 1.6, k % 2 ? 'rgba(255,255,255,.95)' : rgba(c, 0.9));
      }
    }
    // 舞う花びら・きらきら(画面に対して。昼なので加算合成は使わない)
    g.setTransform(d, 0, 0, d, 0, 0);
    for (let k = 0; k < 22; k++) {
      const sx = ((k * 97.3 + t * (5 + (k % 5))) % (this.vw + 40)) - 20, sy = (((k * 61.7 + t * (9 + (k % 7))) % (this.vh + 40))) - 20;
      const r = 1.6 + (k % 3) * 0.7, a = 0.55 + 0.25 * Math.sin(t * 1.3 + k), rot = t * (0.6 + (k % 4) * 0.3) + k;
      if (k % 4 === 0) { this.star(g, sx, sy, r + 0.6, `rgba(255,255,255,${a})`); continue; }
      g.save(); g.translate(sx, sy); g.rotate(rot); g.fillStyle = k % 3 ? `rgba(255,170,200,${a})` : `rgba(255,214,228,${a})`;
      g.beginPath(); g.ellipse(0, 0, r * 1.2, r * 0.7, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
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
