import { Config } from '../core/Config.js';
import { characterById } from '../data/GameData.js';
import { mulberry32 } from './GachaService.js';

/**
 * GachaResult(確定済み)→ GachaSequencePlan(演出台本)。結果側には何も書き戻さない。
 *   PresentationRouteRegistry … Route の登録と検証(SSR 専用 Cue(ドクン / Rainbow / 最高速からの停止)は SSR 以外に登録できない)
 *   GachaSequencePlanner      … item ごとに Route・見せかけのレアリティ・分裂時の光・Reveal 順を決める(種は result.seed から派生 = 再現可能)
 *   GachaPresentation         … 演出セット(Character > Banner > default の順に項目単位で継承)。限定キャラの if はコードに書かない
 */
export class PresentationRouteRegistry {
  constructor() { this.routes = new Map(); }
  register(r) {
    if (r.usesSsrOnlyCues && (r.forRarity.length !== 1 || r.forRarity[0] !== 'SSR')) throw new Error(`route ${r.id}: SSR-only cues can only be used for SSR`);
    this.routes.set(r.id, r);
    return this;
  }
  get(id) { return this.routes.get(id); }
  usable(rarity, mode) { return [...this.routes.values()].filter((r) => r.forRarity.includes(rarity) && r.allowedIn.includes(mode)); }
}

export const ROUTES = new PresentationRouteRegistry()
  .register({ id: 'R_NORMAL', forRarity: ['R'], disguiseAs: 'R', usesSsrOnlyCues: false, promotion: false, allowedIn: ['single', 'ten'] })
  .register({ id: 'SR_NORMAL', forRarity: ['SR'], disguiseAs: 'SR', usesSsrOnlyCues: false, promotion: false, allowedIn: ['single', 'ten'] })
  // SSR:最初は R / SR に見える → 急停止 → 静寂 → ドクン×2 → RAINBOW HEART GATE → 加速
  .register({ id: 'SSR_DIRECT', forRarity: ['SSR'], disguiseAs: 'R|SR', usesSsrOnlyCues: true, promotion: false, allowedIn: ['single', 'ten'] })
  // 昇格:R / SR のように届きかけ → Heart 自身が脈打って踏みとどまる(失敗ではない)→ Rainbow Route を自ら開く → Curve
  .register({ id: 'R_TO_SSR', forRarity: ['SSR'], disguiseAs: 'R', usesSsrOnlyCues: true, promotion: true, allowedIn: ['single', 'ten'] })
  .register({ id: 'SR_TO_SSR', forRarity: ['SSR'], disguiseAs: 'SR', usesSsrOnlyCues: true, promotion: true, allowedIn: ['single', 'ten'] });

export const DEFAULT_PRESENTATION = {
  id: 'default',
  sky: { top: '#e9f8ff', bottom: '#b9e8ff', cloud: '#ffffff', cloudTint: null, dust: '#ff9ccc' },
  heart: { trailColors: { R: '#8fd8ff', SR: '#ffd23e', SSR: 'rainbow' }, base: '#ff7ab8' },
  gates: { colors: { R: '#6ccfff', SR: '#ffc93c', white: '#ffffff' }, count: 3 },
  ssrGate: { scale: 2.5, spin: 0.9 },
  heartbeat: { variant: 'gachaSSR', count: 2 },
  reveal: { heightR: 0.6, heightSR: 0.65, heightSSR: 0.74 },
  timingOverrides: {},
};
export const PRESENTATIONS = { default: DEFAULT_PRESENTATION };

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  if (!isObj(b)) return a;
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v;
  return o;
}
/** Character > Banner > default(項目単位で上書き。未指定は下位から継承)*/
export function resolvePresentation(banner, characterId) {
  const base = PRESENTATIONS.default;
  const b = PRESENTATIONS[banner?.presentationId] ?? {};
  const cp = characterById(characterId)?.gacha?.presentationId;
  const c = cp ? PRESENTATIONS[cp] ?? {} : {};
  return merge(merge(base, b), c);
}

export class GachaSequencePlanner {
  constructor(registry = ROUTES) { this.routes = registry; }

