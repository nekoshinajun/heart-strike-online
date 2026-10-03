import { ATTRIBUTES } from './GameData.js';
import { Config } from '../core/Config.js';
import { statEffect, abilityMul, abilityStatMul, abilityPowerMul } from './Growth.js';

/**
 * 戦闘まわりの計算(差し替え可能な純関数)。
 *
 * 通常攻撃の与ダメージ(敵に届く HEART)= 次の4要素だけ:
 *   NormalDamage = ATK × アビリティ倍率 × ハートゲート通過倍率 × 着弾倍率
 *     ATK          … キャラの攻撃力(レベルで成長する値そのもの。ATK 120 → 基本値 120)
 *     アビリティ倍率 … POWER UP など(+10% ずつ足し算)× 条件つきの HEART アビリティ(GrowthData.ABILITIES)。レベルの ATK とは別枠
 *     ゲート倍率    … Heart Gate を通って命中した時の倍率(Config.space.gate.chainBonus)
 *     着弾倍率      … 敵の中央縦ラインからの横方向の距離だけで決まる(Config.landing:PERFECT 1.5 / GREAT 1.3 / GOOD 1.15 / HIT 1.0 / 当たらなければ 0)
 *   部位・球速・引っ張り量・カーブの有無・COMBO・SOLO/MULTI は与ダメージに使わない
 *
 * 属性相性(有利 1.3 / 通常 1.0 / 不利 0.7)・SPECIAL は通常攻撃の式の「後」に掛ける別枠(finalDamage)。FEVER はダメージを増やさない。SPECIAL 固有の効果(回復など)は
 * 最終ダメージが確定した後に effects/SpecialEffects.js が行う。丸めは最後に1回だけ(四捨五入)
 */

export function attributeRelation(attacker, defender) {
  if (!attacker || !defender) return 'neutral';
  if (ATTRIBUTES[attacker]?.beats === defender) return 'advantage';
  if (ATTRIBUTES[defender]?.beats === attacker) return 'disadvantage';
  return 'neutral';
}

/** 属性相性の倍率(4要素の後に掛ける別枠。Config.battle.attributeMul)*/
export function attributeMultiplier(attacker, defender) {
  return Config.battle.attributeMul[attributeRelation(attacker, defender)] ?? 1;
}

/** キャラ → 基礎ステータスの性能 × アビリティ加算の倍率(別枠)。key = defence | control | curve(attack は ATK をそのまま使う)*/
export function statPerformance(chara, key) {
  return statEffect(key, chara?.stats?.[key] ?? 50) * abilityStatMul(key, chara?.bonusStats?.[key] ?? 0);
}

/** 着弾判定:中央縦ラインからの横方向の距離 dx(敵の体の座標。Y は使わない)→ { grade, mul } */
export function landingGrade(dx) {
  const L = Config.landing, d = Math.abs(Number(dx) || 0);
  const t = L.grades.find((x) => d <= x.within) ?? L.grades[L.grades.length - 1];
  return { grade: t.id, mul: t.mul, dx: d };
}

/**
 * アビリティ倍率:POWER UP(+10% ずつ足し算)× 条件つきの HEART アビリティ(SPECIAL MASTER / GATE MASTER / ULTIMATE)
 *   ctx = { throwSpin, special, gates }(条件の判定だけに使う)
 */
export function abilityDamageMul(chara, ctx = {}) {
  const ab = chara?.abilities ?? [];
  return abilityPowerMul(ab) * abilityMul(ab, 'heart', ctx);
}

/** 通常攻撃の与ダメージ(丸める前)と内訳。atk = キャラの ATK(レベルの値)*/
export function normalDamage({ atk, ability = 1, gate = 1, landing = 1 }) {
  const a = Math.max(0, Number(atk) || 0);
  return { atk: a, ability, gate, landing, raw: a * ability * gate * landing };
}

/**
 * 最終ダメージ = 通常攻撃(丸める前)× 属性 × SPECIAL → 最後に1回だけ四捨五入
 *   属性 / SPECIAL は通常攻撃の式とは別枠(通常攻撃の内訳には入れない)
 */
export function finalDamage(normal, { attribute = 1, special = 1 } = {}) {
  // 1e-9 のずれ(1.1 + 0.1 = 1.2000000000000002 など)で四捨五入の向きが変わらないよう、小数第6位で揃えてから丸める
  return Math.round(Math.round(normal.raw * attribute * special * 1e6) / 1e6);
}

/**
 * キャラクター → 投球への補正(入力とは独立)
 *   curveMul     … CURVE ステータス(50 = ×1.0 / 100 = ×1.5)。カーブ(SPIN / PRE-SPIN)の量に掛かる
 *   controlError … CONTROL ステータス → 狙いの小さな誤差(units)。アビリティで軽減
 *   abilities    … 条件つきのアビリティ(カーブ / DRIVE)を投球の計算で見る
 */
export function throwModifiers(chara) {
  const ab = chara?.abilities ?? [];
  return { curveMul: statPerformance(chara, 'curve'), controlError: statPerformance(chara, 'control') * abilityMul(ab, 'control', {}, { onlyAlways: true }), abilities: ab };
}

/**
 * DefenseCalculator:キャッチ判定時のペナルティ。判定ごとの基本割合 × 返球の強さ × 防御補正。
 * 別の式に差し替える場合はこのオブジェクトの penalty を置き換える。
 */
export const DefenseCalculator = {
  get judgeRate() { return Config.judgeDamageRate; },   // PERFECT 0 / GREAT 小 / GOOD 中 / MISS 大
  /** DEFENCE(レベルの基礎)→ 被ダメージ倍率(50 = ×1.0 / 100 = ×0.75 / 125 = ×0.625)× アビリティの DEF 加算の倍率(別枠:+20 = ×0.90)*/
  defenseMul(defence, bonus = 0) { return statEffect('defence', defence ?? 50) * abilityStatMul('defence', bonus); },
  /** chara:キャラ(stats.defence / アビリティの guard)。PERFECT は judgeRate 0 なので常に 0 */
  penalty(judge, returnPower, chara) {
    const guard = abilityMul(chara?.abilities, 'guard', { judge });
    return Math.round(returnPower * (this.judgeRate[judge] ?? 1) * this.defenseMul(chara?.stats?.defence, chara?.bonusStats?.defence ?? 0) * guard);
  },
};
