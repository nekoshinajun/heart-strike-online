// 育成の計算(純関数だけ。保存・画面は PlayerProgress / 各画面が持つ)。数値は GrowthData
import {
  AFFECTION, BATTLE_EXP, STAMINA, STAT_KEYS, STAT_MAX, CHARACTER_GROWTH, GROWTH_DEFAULT, GROWTH_EXPONENT, STAT_EFFECTS,
  ABILITIES, ABILITY_SLOTS, CHARACTER_ABILITY_SLOTS, ULTIMATES, ULTIMATE_LEVEL,
} from './GrowthData.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------- 親密度 Lv / EXP ----------------
/** Lv → その Lv に到達する累計 EXP(テーブル。目安の点の間は直線)*/
const TABLE = (() => {
  const pts = Object.entries(AFFECTION.expAnchors).map(([lv, e]) => [Number(lv), Number(e)]).sort((a, b) => a[0] - b[0]);
  const t = [0, 0];
  for (let lv = 2; lv <= AFFECTION.maxLevel; lv++) {
    const hi = pts.find(([l]) => l >= lv) ?? pts[pts.length - 1];
    const lo = [...pts].reverse().find(([l]) => l <= lv) ?? pts[0];
    t[lv] = hi[0] === lo[0] ? lo[1] : Math.round(lo[1] + ((hi[1] - lo[1]) * (lv - lo[0])) / (hi[0] - lo[0]));
  }
  return t;
})();
export const expForLevel = (lv) => TABLE[clamp(Math.floor(lv), 1, AFFECTION.maxLevel)];
export const maxAffectionExp = () => TABLE[AFFECTION.maxLevel];
export function levelFromExp(total) {
  const e = clamp(Math.floor(Number(total) || 0), 0, maxAffectionExp());
  let lv = 1;
  while (lv < AFFECTION.maxLevel && e >= TABLE[lv + 1]) lv++;
  return lv;
}
/** 累計 EXP → { level, into(今の Lv に入ってから), need(次の Lv までの幅。MAX は 0), total, max } */
export function affectionProgress(total) {
  const e = clamp(Math.floor(Number(total) || 0), 0, maxAffectionExp());
  const level = levelFromExp(e);
  const max = level >= AFFECTION.maxLevel;
  return { level, total: e, into: max ? 0 : e - TABLE[level], need: max ? 0 : TABLE[level + 1] - TABLE[level], max };
}

// ---------------- ステータス ----------------
/** Lv のステータス(成長幅をキャラデータから。アビリティの stat 加算込み・上限 STAT_MAX)*/
export function statsAt(charId, level, abilities = []) {
  const g = CHARACTER_GROWTH[charId] ?? GROWTH_DEFAULT;
  const u = Math.pow((clamp(level, 1, AFFECTION.maxLevel) - 1) / (AFFECTION.maxLevel - 1), GROWTH_EXPONENT);
  const out = {};
  for (const k of STAT_KEYS) {
    const [a, b] = g[k] ?? GROWTH_DEFAULT[k];
    let v = a + (b - a) * u;
    for (const ab of abilities) for (const e of ab.effects ?? []) if (e.kind === 'stat' && e.stat === k) v += e.add;
    out[k] = Math.round(clamp(v, 0, STAT_MAX));
  }
  return out;
}
/** Lv のバトルの最大 HP(キャラごと・Lv で伸びる。ランクが高いほど高いのが基本)*/
export const HP_MAX = 200;   // 表示(五角形)の最大
export function hpAt(charId, level) {
  const [a, b] = (CHARACTER_GROWTH[charId] ?? GROWTH_DEFAULT).hp ?? GROWTH_DEFAULT.hp;
  const u = Math.pow((clamp(level, 1, AFFECTION.maxLevel) - 1) / (AFFECTION.maxLevel - 1), GROWTH_EXPONENT);
  return Math.round(a + (b - a) * u);
}
/** ステータス → 性能(STAT_EFFECTS の 0 / 50 / 100 を直線でつなぐ。100 を超えた分は伸ばさない)*/
export function statEffect(key, value) {
  const [a, m, b] = STAT_EFFECTS[key];
  const v = clamp(Number(value) || 0, 0, 100);
  return v <= 50 ? a + ((m - a) * v) / 50 : m + ((b - m) * (v - 50)) / 50;
}

