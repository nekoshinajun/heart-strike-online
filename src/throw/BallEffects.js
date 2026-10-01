import { Config } from '../core/Config.js';

/**
 * 球質(BallEffect)の定義と合成。投球の入力はそれぞれ独立に持ち、投げた瞬間にここで合成する
 *   POWER / AIM      … CurveThrowCalculator(初速・狙い点)
 *   通常 SPIN        … 投球ジェスチャーの切り返し(CurveThrowCalculator.analyzeCurve)
 *   BallEffect       … 投球前に仕込んだ球質(PRE-SPIN / DRIVE …)。下の BALL_EFFECTS に1件ずつ
 *   キャラクター性能 … CurveThrowCalculator.mods(タイプの curveMul 等)。合成後の SPIN に掛かる
 *
 * 球種を増やす時(TOP SPIN / BACK SPIN / 特殊球 / キャラ固有球種 / 装備の SPIN 補正 …)は
 * BALL_EFFECTS に type を1つ足すだけでよい(キャラ ID で分岐しない)。
 *   label(e)                 … 成立時・デバッグの表示名
 *   spin(spin, e, ctx)       … 投球の SPIN → 合成後の SPIN
 *   flight(spec, e, ctx)     … 飛行への追加効果(spec.driveSink など)
 * ctx … 効きの倍率 { preSpinScale, driveScale }(投球ルート × 引っ張り量。CurveThrowCalculator が決める)
 * effect の形:{ type, strength(0〜1), dir?(±1), source?('input' | 'equipment' | …) }
 */
export const BALL_EFFECTS = {
  preSpin: {
    label: (e) => (e.dir > 0 ? 'RIGHT SPIN' : 'LEFT SPIN'),
    spin(spin, e, ctx) {
      const C = Config.preSpin, k = clamp01(e.strength) * (ctx?.preSpinScale ?? 1);
      if (spin === 0) return e.dir * (C.baseSpin ?? 0) * k;                 // ストレートに投げても回転の名残で少しだけ曲がる
      const same = Math.sign(spin) === e.dir;
      const mul = Math.max(0.15, 1 + ((same ? C.sameDirMul : C.oppositeDirMul) - 1) * k);  // 同じ向き ×1.5 / 逆向き ×0.7(strength 1・効き 1 の時)
      return spin * mul;                                                    // 曲がる向きは投球の SPIN のまま
    },
  },
  drive: {
    label: () => 'DRIVE',
    flight(spec, e, ctx) { spec.driveSink += Config.drive.sink * clamp01(e.strength) * (ctx?.driveScale ?? 1); },
  },
};

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** 仕込んだ球質の一覧(順不同)→ 合成結果 */
export function applyBallEffects(effects, throwSpin, ctx = {}) {
  let spin = throwSpin;
  const spec = { driveSink: 0 };
  for (const e of effects ?? []) {
    const def = BALL_EFFECTS[e?.type];
    if (!def) continue;
    if (def.spin) spin = def.spin(spin, e, ctx);
    if (def.flight) def.flight(spec, e, ctx);
  }
  return { spin, ...spec };
}

export const effectLabel = (e) => BALL_EFFECTS[e?.type]?.label?.(e) ?? '';

/**
 * 投球ルート × 引っ張り量 → 球質の効き(ダメージには関係しない)
 *   pull … 下へ引いた量 0〜1(浅い = 遅い・曲がりやすい / 深い = 速い・まっすぐ)
 *   → { curveScale, preSpinScale, driveScale }
 */
export function throwFeel(routeId, pull) {
  const R = Config.throwRoute.routes[routeId] ?? Config.throwRoute.routes[Config.throwRoute.default] ?? { curveMul: 1, preSpinMul: 1, driveMul: 1 };
  const P = Config.pull, k = clamp01(pull);
  const lerp = (a, b) => a + (b - a) * k;
  return {
    route: routeId,
    curveScale: R.curveMul * lerp(P.curveAtMin, P.curveAtMax),
    preSpinScale: R.preSpinMul * lerp(P.preSpinAtMin, P.preSpinAtMax),
    driveScale: R.driveMul * lerp(P.driveAtMin, P.driveAtMax),
  };
}
