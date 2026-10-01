import { ATTRIBUTES, TYPES } from './GameData.js';
import { Config } from '../core/Config.js';
import { statEffect, abilityMul } from './Growth.js';

/**
 * 戦闘まわりの計算(差し替え可能な純関数)。
 *
 * HeartGain = BaseHeart × Attack × Attribute × Rally × Energy × Special × GateChain × BankShot × FEVER
 *   BaseHeart … 部位ごとの基本値(球速・引っ張り量では変わらない)
 *   Attack    … キャラの ATTACK(0〜100)→ GrowthData.STAT_EFFECTS.attack(50 = ×1.0 / 100 = ×1.25)
 *   Ability   … アビリティの HEART 倍率(条件つき。GrowthData.ABILITIES)
 *   Attribute … 有利 1.3 / 通常 1.0 / 不利 0.7(ATTRIBUTE_MUL)
 */
export const BattleTuning = Config.battle;   // attributeMul(★ 調整パネルから変更可)

export function attributeRelation(attacker, defender) {
  if (!attacker || !defender) return 'neutral';
  if (ATTRIBUTES[attacker]?.beats === defender) return 'advantage';
  if (ATTRIBUTES[defender]?.beats === attacker) return 'disadvantage';
  return 'neutral';
}

export function attributeMultiplier(attacker, defender) {
  return Config.battle.attributeMul[attributeRelation(attacker, defender)];
}

/** ATTACK(0〜100)→ 与ダメージ倍率 */
export function attackMultiplier(attack) {
  return statEffect('attack', attack ?? 50);
}

/** HeartGain の倍率部分(BaseHeart 以外)をまとめて返す。内訳は演出・デバッグ用 */
export function heartMultiplier({ attack, attribute, bossAttribute, rally, energy, special, fever = 1, gate = 1, bank = 1, ability = 1 }) {
  // 球速(引っ張り量 / POWER / 初速)では HEART を変えない:速い球も遅い球も同じ(Config.power.heartFlat)
  const powerMul = Config.power.heartFlat ?? 1;
  const attackMul = attackMultiplier(attack);
  const attrMul = attributeMultiplier(attribute, bossAttribute);
  // FEVER 倍率は既存の全倍率(POWER/ATK/属性/RALLY/Energy/SPECIAL)の最後に掛ける(LOVE SPOT は BossController 側)
  // 3D 空間ボーナス(GATE CHAIN / BANK SHOT)は FEVER の前に掛ける
  const total = powerMul * attackMul * attrMul * rally * energy * special * gate * bank * fever * ability;
  return { total, powerMul, attackMul, attrMul, fever, gate, bank, ability, relation: attributeRelation(attribute, bossAttribute) };
}

/**
 * キャラクター → 投球への補正(入力とは独立)
 *   speedMul     … タイプ(STRAIGHT / CURVE)の球速の傾向
 *   curveMul     … CURVE ステータス(50 = ×1.0 / 100 = ×1.5)。カーブ(SPIN / PRE-SPIN)の量に掛かる
 *   controlError … CONTROL ステータス → 狙いの小さな誤差(units)。アビリティで軽減
 *   abilities    … 条件つきのアビリティ(カーブ / DRIVE)を投球の計算で見る
 */
export function throwModifiers(chara) {
  const t = TYPES[chara?.type] ?? TYPES.STRAIGHT;
  const st = chara?.stats ?? {};
  const ab = chara?.abilities ?? [];
  return { speedMul: t.straightPowerMul, curveMul: statEffect('curve', st.curve ?? 50), controlError: statEffect('control', st.control ?? 50) * abilityMul(ab, 'control', {}, { onlyAlways: true }), abilities: ab };
}

/**
 * DefenseCalculator:キャッチ判定時のペナルティ。判定ごとの基本割合 × 返球の強さ × 防御補正。
 * 別の式に差し替える場合はこのオブジェクトの penalty を置き換える。
 */
export const DefenseCalculator = {
  get judgeRate() { return Config.judgeDamageRate; },   // PERFECT 0 / GREAT 小 / GOOD 中 / MISS 大
  /** DEFENCE(0〜100)→ 被ダメージ倍率(50 = ×1.0 / 100 = ×0.75)*/
  defenseMul(defence) { return statEffect('defence', defence ?? 50); },
  /** chara:キャラ(stats.defence / アビリティの guard)。PERFECT は judgeRate 0 なので常に 0 */
  penalty(judge, returnPower, chara) {
    const guard = abilityMul(chara?.abilities, 'guard', { judge });
    return Math.round(returnPower * (this.judgeRate[judge] ?? 1) * this.defenseMul(chara?.stats?.defence) * guard);
  },
};
