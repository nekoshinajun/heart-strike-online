import * as THREE from '../lib/three.js';
import { Config, bossProfile, returnTier } from '../core/Config.js';
import { fitMotion } from './AttackMotion.js';

/**
 * ボスの返球計画。攻撃モーションに依存せず「どこへ・どの速さで・どう飛ばすか」だけを決める。
 *
 *  - Catch Position:CatchableArea(画面比)内からランダム。直前地点に近すぎる場合は再抽選(ON/OFF可)
 *  - ボス性能(bossProfiles):returnSpeed / returnPower / returnAccuracy / catchAreaSize / randomness / attackStyle
 *  - 攻撃の球種(Config.enemyAttacks → AttackMotion):STRAIGHT / CURVE / SPEED_CHANGE / LATE_CURVE / FEINT。難易度と敵の個性で抽選
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
    this.forceAttack = null;         // テスト / デバッグ用:攻撃 ID を固定
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
   * ★ の攻撃パターンを1つ選ぶ(ボスの defence.levels → Config.defence.levels。★5 以降は ★5 のまま)
   *   → { id, notes: [{ type, hold?, dir? }], interval }
   */
  pickSequence(level, prof = bossProfile()) {
    const D = Config.defence, lv = Math.max(1, Math.min(D.maxLevel ?? 5, Math.floor(level) || 1));
    const list = prof.defence?.levels?.[lv] ?? D.levels[lv] ?? D.levels[1];
    if (this.forceSequence) return norm(this.forceSequence);
    const tw = list.reduce((a, x) => a + (x.weight ?? 1), 0);
    let r = this.random() * tw, pick = list[list.length - 1];
    for (const x of list) { r -= x.weight ?? 1; if (r <= 0) { pick = x; break; } }
    return norm(pick);
    function norm(x) {
      const notes = (x.notes ?? ['NORMAL']).map((n) => (typeof n === 'string' ? { type: n } : { ...n }));
      for (const n of notes) if (n.type === 'HOLD') n.hold ??= D.hold.sec;
      return { id: x.id ?? notes.map((n) => n.type[0]).join(''), notes, interval: x.interval ?? 0.8 };
    }
  }

  /**
   * 返球計画を作る
   * @returns { screenN, world, lateEnd, spawn, chargeTime, duration, markerLead, ctrlOffset, power }
   */
  plan(rally, forcedScreenN = null, forcedSeed = null, level = 1) {
    const oldRandom = this.random;
    if (forcedSeed != null) {
      let x = (Number(forcedSeed) || 1) >>> 0;
      this.random = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
    }
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

    // 攻撃の球種:難易度の weight × 敵の個性で抽選 → 左右 → 動き(MULTI は共有 seed の乱数なので全員同じ)
    const difficulty = Config.runtime?.difficulty ?? 'NORMAL';
    // DEFENCE:★(ボスの攻撃回数)ごとの攻撃パターン(NORMAL / HOLD / FLICK / MULTI)。ハートの軌道は STRAIGHT / CURVE だけ(タイミングは変えない)
    const seq = this.pickSequence(level, prof);
    const pathOf = () => (level >= 2 && this.random() < (Config.defence.curveChance ?? 0.3) ? 'CURVE' : 'STRAIGHT');
    const forcedPath = this.forceAttack && Config.enemyAttacks.patterns[this.forceAttack] ? this.forceAttack : null;
    const pathId = forcedPath ?? pathOf();
    const picked = { id: pathId, def: Config.enemyAttacks.patterns[pathId] };
    const side = this.random() < 0.5 ? -1 : 1;
    // 画面からはみ出す曲がり方は逆側へ / 小さく(最後まで見えてキャッチできる。乱数は使わないので MULTI でも全員同じ)
    const spawn = this.boss.spawnPoint();
    //   判定は「基準の姿勢」のカメラ・ボスで行う(端末ごとのカメラの寄り / ボスの揺れのタイミングで結果が変わらない)
    const restCam = this.player.cam.restCamera();
    const restTo = this.player.screenToWorld(sx, sy, depth, new THREE.Vector3(), restCam);
    const motion = fitMotion(picked.def, { duration, side, from: this.boss.restSpawnPoint(), to: restTo, toScreen: (p) => this.player.toScreen(p, restCam), viewport: this.viewport, margin: Config.enemyAttacks.screenMargin ?? 0.04 });
    const attack = { id: picked.id, type: picked.def.type, label: picked.def.label ?? picked.id, side: motion.side, tell: picked.def.tell ?? null, difficulty, level, pattern: seq.id, kinds: seq.notes.map((n) => n.type) };
    const ctrlOffset = null;

    let plan = {
      screenN, world: landWorld, markerWorld: world, lateEnd,
      spawn,
      chargeTime: R.chargeTime / Math.sqrt(speedMul),
      duration: motion.total,   // 到達までの秒(フェイントで止まる分も含む)
      markerLead: Math.min(R.markerLead / Math.sqrt(speedMul), motion.total * 0.9),
      ctrlOffset,
      attack, motion,
      power: prof.returnPower,
      speedMul,
    };
    // ハート1個ずつの計画(1個目 = 上の計画。2個目以降は位置・左右・軌道を同じ乱数で決める → MULTI でも全員同じ)
    plan.notes = seq.notes.map((n, k) => {
      if (k === 0) return { ...n, screenN, world: landWorld, markerWorld: world, lateEnd, motion, duration: motion.total, markerLead: plan.markerLead, attack };
      const sn = this.pickPosition();
      const nx = sn.x * w, ny = sn.y * h;
      const nWorld = this.player.screenToWorld(nx, ny, depth);
      const nLate = this.player.screenToWorld(nx, ny, depth * R.lateDepthScale);
      const pid = pathOf(), nside = this.random() < 0.5 ? -1 : 1;
      const dur = Math.max(0.4, seq.interval ?? 0.8);
      const nRest = this.player.screenToWorld(nx, ny, depth, new THREE.Vector3(), restCam);
      const m = fitMotion(Config.enemyAttacks.patterns[pid], { duration: dur, side: nside, from: this.boss.restSpawnPoint(), to: nRest, toScreen: (p) => this.player.toScreen(p, restCam), viewport: this.viewport, margin: Config.enemyAttacks.screenMargin ?? 0.04 });
      return { ...n, screenN: sn, world: nWorld, markerWorld: nWorld, lateEnd: nLate, motion: m, duration: m.total, markerLead: Math.min(R.markerLead, m.total * 0.9), attack: { ...attack, id: pid, side: m.side } };
    });
    // FLICK の方向('random' は同じ乱数で決める)
    for (const n of plan.notes) if (n.type === 'FLICK' && (!n.dir || n.dir === 'random')) n.dir = ['L', 'R', 'U', 'D'][Math.floor(this.random() * 4) % 4];
    for (const m of this.modifiers) plan = m(plan, { rally, profile: prof }) ?? plan;
    this.random=oldRandom;
    return plan;
  }
}
