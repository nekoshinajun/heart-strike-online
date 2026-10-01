/**
 * 投球前のカーブ入力:固定したハートを中心に、指の円運動で回転方向・回転角度を取る(Config.throwInput.rotate)。
 *   時計回り(画面)→ 右カーブ / 反時計回り → 左カーブ。回した角度が大きいほど強い(弱 → 強へ連続的に。1周しなくてよい)
 *   角度はハート中心から見た指の向き(atan2)の差を累積。差は -180°〜180° に正規化(0° / 360° を跨いでも飛ばない)
 *   ハート中心のすぐ近く(minRadius 未満)の点と、1サンプルで大きく飛んだ差(中心をまたいだ等)は数えない
 *   最後に回転入力を検出してから decaySec(2秒)新しい回転が無ければ 0(ストレート)へ。その間にまた回せばタイマーはリセット
 *   指を離した時は、その時点のカーブ値で投げる(ThrowController)
 *   回し終えて「まっすぐ」下へ引く / 上へ弾く時の、直線的な動きの間に増えた分は回転に数えない(discardStraightTail)
 */
export class RotationCurve {
  constructor(cfg) { this.cfg = cfg; this.reset(0); }

  reset(t = 0) {
    this.angle = 0;          // 累積の回転角(rad。+ = 時計回り = 右)
    this.lastAng = null;     // 直前の指の向き(rad)
    this.lastInputAt = t;    // 最後に回転を検出した時刻(ms)
    this.decayed = false;
    this.trail = [];         // 指の点と、その時点の累積角 [{ x, y, angle }]
    this.seg = 0;            // 今の「直線的な動き」の始まり(trail の index)
  }

  /** 指の軌跡を記録し、直線的な区間の始まりを更新(途中の点が直線から tol 以上離れたら、そこから新しい区間)*/
  track(p, r) {
    const T = this.trail;
    T.push({ x: p.x, y: p.y, angle: this.angle });
    if (T.length > 400) { T.splice(0, 100); this.seg = Math.max(0, this.seg - 100); }
    // まっすぐ = 途中の点の直線からのずれが、区間の長さの straightRatio 未満(円弧はずれが長さに比例して大きい)
    const s = T[this.seg], e = T[T.length - 1], L = Math.hypot(e.x - s.x, e.y - s.y), tol = Math.max(2, (this.cfg.straightRatio ?? 0.08) * L);
    if (L < 1e-6) return;
    for (let i = this.seg + 1; i < T.length - 1; i++) {
      const q = T[i], dev = Math.abs((e.x - s.x) * (s.y - q.y) - (s.x - q.x) * (e.y - s.y)) / L;
      if (dev > tol) { this.seg = T.length - 2; return; }
    }
  }

  /**
   * 引き始め / 弾き始めの時:最後の直線的な動き(長さ minLen 以上)の間に増えた回転は取り消す
   * (回し終えてまっすぐ下へ引く途中で、ハートの横を通る分がカーブにならない)
   */
  discardStraightTail(r) {
    const T = this.trail, s = T[this.seg], e = T[T.length - 1];
    if (!s || !e || this.seg >= T.length - 1) return false;
    if (Math.hypot(e.x - s.x, e.y - s.y) < (this.cfg.straightMinLen ?? 0.6) * r) return false;
    this.angle = s.angle;
    return true;
  }

  /** 指の点 p {x, y}(px)/ ハート中心 c {x, y} / ハートの画面半径 r / 時刻 t(ms)→ 回転が増えたら true */
  feed(p, c, r, t) {
    const C = this.cfg, dx = p.x - c.x, dy = p.y - c.y;
    try { return this.feedAngle(p, c, r, t, C, dx, dy); } finally { this.track(p, r); }
  }
  feedAngle(p, c, r, t, C, dx, dy) {
    if (Math.hypot(dx, dy) < (C.minRadius ?? 0.35) * r) { this.lastAng = null; return false; }
    const a = Math.atan2(dy, dx);   // 画面座標(y 下向き):角度が増える = 時計回り
    if (this.lastAng == null) { this.lastAng = a; return false; }
    let d = a - this.lastAng;
    d = Math.atan2(Math.sin(d), Math.cos(d));   // -π〜π に正規化(0° / 360° を跨いでも値が飛ばない)
    this.lastAng = a;
    if (Math.abs(d) > ((C.maxStepDeg ?? 120) * Math.PI) / 180) return false;   // 中心をまたいだ大きな飛びは回転として数えない
    if (Math.abs(d) < ((C.noiseDeg ?? 0.4) * Math.PI) / 180) return false;
    const lim = ((C.maxDeg ?? 540) * Math.PI) / 180;
    this.angle = Math.max(-lim, Math.min(lim, this.angle + d));
    this.lastInputAt = t;
    this.decayed = false;
    return true;
  }

  /** 毎フレーム:回転が止まって decaySec 経ったら 0(ストレート)へ。0 に戻した時 true */
  update(t) {
    if (this.angle !== 0 && t - this.lastInputAt >= (this.cfg.decaySec ?? 2) * 1000) {
      this.angle = 0; this.decayed = true; this.lastAng = null;
      return true;
    }
    return false;
  }

  /** 回した角度(度。+ = 右)*/
  get degrees() { return (this.angle * 180) / Math.PI; }

  /** カーブの入力値 -1〜1(+ = 右)。deadDeg 未満はストレート、fullDeg で最大。exponent で弱 → 強の伸び方 */
  get value() {
    const C = this.cfg, deg = Math.abs(this.degrees), dead = C.deadDeg ?? 10, full = C.fullDeg ?? 240;
    if (deg < dead) return 0;
    const k = Math.min(1, (deg - dead) / Math.max(1, full - dead));
    return Math.sign(this.angle) * Math.pow(k, C.exponent ?? 0.8);
  }
}
