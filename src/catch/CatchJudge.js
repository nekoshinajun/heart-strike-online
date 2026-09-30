import { Config, catchWin } from '../core/Config.js';

export const Judge = Object.freeze({ PERFECT: 'PERFECT', GREAT: 'GREAT', GOOD: 'GOOD', MISS: 'MISS' });
const ORDER = [Judge.PERFECT, Judge.GREAT, Judge.GOOD, Judge.MISS];

/**
 * キャッチ判定:位置 + タイミング。
 *  - タイミング:ボール到達時刻との差(秒)→ 0:PERFECT 1:GREAT 2:GOOD 3:MISS
 *  - 位置:タップ位置と到達地点(Catch Marker)の距離(画面短辺比)→ 同じく 0〜3
 *  - 最終判定 = 悪い方(どちらかが大きくズレれば MISS、少しズレれば GREAT)
 */
export class CatchJudge {
  constructor() { this.reset(); }

  reset() { this.active = false; this.result = null; this.detail = null; }

  begin(arrival, markerLead) {
    this.active = true;
    this.arrival = arrival;
    this.markerLead = markerLead;
    this.result = null;
    this.detail = null;
  }

  get ringStart() { return this.arrival - this.markerLead; }
  get lateLimit() { return this.arrival + catchWin('goodTime'); }

  static timeGrade(dt) {
    const a = Math.abs(dt);   // 難易度の catchWindow を反映
    return a <= catchWin('perfectTime') ? 0 : a <= catchWin('greatTime') ? 1 : a <= catchWin('goodTime') ? 2 : 3;
  }
  static posGrade(distN) {
    return distN <= catchWin('perfectRadius') ? 0 : distN <= catchWin('greatRadius') ? 1 : distN <= catchWin('goodRadius') ? 2 : 3;
  }

  /**
   * @param now ゲーム時間 / @param tap {x,y}(px) / @param target {x,y}(px) / @param short 画面短辺(px)
   * リングが縮み始める前の入力は無視(null)。
   */
  input(now, tap, target, short) {
    if (!this.active || this.result) return null;
    if (now < this.ringStart - 0.05) return null;
    const dt = now - this.arrival;
    const distN = tap && target ? Math.hypot(tap.x - target.x, tap.y - target.y) / short : 1;
    const tg = CatchJudge.timeGrade(dt);
    const pg = CatchJudge.posGrade(distN);
    this.result = ORDER[Math.max(tg, pg)];
    this.detail = { dt, distN, timeGrade: tg, posGrade: pg };
    return this.result;
  }

  /** 入力が無いまま遅れ許容を超えたら MISS */
  checkTimeout(now) {
    if (this.active && !this.result && now > this.lateLimit) {
      this.result = Judge.MISS;
      this.detail = { dt: now - this.arrival, distN: null, timeGrade: 3, posGrade: null, timeout: true };
      return Judge.MISS;
    }
    return null;
  }

  /** 1(リング開始)→ 0(到達) */
  ringProgress(now) { return (this.arrival - now) / this.markerLead; }

  /** 判定理由の短い説明(UI用) */
  describe() {
    const d = this.detail;
    if (!d) return '';
    if (d.timeout) return 'タップなし';
    const parts = [];
    if (d.timeGrade > 0) parts.push(d.dt < 0 ? '早い' : '遅い');
    if (d.posGrade > 0) parts.push('位置ズレ');
    return parts.join('・');
  }
}
