import { Config, difficultyData } from '../core/Config.js';
import { STAGES, ATTRIBUTES, characterById, stageById } from '../data/GameData.js';
import { DEFAULT_HOME_DIALOGUE, DEFAULT_GUIDANCE_LINES, STYLE_GUIDANCE_LINES } from '../data/CharacterVoice.js';

/**
 * Character Guidance System(HOME FINAL §6)
 *   PlayerProgress / 時刻 / 解放状況 → HomeGuidanceProvider(全 Rule を評価)→ HomeAgenda(Guidance 1件 + TODAY'S PICK 1件を同時に決定)
 *   → DialogueResolver(Event × キャラ → セリフ)→ HomeScreen(HomeCharacterView)
 * Notification(Pink Dot / Clock / 攻略 Pulse)も同じ評価結果から作る(別の判定を書かない)。
 * Event(何が起きたか)と Line(誰がどう言うか)は分離。システム文は Guidance 用の文にしない。
 */
const DIFFS = () => Config.difficultyOrder;
const now = () => Date.now();

/** ミッション / プレゼント(受け口。データは Config.missions / progress.presents)。ログインボーナス等は Present として届ける */
export class RewardService {
  constructor(progress) { this.p = progress; }
  missionProgress(m) {
    const d = this.p.data, g = m.goal;
    let v = 0;
    if (g.type === 'totalClears') v = d.stats.totalClears ?? 0;
    else if (g.type === 'difficultyClear') v = Object.values(d.records).reduce((a, byD) => a + (byD[g.difficulty]?.clearCount ?? 0), 0);
    else if (g.type === 'gachaPulls') v = d.gacha.pulls ?? 0;
    return { value: Math.min(v, g.count), goal: g.count, done: v >= g.count, claimed: !!d.missions.claimed[m.id] };
  }
  get missions() { return Config.missions.map((m) => ({ ...m, ...this.missionProgress(m) })); }
  get claimableMissions() { return this.missions.filter((m) => m.done && !m.claimed); }
  claimMission(id) {
    const m = this.missions.find((x) => x.id === id);
    if (!m || !m.done || m.claimed) return 0;
    this.p.data.missions.claimed[id] = now();
    this.p.data.wallet.heartGem += m.reward.heartGem ?? 0;
    this.p.save();
    return m.reward.heartGem ?? 0;
  }
  get presents() { const t = now(); return this.p.data.presents.filter((x) => !x.claimedAt && (!x.expiresAt || x.expiresAt > t)); }
  expiringSoon(x) { return !!x.expiresAt && x.expiresAt - now() < Config.home.presentExpireSoonHours * 3600e3; }
  claimPresent(id) {
    const x = this.p.data.presents.find((y) => y.id === id);
    if (!x || x.claimedAt) return 0;
    x.claimedAt = now();
    this.p.data.wallet.heartGem += x.reward?.heartGem ?? 0;
    this.p.save();
    return x.reward?.heartGem ?? 0;
  }
  sendPresent(p) { this.p.data.presents.push({ id: `pr${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, createdAt: now(), ...p }); this.p.save(); }
}

/**
 * GuidanceRule(データ)。priority は category の既定値(Config.guidancePriority)をここで上書きできる
 *   when(ctx) → null | { key(同じ状況の識別子), params?, destination?, stageId?, difficulty?, reason?, notify? }
 *   event … セリフを引くキー(CharacterData.guidanceLines[event])/ cooldownMin … 同じ Rule を再び喋るまで / stage … Stage 系(Pick と連動)
 */
export const GUIDANCE_RULES = [
  {
    id: 'pending_reveal', event: 'PENDING_REVEAL', category: 'CRITICAL', cooldownMin: 5,
    when: (c) => (c.p.data.gacha.pending ? { key: c.p.data.gacha.pending, destination: { screen: 'gachaResult', txId: c.p.data.gacha.pending } } : null),
  },
  {
    id: 'present_expiring', event: 'PRESENT_EXPIRING', category: 'CRITICAL', cooldownMin: 360,
    when: (c) => {
      const ps = c.rewards.presents.filter((x) => c.rewards.expiringSoon(x));
      return ps.length ? { key: ps.map((x) => x.id).join(','), params: { count: ps.length }, destination: { screen: 'present' }, notify: { target: 'present', dot: true, clock: true } } : null;
    },
  },
  {
    id: 'present_arrived', event: 'PRESENT_ARRIVED', category: 'REWARD',
    when: (c) => {
      const ps = c.rewards.presents;
      return ps.length ? { key: ps.map((x) => x.id).join(','), params: { count: ps.length }, destination: { screen: 'present' }, notify: { target: 'present', dot: true } } : null;
    },
  },
  {
    id: 'mission_claimable', event: 'MISSION_CLAIMABLE', category: 'REWARD',
    when: (c) => {
      const ms = c.rewards.claimableMissions;
      return ms.length ? { key: ms.map((m) => m.id).join(','), params: { count: ms.length }, destination: { screen: 'mission' }, notify: { target: 'mission', dot: true } } : null;
    },
  },
  {
    id: 'event_stage', event: 'EVENT_STAGE', category: 'NEW_CONTENT', stage: true,
    when: (c) => {
      const t = now();
      const e = (Config.events ?? []).find((x) => (!x.from || x.from <= t) && (!x.to || t < x.to) && stageById(x.stageId));
      if (!e) return null;
      const d = e.difficulty ?? 'NORMAL';
      return { key: `event:${e.id ?? e.stageId}`, stageId: e.stageId, difficulty: d, reason: e.label ?? 'EVENT', notify: { target: 'stage', pulse: c.p.data.navPulse.unseen.includes(`event:${e.id ?? e.stageId}`) } };
    },
  },
  {
    id: 'new_stage', event: 'NEW_STAGE', category: 'NEW_CONTENT', stage: true,
    when: (c) => {
      const u = c.p.data.navPulse.unseen;
      for (const s of STAGES) for (const d of DIFFS()) {
        if (difficultyData(d).locked) continue;
        if (u.includes(`stage:${s.id}`) || u.includes(`diff:${s.id}:${d}`)) return { key: `new:${s.id}:${d}`, stageId: s.id, difficulty: d, reason: 'NEW', notify: { target: 'stage', pulse: true } };
      }
      return u.includes('tutorial') ? { key: 'tutorial', stageId: STAGES[0].id, difficulty: 'NORMAL', reason: 'はじめて', notify: { target: 'stage', pulse: true } } : null;
    },
  },
  {
    id: 'new_character', event: 'NEW_CHARACTER', category: 'NEW_CONTENT',
    when: (c) => {
      const id = c.p.ownedIds.find((x) => c.p.data.characters[x].obtainedVia === 'gacha' && !c.p.data.characters[x].introducedAt);
      return id ? { key: `newc:${id}`, params: { chara: characterById(id).name }, destination: { screen: 'detail', id } } : null;
    },
  },
  {
    id: 'new_banner', event: 'NEW_BANNER', category: 'NEW_CONTENT',
    when: (c) => {
      const b = Config.gacha.banners.find((x) => !c.p.data.seen.banners[x.id]);
      return b ? { key: b.id, destination: { screen: 'gacha' }, notify: { target: 'gacha', dot: true } } : null;
    },
  },
  {
    id: 'stage_first_clear', event: 'STAGE_FIRST_CLEAR', category: 'PROGRESS', stage: true,
    when: (c) => {
      const s = firstClearTarget(c.p);
      return s ? { key: `fc:${s.stageId}:${s.difficulty}`, ...s, reason: `初回クリア ◆×${Config.rewards.firstClearGem[s.difficulty] ?? 0}` } : null;
    },
  },
  {
    id: 'level_up_near', event: 'LEVEL_UP_NEAR', category: 'PROGRESS',
    when: (c) => {
      const id = c.p.party.find((x) => { const ch = c.p.character(x); return !ch.maxLevel && ch.expNeed && ch.expInto / ch.expNeed >= Config.home.levelUpNearRatio; });
      return id ? { key: `lv:${id}:${c.p.character(id).level}`, params: { chara: characterById(id).name }, destination: { screen: 'trainChar', id } } : null;
    },
  },
  {
    id: 'return_long', event: 'RETURN_LONG', category: 'RETURN',
    when: (c) => {
      const last = c.p.data.home.lastVisitAt;
      return last && now() - last > Config.home.returnAfterHours * 3600e3 ? { key: `ret:${Math.floor(last / 3600e3)}` } : null;
    },
  },
];

/** 初回クリア報酬が未取得のうち最も若いもの(NORMAL → HARD → HELL、ステージ順)*/
function firstClearTarget(p) {
  for (const d of DIFFS()) for (const s of STAGES) {
    if (difficultyData(d).locked) continue;
    if (!p.record(s.id, d)?.firstClearRewarded) return { stageId: s.id, difficulty: d };
  }
  return null;
}

export class HomeGuidanceProvider {
  constructor(progress, rules = GUIDANCE_RULES) { this.p = progress; this.rules = rules; this.rewards = new RewardService(progress); }
  /** 全 Rule を評価(Guidance と Notification の共通の元データ)*/
  evaluate() {
    const ctx = { p: this.p, rewards: this.rewards };
    const P = Config.guidancePriority;
    const out = [];
    for (const r of this.rules) {
      let v = null;
      try { v = r.when(ctx); } catch { v = null; }
      if (!v) continue;
      const dest = v.destination ?? (r.stage && v.stageId ? { screen: 'stage', stageId: v.stageId, difficulty: v.difficulty } : null);
      out.push({ rule: r, id: r.id, event: r.event, category: r.category, priority: r.priority ?? P[r.category] ?? 0, stage: !!r.stage, ...v, destination: dest });
    }
    return out.sort((a, b) => b.priority - a.priority);
  }
  /** Notification:Mission / Present = Pink Dot(期限間近は Clock)、ガチャ = Dot、攻略 = Pulse(新コンテンツのみ)*/
  notifications(results = this.evaluate()) {
    const n = { mission: { dot: false }, present: { dot: false, clock: false }, gacha: { dot: false }, stage: { pulse: false } };
    for (const r of results) {
      const t = r.notify;
      if (!t || !n[t.target]) continue;
      if (t.dot) n[t.target].dot = true;
      if (t.clock) n[t.target].clock = true;
      if (t.pulse) n[t.target].pulse = true;
    }
    return n;
  }
}

/** HOME で「今回のセリフ(Guidance 最大1件)」と「TODAY'S PICK」を同時に決める(HOME FINAL §7)*/
export class HomeAgenda {
  constructor(progress, provider) { this.p = progress; this.provider = provider; }

  eligible(r) {
    const g = this.p.data.guidance;
    if (g.resolved[r.id] === r.key) return false;
    const cd = (r.rule.cooldownMin ?? Config.home.guidanceCooldownMin) * 60e3;
    const last = g.lastShown[r.id];
    return !(last && last.key === r.key && now() - last.t < cd);
  }

  /**
   * 1. Guidance 候補を優先度順 → 1位をセリフに
   * 2. Pick 候補(Stage 系の Rule + 推しの属性有利)を優先度順
   * 3. セリフが Stage 系 → Pick は同じ Stage / Difficulty(連動・枠を光らせる)
   * 4. セリフが Stage 系以外 → Pick は Stage 候補の1位(役割分担)
   * 5. Stage 候補なし → Pick 非表示
   */
  decide({ trigger = null, favoriteId = null } = {}) {
    const results = this.provider.evaluate();
    const top = results.find((r) => this.eligible(r)) ?? null;
    let pick;
    if (top?.stage) pick = { stageId: top.stageId, difficulty: top.difficulty, reason: top.reason, ruleId: top.id, linked: !trigger };
    else pick = this.pickCandidates(results, favoriteId)[0] ?? null;
    return { results, guidance: trigger ? null : top, deferred: trigger ? top : null, pick, notifications: this.provider.notifications(results) };
  }

  pickCandidates(results, favoriteId) {
    const out = results.filter((r) => r.stage).map((r) => ({ stageId: r.stageId, difficulty: r.difficulty, reason: r.reason, ruleId: r.id }));
    const fav = favoriteId && characterById(favoriteId);
    if (fav) {
      const s = STAGES.find((x) => ATTRIBUTES[fav.attribute]?.beats === x.boss.attribute);
      if (s) out.push({ stageId: s.id, difficulty: 'NORMAL', reason: `${fav.name}が属性有利`, ruleId: 'pick_advantage' });
    }
    return out;
  }

  /** 今いちばん言うべき未解決 Guidance(タップ3回ごとの言い直し用。cooldown は見ない)*/
  unresolvedTop() { return this.provider.evaluate().find((r) => this.p.data.guidance.resolved[r.id] !== r.key) ?? null; }

  markShown(r) { this.p.data.guidance.lastShown[r.id] = { key: r.key, t: now() }; this.p.save(); }

  /** 行き先の画面を開いたら resolved(同じ key の間は再び喋らない。条件が変われば key が変わって再び候補)*/
  resolveFor(screen, params = {}) {
    let changed = false;
    for (const r of this.provider.evaluate()) {
      const d = r.destination;
      if (!d || d.screen !== screen) continue;
      if (screen === 'stage' && params.stageId && d.stageId && params.stageId !== d.stageId) continue;
      if (screen === 'detail' && params.id && d.id && params.id !== d.id) continue;
      this.p.data.guidance.resolved[r.id] = r.key; changed = true;
    }
    if (changed) this.p.save();
  }
}

/** Event × キャラ → セリフ(直近のセリフは避ける)*/
export class DialogueResolver {
  constructor(progress) { this.p = progress; }
  lines(ch, key) {
    const own = ch?.homeDialogue?.[key];
    return (own?.length ? own : DEFAULT_HOME_DIALOGUE[key]) ?? [];
  }
  pick(ch, key, { avoid = true } = {}) {
    const list = this.lines(ch, key).map((x) => (typeof x === 'string' ? x : x.text));
    if (!list.length) return '';
    const recent = this.p.data.home.lastLines ?? [];
    const pool = avoid && list.length > 1 ? list.filter((t) => !recent.includes(t)) : list;
    const from = pool.length ? pool : list;
    const t = from[Math.floor(Math.random() * from.length)];
    this.remember(t);
    return t;
  }
  remember(t) {
    const h = this.p.data.home;
    h.lastLines = [t, ...(h.lastLines ?? []).filter((x) => x !== t)].slice(0, Math.max(1, Config.home.avoidRecentLines));
  }
  /** キャラ固有 guidanceLines[event] → 性格タイプ(voiceStyle)の共通文 → 既定文 */
  guidance(ch, r) {
    const pools = [ch?.guidanceLines?.[r.event], STYLE_GUIDANCE_LINES[ch?.voiceStyle]?.[r.event], DEFAULT_GUIDANCE_LINES[r.event]];
    const list = (pools.find((x) => x?.length) ?? ['']).map((x) => (typeof x === 'string' ? x : x.text));
    const tpl = list[Math.floor(Math.random() * list.length)];
    const st = r.stageId ? stageById(r.stageId) : null;
    const vars = { stage: st ? st.name : '', boss: st ? st.boss.name : '', diff: r.difficulty ? difficultyData(r.difficulty).label : '', count: r.params?.count ?? '', chara: r.params?.chara ?? '' };
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  }
}
