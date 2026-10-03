/**
 * 雑魚(Minion)のマスターデータ。ボス(攻略対象)の前に出てくる敵。キー = 雑魚ID
 *   ★ 追加・調整はここのデータを書き換えるだけ。雑魚ごとの if 分岐は書かない(コードは src/minion/MinionWave.js)
 *   値はすべて JSON にできる形(将来の管理画面・データ配信でこのオブジェクトを差し替えられるように)
 *
 *   name      … 画面に出す名前(メロメロ度メーターの上 / WAVE 紹介)
 *   image     … 画像キー(assets/minionImages.js。tools/embed_assets.py が assets/minion_<key>.webp から生成)
 *   hp        … メロメロ度の満タン値(画面は 0% から溜まっていくメーター。内部は HP として減らす。与ダメージはボスと同じ式:ATK × アビリティ × ゲート × 着弾 → 属性 / SPECIAL)
 *   attribute … 属性(GameData.ATTRIBUTES のキー。属性相性もボスと同じ)
 *   size      … 表示の幅(ワールド単位。ボスの上半身の幅 ≈ 7)。高さは画像の縦横比から決まる
 *               ★ 小さくしすぎると狙いにくい:2匹並べて画面の横幅いっぱいになるくらいが目安
 *   hitRadius … 当たり判定の円の半径(表示の幅に対する割合)。円の外でも絵の不透明な部分なら HIT
 *   attackMul … DEFENCE で受けるダメージの倍率(ボスの返球 = 1)。生きている雑魚の中で一番大きい値を使う
 */
export const MINIONS = {
  devil: { id: 'devil', name: 'こあくまちゃん', image: 'devil', hp: 300, attribute: 'FIRE', size: 10, hitRadius: 0.46, attackMul: 0.6 },
  angel: { id: 'angel', name: 'こてんしちゃん', image: 'angel', hp: 300, attribute: 'THUNDER', size: 10, hitRadius: 0.46, attackMul: 0.6 },
};

export const minionById = (id) => MINIONS[id] ?? null;
