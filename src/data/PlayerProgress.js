import { CHARACTERS, DEFAULT_PARTY, LEGACY_CHARACTER_IDS, STAGES, characterById } from './GameData.js';
import { Config } from '../core/Config.js';
import { HEROINES, REWARD_VOICE_SLOTS, rewardUnlock, heroineById, heroineByStage, giftById, giftExp } from './RomanceData.js';
import { STAMINA, ABILITY_RESET_ITEM, STAT_KEYS } from './GrowthData.js';
import { abilityById as ABILITY_BY_ID, ultimateFor as ULT_FOR, affectionProgress, maxAffectionExp, levelFromExp, statsAt, activeAbilities, abilitySlots, recoverStamina, battleReward, expAfterStamina } from './Growth.js';
import { storage, Log } from '../app/Platform.js';

/**
 * PlayerProgress v2(保存キー heart-strike-progress-v2)
 *   characters[id] = { owned, affectionLevel, affectionExp, stamina, lastStaminaUpdate, selectedAbilities, obtainedAt, firstHomeSetAt, … }
 *       ← 固定 Character ID(表示名は使わない)。親密度 = レベル(AFFECTION Lv.1〜100)
 *       affectionExp … 累計の親密度 EXP(Lv はここから計算。affectionLevel は表示・確認用に同じ値を保存)
 *       stamina / lastStaminaUpdate … キャラごとの STAMINA と最後に更新した時刻(アプリを閉じている間の回復はここから計算)
 *       selectedAbilities … { '10': abilityId, … }(Lv10〜90 で選んだアビリティ)
 *       legacyGrowth … 旧セーブの { level, exp, intimacy }(移行の記録。使わない)
 *   inventory = { presents: { giftId: 所持数 }, abilityResetItems: 数 }(旧 items はここへ移す)
 *   heroines[heroineId] = { voiceUnlocked: { voiceId: 解放時刻 }, voiceSeen: { voiceId: 初めて開いた時刻 } }   ← 攻略対象(味方ではない)のクリア報酬ボイス
 *       (旧 asmrUnlocked / asmrSeen は読み込み時に voiceUnlocked / voiceSeen へ移す)
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
// 旧仕様(キャラ Lv1〜50:次の Lv まで 100 + 50×(Lv−1))。移行の計算だけに使う
const legacyNextExp = (lv) => 100 + (lv - 1) * 50;
/** 旧セーブのキャラ Lv / EXP と親密度ポイントを、親密度 EXP(累計)へ移す:旧レベルまでに使った EXP + 今の EXP + 親密度ポイント */
export function legacyAffectionExp(level, exp, intimacy) {
  const lv = Math.max(1, Math.min(50, Math.floor(Number(level) || 1)));
  let total = 0;
  for (let l = 1; l < lv; l++) total += legacyNextExp(l);
  return Math.min(maxAffectionExp(), total + Math.max(0, Math.floor(Number(exp) || 0)) + Math.max(0, Math.floor(Number(intimacy) || 0)));
}
/** 味方キャラの保存枠(欠けを埋める・旧フィールドは移す。何度呼んでも同じ)*/
const charEntry = (o = {}) => {
  const { level, exp, intimacy, bonus, ...rest } = o;
  const hasLegacy = !Number.isFinite(rest.affectionExp) && (level != null || exp != null || intimacy != null);
  const affectionExp = Number.isFinite(rest.affectionExp) ? Math.min(maxAffectionExp(), Math.max(0, Math.floor(rest.affectionExp))) : hasLegacy ? legacyAffectionExp(level, exp, intimacy) : 0;
  return {
    owned: false, obtainedAt: null, obtainedVia: null, firstHomeSetAt: null, introducedAt: null,
    ...rest,
    affectionExp,
    affectionLevel: levelFromExp(affectionExp),
    stamina: Number.isFinite(rest.stamina) ? Math.max(0, Math.min(STAMINA.max, rest.stamina)) : STAMINA.max,
    lastStaminaUpdate: Number.isFinite(rest.lastStaminaUpdate) ? rest.lastStaminaUpdate : now(),
    selectedAbilities: rest.selectedAbilities && typeof rest.selectedAbilities === 'object' ? { ...rest.selectedAbilities } : {},
    ...(hasLegacy ? { legacyGrowth: { level: level ?? null, exp: exp ?? null, intimacy: intimacy ?? null } } : {}),
  };
};
const heroineEntry = ({ asmrUnlocked, asmrSeen, ...o } = {}) => ({ ...o, voiceUnlocked: { ...(asmrUnlocked ?? {}), ...(o.voiceUnlocked ?? {}) }, voiceSeen: { ...(asmrSeen ?? {}), ...(o.voiceSeen ?? {}) } });
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
    inventory: { presents: {}, abilityResetItems: 0 },
    records: {},
    cleared: [],
    wallet: { heartGem: 10000 },       // 新規セーブの初期 HEART GEM(既存セーブの所持数は変えない)
    flags: { starterGranted: false, hellConfirmed: false, devGrants: [] },
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
    const lv = Number.isFinite(o.level) ? Math.max(1, Math.min(50, Math.floor(o.level))) : 1;
    const exp = Number.isFinite(o.exp) ? Math.max(0, Math.floor(o.exp)) : 0;
    // v23 で使えていたキャラ(= legacyRoster)は所持扱いで移行。取り上げない
    const usable = Config.ownership.legacyRoster.includes(c.id);
    d.characters[c.id] = charEntry({ owned: usable, level: lv, exp, obtainedAt: usable ? t : null, obtainedVia: usable ? 'legacy' : null, introducedAt: usable ? t : null });   // 旧 Lv / EXP → 親密度 EXP
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

