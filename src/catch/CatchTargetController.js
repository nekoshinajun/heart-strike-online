import { Config, catchWin } from '../core/Config.js';
import { BallController } from '../controllers/BallController.js';
import { sample, slice } from '../defence/NotePath.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
/** FLICK(スライダー)のサークル・トラックの太さ(ハートの見かけの大きさ比)*/
const SLIDER_SCALE = 0.68;
const polyD = (pts) => pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');

/**
 * Catch Marker(◎)の表示。到達予定地点(3D)を毎フレーム画面へ投影して追従させる。
 *  - 中央リング:到達時のボールの見かけの大きさ
 *  - 外側リング:到達までの残り時間で縮小 → 中央リングと重なる瞬間が PERFECT
 *  - 判定ゾーン(薄い点線):GOOD 半径(練習用)
 * DEFENCE のハートの種類は文字を使わず「形と動き」で見せる
 *  - NORMAL … 細いリングだけ(重なった瞬間にタップ)
 *  - HOLD   … 塗りつぶした「押す面」+ 外周の空のゲージ(押し続けると一周 → 光ったら離す)
 *  - FLICK  … osu! のスライダーと同じ見た目:縁取りの太いトラック(本体)+ 開始のヒットサークル(外側のアプローチサークルが縮む)
 *              + 終点のサークル。押すとスライダーボール(= ハート)がトラックを slideSec で進み、まわりのフォローサークルの中に指を保つ
 *  - MULTI  … 次のハートのマーカーを薄く先に見せる(setNext)
 */
export class CatchTargetController {
  constructor(player, cam, viewport) {
    this.player = player;
    this.cam = cam;
    this.viewport = viewport;
    this.el = document.getElementById('catchMarker');
    this.outer = document.getElementById('cmOuter');
    this.inner = document.getElementById('cmInner');
    this.zone = document.getElementById('cmZone');
    this.holdRing = document.getElementById('cmHold');
    this.pad = document.getElementById('cmPad');
    this.world = null;
    this.note = null;
    this.next = null;
    this.slide = null;
    this.buildFx();
  }

  /** FLICK の軌道・終点・ガイドと、MULTI の次のハートを描く SVG(マーカーの下)*/
  buildFx() {
    const host = this.el?.parentElement;
    if (!host) return;
    const s = svg('svg', { id: 'noteFx', 'aria-hidden': 'true' });
    this.fxNext = svg('g', { class: 'nf-next' });
    this.fxNextEdge = svg('path', { class: 'nf-next-edge' });
    this.fxNextPath = svg('path', { class: 'nf-next-path' });
    this.fxNextEnd = svg('circle', { class: 'nf-next-end', r: 8 });
    this.fxNextRing = svg('circle', { class: 'nf-next-ring', r: 20 });
    this.fxNextPad = svg('circle', { class: 'nf-next-pad', r: 14 });
    this.fxNext.append(this.fxNextEdge, this.fxNextPath, this.fxNextEnd, this.fxNextRing, this.fxNextPad);
    // osu! のスライダー:縁(白)→ 本体(色)→ 中心の明るい帯 の順に重ねた太い線 = トラック
    this.fxPath = svg('g', { class: 'nf-path' });
    this.fxEdge = svg('path', { class: 'nf-edge' });
    this.fxBody = svg('path', { class: 'nf-body' });
    this.fxCore = svg('path', { class: 'nf-core' });
    this.fxEnd = svg('circle', { class: 'nf-end' });            // 終点のサークル(ここまで運んで離す)
    this.fxFollow = svg('circle', { class: 'nf-follow' });      // フォローサークル(この中に指を保つ = 判定の許容幅)
    this.fxBall = svg('circle', { class: 'nf-ball' });          // スライダーボールの縁(中身は 3D のハート)
    this.fxPath.append(this.fxEdge, this.fxBody, this.fxCore, this.fxEnd, this.fxFollow, this.fxBall);
    s.append(this.fxNext, this.fxPath);
    host.insertBefore(s, this.el);
    s.style.display = 'none';
    this.fx = s;
  }

