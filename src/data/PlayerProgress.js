import { CHARACTERS, DEFAULT_PARTY, LEVELING, LEGACY_CHARACTER_IDS, STAGES, characterById } from './GameData.js';
import { Config } from '../core/Config.js';
import { HEROINES, HEROINE_ASMR_UNLOCK, INTIMACY, heroineById, heroineByStage, giftById } from './RomanceData.js';
import { storage, Log } from '../app/Platform.js';

/**
 * PlayerProgress v2(保存キー heart-strike-progress-v2)
 *   characters[id] = { owned, level, exp, obtainedAt, firstHomeSetAt, intimacy, bonus }   ← 固定 Character ID(表示名は使わない)
 *       intimacy … 親密度ポイント / bonus … プレゼント等による能力の上乗せ { atk, def }
 *   heroines[heroineId] = { asmrUnlocked: { trackId: 解放時刻 }, asmrSeen: { trackId: 初めて開いた時刻 } }   ← 攻略対象(味方ではない)
 *   items[giftId] = 所持数(プレゼント)
 *   party[4] / favoriteCharacterId
 *   records[stageId][NORMAL|HARD|HELL] = { clearCount, bestRally, bestGateChain, bestHeartPerThrow, firstClearRewarded }
 *   cleared[](旧形式・互換用)/ wallet.heartGem / flags / seen / missions / presents / gacha / home / stats
 *
 * 旧セーブ squash-titan-progress-v1 は Migration 元として残す(削除しない)。
 * Migration に失敗したら v1 はそのまま・壊れた v2 は保存しない(saveBlocked)。
 * 保存は ProgressRepository(StorageAdapter)経由だけ。localStorage を直接触らない。
 */
export const PROGRESS_KEY_V2 = 'heart-strike-progress-v2';
export const PROGRESS_KEY_V1 = 'squash-titan-progress-v1';
const DIFFS = ['NORMAL', 'HARD', 'HELL'];

export class ProgressRepository {
  constructor(adapter = storage) { this.adapter = adapter; }
  readV2() { return this.adapter.getJSON(PROGRESS_KEY_V2); }
  readV1() { return this.adapter.getJSON(PROGRESS_KEY_V1); }
  write(data) { return this.adapter.setJSON(PROGRESS_KEY_V2, data); }
  clearV2() { this.adapter.remove(PROGRESS_KEY_V2); }
}

const now = () => Date.now();
const charEntry = (o = {}) => ({ owned: false, level: 1, exp: 0, obtainedAt: null, obtainedVia: null, firstHomeSetAt: null, introducedAt: null, intimacy: 0, ...o, bonus: { atk: 0, def: 0, ...(o.bonus ?? {}) } });
const heroineEntry = (o = {}) => ({ ...o, asmrUnlocked: { ...(o.asmrUnlocked ?? {}) }, asmrSeen: { ...(o.asmrSeen ?? {}) } });
const num = (v) => (Number.isFinite(v) ? v : 0);   // 未決定(null)の数値は 0 として扱う
/** 今のコンテンツ(新 Stage / 新 Difficulty の検出用)*/
export const contentKeys = () => STAGES.flatMap((s) => [`stage:${s.id}`, ...DIFFS.map((d) => `diff:${s.id}:${d}`)]);

function blankSave() {
  const characters = {};
  for (const c of CHARACTERS) characters[c.id] = charEntry();
  return {
    version: 2,
    createdAt: now(),
    player: { name: 'プレイヤー' },
    characters,
    party: [...DEFAULT_PARTY],
    favoriteCharacterId: null,
    heroines: {},
    items: {},
    records: {},
    cleared: [],
    wallet: { heartGem: 1000 },
    flags: { starterGranted: false, hellConfirmed: false },
    seen: { banners: {} },
    knownContent: contentKeys(),
    navPulse: { unseen: [] },          // ['stage:stage03', 'diff:stage02:HELL', 'event:xxx', 'tutorial'] → Stage Select(攻略)を開いたら空
    guidance: { lastShown: {}, resolved: {} },
    pendingHomeTrigger: null,          // { key: 'afterClear' | 'afterGacha' | 'newlySetHome' | 'setHome', t, results? }
    missions: { claimed: {} },
    presents: [],
    gacha: { transactions: [], pending: null, seq: 0, pulls: 0, seenSequenceCount: 0 },
    // audio:音量(0〜1)とミュート。bgm は旧設定(互換用。bgmMuted と同期)
    settings: { gachaPlaybackMode: 'FULL', haptic: true, bgm: true, favoriteSwipe: false, audio: { bgmVolume: 0.5, bgmMuted: false, seVolume: 1, voiceVolume: 1 } },
    home: { lastLines: [], visits: 0, lastVisitAt: null },
    stats: { totalClears: 0 },
    lastPlayedAt: null,
    migratedFrom: null,
  };
}