/**
 * 開発・テスト用の所持数の調整(Config.devGrants)。各 id は1つのセーブに1回だけ(flags.devGrants に記録)。
 * 所持データそのものを書き換えるので、その後のガチャ等の消費・獲得は普通に反映される
 */
export function applyDevGrants(d, grants = Config.devGrants ?? []) {
  const done = Array.isArray(d.flags.devGrants) ? d.flags.devGrants : [];
  for (const g of grants) {
    if (!g?.id || done.includes(g.id)) continue;
    if (Number.isFinite(g.set?.heartGem)) d.wallet.heartGem = Math.max(0, Math.floor(g.set.heartGem));
    done.push(g.id);
    Log.info('SAVE', `dev grant ${g.id}`);
  }
  d.flags.devGrants = done;
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
  // インベントリ:旧 items(プレゼントの所持数)を inventory.presents へ移す
  const inv = d.inventory && typeof d.inventory === 'object' && !Array.isArray(d.inventory) ? d.inventory : {};
  const presents = { ...(d.items && typeof d.items === 'object' && !Array.isArray(d.items) ? d.items : {}), ...(inv.presents && typeof inv.presents === 'object' ? inv.presents : {}) };
  d.inventory = { ...inv, presents, abilityResetItems: Math.max(0, Math.floor(Number(inv.abilityResetItems) || 0)) };
  delete d.items;
  if (!Array.isArray(d.party) || d.party.length !== 4 || d.party.some((id) => !characterById(id))) d.party = [...DEFAULT_PARTY];
  d.wallet.heartGem = Math.max(0, Math.floor(Number(d.wallet.heartGem) || 0));
  applyDevGrants(d);
  d.version = 2;
  return d;
}

