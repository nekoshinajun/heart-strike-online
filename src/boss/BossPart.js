import { Config } from '../core/Config.js';

/**
 * 部位の状態(旧:NORMAL / DAMAGED / BROKEN → ハートを届けるほど段階が上がる)
 *   NORMAL    : 0 〜 warmAt 未満
 *   WARM      : warmAt 以上(リアクションが大きくなる段階)
 *   HEART_MAX : 満タン = LOVE SPOT(専用表情・差分・ボーナス)
 */
export const PartState = Object.freeze({ NORMAL: 'NORMAL', WARM: 'WARM', HEART_MAX: 'HEART_MAX' });

/**
 * ボスの1部位の PartHeart(HeadHeart / ChestHeart ...)。見た目・当たり判定は持たない。
 */
export class BossPart {
  constructor(id, def) {
    this.id = id;
    this.label = def.label;
    this.ja = def.ja;
    this.heartGain = def.heartGain;   // 命中時に届く基本 HEART
    this.maxHeart = def.maxHeart;     // PartHeart 満タン値
    this.heart = 0;                   // PartHeart
    this.state = PartState.NORMAL;
    this.colliders = [];
  }

  get rate() { return this.heart / this.maxHeart; }
  get isMax() { return this.state === PartState.HEART_MAX; }

  /** @returns { before, after, changed } 状態遷移 */
  addHeart(amount) {
    const before = this.state;
    this.heart = Math.min(this.maxHeart, this.heart + amount);
    this.state = BossPart.stateFor(this.rate);
    return { before, after: this.state, changed: before !== this.state };
  }

  static stateFor(rate) {
    if (rate >= 1) return PartState.HEART_MAX;
    if (rate >= Config.partHeart.warmAt) return PartState.WARM;
    return PartState.NORMAL;
  }
}