  /** 今のハート(NORMAL / HOLD / FLICK)のマーカー */
  setNote(note) {
    this.note = note ?? null;
    const t = note?.type ?? '';
    this.el.dataset.note = t;
    this.el.classList.remove('holding', 'ready', 'early', 'sliding');
    if (this.pad) this.pad.hidden = t !== 'HOLD';
    this.setHold(t === 'HOLD' ? 0 : null);
    this.slide = null;
    if (this.fx) this.fx.dataset.note = t;
  }

  /** MULTI:次に来るハート(薄く先に見せる)。null で消す */
  setNext(note) { this.next = note ?? null; if (this.fx) this.fx.dataset.next = note?.type ?? ''; }

  /**
   * HOLD の押し続けゲージ(0..1)。null で隠す
   *   state: 'idle'(押す前:空のゲージ)/ 'holding'(押している)/ 'ready'(一周 → 離してよい)/ 'early'(早く離した:残りを赤で見せる)
   */
  setHold(k, state = k == null ? null : 'idle') {
    if (!this.holdRing) return;
    this.holdRing.hidden = k == null;
    const kk = Math.max(0, Math.min(1, k ?? 0));
    if (k != null) this.holdRing.style.setProperty('--k', `${Math.round(kk * 360)}deg`);
    this.el.style.setProperty('--hk', kk.toFixed(3));
    this.el.dataset.hold = state ?? '';
    this.el.classList.toggle('holding', state === 'holding');
    this.el.classList.toggle('ready', state === 'ready');
    this.el.classList.toggle('early', state === 'early');
  }

  /** FLICK の操作中:{ consumed(進んだ所 0..1), guide(理想の位置 0..1), finger:{x,y}, reached, fail } / null */
  setSlide(s) { this.slide = s; this.el.classList.toggle('sliding', !!s && !s.fail); }

  /** FLICK の軌道(今の画面座標 px の折れ線)。判定もこれを使う(見えている軌道 = 判定の軌道)*/
  pathPoly(note = this.note) {
    if (!note?.pathWorld?.length) return null;
    const P = note.pathWorld.map((wp) => this.player.toScreen(wp));
    return sample(note.path?.kind ?? 'line', P, note.path?.kind === 'line' ? 1 : 24);
  }

  /** 軌道の上の t(0..1)の位置(px)。スライダーボール(ハート)の位置 */
  pointOnPath(t, note = this.note) {
    const poly = this.pathPoly(note);
    return poly ? slice(poly, 0, Math.max(0.001, Math.min(1, t))).at(-1) : null;
  }

  show(world, color) {
    this.world = world.clone();
    this.el.hidden = false;
    this.el.style.setProperty('--pc', color);
    this.el.classList.remove('hit', 'miss');
    if (this.fx) this.fx.style.display = '';
  }

  hide() {
    this.setNote(null); this.setNext(null);
    this.el.hidden = true; this.world = null;
    if (this.fx) { this.fx.style.display = 'none'; this.fx.dataset.note = ''; this.fx.dataset.next = ''; }
  }

  /** 現在のマーカー中心(px) */
  screen() { return this.world ? this.player.toScreen(this.world) : null; }

  /** @param progress 1(リング開始)→0(到達)。>1 の間は外側リング最大で待機 */
  update(progress) {
    if (!this.world) return;
    const s = this.screen();
    const short = Math.min(this.viewport.w, this.viewport.h);
    const r = BallController.screenRadius(this.cam.camera, this.world, this.viewport.h);
    this.r = r;
    const k = Math.max(-0.35, Math.min(1, progress));
    // FLICK はスライダーのトラックが見えるよう、サークル(開始・終点・トラックの太さ)を少し細く。判定の範囲は変えない
    const ri = this.note?.type === 'FLICK' ? r * SLIDER_SCALE : r;
    const outer = ri * (1 + k * 2.6);
    this.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    this.inner.style.width = this.inner.style.height = `${ri * 2}px`;
    this.outer.style.width = this.outer.style.height = `${Math.max(0, outer) * 2}px`;
    this.outer.style.opacity = this.el.classList.contains('sliding') ? 0 : progress > 1 ? 0.35 : 1;   // 押した後(スライド中)はアプローチサークルを消す
    const zr = catchWin('goodRadius') * short;
    this.zone.style.width = this.zone.style.height = `${zr * 2}px`;
    if (this.holdRing) this.holdRing.style.width = this.holdRing.style.height = `${r * 2 + 30}px`;
    if (this.pad) this.pad.style.width = this.pad.style.height = `${r * 2 - 6}px`;
    this.el.classList.toggle('near', Math.abs(progress) < 0.08);
    this.drawFx(r);
  }

