// 育成の計算(純関数だけ。保存・画面は PlayerProgress / 各画面が持つ)。数値は GrowthData
import {
  AFFECTION, BATTLE_EXP, STAMINA, STAT_KEYS, STAT_MAX, CHARACTER_GROWTH, GROWTH_DEFAULT, GROWTH_EXPONENT, STAT_EFFECTS,
  ABILITIES, ABILITY_SLOTS, CHARACTER_ABILITY_SLOTS, ULTIMATES, ULTIMATE_LEVEL,
} from './GrowthData.js';
import { characterById } from './GameData.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------- 親密度 Lv / EXP ----------------
/** EXP カーブ(GrowthData.AFFECTION.curves)→ Lv ごとの累計 EXP の表。cum[lv] = その Lv に到達する累計 */
const softplus = (x) => Math.log1p(Math.exp(x));
function buildCurve({ knee, total }) {
  const M = AFFECTION.maxLevel, raw = (L) => (1 + L / 25) * (1 + (0.35 * softplus((L - knee) / 6) ** 2) / 4);
  let sum = 0;
  for (let L = 1; L < M; L++) sum += raw(L);
  const base = total / sum, cum = [0, 0];
  for (let L = 1; L < M; L++) cum[L + 1] = cum[L] + Math.round(base * raw(L));
  return cum;
}
const TABLES = Object.fromEntries(Object.entries(AFFECTION.curves).map(([k, c]) => [k, buildCurve(c)]));
/** 旧テーブル(目安の点の間は直線)。既存セーブの Lv を下げない移行だけに使う */
const LEGACY_TABLE = (() => {
  const pts = Object.entries(AFFECTION.legacyExpAnchors).map(([lv, e]) => [Number(lv), Number(e)]).sort((a, b) => a[0] - b[0]);
  const t = [0, 0];
  for (let lv = 2; lv <= AFFECTION.maxLevel; lv++) {
    const hi = pts.find(([l]) => l >= lv) ?? pts[pts.length - 1];
    const lo = [...pts].reverse().find(([l]) => l <= lv) ?? pts[0];
    t[lv] = hi[0] === lo[0] ? lo[1] : Math.round(lo[1] + ((hi[1] - lo[1]) * (lv - lo[0])) / (hi[0] - lo[0]));
  }
  return t;
})();
/** キャラの EXP カーブの種類('A' | 'BC' | 'DEF')。レアリティで決まる(データ:AFFECTION.curveByRank)*/
export const expCurveOf = (charId) => AFFECTION.curveByRank[characterById(charId)?.rank] ?? AFFECTION.defaultCurve;
const tableOf = (charId) => TABLES[expCurveOf(charId)] ?? TABLES[AFFECTION.defaultCurve];
const lvOf = (t, total) => {
  const e = clamp(Math.floor(Number(total) || 0), 0, t[AFFECTION.maxLevel]);
  let lv = 1;
  while (lv < AFFECTION.maxLevel && e >= t[lv + 1]) lv++;
  return lv;
};
/** Lv → その Lv に到達する累計 EXP(キャラのレアリティのカーブ)*/
export const expForLevel = (lv, charId) => tableOf(charId)[clamp(Math.floor(lv), 1, AFFECTION.maxLevel)];
export const maxAffectionExp = (charId) => tableOf(charId)[AFFECTION.maxLevel];
export const levelFromExp = (total, charId) => lvOf(tableOf(charId), total);
/** 旧テーブルでの Lv(移行用)*/
export const legacyLevelFromExp = (total) => lvOf(LEGACY_TABLE, total);
/** 累計 EXP → { level, into(今の Lv に入ってから), need(次の Lv までの幅。MAX は 0), total, max } */
export function affectionProgress(total, charId) {
  const t = tableOf(charId);
  const e = clamp(Math.floor(Number(total) || 0), 0, t[AFFECTION.maxLevel]);
  const level = lvOf(t, e);
  const max = level >= AFFECTION.maxLevel;
  return { level, total: e, into: max ? 0 : e - t[level], need: max ? 0 : t[level + 1] - t[level], max };
}
/**
 * 既存セーブの移行:「今の Lv(旧テーブル / 保存値)」と「新テーブルの Lv」の高い方を残し、EXP はその Lv の最低値まで補正する
 *   → { exp, level, oldLevel, newLevel }。Lv は絶対に下がらない
 */
export function migrateAffectionExp(exp, charId, savedLevel = null) {
  const e = Math.max(0, Math.floor(Number(exp) || 0));
  const oldLevel = Math.max(legacyLevelFromExp(e), clamp(Math.floor(Number(savedLevel) || 1), 1, AFFECTION.maxLevel));
  const newLevel = levelFromExp(e, charId);
  const level = Math.max(oldLevel, newLevel);
  return { exp: Math.min(maxAffectionExp(charId), Math.max(e, expForLevel(level, charId))), level, oldLevel, newLevel };
}

