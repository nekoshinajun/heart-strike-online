/**
 * DEFENCE の FLICK(スライド)の軌道。開始地点(ハートの到達点)→ 終点ターゲット
 *   path = { kind, points: [{x,y}…](画面の正規化座標 0..1)}
 *     kind 'line' … [開始, 終点](今はこれだけ)
 *     kind 'quad' … [開始, 制御点, 終点](将来のカーブ軌道用。sample / nearest はこのままで動く)
 *   判定と表示は sample() で作った画面上の折れ線(px)を使う → 軌道の形が増えても判定の作りは同じ
 */
export function pointAt(kind, P, t) {
  if (kind === 'quad' && P.length >= 3) {
    const u = 1 - t;
    return { x: u * u * P[0].x + 2 * u * t * P[1].x + t * t * P[2].x, y: u * u * P[0].y + 2 * u * t * P[1].y + t * t * P[2].y };
  }
  const a = P[0], b = P[P.length - 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 画面座標(px)の点列 P から折れ線を作る → [{x, y, t}](t = 軌道の進み 0..1)*/
export function sample(kind, P, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push({ ...pointAt(kind, P, t), t }); }
  return out;
}

/** 折れ線の上で点 p に一番近い所 → { t, dist, x, y } */
export function nearest(poly, p) {
  let best = { t: 0, dist: Infinity, x: poly[0].x, y: poly[0].y };
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-9;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    const x = a.x + dx * u, y = a.y + dy * u, d = Math.hypot(p.x - x, p.y - y);
    if (d < best.dist) best = { t: a.t + (b.t - a.t) * u, dist: d, x, y };
  }
  return best;
}

/** 折れ線の t までの部分(進んだ所)/ t からの部分(残り) */
export function slice(poly, t0, t1 = 1) {
  const pts = [];
  const at = (t) => { for (let i = 0; i < poly.length - 1; i++) { const a = poly[i], b = poly[i + 1]; if (t <= b.t) { const u = (t - a.t) / ((b.t - a.t) || 1); return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, t }; } } return poly[poly.length - 1]; };
  pts.push(at(t0));
  for (const q of poly) if (q.t > t0 && q.t < t1) pts.push(q);
  pts.push(at(t1));
  return pts;
}

/**
 * 直線の軌道を作る:開始 startN から方向 dir('L'|'R'|'U'|'D')へ len(画面の短辺比)。画面からはみ出す / 上の HUD にかかる時は逆向き / 横向きに
 *   → { kind: 'line', points: [startN, endN], dir }
 */
export function makeLinePath(startN, dir, viewport, { len = 0.28, margin = 0.1, top = 0.2 } = {}) {
  const { w, h } = viewport, short = Math.min(w, h);
  const D = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
  const order = { L: ['L', 'R', 'U', 'D'], R: ['R', 'L', 'U', 'D'], U: ['U', 'D', 'L', 'R'], D: ['D', 'U', 'L', 'R'] }[dir] ?? ['U', 'D', 'L', 'R'];
  const inside = (p) => p.x >= margin && p.x <= 1 - margin && p.y >= Math.max(margin, top) && p.y <= 1 - margin * 1.6;   // top:上の HUD(LOVE / FEVER / ATTACK LEVEL)に重ねない
  for (const d of order) {
    const end = { x: startN.x + (D[d][0] * len * short) / w, y: startN.y + (D[d][1] * len * short) / h };
    if (inside(end)) return { kind: 'line', points: [{ ...startN }, end], dir: d };
  }
  const d = order[0];
  return { kind: 'line', points: [{ ...startN }, { x: Math.max(margin, Math.min(1 - margin, startN.x + (D[d][0] * len * short) / w)), y: Math.max(Math.max(margin, top), Math.min(1 - margin, startN.y + (D[d][1] * len * short) / h)) }], dir: d };
}