const ABILITY_DEF = (id) => { const a = ABILITY_BY_ID(id); return a ? { name: a.name, desc: a.desc, effects: a.effects, ultimate: !!a.ultimate } : {}; };
const ULT_DEF = (charId) => ULT_FOR(charId);

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
      this.data = d; this.syncVoiceUnlocks(); this.save();
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
        this.syncVoiceUnlocks();
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
    const voiceUnlocked = this.syncVoiceUnlocks();   // このクリアで新しく解放された報酬ボイス(リザルトの演出用)
    this.save();
    Object.defineProperty(r, 'firstClearGem', { value: firstClearGem, enumerable: false, configurable: true });
    Object.defineProperty(r, 'voiceUnlocked', { value: voiceUnlocked, enumerable: false, configurable: true });
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

  // ---------------- キャラクター(マスター + 育成)----------------
  /**
   * 表示・戦闘用のキャラ情報(マスター + 親密度 Lv + ステータス + アビリティ + STAMINA)
   *   affectionLevel(= level)/ affectionExp(累計)/ expInto・expNeed(今の Lv の中の進み)/ maxLevel
   *   stats { attack, defence, control, curve }(アビリティの加算込み)/ abilities(有効なもの)
   *   stamina(自然回復を反映した今の値。保存は spend / recover の時)/ tired(STAMINA 0:獲得 EXP ×10%)
   */
  character(id, at = now()) {
    const base = characterById(id);
    const p = this.data.characters[id] ?? charEntry();
    const prog = affectionProgress(p.affectionExp);
    const abilities = activeAbilities(id, prog.level, p.selectedAbilities);
    const st = recoverStamina(p.stamina, p.lastStaminaUpdate, at);
    return {
      ...base,
      owned: p.owned,
      affectionLevel: prog.level, level: prog.level,
      affectionExp: prog.total, expInto: prog.into, expNeed: prog.need, maxLevel: prog.max,
      stats: statsAt(id, prog.level, abilities),
      abilities,
      selectedAbilities: { ...p.selectedAbilities },
      stamina: st.stamina, staminaMax: STAMINA.max, tired: st.stamina <= 0,
    };
  }

  /**
   * 親密度 EXP を足す(Lv100 で止まる)→ { before, after, gained, levelUps, newAbilitySlots: [Lv…], ultimate }
   *   newAbilitySlots … このレベルアップで新しく選べるようになったアビリティの枠(Lv10〜90)
   */
  addAffectionExp(id, amount, { save = true } = {}) {
    const p = this.data.characters[id];
    if (!p) return null;
    const before = this.character(id);
    p.affectionExp = Math.min(maxAffectionExp(), Math.max(0, p.affectionExp + Math.max(0, Math.floor(Number(amount) || 0))));
    p.affectionLevel = levelFromExp(p.affectionExp);
    const after = this.character(id);
    const slots = Object.keys(abilitySlots(id)).map(Number);
    const newAbilitySlots = slots.filter((lv) => before.level < lv && after.level >= lv);
    if (save) this.save();
    return { before, after, gained: after.affectionExp - before.affectionExp, levelUps: after.level - before.level, newAbilitySlots, ultimate: before.level < 100 && after.level >= 100 };
  }
  /** 旧 API の互換(EXP = 親密度 EXP)*/
  addExp(id, amount) { return this.addAffectionExp(id, amount); }

  // ---------------- STAMINA(キャラごと)----------------
  /** 自然回復を保存に反映(画面を開いた時など)。値を返す */
  recoverStamina(id, at = now()) {
    const p = this.data.characters[id];
    if (!p) return 0;
    const r = recoverStamina(p.stamina, p.lastStaminaUpdate, at);
    p.stamina = r.stamina; p.lastStaminaUpdate = r.last;
    return p.stamina;
  }
  /** STAMINA を減らす(0 未満にしない)*/
  spendStamina(id, amount, at = now()) {
    const p = this.data.characters[id];
    if (!p) return null;
    const before = this.recoverStamina(id, at);
    p.stamina = Math.max(0, before - Math.max(0, amount));
    if (before >= STAMINA.max) p.lastStaminaUpdate = at;   // 満タンから減らした時は、ここから回復の時間を数える
    return { before, after: p.stamina };
  }

  /**
   * 攻略の結果(クリア / 敗北):参加した味方に親密度 EXP + STAMINA 消費
   *   EXP は出撃時の STAMINA で決める(0 なら ×10%)。STAMINA 0 でも出撃でき、戦闘の強さは変わらない
   *   → [{ id, base, gained, tired, stamina: { before, after }, …addAffectionExp の結果 }]
   */
  battleRewards(result, difficulty, ids, at = now()) {
    const R = battleReward(result, difficulty);
    const out = [];
    for (const id of ids) {
      if (!this.data.characters[id]) continue;
      const before = this.recoverStamina(id, at);
      const exp = expAfterStamina(R.exp, before);
      const r = this.addAffectionExp(id, exp, { save: false });
      const st = this.spendStamina(id, R.cost, at);
      out.push({ id, base: R.exp, tired: before <= 0, ...r, stamina: st, after: this.character(id, at) });
    }
    this.save();
    return out;
  }

  // ---------------- アビリティ ----------------
  get abilityResetItems() { return this.data.inventory.abilityResetItems; }
  addAbilityResetItems(n = 1) { this.data.inventory.abilityResetItems = Math.max(0, this.abilityResetItems + Math.floor(Number(n) || 0)); this.save(); return this.abilityResetItems; }
  /** Lv の枠の状態 → [{ level, candidates: [ability…], selected, unlocked, ultimate }] */
  abilityBoard(id) {
    const ch = this.character(id), sel = ch.selectedAbilities;
    const rows = Object.entries(abilitySlots(id)).map(([lv, ids]) => ({
      level: Number(lv), unlocked: ch.level >= Number(lv), selected: sel[lv] ?? null,
      candidates: ids.map((x) => ({ id: x, ...ABILITY_DEF(x) })).filter((x) => x.name),
    })).sort((a, b) => a.level - b.level);
    const ult = ULT_DEF(id);
    if (ult) rows.push({ level: 100, unlocked: ch.level >= 100, selected: ult.id, candidates: [ult], ultimate: true });
    return rows;
  }
  /**
   * アビリティを選ぶ。まだ選んでいない枠は無料 / 選択済みの枠を変える時は ABILITY_RESET_ITEM を1つ使う
   *   → { ok, reason?: 'locked' | 'invalid' | 'same' | 'noItem', changed, itemsLeft }
   */
  selectAbility(id, level, abilityId) {
    const p = this.data.characters[id];
    if (!p || !this.isOwned(id)) return { ok: false, reason: 'invalid' };
    const lv = String(level), ids = abilitySlots(id)[lv];
    if (!ids || !ids.includes(abilityId)) return { ok: false, reason: 'invalid' };
    if (levelFromExp(p.affectionExp) < Number(lv)) return { ok: false, reason: 'locked' };
    const cur = p.selectedAbilities[lv];
    if (cur === abilityId) return { ok: false, reason: 'same' };
    if (cur) {
      if (this.abilityResetItems < 1) return { ok: false, reason: 'noItem' };
      this.data.inventory.abilityResetItems -= 1;
    }
    p.selectedAbilities[lv] = abilityId;
    this.save();
    return { ok: true, changed: !!cur, itemsLeft: this.abilityResetItems };
  }

  // ---------------- MULTI:自分のキャラの戦闘データ(他プレイヤーへ送る)----------------
  /** 戦闘で使う値だけ(Lv / ステータス / 有効なアビリティの ID)*/
  combatProfile(id) {
    const ch = this.character(id);
    return { characterId: id, level: ch.level, stats: { ...ch.stats }, abilities: ch.abilities.map((a) => a.id) };
  }
  /** 他プレイヤーのキャラ:マスター + そのプレイヤーの育成(profile)。自分のセーブは使わない */
  characterFromProfile(id, profile) {
    const base = characterById(id) ?? characterById(DEFAULT_PARTY[0]);
    const lv = Math.max(1, Math.min(100, Math.floor(Number(profile?.level) || 1)));
    const stats = {};
    for (const k of STAT_KEYS) stats[k] = Math.max(0, Math.min(100, Math.round(Number(profile?.stats?.[k] ?? statsAt(base.id, lv)[k]))));
    const abilities = (Array.isArray(profile?.abilities) ? profile.abilities : []).map((x) => (ABILITY_DEF(x).name ? { id: x, ...ABILITY_DEF(x) } : null)).filter(Boolean);
    return { ...base, owned: true, affectionLevel: lv, level: lv, stats, abilities, stamina: STAMINA.max, staminaMax: STAMINA.max, tired: false, remote: true };
  }

  // ---------------- プレゼント(所持数 / 渡す)----------------
  itemCount(giftId) { return Math.max(0, Math.floor(num(this.data.inventory.presents[giftId]))); }
  addItem(giftId, n = 1) {
    if (!giftById(giftId)) return false;
    this.data.inventory.presents[giftId] = this.itemCount(giftId) + Math.floor(num(n));
    this.save();
    return true;
  }
  /**
   * 味方の女の子にプレゼントを1つ渡す → 親密度 EXP(ランクの EXP。好物なら ×1.5)
   *   → { gift, gainedExp, levelUps, newAbilitySlots, reaction, before, after } / 渡せない時は null
   */
  giveGift(characterId, giftId) {
    const gift = giftById(giftId), p = this.data.characters[characterId];
    if (!gift || !p || !this.isOwned(characterId) || this.itemCount(giftId) < 1) return null;
    this.data.inventory.presents[giftId] = this.itemCount(giftId) - 1;
    const exp = giftExp(gift, characterById(characterId));
    const r = this.addAffectionExp(characterId, exp, { save: false });
    this.save();
    const R = gift.reactions ?? {};
    const lines = R.byCharacter?.[characterId]?.length ? R.byCharacter[characterId] : (Array.isArray(R) ? R : R.default ?? []);
    const reaction = lines.length ? lines[Math.floor(Math.random() * lines.length)] : null;
    return { gift, gainedExp: r.gained, levelUps: r.levelUps, newAbilitySlots: r.newAbilitySlots, ultimate: r.ultimate, reaction, before: r.before, after: r.after };
  }

  // ---------------- クリア報酬ボイス(攻略対象のみ。NORMAL / HARD = ボイス、HELL = ASMR)----------------
  /** 条件 { type, ... } を満たしているか。heroine はステージ省略時の基準 */
  isConditionMet(cond, heroine) {
    if (!cond) return false;
    if (cond.type === 'clear') {
      const stageId = cond.stageId ?? heroine?.stageId;
      return !!stageId && this.isCleared(stageId, cond.difficulty);
    }
    return false;   // 未知の条件は解放しない
  }
  /**
   * その攻略対象の報酬ボイス(難易度の枠ごと。未設定の枠も含む)
   *   → [{ difficulty, type, voice(データ or null), unlock, cleared, unlocked, isNew, playable }]
   */
  rewardVoices(heroineId) {
    const h = heroineById(heroineId);
    if (!h) return [];
    const st = this.data.heroines[h.id] ?? heroineEntry();
    return REWARD_VOICE_SLOTS.map(({ difficulty, type }) => {
      const v = h.rewardVoices?.[difficulty] ?? null;
      const unlockedAt = v ? st.voiceUnlocked[v.id] ?? null : null;
      return {
        difficulty, type: v?.type ?? type, voice: v, id: v?.id ?? null, title: v?.title ?? null, src: v?.src ?? null,
        unlock: rewardUnlock(difficulty), cleared: this.isCleared(h.stageId, difficulty),
        unlocked: !!unlockedAt, unlockedAt, isNew: !!unlockedAt && !st.voiceSeen[v.id], playable: !!unlockedAt && !!v?.src,
      };
    });
  }
  /** 条件を満たした報酬ボイスを解放済みにする(一度解放したら戻さない)→ 新しく解放した [{ heroineId, voiceId, difficulty, type }] */
  syncVoiceUnlocks() {
    const fresh = [];
    for (const h of HEROINES) {
      const st = (this.data.heroines[h.id] ??= heroineEntry());
      for (const { difficulty, type } of REWARD_VOICE_SLOTS) {
        const v = h.rewardVoices?.[difficulty];
        if (!v?.id || st.voiceUnlocked[v.id]) continue;
        if (this.isConditionMet(rewardUnlock(difficulty), h)) { st.voiceUnlocked[v.id] = now(); fresh.push({ heroineId: h.id, voiceId: v.id, difficulty, type: v.type ?? type }); }
      }
    }
    return fresh;
  }
  /** 解放済みのボイスを初めて開いた(NEW 表示を消す)*/
  markVoiceSeen(heroineId, voiceId) {
    const st = this.data.heroines[heroineId];
    if (!st?.voiceUnlocked[voiceId] || st.voiceSeen[voiceId]) return false;
    st.voiceSeen[voiceId] = now();
    this.save();
    return true;
  }
  heroineForStage(stageId) { return heroineByStage(stageId) ?? null; }
}
