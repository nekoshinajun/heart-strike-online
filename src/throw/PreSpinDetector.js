import { Config } from '../core/Config.js';

/**
 * 投球前の球質ジェスチャーの判定(ハートを掴んでいる間の指の動きだけを見る。純粋なロジック)
 *   PRE-SPIN … 指で円を描く。指の「進む向き」が同じ向きに minTurnDeg 以上回ったら成立
 *              画面座標は y が下向きなので、向きの角度が増える = 時計回り = RIGHT
 *   DRIVE    … 上下へ素早く往復(minStrokes ストロークを maxDurationMs 以内)
 *
 * 誤認識しないための条件(数値は Config.preSpin / Config.drive)
 *   - 「下へ引いて POWER → 上へ弾く」は 向きが一度に 180° 折り返す → 回転の計測をやり直す / ストロークは 2 つだけ
 *   - 最低移動量・入力時間・回転の向きの一貫性・縦の往復だけ(横移動が大きいストロークは数えない)
 *
 * feed(point) に指の位置 { x, y, t } を順に渡す → 成立した時だけ結果を返す
 *   { type: 'preSpin', dir: +1(RIGHT) | -1(LEFT), strength 0〜1 } / { type: 'drive', strength 0〜1 }
 */
export class PreSpinDetector {
  constructor(viewH = 800) { this.viewH = viewH; this.reset(); }

  reset(p = null) {
    this.anchor = p ? { ...p } : null;   // 間引きの基準点
    this.heading = null;
    this.steps = [];                      // { t, d(向きの変化 rad), len }
    this.strokes = [];                    // { dir: ±1, dy, dx, t0, t1 }
    this.cur = null;                      // 今のストローク
    this.yRef = p ? { ...p } : null;
  }

  feed(p) {
    if (!this.anchor) { this.reset(p); return null; }
    const spin = this.feedSpin(p);
    if (spin) { this.strokes = []; this.cur = null; this.yRef = { ...p }; return spin; }
    return this.feedDrive(p);
  }

  // ---------------- PRE-SPIN ----------------
  feedSpin(p) {
    const C = Config.preSpin;
    if (!C.enabled) return null;
    const dx = p.x - this.anchor.x, dy = p.y - this.anchor.y;
    const len = Math.hypot(dx, dy);
    if (len < C.sampleStepPx) return null;
    const h = Math.atan2(dy, dx);
    this.anchor = { x: p.x, y: p.y, t: p.t };
    if (this.heading == null) { this.heading = h; return null; }
    let d = h - this.heading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    this.heading = h;
    // 急な折り返し(引いて → 弾く 等)は円ではない:計測をやり直す
    if (Math.abs(d) > (C.maxStepTurnDeg * Math.PI) / 180) { this.steps = []; return null; }
    this.steps.push({ t: p.t, d, len });
    while (this.steps.length && p.t - this.steps[0].t > C.maxDurationMs) this.steps.shift();
    let pos = 0, neg = 0, path = 0;
    for (const s of this.steps) { if (s.d > 0) pos += s.d; else neg -= s.d; path += s.len; }
    const net = pos - neg, total = pos + neg;
    const dur = this.steps.length ? p.t - this.steps[0].t : 0;
    const minTurn = (C.minTurnDeg * Math.PI) / 180;
    if (Math.abs(net) < minTurn) return null;
    if (total <= 0 || Math.max(pos, neg) / total < C.consistency) return null;
    if (path < C.minPathRatio * this.viewH || dur < C.minDurationMs) return null;
    const strength = Math.min(1, Math.abs(net) / ((C.fullTurnDeg * Math.PI) / 180));
    this.steps = [];
    return { type: 'preSpin', dir: net > 0 ? 1 : -1, strength };
  }

  // ---------------- DRIVE ----------------
  feedDrive(p) {
    const C = Config.drive;
    if (!C.enabled) return null;
    const minAmp = C.minAmplitudeRatio * this.viewH;
    const ref = this.yRef;
    const dy = p.y - ref.y;
    if (Math.abs(dy) < 3) { if (this.cur) this.cur.xPath += Math.abs(p.x - ref.x); this.yRef = { ...ref, x: p.x }; return null; }   // 微小な縦の揺れは無視(横移動は数える)
    const dir = Math.sign(dy);
    const ok = (st) => st.dy >= minAmp && st.xPath <= st.dy * C.maxHorizontalRatio;   // 縦に十分動いていて、横の移動(合計)が小さい
    if (!this.cur) this.cur = { dir, y0: ref.y, xPath: 0, t0: ref.t ?? p.t };
    if (dir !== this.cur.dir) {
      // 向きが変わった:今のストロークを確定。円を描く動き(横にも大きく動く)は数えない
      const st = { dy: Math.abs(ref.y - this.cur.y0), xPath: this.cur.xPath, t0: this.cur.t0 };
      if (ok(st)) this.strokes.push(st); else this.strokes = [];   // 往復が途切れた
      this.cur = { dir, y0: ref.y, xPath: 0, t0: ref.t ?? p.t };
    }
    this.cur.xPath += Math.abs(p.x - ref.x);
    this.yRef = { x: p.x, y: p.y, t: p.t };
    while (this.strokes.length && p.t - this.strokes[0].t0 > C.maxDurationMs) this.strokes.shift();
    // 進行中のストロークも振れ幅が足りていれば数える(最後の往復で指を止めなくても成立)
    const liveSt = { dy: Math.abs(p.y - this.cur.y0), xPath: this.cur.xPath, t0: this.cur.t0 };
    const all = [...this.strokes, ...(ok(liveSt) ? [liveSt] : [])];
    if (all.length < C.minStrokes) return null;
    if (p.t - all[0].t0 > C.maxDurationMs) return null;
    const amp = all.reduce((a, s) => a + s.dy, 0) / all.length;
    const strength = Math.max(C.minStrength, Math.min(1, amp / (C.fullAmplitudeRatio * this.viewH)));
    this.strokes = []; this.cur = null;
    return { type: 'drive', strength };
  }
}
