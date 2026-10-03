/**
 * Live2D キャラクター(Cubism SDK for Web)。ステージの boss.live2d にキーを書くと、そのボスが Live2D で表示される。
 *   キャラを増やす時はここに1件足して、GameData.STAGES の boss.live2d / boss.layout(当たり判定)を設定するだけ
 *
 *   model     … model3.json のパス(moc3 / テクスチャ / physics3 などは model3.json の参照どおりに読む)
 *   idle      … 待機モーション(ずっとループ再生)。motion = model3.json のフォルダからの相対パス
 *   reactions … ゲームのイベントで動かすパラメータのワンショット(モーションの上から一時的に上書き。idle は止めない)
 *                 { param: パラメータID, value: 上げる値, attackSec: 上がるまで, holdSec: 保つ時間, releaseSec: 戻るまで }
 *                 hit … ハートが HIT した瞬間(BossController.addHeart → view.playHit)。MISS では呼ばれない
 *   view      … 描画範囲(モデルのキャンバスに対する割合 u0 / v0 / u1 / v1。v は上から。揺れても切れないよう少し外側まで)
 *                 heightPx = 描画の解像度(縦のピクセル数)
 *   display   … 3D 空間での大きさ:height = 描画範囲の高さ(ワールド単位)/ y = 足元からの高さ / x = 左右のずらし
 *                 (★ 変えたら Config.colliderLayouts の当たり判定も同じ式で合わせる)
 *
 *   今後:attack(ボス攻撃)/ defeat(撃破)/ expressions(表情)なども同じように定義を足して、Live2DBossView で読む
 */

/** ★ HIT リアクション:hit を 1 にしておく時間(秒)。この後 0 へ戻す */
export const HIT_REACTION_HOLD_SEC = 0.12;
/** ★ HIT リアクション:1 → 0 へ戻るまでの時間(秒)。0 = すぐ戻す */
export const HIT_REACTION_RELEASE_SEC = 0.08;

export const LIVE2D_MODELS = {
  // ステラのボス
  rato: {
    model: 'public/Live2D/idle_rato01/idle_rato01.model3.json',
    idle: { motion: 'idle_rato01.motion3.json' },
    reactions: {
      hit: { param: 'hit', value: 1, attackSec: 0, holdSec: HIT_REACTION_HOLD_SEC, releaseSec: HIT_REACTION_RELEASE_SEC },
    },
    view: { u0: -0.01, v0: -0.07, u1: 0.97, v1: 1.04, heightPx: 1024 },
    display: { height: 7, y: 8.4, x: -0.5 },
  },
};

export const live2dById = (id) => (id ? LIVE2D_MODELS[id] ?? null : null);