  pickWeighted(weights, allowed, rng) {
    const e = Object.entries(weights ?? {}).filter(([id, w]) => w > 0 && allowed.includes(id));
    const total = e.reduce((a, [, w]) => a + w, 0);
    if (!total) return allowed[0];
    let r = rng() * total;
    for (const [id, w] of e) { r -= w; if (r <= 0) return id; }
    return e[e.length - 1][0];
  }

  /**
   * @param result GachaResult / @param opts.mode FULL | FAST | SKIP_TO_NEW / opts.forceRoute(Debug:Route を強制)
   */
  plan(result, opts = {}) {
    const G = Config.gacha;
    const kind = result.count >= 10 ? 'ten' : 'single';
    const rng = mulberry32((result.seed ^ 0x5bd1e995) >>> 0);   // 演出用の種(result.seed から派生)
    const bannerCfg = G.banners.find((b) => b.id === result.bannerId);
    const items = result.items.map((it) => {
      const usable = this.routes.usable(it.rarity, kind).map((r) => r.id);
      const routeId = opts.forceRoute && usable.includes(opts.forceRoute) ? opts.forceRoute : this.pickWeighted(G.presentationWeights[it.rarity], usable, rng);
      const route = this.routes.get(routeId);
      let displayRarity = it.rarity;
      if (route.disguiseAs === 'R|SR') displayRarity = rng() < 0.5 ? 'R' : 'SR';
      else if (route.disguiseAs) displayRarity = route.disguiseAs;
      return {
        drawIndex: it.drawIndex, characterId: it.characterId, finalRarity: it.rarity, displayRarity, routeId,
        promotion: !!route.promotion, ssr: it.rarity === 'SSR', isNew: it.isNew,
        fragmentGlint: 'white', curveSide: rng() < 0.5 ? 'left' : 'right',
        presentation: resolvePresentation(bannerCfg, it.characterId),
      };
    });
    // 10連:分裂時の光(R / SR が Rainbow に光ることはない。昇格 Route の SSR は見せかけの色)
    const hint = opts.fragmentHintMode ?? G.fragmentHintMode;
    for (const x of items) {
      const shown = x.promotion ? x.displayRarity : x.finalRarity;
      if (hint === 'NONE') x.fragmentGlint = 'white';
      else if (hint === 'GOLD_ONLY') x.fragmentGlint = shown === 'R' ? 'white' : 'gold';
      else if (hint === 'RAINBOW_FLASH') x.fragmentGlint = shown === 'R' ? 'white' : x.finalRarity === 'SSR' && !x.promotion ? 'rainbow' : 'gold';
      else if (hint === 'MIXED') x.fragmentGlint = shown === 'R' ? 'white' : x.finalRarity === 'SSR' && !x.promotion ? (rng() < 0.5 ? 'rainbow' : 'gold') : 'gold';
    }
    const revealOrderMode = opts.revealOrderMode ?? G.revealOrderMode;
    const revealOrder = this.order(items, revealOrderMode);
    const mode = opts.mode ?? 'FULL';
    return { txId: result.txId, kind, mode, presentationId: bannerCfg?.presentationId ?? 'default', fragmentHintMode: hint, revealOrderMode, revealOrder, items,
      timeline: kind === 'single' ? this.singleTimeline(items[0], mode) : this.tenTimeline(items, revealOrder, mode) };
  }

  /** Reveal 順(演出の順番だけ。抽選結果・一覧の順は変えない)*/
  order(items, mode) {
    const idx = items.map((x) => x.drawIndex);
    const R = { R: 0, SR: 1, SSR: 2 };
    const last = (pred) => [...idx.filter((i) => !pred(items[i])), ...idx.filter((i) => pred(items[i]))];
    switch (mode) {
      case 'SSR_LAST': return last((x) => x.ssr);
      case 'NEW_SSR_LAST': return last((x) => x.ssr && x.isNew);
      case 'PROMOTION_LAST': return last((x) => x.promotion);
      case 'RARITY_ASCENDING': return [...idx].sort((a, b) => R[items[a].finalRarity] - R[items[b].finalRarity] || a - b);
      default: return idx;
    }
  }

