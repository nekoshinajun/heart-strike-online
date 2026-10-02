// 味方キャラクターの育成(親密度 = レベル)のデータとバランス値。★ 数値はすべて仮。調整はこのファイルだけで行う
//   親密度 Lv(AFFECTION Lv.1〜100)… 攻略のクリア / 敗北・プレゼントで親密度 EXP を得て上がる
//   ステータス ATTACK / DEFENCE / CONTROL / CURVE(0〜100)… Lv に応じて自動で成長(キャラごとの成長幅)
//   アビリティ … Lv10〜90 で候補から1つ選ぶ / Lv100 は ULTIMATE(キャラ固有・自動)
//   STAMINA    … キャラごと。攻略に参加すると減り、時間で回復。0 でも出撃でき強さも変わらない(獲得 EXP だけ 10%)

// ---------------- 親密度 EXP テーブル ----------------
/** 累計 EXP の目安(この Lv に到達するのに必要な累計)。間の Lv は直線でつなぐ(10 Lv ごとに 1 Lv あたりの必要量が増える)*/
export const AFFECTION = {
  maxLevel: 100,
  expAnchors: { 1: 0, 10: 1000, 20: 2500, 30: 4500, 40: 7000, 50: 10000, 60: 14000, 70: 19000, 80: 25000, 90: 32000, 100: 40000 },
};

// ---------------- 攻略で得る親密度 EXP(参加した味方全員)----------------
export const BATTLE_EXP = {
  clear: { NORMAL: 100, HARD: 150, HELL: 250 },
  defeat: { NORMAL: 20, HARD: 30, HELL: 50 },   // 敗北しても 0 にはしない
};

// ---------------- STAMINA(キャラごと)----------------
export const STAMINA = {
  max: 100,
  cost: { NORMAL: 15, HARD: 20, HELL: 25 },        // クリア
  defeatCost: { NORMAL: 8, HARD: 10, HELL: 12 },   // 敗北
  recover: { amount: 5, everyMinutes: 30 },        // 自然回復:30分ごとに +5(0 → 100 で 10 時間)
  tiredExpMul: 0.1,                                // STAMINA 0:獲得 EXP ×10%(出撃・戦闘性能はそのまま)
};

// ---------------- 攻略クリアのプレゼント(GIFTS の drop から1個)----------------
export const CLEAR_PRESENT = { chance: { NORMAL: 0.5, HARD: 0.75, HELL: 1 }, count: 1 };

// ---------------- プレゼントの好物(将来用)----------------
//   キャラデータに favoriteGiftTypes: ['cake', …] を書くと、その種類の EXP × favoriteMul
export const FAVORITE_GIFT_MUL = 1.5;

// ---------------- ステータス ----------------
export const STAT_KEYS = ['attack', 'defence', 'control', 'curve'];
export const STAT_LABELS = { attack: 'ATTACK', defence: 'DEFENCE', control: 'CONTROL', curve: 'CURVE' };
export const STAT_MAX = 100;

/**
 * キャラごとの成長(Lv1 → Lv100)。間は growthExponent で補間(1 = 直線)
 *   ★ 仮の方向性。最終バランスではない
 */
export const CHARACTER_GROWTH = {
  // ランクが高いほど合計が高いのが基本(4ステータスの合計 Lv1 / Lv100):
  //   SSR 250 / 380・SR 210 / 330・R 190 / 300・N 170 / 270(N のキャラは今はいない)
  //   キャラの個性(得意・不得意)は形で出す。hp = バトルの最大 HP(Lv1 → Lv100)。HP もランクが高いほど高いのが基本
  // ---- SSR ----
  yoruna: { hp: [125, 185], attack: [75, 100], defence: [55, 90], control: [55, 90], curve: [65, 100] },   // ダークドラゴン:火力とカーブ
  sera: { hp: [132, 195], attack: [60, 88], defence: [65, 95], control: [65, 97], curve: [60, 100] },     // 天使:回復型(HP・DEF・CONTROL が高い)
  // ---- SR ----
  minamo: { hp: [108, 160], attack: [68, 95], defence: [48, 84], control: [60, 90], curve: [34, 61] },     // 高火力ストレート型
  raimu: { hp: [102, 152], attack: [53, 83], defence: [35, 66], control: [47, 81], curve: [75, 100] },     // 超カーブ型
  kagura: { hp: [110, 162], attack: [65, 95], defence: [40, 70], control: [45, 77], curve: [60, 88] },     // 火力カーブ型
  hinoka: { hp: [104, 154], attack: [55, 85], defence: [52, 82], control: [48, 78], curve: [55, 85] },     // バランス型カーブ
  shizuku: { hp: [116, 172], attack: [40, 68], defence: [72, 100], control: [52, 82], curve: [46, 80] },   // 防御・安定型(HP も高い)
  kohaku: { hp: [98, 146], attack: [65, 95], defence: [45, 75], control: [60, 90], curve: [40, 70] },      // 速いストレート型
  // ---- R ----
  akane: { hp: [90, 134], attack: [40, 62], defence: [40, 63], control: [65, 100], curve: [45, 75] },       // 高精度型
  nagi: { hp: [100, 148], attack: [38, 62], defence: [60, 90], control: [62, 92], curve: [30, 56] },       // 安定・守り型
};
export const GROWTH_DEFAULT = { hp: [100, 150], attack: [50, 80], defence: [50, 80], control: [50, 80], curve: [50, 80] };
export const GROWTH_EXPONENT = 1;

