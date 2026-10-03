import { Config } from '../core/Config.js';
import { abilityMul } from './Growth.js';

/**
 * SPECIAL(必殺技)ゲージ:持ち主は「キャラクター」(characterId)。パーティ共通のゲージは持たない
 *   A:70% / B:20% / C:100% / D:45% のように各キャラが独立したゲージを持ち、
 *   Diamond で増えるのは投げたキャラ本人だけ・必殺技で 0 に戻るのも使ったキャラ本人だけ
 *
 * キャラごとの設定 = CharacterData.specialGauge(GameData.CHARACTERS。省略した項目は全キャラ共通の既定値)
 *   値はすべて JSON にできる形(関数を入れない)。将来のキャラクター管理ツールはこのオブジェクトを差し替えるだけ
 *     max        … ゲージの最大値(既定 Config.energy.max)
 *     orbValue   … Diamond 1個で増える量(既定 Config.energy.orbValue)
 *     readyRatio … 必殺技を使える割合(0〜1。1 = MAX で使える)
 *     chargeMul  … SPECIAL CHARGE(アビリティ specialCharge)の倍率にさらに掛けるキャラ補正(既定 1)
 *     initial    … バトル開始時(リトライ・次のバトルも)の値(既定 0)
 *
 * パーティに同じ characterId が2人いる時(MULTI で別々のプレイヤーが同じキャラを選んだ等)だけ、2人目以降は `id#2` のキーで別ゲージ
 * サーバー(server.js の gaugeKey)も同じ規則でキーを作る → MULTI でもキャラ単位で同期
 */
export const DEFAULT_SPECIAL_GAUGE = { max: null, orbValue: null, readyRatio: 1, chargeMul: 1, initial: 0 };

/** キャラの SPECIAL ゲージ設定(既定値 + CharacterData.specialGauge)。調整パネルの変更も反映されるよう毎回作る */
export function specialGaugeSpec(chara) {
  const s = { ...DEFAULT_SPECIAL_GAUGE, ...(chara?.specialGauge ?? {}) };
  const max = Number(s.max) > 0 ? Number(s.max) : Config.energy.max;
  return {
    max,
    orbValue: Number.isFinite(Number(s.orbValue)) && s.orbValue !== null ? Number(s.orbValue) : Config.energy.orbValue,
    readyAt: max * Math.max(0, Math.min(1, Number(s.readyRatio ?? 1))),
    chargeMul: Number(s.chargeMul) > 0 ? Number(s.chargeMul) : 1,
    initial: Math.max(0, Math.min(max, Number(s.initial) || 0)),
  };
}

/** パーティ順の characterId → ゲージのキー(同じ id の2人目以降は `id#2` …)*/
export function specialGaugeKeys(characterIds) {
  const seen = {};
  return characterIds.map((id, i) => {
    const base = id ?? `slot${i}`;
    seen[base] = (seen[base] ?? 0) + 1;
    return seen[base] > 1 ? `${base}#${seen[base]}` : base;
  });
}

/** Diamond 1個で、そのキャラ本人のゲージに入る量(SPECIAL CHARGE は本人のアビリティだけを見る)*/
export function specialOrbGain(chara) {
  const spec = specialGaugeSpec(chara);
  const charge = abilityMul(chara?.abilities, 'specialCharge') * spec.chargeMul;
  return { gain: Math.round(spec.orbValue * charge), charged: charge > 1 };
}

/** バトル中の全キャラの SPECIAL ゲージ(index = パーティの並び A→D、key = characterId)*/
export class SpecialGauges {
  constructor() { this.entries = []; }

  /** バトル開始:パーティ(TurnManager.players)から各キャラのゲージを初期値で作る */
  reset(players = []) {
    const keys = specialGaugeKeys(players.map((p) => p.chara?.id ?? null));
    this.entries = players.map((p, i) => ({ key: keys[i], characterId: p.chara?.id ?? null, chara: p.chara ?? null, value: specialGaugeSpec(p.chara).initial }));
  }

  at(i) { return this.entries[i] ?? null; }
  indexOfKey(key) { return this.entries.findIndex((e) => e.key === key); }
  spec(i) { return specialGaugeSpec(this.at(i)?.chara); }
  value(i) { return this.at(i)?.value ?? 0; }
  max(i) { return this.spec(i).max; }
  ratio(i) { return Math.max(0, Math.min(1, this.value(i) / this.max(i))); }
  ready(i) { const e = this.at(i); return !!e && e.value >= this.spec(i).readyAt; }

  /** 値を直接入れる(MULTI:サーバーから届いた値)。0〜max に収める */
  set(i, v) {
    const e = this.at(i);
    if (!e) return 0;
    e.value = Math.max(0, Math.min(this.max(i), Number(v) || 0));
    return e.value;
  }
  add(i, amount) { return this.set(i, this.value(i) + amount); }
  /** 必殺技を使った:そのキャラだけ 0 */
  consume(i) { return this.set(i, 0); }
}
