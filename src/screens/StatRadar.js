// ステータスの五角形(育成のキャラクター詳細 / インゲームの味方のステータス)
/**
 * ステータスの五角形(レーダーチャート)。stats:[{ key, label, value, max }](上から時計回り)
 * 半透明のガラスの段 + 発光するグラデーションの多角形 + 頂点のラベルと実数値
 */
let seq = 0;
export function statRadarSVG(stats) {
  const id = `rd${++seq}`;   // グラデーションの id は呼ぶたびに別(同じページに複数あっても、隠れた方を参照しない)
  // ラベルは頂点の上 / 下に「名前 + 実数値」を縦に重ねる(左右へ張り出さない = 横幅を小さく)
  const W = 124, H = 118, cx = 62, cy = 61, R = 36, n = stats.length;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const poly = (r) => stats.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
  const k = (s) => Math.max(0.06, Math.min(1, s.value / (s.max || 100)));
  const data = stats.map((s, i) => pt(i, R * k(s)));
  const labels = stats.map((s, i) => {
    const [x, y] = pt(i, R);
    const below = y > cy + 4;
    // 下の2つ(CONTROL / DEFENCE)は少し外側へ(ラベル同士の間を空ける)
    const lx = Math.max(19, Math.min(W - 19, below ? x + Math.sign(x - cx) * 5 : x)), anchor = 'middle';
    const ny = below ? y + 10 : y - 19, vy = below ? y + 24 : y - 5;
    return `<g class="rd-l" data-stat="${s.key}"><text x="${lx.toFixed(1)}" y="${ny.toFixed(1)}" text-anchor="${anchor}" class="rd-name">${s.label}</text><text x="${lx.toFixed(1)}" y="${vy.toFixed(1)}" text-anchor="${anchor}" class="rd-val">${s.value}</text></g>`;
  }).join('');
  return `<svg class="rd" viewBox="0 0 ${W} ${H}" role="img" aria-label="${stats.map((s) => `${s.label} ${s.value}`).join(' / ')}">
    <defs>
      <radialGradient id="${id}Bg" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#ffe3f1" stop-opacity=".55"/></radialGradient>
      <linearGradient id="${id}Fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ab6" stop-opacity=".78"/><stop offset=".55" stop-color="#c58cff" stop-opacity=".6"/><stop offset="1" stop-color="#7cc8ff" stop-opacity=".62"/></linearGradient>
      <filter id="${id}Glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <polygon points="${poly(R)}" class="rd-bg" fill="url(#${id}Bg)"/>
    ${[0.75, 0.5, 0.25].map((f) => `<polygon points="${poly(R * f)}" class="rd-ring"/>`).join('')}
    ${stats.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="rd-axis"/>`; }).join('')}
    <polygon points="${data.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" class="rd-data" fill="url(#${id}Fill)" filter="url(#${id}Glow)"/>
    ${data.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" class="rd-dot"/>`).join('')}
    ${labels}
  </svg>`;
}