/** v1 → v2。例外を投げたら呼び出し側で v1 を保持する */
export function migrateV1(d1) {
  if (!d1 || typeof d1 !== 'object') throw new Error('v1 save is not an object');
  const d = blankSave();
  d.migratedFrom = 'squash-titan-progress-v1';
  const chars = { ...(d1.characters ?? {}) };
  for (const [oldId, newId] of Object.entries(LEGACY_CHARACTER_IDS)) {       // 旧キャラクター名(アクア等)の移行
    if (chars[oldId] && !chars[newId]) chars[newId] = chars[oldId];
    delete chars[oldId];
  }
  const t = now();
  for (const c of CHARACTERS) {
    const o = chars[c.id] ?? {};
    const lv = Number.isFinite(o.level) ? Math.max(1, Math.min(LEVELING.maxLevel, Math.floor(o.level))) : 1;
    const exp = Number.isFinite(o.exp) ? Math.max(0, Math.floor(o.exp)) : 0;
    // v23 で使えていたキャラ(= legacyRoster)は所持扱いで移行。取り上げない
    const usable = Config.ownership.legacyRoster.includes(c.id);
    d.characters[c.id] = charEntry({ owned: usable, level: lv, exp, obtainedAt: usable ? t : null, obtainedVia: usable ? 'legacy' : null, introducedAt: usable ? t : null });
  }
  let party = Array.isArray(d1.party) ? d1.party.map((id) => LEGACY_CHARACTER_IDS[id] ?? id) : null;
  if (!party || party.length !== 4 || party.some((id) => !characterById(id)) || new Set(party).size !== 4) party = [...DEFAULT_PARTY];
  d.party = party;
  d.favoriteCharacterId = party[0];                 // Favorite = Party A
  d.cleared = Array.isArray(d1.cleared) ? d1.cleared.filter((id) => STAGES.some((s) => s.id === id)) : [];
  // Stage × Difficulty の記録(v23)。records が無い古いセーブは cleared[] を NORMAL クリアとして移行
  if (d1.records && typeof d1.records === 'object') {
    for (const [sid, byDiff] of Object.entries(d1.records)) {
      for (const [diff, r] of Object.entries(byDiff ?? {})) {
        if (!DIFFS.includes(diff) || !r) continue;
        (d.records[sid] ??= {})[diff] = {
          clearCount: Math.max(0, r.clearCount | 0), bestRally: r.bestRally | 0, bestGateChain: r.bestGateChain | 0, bestHeartPerThrow: r.bestHeartPerThrow | 0,
          firstClearRewarded: (r.clearCount | 0) > 0,     // 既存クリアは初回報酬済み(二重報酬なし)
          ...(r.migrated ? { migrated: true } : {}),
        };
      }
    }
  } else {
    for (const sid of d.cleared) (d.records[sid] ??= {}).NORMAL = { clearCount: 1, bestRally: 0, bestGateChain: 0, bestHeartPerThrow: 0, firstClearRewarded: true, migrated: true };
  }
  d.flags = { ...(d1.flags ?? {}), starterGranted: true };   // 既存セーブには Starter を後から付与しない
  d.wallet.heartGem = 0;
  // 既存プレイヤーは今のステージ / 難易度を知っているので Pulse しない(knownContent = 今の全コンテンツ、unseen = [])
  d.knownContent = contentKeys();
  d.navPulse.unseen = [];
  d.stats.totalClears = Object.values(d.records).reduce((a, byD) => a + Object.values(byD).reduce((b, r) => b + (r.clearCount | 0), 0), 0);
  return d;
}