/**
 * ステータス → 実際の性能(0 / 50 / 100 の3点を直線でつなぐ)
 *   attack  … HEART(与ダメージ)倍率。50 = 100%、100 = 125%
 *   defence … 被ダメージ倍率。50 = 等倍、100 = 25% 軽減。低くても極端に増えない
 *   control … 投球の誤差(狙った点からのずれの最大値、units)。50 = 小さなブレ、100 = ほぼ 0
 *             ★ 低くても操作不能にしない(頭の半径 約2.5 units に対して最大 0.6)
 *   curve   … カーブの効き倍率。50 = 標準、100 = 1.5 倍
 */
export const STAT_EFFECTS = {
  attack: [0.85, 1.0, 1.25],
  defence: [1.08, 1.0, 0.75],
  control: [0.6, 0.3, 0.02],
  curve: [0.75, 1.0, 1.5],
};

// ---------------- アビリティ ----------------
/**
 * アビリティ(ABILITIES)。effects は種類ごとの Effect の配列(新しい種類はここと BattleCalc.abilityMul に足す)
 *   { kind: 'stat',    stat, add }            … ステータスに加算(表示にも反映)
 *   { kind: 'heart',   mul, when }            … 命中時の HEART 倍率(条件つき)
 *   { kind: 'curve',   mul, when }            … カーブの効き
 *   { kind: 'specialCharge', mul }      … Diamond 1個で増える SPECIAL ゲージの量(投げた子が持っている時。ダメージ・FEVER には関係しない)
 *   { kind: 'drive',   mul, when }            … DRIVE の沈む量
 *   { kind: 'control', mul }                  … CONTROL の誤差(小さいほど正確)
 *   { kind: 'guard',   mul, when }            … 被ダメージ倍率
 * when(省略 = 常に):pullMin / pullMax(下へ引いた量 0〜1)/ noSpin / spin(カーブあり)/ preSpin / drive / special / fever / energyMin(取った Energy 数)/ judge(キャッチ判定)
 * ★ 名前・効果はすべて仮(データを差し替えるだけで変更できる)
 */
