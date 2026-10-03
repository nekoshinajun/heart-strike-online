// 味方キャラクターの育成(親密度 = レベル)のデータとバランス値。★ 数値はすべて仮。調整はこのファイルだけで行う
//   親密度 Lv(AFFECTION Lv.1〜100)… 攻略のクリア / 敗北・プレゼントで親密度 EXP を得て上がる
//   ステータス ATTACK / DEFENCE / CONTROL / CURVE … Lv に応じて自動で成長(キャラごとの成長幅。100 を超えても効く)
//     ATTACK(ATK)はそのまま与ダメージの基本値(ATK 120 → 120)
//   アビリティ … Lv10〜100 の各枠で候補から1つ選ぶ(同じものを何度でも)/ Lv100 は ULTIMATE(キャラ固有・自動)も
//     ★ レベルの基礎ステータスとアビリティの強化は別枠で計算する(基礎の倍率 × アビリティの倍率。上限に吸収されない)
//   STAMINA    … キャラごと。攻略に参加すると減り、時間で回復。0 でも出撃でき強さも変わらない(獲得 EXP だけ 10%)

// ---------------- 親密度 EXP テーブル ----------------
/**
 * レアリティごとの EXP カーブ(A = N / R・BC = SR・DEF = SSR)。A < BC < DEF の順に重い
 *   次の Lv までの必要量 need(L) = base × (1 + L/25) × (1 + 0.35 × softplus((L − knee) / 6)² / 4)
 *   → 序盤は速く、knee(折れ曲がりの Lv)を過ぎると滑らかに重くなる。base は Lv100 の累計が total になるように決める
 *   累計:A Lv100 = 45,000 / BC = 70,004 / DEF = 100,001(1 Lv ごとの丸めの分だけ total からずれる)
 */
export const AFFECTION = {
  maxLevel: 100,
  curves: {
    A: { knee: 30, total: 45000 },
    BC: { knee: 25, total: 70000 },
    DEF: { knee: 20, total: 100000 },
  },
  curveByRank: { N: 'A', R: 'A', SR: 'BC', SSR: 'DEF' },
  defaultCurve: 'A',
};
/**
 * 育成データの版。セーブのキャラごとに growthVersion として保存
 *   これより古い(または無い)キャラは、読み込み時に Lv1 / EXP 0 / アビリティなしから始め直す(正式リリース前のため旧育成は引き継がない)
 */
export const GROWTH_VERSION = 3;

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
export const STAT_MAX = 200;          // 基礎ステータスの安全上限(Lv100 でも届かない)
export const STAT_DISPLAY_MAX = 150;  // 育成画面の五角形の外周

/**
 * キャラごとの成長(Lv1 → Lv100)。間は growthExponent で補間(1 = 直線)
 *   成長幅(Lv1 → Lv100)は育成再設計で旧データの 2 倍(Lv1 はそのまま)。100 を超えた分も STAT_EFFECTS の傾きのまま効く
 */
export const CHARACTER_GROWTH = {
  // ランクが高いほど合計が高いのが基本(4ステータスの合計 Lv1 / Lv100):
  //   SSR 250 / 510・SR 210 / 450・R 190 / 410(Lv100 は旧データの成長幅を 2 倍にした値)
  //   キャラの個性(得意・不得意)は形で出す。hp = バトルの最大 HP(Lv1 → Lv100)。HP もランクが高いほど高いのが基本
  // ---- SSR ----
  yoruna: { hp: [125, 245], attack: [84, 140], defence: [55, 125], control: [55, 125], curve: [65, 135] },   // ダークドラゴン:火力とカーブ(ATK は 75→84 / 125→140 に強化。合計は SSR 基準より 9 / 15 高い)
  sera: { hp: [132, 258], attack: [60, 116], defence: [65, 125], control: [65, 129], curve: [60, 140] },     // 天使:回復型(HP・DEF・CONTROL が高い)
  // ---- SR ----
  minamo: { hp: [108, 212], attack: [68, 122], defence: [48, 120], control: [60, 120], curve: [34, 88] },     // 高火力ストレート型
  raimu: { hp: [102, 202], attack: [53, 113], defence: [35, 97], control: [47, 115], curve: [75, 125] },     // 超カーブ型
  kagura: { hp: [110, 214], attack: [65, 125], defence: [40, 100], control: [45, 109], curve: [60, 116] },     // 火力カーブ型
  hinoka: { hp: [104, 204], attack: [55, 115], defence: [52, 112], control: [48, 108], curve: [55, 115] },     // バランス型カーブ
  shizuku: { hp: [116, 228], attack: [40, 96], defence: [72, 128], control: [52, 112], curve: [46, 114] },   // 防御・安定型(HP も高い)
  kohaku: { hp: [98, 194], attack: [65, 125], defence: [45, 105], control: [60, 120], curve: [40, 100] },      // 速いストレート型
  // ---- R ----
  akane: { hp: [90, 178], attack: [40, 84], defence: [40, 86], control: [65, 135], curve: [45, 105] },       // 高精度型
  nagi: { hp: [100, 196], attack: [38, 86], defence: [60, 120], control: [62, 122], curve: [30, 82] },       // 安定・守り型
};
export const GROWTH_DEFAULT = { hp: [100, 200], attack: [50, 110], defence: [50, 110], control: [50, 110], curve: [50, 110] };
export const GROWTH_EXPONENT = 1;

