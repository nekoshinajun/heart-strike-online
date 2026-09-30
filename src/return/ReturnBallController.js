import * as THREE from '../lib/three.js';
import { Config, bossProfile, returnTier } from '../core/Config.js';

/**
 * ボスの返球計画。攻撃モーションに依存せず「どこへ・どの速さで・どう飛ばすか」だけを決める。
 *
 *  - Catch Position:CatchableArea(画面比)内からランダム。直前地点に近すぎる場合は再抽選(ON/OFF可)
 *  - ボス性能(bossProfiles):returnSpeed / returnPower / returnAccuracy / catchAreaSize / randomness / curveChance
 *  - RALLY による高速化(returnTiers)
 *  - modifiers:将来の拡張フック(フェイント・途中加速・マーカー表示時間短縮・範囲拡大 など)
 *      modifier(plan, ctx) => plan を配列に追加するだけで返球の性質を変えられる
 */
export class ReturnBallController {
  constructor(player, boss, viewport) {
    this.player = player;
    this.boss = boss;
    this.viewport = viewport;
    this.previousCatchPosition = null; // 画面比 {x,y}
    this.gridIndex = 0;
    this.modifiers = [];
    this.random = Math.random;       // テスト時は差し替え可能
  }

  reset() { this.previousCatchPosition = null; this.gridIndex = 0; }

  /** CatchableArea(ボス性能の catchAreaSize で中心から拡縮) */
  area() {
    const a = Config.returnBall.catchArea;
    const k = bossProfile().catchAreaSize;
    const cx = (a.xMin + a.xMax) / 2, cy = (a.yMin + a.yMax) / 2;
    const hw = ((a.xMax - a.xMin) / 2) * k, hh = ((a.yMax - a.yMin) / 2) * k;
    const clamp = (v) => THREE.MathUtils.clamp(v, 0.04, 0.96);
    return { xMin: clamp(cx - hw), xMax: clamp(cx + hw), yMin: clamp(cy - hh), yMax: clamp(cy + hh) };
  }

  /** 画面比の返球地点を決める */
  pickPosition() {
    const R = Config.returnBall;
    const oldRandom=this.random;
    if(forcedSeed!=null){let x=(Number(forcedSeed)||1)>>>0;this.random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
    const prof = bossProfile();
    const A = this.area();
    const { w, h } = this.viewport;
    const short = Math.min(w, h);
    const sample = () => {
      if (this.random() < prof.randomness) {
        return { x: A.xMin + this.random() * (A.xMax - A.xMin), y: A.yMin + this.random() * (A.yMax - A.yMin) };
      }
      // 3x3 グリッドを順に巡回(ランダム性の低いボス用)
      const order = [4, 0, 8, 2, 6, 1, 7, 3, 5];
      const cell = order[this.gridIndex++ % 9];
      return { x: A.xMin + ((cell % 3) + 0.5) / 3 * (A.xMax - A.xMin), y: A.yMin + (Math.floor(cell / 3) + 0.5) / 3 * (A.yMax - A.yMin) };
    };
    let p = sample();
    if (R.avoidRepeat && this.previousCatchPosition) {
      for (let i = 0; i < 12; i++) {
        const q = this.previousCatchPosition;
        const d = Math.hypot((p.x - q.x) * w, (p.y - q.y) * h) / short;
        if (d >= R.minRepeatDistance) break;
        p = sample();
      }
    }
    this.previousCatchPosition = p;
    return p;
  }

  /**
   * 返球計画を作る
   * @returns { screenN, world, lateEnd, spawn, chargeTime, duration, markerLead, ctrlOffset, power }
   */
  plan(rally, forcedScreenN = null, forcedSeed = null) {
    const R = Config.returnBall;
    const prof = bossProfile();
    const { w, h } = this.viewport;
    const speedMul = prof.returnSpeed * returnTier(rally).speed * (Config.runtime?.returnSpeed ?? 1);   // 難易度の返球速度
    const duration = R.baseDuration / speedMul;

    const screenN = forcedScreenN ? { x: forcedScreenN.x, y: forcedScreenN.y } : this.pickPosition();
    this.previousCatchPosition = screenN;
    const sx = screenN.x * w, sy = screenN.y * h;
    const depth = Config.ball.catchDepth;
    const world = this.player.screenToWorld(sx, sy, depth);
    const lateEnd = this.player.screenToWorld(sx, sy, depth * R.lateDepthScale);

    // 精度:1未満なら実際の着弾がマーカーから少しずれる(読みにくいボス)
    let landWorld = world;
    if (prof.returnAccuracy < 1) {
      const off = (1 - prof.returnAccuracy) * 0.15 * Math.min(w, h);
      const a = this.random() * Math.PI * 2;
      landWorld = this.player.screenToWorld(sx + Math.cos(a) * off, sy + Math.sin(a) * off, depth);
    }

    // カーブ返球:ベジェ制御点を横へずらす(着弾点は変わらない)
    let ctrlOffset = null;
    if (this.random() < prof.curveChance) {
      const side = this.random() < 0.5 ? -1 : 1;
      ctrlOffset = new THREE.Vector3(side * (3 + this.random() * 3), 0, 0);
    }

    let plan = {
      screenN, world: landWorld, markerWorld: world, lateEnd,
      spawn: this.boss.spawnPoint(),
      chargeTime: R.chargeTime / Math.sqrt(speedMul),
      duration,
      markerLead: Math.min(R.markerLead / Math.sqrt(speedMul), duration * 0.9),
      ctrlOffset,
      power: prof.returnPower,
      speedMul,
    };
    for (const m of this.modifiers) plan = m(plan, { rally, profile: prof }) ?? plan;
    this.random=oldRandom;
    return plan;
  }
}