  /** 1連の Timeline(Release = 0.0。秒は Config.gacha.timing)。FAST は Gate 区間を縮める(SSR の静寂とドクンは縮めない)*/
  singleTimeline(it, mode) {
    const T = { ...Config.gacha.timing, ...(it.presentation.timingOverrides ?? {}) };
    const k = mode === 'FAST' ? T.fast.gateScale : 1;
    const tl = [];
    const add = (t, cue, params = {}) => tl.push({ t: +t.toFixed(3), cue, params });
    const color1 = 'R';
    add(0, 'launch');
    add(T.gate1 * k, 'gate', { index: 0, color: color1 });
    if (!it.ssr) {
      const sr = it.finalRarity === 'SR';
      add(T.gate2 * k, 'gate', { index: 1, color: sr ? 'SR' : 'R', goldify: sr });
      add(T.gate3 * k, 'gate', { index: 2, color: sr ? 'SR' : 'white', big: sr });
      const arrive = (sr ? T.arriveSR : T.arriveR) * k;
      add(arrive, 'arrival');
      this.revealCues(add, arrive, it, mode, T);
      return tl;
    }
    const disguiseSR = it.displayRarity === 'SR';
    add(T.gate2 * k, 'gate', { index: 1, color: disguiseSR ? 'SR' : 'R', goldify: disguiseSR });
    if (!it.promotion) {
      const S = T.ssr, shift = T.gate3 * k - T.gate3;   // FAST でも停止〜ドクンの長さは同じ(開始だけ前へ)
      add(S.stop + shift, 'stop');
      add(S.stop + shift, 'silence');
      add(S.beat1 + shift, 'heartbeat', { n: 1 });
      add(S.beat2 + shift, 'heartbeat', { n: 2, leak: true });
      add(S.rainbowGate + shift, 'rainbowGate', { side: 0 });
      add(S.accel + shift, 'accel');
      add(S.enter + shift, 'flash');
      add(S.arrive + shift, 'arrival');
      this.revealCues(add, S.arrive + shift, it, mode, T);
    } else {
      const P = T.promo, shift = T.gate3 * k - T.gate3;
      add(P.pulse + shift, 'selfPulse');        // Heart 自身が強く脈打って踏みとどまる(Gate 3 の輪が外側へたわむ)
      add(P.silence + shift, 'silence');
      add(P.beat1 + shift, 'heartbeat', { n: 1 });
      add(P.beat2 + shift, 'heartbeat', { n: 2, leak: true });
      add(P.route + shift, 'rainbowGate', { side: it.curveSide === 'left' ? -1 : 1 });
      add(P.curve + shift, 'curve', { side: it.curveSide });
      add(P.enter + shift, 'flash');
      add(P.arrive + shift, 'arrival');
      this.revealCues(add, P.arrive + shift, it, mode, T);
    }
    return tl;
  }
  revealCues(add, t0, it, mode, T) {
    add(t0, 'catch');
    add(t0 + T.catch, 'burst');
    add(t0 + T.catch + T.burst, 'reveal', { uiDelay: it.ssr ? T.ssrUiDelay : 0 });
    const tap = mode === 'FAST' && !it.ssr ? T.fast.revealRS : T.revealTap[it.finalRarity];
    add(t0 + T.catch + T.burst + tap, 'tapReady');
  }

  /** 10連:大きな Heart を1回 → 分裂 → 5つの Gate へ → シルエット → 1人ずつ Reveal(revealOrder)*/
  tenTimeline(items, order, mode) {
    const T = Config.gacha.timing, N = T.ten;
    const k = mode === 'FAST' ? T.fast.gateScale : 1;
    const tl = [];
    const add = (t, cue, params = {}) => tl.push({ t: +t.toFixed(3), cue, params });
    add(0, 'launch');
    add(N.gate1 * k, 'gate', { index: 0, color: 'R', big: true });
    add(N.split * k, 'split');
    add(N.glintEnd * k, 'glintEnd');
    add(N.flyEnd * k, 'silhouettes');
    let t = N.silhouetteEnd * k;
    let ssrSeen = 0;
    for (const i of order) {
      const it = items[i];
      const key = it.ssr ? (it.promotion ? 'PROMO' : 'SSR') : it.finalRarity;
      const dur = mode === 'FAST' && !it.ssr ? T.fast.revealRS : N.reveal[key];
      add(t, 'revealItem', { drawIndex: i, beatInterval: it.ssr ? (ssrSeen++ ? N.beatIntervalRepeat : N.beatInterval) : 0, dur });
      t += dur;
    }
    add(t, 'list');
    return tl;
  }
}
