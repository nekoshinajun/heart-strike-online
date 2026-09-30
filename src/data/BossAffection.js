/**
 * ボスの好感度(LOVE)と会話イベントの設定データ。キャラクター(ボス)ごとに1件。
 * ロジック(src/affection/AffectionSystem.js)はこのデータを読むだけ。キャラ追加 = ここに1件足す。
 *
 *   stages[]      … LOVE %(min 以上)ごとの表情段階
 *                    blush(頬の赤み 0〜1)/ sweat(汗)/ lookAway(視線をそらす=顔を少し背ける)/ heartEyes / sparkle
 *                    line … その段階に上がった瞬間のひとこと(進行は止めない)
 *                    image … 正式な表情素材の画像キー(assets/bossImages.js)。登録されていればその画像に差し替え、
 *                            無ければ今の画像に頬の赤み等を重ねる仮表示
 *   face          … 表情オーバーレイの位置(画像の割合 u=左→右 / v=上→下):頬・目・汗
 *   talks[]       … 会話イベント(今回は 50% の1件。1プレイ1回)
 *                    question / prompt / hint … セリフ
 *                    zones[] … 「次の1投」の回答エリア。rects は画像の割合 {u, v, w, h}(中心と幅・高さ)
 *                              part = HEART 計算に使う既存の部位 / line = 命中時のセリフ / expr = リアクションの表情段階
 *                    miss … 回答エリアに当たらなかった時のセリフ
 *   loveMax       … 100% 攻略時のセリフ
 *   heart50Expression … HEART 50% 会話中の表情(stages の id。stages[].image に表情差分を登録すれば画像で差し替わる)
 *   talks[].opening … 質問の前のひとこと(暗転 →「ドクン……」の後)
 */
const DEMON_LAYOUT_ZONES = {
  hair: [{ u: 0.3, v: 0.42, w: 0.13, h: 0.3 }, { u: 0.73, v: 0.38, w: 0.1, h: 0.2 }],
  face: [{ u: 0.545, v: 0.195, w: 0.13, h: 0.1 }],
  hand: [{ u: 0.83, v: 0.665, w: 0.14, h: 0.08 }, { u: 0.43, v: 0.255, w: 0.07, h: 0.06 }],
  outfit: [{ u: 0.57, v: 0.34, w: 0.12, h: 0.09 }, { u: 0.655, v: 0.115, w: 0.09, h: 0.06 }],
};
const DEMON_FACE = {
  cheeks: [[0.5, 0.217], [0.605, 0.214]],
  eyes: [[0.513, 0.186], [0.588, 0.183]],
  sweat: [0.645, 0.15],
  size: 0.055,          // 頬の赤みの大きさ(画像幅の割合)
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
    heart50Expression: 'embarrassed',
    talks: [
      {
        id: 'interest50', at: 50,
        opening: '……なによ。そんなに私のこと気になるの？',
        question: '……私のどこに興味があるのよ？',
        prompt: '次の1投で答えて！',
        hint: '髪・顔・手・衣装 ── どこに当てる？',
        zones: [
          { id: 'hair', label: '髪', part: 'head', rects: DEMON_LAYOUT_ZONES.hair, line: '……髪、見てたんだ。', expr: 'shy' },
          { id: 'face', label: '顔', part: 'head', rects: DEMON_LAYOUT_ZONES.face, line: 'えっ……顔！？ そんなに見ないでよ……！', expr: 'embarrassed' },
          { id: 'hand', label: '手', part: 'leftArm', rects: DEMON_LAYOUT_ZONES.hand, line: 'そこなの……？ なんか恥ずかしいんだけど……。', expr: 'flustered' },
          { id: 'outfit', label: '衣装・アクセサリー', part: 'chest', rects: DEMON_LAYOUT_ZONES.outfit, line: 'そこ気づいてたんだ……。', expr: 'shy' },
        ],
        miss: '……どこ見て投げてるのよ！',
      },
    ],
    loveMax: { line: '……もう、あなたの勝ち。ちゃんと責任とってよね♡' },
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
    heart50Expression: 'embarrassed',
    talks: [
      {
        id: 'interest50', at: 50,
        opening: '……ねえ。さっきから、私ばっかり見てない？',
        question: '……私のどこに興味があるのよ？',
        prompt: '次の1投で答えて！',
        hint: '髪・顔・手・衣装 ── どこに当てる？',
        zones: [
          { id: 'hair', label: '髪', part: 'head', rects: DEMON_LAYOUT_ZONES.hair, line: '……髪、見てたんだ。', expr: 'shy' },
          { id: 'face', label: '顔', part: 'head', rects: DEMON_LAYOUT_ZONES.face, line: 'えっ……顔！？ そんなに見ないでよ……！', expr: 'embarrassed' },
          { id: 'hand', label: '手', part: 'leftArm', rects: DEMON_LAYOUT_ZONES.hand, line: 'そこなの……？ なんか恥ずかしいんだけど……。', expr: 'flustered' },
          { id: 'outfit', label: '衣装・アクセサリー', part: 'chest', rects: DEMON_LAYOUT_ZONES.outfit, line: 'そこ気づいてたんだ……。', expr: 'shy' },
        ],
        miss: '……どこ見て投げてるのよ！',
      },
    ],
    loveMax: { line: '……あなたのためだけに、歌ってあげる♡' },
  },
};

/** 設定の無いボス用(文言は共通)。stages / talks の構造は同じ */
export const DEFAULT_AFFECTION = BOSS_AFFECTION.lilith;
