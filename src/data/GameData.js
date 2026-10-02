// ゲーム全体のマスターデータ(キャラクター / ステージ / 属性 / ランク / タイプ / 成長)。
// ★ 追加・調整はここのデータを書き換えるだけ。キャラ個別の if 分岐は書かない。

/** 属性:icon / color と、有利な相手(beats)。WATER > FIRE > THUNDER > WATER */
export const ATTRIBUTES = {
  WATER:   { id: 'WATER',   label: 'WATER',   icon: '💧', color: '#3ec5ff', beats: 'FIRE' },
  FIRE:    { id: 'FIRE',    label: 'FIRE',    icon: '🔥', color: '#ff6a3d', beats: 'THUNDER' },
  THUNDER: { id: 'THUNDER', label: 'THUNDER', icon: '⚡', color: '#ffd23e', beats: 'WATER' },
};

// 属性倍率(有利 1.3 / 通常 1.0 / 不利 0.7)は Config.battle.attributeMul(★ 調整パネルから変更可)

// レアリティ(枠の色・光は全カード共通:src/app/Rarity.js + online.html の「レアリティ」)。color は小さな文字表示用
export const RANKS = {
  N:   { id: 'N',   order: 0, color: '#a7aebb' },
  R:   { id: 'R',   order: 1, color: '#5d9bf2' },
  SR:  { id: 'SR',  order: 2, color: '#a576f5' },
  SSR: { id: 'SSR', order: 3, color: '#f7a23e' },
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
 *   heroineId   … (任意)攻略対象をプレイアブル化した味方版の時だけ、元の攻略対象の id(data/RomanceData.js の HEROINES)
 *   accent      … (任意)キャラ固有のアクセント(カードの薄い光・ガチャ TOP の色)。レアリティ共通の枠とは別。{ id, glow }
 *   gachaReveal … (任意)ガチャ登場時の追加演出の ID(src/gacha/RevealEffects.js)。無ければレアリティ共通の演出だけ
 *   special     … (任意)キャラ固有の必殺技(SPECIAL)。育成画面の説明とバトルの効果は両方ここだけを見る(画面に説明文を書かない)
 *       name / description / highlight(強調する数値・効果)/ note(補足)
 *       effectType … 効果の種類(src/effects/SpecialEffects.js):'attack' = 通常の SPECIAL だけ / 'healAll' = 命中で味方全員を回復 / 今後:防御・バフ・デバフ・蘇生…
 *       effectValue … 効果の数値(healAll なら与ダメージに対する割合 0.03 = 3%)
 *       visualEffect … 見た目の ID(src/effects/SpecialThrowEffects.js)。ダメージ・判定は変えない
 *     省略したキャラは DEFAULT_SPECIAL(全員共通の SPECIAL HEART)
 * 味方の女の子は ASMR を持たない(ASMR は攻略対象だけ。data/RomanceData.js)
 */
export const CHARACTERS = [
  {
    id: 'minamo', rank: 'SR', name: 'ミナモ', attribute: 'WATER', type: 'STRAIGHT',
    art: { portrait: 'minamo', fullBody: 'minamo', specialCutIn: 'minamo', cutout: 'minamo_cut' },
    portraitFocus: { x: 0.48, y: 0.21, zoom: 3.0 },
    cutIn: { faceX: 0.47, faceY: 0.18, x: 0.5, y: 0.34, scale: 1.9, rot: -6 },
    description: '高速ストレートを得意とするエース。POWER を溜めた直球で、狭いルートや Heart Gate を一気に抜ける。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'hinoka', rank: 'SR', name: 'ヒノカ', attribute: 'FIRE', type: 'STRAIGHT',
    art: { portrait: 'hinoka', fullBody: 'hinoka', specialCutIn: 'hinoka', cutout: 'hinoka_cut' },
    portraitFocus: { x: 0.45, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.43, faceY: 0.15, x: 0.5, y: 0.34, scale: 1.9, rot: 5 },
    description: '重めの直球で押し切る頼れるアタッカー。DEF も高く、返球のキャッチでも崩れにくい。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'raimu', rank: 'SR', name: 'ライム', attribute: 'THUNDER', type: 'CURVE',
    art: { portrait: 'raimu', fullBody: 'raimu', specialCutIn: 'raimu', cutout: 'raimu_cut' },
    portraitFocus: { x: 0.55, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.17, x: 0.5, y: 0.34, scale: 1.9, rot: -5 },
    description: '大きなカーブを自在に操るテクニカルタイプ。障害物を回り込み、左右の Diamond をまとめて回収する。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'shizuku', rank: 'SR', name: 'シズク', attribute: 'WATER', type: 'CURVE',
    art: { portrait: 'shizuku', fullBody: 'shizuku', specialCutIn: 'shizuku', cutout: 'shizuku_cut' },
    portraitFocus: { x: 0.43, y: 0.23, zoom: 3.0 },
    cutIn: { faceX: 0.40, faceY: 0.2, x: 0.5, y: 0.34, scale: 1.9, rot: 4 },
    description: '守りの要。DEF がとても高く、ゆったり曲がるカーブで Gate を順番につないでいく。',
    detail: { x: 0.52, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'akane', rank: 'R', name: 'アカネ', attribute: 'FIRE', type: 'CURVE',
    art: { portrait: 'akane', fullBody: 'akane', specialCutIn: 'akane', cutout: 'akane_cut' },
    portraitFocus: { x: 0.53, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.52, faceY: 0.15, x: 0.5, y: 0.34, scale: 1.9, rot: -4 },
    description: 'まだ粗削りな元気印。レベルを上げて伸びしろを見せたい、カーブ使いの新人。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  // ---- SSR ----
  {
    // ダークドラゴンの女の子(ガチャ PICK UP)。画像:assets/chara_yoruna.webp(カード用)/ cut_yoruna.webp(透過の全身)
    id: 'yoruna', rank: 'SSR', name: 'ヨルナ', attribute: 'FIRE', type: 'CURVE',
    art: { portrait: 'yoruna', fullBody: 'yoruna', specialCutIn: 'yoruna', cutout: 'yoruna_cut' },
    portraitFocus: { x: 0.53, y: 0.23, zoom: 3.0 },
    cutIn: { faceX: 0.53, faceY: 0.22, x: 0.5, y: 0.34, scale: 1.8, rot: -5 },
    description: '闇夜を焦がす恋の炎をまとうダークドラゴン。SPECIAL ではハートが翼のように分かれ、紫の炎を引いて一斉に届く。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
    accent: { id: 'yoruna', glow: '#b14dff' },
    gachaReveal: 'darkDragon',
    special: {
      name: 'DRAGON HEART BURST',
      description: '投げたハートが 1 → 3 → 7個へ分裂。ドラゴンの翼のように広がり、命中時にターゲットへ収束する。',
      highlight: { value: '1 → 3 → 7', label: 'HEART SPLIT' },
      note: '※ 分裂は演出。ダメージ判定は1回(SPECIAL 1回分)。',
      effectType: 'attack', effectValue: null, visualEffect: 'dragonSplit',
    },
  },
  {
    // 天使の女の子(回復型 SSR)。画像:assets/chara_sera.webp(カード用)/ cut_sera.webp(透過の全身)を置いて tools/embed_assets.py → art にキーを入れる
    id: 'sera', rank: 'SSR', name: 'セラ', attribute: 'THUNDER', type: 'STRAIGHT',
    art: {},
    portraitFocus: { x: 0.5, y: 0.24, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.24, x: 0.5, y: 0.34, scale: 1.8, rot: 4 },
    description: '白と金の翼で仲間を包む回復型の天使。必殺技が命中すると、与えたダメージの一部で味方全員を回復する。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
    accent: { id: 'sera', glow: '#ffd76a' },
    special: {
      name: 'ANGEL HEART',
      description: '必殺技の攻撃が命中すると、与えた最終ダメージの3%分、生存中の味方全員のHPを回復する。',
      highlight: { value: '与ダメージの 3%', label: 'ALL HEAL' },
      note: '※ HP 0 の味方は回復しない(蘇生ではない)。MISS では回復しない。',
      effectType: 'healAll', effectValue: 0.03, visualEffect: 'angelHeal',
    },
  },
  // ---- 追加キャラ(画像は未登録:art を空にしておくと仮のシルエットで表示。画像キーを入れるだけで差し替わる)----
  {
    id: 'kohaku', rank: 'SR', name: 'コハク', attribute: 'THUNDER', type: 'STRAIGHT',
    art: {},
    portraitFocus: { x: 0.5, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.2, x: 0.5, y: 0.36, scale: 1.6, rot: -4 },
    description: '稲妻のように速い一直線の投球が武器。動く障害物のすき間を、タイミングよく撃ち抜くのが得意。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'kagura', rank: 'SR', name: 'カグラ', attribute: 'FIRE', type: 'CURVE',
    art: {},
    portraitFocus: { x: 0.5, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.2, x: 0.5, y: 0.36, scale: 1.6, rot: 5 },
    description: '炎をまとう大きな弧を描く、火力自慢のカーブ使い。難しい 3D ルートを通すほど HEART が跳ね上がる。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },
  {
    id: 'nagi', rank: 'R', name: 'ナギ', attribute: 'WATER', type: 'STRAIGHT',
    art: {},
    portraitFocus: { x: 0.5, y: 0.2, zoom: 3.0 },
    cutIn: { faceX: 0.5, faceY: 0.2, x: 0.5, y: 0.36, scale: 1.6, rot: -3 },
    description: '穏やかな凪のように安定した直球とキャッチが持ち味。まずは確実にボスへ届けたい時に。',
    detail: { x: 0.5, y: 0.5, scale: 1.0, rot: 0 },
  },

];

/** SPECIAL を持たないキャラの必殺技(全員共通の SPECIAL HEART。効果の数値は Config.special.heartMul と同じ)*/
export const DEFAULT_SPECIAL = {
  name: 'SPECIAL HEART',
  description: 'SPECIAL ゲージ MAX でタップして予約。次の1投が大きなハートになり、届く HEART が大きく増える。',
  highlight: { value: 'HEART ×{heartMul}', label: 'SPECIAL' },   // {heartMul} は表示時に Config.special.heartMul に置き換える
  note: null, effectType: 'attack', effectValue: null, visualEffect: null,
};
for (const c of CHARACTERS) c.special ??= { ...DEFAULT_SPECIAL };


/** 旧IDからの移行(保存データ用) */
export const LEGACY_CHARACTER_IDS = { aqua: 'minamo', ignis: 'hinoka', raika: 'raimu', marin: 'shizuku', flare: 'akane' };

/** 初期パーティ(PartyData の既定値) */
export const DEFAULT_PARTY = ['minamo', 'hinoka', 'raimu', 'shizuku'];

/**
 * ステージ(StageData)
 *   boss.image … 同梱画像キー(assets/bossImages.js)/ boss.layout … 当たり判定レイアウト
 *   boss.art   … 画像の見せ方(省略時はリリスの画像と同じ構図):face = 顔の位置と幅(画像の割合 u / v / w。カードやアイコンは顔を中心に切り抜く)
 *                stage = 攻略画面の立ち絵(x = 横位置 translateX の割合 / h = 高さの倍率)
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
  {
    id: 'stage03', no: '03', name: '甘い夜のおねだり',
    // 専用イラスト(assets/boss_milk.webp)・専用の当たり判定(colliderLayouts.milk)・専用の表情位置(BossAffection.milk)
    boss: { name: 'みるく', attribute: 'FIRE', type: 'CURVE', image: 'milk', fallbackImage: 'demon', layout: 'milk', profile: 'lilith', affection: 'milk', maxHeart: 18000,
      art: { face: { u: 0.43, v: 0.43, w: 0.3 }, stage: { x: -0.24, h: 0.74 } } },
    recommended: 'WATER', difficulty: 'NORMAL', exp: 200,
    concept: '甘え上手な猫系の女の子。きらめくプレミアムコンカフェを舞台に、ハートを届けて口説き落とす。',
    line: '甘えていいよ…？ だって、好きでしょ…？',   // 攻略画面のセリフ(未設定のステージは共通の一言)
    space: { patterns: ['STRAIGHT_LINE', 'LEFT_CURVE', 'RIGHT_CURVE', 'S_CURVE', 'GATE_CHAIN', 'BANK_STARS'],
      energyDensity: 1.0, gateCount: 3, obstacleCount: 2, obstacleSpeed: 1.0 },
  },
];

// 成長(親密度 Lv・ステータス・アビリティ・STAMINA)は GrowthData.js

export const characterById = (id) => CHARACTERS.find((c) => c.id === id);
export const stageById = (id) => STAGES.find((s) => s.id === id);