/** v2 の欠けを埋める(何度呼んでも同じ結果 = idempotent) */
export function normalizeV2(d) {
  const b = blankSave();
  const oldAudio = d.settings && typeof d.settings.audio === 'object' && d.settings.audio ? d.settings.audio : null;
  for (const k of Object.keys(b)) if (d[k] == null) d[k] = b[k];
  for (const k of ['wallet', 'flags', 'seen', 'missions', 'gacha', 'home', 'stats', 'player', 'navPulse', 'guidance', 'settings']) d[k] = { ...b[k], ...(d[k] ?? {}) };
  // 音量設定:無ければ既定値。旧設定で BGM OFF だった人はミュートで引き継ぐ
  d.settings.audio = { ...b.settings.audio, ...(oldAudio ?? {}) };
  if (!oldAudio && d.settings.bgm === false) d.settings.audio.bgmMuted = true;
  d.seen.banners ??= {};
  d.missions.claimed ??= {};
  d.gacha.transactions ??= [];
  d.home.lastLines ??= [];
  d.guidance.lastShown ??= {}; d.guidance.resolved ??= {};
  d.navPulse.unseen ??= [];
  // 新しい Stage / Difficulty が追加されていたら 攻略 を Pulse(knownContent に無いもの)
  const known = new Set(d.knownContent ?? []);
  for (const k of contentKeys()) if (!known.has(k)) { if (!d.navPulse.unseen.includes(k)) d.navPulse.unseen.push(k); known.add(k); }
  d.knownContent = [...known];
  for (const c of CHARACTERS) d.characters[c.id] = charEntry(d.characters[c.id] ?? {});
  for (const h of HEROINES) d.heroines[h.id] = heroineEntry(d.heroines[h.id] ?? {});
  if (!d.items || typeof d.items !== 'object' || Array.isArray(d.items)) d.items = {};
  if (!Array.isArray(d.party) || d.party.length !== 4 || d.party.some((id) => !characterById(id))) d.party = [...DEFAULT_PARTY];
  d.wallet.heartGem = Math.max(0, Math.floor(Number(d.wallet.heartGem) || 0));
  d.version = 2;
  return d;
}

/** 親密度ポイント → レベル(INTIMACY.levels が未決定なら null)*/
export function intimacyLevel(points) {
  const t = INTIMACY.levels;
  if (!Array.isArray(t) || !t.length) return null;
  const p = num(points);
  let lv = 0;
  for (let i = 0; i < t.length; i++) if (p >= t[i]) lv = i + 1;
  return lv;
}

export class PlayerProgress {
  constructor(repo = new ProgressRepository()) {
    this.repo = repo;
    this.saveBlocked = false;
    this.data = this.load();
  }

  load() {
    const v2 = this.repo.readV2();
    if (v2 && typeof v2 === 'object' && v2.version === 2) {
      const d = normalizeV2(v2);
      this.ensureOwnership(d);
      this.data = d; this.syncAsmrUnlocks(); this.save();
      Log.info('SAVE', 'loaded v2');
      return d;
    }
    if (v2 === undefined) Log.warn('SAVE', 'v2 is corrupt → try v1');
    const v1 = this.repo.readV1();
    if (v1 !== null) {   // v1 が存在する(壊れていても)→ 移行を試み、失敗したら v1 を残して v2 は書かない
      try {
        const d = normalizeV2(migrateV1(v1));
        this.ensureOwnership(d);
        if (!d.party.every((id) => d.characters[id]?.owned)) throw new Error('migrated party contains unowned characters');
        this.data = d;
        this.syncAsmrUnlocks();
        this.save();
        Log.info('SAVE', 'migrated v1 → v2');
        return d;
      } catch (e) {
        Log.warn('SAVE', 'migration failed; v1 kept, v2 not written:', e?.message);
        this.saveBlocked = true;
        const d = normalizeV2(blankSave());
        this.ensureOwnership(d);
        return d;
      }
    }
    // 新規セーブ
    const d = normalizeV2(blankSave());
    if (Config.starter.grantOnNewSave) {
      for (const id of Config.starter.characters) if (d.characters[id]) Object.assign(d.characters[id], { owned: true, obtainedAt: now(), obtainedVia: 'starter', introducedAt: now() });
      d.flags.starterGranted = true;
    }
    d.navPulse.unseen = ['tutorial'];   // 初回:攻略へ誘導(攻略を押したら終了)
    this.ensureOwnership(d);
    const owned = CHARACTERS.filter((c) => d.characters[c.id].owned).map((c) => c.id);
    if (!d.party.every((id) => d.characters[id].owned) && owned.length >= 4) d.party = owned.slice(0, 4);
    d.favoriteCharacterId = d.party.find((id) => d.characters[id].owned) ?? owned[0] ?? null;
    this.data = d; this.save();
    Log.info('SAVE', 'new save');
    return d;
  }

