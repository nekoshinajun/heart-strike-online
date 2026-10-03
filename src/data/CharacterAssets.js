/**
 * キャラクターの見た目の定義(Asset Definition)。キー = キャラクターID(攻略対象は RomanceData.HEROINES の id)。
 *   データの流れ:Character / Boss Data(GameData.STAGES の boss.characterId)→ ここ → Character Renderer(boss/BossRenderer.js)
 *                 → Live2D Renderer(boss/Live2DBossView.js)/ Static Image Renderer(boss/BossView2D.js)
 *   値はすべて JSON にできる形(関数を入れない)。将来の管理画面・データ配信でこのオブジェクトを差し替えられるように
 *
 *   rendererType … 'image'(1枚絵)/ 'live2d'(Live2D Cubism)
 *   thumbnail    … カード・一覧・攻略画面に出す静止画(assets/bossImages.js のキー。Live2D はモデルの静止画)
 *   art          … 静止画の見せ方:face = 顔の位置と幅(画像の割合 u / v / w。カードやアイコンは顔を中心に切り抜く)
 *                  stage = 攻略画面の立ち絵(x = 横位置 translateX の割合 / h = 高さの倍率)。省略時はリリスと同じ構図
 *   image        … rendererType 'image':{ key: 同梱画像キー, fallback: 読めない時の画像キー }。大きさは Config.bossImage[当たり判定レイアウト]
 *   live2d       … rendererType 'live2d':
 *     modelPath   … model3.json のパス(moc3 / テクスチャ / physics3 / pose3 は model3.json の参照どおりに読む)
 *     motions     … { idle, damage, attack, defeat }(model3.json のフォルダからの相対パス。idle 以外は省略可)
 *                    idle = ずっとループ / damage = HIT 時 / attack = ボス攻撃の溜め / defeat = HEART MAX で1回再生 → idle に戻る
 *     expressions … { normal, happy, love, … }(exp3.json。ゲームの表情名 → ファイル。省略可)
 *     parameters  … ゲームのイベントで動かすパラメータのワンショット(モーションの上から一時的に上書き。idle は止めない)
 *                    { イベント名: { id: パラメータID, value, attackSec, holdSec, releaseSec } }
 *                    hit = ハートが HIT した瞬間(BossController.addHeart。MISS では呼ばれない)
 *     view        … 描画範囲(モデルのキャンバスに対する割合 u0 / v0 / u1 / v1。v は上から)と解像度 heightPx
 *     display     … 3D 空間での大きさ:height(ワールド単位)/ y = 足元からの高さ / x = 左右のずらし
 *                    (★ 変えたら Config.colliderLayouts の当たり判定も合わせる)
 *
 *   当たり判定(Config.colliderLayouts)・返球・HP などのゲームロジックは見た目と分けて GameData の boss に置く
 */

/** ★ HIT リアクション:hit を 1 にしておく時間(秒)。この後 0 へ戻す */
export const HIT_REACTION_HOLD_SEC = 0.12;
/** ★ HIT リアクション:1 → 0 へ戻るまでの時間(秒)。0 = すぐ戻す */
export const HIT_REACTION_RELEASE_SEC = 0.08;

export const CHARACTER_ASSETS = {
  lilith: { id: 'lilith', rendererType: 'image', thumbnail: 'demon', image: { key: 'demon' } },
  siren: { id: 'siren', rendererType: 'image', thumbnail: 'siren', image: { key: 'siren' } },
  // 専用イラスト(assets/boss_milk.webp)。読めない時はリリスの画像
  milk: {
    id: 'milk', rendererType: 'image', thumbnail: 'milk', image: { key: 'milk', fallback: 'demon' },
    art: { face: { u: 0.43, v: 0.43, w: 0.3 }, stage: { x: -0.24, h: 0.74 } },
  },
  // ステラのボス(Live2D)
  rato: {
    id: 'rato', rendererType: 'live2d', thumbnail: 'rato',
    art: { face: { u: 0.46, v: 0.25, w: 0.13 }, stage: { x: -0.4, h: 0.85 } },
    live2d: {
      modelPath: 'public/Live2D/idle_rato01/idle_rato01.model3.json',
      motions: { idle: 'idle_rato01.motion3.json' },
      expressions: {},
      parameters: {
        hit: { id: 'hit', value: 1, attackSec: 0, holdSec: HIT_REACTION_HOLD_SEC, releaseSec: HIT_REACTION_RELEASE_SEC },
      },
      view: { u0: -0.01, v0: -0.07, u1: 0.97, v1: 1.04, heightPx: 1024 },
      display: { height: 9, y: 6.95, x: -1 },
    },
  },
};

export const characterAsset = (id) => (id ? CHARACTER_ASSETS[id] ?? null : null);

/** ステージのボスの見た目。boss.characterId が無い(古い形の)データは boss.image から 1枚絵として作る */
export function bossAsset(stage) {
  const b = stage?.boss;
  if (!b) return null;
  return characterAsset(b.characterId)
    ?? (b.image ? { id: null, rendererType: 'image', thumbnail: b.image, image: { key: b.image, fallback: b.fallbackImage }, art: b.art } : null);
}
