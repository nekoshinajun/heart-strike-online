import { Config, rallyTier } from '../core/Config.js';

/**
 * 手番・プレイヤーHP・ラリーを管理。A→B→C→D→A のリレー順。
 * オンライン化時はここがサーバー権威の手番情報に置き換わる想定。
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
        hp: Config.playerMaxHp, maxHp: Config.playerMaxHp,
      };
    });
    this.index = 0;
    this.rally = 0;
    this.maxRally = 0;
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

  damageCurrent(amount) {
    const p = this.current;
    p.hp = Math.max(0, p.hp - amount);
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