// ---------------- ステータス ----------------
const growthU = (level) => Math.pow((clamp(level, 1, AFFECTION.maxLevel) - 1) / (AFFECTION.maxLevel - 1), GROWTH_EXPONENT);
/** Lv の基礎ステータス(レベルの成長だけ。アビリティは含めない → abilityStats / abilityStatMul で別枠)*/
export function statsAt(charId, level) {
  const g = CHARACTER_GROWTH[charId] ?? GROWTH_DEFAULT, u = growthU(level);
  const out = {};
  for (const k of STAT_KEYS) {
    const [a, b] = g[k] ?? GROWTH_DEFAULT[k];
    out[k] = Math.round(clamp(a + (b - a) * u, 0, STAT_MAX));
  }
  return out;
}
/** アビリティのステータス加算(別枠)→ { attack, defence, control, curve, hp } */
export function abilityStats(abilities = []) {
  const out = { attack: 0, defence: 0, control: 0, curve: 0, hp: 0 };
  for (const ab of abilities ?? []) for (const e of ab.effects ?? []) {
    if (e.kind === 'stat' && e.stat in out) out[e.stat] += Number(e.add) || 0;
    if (e.kind === 'hp') out.hp += Number(e.add) || 0;
  }
  return out;
}
/** 表示用:基礎 + アビリティの加算(戦闘の計算は基礎の倍率 × アビリティの倍率で別々に行う)*/
export function totalStats(base, bonus) {
  const out = {};
  for (const k of STAT_KEYS) out[k] = Math.round((base?.[k] ?? 0) + (bonus?.[k] ?? 0));
  return out;
}
/** Lv のバトルの最大 HP(基礎。VITAL UP などは character() で別に足す)*/
export const HP_MAX = 300;   // 表示(五角形)の外周
export function hpAt(charId, level) {
  const [a, b] = (CHARACTER_GROWTH[charId] ?? GROWTH_DEFAULT).hp ?? GROWTH_DEFAULT.hp;
  return Math.round(a + (b - a) * growthU(level));
}
/** 基礎ステータス → 性能(STAT_EFFECTS の 0 / 50 / 100 を直線でつなぐ。100 を超えた分も 50→100 の傾きのまま伸びる)*/
export function statEffect(key, value) {
  const [a, m, b] = STAT_EFFECTS[key];
  const v = clamp(Number(value) || 0, 0, STAT_MAX);
  const r = v <= 50 ? a + ((m - a) * v) / 50 : m + ((b - m) * (v - 50)) / 50;
  return key === 'control' ? Math.max(0, r) : key === 'defence' ? Math.max(0.3, r) : r;
}
/**
 * アビリティの加算(別枠)→ 倍率。1 ポイント = STAT_EFFECTS の 50→100 の傾き分(基準 50 の値に対する割合)
 *   attack +20 → ×1.10 / defence +20 → 被ダメ ×0.90 / curve +20 → ×1.20 / control +20 → ブレ ×0.63
 *   レベルの基礎がいくら高くても、この倍率は上限に吸収されない(基礎の倍率 × この倍率)
 */
export function abilityStatMul(key, add) {
  const n = Number(add) || 0;
  if (!n) return 1;
  const [, m, b] = STAT_EFFECTS[key];
  return Math.max(0.05, 1 + (((b - m) / 50) * n) / m);
}

// ---------------- アビリティ ----------------
/** そのキャラの Lv10〜100 の候補 { 10: [id, …], … } */
export function abilitySlots(charId) {
  return { ...ABILITY_SLOTS, ...(CHARACTER_ABILITY_SLOTS[charId] ?? {}) };
}
export const abilityById = (id) => (ABILITIES[id] ? { id, ...ABILITIES[id] } : null);
export const ultimateFor = (charId) => abilityById(ULTIMATES[charId]);
/** 選択済みのアビリティが今の候補に無い(旧アビリティ)か */
export const isLegacyPick = (charId, level, abilityId) => !!abilityId && !(abilitySlots(charId)[String(level)] ?? []).includes(abilityId);
/**
 * 有効なアビリティ:到達した Lv の枠で選んだもの + Lv100 の ULTIMATE
 *   旧アビリティ(今の候補に無い・移行できなかったもの)も、選択済みなら効果を残す(既存ユーザーの保護)
 */
export function activeAbilities(charId, level, selected = {}) {
  const slots = abilitySlots(charId), out = [];
  for (const [lv, pick] of Object.entries(selected ?? {})) {
    if (!(level >= Number(lv)) || !pick || ULTIMATES[charId] === pick) continue;
    const a = abilityById(pick);
    if (a && !a.ultimate) out.push({ ...a, slot: Number(lv), legacy: !(slots[lv] ?? []).includes(pick) });
  }
  out.sort((x, y) => x.slot - y.slot);
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
  if (when.gate && !((ctx.gates ?? 0) > 0)) return false;
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
