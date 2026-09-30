// ゲーム全体のマスターデータ(キャラクター / ステージ / 属性 / ランク / タイプ / 成長)。
// ★ 追加・調整はここのデータを書き換えるだけ。キャラ個別の if 分岐は書かない。

/** 属性:icon / color と、有利な相手(beats)。WATER > FIRE > THUNDER > WATER */
export const ATTRIBUTES = {
  WATER:   { id: 'WATER',   label: 'WATER',   icon: '💧', color: '#3ec5ff', beats: 'FIRE' },
  FIRE:    { id: 'FIRE',    label: 'FIRE',    icon: '🔥', color: '#ff6a3d', beats: 'THUNDER' },
  THUNDER: { id: 'THUNDER', label: 'THUNDER', icon: '⚡', color: '#ffd23e', beats: 'WATER' },
};

// 属性倍率(有利 1.3 / 通常 1.0 / 不利 0.7)は Config.battle.attributeMul(★ 調整パネルから変更可)

/** ランク(R / SR / SSR …追加可)。order は並び順、color は枠色 */
export const RANKS = {
  R:   { id: 'R',   order: 1, color: '#9fb4d0' },
  SR:  { id: 'SR',  order: 2, color: '#ffd23e' },
  SSR: { id: 'SSR', order: 3, color: '#ff7ad9' },
};

/**
 * タイプ:操作は共通。ボールの性質だけが変わる(入力の POWER / AIM / SPIN とは別に掛かる)
 *   straightPowerMul … 初速(ボールの速さ)
 *   curveMul         … カーブ量(膨らみ・曲がり)
 */
export const TYPES = {
  STRAIGHT: { id: 'STRAIGHT', label: 'STRAIGHT', icon: '➤', straightPowerMul: 1.2, curveMul: 0.6 },
  CURVE:    { id: 'CURVE',    label: 'CURVE',    icon: '↪', straightPowerMul: 0.8, curveMul: 1.5 },
};

/**
 * キャラクター(CharacterData)
 *   art.portrait / art.fullBody / art.specialCutIn / art.cutout(背景なしの全身:HOME・ガチャ Reveal)… 画像キー(assets/charaImages.js。tools/embed_assets.py が生成)
 *     → 画像を差し替える / キャラを追加する時はキーを登録するだけ。コード側に画像参照は書かない
 *   portraitFocus … PortraitPosition(x,y:画像比の顔〜肩の中心)/ PortraitScale(zoom:アイコン幅に対する画像の倍率)。
 *                   インゲーム右下のアイコン・編成カードで共通(★ 調整パネル「キャラアイコン」)
 *   cutIn         … SPECIAL カットインの表示調整(★ 調整パネル「カットイン」から変更可)
 *       faceX/faceY … 画像内の顔の位置(0〜1)/ x,y … 顔を置く画面位置(0〜1)
 *       scale … 画像の幅 = 画面幅 × scale / rot … 回転(度)
 *   description … GameplayDescription(CHARACTER DETAIL に出す「どう使うキャラか」1〜2文)
 *   detail      … CHARACTER DETAIL の全身イラスト表示:DetailPosition(x,y:画面比の中心)/ DetailScale / DetailRotation(度)
 */
