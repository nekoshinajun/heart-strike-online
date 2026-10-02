/**
 * 投球ジェスチャーの解析(Pokémon GO 型)。ハートを掴んでから離すまでの指の軌跡だけから、次の3つを一貫して求める:
 *
 *   リリース方向(dir)… 離す直前 releaseWindowMs の移動ベクトル(画面座標・正規化)。押した地点 → 離した地点では決めない
 *   投球の速さ(speed)… 同じ区間の速さ(画面の高さ / 秒)。端末の大きさに依らない
 *   回転(turnDeg / spin)… 軌跡全体の「進む向き」の累積の変化(+ = 時計回り)
 *        事前にハートを持ってグルグル回す(1周 = 360°)のも、→ ↑ ← と弧を描いて投げる(-180°)のも、同じ量として数える
 *        spin = 回転量 ÷ fullTurnDeg(既定 1080° = 3回転で最大)。それ以上は ±1 で止める。小さな揺れ(deadDeg 未満)はストレート
 *
 * 軌跡の点は時間順に add() する(点そのものは直近だけ保持。向きの区間は stepPx ごとに1つなので長く回しても軽い)。
 * 画面の座標系:x 右 / y 下。時計回り(画面上で右 → 下 → 左 → 上)= 向きの角度が増える = +
 */
export class GestureAnalyzer {
  constructor(cfg) { this.cfg = cfg; this.reset(null); }

  reset(p) {
    this.turn = 0;            // 累積回転(rad。+ = 時計回り)
    this.steps = [];          // 区間ごとの { h: 向き, d: 前の区間からの変化 }(リリース直前の「入りの角」を除くため)
    this.anchor = p;          // 向きを測る区間の始点(stepPx 進むごとに更新)
    this.heading = null;      // 直前の区間の向き(rad)
    this.recent = p ? [p] : [];   // 直近の点(リリース方向・速さ用)
    this.last = p;
    this.path = 0;            // 総移動量(px)
  }

  /** 指の点 { x, y, t(ms) } を追加 */
  add(p) {
    const C = this.cfg;
    if (!this.anchor) { this.reset(p); return; }
    if (this.last) this.path += Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = p;
    this.recent.push(p);
    const keep = (C.releaseWindowMs ?? 100) * 3;
    while (this.recent.length > 2 && p.t - this.recent[0].t > keep) this.recent.shift();
    // 向きの変化:stepPx 以上進んだら、その区間の向きを前の区間と比べる(指の細かな震えは数えない)
    const dx = p.x - this.anchor.x, dy = p.y - this.anchor.y;
    if (Math.hypot(dx, dy) < (C.stepPx ?? 7)) return;
    const h = Math.atan2(dy, dx);
    if (this.heading != null) {
      let d = h - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));   // -π〜π
      // 折り返し(ほぼ逆向き)は回転ではない(上下に振っただけ)→ 数えずに向きだけ更新
      if (Math.abs(d) <= ((C.maxStepDeg ?? 110) * Math.PI) / 180) { this.turn += d; this.steps.push({ h, d }); }
      else this.steps.push({ h, d: 0 });
    } else this.steps.push({ h, d: 0 });
    if (this.steps.length > 4000) this.steps.splice(0, 1000);
    this.heading = h;
    this.anchor = p;
  }

  /**
   * 投げる時の回転(rad):回していた向きと逆向きに曲がった「最後の弾きへの入り」は数えない
   *   例:時計回りに回す → 上へ弾く(入りの角は反時計回り)→ 入りの角を除く
   *       → ↑ ← の弧は同じ向きに曲がり続けるので全部数える
   */
  effectiveTurn() {
    const S = this.steps, n = S.length;
    if (n < 3) return this.turn;
    const tol = ((this.cfg.strokeTolDeg ?? 35) * Math.PI) / 180, hEnd = S[n - 1].h;
    const near = (h) => Math.abs(Math.atan2(Math.sin(h - hEnd), Math.cos(h - hEnd))) < tol;
    let s = n - 1;
    while (s > 0 && near(S[s - 1].h)) s--;      // 最後のまっすぐな弾き:S[s..n-1]
    if (s <= 0) return this.turn;
    let before = 0;
    for (let i = 0; i < s; i++) before += S[i].d;
    const sign = Math.sign(before);
    if (!sign) return this.turn;
    let corner = S[s].d * sign < 0 ? S[s].d : 0;
    for (let i = s - 1; i > 0 && S[i].d * sign < 0; i--) corner += S[i].d;   // 回していた向きと逆の入り
    return this.turn - corner;
  }

  /** 累積回転(度。+ = 時計回り)*/
  get turnDeg() { return (this.effectiveTurn() * 180) / Math.PI; }

  /** 回転 → カーブ入力 -1〜1(+ = 右)。0回転 = 0 / 1回転 ≈ 0.33 / 2回転 ≈ 0.67 / 3回転以上 = 1 */
  get spin() {
    const C = this.cfg, deg = Math.abs(this.turnDeg);
    if (deg < (C.deadDeg ?? 30)) return 0;
    return Math.sign(this.turnDeg) * Math.min(1, deg / (C.fullTurnDeg ?? 1080));
  }

  /**
   * 離した瞬間の解析。end = 離した点(add 済みでなくてもよい)/ viewH = 画面の高さ(px)
   * → { dir: {x, y}, speed(画面高さ/秒), velocity(px/ms), turnDeg, spin, path(px)}
   */
  release(end, viewH) {
    if (end && end !== this.last) this.add(end);
    const C = this.cfg, R = this.recent, e = this.last;
    const win = C.releaseWindowMs ?? 100;
    let ref = R[0];
    for (let i = R.length - 1; i >= 0; i--) { if (e.t - R[i].t > win) break; ref = R[i]; }
    if (ref === e && R.length > 1) ref = R[R.length - 2];
    const dt = Math.max(8, e.t - (ref?.t ?? e.t));
    const vx = ref ? (e.x - ref.x) / dt : 0, vy = ref ? (e.y - ref.y) / dt : 0;
    const v = Math.hypot(vx, vy);
    return {
      dir: v > 1e-6 ? { x: vx / v, y: vy / v } : { x: 0, y: 0 },
      velocity: { x: vx, y: vy },
      speed: (v * 1000) / Math.max(1, viewH),
      turnDeg: this.turnDeg,
      spin: this.spin,
      path: this.path,
      end: e,
    };
  }
}