  /** LEGACY_ALL:既存ロスターを所持扱いにする(true → false には絶対に戻さない) */
  ensureOwnership(d) {
    if (Config.ownership.mode !== 'LEGACY_ALL') return;
    for (const id of Config.ownership.legacyRoster) {
      const c = d.characters[id];
      if (c && !c.owned) { c.owned = true; c.obtainedAt ??= now(); c.obtainedVia ??= 'legacy'; c.introducedAt ??= now(); }
    }
  }

  save() {
    if (this.saveBlocked) return false;
    this.data.lastSavedAt = now();
    return this.repo.write(this.data);
  }

  /** テスト / デバッグ用:v2 を消して作り直す(v1 は残す) */
  reset() { this.repo.clearV2(); this.saveBlocked = false; this.data = this.load(); }

  // ---------------- 所持 ----------------
  isOwned(id) { return !!this.data.characters[id]?.owned; }
  get ownedIds() { return CHARACTERS.filter((c) => this.isOwned(c.id)).map((c) => c.id); }
  /** キャラクター取得(ガチャ / 報酬)。firstTime を返す */
  grant(id, at = now(), via = 'gacha') {
    const c = this.data.characters[id];
    if (!c) return false;
    const first = !c.owned;
    if (first) { c.owned = true; c.obtainedAt = at; c.obtainedVia = via; c.introducedAt = null; }
    return first;   // owned を false にする処理は持たない(追加のみ)
  }
  /** 獲得したキャラを初めて見た(Detail / HOME)*/
  markIntroduced(id) { const c = this.data.characters[id]; if (c && !c.introducedAt) { c.introducedAt = now(); this.save(); return true; } return false; }

  // ---------------- パーティ / お気に入り ----------------
  get party() { return this.data.party; }
  setParty(ids) { this.data.party = [...ids]; this.save(); }
  get favoriteId() {
    const f = this.data.favoriteCharacterId;
    return f && this.isOwned(f) ? f : this.party.find((id) => this.isOwned(id)) ?? this.ownedIds[0] ?? null;
  }
  /** お気に入り(HOME のキャラ)を設定。{ first: 初めてホームに設定されたか } */
  setFavorite(id) {
    if (!this.isOwned(id)) return null;
    const c = this.data.characters[id];
    const first = !c.firstHomeSetAt;
    if (first) c.firstHomeSetAt = now();
    const changed = this.data.favoriteCharacterId !== id;
    this.data.favoriteCharacterId = id;
    // HOME が trigger を決める:初めて HOME に設定 = newlySetHome / 2回目以降 = setHome(afterGacha より優先)
    if (first || changed) this.data.pendingHomeTrigger = { key: first ? 'newlySetHome' : 'setHome', t: now(), id };
    this.save();
    return { first, changed };
  }

  // ---------------- 記録 ----------------
  /** diff 省略時は「どれかの難易度でクリア済み」 */
  isCleared(stageId, diff) {
    const r = this.data.records[stageId];
    if (!diff) return this.data.cleared.includes(stageId) || !!(r && Object.values(r).some((x) => x.clearCount > 0));
    return (r?.[diff]?.clearCount ?? 0) > 0;
  }
  record(stageId, diff) { return this.data.records[stageId]?.[diff] ?? null; }

