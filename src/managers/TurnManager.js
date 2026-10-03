import { Config, rallyTier } from '../core/Config.js';

/**
 * 手番・プレイヤーHP・ラリーを管理。
 * 1ターン = PLAYER ATTACK PHASE(生存している味方が A→B→C→D の順に1投ずつ)→ BOSS ATTACK PHASE(ボスがまとめて反撃・全員同時キャッチ)
 *   thrown … このフェーズで投げ終えた手番 index
 * オンライン(MULTI)は手番の進行をサーバーが決める(OnlineSession が index を合わせる)。
 */
export class TurnManager {
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  /**
   * @param party キャラクター性能の配列(A→B→C→D の順)。各要素 { id, name, attribute, type, atk, def, level, ... }
   *              省略時は Config.players のみ(性能は等倍)
   */
  reset(party = this.party) {
    this.party = party;
    const slots = party?.length ? Config.players.slice(0, party.length) : Config.players;
    this.players = slots.map((slot, i) => {
      const ch = party?.[i];
      return {
        ...slot,
        name: ch ? ch.name : slot.name,
        chara: ch ?? null,          // CharacterData + 進行度(ATK/DEF/属性/タイプ)
        // 最大 HP はキャラごと(Lv で伸びる)。キャラ無しの時だけ共通の値
        hp: ch?.maxHp ?? Config.playerMaxHp, maxHp: ch?.maxHp ?? Config.playerMaxHp,
      };
    });
    this.index = 0;
    this.rally = 0;
    this.maxRally = 0;
    this.thrown = new Set();
  }

  /** 生存している味方の index(A→D の順)*/
  get aliveIndexes() { return this.players.map((p, i) => (p.hp > 0 ? i : -1)).filter((i) => i >= 0); }

  /** 新しい PLAYER ATTACK PHASE:生存している先頭(A 側)から */
  beginAttackPhase() {
    this.thrown = new Set();
    this.index = this.aliveIndexes[0] ?? 0;
    this.bus.emit('turn', this.current);
    return this.current;
  }
  /** この手番の投球を数える(ボールを発射した時に1度だけ)*/
  markThrown(i = this.index) { this.thrown.add(i); }
  /** このフェーズでまだ投げていない次の生存者(A→D の順。いなければ -1 = ボスの反撃へ)*/
  nextAttacker() {
    for (const i of this.aliveIndexes) if (!this.thrown.has(i)) return i;
    return -1;
  }
  /** 指定の手番へ(フェーズ内の交代)*/
  setIndex(i) {
    if (i >= 0 && i < this.players.length) this.index = i;
    this.bus.emit('turn', this.current);
    return this.current;
  }

  get current() { return this.players[this.index]; }
  get tier() { return rallyTier(this.rally); }
  get mul() { return this.tier.mul; }
  get tierLevel() { return Config.rallyTiers.length - 1 - Config.rallyTiers.indexOf(this.tier); }

  /** 次の生存プレイヤーへ */
  advance() {
    for (let i = 1; i <= this.players.length; i++) {
      const n = (this.index + i) % this.players.length;
      if (this.players[n].hp > 0) { this.index = n; break; }
    }
    this.bus.emit('turn', this.current);
    return this.current;
  }

  damageCurrent(amount) { return this.damage(this.current, amount); }
  /** minHp:これより下げない(チュートリアルは 1 = 負けない)*/
  damage(p, amount, minHp = 0) {
    p.hp = Math.max(Math.min(minHp, p.hp), p.hp - amount);
    this.bus.emit('playerHp', p);
    return p.hp;
  }

  get allDown() { return this.players.every((p) => p.hp <= 0); }

  addRally() {
    const before = this.tier;
    this.rally++;
    this.maxRally = Math.max(this.maxRally, this.rally);
    this.bus.emit('rally', { rally: this.rally, tier: this.tier, tierUp: before !== this.tier });
  }

  resetRally() {
    this.rally = 0;
    this.bus.emit('rally', { rally: 0, tier: this.tier, reset: true });
  }
}