// ---------------- アビリティ ----------------
/** そのキャラの Lv10〜90 の候補 { 10: [id, …], … } */
export function abilitySlots(charId) {
  return { ...ABILITY_SLOTS, ...(CHARACTER_ABILITY_SLOTS[charId] ?? {}) };
}
export const abilityById = (id) => (ABILITIES[id] ? { id, ...ABILITIES[id] } : null);
export const ultimateFor = (charId) => abilityById(ULTIMATES[charId]);
/** 有効なアビリティ:到達した Lv の枠で選んだもの + Lv100 の ULTIMATE */
export function activeAbilities(charId, level, selected = {}) {
  const slots = abilitySlots(charId), out = [];
  for (const [lv, ids] of Object.entries(slots)) {
    const pick = selected?.[lv];
    if (level >= Number(lv) && pick && ids.includes(pick)) { const a = abilityById(pick); if (a) out.push({ ...a, slot: Number(lv) }); }
  }
  if (level >= ULTIMATE_LEVEL) { const u = ultimateFor(charId); if (u) out.push({ ...u, slot: ULTIMATE_LEVEL }); }
  return out;
}
/** 条件(when)を満たすか。ctx = { pull, throwSpin, effects, special, fever, energy, judge } */
export function abilityCondition(when, ctx = {}) {
  if (!when) return true;
  const fx = ctx.effects ?? [];
  if (when.pullMin != null && !((ctx.pull ?? 0) >= when.pullMin)) return false;
  if (when.pullMax != null && !((ctx.pull ?? 1) <= when.pullMax)) return false;
  if (when.noSpin && (ctx.throwSpin ?? 0) !== 0) return false;
  if (when.spin && !(ctx.throwSpin ?? 0)) return false;
  if (when.preSpin && !fx.some((e) => e.type === 'preSpin')) return false;
  if (when.drive && !fx.some((e) => e.type === 'drive')) return false;
  if (when.special && !ctx.special) return false;
  if (when.fever && !ctx.fever) return false;
  if (when.energyMin != null && !((ctx.energy ?? 0) >= when.energyMin)) return false;
  if (when.judge && ctx.judge !== when.judge) return false;
  return true;
}
/**
 * 種類(heart / curve / drive / control / guard)の倍率の積
 *   onlyAlways … 条件なしの効果だけ / onlyWhen … 条件つきの効果だけ(CONTROL:常時はキャラの性能、条件つきは投球ごとに掛ける)
 */
export function abilityMul(abilities, kind, ctx = {}, { onlyAlways = false, onlyWhen = false } = {}) {
  let m = 1;
  for (const a of abilities ?? []) for (const e of a.effects ?? []) if (e.kind === kind && (!onlyAlways || !e.when) && (!onlyWhen || e.when) && abilityCondition(e.when, ctx)) m *= e.mul;
  return m;
}

// ---------------- STAMINA ----------------
/** 自然回復:最後に更新した時刻からの経過で回復(端数の時間は次回へ持ち越す)。上限 STAMINA.max */
export function recoverStamina(stamina, last, now = Date.now()) {
  const R = STAMINA.recover, step = R.everyMinutes * 60 * 1000;
  const s = clamp(Number(stamina) || 0, 0, STAMINA.max);
  const t0 = Number.isFinite(last) ? last : now;
  if (s >= STAMINA.max) return { stamina: STAMINA.max, last: now };
  if (now <= t0) return { stamina: s, last: t0 };   // 時計が戻った時は回復しない
  const ticks = Math.floor((now - t0) / step);
  const v = Math.min(STAMINA.max, s + ticks * R.amount);
  return { stamina: v, last: v >= STAMINA.max ? now : t0 + ticks * step };
}
/** 次に回復するまでの ms(満タンなら null)*/
export function staminaNextMs(stamina, last, now = Date.now()) {
  if (stamina >= STAMINA.max) return null;
  const step = STAMINA.recover.everyMinutes * 60 * 1000;
  return Math.max(0, step - ((now - last) % step));
}

// ---------------- 攻略の結果 ----------------
/** result: 'clear' | 'defeat' → { exp(STAMINA を見る前), cost } */
export function battleReward(result, difficulty) {
  const d = difficulty ?? 'NORMAL';
  return result === 'clear'
    ? { exp: BATTLE_EXP.clear[d] ?? BATTLE_EXP.clear.NORMAL, cost: STAMINA.cost[d] ?? STAMINA.cost.NORMAL }
    : { exp: BATTLE_EXP.defeat[d] ?? BATTLE_EXP.defeat.NORMAL, cost: STAMINA.defeatCost[d] ?? STAMINA.defeatCost.NORMAL };
}
/** STAMINA 0 なら EXP ×tiredExpMul(出撃前の STAMINA で決める)*/
export const expAfterStamina = (exp, staminaBefore) => (staminaBefore > 0 ? exp : Math.max(1, Math.round(exp * STAMINA.tiredExpMul)));