export const ABILITIES = {
  atk_s: { name: 'ATTACK UP', desc: 'ATTACK +5', effects: [{ kind: 'stat', stat: 'attack', add: 5 }] },
  def_s: { name: 'DEFENCE UP', desc: 'DEFENCE +5', effects: [{ kind: 'stat', stat: 'defence', add: 5 }] },
  ctl_s: { name: 'CONTROL UP', desc: 'CONTROL +5', effects: [{ kind: 'stat', stat: 'control', add: 5 }] },
  crv_s: { name: 'CURVE UP', desc: 'CURVE +5', effects: [{ kind: 'stat', stat: 'curve', add: 5 }] },
  atk_l: { name: 'ATTACK UP+', desc: 'ATTACK +8', effects: [{ kind: 'stat', stat: 'attack', add: 8 }] },
  def_l: { name: 'DEFENCE UP+', desc: 'DEFENCE +8', effects: [{ kind: 'stat', stat: 'defence', add: 8 }] },
  ctl_l: { name: 'CONTROL UP+', desc: 'CONTROL +8', effects: [{ kind: 'stat', stat: 'control', add: 8 }] },
  crv_l: { name: 'CURVE UP+', desc: 'CURVE +8', effects: [{ kind: 'stat', stat: 'curve', add: 8 }] },
  all_round: { name: 'ALL ROUND', desc: '全ステータス +3', effects: ['attack', 'defence', 'control', 'curve'].map((stat) => ({ kind: 'stat', stat, add: 3 })) },
  // ★ 統一ルール:引く量(球速)では HEART(ダメージ)は変わらない。引く量を条件にするのはダメージ以外の効果だけ
  //   power_heart / slow_curve は ID はそのまま(選択済みのセーブもそのまま有効)、効果だけ HEART 倍率 → 投球性能に変更
  power_heart: { name: 'POWER HEART', desc: '深く引いた(速い)球は CONTROL のブレ ×0.6(狙いどおりまっすぐ飛ぶ)', effects: [{ kind: 'control', mul: 0.6, when: { pullMin: 0.85 } }] },
  pure_straight: { name: 'PURE STRAIGHT', desc: 'カーブなしで命中すると HEART ×1.08', effects: [{ kind: 'heart', mul: 1.08, when: { noSpin: true } }] },
  spin_lover: { name: 'SPIN LOVER', desc: 'カーブで命中すると HEART ×1.06', effects: [{ kind: 'heart', mul: 1.06, when: { spin: true } }] },
  slow_curve: { name: 'SOFT CURVE', desc: '浅く引いた(遅い)球のカーブ ×1.2', effects: [{ kind: 'curve', mul: 1.2, when: { pullMax: 0.35 } }] },
  calm_aim: { name: 'CALM AIM', desc: 'CONTROL のブレを 30% 軽減', effects: [{ kind: 'control', mul: 0.7 }] },
  steady_hand: { name: 'STEADY HAND', desc: 'CONTROL のブレを 50% 軽減', effects: [{ kind: 'control', mul: 0.5 }] },
  tough_heart: { name: 'TOUGH HEART', desc: '受けるダメージ ×0.92', effects: [{ kind: 'guard', mul: 0.92 }] },
  nice_catch: { name: 'NICE CATCH', desc: 'GREAT キャッチの被ダメージ ×0.8', effects: [{ kind: 'guard', mul: 0.8, when: { judge: 'GREAT' } }] },
  drive_master: { name: 'DRIVE MASTER', desc: 'DRIVE の沈みが ×1.2', effects: [{ kind: 'drive', mul: 1.2 }] },
  prespin_master: { name: 'PRE-SPIN MASTER', desc: 'PRE-SPIN を仕込んだカーブが ×1.15', effects: [{ kind: 'curve', mul: 1.15, when: { preSpin: true } }] },
  drive_heart: { name: 'DROP HEART', desc: 'DRIVE で命中すると HEART ×1.1', effects: [{ kind: 'heart', mul: 1.1, when: { drive: true } }] },
  // 旧 ENERGY HEART(Diamond でダメージ ×1.08)→ SPECIAL CHARGE。ID はセーブ互換のためそのまま。Diamond の役割(SPECIAL ゲージ)は変えない
  energy_heart: { name: 'SPECIAL CHARGE', desc: 'Diamond 1個で SPECIAL +12%(通常 +10%)', effects: [{ kind: 'specialCharge', mul: 1.2 }] },
  special_heart: { name: 'SPECIAL HEART+', desc: 'SPECIAL の HEART ×1.1', effects: [{ kind: 'heart', mul: 1.1, when: { special: true } }] },
  fever_heart: { name: 'FEVER HEART+', desc: 'FEVER 中の HEART ×1.08', effects: [{ kind: 'heart', mul: 1.08, when: { fever: true } }] },
  straight_master: { name: 'STRAIGHT MASTER', desc: 'ストレート(カーブなし)の命中 HEART ×1.08', effects: [{ kind: 'heart', mul: 1.08, when: { noSpin: true } }] },
  curve_master: { name: 'CURVE MASTER', desc: 'カーブの効き ×1.15', effects: [{ kind: 'curve', mul: 1.15 }] },
  guard_heart: { name: 'GUARD HEART', desc: '受けるダメージ ×0.9', effects: [{ kind: 'guard', mul: 0.9 }] },
  // ---- ULTIMATE(Lv100・キャラ固有。★ 仮)----
  ult_minamo: { name: 'AQUA LINE', desc: 'カーブなしの命中 HEART ×1.2・CONTROL のブレ半減', ultimate: true, effects: [{ kind: 'heart', mul: 1.2, when: { noSpin: true } }, { kind: 'control', mul: 0.5 }] },
  ult_hinoka: { name: 'BLAZE BALANCE', desc: '全ステータス +6', ultimate: true, effects: ['attack', 'defence', 'control', 'curve'].map((stat) => ({ kind: 'stat', stat, add: 6 })) },
  ult_raimu: { name: 'THUNDER CURVE', desc: 'カーブ ×1.25・カーブ命中 HEART ×1.1', ultimate: true, effects: [{ kind: 'curve', mul: 1.25 }, { kind: 'heart', mul: 1.1, when: { spin: true } }] },
  ult_shizuku: { name: 'TIDE GUARD', desc: '受けるダメージ ×0.8', ultimate: true, effects: [{ kind: 'guard', mul: 0.8 }] },
  ult_akane: { name: 'PINPOINT HEART', desc: 'CONTROL のブレ ×0.3・HEART ×1.08', ultimate: true, effects: [{ kind: 'control', mul: 0.3 }, { kind: 'heart', mul: 1.08 }] },
  ult_kohaku: { name: 'SPARK STRAIGHT', desc: 'ストレートの命中 HEART ×1.12・CONTROL のブレ ×0.6', ultimate: true, effects: [{ kind: 'heart', mul: 1.12, when: { noSpin: true } }, { kind: 'control', mul: 0.6 }] },
  ult_kagura: { name: 'FLAME ARC', desc: 'カーブ命中 HEART ×1.15', ultimate: true, effects: [{ kind: 'heart', mul: 1.15, when: { spin: true } }] },
  ult_sera: { name: 'HOLY WINGS', desc: '受けるダメージ ×0.88・HEART ×1.05', ultimate: true, effects: [{ kind: 'guard', mul: 0.88 }, { kind: 'heart', mul: 1.05 }] },
  ult_yoruna: { name: 'DRAGON HEART', desc: 'HEART ×1.12・カーブの効き ×1.2', ultimate: true, effects: [{ kind: 'heart', mul: 1.12 }, { kind: 'curve', mul: 1.2 }] },
  ult_nagi: { name: 'CALM WAVE', desc: '受けるダメージ ×0.85・CONTROL のブレ ×0.6', ultimate: true, effects: [{ kind: 'guard', mul: 0.85 }, { kind: 'control', mul: 0.6 }] },
};