  /** クリアを記録(ClearCount + ベスト値)。初回クリア報酬(仮)もここで1度だけ付与 → { record, firstClearGem } */
  markCleared(stageId, diff = 'NORMAL', stats = {}) {
    if (!this.data.cleared.includes(stageId)) this.data.cleared.push(stageId);
    const r = ((this.data.records[stageId] ??= {})[diff] ??= { clearCount: 0, bestRally: 0, bestGateChain: 0, bestHeartPerThrow: 0, firstClearRewarded: false });
    r.clearCount++;
    r.bestRally = Math.max(r.bestRally, Math.round(stats.maxRally ?? 0));
    r.bestGateChain = Math.max(r.bestGateChain, Math.round(stats.maxGateChain ?? 0));
    r.bestHeartPerThrow = Math.max(r.bestHeartPerThrow, Math.round(stats.bestHit ?? 0));
    delete r.migrated;
    let firstClearGem = 0;
    if (!r.firstClearRewarded) {
      r.firstClearRewarded = true;
      firstClearGem = Config.rewards.firstClearGem[diff] ?? 0;
      this.data.wallet.heartGem += firstClearGem;
    }
    this.data.stats.totalClears = (this.data.stats.totalClears ?? 0) + 1;
    this.data.lastPlayedAt = now();
    const asmrUnlocked = this.syncAsmrUnlocks();   // HELL クリア等で新しく解放された ASMR(リザルトの演出用)
    this.save();
    Object.defineProperty(r, 'firstClearGem', { value: firstClearGem, enumerable: false, configurable: true });
    Object.defineProperty(r, 'asmrUnlocked', { value: asmrUnlocked, enumerable: false, configurable: true });
    return r;
  }

  /** 攻略 Pulse:Stage Select を開いたら既読(tutorial は攻略を押した時点で終了)*/
  clearNavPulse() { if (this.data.navPulse.unseen.length) { this.data.navPulse.unseen = []; this.save(); } }
  setPendingHomeTrigger(key, extra = {}) { this.data.pendingHomeTrigger = { key, t: now(), ...extra }; this.save(); }
  takePendingHomeTrigger() { const t = this.data.pendingHomeTrigger; this.data.pendingHomeTrigger = null; return t; }

  flag(k) { return !!this.data.flags[k]; }
  setFlag(k) { this.data.flags[k] = true; this.save(); }

  // ---------------- HEART GEM ----------------
  get gem() { return this.data.wallet.heartGem; }
  addGem(n) { this.data.wallet.heartGem = Math.max(0, this.data.wallet.heartGem + Math.floor(n)); this.save(); }

  // ---------------- キャラクター(マスター + 進行度)----------------
  character(id) {
    const base = characterById(id);
    const p = this.data.characters[id] ?? charEntry();
    const lv = p.level;
    return {
      ...base,
      owned: p.owned,
      level: lv,
      exp: p.exp,
      nextExp: lv >= LEVELING.maxLevel ? 0 : LEVELING.nextExp(lv),
      atk: base.atk + LEVELING.growth.atk * (lv - 1) + num(p.bonus?.atk),
      def: base.def + LEVELING.growth.def * (lv - 1) + num(p.bonus?.def),
      intimacy: num(p.intimacy),
      intimacyLevel: intimacyLevel(p.intimacy),
    };
  }

  addExp(id, amount) {
    const before = this.character(id);
    const p = this.data.characters[id];
    p.exp += amount;
    let levelUps = 0;
    while (p.level < LEVELING.maxLevel && p.exp >= LEVELING.nextExp(p.level)) {
      p.exp -= LEVELING.nextExp(p.level);
      p.level++;
      levelUps++;
    }
    if (p.level >= LEVELING.maxLevel) p.exp = 0;
    this.save();
    return { before, after: this.character(id), levelUps, gained: amount };
  }

  // ---------------- 親密度(味方の女の子)----------------
  addIntimacy(id, amount) {
    const p = this.data.characters[id];
    if (!p || !this.isOwned(id)) return null;
    const before = this.character(id);
    p.intimacy = Math.max(0, num(p.intimacy) + Math.floor(num(amount)));
    this.save();
    return { before, after: this.character(id) };
  }

