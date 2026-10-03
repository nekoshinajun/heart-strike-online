import { BossView2D } from './BossView2D.js';
import { Live2DBossView } from './Live2DBossView.js';

/**
 * Character Renderer:見た目の定義(data/CharacterAssets.js)の rendererType で描画クラスを選ぶ。
 *   'live2d' → Live2DBossView(Live2D Cubism)
 *   'image' / 定義なし → BossView2D(1枚絵。画像は GameManager.rebuildBoss が asset.image から貼る)
 * どちらも同じインターフェース(BossView2D のコメント参照)なので、BossController からは区別しない。
 * 描画方式を増やす時はここに1行足す。
 */
const RENDERERS = {
  live2d: (parent, asset) => new Live2DBossView(parent, asset.live2d),
  image: (parent) => new BossView2D(parent),
};

export function createBossView(parent, asset) {
  const make = RENDERERS[asset?.rendererType] ?? RENDERERS.image;
  return make(parent, asset);
}
