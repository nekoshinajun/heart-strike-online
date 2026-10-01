import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';

/**
 * 敵の攻撃(返球の球種)。データは Config.enemyAttacks(難易度ごとの weight)+ bossProfiles[].attackStyle / attacks(敵ごとの個性)。
 *
 *   type         … STRAIGHT / CURVE / SPEED_CHANGE / LATE_CURVE / FEINT(組み合わせは項目を足すだけ)
 *   curve        … 左右へのずれの大きさ(world)。0 = まっすぐ。左右は抽選(side)
 *   speed        … 全体の速さの倍率(1 = 標準。難易度で全体を速くする用途には使わない)
 *   speedChange  … 途中で変わる速さの比(後半 ÷ 前半。>1 = 加速 / <1 = 減速)。changeTiming(進み具合 0〜1)の前後でなめらかに変わる
 *   changeTiming … 速度変化 / LATE CURVE の曲がり始めの位置(進み具合 0〜1)
 *   feint        … { at: 止まる位置(進み具合), pause: 止まる秒数, shake: 止まっている間の揺れ(world)}
 *   tell         … 予備動作(溜めの色・表示・ボスの溜めの回数)。必ず見切れるサイン
 *   weight       … { NORMAL, HARD, HELL } の出やすさ(0 / 省略 = その難易度では出ない)
 *
 * どの攻撃も「計画した到達時刻にマーカーの位置へ着く」(キャッチ判定の到達時刻・リングはそのまま正しい)。
 * MULTI は返球計画と同じ共有 seed の乱数で選ぶので、全員が同じ攻撃(種類・左右・速度変化・フェイント・軌道)を見る。
 */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { const v = clamp01(x); return v * v * (3 - 2 * v); };

/** この難易度 × この敵で出る攻撃の一覧 [{ id, def, w }] */
export function attackTable(difficulty, profile = {}) {
  const A = Config.enemyAttacks;
  const style = profile.attackStyle ?? {};
  const all = { ...A.patterns, ...(profile.attacks ?? {}) };
  const out = [];
  for (const [id, def] of Object.entries(all)) {
    const base = def.weight?.[difficulty] ?? 0;
    const w = base * (style[id] ?? style[def.type] ?? 1);
    if (w > 0) out.push({ id, def, w });
  }
  return out;
}

/** 重み付き抽選(random は共有 seed の乱数を渡す) */
export function pickAttack(random, difficulty, profile) {
  const list = attackTable(difficulty, profile);
  if (!list.length) return { id: 'STRAIGHT', def: Config.enemyAttacks.patterns.STRAIGHT };
  let r = random() * list.reduce((a, x) => a + x.w, 0);
  for (const x of list) { r -= x.w; if (r <= 0) return x; }
  return list[list.length - 1];
}

/**
 * 攻撃の動き(純粋な計算。BallController が毎フレーム読む)
 *   duration … 標準の飛行時間(秒。ボスの returnSpeed / RALLY / 難易度の returnSpeed を反映済み)
 *   side     … -1 = 左 / 1 = 右(画面の左右)。curve が 0 なら使わない
 * 返り値:{ total(到達までの秒), uAt(t)(進み具合 0〜1), lateralAt(u)(左右のずれ world), pauseAt(t)(フェイントで止まっている 0〜1 / null),
 *         changeU(速度変化 / 曲がり始めの進み具合), events:[{ t, kind }](演出用:速度変化・フェイント開始 / 再開・曲がり始め)}
 */