  // ---------------- プレゼント(所持数 / 渡す)----------------
  itemCount(giftId) { return Math.max(0, Math.floor(num(this.data.items[giftId]))); }
  addItem(giftId, n = 1) {
    if (!giftById(giftId)) return false;
    this.data.items[giftId] = this.itemCount(giftId) + Math.floor(num(n));
    this.save();
    return true;
  }
  /**
   * 味方の女の子にプレゼントを1つ渡す。効果(GIFTS.effect)が未決定(null)の項目は上がらない
   * → { gift, levelUps, gainedExp, gainedIntimacy, reaction, before, after } / 渡せない時は null
   */
  giveGift(characterId, giftId) {
    const gift = giftById(giftId), p = this.data.characters[characterId];
    if (!gift || !p || !this.isOwned(characterId) || this.itemCount(giftId) < 1) return null;
    const before = this.character(characterId);
    this.data.items[giftId] = this.itemCount(giftId) - 1;
    const e = gift.effect ?? {};
    p.intimacy = Math.max(0, num(p.intimacy) + Math.floor(num(e.intimacy)));
    p.bonus = { atk: num(p.bonus?.atk) + Math.floor(num(e.atk)), def: num(p.bonus?.def) + Math.floor(num(e.def)) };
    const exp = Math.floor(num(e.exp));
    const levelUps = exp > 0 ? this.addExp(characterId, exp).levelUps : 0;
    this.save();
    const R = gift.reactions ?? {};
    const lines = R.byCharacter?.[characterId]?.length ? R.byCharacter[characterId] : (Array.isArray(R) ? R : R.default ?? []);
    const reaction = lines.length ? lines[Math.floor(Math.random() * lines.length)] : null;
    return { gift, levelUps, gainedExp: exp, gainedIntimacy: Math.floor(num(e.intimacy)), reaction, before, after: this.character(characterId) };
  }

  // ---------------- ASMR(攻略対象のみ)----------------
  /** 条件 { type, ... } を満たしているか。heroine はステージ省略時の基準 */
  isConditionMet(cond, heroine) {
    if (!cond) return false;
    if (cond.type === 'clear') {
      const stageId = cond.stageId ?? heroine?.stageId;
      return !!stageId && this.isCleared(stageId, cond.difficulty);
    }
    return false;   // 未知の条件は解放しない
  }
  /** その攻略対象の ASMR 一覧(解放状態つき)*/
  asmrTracks(heroineId) {
    const h = heroineById(heroineId);
    if (!h) return [];
    const st = this.data.heroines[h.id] ?? heroineEntry();
    return h.asmr.map((t) => {
      const unlock = t.unlock ?? HEROINE_ASMR_UNLOCK;
      const unlockedAt = st.asmrUnlocked[t.id] ?? null;
      return { ...t, heroineId: h.id, unlock, unlocked: !!unlockedAt, unlockedAt, isNew: !!unlockedAt && !st.asmrSeen[t.id], playable: !!unlockedAt && !!t.src };
    });
  }
  /** 条件を満たした ASMR を解放済みにする(一度解放したら戻さない)→ 新しく解放した [{ heroineId, trackId }] */
  syncAsmrUnlocks() {
    const fresh = [];
    for (const h of HEROINES) {
      const st = (this.data.heroines[h.id] ??= heroineEntry());
      for (const t of h.asmr) {
        if (st.asmrUnlocked[t.id]) continue;
        if (this.isConditionMet(t.unlock ?? HEROINE_ASMR_UNLOCK, h)) { st.asmrUnlocked[t.id] = now(); fresh.push({ heroineId: h.id, trackId: t.id }); }
      }
    }
    return fresh;
  }
  /** 解放済み ASMR を初めて開いた(NEW 表示を消す)*/
  markAsmrSeen(heroineId, trackId) {
    const st = this.data.heroines[heroineId];
    if (!st?.asmrUnlocked[trackId] || st.asmrSeen[trackId]) return false;
    st.asmrSeen[trackId] = now();
    this.save();
    return true;
  }
  heroineForStage(stageId) { return heroineByStage(stageId) ?? null; }
}
