// 恋愛まわりのマスターデータ(攻略対象 / ASMR / 親密度 / プレゼント)。
// ★ 数値・タイトル・音声ファイル・解放条件はまだ決まっていない。決まったらここのデータを書き換えるだけでよい。
//    未決定の値は null / 空配列のままにしておく(勝手に仮の数値を入れない)。
//
// 役割の分け方
//   味方の女の子(GameData.CHARACTERS)… 育成して強くする・親密度を上げる。ASMR は持たない
//                                        (ASMR を主軸にしていない VTuber とのコラボ想定)
//   攻略対象(HEROINES)               … ステージのボス。味方としては使えない。NORMAL / HARD / HELL の3難易度。
//                                        HELL クリアでその子の ASMR を解放(ASMR 活動をしている VTuber とのコラボ想定)
//   攻略対象のプレイアブル化             … 人気が出たら、別途 CHARACTERS に味方版を1件足し、その heroineId と
//                                        HEROINES 側の playableCharacterId を結ぶだけ。ガチャのプールにはその味方版の ID を入れる

/**
 * ASMR の解放条件(種類)。判定は PlayerProgress.isConditionMet() が行う
 *   clear … 指定ステージ(省略時はその攻略対象のステージ)を指定難易度でクリア
 *           { type: 'clear', difficulty: 'HELL' }
 */
export const ASMR_UNLOCK_TYPES = ['clear'];

/** 攻略対象の ASMR の解放条件(仕様:HELL クリアで解放)。トラックごとに unlock を書けば個別に上書きできる */
export const HEROINE_ASMR_UNLOCK = { type: 'clear', difficulty: 'HELL' };

/**
 * 攻略対象(HeroineData)
 *   id                  … 固定 ID(保存データのキー。表示名は使わない)
 *   stageId             … このコの攻略ステージ(GameData.STAGES の id。表示名・画像はステージの boss を使う)
 *   cv                  … 担当(未決定は null)
 *   collab              … コラボ先 VTuber の情報(未決定は null)。例:{ name, channelUrl }
 *   asmr                … ASMR トラックの一覧(未決定は空配列)。1件の形:
 *                           { id: 'asmr01', title: null, src: null, durationSec: null, unlock?: {…} }
 *                           src … 音声ファイルの URL(assets/ 配下など)。null の間は再生できない(準備中)
 *                           unlock … 省略時は HEROINE_ASMR_UNLOCK(HELL クリア)
 *   playableCharacterId … 味方として使える版の CHARACTERS の id(プレイアブル化した時だけ。通常は null)
 */
export const HEROINES = [
  { id: 'lilith', stageId: 'stage01', cv: null, collab: null, asmr: [], playableCharacterId: null },
  { id: 'siren', stageId: 'stage02', cv: null, collab: null, asmr: [], playableCharacterId: null },
  { id: 'milk', stageId: 'stage03', cv: null, collab: null, asmr: [], playableCharacterId: null },
];

/**
 * 親密度(味方の女の子)。保存は「ポイント」で持ち、レベルは下の表から計算する
 *   levels … 各レベルに必要な累計ポイント(昇順)。例:[0, 100, 300] → 0pt で Lv.1 / 100pt で Lv.2 / 300pt で Lv.3
 *            未決定の間は null(レベル表示なし・ポイントだけ貯まる)
 */
export const INTIMACY = {
  levels: null,
};

/**
 * プレゼント(味方の女の子に渡すアイテム)
 *   effect   … 渡した時に上がる量。未決定は null(上がらない)
 *                exp … EXP / intimacy … 親密度ポイント / atk・def … 能力の上乗せ
 *   reactions … 受け取った時のセリフ(未決定は空配列)。キャラ別にしたい時は byCharacter: { minamo: [...] }
 */
const noEffect = () => ({ exp: null, intimacy: null, atk: null, def: null });
export const GIFTS = [
  { id: 'drink', name: 'スペシャルドリンク', icon: '🥤', effect: noEffect(), reactions: [] },
  { id: 'bag', name: 'バッグ', icon: '👜', effect: noEffect(), reactions: [] },
  { id: 'accessory', name: 'アクセサリー', icon: '💎', effect: noEffect(), reactions: [] },
  { id: 'cake', name: 'ケーキ', icon: '🎂', effect: noEffect(), reactions: [] },
  { id: 'sweets', name: 'スイーツ', icon: '🍰', effect: noEffect(), reactions: [] },
  { id: 'flower', name: '花', icon: '💐', effect: noEffect(), reactions: [] },
];

/**
 * 攻略補助アイテム(攻略前に持ち込む)。まだ実装しない:空の間は攻略画面に欄を出さない
 *   1件の形:{ id, name, icon, effect: { … 未決定 } }。持ち込み処理・効果は追加する時に決める
 */
export const CAPTURE_SUPPORT_ITEMS = [];

export const heroineById = (id) => HEROINES.find((h) => h.id === id);
export const heroineByStage = (stageId) => HEROINES.find((h) => h.stageId === stageId);
export const giftById = (id) => GIFTS.find((g) => g.id === id);
