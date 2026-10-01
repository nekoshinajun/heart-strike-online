// 恋愛まわりのマスターデータ(攻略対象 / ボイス / 親密度 / プレゼント)。
// ★ 数値・タイトル・音声ファイル・解放条件はまだ決まっていない。決まったらここのデータを書き換えるだけでよい。
//    未決定の値は null / 空配列のままにしておく(勝手に仮の数値を入れない)。
//
// 役割の分け方
//   味方の女の子(GameData.CHARACTERS)… 育成して強くする・親密度を上げる。ASMR は持たない
//                                        (ASMR を主軸にしていない VTuber とのコラボ想定)
//   攻略対象(HEROINES)               … ステージのボス。味方としては使えない。NORMAL / HARD / HELL の3難易度。
//                                        クリアした難易度ごとにボイスを解放(NORMAL / HARD = ボイス、HELL = ASMR。
//                                        ASMR 活動をしている VTuber とのコラボ想定)
//   攻略対象のプレイアブル化             … 人気が出たら、別途 CHARACTERS に味方版を1件足し、その heroineId と
//                                        HEROINES 側の playableCharacterId を結ぶだけ。ガチャのプールにはその味方版の ID を入れる

/**
 * 報酬ボイスの解放条件(種類)。判定は PlayerProgress.isConditionMet() が行う
 *   clear … 指定ステージ(省略時はその攻略対象のステージ)を指定難易度でクリア
 *           { type: 'clear', difficulty: 'HELL' }
 */
export const UNLOCK_TYPES = ['clear'];

/**
 * 攻略対象(HeroineData)
 *   id                  … 固定 ID(保存データのキー。表示名は使わない)
 *   stageId             … このコの攻略ステージ(GameData.STAGES の id。表示名・画像はステージの boss を使う)
 *   cv                  … 担当(未決定は null)
 *   collab              … コラボ先 VTuber の情報(未決定は null)。例:{ name, channelUrl }
 *   playableCharacterId … 味方として使える版の CHARACTERS の id(プレイアブル化した時だけ。通常は null)
 *   profile             … 一言プロフィール(攻略開始前の紹介画面)。未設定は null(ステージの concept があればそれを使う)
 *   line                … 紹介画面のセリフ。未設定は null(ステージの line があればそれを使う)
 *
 *   attackVoices … 【戦闘中】ボス攻撃フェーズの直前に喋るボイス(ランダムで1つ。前回と同じものは続けて選ばない)
 *                    1件の形:{ id, src, text? }  text … 字幕(未設定は null = 字幕なし)
 *                    空の間はボイス無し(「BOSS ATTACK」の表示だけで短い間を置いて攻撃)
 *   rewardVoices … 【クリア報酬】難易度ごとに1つ。その難易度をクリアすると解放(一度解放したら戻らない)
 *                    キー = 難易度 ID(NORMAL / HARD / HELL)。未設定の枠は null
 *                    1件の形:{ id, type: 'voice' | 'asmr', title, src, durationSec }
 *                      id   … 保存データのキー(全攻略対象で重ならない ID)
 *                      type … 'voice' = 通常のボイス / 'asmr' = ASMR(本番仕様では HELL の枠だけ)
 *                      src  … 音声ファイル。null の間は解放されても再生できない(準備中)
 *   ★ 新しい攻略対象を足す時は、ここに1件足して assets/voice/<id>/ に音声を置くだけ(バトル・画面側の変更は不要)
 */
/** クリア報酬ボイスの枠(表示順)。type は本番仕様の既定(データ側の type が優先)*/
export const REWARD_VOICE_SLOTS = [
  { difficulty: 'NORMAL', type: 'voice' },
  { difficulty: 'HARD', type: 'voice' },
  { difficulty: 'HELL', type: 'asmr' },
];
const voiceDir = (heroineId) => `assets/voice/${heroineId}`;
const attackVoices = (heroineId, files) => files.map((f, i) => ({ id: `${heroineId}_attack_${String(i + 1).padStart(2, '0')}`, src: `${voiceDir(heroineId)}/${f}`, text: null }));
export const HEROINES = [
  {
    id: 'lilith', stageId: 'stage01', cv: null, collab: null, playableCharacterId: null, profile: null, line: null,
    attackVoices: attackVoices('lilith', ['riris_voice_01.mp3', 'riris_voice_02.mp3', 'riris_voice_03.mp3', 'riris_voice_04.mp3', 'riris_voice_05.mp3']),
    rewardVoices: {
      // ★ 仮設定(開発中の動作確認用):NORMAL クリアで ASMR1.mp3 を解放。本番では NORMAL 用の通常ボイスに差し替える
      NORMAL: { id: 'lilith_normal', type: 'voice', title: null, src: `${voiceDir('lilith')}/ASMR1.mp3`, durationSec: null },
      HARD: null,
      HELL: null,   // 本番:{ id: 'lilith_hell', type: 'asmr', title, src, durationSec }
    },
  },
  { id: 'siren', stageId: 'stage02', cv: null, collab: null, playableCharacterId: null, profile: null, line: null, attackVoices: [], rewardVoices: { NORMAL: null, HARD: null, HELL: null } },
  { id: 'milk', stageId: 'stage03', cv: null, collab: null, playableCharacterId: null, profile: null, line: null, attackVoices: [], rewardVoices: { NORMAL: null, HARD: null, HELL: null } },
];

