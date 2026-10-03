/**
 * ボスの好感度(LOVE)の設定データ。キャラクター(ボス)ごとに1件。
 * ロジック(src/affection/AffectionSystem.js)はこのデータを読むだけ。キャラ追加 = ここに1件足す。
 *
 *   stages[]      … LOVE %(min 以上)ごとの表情段階
 *                    blush(頬の赤み 0〜1)/ sweat(汗)/ lookAway(視線をそらす=顔を少し背ける)/ heartEyes / sparkle
 *                    line … その段階に上がった瞬間のひとこと(進行は止めない)
 *                    image … 正式な表情素材の画像キー(assets/bossImages.js)。登録されていればその画像に差し替え、
 *                            無ければ今の画像に頬の赤み等を重ねる仮表示
 *   face          … 表情オーバーレイの位置(画像の割合 u=左→右 / v=上→下):頬・目・汗
 *   loveMax       … 100% 攻略時のセリフ
 *   defeat        … 撃破時の余韻:{ reaction(撃破の瞬間の短い声), line(撃破セリフ), hell: { reaction, line }(HELL 撃破)}
 */
const DEMON_FACE = {
  cheeks: [[0.5, 0.217], [0.605, 0.214]],
  eyes: [[0.513, 0.186], [0.588, 0.183]],
  sweat: [0.645, 0.15],
  size: 0.055,          // 頬の赤みの大きさ(画像幅の割合)
};

// みるく(寝そべりポーズ・正方形の画像)
const MILK_FACE = {
  cheeks: [[0.35, 0.51], [0.54, 0.47]],
  eyes: [[0.335, 0.43], [0.51, 0.37]],
  sweat: [0.6, 0.3],
  size: 0.07,
};

export const BOSS_AFFECTION = {
  lilith: {
    name: 'リリス',
    stages: [
      { min: 0, id: 'normal', blush: 0 },
      { min: 25, id: 'shy', blush: 0.35, line: 'あれ……ちょっと意識してる？ ……してないけど！' },
      { min: 50, id: 'flustered', blush: 0.65, sweat: true, line: 'な、なによ……さっきから当ててきて……！' },
      { min: 75, id: 'embarrassed', blush: 0.9, sweat: true, lookAway: true, line: '……こっち見ないで。今、顔が熱いの。' },
      { min: 100, id: 'dere', blush: 1, heartEyes: true, sparkle: true },
    ],
    face: DEMON_FACE,
    loveMax: { line: '……もう、あなたの勝ち。ちゃんと責任とってよね♡' },
    defeat: { reaction: 'ひゃっ……！', line: '……もう、あなたの勝ち。ちゃんと責任とってよね♡', hell: { reaction: '……うそ。ここまで、本気で……？', line: '……もう逃げない。今夜は、あなたにだけ囁いてあげる♡' } },
  },
  siren: {
    name: 'セイレーン',
    stages: [
      { min: 0, id: 'normal', blush: 0 },
      { min: 25, id: 'shy', blush: 0.35, line: 'ふふ……少しは波が立ったかしら？' },
      { min: 50, id: 'flustered', blush: 0.65, sweat: true, line: 'や、やだ……歌うの忘れちゃう……' },
      { min: 75, id: 'embarrassed', blush: 0.9, sweat: true, lookAway: true, line: '……そんなに見つめられたら、沈んじゃう。' },
      { min: 100, id: 'dere', blush: 1, heartEyes: true, sparkle: true },
    ],
    face: DEMON_FACE,
    loveMax: { line: '……あなたのためだけに、歌ってあげる♡' },
    defeat: { reaction: 'あっ……！', line: '……あなたのためだけに、歌ってあげる♡', hell: { reaction: '……歌が、止まっちゃった……', line: '……今夜は、あなたの耳元でだけ歌ってあげる♡' } },
  },
  milk: {
    name: 'みるく',
    stages: [
      { min: 0, id: 'normal', blush: 0 },
      { min: 25, id: 'shy', blush: 0.35, line: 'にゃ……？ いまの、ちょっとドキッとした……' },
      { min: 50, id: 'flustered', blush: 0.65, sweat: true, line: 'もぉ〜、そんなに構われたら、しっぽが勝手に……！' },
      { min: 75, id: 'embarrassed', blush: 0.9, sweat: true, lookAway: true, line: '……見ないで。いま、ふにゃふにゃな顔してるから……' },
      { min: 100, id: 'dere', blush: 1, heartEyes: true, sparkle: true },
    ],
    face: MILK_FACE,
    loveMax: { line: '……もう、あなたの猫になってあげる。ずっと甘えさせてね♡' },
    defeat: { reaction: 'にゃっ……！', line: '……もう、あなたの猫になってあげる。ずっと甘えさせてね♡', hell: { reaction: '……にゃ……ぜんぶ、負けちゃった……', line: '……今夜はずっと、耳元でごろごろしてあげる♡' } },
  },
};

/** 設定の無いボス用(文言は共通)。stages の構造は同じ */
export const DEFAULT_AFFECTION = BOSS_AFFECTION.lilith;