export function buildMotion(def, { duration, side = 1 } = {}) {
  const A = Config.enemyAttacks;
  const N = A.samples ?? 120;
  const T = duration / Math.max(0.2, def.speed ?? 1);
  const c = def.changeTiming ?? 0.5;
  const ratio = def.speedChange ?? 1;
  const blend = A.speedBlend ?? 0.1;
  // 進み具合 u ごとの速さ(前半 1 → 後半 ratio をなめらかに)。時間 = Σ du / 速さ を T に合わせる
  const speedAt = (u) => (ratio === 1 ? 1 : 1 + (ratio - 1) * smooth((u - (c - blend)) / (2 * blend)));
  const us = [0], ts = [0];
  for (let i = 1; i <= N; i++) { const u0 = (i - 1) / N, u1 = i / N; us.push(u1); ts.push(ts[i - 1] + (u1 - u0) / speedAt((u0 + u1) / 2)); }
  const k = T / ts[N];
  for (let i = 0; i <= N; i++) ts[i] *= k;
  // フェイント:途中で止まる(pause 秒。止まっている間はハートが揺れて光る = 再び来るサイン)。到達時刻は止まった分だけ後ろへ
  const f = def.feint ? { at: def.feint.at ?? 0.3, pause: def.feint.pause ?? 0.35, shake: def.feint.shake ?? 0.1 } : null;
  let feintT = null, feintU = null;
  if (f) {
    const i = Math.round(f.at * N);
    feintT = ts[i]; feintU = us[i];   // 止まる位置はサンプル点に合わせる(止まる前後で位置が戻らない)
    for (let j = i + 1; j <= N; j++) ts[j] += f.pause;
  }
  const total = ts[N];
  const uAt = (t) => {
    if (t <= 0) return 0;
    if (t >= total) return 1;
    if (f && t >= feintT && t <= feintT + f.pause) return feintU;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
    const span = ts[hi] - ts[lo];
    return us[lo] + (span > 0 ? (t - ts[lo]) / span : 0) * (us[hi] - us[lo]);
  };
  // 左右のずれ:CURVE = 弧を描いてマーカーへ / LATE_CURVE = 序盤はまっすぐ(横へずれた点へ一直線)→ 近づいてから曲がってマーカーへ
  const amp = (def.curve ?? 0) * (side < 0 ? -1 : 1);
  const lateralAt = (u) => {
    if (!amp) return 0;
    if (def.type === 'LATE_CURVE') return u < c ? amp * (u / c) : amp * (1 - smooth((u - c) / (1 - c)));
    return amp * Math.sin(Math.PI * clamp01(u));
  };
  const pauseAt = (t) => (f && t >= feintT && t <= feintT + f.pause ? (t - feintT) / f.pause : null);
  const tAtU = (u) => { const i = Math.min(N, Math.max(0, Math.round(u * N))); return ts[i]; };
  const events = [];
  if (ratio !== 1) events.push({ t: tAtU(c), kind: ratio > 1 ? 'speedUp' : 'speedDown' });
  if (def.type === 'LATE_CURVE' && amp) events.push({ t: tAtU(c), kind: 'lateCurve' });
  if (f) events.push({ t: feintT, kind: 'feintStop' }, { t: feintT + f.pause, kind: 'feintGo' });
  events.sort((a, b) => a.t - b.t);
  return { total, uAt, lateralAt, pauseAt, shake: f?.shake ?? 0, changeU: c, events, side: amp ? Math.sign(amp) : 0 };
}

/**
 * 返球の位置(BallController と返球計画の画面チェックで共通)。from → ctrl → to のベジェ + 攻撃の左右のずれ・フェイントの揺れ
 *   t … 発射からの秒。motion が無ければ従来どおり(t / dur)
 */
export function returnPathPoint(out, from, ctrl, to, t, dur, motion = null) {
  const u = motion ? motion.uAt(t) : Math.min(1, t / dur);
  const k = u * (0.75 + 0.25 * u);   // わずかに加速(ease-in)して「迫ってくる」感覚
  const a = 1 - k;
  out.set(0, 0, 0).addScaledVector(from, a * a).addScaledVector(ctrl, 2 * a * k).addScaledVector(to, k * k);
  if (motion) {
    out.x += motion.lateralAt(k);
    const p = motion.pauseAt(t);
    if (p != null) { const s = motion.shake * Math.sin(p * Math.PI); out.x += Math.sin(t * 55) * s; out.y += Math.cos(t * 47) * s * 0.6; }
  }
  return out;
}
export function returnCtrl(from, to) { const c = from.clone().lerp(to, 0.45); c.y += 1.2; return c; }

/**
 * 画面からはみ出さないように左右・曲がりの大きさを決める(どの攻撃も最後まで見えてキャッチできる)
 *   はみ出す時は逆側へ。両側ともはみ出す時は曲がりを小さく。乱数は使わない(MULTI でも全員同じ結果)
 */
export function fitMotion(def, { duration, side, from, to, toScreen, viewport, margin = 0.04 }) {
  const ctrl = returnCtrl(from, to), p = new THREE.Vector3();
  const fits = (m) => {
    for (let t = 0; t <= m.total; t += m.total / 40) {
      const q = toScreen(returnPathPoint(p, from, ctrl, to, t, m.total, m));
      if (q.x < viewport.w * margin || q.x > viewport.w * (1 - margin) || q.y < viewport.h * margin || q.y > viewport.h * (1 - margin)) return false;
    }
    return true;
  };
  if (!def.curve) return buildMotion(def, { duration, side });
  for (let scale = 1; scale >= 0.3; scale -= 0.1) {
    for (const sd of [side, -side]) {
      const m = buildMotion(scale === 1 ? def : { ...def, curve: def.curve * scale }, { duration, side: sd });
      if (fits(m)) return m;
    }
  }
  return buildMotion({ ...def, curve: def.curve * 0.3 }, { duration, side });
}
