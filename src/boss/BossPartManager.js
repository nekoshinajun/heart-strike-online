import { Config } from '../core/Config.js';
import { BossPart, PartState } from './BossPart.js';

/**
 * 全部位の PartHeart を管理。TotalHeart(ボス全体)とは独立。
 * 状態が変わると onStateChange(part, before, after) を通知 → 見た目(View)が差分・リアクションを切り替える。
 */
export class BossPartManager {
  constructor() {
    this.parts = {};
    for (const [id, def] of Object.entries(Config.parts)) this.parts[id] = new BossPart(id, def);
    this.onStateChange = null;
  }

  get(id) { return this.parts[id]; }
  get list() { return Object.values(this.parts); }
  get maxCount() { return this.list.filter((p) => p.isMax).length; }   // LOVE SPOT 数
  get allMax() { return this.list.every((p) => p.isMax); }

  /**
   * 命中:届いた HEART から PartHeartGain を算出して加算
   * @returns { part, partGain, before, after, changed }
   */
  addHeart(id, heartGain) {
    const part = this.parts[id];
    if (!part) return null;
    const partGain = part.isMax ? 0 : Math.max(1, Math.round(heartGain * Config.partHeart.partGainRate));
    const r = part.addHeart(partGain);
    if (r.changed) this.onStateChange?.(part, r.before, r.after);
    return { part, partGain, ...r };
  }
}
