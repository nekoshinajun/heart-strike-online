/**
 * コンカフェ街マップ(攻略 ① お店を選ぶ)。Canvas 2D で描くアイソメトリックの「女の子たちが働く、かわいくて少し非日常的な街」
 *   奥(上)は空・雲・遠くのお城と丘(空気遠近でかすむ)。手前は水路に囲まれた中央の島(Éclat)・橋・並木の桜・テラス席・海辺の砂浜。
 *   お店の建物はデータ(ShopData.map / theme)から作り、外観(style)だけでコンセプトが分かる:
 *     王道メイド / 猫 / 星・宇宙 / ゴシック / 水辺 / 和風 / スイーツ
 *   静的な街は一度だけオフスクリーンに描き、毎フレームは「水面のきらめき・街灯・噴水・選択中のお店のやわらかな光・舞う花びら」だけを重ねる
 *   ドラッグで街を見回せる。お店の建物 / 名札をタップで選択(onSelect)
 */
const WW = 440, WH = 1100;          // 街の大きさ(CSS px)。スマホの横幅とほぼ同じで、主に上下に見回す
const Y0 = 100, TOWN_H = WH - Y0;   // 上の Y0 は空(見出しの後ろ)。お店の位置(ShopData.map.v)は Y0 から下の街の中の 0〜1
const HW = 20, HH = 10;             // タイルの半分の幅 / 高さ(2:1 のアイソメトリック)
const OX = WW / 2;
const HORIZON = Y0 + 112;           // 地平線(これより上は空と遠景)

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a = 1) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
const shade = (h, f) => { const [r, g, b] = hex(h); const k = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)))); return `#${[k(r), k(g), k(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`; };   // hex を返す(結果をまた shade / rgba に渡せる)
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `#${A.map((v, k) => Math.round(v + (B[k] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
const tileXY = (i, j) => ({ x: OX + (i - j) * HW, y: (i + j) * HH });
const toTile = (x, y) => { const a = (x - OX) / HW, b = y / HH; return { i: Math.round((a + b) / 2), j: Math.round((b - a) / 2) }; };

// 水:中央の島をぐるっと囲む環状の水路 + 地平線へ流れる川 + 海へ出る水路 + 南へ下る水路 + 南東の海
const RING = { x: 220, y: Y0 + 432, rx: 152, ry: 118 };
const ringPts = () => Array.from({ length: 33 }, (_, k) => { const a = (k / 32) * Math.PI * 2; return [RING.x + Math.cos(a) * RING.rx, RING.y + Math.sin(a) * RING.ry]; });
const CANALS = [
  { w: 30, pts: ringPts() },
  { w: 26, pts: [[220, RING.y - RING.ry], [204, Y0 + 262], [230, Y0 + 204], [212, Y0 + 150], [220, HORIZON - 2]] },
  { w: 26, pts: [[RING.x - RING.rx, RING.y], [24, Y0 + 452], [-40, Y0 + 444]] },
  { w: 28, pts: [[RING.x + RING.rx * 0.86, RING.y + RING.ry * 0.5], [404, Y0 + 548], [470, Y0 + 600]] },
  { w: 26, pts: [[RING.x - RING.rx * 0.42, RING.y + RING.ry * 0.9], [182, Y0 + 640], [156, Y0 + 724], [202, Y0 + 806], [190, Y0 + 1060]] },
];
const SEA = { x: 476, y: Y0 + 770, rx: 176, ry: 112 };
const BRIDGES = [{ c: 0, at: 0.02 }, { c: 0, at: 0.36 }, { c: 0, at: 0.61 }, { c: 0, at: 0.86 }, { c: 1, at: 0.45 }, { c: 2, at: 0.55 }, { c: 4, at: 0.3 }, { c: 4, at: 0.72 }];
const BOATS = [{ c: 0, at: 0.2 }, { c: 0, at: 0.72 }, { c: 4, at: 0.52 }];

// 昼のコンカフェ街:白・アイボリー・淡いピンク・水色・ラベンダー・クリーム。夜の黒・ネオンは使わない
const WALLS = ['#fff7ee', '#ffeef3', '#eef6fb', '#f3eefb', '#fdf3e2', '#fff4f6', '#f1f7ef'];
const ROOFS = ['#f2a3bb', '#8fbfe0', '#b9a3e3', '#e8a884', '#f5bfa1', '#7fa6d6', '#a9c9de', '#c68fb5'];
const GLASS = ['#d6edf7', '#cfe6f3', '#e2f2f8'];
const LIT = ['#ffe3a3', '#ffd98e', '#fff0c4'];   // 店内の暖色の照明
const AWN = ['#ff9cbf', '#8fd3c4', '#b9a6e6', '#ffb88a', '#8fc3ec'];   // 店先のストライプのひさし

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function canalDist(x, y) {
  let d = Infinity;
  for (const c of CANALS) { const p = c.pts; for (let k = 1; k < p.length; k++) d = Math.min(d, segDist(x, y, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]) - c.w / 2); }
  return d;
}
const seaDist = (x, y) => (Math.hypot((x - SEA.x) / SEA.rx, (y - SEA.y) / SEA.ry) - 1) * SEA.ry;
const waterDist = (x, y) => Math.min(canalDist(x, y), seaDist(x, y));
/** 水路の上の点(at = 0〜1)とその向き */
function canalAt(c, at) {
  const p = c.pts; const lens = []; let tot = 0;
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
    this.lights = []; this.sparkles = []; this.twinkles = []; this.fountains = [];
    this.shopGeo = new Map();

    // 地面:あたたかいアイボリーの石畳
    g.fillStyle = '#f6ece2'; g.fillRect(0, 0, WW, WH);

    // タイル:陸 / 水辺の遊歩道 / 砂浜 / 通り / 公園
    const tiles = [];
    for (let i = -40; i < 120; i++) for (let j = -40; j < 120; j++) {
      const { x, y } = tileXY(i, j);
      if (x < -HW * 2 || x > WW + HW * 2 || y < HORIZON - HH * 2 || y > WH + 60) continue;
      const cd = canalDist(x, y), sd = seaDist(x, y), wd = Math.min(cd, sd);
      const street = ((i % 5) + 5) % 5 === 0 || ((j % 4) + 4) % 4 === 0;
      const park = (Math.sin(i * 0.62 + 1.3) + Math.cos(j * 0.5)) > 1.2;
      const island = Math.hypot((x - RING.x) / RING.rx, (y - RING.y) / RING.ry) < 0.92;   // 中央の島 = Éclat の庭園(家は建てない)
      tiles.push({ i, j, x, y, wd, kind: wd < 1 ? 'water' : sd < 30 ? 'sand' : wd < 14 ? 'walk' : island ? 'garden' : street ? 'street' : park ? 'park' : 'land' });
    }
    this.tiles = tiles;
    // お店の敷地(建物 + 前の広場)
    const reserve = new Set();
    for (const s of this.shops) {
      const c = toTile(s.map.u * WW, Y0 + s.map.v * TOWN_H), n = s.map.size ?? 3, pad = 2;
      this.shopGeo.set(s.id, { i: c.i, j: c.j, n });
      for (let a = -pad; a < n + pad; a++) for (let b = -pad; b < n + pad + 1; b++) reserve.add(`${c.i + a},${c.j + b}`);
    }
    for (const t of tiles) {
      if (t.kind === 'water') continue;
      const v = R();
      g.fillStyle = t.kind === 'walk' ? (v < 0.5 ? '#efe1d2' : '#ebdccb') : t.kind === 'sand' ? (v < 0.5 ? '#fbeed5' : '#f8e8cc') : t.kind === 'street' ? (v < 0.5 ? '#f7ebdf' : '#f4e7da')
        : t.kind === 'park' || t.kind === 'garden' ? (v < 0.5 ? '#cfe8c1' : '#c6e2b8') : (v < 0.33 ? '#f3e6d9' : v < 0.66 ? '#f0e2d4' : '#f5e9de');
      this.diamond(g, t.x, t.y, HW, HH); g.fill();
      if (t.kind !== 'park' && t.kind !== 'garden' && t.kind !== 'sand') { g.strokeStyle = 'rgba(190,160,140,.14)'; g.lineWidth = 0.6; g.stroke(); }
      if (t.kind === 'street' && v < 0.5) { g.fillStyle = 'rgba(255,255,255,.35)'; this.diamond(g, t.x, t.y, HW * 0.5, HH * 0.5); g.fill(); }   // 石畳の模様
    }
    // お店の前の広場(丸い石畳 + お店の色のリング)
    for (const s of this.shops) {
      const geo = this.shopGeo.get(s.id), base = this.shopBase(geo), open = this.isOpen(s);
      g.save(); g.translate(base.x, base.y + HH * 1.2); g.scale(1, 0.5);
      const rr = HH * (geo.n + 1.5) * 2;
      g.fillStyle = '#fbf4ec'; g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 24; k++) { g.strokeStyle = 'rgba(205,180,160,.22)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(k / 24 * Math.PI * 2) * rr, Math.sin(k / 24 * Math.PI * 2) * rr); g.stroke(); }
      g.fillStyle = rgba(s.theme.accent, open ? 0.12 : 0.06); g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(s.theme.accent, open ? 0.3 : 0.14); g.lineWidth = 2;
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(0, 0, rr * k / 3.3, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    this.drawWater(g, tiles, R);
    this.drawSky(g, R);

    // 建物・木・街灯・テラス席・橋・舟・お店を奥から順に
    const objs = [];
    const add = (y, draw) => objs.push({ y, draw });
    for (const t of tiles) {
      if (t.kind === 'water' || reserve.has(`${t.i},${t.j}`)) continue;
      const far = t.y < HORIZON + 60;   // 地平線の近く:小さく・かすむ
      const r = R();
      if (t.kind === 'sand') {
        if (r < 0.1 && t.wd > 4) add(t.y, () => this.parasol(g, t.x, t.y, R));
        else if (r < 0.2 && t.wd > 10) add(t.y, () => this.palm(g, t.x, t.y, R));
        continue;
      }
      if (t.kind === 'walk') {
        if (r < 0.26 && t.wd > 5) add(t.y, () => this.tree(g, t.x, t.y, R, R() < 0.7 ? 'blossom' : 'green'));
        else if (r < 0.36 && t.wd > 5) add(t.y, () => this.lamp(g, t.x, t.y));
        else if (r < 0.42 && t.wd > 8) add(t.y, () => this.terrace(g, t.x, t.y, R));
        continue;
      }
      if (t.kind === 'street') {
        if (r < 0.06) add(t.y, () => this.lamp(g, t.x, t.y));
        else if (r < 0.12) add(t.y, () => this.tree(g, t.x, t.y, R, R() < 0.5 ? 'blossom' : 'green'));
        else if (r < 0.15) add(t.y, () => this.terrace(g, t.x, t.y, R));
        continue;
      }
      if (t.kind === 'garden') {
        if (r < 0.3) add(t.y, () => this.tree(g, t.x, t.y, R, R() < 0.65 ? 'blossom' : 'green'));
        else if (r < 0.45) add(t.y, () => this.bush(g, t.x, t.y, '#9fd09a', R));
        else if (r < 0.8) this.flowers(g, t.x, t.y, R);
        else if (r < 0.86) add(t.y, () => this.lamp(g, t.x, t.y));
        continue;
      }
      if (t.kind === 'park') {
        if (r < 0.42) add(t.y, () => this.tree(g, t.x, t.y, R, far ? 'cone' : (R() < 0.5 ? 'blossom' : R() < 0.6 ? 'green' : 'cone')));
        else if (r < 0.7) this.flowers(g, t.x, t.y, R);
        continue;
      }
      if (r < 0.08) { add(t.y, () => this.tree(g, t.x, t.y, R, 'green')); continue; }
      const tall = R() < 0.05, h = (tall ? 38 + R() * 12 : 13 + Math.floor(R() * 3) * 7 + R() * 3) * (far ? 0.85 : 1);
      const wall = WALLS[Math.floor(R() * WALLS.length)], roof = ROOFS[Math.floor(R() * ROOFS.length)];
      const style = tall ? 'spire' : (['gable', 'gable', 'pyramid', 'mansard', 'mansard', 'hip'])[Math.floor(R() * 6)];
      const lit = 0.2 + R() * 0.25, k = 0.8 + R() * 0.12, awning = R() < 0.45 ? AWN[Math.floor(R() * AWN.length)] : null;
      const chimney = !tall && R() < 0.35, dormer = (style === 'mansard' || style === 'gable') && R() < 0.5;
      add(t.y, () => this.building(g, t.x, t.y, HW * k, HH * k, h, { wall, roof, style, lit, R, awning, chimney, dormer }));
    }
    for (const b of BRIDGES) { const p = canalAt(CANALS[b.c], b.at); if (p) add(p.y + 7, () => this.bridge(g, p)); }
    for (const b of BOATS) { const p = canalAt(CANALS[b.c], b.at); if (p) add(p.y, () => this.boat(g, p)); }
    for (const s of this.shops) {
      const geo = this.shopGeo.get(s.id), base = this.shopBase(geo);
      add(base.y + HH * geo.n, () => this.shop(g, s, geo));
    }
    objs.sort((a, b) => a.y - b.y);
    for (const o of objs) o.draw();

    // やわらかな光(店内の暖色の灯り・お店の色)
    for (const L of this.lights) {
      const rg = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      rg.addColorStop(0, rgba(L.c, L.a * 0.6)); rg.addColorStop(1, rgba(L.c, 0));
      g.fillStyle = rg; g.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    // 空気感:地平線のもや(奥ほど白くかすむ)+ 右上からの日差し + 手前のピンクのもや
    const haze = g.createLinearGradient(0, HORIZON - 40, 0, HORIZON + 150);
    haze.addColorStop(0, 'rgba(250,240,246,0)'); haze.addColorStop(0.2, 'rgba(250,240,246,.6)'); haze.addColorStop(0.35, 'rgba(250,240,246,.45)'); haze.addColorStop(1, 'rgba(250,240,246,0)');
    g.fillStyle = haze; g.fillRect(0, HORIZON - 40, WW, 190);
    const sun = g.createRadialGradient(WW * 0.86, HORIZON * 0.3, 10, WW * 0.86, HORIZON * 0.3, WH * 0.7);
    sun.addColorStop(0, 'rgba(255,244,214,.38)'); sun.addColorStop(0.4, 'rgba(255,240,220,.12)'); sun.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = sun; g.fillRect(0, 0, WW, WH);
    const low = g.createLinearGradient(0, WH * 0.75, 0, WH);   // 手前のピンクのもや
    low.addColorStop(0, 'rgba(255,214,232,0)'); low.addColorStop(1, 'rgba(255,214,232,.28)');
    g.fillStyle = low; g.fillRect(0, WH * 0.75, WW, WH * 0.25);
  }

  /** 空と遠景:水色 → 地平線の淡いピンク・雲・遠くのお城と丘(空気遠近でかすむ)*/
  drawSky(g, R) {
    const sky = g.createLinearGradient(0, 0, 0, HORIZON + 6);
    sky.addColorStop(0, '#bfe3f6'); sky.addColorStop(0.55, '#e3f0fa'); sky.addColorStop(1, '#fbe9f1');
    g.fillStyle = sky; g.fillRect(0, 0, WW, HORIZON + 6);
    const sun = g.createRadialGradient(WW * 0.82, 36, 4, WW * 0.82, 36, 220);
    sun.addColorStop(0, 'rgba(255,250,232,.95)'); sun.addColorStop(0.35, 'rgba(255,246,226,.45)'); sun.addColorStop(1, 'rgba(255,246,226,0)');
    g.fillStyle = sun; g.fillRect(0, 0, WW, HORIZON + 6);
    // 雲(白いふわふわ)
    const cloud = (cx, cy, s) => {
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (const [dx, dy, r] of [[-1.6, 0.3, 0.9], [-0.6, -0.3, 1.2], [0.6, -0.15, 1.05], [1.6, 0.3, 0.8], [0, 0.45, 1.1]]) { g.beginPath(); g.ellipse(cx + dx * s * 10, cy + dy * s * 8, r * s * 11, r * s * 7, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(214,226,244,.35)'; g.beginPath(); g.ellipse(cx, cy + s * 6, s * 26, s * 3.5, 0, 0, Math.PI * 2); g.fill();
    };
    cloud(52, 46, 1.4); cloud(186, 22, 0.9); cloud(306, 70, 1.2); cloud(414, 30, 1); cloud(118, 128, 0.8); cloud(372, 150, 0.7); cloud(240, 110, 0.6);
    // 遠くの丘(2段)
    const hill = (y0, amp, col, seed) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, HORIZON + 8);
      for (let x = 0; x <= WW; x += 8) g.lineTo(x, y0 - amp * (0.5 + 0.5 * Math.sin(x * 0.018 + seed) * Math.cos(x * 0.007 + seed * 2)));
      g.lineTo(WW, HORIZON + 8); g.closePath(); g.fill();
    };
    hill(HORIZON - 14, 22, '#d9e6f0', 1.2);
    // 遠くのお城(ラベンダーのシルエット・尖塔)
    const castle = (cx, base, s, col) => {
      g.fillStyle = col;
      const tower = (x, w, h, roofH) => { g.fillRect(x - w / 2, base - h, w, h); g.beginPath(); g.moveTo(x - w / 2 - 1.5, base - h); g.lineTo(x, base - h - roofH); g.lineTo(x + w / 2 + 1.5, base - h); g.closePath(); g.fill(); };
      g.fillRect(cx - 26 * s, base - 18 * s, 52 * s, 18 * s);
      tower(cx, 12 * s, 38 * s, 20 * s); tower(cx - 20 * s, 9 * s, 28 * s, 14 * s); tower(cx + 21 * s, 9 * s, 30 * s, 15 * s); tower(cx - 32 * s, 7 * s, 20 * s, 10 * s); tower(cx + 33 * s, 7 * s, 22 * s, 11 * s);
      g.fillStyle = 'rgba(255,236,200,.75)';
      for (const [x, y] of [[0, 26], [-20, 18], [21, 20], [-8, 10], [8, 10]]) { g.fillRect(cx + x * s - 1, base - y * s, 2, 3); }
    };
    castle(64, HORIZON - 10, 1, '#c9c0e2'); castle(372, HORIZON - 6, 0.85, '#cfc7e6');
    hill(HORIZON - 2, 10, '#e4ecf2', 3.4);
    // 遠くの街並み(小さな屋根の列)と木
    for (let x = -6; x < WW + 6; x += 7 + R() * 6) {
      const h = 4 + R() * 7, y = HORIZON + 2;
      g.fillStyle = R() < 0.3 ? '#cfe0d2' : '#e9e0ec';
      if (R() < 0.35) { g.beginPath(); g.ellipse(x, y - h * 0.6, 3.5, h * 0.6, 0, 0, Math.PI * 2); g.fill(); continue; }
      g.fillRect(x - 3, y - h, 6, h);
      g.fillStyle = R() < 0.5 ? '#e7c6d6' : '#c9d5ea'; g.beginPath(); g.moveTo(x - 4, y - h); g.lineTo(x, y - h - 4); g.lineTo(x + 4, y - h); g.closePath(); g.fill();
    }
  }

  /** 水:岸の石(縁石)→ 奥の岸の石垣 → 水面(エメラルドがかった水色)・さざ波・きらきら。海辺は砂浜と白い波 */
  drawWater(g, tiles, R) {
    const path = (cb) => { g.beginPath(); for (const c of CANALS) { const p = c.pts; g.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) g.lineTo(p[k][0], p[k][1]); } cb?.(); };
    const strokeAll = (extra, color, dy = 0) => {
      g.save(); g.translate(0, dy); g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const c of CANALS) { g.lineWidth = Math.max(1, c.w + extra); g.beginPath(); g.moveTo(c.pts[0][0], c.pts[0][1]); for (let k = 1; k < c.pts.length; k++) g.lineTo(c.pts[k][0], c.pts[k][1]); g.stroke(); }
      g.restore();
    };
    const sea = (extra, color, dy = 0) => { g.fillStyle = color; g.beginPath(); g.ellipse(SEA.x, SEA.y + dy, SEA.rx + extra, SEA.ry + extra * 0.6, 0, 0, Math.PI * 2); g.fill(); };
    // 砂浜の縁の白い波打ち際
    sea(26, '#fbefd8'); sea(10, '#f5e2c3');
    strokeAll(12, '#fffaf3'); strokeAll(8, '#e6d5c3');   // 遊歩道の白い縁石
    strokeAll(0, '#c7ae98');                              // 奥の岸の石垣(水面より少し上に見える帯)
    // 水面(別キャンバスに描いてから重ねる:グラデーション・さざ波は水の中だけ)
    const wc = document.createElement('canvas'); wc.width = WW * this.dpr; wc.height = WH * this.dpr;
    const w = wc.getContext('2d'); w.scale(this.dpr, this.dpr);
    w.strokeStyle = '#000'; w.lineCap = 'round'; w.lineJoin = 'round';
    for (const c of CANALS) { w.lineWidth = c.w - 6; w.beginPath(); w.moveTo(c.pts[0][0], c.pts[0][1] + 3); for (let k = 1; k < c.pts.length; k++) w.lineTo(c.pts[k][0], c.pts[k][1] + 3); w.stroke(); }
    w.fillStyle = '#000'; w.beginPath(); w.ellipse(SEA.x, SEA.y + 2, SEA.rx, SEA.ry, 0, 0, Math.PI * 2); w.fill();
    w.globalCompositeOperation = 'source-atop';
    const wg = w.createLinearGradient(0, 0, WW * 0.4, WH);
    wg.addColorStop(0, '#9fdbe8'); wg.addColorStop(0.5, '#7fcfe0'); wg.addColorStop(1, '#69c4dc');
    w.fillStyle = wg; w.fillRect(0, 0, WW, WH);
    const deep = w.createRadialGradient(SEA.x + 40, SEA.y + 30, 10, SEA.x + 40, SEA.y + 30, SEA.rx);
    deep.addColorStop(0, 'rgba(60,160,205,.45)'); deep.addColorStop(1, 'rgba(60,160,205,0)');
    w.fillStyle = deep; w.fillRect(0, 0, WW, WH);
    // 岸の近くは明るく(浅瀬)
    w.strokeStyle = 'rgba(220,250,250,.55)'; w.lineWidth = 3;
    for (const c of CANALS) { w.lineWidth = 4; w.beginPath(); w.moveTo(c.pts[0][0], c.pts[0][1] + 3 - (c.w - 6) / 2 + 2); for (let k = 1; k < c.pts.length; k++) w.lineTo(c.pts[k][0], c.pts[k][1] + 3 - (c.w - 6) / 2 + 2); w.stroke(); }
    // さざ波(白い短い弧)
    for (const t of tiles) {
      if (t.wd >= -3 || R() > 0.3) continue;
      w.strokeStyle = `rgba(255,255,255,${0.45 + R() * 0.35})`; w.lineWidth = 1; w.lineCap = 'round';
      const L = 3 + R() * 4; w.beginPath(); w.moveTo(t.x - L, t.y); w.quadraticCurveTo(t.x, t.y - 1.8, t.x + L, t.y); w.stroke();
      if (R() < 0.4) this.sparkles.push({ x: t.x + (R() - 0.5) * 16, y: t.y + (R() - 0.5) * 8, ph: R() * 6.28 });
    }
    // 海の白い波
    for (let k = 0; k < 5; k++) { w.strokeStyle = `rgba(255,255,255,${0.7 - k * 0.1})`; w.lineWidth = 1.4; w.beginPath(); w.ellipse(SEA.x, SEA.y + 2, SEA.rx - 4 - k * 9, SEA.ry - 3 - k * 6, 0, Math.PI * 0.62, Math.PI * 1.05); w.stroke(); }
    g.drawImage(wc, 0, 0, WW, WH);
  }

  /** フォントの読み込み後など:街を描き直す(同じ seed なので形は同じ)*/
  rebuild() { this.build(); this.snaps?.clear(); if (this.raf || this.reduced) this.draw(); }

  shopBase(geo) { const n = geo.n; return tileXY(geo.i + (n - 1) / 2, geo.j + (n - 1) / 2); }

  diamond(g, x, y, hw, hh) { g.beginPath(); g.moveTo(x, y - hh); g.lineTo(x + hw, y); g.lineTo(x, y + hh); g.lineTo(x - hw, y); g.closePath(); }
  poly(g, pts, fill) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } }

  /** 箱の建物(左面は日の当たる明るい面・右面は少し影)+ 窓 + 屋根 + 店先のひさし・煙突・屋根窓 */
  building(g, x, y, hw, hh, h, { wall, roof, style, lit, R, windowColor = null, accent = null, arched = false, awning = null, trim = '#ffffff', chimney = false, dormer = false, floors = true }) {
    const L = [x - hw, y], B = [x, y + hh], Rr = [x + hw, y], T = [x, y - hh];
    const up = (p, d = h) => [p[0], p[1] - d];
    // 影(左手前からの光 → 右奥へ落ちる)
    const sh = Math.min(h, 40) * 0.55;
    g.fillStyle = 'rgba(130,95,125,.13)'; this.poly(g, [B, Rr, [Rr[0] + sh, Rr[1] - sh * 0.5], [T[0] + sh, T[1] - sh * 0.5], T]); g.fill();
    this.poly(g, [L, B, up(B), up(L)], shade(wall, 0.06));
    this.poly(g, [B, Rr, up(Rr), up(B)], shade(wall, -0.17));
    const ao = g.createLinearGradient(0, y + hh, 0, y + hh - 8); ao.addColorStop(0, 'rgba(160,120,130,.16)'); ao.addColorStop(1, 'rgba(160,120,130,0)');
    g.fillStyle = ao; this.poly(g, [L, B, Rr, up(Rr, 8), up(B, 8), up(L, 8)]); g.fill();   // 足元の陰り
    g.strokeStyle = 'rgba(176,140,158,.55)'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(...L); g.lineTo(...B); g.lineTo(...Rr); g.moveTo(...B); g.lineTo(...up(B)); g.stroke();
    // 階の帯(白い蛇腹)
    if (floors && h > 22) for (let z = 15; z < h - 6; z += 9.5) { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(L[0], L[1] - z); g.lineTo(B[0], B[1] - z); g.lineTo(Rr[0], Rr[1] - z); g.stroke(); }
    // 窓(白い枠 + 水色のガラス。ところどころ店内の暖かい灯り)
    const face = (P, Q, dim) => {
      const cols = Math.max(1, Math.round(hw / 6.5)), rows = Math.max(1, Math.floor((h - 5) / 9.5));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const s0 = (c + 0.27) / cols, s1 = (c + 0.73) / cols, z0 = 4 + r * 9.5, z1 = z0 + (arched ? 6.2 : 5);
        const on = R() < lit, glass = on ? (windowColor ?? LIT[Math.floor(R() * LIT.length)]) : GLASS[Math.floor(R() * GLASS.length)];
        const pt = (s, z) => [P[0] + s * (Q[0] - P[0]), P[1] + s * (Q[1] - P[1]) - z];
        this.poly(g, [pt(s0 - 0.05, z0 - 0.9), pt(s1 + 0.05, z0 - 0.9), pt(s1 + 0.05, z1 + 0.9), pt(s0 - 0.05, z1 + 0.9)], trim);
        this.poly(g, [pt(s0, z0), pt(s1, z0), pt(s1, z1), pt(s0, z1)], dim ? shade(glass, -0.08) : glass);
        if (arched) { const m = pt((s0 + s1) / 2, z1); g.fillStyle = trim; g.beginPath(); g.ellipse(m[0], m[1] - 0.6, (s1 - s0) * hw * 0.5 + 0.6, 1.6, 0, Math.PI, 0); g.fill(); }
        if (on && R() < 0.35) { const m = pt((s0 + s1) / 2, (z0 + z1) / 2); this.lights.push({ x: m[0], y: m[1], r: 9, c: glass, a: 0.4 }); }
      }
    };
    face(L, B, false); face(B, Rr, true);
    // 店先のストライプのひさし(手前の左面・1階)+ 植木鉢の花
    if (awning) {
      const z0 = 7.5, z1 = 10.8, out = 3.2;
      const pt = (s, z, o = 0) => [L[0] + s * (B[0] - L[0]) - o, L[1] + s * (B[1] - L[1]) - z + o * 0.5];
      for (let k = 0; k < 6; k++) { const s0 = 0.08 + k * 0.14, s1 = s0 + 0.14; this.poly(g, [pt(s0, z1), pt(s1, z1), pt(s1, z0, out), pt(s0, z0, out)], k % 2 ? '#ffffff' : awning); }
      g.fillStyle = 'rgba(255,255,255,.9)'; for (let k = 0; k <= 12; k++) { const p = pt(0.08 + k * 0.07, z0, out); g.beginPath(); g.arc(p[0], p[1], 0.9, 0, Math.PI); g.fill(); }
    }
    if (R() < 0.5) this.flowerBox(g, L, B, R);
    // 屋根
    const tL = up(L), tB = up(B), tR = up(Rr), tT = up(T);
    let peak = y - h;
    if (style === 'pyramid' || style === 'spire') {
      const ap = [x, y - h - hh * (style === 'spire' ? 4.4 : 1.7)]; peak = ap[1];
      this.poly(g, [tT, tL, ap], shade(roof, -0.06)); this.poly(g, [tT, tR, ap], shade(roof, -0.18));
      this.poly(g, [tL, tB, ap], shade(roof, 0.12)); this.poly(g, [tB, tR, ap], shade(roof, -0.1));
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(...tB); g.lineTo(...ap); g.stroke();
      if (style === 'spire') { g.fillStyle = '#ffd77a'; g.beginPath(); g.arc(ap[0], ap[1] - 1.6, 1.7, 0, Math.PI * 2); g.fill(); }
    } else if (style === 'gable') {
      const r1 = [(tL[0] + tT[0]) / 2, (tL[1] + tT[1]) / 2 - hh * 1.4], r2 = [(tB[0] + tR[0]) / 2, (tB[1] + tR[1]) / 2 - hh * 1.4]; peak = r1[1];
      this.poly(g, [tT, tR, r2, r1], shade(roof, -0.16)); this.poly(g, [tL, tB, r2, r1], shade(roof, 0.1)); this.poly(g, [tB, tR, r2], shade(wall, -0.06));
      // 瓦の筋
      g.strokeStyle = rgba(shade(roof, -0.25), 0.35); g.lineWidth = 0.6;
      for (let k = 1; k < 4; k++) { const f = k / 4; g.beginPath(); g.moveTo(tL[0] + (r1[0] - tL[0]) * f, tL[1] + (r1[1] - tL[1]) * f); g.lineTo(tB[0] + (r2[0] - tB[0]) * f, tB[1] + (r2[1] - tB[1]) * f); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(...tL); g.lineTo(...r1); g.lineTo(...r2); g.lineTo(...tB); g.stroke();
      if (dormer) this.dormer(g, (tL[0] + r2[0]) / 2 - 2, (tL[1] + r2[1]) / 2 + 2, roof, trim);
    } else if (style === 'mansard' || style === 'hip') {
      const k = style === 'hip' ? 0.15 : 0.62, c = [x, y - h], lift = style === 'hip' ? hh * 1.5 : hh * 0.95;
      const inner = (p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k - lift]; peak = inner(tT)[1];
      this.poly(g, [tL, tB, inner(tB), inner(tL)], shade(roof, 0.1)); this.poly(g, [tB, tR, inner(tR), inner(tB)], shade(roof, -0.16));
      this.poly(g, [tT, tL, inner(tL), inner(tT)], shade(roof, -0.04)); this.poly(g, [inner(tT), inner(tR), inner(tB), inner(tL)], shade(roof, 0.02));
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(...tL); g.lineTo(...tB); g.lineTo(...tR); g.stroke();
      if (dormer) this.dormer(g, (tL[0] + tB[0]) / 2, (tL[1] + tB[1]) / 2 - lift * 0.45, roof, trim);
    } else {
      this.poly(g, [tT, tR, tB, tL], shade(roof, -0.04));
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(tL[0], tL[1]); g.lineTo(tB[0], tB[1]); g.lineTo(tR[0], tR[1]); g.stroke();
    }
    if (chimney) { const cx = x + hw * 0.35, cy = y - h - hh * 0.2; this.poly(g, [[cx - 2.2, cy], [cx + 2.2, cy], [cx + 2.2, cy - 9], [cx - 2.2, cy - 9]], '#e3c2b0'); this.poly(g, [[cx - 2.8, cy - 9], [cx + 2.8, cy - 9], [cx + 2.8, cy - 10.5], [cx - 2.8, cy - 10.5]], '#f7e8dc'); }
    if (accent) { g.strokeStyle = rgba(accent, 0.9); g.lineWidth = 1.2; g.beginPath(); g.moveTo(tL[0], tL[1] + 1); g.lineTo(tB[0], tB[1] + 1); g.lineTo(tR[0], tR[1] + 1); g.stroke(); }
    return peak;
  }

  /** 屋根窓(小さな三角屋根の窓)*/
  dormer(g, x, y, roof, trim = '#ffffff') {
    this.poly(g, [[x - 3.2, y + 1.5], [x + 3.2, y + 1.5], [x + 3.2, y - 3.5], [x - 3.2, y - 3.5]], trim);
    this.poly(g, [[x - 2, y + 0.8], [x + 2, y + 0.8], [x + 2, y - 3], [x - 2, y - 3]], '#cfe6f3');
    this.poly(g, [[x - 4.2, y - 3.3], [x, y - 7.5], [x + 4.2, y - 3.3]], shade(roof, 0.05));
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
    for (let k = 0; k < 7; k++) { g.fillStyle = cols[Math.floor(R() * cols.length)]; g.beginPath(); g.arc(x + (R() - 0.5) * 22, y + (R() - 0.5) * 10, 1.2, 0, Math.PI * 2); g.fill(); }
  }

  /** 木:blossom = 桜(ピンクのふわふわの房)/ green = 丸い木 / cone = 細い針葉樹 */
  tree(g, x, y, R, kind = 'green') {
    g.fillStyle = 'rgba(150,110,120,.18)'; g.beginPath(); g.ellipse(x + 2, y + 1, 9, 3.6, 0, 0, Math.PI * 2); g.fill();
    if (kind === 'cone') {
      g.fillStyle = '#9b7458'; g.fillRect(x - 0.8, y - 5, 1.6, 5);
      for (let k = 0; k < 3; k++) { const yy = y - 4 - k * 5, w = 6.5 - k * 1.6; this.poly(g, [[x - w, yy], [x, yy - 9], [x + w, yy]], k === 2 ? '#8fcf9a' : k === 1 ? '#78bd88' : '#62a877'); }
      return;
    }
    const pink = kind === 'blossom', r = 6 + R() * 3.5;
    g.fillStyle = '#a77b5c'; g.fillRect(x - 1, y - 9, 2, 9);
    const cols = pink ? ['#f59bbb', '#ffb6cc', '#ffd0de', '#ffe6ee'] : ['#6fb27c', '#8cc98f', '#a8d9a3', '#cdecc2'];
    // 房を重ねて丸い樹冠に(下が濃く・上が明るい)
    const blobs = [[0, -9, 1], [-0.55, -10, 0.72], [0.55, -10.5, 0.72], [-0.2, -14, 0.7], [0.35, -13.5, 0.6]];
    blobs.forEach(([dx, dy, k], n) => { g.fillStyle = cols[Math.min(cols.length - 1, n === 0 ? 0 : n < 3 ? 1 : 2)]; g.beginPath(); g.ellipse(x + dx * r, y + dy - (n ? 0 : 0), r * k, r * k * 0.85, 0, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = cols[3]; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x - r * 0.5 + R() * r, y - 13 - R() * 4, 0.9 + R() * 0.6, 0, Math.PI * 2); g.fill(); }
    if (pink) { g.fillStyle = 'rgba(255,180,205,.5)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + (R() - 0.5) * 18, y + 1 + (R() - 0.5) * 5, 1.2, 0.7, 0, 0, Math.PI * 2); g.fill(); } }   // 落ちた花びら
  }

  /** ヤシの木(海辺)*/
  palm(g, x, y, R) {
    g.fillStyle = 'rgba(150,110,120,.16)'; g.beginPath(); g.ellipse(x + 3, y + 1, 8, 3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#b8916e'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y - 10, x + 1, y - 20); g.stroke();
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + R() * 0.3; g.strokeStyle = k % 2 ? '#7cc48b' : '#5fae76'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x + 1, y - 20); g.quadraticCurveTo(x + 1 + Math.cos(a) * 6, y - 24 + Math.sin(a) * 2, x + 1 + Math.cos(a) * 11, y - 18 + Math.sin(a) * 4); g.stroke(); }
  }

  /** 砂浜のパラソル */
  parasol(g, x, y, R) {
    const c = ['#7fc3ec', '#ff9cbf', '#8fd3c4'][Math.floor(R() * 3)];
    g.fillStyle = 'rgba(150,110,120,.14)'; g.beginPath(); g.ellipse(x + 2, y + 1, 8, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(x + 3, y - 2, 6, 2);
    g.fillStyle = '#8f8aa8'; g.fillRect(x - 0.4, y - 14, 0.8, 14);
    for (let k = 0; k < 8; k++) { const a0 = Math.PI + (k / 8) * Math.PI, a1 = Math.PI + ((k + 1) / 8) * Math.PI; g.fillStyle = k % 2 ? '#ffffff' : c; g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + Math.cos(a0) * 8, y - 11 + Math.sin(a0) * -1.4); g.lineTo(x + Math.cos(a1) * 8, y - 11 + Math.sin(a1) * -1.4); g.closePath(); g.fill(); }
  }

  /** 街灯(クラシックな白い街灯 + 暖かい灯り)*/
  lamp(g, x, y) {
    g.fillStyle = 'rgba(150,110,120,.16)'; g.beginPath(); g.ellipse(x + 1, y + 0.5, 3, 1.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8d86a8'; g.fillRect(x - 0.7, y - 15, 1.4, 15); g.fillRect(x - 1.6, y - 1.5, 3.2, 1.5);
    g.fillStyle = '#fff6dc'; g.strokeStyle = '#8d86a8'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 2.4, y - 15); g.lineTo(x + 2.4, y - 15); g.lineTo(x + 1.6, y - 19.5); g.lineTo(x - 1.6, y - 19.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#8d86a8'; g.beginPath(); g.moveTo(x - 2.8, y - 19.5); g.lineTo(x, y - 22); g.lineTo(x + 2.8, y - 19.5); g.fill();
    g.fillStyle = '#ff9fc2'; g.beginPath(); g.moveTo(x - 2.4, y - 12); g.lineTo(x, y - 10.4); g.lineTo(x + 2.4, y - 12); g.fill();   // 小さなリボン
    this.twinkles.push({ x, y: y - 17, c: '#ffe7a8', ph: x * 0.1 + y * 0.03 });
  }

  /** テラス席(丸テーブル + ストライプのパラソル)*/
  terrace(g, x, y, R) {
    const c = AWN[Math.floor(R() * AWN.length)];
    g.fillStyle = 'rgba(150,110,120,.18)'; g.beginPath(); g.ellipse(x + 1, y + 1, 9, 3.6, 0, 0, Math.PI * 2); g.fill();
    for (const dx of [-6, 6]) { g.fillStyle = '#fff'; g.strokeStyle = '#d9c6b6'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(x + dx, y - 1.5, 2, 1, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#d9c6b6'; g.fillRect(x + dx - 0.3, y - 1.5, 0.6, 2); }
    g.fillStyle = '#c9a98a'; g.fillRect(x - 0.5, y - 4, 1, 4);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y - 4.2, 4.4, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff9fc2'; g.beginPath(); g.arc(x - 1, y - 4.8, 0.8, 0, Math.PI * 2); g.fill();   // ティーカップ
    g.fillStyle = '#8f8aa8'; g.fillRect(x - 0.4, y - 17, 0.8, 13);
    for (let k = 0; k < 8; k++) {
      const a0 = Math.PI + (k / 8) * Math.PI, a1 = Math.PI + ((k + 1) / 8) * Math.PI;
      g.fillStyle = k % 2 ? '#ffffff' : c; g.beginPath(); g.moveTo(x, y - 19);
      g.lineTo(x + Math.cos(a0) * 9.5, y - 13.5 + Math.sin(a0) * -1.5); g.lineTo(x + Math.cos(a1) * 9.5, y - 13.5 + Math.sin(a1) * -1.5); g.closePath(); g.fill();
    }
  }

  /** 石のアーチ橋(白い欄干 + 街灯)*/
  bridge(g, p) {
    const nx = -p.dy, ny = p.dx, L = p.w / 2 + 11, a = [p.x - nx * L, p.y - ny * L], b = [p.x + nx * L, p.y + ny * L];
    const mid = [p.x, p.y - 9], half = 5, ox = p.dx * half, oy = p.dy * half;
    const curve = (o, s) => { g.moveTo(a[0] + o[0], a[1] + o[1]); g.quadraticCurveTo(mid[0] + o[0], mid[1] + o[1] - s, b[0] + o[0], b[1] + o[1]); };
    // 橋の側面(アーチの影)
    g.fillStyle = '#dcc9b6'; g.beginPath(); curve([ox, oy], 0); g.lineTo(b[0] + ox, b[1] + oy + 6); g.quadraticCurveTo(mid[0] + ox, mid[1] + oy + 3, a[0] + ox, a[1] + oy + 6); g.closePath(); g.fill();
    g.fillStyle = 'rgba(80,150,180,.35)'; g.beginPath(); g.ellipse(mid[0] + ox, mid[1] + oy + 11, p.w * 0.32, 3.2, Math.atan2(ny, nx), Math.PI, 0); g.fill();   // アーチの下の影
    g.beginPath(); curve([-ox, -oy], 0); g.lineTo(b[0] + ox, b[1] + oy); g.quadraticCurveTo(mid[0] + ox, mid[1] + oy, a[0] + ox, a[1] + oy); g.closePath(); g.fillStyle = '#fbf3ea'; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.6; g.beginPath(); curve([ox, oy], 3.5); g.stroke(); g.beginPath(); curve([-ox, -oy], 3.5); g.stroke();
    g.strokeStyle = '#d9c3ad'; g.lineWidth = 0.6; g.beginPath(); curve([ox, oy], 2.2); g.stroke();
    for (const t of [0.08, 0.5, 0.92]) for (const sgn of [-1, 1]) {
      const q = (1 - t) * (1 - t), m = 2 * (1 - t) * t, e = t * t;
      const x = q * a[0] + m * mid[0] + e * b[0] + ox * sgn, y = q * a[1] + m * mid[1] + e * b[1] + oy * sgn - 4;
      g.fillStyle = t === 0.5 ? '#ff9fc2' : '#ffffff'; g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill();
    }
  }

  /** 水路の小舟(白い舟 + ピンクの屋根)*/
  boat(g, p) {
    const ang = Math.atan2(p.dy, p.dx);
    g.save(); g.translate(p.x, p.y + 3); g.rotate(ang); g.scale(1, 0.7);
    g.fillStyle = 'rgba(40,120,150,.25)'; g.beginPath(); g.ellipse(0, 3, 11, 3.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(-11, 0); g.quadraticCurveTo(0, 6, 11, 0); g.quadraticCurveTo(0, -3, -11, 0); g.fill();
    g.fillStyle = '#ffb6cf'; g.fillRect(-4, -7, 8, 2.4); g.fillStyle = '#c9a98a'; g.fillRect(-3.6, -5, 0.8, 5); g.fillRect(2.8, -5, 0.8, 5);
    g.restore();
  }

  // ---- お店の外観のパーツ ----
  /** 円柱(ケーキの段・塔)。top = 上面の中心 */
  cylinder(g, x, y, rx, ry, h, side, top, drip = null) {
    g.fillStyle = side; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.lineTo(x - rx, y - h); g.ellipse(x, y - h, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
    const sg = g.createLinearGradient(x - rx, 0, x + rx, 0); sg.addColorStop(0, 'rgba(255,255,255,.35)'); sg.addColorStop(0.5, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(120,80,100,.16)');
    g.fillStyle = sg; g.fill();
    if (top) { g.fillStyle = top; g.beginPath(); g.ellipse(x, y - h, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    if (drip) {   // 生クリームのたれ
      g.fillStyle = drip; g.beginPath(); g.ellipse(x, y - h, rx, ry, 0, 0, Math.PI);
      for (let k = 8; k >= 0; k--) { const a = (k / 8) * Math.PI, px = x + Math.cos(a) * rx, py = y - h + Math.sin(a) * ry; g.lineTo(px, py + (k % 2 ? 5 : 2.5)); }
      g.closePath(); g.fill();
    }
  }
  /** 円柱の窓(手前の半分に並べる)*/
  ringWindows(g, x, y, rx, ry, z0, z1, n, glass, trim = '#ffffff') {
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.15 + 0.7 * (k + 0.5) / n), px = x + Math.cos(a) * rx * 0.98, py = y + Math.sin(a) * ry, w = Math.max(1.2, Math.abs(Math.sin(a)) * rx * 0.22);
      g.fillStyle = trim; g.fillRect(px - w - 0.8, py - z1 - 0.8, w * 2 + 1.6, z1 - z0 + 1.6);
      g.fillStyle = glass; g.fillRect(px - w, py - z1, w * 2, z1 - z0);
      g.fillStyle = trim; g.beginPath(); g.ellipse(px, py - z1, w + 0.8, 1.6, 0, Math.PI, 0); g.fill();
    }
  }
  /** 円錐の屋根 */
  cone(g, x, y, rx, ry, h, color) {
    g.fillStyle = shade(color, -0.12); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.lineTo(x, y - h); g.closePath(); g.fill();
    g.fillStyle = shade(color, 0.12); g.beginPath(); g.moveTo(x - rx, y); g.lineTo(x, y - h); g.lineTo(x - rx * 0.1, y + ry); g.ellipse(x, y, rx, ry, 0, Math.PI * 0.55, Math.PI); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x - rx * 0.35, y + ry * 0.9); g.lineTo(x, y - h); g.stroke();
    g.fillStyle = '#ffd77a'; g.beginPath(); g.arc(x, y - h - 1.5, 1.6, 0, Math.PI * 2); g.fill();
  }
  /** ドーム屋根 */
  dome(g, x, y, r, color, ribs = true) {
    const dg = g.createRadialGradient(x - r * 0.4, y - r * 0.85, 1, x, y - r * 0.3, r * 1.3);
    dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.45, shade(color, 0.3)); dg.addColorStop(1, color);
    g.fillStyle = dg; g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI); g.lineTo(x - r, y); g.ellipse(x, y, r, r * 1.05, 0, Math.PI, 0); g.fill();
    if (ribs) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 0.7; for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(x + k * r, y + r * 0.45 * Math.sqrt(1 - k * k)); g.quadraticCurveTo(x + k * r * 0.7, y - r * 0.8, x, y - r * 1.05); g.stroke(); } }
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
  /** 鉄の柵(お店の前庭の縁。深いプラム・白い玉飾り)*/
  fence(g, p0, p1, n, color) {
    g.strokeStyle = color; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(p0[0], p0[1] - 5); g.lineTo(p1[0], p1[1] - 5); g.stroke();
    for (let k = 0; k <= n; k++) { const x = p0[0] + (p1[0] - p0[0]) * k / n, y = p0[1] + (p1[1] - p0[1]) * k / n; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 6); g.stroke(); if (k % 3 === 0) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y - 6.5, 0.9, 0, Math.PI * 2); g.fill(); } }
  }
  bush(g, x, y, color, R) {
    g.fillStyle = shade(color, -0.15); g.beginPath(); g.ellipse(x, y - 2, 5, 3.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.beginPath(); g.ellipse(x - 1, y - 3, 3.6, 2.4, 0, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#ff8fb2' : '#ffffff'; g.beginPath(); g.arc(x - 3 + R() * 6, y - 3.5 - R() * 2, 0.9, 0, Math.PI * 2); g.fill(); }
  }

  /** お店の建物:外観だけでコンセプトが分かる形(style)+ 前庭 + 小さな看板 */
  shop(g, s, geo) {
    const R = rng(s.id.length * 977 + s.id.charCodeAt(0));
    const open = this.isOpen(s), th = s.theme, base = this.shopBase(geo), n = geo.n;
    const hw = HW * n * 0.92, hh = HH * n * 0.92;
    // 準備中のお店も明るいまま(少しだけ淡く)。夜のように暗くしない
    const soft = (c) => (open ? c : mix(c, '#f6f0f4', 0.28));
    const wall = soft(th.wall), roof = soft(th.roof), acc = soft(th.accent), trim = th.trim ?? '#ffffff';
    const lit = open ? 0.62 : 0.18, windowColor = open ? th.window : null;
    const x = base.x, y = base.y;
    let top = y - 40, h = 40;
    const front = (s0, z, d = 0) => [x - hw + s0 * hw - d, y + s0 * hh - z + d * 0.5];      // 手前の左面(s0 = 0..1, z = 高さ)
    const side = (s0, z) => [x + s0 * hw, y + hh - s0 * hh - z];                            // 手前の右面
    const garden = (k = 1.22) => [[x - hw * k, y], [x, y + hh * k], [x + hw * k, y]];     // 前庭の縁(柵・植え込み)
    // 基壇(白い石の段)
    this.building(g, x, y + 3, hw + 5, hh + 2.5, 4, { wall: '#efe2d4', roof: '#fbf5ee', style: 'flat', lit: 0, R, floors: false });
    switch (s.map.style) {
      case 'gothic': {   // ゴシック:ラベンダーの石の館(破風の屋根 + 屋根窓)+ 後ろの尖塔 + 角の小塔 + バラ窓 + 鉄の柵 + 薔薇の前庭
        for (const d of [-1, 1]) this.building(g, x + d * hw * 0.42, y - hh * 0.62, hw * 0.17, hh * 0.17, 72, { wall: shade(wall, 0.04), roof, style: 'spire', lit, R, windowColor, arched: true, trim, floors: false });
        h = 46; const peak = this.building(g, x, y, hw * 0.8, hh * 0.8, h, { wall, roof, style: 'gable', lit, R, windowColor, arched: true, trim, dormer: true });
        this.scallop(g, [x - hw * 0.8, y - h], [x, y - h + hh * 0.8], 12, 2.1, '#fbf6ff'); this.scallop(g, [x, y - h + hh * 0.8], [x + hw * 0.8, y - h], 12, 2.1, '#fbf6ff');
        { // 正面の尖った破風(バラ窓)
          const f = (s0, z) => [x - hw * 0.8 + s0 * hw * 0.8, y + s0 * hh * 0.8 - z];
          const g0 = f(0.3, h), g1 = f(0.7, h), ap = f(0.5, h + 24);
          this.poly(g, [g0, g1, [g1[0], g1[1] + 10], [g0[0], g0[1] + 10]], shade(wall, 0.06)); this.poly(g, [g0, g1, ap], shade(wall, 0.08));
          g.strokeStyle = shade(roof, -0.1); g.lineWidth = 2; g.beginPath(); g.moveTo(...g0); g.lineTo(...ap); g.lineTo(...g1); g.stroke();
          const rw = f(0.5, h + 8), cols = ['#ffb3cf', '#b9a2ef', '#9fd4f0', '#ffe08a'];
          for (let k = 0; k < 8; k++) { g.fillStyle = cols[k % 4]; g.beginPath(); g.moveTo(rw[0], rw[1]); g.arc(rw[0], rw[1], 6.5, k * Math.PI / 4, (k + 1) * Math.PI / 4); g.fill(); }
          g.strokeStyle = '#ffffff'; g.lineWidth = 1.4; g.beginPath(); g.arc(rw[0], rw[1], 6.5, 0, Math.PI * 2); g.stroke();
          if (open) this.lights.push({ x: rw[0], y: rw[1], r: 18, c: '#ffd9f0', a: 0.5 });
        }
        // 角の小塔(円い塔 + とがった屋根)
        for (const [cx, cy] of [[x - hw * 0.8, y], [x + hw * 0.8, y], [x, y + hh * 0.8]]) {
          const tr = 8.5; this.cylinder(g, cx, cy + 1, tr, tr * 0.5, h + 6, shade(wall, 0.05), null);
          this.ringWindows(g, cx, cy + 1, tr, tr * 0.5, h - 16, h - 8, 2, windowColor ?? '#d6edf7'); this.ringWindows(g, cx, cy + 1, tr, tr * 0.5, 14, 22, 2, windowColor ?? '#d6edf7');
          this.cone(g, cx, cy + 1 - h - 6, tr * 1.25, tr * 0.62, 24, roof);
        }
        top = Math.min(peak, y - hh * 0.62 - 72 - hh * 0.17 * 4.4) - 8;
        // 前庭:鉄の柵(深いプラム)+ 薔薇の植え込み + テラス席
        const [gl, gb, gr] = garden(1.2);
        this.fence(g, gl, [gb[0] - 14, gb[1] - 7], 10, shade(acc, -0.45)); this.fence(g, [gb[0] + 14, gb[1] - 7], gr, 10, shade(acc, -0.45));
        for (let k = 0; k < 7; k++) { const t = 0.08 + k * 0.13, p = [gl[0] + (gb[0] - gl[0]) * t + 3, gl[1] + (gb[1] - gl[1]) * t - 3]; this.bush(g, p[0], p[1], '#7fb98a', R); }
        this.terrace(g, x - hw * 0.66, y + hh * 0.78, () => 0.4); this.terrace(g, x + hw * 0.66, y + hh * 0.78, () => 0.4);
        break;
      }
      case 'maid': {   // 王道メイドカフェ:白い壁 + ピンクのマンサード屋根 + 丸い塔 + ストライプのひさし + 大きなリボン
        h = 36; this.building(g, x, y, hw * 0.9, hh * 0.9, h, { wall, roof, style: 'mansard', lit, R, windowColor, arched: true, awning: acc, trim, dormer: true });
        this.scallop(g, [x - hw * 0.9, y - h], [x, y - h + hh * 0.9], 11, 2.2); this.scallop(g, [x, y - h + hh * 0.9], [x + hw * 0.9, y - h], 11, 2.2);
        const tx = x - hw * 0.86, ty = y + 2, tr = hw * 0.26;   // 左の角の丸い塔
        this.cylinder(g, tx, ty, tr, tr * 0.5, 50, shade(wall, 0.02), null);
        this.ringWindows(g, tx, ty, tr, tr * 0.5, 30, 37, 3, windowColor ?? '#d6edf7'); this.ringWindows(g, tx, ty, tr, tr * 0.5, 14, 21, 3, windowColor ?? '#d6edf7');
        this.cone(g, tx, ty - 50, tr * 1.12, tr * 0.56, 30, roof);
        this.bow(g, x + 4, y - h - hh * 1.6, 12, acc);
        this.heart(g, ...front(0.55, h * 0.62), 5.5, acc);
        top = y - h - hh * 1.6 - 18;   // 名札は屋根のリボンの上(左の塔の先は少しはみ出してよい)
        for (let k = 0; k < 6; k++) { const t = 0.1 + k * 0.16, [gl, gb] = garden(1.16); this.bush(g, gl[0] + (gb[0] - gl[0]) * t + 2, gl[1] + (gb[1] - gl[1]) * t - 3, '#9fd09a', R); }
        this.terrace(g, x + hw * 0.6, y + hh * 0.75, () => 0.05);
        break;
      }
      case 'star': {   // 星・宇宙系:白い天文台 + 青いドーム + 星の飾り + 三日月 + 前の噴水
        h = 30; this.building(g, x, y, hw * 0.86, hh * 0.86, h, { wall, roof, style: 'flat', lit, R, windowColor, arched: true, trim });
        const dr = hw * 0.5, dy = y - h + 2;
        this.cylinder(g, x, dy + 2, dr * 1.04, dr * 0.52, 8, shade(wall, 0.04), shade(wall, 0.1));
        this.dome(g, x, dy - 6, dr, roof);
        g.fillStyle = shade(roof, -0.3); g.beginPath(); g.moveTo(x - 2.8, dy - 6 - dr * 1.02); g.lineTo(x + 2.8, dy - 6 - dr * 1.02); g.lineTo(x + 4, dy - 6 - dr * 0.08); g.lineTo(x - 4, dy - 6 - dr * 0.08); g.fill();   // 観測窓
        g.strokeStyle = '#d8d0ea'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + 1, dy - 6 - dr * 0.7); g.lineTo(x + 10, dy - 6 - dr * 1.2); g.stroke();   // 望遠鏡
        const t2 = [x + hw * 0.72, y - hh * 0.1];   // 右の小さな塔
        this.cylinder(g, t2[0], t2[1], 9, 4.5, 44, shade(wall, 0.02), null); this.ringWindows(g, t2[0], t2[1], 9, 4.5, 30, 37, 2, windowColor ?? '#d6edf7'); this.dome(g, t2[0], t2[1] - 44, 9.5, roof);
        for (let k = 0; k < 9; k++) this.star(g, x - dr + R() * dr * 2, dy - 10 - R() * dr * 0.8, 1.2 + R() * 1.2, '#fff3b0');
        this.star(g, x, dy - 6 - dr * 1.05 - 8, 5.5, '#ffd76a');
        g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(x - hw * 0.62, y - h - 18, 5, 0, Math.PI * 2); g.fill();
        g.fillStyle = mix(th.glow, '#ffffff', 0.4); g.beginPath(); g.arc(x - hw * 0.62 + 2.4, y - h - 19, 4.4, 0, Math.PI * 2); g.fill();   // 三日月
        top = dy - 6 - dr * 1.05 - 18;
        // 前の噴水(白い大理石 + 水)
        const fx = x - hw * 0.15, fy = y + hh * 1.55;
        g.fillStyle = '#e6d8ca'; g.beginPath(); g.ellipse(fx, fy + 1.5, 15, 7.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fffaf4'; g.beginPath(); g.ellipse(fx, fy, 14, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#9fdbe8'; g.beginPath(); g.ellipse(fx, fy - 0.5, 11, 5.2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fffaf4'; g.fillRect(fx - 1.4, fy - 9, 2.8, 8); g.beginPath(); g.ellipse(fx, fy - 9, 4, 1.8, 0, 0, Math.PI * 2); g.fill();
        this.fountains.push({ x: fx, y: fy - 10 });
        break;
      }
      case 'cat': {   // 猫メイドカフェ:暖色の洋館 + 猫耳の屋根 + 肉球の丸窓 + しっぽ + 暖かい灯り
        this.building(g, x + hw * 0.5, y - hh * 0.25, hw * 0.42, hh * 0.42, 26, { wall: shade(wall, -0.02), roof, style: 'hip', lit, R, windowColor, arched: true, trim });   // 右の離れ
        h = 38; const peak = this.building(g, x - hw * 0.12, y + hh * 0.08, hw * 0.74, hh * 0.74, h, { wall, roof, style: 'gable', lit, R, windowColor, arched: true, awning: acc, trim, chimney: true, dormer: true });
        const mx = x - hw * 0.12, my = y + hh * 0.08, mhw = hw * 0.74, mhh = hh * 0.74;
        const r1 = [mx - mhw * 0.5, my - h - mhh * 0.5 - mhh * 1.4], r2 = [mx + mhw * 0.5, my - h + mhh * 0.5 - mhh * 1.4];
        for (const [ex, ey] of [r1, r2]) {
          this.poly(g, [[ex - 9, ey + 3], [ex + 1, ey - 17], [ex + 9, ey + 1]], shade(roof, -0.04));
          this.poly(g, [[ex - 4.6, ey + 1.5], [ex + 0.8, ey - 10], [ex + 5, ey + 0.5]], '#ffc9d6');
        }
        const pw = [mx - mhw * 0.5, my + mhh * 0.5 - h * 0.72];
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(pw[0], pw[1], 6.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = acc; g.beginPath(); g.ellipse(pw[0], pw[1] + 1.2, 2.6, 2.1, 0, 0, Math.PI * 2); g.fill();
        for (const [dx, dy] of [[-3, -2], [-1, -3.4], [1, -3.4], [3, -2]]) { g.beginPath(); g.arc(pw[0] + dx, pw[1] + dy, 1, 0, Math.PI * 2); g.fill(); }
        g.strokeStyle = shade(roof, -0.12); g.lineWidth = 3; g.lineCap = 'round';   // しっぽ(右の壁)
        g.beginPath(); g.moveTo(x + hw * 0.88, y - 6); g.bezierCurveTo(x + hw + 10, y - 14, x + hw + 2, y - 30, x + hw + 11, y - 35); g.stroke();
        for (const s0 of [0.2, 0.8]) { const p = front(s0, 14, -2); g.fillStyle = '#fff1c8'; g.beginPath(); g.ellipse(p[0], p[1], 2.2, 3, 0, 0, Math.PI * 2); g.fill(); if (open) this.lights.push({ x: p[0], y: p[1], r: 14, c: '#ffd98e', a: 0.7 }); }   // ランタン
        if (open) this.lights.push({ x: mx - mhw * 0.4, y: my - h * 0.4, r: 40, c: '#ffcf8a', a: 0.35 });
        top = Math.min(r1[1], r2[1], peak) - 20;
        for (let k = 0; k < 6; k++) { const t = 0.1 + k * 0.16, [gl, gb] = garden(1.16); this.bush(g, gl[0] + (gb[0] - gl[0]) * t + 2, gl[1] + (gb[1] - gl[1]) * t - 3, '#9fd09a', R); }
        break;
      }
      case 'marine': {   // 水辺:白い壁 + 青い屋根 + 灯台の塔(青いドーム)+ 丸窓 + 貝の飾り + 桟橋
        h = 30; this.building(g, x - hw * 0.1, y, hw * 0.78, hh * 0.78, h, { wall, roof, style: 'hip', lit, R, windowColor, trim, awning: '#8fc3ec' });
        const tx = x + hw * 0.62, ty = y + hh * 0.05, tr = hw * 0.24;   // 灯台の塔(白と水色のしま)
        this.cylinder(g, tx, ty, tr, tr * 0.5, 64, '#ffffff', null);
        for (const z of [16, 36]) { g.fillStyle = shade(acc, 0.35); g.beginPath(); g.ellipse(tx, ty - z, tr, tr * 0.5, 0, 0, Math.PI); g.lineTo(tx - tr, ty - z - 6); g.ellipse(tx, ty - z - 6, tr, tr * 0.5, 0, Math.PI, 0, true); g.closePath(); g.fill(); }
        this.ringWindows(g, tx, ty, tr, tr * 0.5, 46, 53, 2, windowColor ?? '#d6edf7');
        this.cylinder(g, tx, ty - 64, tr * 1.2, tr * 0.6, 3, '#f2f6fa', '#ffffff');
        this.dome(g, tx, ty - 67, tr * 0.95, roof);
        if (open) this.lights.push({ x: tx, y: ty - 72, r: 26, c: '#fff4c8', a: 0.6 });
        for (let k = 0; k < 3; k++) { const p = front(0.25 + k * 0.25, h * 0.55); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p[0], p[1], 3.6, 0, Math.PI * 2); g.fill(); g.fillStyle = windowColor ?? '#cfe6f3'; g.beginPath(); g.arc(p[0], p[1], 2.4, 0, Math.PI * 2); g.fill(); }   // 丸窓
        { const p = front(0.5, h + 8); g.fillStyle = '#ffe6ee'; g.beginPath(); g.moveTo(p[0], p[1] + 4); for (let k = 0; k <= 6; k++) { const a = Math.PI + k * Math.PI / 6; g.lineTo(p[0] + Math.cos(a) * 7, p[1] + 4 + Math.sin(a) * 7); } g.closePath(); g.fill(); g.strokeStyle = '#f2b8cc'; g.lineWidth = 0.7; for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; g.beginPath(); g.moveTo(p[0], p[1] + 4); g.lineTo(p[0] + Math.cos(a) * 7, p[1] + 4 + Math.sin(a) * 7); g.stroke(); } }   // 貝の飾り
        top = ty - 67 - tr - 12;
        this.palm(g, x - hw * 1.02, y + 4, R); this.parasol(g, x - hw * 0.35, y + hh * 1.1, () => 0.1); this.parasol(g, x + hw * 0.2, y + hh * 1.2, () => 0.5);
        break;
      }
      case 'wa': {   // 和風:木の壁 + 瓦の屋根(反り)+ のれん + 赤ちょうちん + 桜
        h = 20; this.building(g, x, y, hw, hh, h, { wall, roof, style: 'flat', lit, R, windowColor, trim, floors: false });
        this.building(g, x, y - h + 1, hw * 1.08, hh * 1.08, 2, { wall: roof, roof, style: 'pyramid', lit: 0, R });
        this.building(g, x, y - h - 2, hw * 0.62, hh * 0.62, 12, { wall, roof, style: 'pyramid', lit, R, windowColor, trim, floors: false });
        h = 32;
        g.strokeStyle = shade(roof, -0.2); g.lineWidth = 1.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - hw - 5, y - h + 9); g.quadraticCurveTo(x - hw * 0.4, y - h + 9 + hh * 0.5, x, y - h + 9 + hh + 1); g.quadraticCurveTo(x + hw * 0.4, y - h + 9 + hh * 0.5, x + hw + 5, y - h + 9); g.stroke();
        for (let k = 0; k < 4; k++) { const p = front(0.32 + k * 0.1, 12); this.poly(g, [p, [p[0] + hw * 0.1, p[1] + hh * 0.1], [p[0] + hw * 0.1, p[1] + hh * 0.1 + 7], [p[0], p[1] + 7]], k % 2 ? shade(acc, -0.1) : acc); }
        for (const s0 of [0.12, 0.88]) { const p = front(s0, 13); g.fillStyle = '#ff8a7a'; g.beginPath(); g.ellipse(p[0], p[1], 3.2, 4.2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffe9c8'; g.fillRect(p[0] - 2.4, p[1] - 0.4, 4.8, 0.8); if (open) this.lights.push({ x: p[0], y: p[1], r: 12, c: '#ffb08a', a: 0.6 }); }
        this.tree(g, x - hw - 6, y + 6, () => 0.3, 'blossom'); this.tree(g, x + hw + 4, y + 2, () => 0.6, 'blossom');
        top = y - h - hh * 1.7 - 10;
        break;
      }
      default: {   // sweets:3段のケーキの建物 + 生クリーム + いちご
        this.building(g, x, y, hw * 0.92, hh * 0.92, 12, { wall: soft('#fffaf2'), roof: soft('#fffaf2'), style: 'flat', lit: 0, R, floors: false });
        this.cylinder(g, x, y - 12, hw * 0.92, hh * 0.92, 18, wall, soft('#fff8f0'), '#ffffff');
        this.ringWindows(g, x, y - 12, hw * 0.92, hh * 0.92, 4, 11, 5, windowColor ?? '#d6edf7');
        this.cylinder(g, x, y - 30, hw * 0.66, hh * 0.66, 15, roof, soft('#fff8f0'), '#ffffff');
        this.cylinder(g, x, y - 45, hw * 0.4, hh * 0.4, 12, soft(th.glow), soft('#fff8f0'), '#ffffff');
        for (let k = 0; k < 6; k++) { const a = Math.PI * (0.12 + k * 0.15); g.fillStyle = '#ff6f8a'; g.beginPath(); g.arc(x + Math.cos(a) * hw * 0.62, y - 31 + Math.sin(a) * hh * 0.5, 2, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ff5f7a'; g.beginPath(); g.ellipse(x, y - 61, 5, 5.6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#7cc97a'; g.beginPath(); g.ellipse(x, y - 66, 3.4, 1.3, 0, 0, Math.PI * 2); g.fill();
        h = 44; top = y - 76;
        this.terrace(g, x - hw * 0.7, y + hh * 0.7, () => 0.2); this.terrace(g, x + hw * 0.7, y + hh * 0.7, () => 0.7);
      }
    }
    // 小さな看板(右の壁に掛けた白い板。ネオンではない)
    const sp = side(0.42, Math.min(h, 34) * 0.62);
    g.save(); g.setTransform(this.dpr, -0.5 * this.dpr, 0, this.dpr, sp[0] * this.dpr, sp[1] * this.dpr);
    const label = s.name.length > 10 ? s.name.split(' ')[0] : s.name;
    g.font = `italic 700 ${n >= 4 ? 13 : 11}px "Great Vibes", "Cormorant Garamond", Georgia, serif`;
    const tw = g.measureText(label).width;
    g.fillStyle = '#ffffff'; g.strokeStyle = rgba(acc, 0.9); g.lineWidth = 1;
    g.beginPath(); g.roundRect?.(-1, -8, tw + 9, 15, 3); if (!g.roundRect) g.rect(-1, -8, tw + 9, 15); g.fill(); g.stroke();
    g.textBaseline = 'middle'; g.fillStyle = shade(acc, -0.22); g.fillText(label, 3.5, 0);
    g.restore();
    // 入口(木のアーチの扉 + 店内の灯り)
    const door = front(0.5, 0, -1);
    g.fillStyle = open ? '#c08e60' : '#e0cbb6';
    this.poly(g, [[door[0] - 4, door[1] - 2], [door[0] + 4, door[1] + 2], [door[0] + 4, door[1] - 10], [door[0] - 4, door[1] - 14]]); g.fill();
    g.fillStyle = open ? '#ffe2a0' : '#f2e6da'; this.poly(g, [[door[0] - 2.6, door[1] - 2.5], [door[0] + 2.6, door[1] + 0.2], [door[0] + 2.6, door[1] - 9], [door[0] - 2.6, door[1] - 11.8]]); g.fill();
    if (open) {
      this.lights.push({ x: door[0], y: door[1] - 6, r: 26, c: th.window, a: 0.7 }, { x, y: y - h * 0.5, r: hw * 1.1, c: th.accent, a: 0.18 });
      for (let k = 0; k <= 12; k++) {   // ガーランド(屋根の縁の小さな旗)
        const t = k / 12, px = x - hw * 0.9 + t * hw * 1.8, py = y - Math.min(h, 34) + (t <= 0.5 ? t : 1 - t) * 2 * hh * 0.9 + 3;
        g.fillStyle = k % 2 ? '#ffffff' : th.accent; g.beginPath(); g.moveTo(px - 1.8, py - 1); g.lineTo(px + 1.8, py - 1); g.lineTo(px, py + 2.6); g.fill();
      }
    }
    this.shopGeo.set(s.id, { ...geo, x, y, top, hw, h, box: { x0: x - hw - 8, x1: x + hw + 8, y0: top - 6, y1: y + hh + 8 } });
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
      return `<button type="button" class="cm-pin ${s.map.label === 'right' ? 'r' : 'l'}${open ? '' : ' locked'}" data-shop="${s.id}" style="left:${geo.x}px;top:${geo.top}px;--ac:${s.theme.accent};--gl:${s.theme.glow}" aria-label="${s.name}(${s.ja})${open ? '' : ' 準備中'}">
        <span class="cm-face face-crop">${open ? this.portrait?.(s) ?? '' : '<i class="cm-sil" aria-hidden="true"></i><i class="cm-lock" aria-hidden="true"></i>'}</span>
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
    setTimeout(() => this.place(), 300);   // 名札の大きさが変わり終わってから重なりを見直す
    if (!silent) this.onSelect?.(id);
  }
  /** 選んだお店が画面の見やすい位置へ来るようにカメラを動かす */
  focus(id, snap = false) {
    const geo = this.shopGeo.get(id); if (!geo) return;
    // 見出しと情報カードの間(band)に「名札の上端 〜 建物の足元」がおさまるように。band が無ければ画面の focusY
    const tx = geo.x - this.vw * 0.5, ty = this.band ? ((geo.top - 66) + (geo.y + HH * geo.n * 0.6)) / 2 - (this.band.top + this.band.bottom) / 2 : geo.y - this.vh * (this.focusY ?? 0.5);
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
    // 選んだお店の名札と重なる他の名札は控えめに(選択中がいつも読める)
    const selPin = this.pins?.find((b) => b.dataset.shop === this.sel);
    if (selPin) {
      const S = selPin.getBoundingClientRect();
      for (const b of this.pins) {
        if (b === selPin) continue;
        const r = b.getBoundingClientRect(), hit = r.left < S.right - 4 && r.right > S.left + 4 && r.top < S.bottom - 4 && r.bottom > S.top + 4;
        if (hit) { b.style.opacity = Math.min(+b.style.opacity || 1, 0.22).toFixed(2); b.style.pointerEvents = 'none'; }
      }
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
    for (const f of this.fountains) { for (let k = 0; k < 16; k++) { const p = (t * 0.9 + k / 16) % 1, ang = k * 2.4; const x = f.x + Math.cos(ang) * p * 10, y = f.y - Math.sin(p * Math.PI) * 13 + p * 8; g.fillStyle = `rgba(160,220,238,${0.9 * (1 - p)})`; g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6); } }
    // 選んだお店:足元のやわらかな光 + 建物を包む淡い光 + ゆっくり昇る光の粒(点滅させない)
    const s = this.shops.find((x) => x.id === this.sel), geo = s && this.shopGeo.get(s.id);
    if (geo) {
      const breath = 0.82 + 0.18 * Math.sin(t * 1.6), c = this.isOpen(s) ? s.theme.accent : '#b3a4cf', gl = this.isOpen(s) ? s.theme.glow : '#e6def0';
      // 足元の光は建物の外側だけ(建物の上には重ねない:中心は透明)
      g.save(); g.translate(geo.x, geo.y + HH * 0.6); g.scale(1, 0.5);
      const rr = geo.hw * 2.05, rg = g.createRadialGradient(0, 0, geo.hw * 0.95, 0, 0, rr);
      rg.addColorStop(0, rgba(gl, 0)); rg.addColorStop(0.18, rgba(gl, 0.7 * breath)); rg.addColorStop(0.5, rgba(c, 0.2 * breath)); rg.addColorStop(1, rgba(c, 0));
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.arc(0, 0, geo.hw * 0.95, 0, Math.PI * 2, true); g.fill();
      g.restore();
      g.save(); g.translate(geo.x, geo.y + HH * 1.1); g.scale(1, 0.5);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(0, Math.PI * 0, geo.hw * 1.32, -0.05 * Math.PI, 1.05 * Math.PI); g.stroke();   // 手前の半分だけ(建物の後ろは通さない)
      g.strokeStyle = rgba(c, 0.5 * breath); g.lineWidth = 1.1; g.beginPath(); g.arc(0, 0, geo.hw * 1.4, -0.05 * Math.PI, 1.05 * Math.PI); g.stroke();
      g.restore();
      for (let k = 0; k < 12; k++) {
        const p = (t * 0.16 + k / 12) % 1, x = geo.x + Math.sin(k * 2.39) * geo.hw * 1.05 + Math.sin(t * 0.8 + k) * 3, y = geo.y + 4 - p * (geo.y - geo.top + 10);
        const a = Math.sin(p * Math.PI) * 0.85, r = 1.1 + (k % 3) * 0.5;
        const mg = g.createRadialGradient(x, y, 0, x, y, r * 3); mg.addColorStop(0, `rgba(255,255,255,${a})`); mg.addColorStop(0.4, rgba(gl, a * 0.6)); mg.addColorStop(1, rgba(gl, 0));
        g.fillStyle = mg; g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
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
