import { Config } from '../core/Config.js';
import { characterById } from '../data/GameData.js';
import { Log } from '../app/Platform.js';

/**
 * GachaService(抽選 + Transaction。演出を一切知らない)
 *   PENDING(メモリのみ)→ COMMITTED(GEM 消費・結果・キャラ付与・pendingReveal を 1回の保存で確定)→ REVEALED
 *   COMMITTED 前に失敗 = ABORTED(何も変わらない)
 * 投げ方(POWER / AIM / SPIN / タイミング)は抽選に一切使わない。演出からの書き戻しも無い。
 * ローカル抽選(Prototype)。Server 抽選の方式は UNDECIDED(txId を冪等キーにできる形にしてある)。
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const RANK_ORDER = ['R', 'SR', 'SSR'];

export class GachaService {
  constructor(progress) {
    this.p = progress;
    this.pools = new Map();
    for (const b of Config.gacha.banners) this.pools.set(b.id, this.buildPool(b));
  }

  banner(id) { return Config.gacha.banners.find((b) => b.id === id) ?? Config.gacha.banners[0]; }

  /** Pool = banner.pool のうち最新 CharacterData に実在するキャラだけ(存在しない ID は除外して警告)*/
  buildPool(b) {
    const out = [];
    for (const e of b.pool ?? []) {
      const c = characterById(e.characterId);
      if (!c) { Log.warn('GACHA', `pool: unknown characterId "${e.characterId}" removed from ${b.id}`); continue; }
      out.push({ ...e, rarity: c.rank, weight: e.weight ?? 1 });
    }
    return out;
  }
  pool(bannerId) { return this.pools.get(bannerId) ?? []; }

  /** 抽選(提供割合のみを使用)→ [{ drawIndex, characterId, rarity }] */
  draw(banner, count, rng) {
    const pool = this.pool(banner.id);
    const rates = banner.rates;
    const pickRarity = (min = null) => {
      const keys = RANK_ORDER.filter((k) => pool.some((e) => e.rarity === k) && (!min || RANK_ORDER.indexOf(k) >= RANK_ORDER.indexOf(min)));
      const total = keys.reduce((a, k) => a + (rates[k] ?? 0), 0);
      let r = rng() * total;
      for (const k of keys) { r -= rates[k] ?? 0; if (r <= 0) return k; }
      return keys[keys.length - 1];
    };
    const pickChar = (rar) => {
      const c = pool.filter((e) => e.rarity === rar);
      const tw = c.reduce((a, e) => a + e.weight, 0);
      let r = rng() * tw;
      for (const e of c) { r -= e.weight; if (r <= 0) return e.characterId; }
      return c[c.length - 1].characterId;
    };
    const items = [];
    for (let i = 0; i < count; i++) { const rar = pickRarity(); items.push({ drawIndex: i, characterId: pickChar(rar), rarity: rar }); }
    // 10連保証(仮):全部 min 未満なら最後の1体を min 以上で引き直す
    const min = count >= 10 ? banner.guarantee?.tenPullMinRarity : null;
    if (min && items.every((x) => RANK_ORDER.indexOf(x.rarity) < RANK_ORDER.indexOf(min))) {
      const rar = pickRarity(min);
      items[count - 1] = { drawIndex: count - 1, characterId: pickChar(rar), rarity: rar };
    }
    return items;
  }

  cost(banner, count) { return count >= 10 ? banner.cost.ten : banner.cost.single * count; }

  /**
   * ×1 / ×10 を1つの Transaction として実行。
   * @param opts.seed 乱数の種(テスト用)/ opts.forceItems:[characterId…](デバッグ用の強制結果)
   * @returns { status:'COMMITTED', result } | { status:'ABORTED', reason }
   */
  commit(bannerId, count, opts = {}) {
    const d = this.p.data;
    const banner = this.banner(bannerId);
    if (d.gacha.pending) return { status: 'ABORTED', reason: 'PENDING_REVEAL' };   // 未表示の結果がある間は引けない(引き直し防止)
    const cost = this.cost(banner, count);
    // PENDING(メモリのみ。まだ何も確定していない)
    if (d.wallet.heartGem < cost) return { status: 'ABORTED', reason: 'GEM' };
    const seed = opts.seed ?? Config.gacha.seed ?? Math.floor(Math.random() * 2 ** 31);
    const rng = mulberry32(seed);
    let drawn = this.draw(banner, count, rng);
    if (opts.forceItems?.length) drawn = opts.forceItems.slice(0, count).map((id, i) => ({ drawIndex: i, characterId: id, rarity: characterById(id).rank }));
    // NEW 判定は抽選時に確定(演出中に所持が更新されても変わらない)。10連で同じキャラは最初の1体だけ NEW
    const seen = new Set();
    const items = drawn.map((x) => {
      const ownedBefore = this.p.isOwned(x.characterId);
      const dupInPull = seen.has(x.characterId);
      seen.add(x.characterId);
      return { ...x, ownedBefore, isNew: !ownedBefore && !dupInPull, isDuplicate: ownedBefore || dupInPull };
    });
    const txId = `tx${Date.now().toString(36)}${(++d.gacha.seq).toString(36)}`;
    const result = { txId, status: 'COMMITTED', bannerId: banner.id, count, cost, createdAt: Date.now(), items, seed };
    // COMMITTED:GEM 消費 / キャラ付与 / 結果 / pendingReveal を同じ 1回の保存で
    d.wallet.heartGem -= cost;
    for (const it of items) this.p.grant(it.characterId, result.createdAt, 'gacha');
    d.gacha.transactions.push(result);
    if (d.gacha.transactions.length > Config.gacha.keepTransactions) d.gacha.transactions.splice(0, d.gacha.transactions.length - Config.gacha.keepTransactions);
    d.gacha.pending = txId;
    d.gacha.pulls = (d.gacha.pulls ?? 0) + count;
    this.p.save();
    Log.info('GACHA', `COMMITTED ${txId} ${items.map((x) => `${x.characterId}(${x.rarity}${x.isNew ? ' NEW' : ''})`).join(' ')}`);
    return { status: 'COMMITTED', result };
  }

  tx(txId) { return this.p.data.gacha.transactions.find((t) => t.txId === txId) ?? null; }
  get pending() { const id = this.p.data.gacha.pending; return id ? this.tx(id) : null; }

  /** 演出(または SKIP の最低保証)を見終えた → REVEALED、pendingReveal をクリア */
  markRevealed(txId) {
    const t = this.tx(txId);
    if (!t) return;
    if (t.status !== 'REVEALED') { t.status = 'REVEALED'; t.revealedAt = Date.now(); }
    if (this.p.data.gacha.pending === txId) this.p.data.gacha.pending = null;
    this.p.data.gacha.seenSequenceCount = (this.p.data.gacha.seenSequenceCount ?? 0) + 1;
    this.p.save();
  }
}