/** その難易度の報酬ボイスの解放条件(その攻略対象のステージをその難易度でクリア)*/
export const rewardUnlock = (difficulty) => ({ type: 'clear', difficulty });

/**
 * 親密度(味方の女の子)。保存は「ポイント」で持ち、レベルは下の表から計算する
 *   levels … 各レベルに必要な累計ポイント(昇順)。例:[0, 100, 300] → 0pt で Lv.1 / 100pt で Lv.2 / 300pt で Lv.3
 *            未決定の間は null(レベル表示なし・ポイントだけ貯まる)
 */
export const INTIMACY = {
  levels: null,
};

/**
 * プレゼントのランク(名称・並び・色は未決定。決まったらここに足すだけ)
 *   1件の形:{ id: 'r1', label: '…', order: 1, color: '#…' }
 *   空の間は「ランクなし」として扱い、画面にもランクを出さない
 */
export const GIFT_RANKS = [];

/** プレゼントの種類(6種)。同じ種類でランク違いを作る時は GIFTS に別 ID で足し、type を同じにする */
export const GIFT_TYPES = [
  { id: 'drink', name: 'スペシャルドリンク', icon: '🥤' },
  { id: 'bag', name: 'バッグ', icon: '👜' },
  { id: 'accessory', name: 'アクセサリー', icon: '💎' },
  { id: 'cake', name: 'ケーキ', icon: '🎂' },
  { id: 'sweets', name: 'スイーツ', icon: '🍰' },
  { id: 'flower', name: '花', icon: '💐' },
];

/**
 * プレゼント(味方の女の子に渡すアイテム。ガチャで毎回1個もらえる)
 *   id        … プレゼント ID(保存データの所持数のキー)
 *   type      … 種類(GIFT_TYPES の id)。名前・アイコンは省略時に種類から引く
 *   rank      … ランク(GIFT_RANKS の id)。未決定は null
 *   effect    … 渡した時の効果。未決定は null(上がらない)
 *                 intimacy … 親密度 EXP / atk・def … 能力の上乗せ / exp … キャラの EXP(任意)
 *   reactions … 受け取った時のセリフ { default: [...], byCharacter: { minamo: [...] } }。未登録は空
 *   icon / image … 表示(image は画像 URL。null の間は icon の絵文字)
 *   drop      … ガチャでの排出設定 { enabled, weight }。weight が未決定(null)の間は他と同じ重み
 */
// 親密度 EXP:1個で +100(全種共通の仕様)。ランク・種類ごとに変える時は GIFTS の各 effect.intimacy を書き換える
const GIFT_INTIMACY_EXP = 100;
const noEffect = () => ({ intimacy: GIFT_INTIMACY_EXP, atk: null, def: null, exp: null });
const noReactions = () => ({ default: [], byCharacter: {} });
const gift = (type) => ({ id: type, type, rank: null, effect: noEffect(), reactions: noReactions(), icon: null, image: null, drop: { enabled: true, weight: null } });
export const GIFTS = GIFT_TYPES.map((t) => gift(t.id));

export const giftType = (g) => GIFT_TYPES.find((t) => t.id === g?.type) ?? null;
export const giftName = (g) => g?.name ?? giftType(g)?.name ?? g?.id ?? '';
export const giftIcon = (g) => g?.icon ?? giftType(g)?.icon ?? '🎁';
export const giftRank = (g) => (g?.rank ? GIFT_RANKS.find((r) => r.id === g.rank) ?? null : null);

/**
 * 攻略補助アイテム(攻略前に持ち込む)。まだ実装しない:空の間は攻略画面に欄を出さない
 *   1件の形:{ id, name, icon, effect: { … 未決定 } }。持ち込み処理・効果は追加する時に決める
 */
export const CAPTURE_SUPPORT_ITEMS = [];

export const heroineById = (id) => HEROINES.find((h) => h.id === id);
export const heroineByStage = (stageId) => HEROINES.find((h) => h.stageId === stageId);
export const giftById = (id) => GIFTS.find((g) => g.id === id);
