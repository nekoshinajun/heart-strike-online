import { DEFAULT_SPECIAL } from '../data/GameData.js';
import { Config } from '../core/Config.js';

/**
 * SPECIAL(必殺技)の効果。CharacterData.special.effectType で選ぶ(キャラごとの処理はここに足すだけ)
 *   どの効果も「SPECIAL が敵に命中して最終ダメージが確定した後」に BOSS_HIT から1回だけ呼ばれる
 *   (MISS・Heart Gate を通っただけ・Diamond を取っただけでは呼ばれない)
 *   apply(ctx) … ctx = { players, damage(この1投の最終ダメージ = 実際に増えた HEART), value(effectValue), preview(HP を変えずに結果だけ)}
 *              → 結果(演出・MULTI の同期に使う)。何も起きない時は null
 *   今後:防御(guard)・バフ(buff)・デバフ(debuff)・蘇生(revive)… を足せる
 */
export const SPECIAL_EFFECTS = {
  /** 通常の SPECIAL(ダメージ倍率 specialDamageMul は通常攻撃の式の後に BOSS_HIT で掛ける:BattleCalc.finalDamage)。追加の効果なし */
  attack: { apply: () => null },

  /**
   * 味方全員を回復(セラ:ANGEL HEART)。回復量 = 最終ダメージ × value(10%)を「味方それぞれ」に
   *   HP は各キャラの最大 HP で止める(余りは移さない)/ HP 0 の味方は回復しない(蘇生ではない)
   */
  healAll: {
    apply({ players, damage, value, preview = false }) {
      const amount = healAmount(damage, value);
      if (amount <= 0) return null;
      // preview:HP は変えずに結果だけ(MULTI はサーバーが HP を確定して全員へ配る)
      const target = preview ? players.map((p) => (p ? { hp: p.hp, maxHp: p.maxHp } : p)) : players;
      return { type: 'healAll', amount, healed: applyHealAll(target, amount), preview };
    },
  },
};

/** 回復量:最終ダメージ × 割合(四捨五入)。例 324 × 10% = 32 */
export const healAmount = (damage, rate) => Math.max(0, Math.round((Number(damage) || 0) * (Number(rate) || 0)));

/**
 * 生存している(HP 1 以上の)味方全員を amount ずつ回復(最大 HP で止める)→ [{ i, before, after, gained }]
 *   HP 0 の味方は対象外(蘇生は別の効果として足す)
 */
export function applyHealAll(players, amount) {
  const out = [];
  players.forEach((p, i) => {
    if (!p || !(p.hp > 0)) return;
    const before = p.hp, after = Math.min(p.maxHp ?? before, before + amount);
    p.hp = after;
    out.push({ i, before, after, gained: after - before });
  });
  return out;
}

/** キャラの SPECIAL(無ければ共通の SPECIAL HEART)*/
export const specialOf = (chara) => chara?.special ?? DEFAULT_SPECIAL;

/** SPECIAL の1投のダメージ倍率(CharacterData.special.damageMul。無ければ Config.special.heartMul)*/
export function specialDamageMul(chara) {
  const n = Number(specialOf(chara).damageMul);
  return Number.isFinite(n) && n > 0 ? n : Config.special.heartMul;
}

/** SPECIAL 命中後の効果を1回だけ適用 → 結果 or null */
export function applySpecialEffect(chara, ctx) {
  const sp = specialOf(chara);
  const fx = SPECIAL_EFFECTS[sp.effectType] ?? SPECIAL_EFFECTS.attack;
  return fx.apply({ ...ctx, value: sp.effectValue, special: sp }) ?? null;
}