export const CHARACTERS = [
  {
    id: 'minamo', rank: 'SSR', name: 'ミナモ', attribute: 'WATER', type: 'STRAIGHT', atk: 120, def: 90,
    art: { portrait: 'minamo', fullBody: 'minamo', specialCutIn: 'minamo', cutout: 'minamo_cut' },
    portraitFocus: { x: 0.48, y: 0.21, zoom: 3.0 },
    cutIn: { faceX: 0.47, faceY: 0.18, x: 0.5, y: 0.34, scale: 1.9, rot: -6 },
    description: '高速ストレートを得意とするエース。POWER を溜めた直球で、狭いルートや Heart Gate を一気に抜ける。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'hinoka', rank: 'SR', name: 'ヒノカ', attribute: 'FIRE', type: 'STRAIGHT', atk: 105, def: 110,
    art: { portrait: 'hinoka', fullBody: 'hinoka', specialCutIn: 'hinoka', cutout: 'hinoka_cut' },
    portraitFocus: { x: 0.45, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.43, faceY: 0.15, x: 0.5, y: 0.34, scale: 1.9, rot: 5 },
    description: '重めの直球で押し切る頼れるアタッカー。DEF も高く、返球のキャッチでも崩れにくい。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'raimu', rank: 'SSR', name: 'ライム', attribute: 'THUNDER', type: 'CURVE', atk: 100, def: 85,
    art: { portrait: 'raimu', fullBody: 'raimu', specialCutIn: 'raimu', cutout: 'raimu_cut' },
    portraitFocus: { x: 0.55, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.17, x: 0.5, y: 0.34, scale: 1.9, rot: -5 },
    description: '大きなカーブを自在に操るテクニカルタイプ。障害物を回り込み、左右の Heart Energy をまとめて回収する。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'shizuku', rank: 'SR', name: 'シズク', attribute: 'WATER', type: 'CURVE', atk: 90, def: 120,
    art: { portrait: 'shizuku', fullBody: 'shizuku', specialCutIn: 'shizuku', cutout: 'shizuku_cut' },
    portraitFocus: { x: 0.43, y: 0.23, zoom: 3.0 },
    cutIn: { faceX: 0.40, faceY: 0.2, x: 0.5, y: 0.34, scale: 1.9, rot: 4 },
    description: '守りの要。DEF がとても高く、ゆったり曲がるカーブで Gate を順番につないでいく。',
    detail: { x: 0.52, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'akane', rank: 'R', name: 'アカネ', attribute: 'FIRE', type: 'CURVE', atk: 80, def: 80,
    art: { portrait: 'akane', fullBody: 'akane', specialCutIn: 'akane', cutout: 'akane_cut' },
    portraitFocus: { x: 0.53, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.52, faceY: 0.15, x: 0.5, y: 0.34, scale: 1.9, rot: -4 },
    description: 'まだ粗削りな元気印。レベルを上げて伸びしろを見せたい、カーブ使いの新人。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  // ---- 追加キャラ(画像は未登録:art を空にしておくと仮のシルエットで表示。画像キーを入れるだけで差し替わる)----
  {
    id: 'kohaku', rank: 'SR', name: 'コハク', attribute: 'THUNDER', type: 'STRAIGHT', atk: 112, def: 95,
    art: {},
    portraitFocus: { x: 0.5, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.2, x: 0.5, y: 0.36, scale: 1.6, rot: -4 },
    description: '稲妻のように速い一直線の投球が武器。動く障害物のすき間を、タイミングよく撃ち抜くのが得意。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'kagura', rank: 'SSR', name: 'カグラ', attribute: 'FIRE', type: 'CURVE', atk: 118, def: 88,
    art: {},
    portraitFocus: { x: 0.5, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.2, x: 0.5, y: 0.36, scale: 1.6, rot: 5 },
    description: '炎をまとう大きな弧を描く、火力自慢のカーブ使い。難しい 3D ルートを通すほど HEART が跳ね上がる。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'nagi', rank: 'R', name: 'ナギ', attribute: 'WATER', type: 'STRAIGHT', atk: 86, def: 108,
    art: {},
    portraitFocus: { x: 0.5, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.2, x: 0.5, y: 0.36, scale: 1.6, rot: -3 },
    description: '穏やかな凪のように安定した直球とキャッチが持ち味。まずは確実にボスへ届けたい時に。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },

];

/** 旧IDからの移行(保存データ用) */
export const LEGACY_CHARACTER_IDS = { aqua: 'minamo', ignis: 'hinoka', raika: 'raimu', marin: 'shizuku', flare: 'akane' };

/** 初期パーティ(PartyData の既定値) */
export const DEFAULT_PARTY = ['minamo', 'hinoka', 'raimu', 'shizuku'];

/**
 * ステージ(StageData)
 *   boss.image … 同梱画像キー(assets/bossImages.js)/ boss.layout … 当たり判定レイアウト
 *   boss.profile … 返球プロファイル(Config.bossProfiles)
 *   boss.affection … 好感度の表情・会話イベントの設定(data/BossAffection.js のキー)
 *   space … 3D 空間の特徴:patterns(使う RoutePattern。重複で出やすさ)/ energyDensity / gateCount / obstacleCount / obstacleSpeed
 */
export const STAGES = [
  {
    id: 'stage01', no: '01', name: 'はじまりの告白',
    boss: { name: 'リリス', attribute: 'FIRE', type: 'CURVE', image: 'demon', layout: 'demon', profile: 'lilith', affection: 'lilith', maxHeart: 10000 },
    recommended: 'WATER', difficulty: 'NORMAL', exp: 100,
    // 3D 空間の特徴:シンプルな3Dルート(動く障害物は無し、Gate は最大2)
    space: { patterns: ['STRAIGHT_LINE', 'LEFT_CURVE', 'RIGHT_CURVE', 'HIGH_ARC', 'LOW_ROUTE', 'S_CURVE', 'GATE_CHAIN', 'BANK_STARS'],
      energyDensity: 1.0, gateCount: 2, obstacleCount: 2, obstacleSpeed: 0.8 },
  },
  {
    id: 'stage02', no: '02', name: '深海のセレナーデ',
    boss: { name: 'セイレーン', attribute: 'WATER', type: 'STRAIGHT', image: 'siren', layout: 'demon', profile: 'siren', affection: 'siren', maxHeart: 15000 },
    recommended: 'THUNDER', difficulty: 'NORMAL', exp: 150,
    // 動く障害物が多い海の中。Gate は最大3
    space: { patterns: ['STRAIGHT_LINE', 'LEFT_CURVE', 'RIGHT_CURVE', 'HIGH_ARC', 'S_CURVE', 'GATE_CHAIN', 'WALL_GAP', 'STAR_DRIFT', 'BANK_STARS', 'WALL_GAP', 'STAR_DRIFT'],
      energyDensity: 1.0, gateCount: 3, obstacleCount: 2, obstacleSpeed: 1.2 },
  },
];

/**
 * 成長(★ 調整可)
 *   nextExp(level) … そのレベルから次へ必要な EXP
 *   growth         … 1レベルごとの上昇量
 */
export const LEVELING = {
  maxLevel: 50,
  nextExp: (lv) => 100 + (lv - 1) * 50,
  growth: { atk: 3, def: 2 },
};

export const characterById = (id) => CHARACTERS.find((c) => c.id === id);
export const stageById = (id) => STAGES.find((s) => s.id === id);
