import { ATTRIBUTES, TYPES } from './GameData.js';
import { Config } from '../core/Config.js';

/**
 * 戦闘まわりの計算(差し替え可能な純関数)。
 *
 * HeartGain = BaseHeart × Attack × Attribute × Rally × Energy × Special × GateChain × BankShot × FEVER
 *   BaseHeart … 部位ごとの基本値 × 投球の強さ(POWER)
 *   Attack    … ATK / atkBase
 *   Attribute … 有利 1.3 / 通常 1.0 / 不利 0.7(ATTRIBUTE_MUL)
 */
export const BattleTuning = Config.battle;   // atkBase / defBase / attributeMul(★ 調整パネルから変更可)

export function attributeRelation(attacker, defender) {
  if (!attacker || !defender) return 'neutral';
  if (ATTRIBUTES[attacker]?.beats === defender) return 'advantage';
  if (ATTRIBUTES[defender]?.beats === attacker) return 'disadvantage';
  return 'neutral';
}

export function attributeMultiplier(attacker, defender) {
  return Config.battle.attributeMul[attributeRelation(attacker, defender)];
}

export function attackMultiplier(atk) {
  return atk / BattleTuning.atkBase;
}

/** HeartGain の倍率部分(BaseHeart 以外)をまとめて返す。内訳は演出・デバッグ用 */
export function heartMultiplier({ power, atk, attribute, bossAttribute, rally, energy, special, fever = 1, gate = 1, bank = 1 }) {
  // POWER:MinThrowPower で heartAtMin、100% で heartAtMax(引かずに投げると HEART は少ない)
  const P = Config.power, m = P.minThrowPower;
  const k = Math.min(1, Math.max(0, (power - m) / Math.max(1e-6, 1 - m)));
  const powerMul = P.heartAtMin + (P.heartAtMax - P.heartAtMin) * k;
  const attackMul = attackMultiplier(atk);
  const attrMul = attributeMultiplier(attribute, bossAttribute);
  // FEVER 倍率は既存の全倍率(POWER/ATK/属性/RALLY/Energy/SPECIAL)の最後に掛ける(LOVE SPOT は BossController 側)
  // 3D 空間ボーナス(GATE CHAIN / BANK SHOT)は FEVER の前に掛ける
  const total = powerMul * attackMul * attrMul * rally * energy * special * gate * bank * fever;
  return { total, powerMul, attackMul, attrMul, fever, gate, bank, relation: attributeRelation(attribute, bossAttribute) };
}

/** タイプ → 投球への補正(入力とは独立) */
export function throwModifiers(typeId) {
  const t = TYPES[typeId] ?? TYPES.STRAIGHT;
  return { speedMul: t.straightPowerMul, curveMul: t.curveMul };
}

/**
 * DefenseCalculator:キャッチ判定時のペナルティ。判定ごとの基本割合 × 返球の強さ × 防御補正。
 * 別の式に差し替える場合はこのオブジェクトの penalty を置き換える。
 */
export const DefenseCalculator = {
  get judgeRate() { return Config.judgeDamageRate; },   // PERFECT 0 / GREAT 小 / GOOD 中 / MISS 大
  defenseMul(def) {
    const T = BattleTuning;
    return Math.min(T.defMax, Math.max(T.defMin, T.defBase / Math.max(1, def)));
  },
  penalty(judge, returnPower, def) {
    return Math.round(returnPower * (this.judgeRate[judge] ?? 1) * this.defenseMul(def));
  },
};