/**
 * ステータス → 実際の性能(0 / 50 / 100 の3点を直線でつなぐ。100 を超えた分は 50→100 の傾きのまま伸びる)
 *   アビリティのステータス加算(POWER UP など)は基礎とは別枠:1 ポイント = 50→100 の傾き分の倍率(abilityStatMul)
 *   attack  … (与ダメージには使わない:与ダメージは ATK の値そのもの × 倍率。BattleCalc.normalDamage)
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
 * アビリティ(ABILITIES)。effects は種類ごとの Effect の配列(新しい種類はここと Growth.abilityMul に足す)
 *   { kind: 'power',   add }                  … 与ダメージのアビリティ倍率に足し算(+0.1 = +10%)。ATK(レベル)とは別枠で、ATK の表示は変えない
 *   { kind: 'stat',    stat, add }            … DEF / CONTROL / CURVE に加算(表示にも反映)。★ 基礎(レベル)とは別枠の倍率で効く(Growth.abilityStatMul)
 *   { kind: 'hp',      add }                  … 最大 HP に加算
 *   { kind: 'heart',   mul, when }            … 命中時の HEART 倍率(条件つき)
 *   { kind: 'specialCharge', mul }            … Diamond 1個で増える SPECIAL ゲージの量(投げた子が持っている時)
 *   { kind: 'curve',   mul }                  … カーブの効き(ULTIMATE)
 *   { kind: 'control', mul }                  … CONTROL の誤差(小さいほど正確。ULTIMATE)
 *   { kind: 'guard',   mul }                  … 被ダメージ倍率(ULTIMATE)
 * when(省略 = 常に):noSpin / spin(カーブあり)/ special(SPECIAL の投球)/ gate(ゲートを通って命中)
 * ★ 名前・効果はすべて仮(データを差し替えるだけで変更できる)
 */
export const ABILITIES = {
  // ---- 基礎枠(Lv10 / 30 / 50 / 70 / 90):加算。何度選んでも足し算 ----
  power_up: { name: 'POWER UP', desc: 'アビリティ倍率 +10%(ATK とは別枠で与ダメージ ×1.10。2個で ×1.20)', effects: [{ kind: 'power', add: 0.1 }] },
  guard_up: { name: 'GUARD UP', desc: 'DEF +20(レベルの DEF とは別枠で被ダメージ ×0.90)', effects: [{ kind: 'stat', stat: 'defence', add: 20 }] },
  vital_up: { name: 'VITAL UP', desc: '最大 HP +30', effects: [{ kind: 'hp', add: 30 }] },
  // ---- 特殊枠(Lv20 / 40 / 60 / 80 / 100):乗算。何度選んでも掛け算 ----
  special_master: { name: 'SPECIAL MASTER', desc: 'SPECIAL の HEART ×1.10', effects: [{ kind: 'heart', mul: 1.1, when: { special: true } }] },
  special_charge: { name: 'SPECIAL CHARGE', desc: 'Diamond で増える SPECIAL ×1.2(必要な Diamond が少なくなる)', effects: [{ kind: 'specialCharge', mul: 1.2 }] },
  gate_master: { name: 'GATE MASTER', desc: 'ゲートを通って命中した HEART ×1.10', effects: [{ kind: 'heart', mul: 1.1, when: { gate: true } }] },
  // ---- ULTIMATE(Lv100・キャラ固有。★ 仮)----
  ult_minamo: { name: 'AQUA LINE', desc: 'カーブなしの命中 HEART ×1.2・CONTROL のブレ半減', ultimate: true, effects: [{ kind: 'heart', mul: 1.2, when: { noSpin: true } }, { kind: 'control', mul: 0.5 }] },
  ult_hinoka: { name: 'BLAZE BALANCE', desc: 'アビリティ倍率 +3%・DEF / CONTROL / CURVE +6', ultimate: true, effects: [{ kind: 'power', add: 0.03 }, ...['defence', 'control', 'curve'].map((stat) => ({ kind: 'stat', stat, add: 6 }))] },
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
 * Lv10〜100 の候補(全キャラ共通の既定)。キャラごとに変える時は CHARACTER_ABILITY_SLOTS[id][Lv] に書く
 *   基礎枠 Lv10 / 30 / 50 / 70 / 90 … POWER UP / GUARD UP / VITAL UP(加算)
 *   特殊枠 Lv20 / 40 / 60 / 80 / 100 … SPECIAL MASTER / SPECIAL CHARGE / GATE MASTER(乗算)
 *   同じアビリティを何度選んでもよい。Lv100 は特殊枠 + ULTIMATE(自動)
 */
const BASE_PICK = ['power_up', 'guard_up', 'vital_up'];
const SPECIAL_PICK = ['special_master', 'special_charge', 'gate_master'];
export const ABILITY_SLOTS = {
  10: BASE_PICK, 20: SPECIAL_PICK, 30: BASE_PICK, 40: SPECIAL_PICK, 50: BASE_PICK,
  60: SPECIAL_PICK, 70: BASE_PICK, 80: SPECIAL_PICK, 90: BASE_PICK, 100: SPECIAL_PICK,
};
export const CHARACTER_ABILITY_SLOTS = {};   // 例:{ minamo: { 40: ['special_master', 'gate_master'] } }
/** Lv100 の ULTIMATE(キャラ固有・選択なしで自動解放)*/
export const ULTIMATE_LEVEL = 100;
export const ULTIMATES = { minamo: 'ult_minamo', hinoka: 'ult_hinoka', raimu: 'ult_raimu', shizuku: 'ult_shizuku', akane: 'ult_akane', kohaku: 'ult_kohaku', kagura: 'ult_kagura', nagi: 'ult_nagi', yoruna: 'ult_yoruna', sera: 'ult_sera' };

/** アビリティ変更アイテム(★ 仮名称)。入手経路はまだ無い */
export const ABILITY_RESET_ITEM = { id: 'reconnectHeart', name: 'リコネクトハート', icon: '💗' };