  /** FLICK の軌道・終点・ガイド / 次のハート(マーカーを動かした後に毎フレーム)*/
  drawFx(r = this.r ?? 24) {
    if (!this.fx) return;
    const n = this.note;
    const poly = n?.type === 'FLICK' ? this.pathPoly(n) : null;
    this.fxPath.style.display = poly ? '' : 'none';
    if (poly) {
      const sl = this.slide, R = r * SLIDER_SCALE;
      // トラックは最初から全体を見せる(どこからどこへ運ぶかを先に分かるように)
      const d = polyD(poly);
      const bw = Math.max(3, R * 0.13);
      this.fxEdge.setAttribute('d', d); this.fxEdge.style.strokeWidth = `${(R * 2).toFixed(1)}px`;
      this.fxBody.setAttribute('d', d); this.fxBody.style.strokeWidth = `${(R * 2 - bw * 2).toFixed(1)}px`;
      this.fxCore.setAttribute('d', d); this.fxCore.style.strokeWidth = `${(R * 0.9).toFixed(1)}px`;
      const end = poly[poly.length - 1];
      this.fxEnd.setAttribute('cx', end.x.toFixed(1)); this.fxEnd.setAttribute('cy', end.y.toFixed(1));
      this.fxEnd.setAttribute('r', (R * 0.78).toFixed(1)); this.fxEnd.style.strokeWidth = `${(bw * 0.7).toFixed(1)}px`;   // 開始のサークルより控えめ(どっちが始まりか迷わない)
      this.fxEnd.classList.toggle('reached', !!sl?.reached);
      this.fxPath.classList.toggle('fail', !!sl?.fail);
      // スライダーボール + フォローサークル:押している間だけ。ボールは slideSec でトラックを進む(ハートも同じ位置)
      const on = !!sl && !sl.fail;
      this.fxPath.classList.toggle('active', on);
      if (on) {
        const b = slice(poly, 0, Math.max(0.001, Math.min(1, sl.guide ?? 0))).at(-1);
        const fr = Math.max(R * 1.4, (Config.defence.flick.tol ?? 0.13) * Math.min(this.viewport.w, this.viewport.h));
        for (const c of [this.fxBall, this.fxFollow]) { c.setAttribute('cx', b.x.toFixed(1)); c.setAttribute('cy', b.y.toFixed(1)); }
        this.fxBall.setAttribute('r', (R * 0.92).toFixed(1));
        this.fxFollow.setAttribute('r', fr.toFixed(1));
      }
    }
    // MULTI:次のハートを薄く(種類ごとの形:NORMAL = リング / HOLD = 塗りつぶし / FLICK = 小さなスライダー)
    const nx = this.next, nw = nx?.markerWorld;
    this.fxNext.style.display = nw ? '' : 'none';
    if (nw) {
      const p = this.player.toScreen(nw), rr = Math.max(14, r * 0.8);
      for (const c of [this.fxNextRing, this.fxNextPad]) { c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); }
      this.fxNextRing.setAttribute('r', rr.toFixed(1)); this.fxNextPad.setAttribute('r', (rr * 0.72).toFixed(1));
      this.fxNextPad.style.display = nx.type === 'HOLD' ? '' : 'none';
      const np = nx.type === 'FLICK' ? this.pathPoly(nx) : null;
      this.fxNextPath.setAttribute('d', np ? polyD(np) : ''); this.fxNextPath.style.strokeWidth = `${(rr * 1.6).toFixed(1)}px`;
      this.fxNextEdge.setAttribute('d', np ? polyD(np) : ''); this.fxNextEdge.style.strokeWidth = `${(rr * 2).toFixed(1)}px`;
      this.fxNextEnd.style.display = np ? '' : 'none';
      if (np) { const e = np[np.length - 1]; this.fxNextEnd.setAttribute('cx', e.x.toFixed(1)); this.fxNextEnd.setAttribute('cy', e.y.toFixed(1)); this.fxNextEnd.setAttribute('r', (rr * 0.8).toFixed(1)); }
    }
  }

  flash(ok) { this.el.classList.add(ok ? 'hit' : 'miss'); }
}