/**
 * Lv10〜90 の候補(全キャラ共通の既定)。キャラごとに変える時は CHARACTER_ABILITY_SLOTS[id][Lv] に書く
 *   PRE-SPIN / DRIVE を使うアビリティ(prespin_master / drive_master / drive_heart)は今は操作に無いので候補から外す(定義は将来用に残す)
 */
export const ABILITY_SLOTS = {
  10: ['atk_s', 'def_s', 'ctl_s'],
  20: ['pure_straight', 'spin_lover', 'crv_s'],
  30: ['calm_aim', 'tough_heart', 'energy_heart'],
  40: ['power_heart', 'slow_curve', 'straight_master'],
  50: ['special_heart', 'fever_heart', 'nice_catch'],
  60: ['atk_l', 'def_l', 'crv_l'],
  70: ['steady_hand', 'curve_master', 'guard_heart'],
  80: ['ctl_l', 'all_round', 'energy_heart'],
  90: ['atk_l', 'crv_l', 'tough_heart'],
};
export const CHARACTER_ABILITY_SLOTS = {};   // 例:{ minamo: { 40: ['power_heart', 'pure_straight', 'drive_master'] } }
/** Lv100 の ULTIMATE(キャラ固有・選択なしで自動解放)*/
export const ULTIMATE_LEVEL = 100;
export const ULTIMATES = { minamo: 'ult_minamo', hinoka: 'ult_hinoka', raimu: 'ult_raimu', shizuku: 'ult_shizuku', akane: 'ult_akane', kohaku: 'ult_kohaku', kagura: 'ult_kagura', nagi: 'ult_nagi', yoruna: 'ult_yoruna', sera: 'ult_sera' };

/** アビリティ変更アイテム(★ 仮名称)。入手経路はまだ無い */
export const ABILITY_RESET_ITEM = { id: 'reconnectHeart', name: 'リコネクトハート', icon: '💗' };
