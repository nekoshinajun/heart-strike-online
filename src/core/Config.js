// ゲーム全体のチューニング値。調整はここに集約する。
// ★ 印の値は画面右上「調整」パネル(Inspector相当)からコードを書き換えずに変更できる(core/Tuning.js)。
import { APP_CONFIG } from './AppConfig.js';
const params = new URLSearchParams(location.search);

export const Config = {
  boss: {
    maxHeart: 10000,      // ★ TotalHeart の満タン値(100% でクリア)。ステージ開始時に StageData の値で上書き
    heartOverride: Number(params.get('heart')) || 0,  // テスト用:URL ?heart= で全ステージの満タン値を上書き
    z: -14.45,            // ボス(2D板)のZ位置(奥)。v15:ハート玉→ボス面の距離を 14.8 → 19.3(約1.3倍)
    scale: 1.55,          // ボスを主役にするため表示を約12%拡大(Colliderも一緒に拡大)
    profile: 'lulu',      // 使用する返球プロファイル(bossProfiles)
    name: 'DEMON GIRL',   // ボス名(HPバー表示)
    layout: 'demon',      // 使用するキャラ+当たり判定レイアウト:'demon'(同梱イラスト)/ 'lulu'(内蔵仮イラスト)/ 'image'(読み込み画像)
  },
  players: [
    { id: 'A', name: 'PLAYER A', color: '#ff4d6d', x: -0.9 },
    { id: 'B', name: 'PLAYER B', color: '#3ec5ff', x: -0.3 },
    { id: 'C', name: 'PLAYER C', color: '#ffd23e', x: 0.3 },
    { id: 'D', name: 'PLAYER D', color: '#5cf08a', x: 0.9 },
  ],
  playerMaxHp: 100,

  // ---- キャラクター性能・属性(data/BattleCalc.js が参照)----
  battle: {
    // 与ダメージ = ATK × アビリティ倍率 × ゲート倍率 × 着弾倍率(data/BattleCalc.js)。DEFENCE の効きは GrowthData.STAT_EFFECTS
    attributeMul: { advantage: 1.3, neutral: 1.0, disadvantage: 0.7 },   // ★ 属性相性:4要素の後に掛ける別枠(SPECIAL / FEVER と同じ扱い)
    bossAttackMul: 3.0,      // ★ ボス返球の基礎ダメージ倍率(v25 の 2.0 × 1.5)。難易度 damageTaken とは別に掛ける。PERFECT は常に 0
    // ボス攻撃フェーズの前のボイス(BOSS_TAUNT)。ボイスの中身は RomanceData の attackVoices
    voiceGapSec: 0.35,       // ボイスが終わってから攻撃までの間(秒)
    noVoicePauseSec: 0.9,    // ボイスが無い / 鳴らせない時の間(秒)
    voiceLoadWaitSec: 1.2,   // ボイスの読み込みを待つ上限(秒)。間に合わなければボイス無しで進める
    voiceBgmDuck: 0.45,      // ボイス中の BGM の音量(1 = 下げない)
    heartCapacityScale: 1.0, // ★ 全ステージの Heart Capacity に掛ける(バランス調整用)
  },

  // ---- 部位 ----
  // left / right は「キャラクター自身の左右」(参考レイアウト準拠)。画面では Right が左側、Left が右側。
  parts: {
    //   部位は命中の判定・リアクション用。与ダメージは部位で変わらない(顔でも脚でも同じ。着弾倍率は横方向の位置だけ:landing)
    //   maxHeart: 部位ごとの PartHeart 満タン値(★ 内部互換用)
    head:     { label: 'HEAD',    ja: '頭部', maxHeart: 100 },
    chest:    { label: 'CHEST',   ja: '胸部', maxHeart: 200 },
    stomach:  { label: 'STOMACH', ja: '腹部', maxHeart: 200 },
    rightArm: { label: 'R-ARM',   ja: '右腕', maxHeart: 150 },
    leftArm:  { label: 'L-ARM',   ja: '左腕', maxHeart: 150 },
    rightLeg: { label: 'R-LEG',   ja: '右脚', maxHeart: 150 },
    leftLeg:  { label: 'L-LEG',   ja: '左脚', maxHeart: 150 },
  },

  // ---- 着弾倍率:敵の中央縦ライン(画面の中央 = ボスの X)からの横方向の距離だけで決まる。Y(顔・胸・脚)は見ない ----
  //   within … 中央ラインからの横の距離(ワールド単位。ボスの頭の半径 ≈ 2.5)がこの値以下ならその段階。敵に当たらなければ MISS(×0)
  landing: {
    grades: [
      { id: 'PERFECT', within: 0.7, mul: 1.5, color: '#ffe28a' },   // ★ 中心ラインに最も近い
      { id: 'GREAT', within: 1.7, mul: 1.3, color: '#ff9bd0' },     // ★ 中心寄り
      { id: 'GOOD', within: 3.1, mul: 1.15, color: '#9fd8ff' },     // ★ やや外側
      { id: 'HIT', within: Infinity, mul: 1.0, color: '#ffffff' },  // 外側(敵に当たっていれば ×1.00 未満にはならない)
    ],
  },

  // ---- 当たり判定レイアウト(★ 調整パネルの「Collider」で編集可) ----
  // ボス板ポリのローカル座標(単位:ワールド、x=中心から右+ / y=足元から上+ / z=表示面から手前+)。
  // shape: 'box'(w×h×d, rot=Z回転°) | 'sphere'(r)。キャラ画像ごとにレイアウトを持つ。
  colliderLayouts: {
    // 同梱イラスト(座りポーズ・1024x1536 を高さ18で表示)。画像のピクセル位置から換算して配置
    demon: {
      head: { shape: "sphere", x: 0.33, y: 14.48, z: 0.3, r: 1.64 },
      chest: { shape: "box", x: 0.8, y: 12.02, z: 0.3, w: 3.28, h: 2.11, d: 1.6, rot: 0 },
      stomach: { shape: "box", x: 1.5, y: 9.97, z: 0.3, w: 2.46, h: 1.76, d: 1.6, rot: 0 },
      rightArm: { shape: "box", x: -0.84, y: 11.44, z: 0.3, w: 2.46, h: 3.87, d: 1.6, rot: -15 },
      leftArm: { shape: "box", x: 3.73, y: 8.92, z: 0.3, w: 2.23, h: 6.56, d: 1.6, rot: 17 },
      rightLeg: { shape: "box", x: -1.72, y: 6.4, z: 0.3, w: 2.23, h: 7.73, d: 1.6, rot: -23 },
      leftLeg: { shape: "box", x: 1.15, y: 5.58, z: 0.3, w: 1.99, h: 6.56, d: 1.6, rot: 14 },
    },
    // みるく(寝そべりポーズ・正方形 1024x1024 を高さ12で表示・y +7.6 = 顔がリリスと同じ高さ。画像の下端はフェード)
    //   手前の腕・猫の手・腰・しっぽ。画像の割合 (u, v) → x = (u - 0.5) × 12 / y = (1 - v) × 12 + 7.6
    milk: {
      head:     { shape: 'sphere', x: -0.84, y: 14.32, z: 0.3, r: 1.73 },
      chest:    { shape: 'box', x: 0.36,  y: 10.84, z: 0.3, w: 2.76, h: 2.04, d: 1.6, rot: 0 },
      stomach:  { shape: 'box', x: 0.84,  y: 9.4,   z: 0.3, w: 1.92, h: 1.2, d: 1.6, rot: 0 },
      rightArm: { shape: 'box', x: -3.0,  y: 11.2,  z: 0.3, w: 2.64, h: 3.6, d: 1.6, rot: 0 },
      leftArm:  { shape: 'box', x: 3.36,  y: 8.92,  z: 0.3, w: 4.32, h: 1.92, d: 1.6, rot: 12 },
      rightLeg: { shape: 'box', x: 4.68,  y: 12.16, z: 0.3, w: 2.04, h: 2.4, d: 1.6, rot: 0 },
      leftLeg:  { shape: 'box', x: 4.8,   y: 16.0,  z: 0.3, w: 1.68, h: 3.6, d: 1.6, rot: 0 },
    },
    // ラト(ステラ・Live2D の浮いたポーズ)。Live2D の描画範囲を data/CharacterAssets.js(rato.live2d)の display(高さ9・y +6.95・x -1)で表示した時の位置
    //   キャンバスの割合 (u, v) → x = (u - 0.48) × 14.43 - 1 / y = 6.95 + (1.04 - v) × 8.11。Live2D の ArtMesh は判定に使わない
    rato: {
      head:     { shape: 'sphere', x: -1.22, y: 13.6, z: 0.3, r: 1.44 },
      chest:    { shape: 'box', x: -1.0, y: 11.41, z: 0.3, w: 2.16, h: 1.62, d: 1.6, rot: 0 },
      stomach:  { shape: 'box', x: -0.71, y: 8.98, z: 0.3, w: 3.61, h: 2.11, d: 1.6, rot: 0 },
      rightArm: { shape: 'box', x: -3.74, y: 11.81, z: 0.3, w: 1.44, h: 2.76, d: 1.6, rot: -10 },
      leftArm:  { shape: 'box', x: -0.13, y: 11.73, z: 0.3, w: 1.01, h: 1.3, d: 1.6, rot: 0 },
      rightLeg: { shape: 'box', x: 1.02, y: 11.73, z: 0.3, w: 2.02, h: 3.08, d: 1.6, rot: -35 },
      leftLeg:  { shape: 'box', x: 3.04, y: 9.71, z: 0.3, w: 2.02, h: 3.08, d: 1.6, rot: 20 },
    },
    // 内蔵の仮イラスト(立ち姿)
    lulu: {
      head:     { shape: 'sphere', x: 0,     y: 15.5,  z: 0.3, r: 1.75 },
      chest:    { shape: 'box', x: 0,     y: 12.2,  z: 0.3, w: 3.5, h: 2.8, d: 1.6, rot: 0 },
      stomach:  { shape: 'box', x: 0,     y: 9.85,  z: 0.3, w: 2.7, h: 1.9, d: 1.6, rot: 0 },
      rightArm: { shape: 'box', x: -2.35, y: 10.25, z: 0.3, w: 1.0, h: 4.8, d: 1.4, rot: 0 },
      leftArm:  { shape: 'box', x: 2.35,  y: 10.25, z: 0.3, w: 1.0, h: 4.8, d: 1.4, rot: 0 },
      rightLeg: { shape: 'box', x: -0.82, y: 4.4,   z: 0.3, w: 1.55, h: 8.8, d: 1.6, rot: 0 },
      leftLeg:  { shape: 'box', x: 0.82,  y: 4.4,   z: 0.3, w: 1.55, h: 8.8, d: 1.6, rot: 0 },
    },
    // 差し替え画像用の初期値(参考資料の座りポーズ:頭上部中央・腕は左右・脚は下へ開く)
    image: {
      head:     { shape: 'sphere', x: 0,    y: 15.2, z: 0.3, r: 2.2 },
      chest:    { shape: 'box', x: 0,    y: 11.3, z: 0.3, w: 4.2, h: 2.4, d: 1.6, rot: 0 },
      stomach:  { shape: 'box', x: 0,    y: 8.7,  z: 0.3, w: 3.4, h: 2.4, d: 1.6, rot: 0 },
      rightArm: { shape: 'box', x: -3.9, y: 9.8,  z: 0.3, w: 1.6, h: 5.2, d: 1.4, rot: -12 },
      leftArm:  { shape: 'box', x: 3.9,  y: 9.8,  z: 0.3, w: 1.6, h: 5.2, d: 1.4, rot: 12 },
      rightLeg: { shape: 'box', x: -3.2, y: 3.6,  z: 0.3, w: 2.2, h: 7.0, d: 1.6, rot: 38 },
      leftLeg:  { shape: 'box', x: 3.2,  y: 3.6,  z: 0.3, w: 2.2, h: 7.0, d: 1.6, rot: -38 },
    },
  },
  // 画像ボスの表示サイズ(★ レイアウトごと。高さ=ワールド単位、y=上下オフセット)
  bossImage: {
    demon: { height: 18, y: 0 },
    milk: { height: 12, y: 7.6 },
    image: { height: 19, y: 0 },
  },
  partHeart: {
    partGainRate: 0.15,    // ★ PartHeart への加算 = 届いた HEART × この値(内部互換用。与ダメージには影響しない)
    warmAt: 0.5,           // ★ PartHeart がこの割合以上で WARM(リアクション段階)
  },


  camera: {
    fov: 70,
    // 構図:少し見下ろす(敵までの床の道が見えて、距離が直感でわかる)。ボスはできるだけ大きく、全身が床に立って見える
    //   旧 pos(0, 9, 4.5)→ lookAt(0, 15, -14.45)(見上げ・顔を近く大きく)。投球の到達点・時間は throwInput.refStart で旧構図のまま
    //   FOV は同じなので、ハート玉の画面上の位置・大きさ(構え位置はカメラ基準)は変わらない
    pos: { x: 0, y: 14, z: 12 },
    lookAt: { x: 0, y: 11, z: -14 },
  },

  // ---- 敵までの距離ガイド(world/DistanceGuide.js):投げる前だけ、床に ハート → 敵の道(点線リング + 矢印)と敵の足元の光る円 ----
  distanceGuide: {
    enabled: true,       // ★ false で出さない
    rings: 4,            // 1本の道のリングの数(同じ大きさのリングが奥ほど小さく見える = 距離)
    ringRadius: 1.25,    // リングの半径(ワールド)
    arrowSize: 1.7,      // 矢印の大きさ(ワールド)
    startNdc: -0.95,     // 道の手前の端 = 画面のこの高さ(NDC。-1 = 下端)に見える床
    end: 0.9,            // 道の奥の端(手前の端 → 敵の足元の何割まで。足元の光る円に重ならない所まで)
    padScale: 1.0,       // 足元の光る円の大きさ
    flowSpeed: 1.2,      // 手前 → 奥へ流れる光の速さ
  },

  ball: {
    skin: 'heart',        // 'heart'(ハート玉)| 'sphere'(旧ボール)
    radius: 0.3,
    holdOffset: { x: 0, y: -1.3, z: -3.2 },  // z = 構え位置の奥行き(カメラからの距離)。y は旧仕様(未使用)
    // ★ 投球前のハートの位置:画面の中央・高さ 75%(画面高さ比。0=上端 / 1=下端)
    idlePositionY: 0.75,
    // ★ ハートより下に必ず残す余白(画面高さ比。Safe Area の下端から測る)。縦に短い画面でも下がりすぎない
    idleMinBottomSpace: 0.08,
    catchDepth: 2.1,                          // キャッチ地点のカメラからの距離
    // ハートの見た目の回転(rad/秒)。投球前(構え / 引っ張り中)は全キャラ共通の一定速度。キャラ性能は投球後の軌道にだけ出す
    idleSpin: { held: 1.2, grabbed: 3, flying: 3 },
  },

  // ---- 投球(Pokémon GO 型:ハートを触る → 指についてくる → フリックして離す)----
  //   入力の解析は src/throw/GestureAnalyzer.js、2D → 3D は src/physics/CurveThrowCalculator.js(compute)
  throw: {
    grabRadiusScale: 1.9,  // ボール見かけ半径×この値 以内のタッチで掴める
    grabRadiusMin: 46,     // px
    sampleWindowMs: 80,    // (InputManager の FlickInfo 用。投球の向き・速さは throwInput.releaseWindowMs)
    // ★ 投球の重力(弾道の高さと飛ぶ時間は throwInput の発射角・速さとセット)
    //   球速を k 倍にする時は 初速 ×k・重力 ×k² で、同じ弾道(届く所・高さ・カーブ)のまま速さだけ変わる
    gravity: 56,
    fixedStep: 1 / 240,    // 物理の固定ステップ(同じ入力 = 同じ軌道)
    maxFlightTime: 3.5,
    floorBounce: 0.42,
  },
  // 表示用の強さの尺度。HEART(ダメージ)は球速で変えない(速い球 = 強い球ではない)
  power: {
    minThrowPower: 0.10,   // 表示上の POWER の下限(弱い投げ = この値。強さは 0〜1 を minThrowPower〜1 に並べる)
  },

  // ---- カーブ(spin -1〜1 → 飛行中の横の力)。spin はジェスチャーの回転量から(throwInput)----
  curve: {
    maxSpin: 1.0,
    shift: 2.9,            // ★ spin=1・CURVE 50 のとき、まっすぐの到達点から曲がる向きへずれる量(units)
    bulge: 1.2,            // ★ spin=1 のとき、逆側へ膨らむ量(units)
    rampTime: 0.001,       // 横力の立ち上がり(0に近いほど解析どおりの軌道)
  },

  // ---- 投球の入力(GestureAnalyzer)と 2D → 3D(CurveThrowCalculator.compute)----
  //   方向 = 離す直前 releaseWindowMs の向き / 強さ = その速さ / カーブ = 掴んでから離すまでの軌跡全体の回転
  //   事前にハートを回す(1回転 = 360°)のも、→ ↑ ← と弧を描いて投げる(180°)のも同じ回転として数える
  throwInput: {
    releaseWindowMs: 90,   // ★ リリース方向・速さを測る区間(離す直前)
    strokeTolDeg: 35,      // 最後の弾き(まっすぐな区間)とみなす向きのずれ
    stepPx: 7,             // 向きの変化を測る区間の長さ(指の震えを数えない)
    maxStepDeg: 110,       // 1区間でこれ以上向きが変わったら折り返し(回転に数えない)
    deadDeg: 30,           // ★ これ未満の回転はストレート(ほぼ直線のフリック)
    fullTurnDeg: 1080,     // ★ 3回転で最大カーブ(1回転 ≈ 33% / 2回転 ≈ 67%)。それ以上は最大で止める
    maxSpin: 1.0,          // カーブ入力 1 のときの spin
    // 投げたと判定する条件
    minReleaseSpeed: 0.45, // ★ 画面高さ/秒。これ未満(止めて離した)は投げずに構えへ戻る
    minUpward: 0.3,        // 上向きの成分(リリース方向の -y)がこれ未満(横・下へ払った)は投げない
    // 速さ → 強さ 0〜1(画面高さ/秒)
    weakSpeed: 0.8,        // ★ これ以下 = 強さ 0(手前に落ちる)
    strongSpeed: 3.4,      // ★ これ以上 = 強さ 1(奥まで届く)
    // 強さ → 水平の初速(units/秒)。発射角は一定 → 速いほど遠く・高く届く。飛ぶ時間 ≈ 0.5〜0.8 秒
    minVelocity: 11,       // ★
    maxVelocity: 33,       // ★
    launchDeg: 55,         // ★ 発射角(水平から)
    // 向き:画面のリリース方向の傾き → 水平の向き
    yawGain: 0.45,         // ★ 45° 斜めに弾く → 約20° 斜めへ
    maxYawDeg: 32,
    heartRollMul: 1.0,     // 掴んでいる間のハートの見た目の回転(軌跡の回転角 × この値)
    // 弾道の基準の構え位置(y / z)。強さ・向き → 到達点と飛ぶ時間はここから投げた時と同じにする(見上げカメラの頃のハートの位置)
    //   カメラの構図を変えても投げの手応え(同じフリック = 同じ所へ届く)が変わらない。null で実際の構え位置から
    refStart: { y: 8.87, z: 1.11 },
  },

  // ---- バトル開始演出(OPENING):インゲームに入り バトル BGM が流れる中でボス紹介 → BATTLE START → A の投球 ----
  //   各時刻は OPENING に入ってからの秒。MULTI はサーバーが全員に同じ長さ(totalSec)を配る
  //   最初に全体図(overview:高く後ろに引いたカメラでコースとボスを見せる)→ プレイ位置へ寄る → ボス紹介
  opening: {
    overview: {
      hold: 1.3,         // 全体図を見せる秒数
      move: 1.5,         // 全体図 → プレイ位置へ寄る秒数
      pos: { x: 0, y: 21, z: 22 },        // 全体図のカメラ位置
      lookAt: { x: 0, y: 6, z: -14 },     // 全体図の注視点(道の先のボスのあたり)
    },
    dimAt: 2.8,          // 画面を少し暗くする(全体図の後)
    bossAt: 3.0,         // ボスを強調(カメラを寄せる)
    nameAt: 3.2,         // TARGET / 名前
    diffAt: 3.4,         // 難易度
    textAt: 3.6,         // 紹介文 / セリフ(データがある時だけ)
    fadeAt: 5.6,         // 紹介 UI のフェードアウト開始
    fadeSec: 0.35,
    startSec: 0.8,       // 「BATTLE START」を見せてから A の投球へ
    dim: 0.45,           // 暗さ(0〜1)
    bossZoom: 4,         // ボスへ寄せる量
  },

  // ---- 雑魚戦(ボスの前の WAVE。雑魚の性能・見た目は data/MinionData.js、どこに出すかは StageData.waves)----
  minion: {
    zOffset: 0.5,        // 雑魚の面の Z(ボスの面からの手前へのずれ。ハートが届く距離はボスとほぼ同じ)
    // 全員倒した → 奥へ進む → ボス登場(WaveAdvanceState)。各時刻はその状態に入ってからの秒
    advance: { clearAt: 0.0, goAt: 0.9, arriveAt: 1.9, cardAt: 2.2, endAt: 4.4, dolly: 9, fov: 14 },
  },

  // 命中した位置のマーク(実際に Collider に当たった座標)
  hitMark: { life: 1.0, popScale: 1.25, popSec: 0.12, fadeFrom: 0.75, size: 1.1, color: '#ff7ab8', max: 6 },

  // ---- エネルギー / 必殺技 ----
  energy: {
    // Diamond(コース上の光る宝石)= 必殺技(SPECIAL)ゲージを溜めるためだけのもの。ダメージ倍率・FEVER には関係しない
    label: 'DIAMOND',      // 表示名
    orbValue: 10,          // ★ Diamond 1個で SPECIAL ゲージに入る量。ゲージの最大値はキャラごと = 必要な Diamond の個数(CharacterData.special.requiredDiamonds)× この値
    orbRadius: 0.5,        // 取得判定の半径(ボール半径と合算)。奥の Orb が小さく見える分わずかに拡大(旧 0.42)
    // ルート定義:ルートごとの「お手本の1投」をシミュレーションして、その軌道上に Orb を置く(=必ず取れる配置)
    // target: 部位 / power: 0〜1 / spin: -1〜1(負=左カーブ ↑→←, 正=右カーブ ↑←→)/ count: 個数 / span: 軌道のどこに置くか
    routes: {
      center:     { target: 'chest',    power: 0.68, spin: 0,     count: 1, span: [0.45, 0.45] },
      left:       { target: 'rightArm', power: 0.76,  spin: 0,     count: 2, span: [0.35, 0.7] },
      right:      { target: 'leftArm',  power: 0.76,  spin: 0,     count: 2, span: [0.35, 0.7] },
      curveRtoL:  { target: 'chest',    power: 0.88, spin: -0.85, count: 4, span: [0.25, 0.85] },
      curveLtoR:  { target: 'stomach',  power: 0.88, spin: 0.85,  count: 4, span: [0.25, 0.85] },
      high:       { target: 'head',     power: 0.4,  spin: 0,     count: 3, span: [0.3, 0.8] },
      low:        { target: 'leftLeg',  power: 1.0,  spin: 0,     count: 3, span: [0.3, 0.8] },
      lowCurve:   { target: 'rightLeg', power: 1.0,  spin: -0.6,  count: 3, span: [0.35, 0.85] },
    },
  },
  // ---- 3D 空間の攻略(Heart Energy の3D配置 / Heart Gate / 障害物 / Bank Shot)----
  space: {
    // 内部の奥行きレイヤー(ハート玉の構え位置 = 0 → ボス面 = 1 の割合)。UI には出さない
    layers: { NEAR: 0.22, MID: 0.5, FAR: 0.78 },
    gate: {
      radius: 1.45,              // ★ Heart Gate の内径(通過判定。遊びやすさ優先で大きめ)
      chainBonus: [1.0, 1.1, 1.25, 1.5],   // ★ GATE CHAIN 0/1/2/3 のHEART倍率(ボスに当たった時だけ)
    },
    bank: {
      restitution: 0.72,         // ★ 障害物での反発(法線方向)
      speedKeep: 0.82,           // ★ 反射後に残る速さ(POWER 減少)
      curveKeep: 0.5,            // 反射後に残るカーブの横力
      maxHits: 3,
    },
    obstacleClearance: 1.9,      // 障害物と Heart Gate の基本ルート(guide)との最小距離(障害物の半径 + この値)。Gate を正しく狙った投球を邪魔しない
    // 障害物はすべて「壁」系の見た目(当てたらダメ:暗い石の壁 + 赤い警告の縁と ✕)。ゲート(ピンクの光る輪 = 狙うもの)と一目で区別する
    //   当たり判定は従来どおり:block / pillar / panel は球(radius)、wall は箱(w × h × d)。見た目の壁はその判定の中に収まる大きさ
    //   block … 正方形のブロック / pillar … 縦長の柱 / panel … 横長の板 / wall … 大きな壁(動く壁など)
    obstacleShapes: {
      block:  { radius: 0.95, color: '#ff3b3b', size: [1.34, 1.34, 0.5] },
      pillar: { radius: 1.0,  color: '#ff3b3b', size: [1.1, 1.65, 0.55] },
      panel:  { radius: 1.2,  color: '#ff3b3b', size: [2.1, 1.1, 0.45] },
      wall:   { w: 3.2, h: 2.4, d: 0.5, color: '#ff3b3b' },
    },
    /**
     * ★ 2ルート同時配置(DualRoutePairs):1投ごとに Heart Gate のルートを左右2本、同時にフィールドへ出す。
     *   プレイヤーはボタンでルートを選ばない。画面を見て「左 / 右どっちを通そう?」と決め、実際のフリックで狙う
     *   → 投げた結果、通ったゲートが自動で決まる(どちらにも入らなくても投球は続き、ボスへの HIT / MISS は通常どおり)
     *   ゲートの効果は従来のまま(GATE PASS → GATE CHAIN。ボスに当たった時だけ chainBonus)
     *   left / right … { pattern: RoutePattern の ID, tx?: 狙い点の左右ずらし(world)}。各ルートは pattern の Gate / Energy を置く
     *   obstacles … 障害物を置くルート('left' | 'right' | null)。障害物は両方のルートと全ゲートから離す
     *   minGateGap … 左右のゲート中心の最小距離(world。奥行きが近いゲート同士)。足りなければ狙い点を左右へ広げる
     *   ※ ゲートはハート玉より上(操作領域の外)に見える組み合わせだけ。床すれすれの LOW_ROUTE は今の目線の構図では
     *     ハート玉の下に重なるのでペアに入れない
     */
    dualRoutes: {
      minGateGap: 4.2,
      pairs: {
        CURVE_PAIR:     { left: { pattern: 'LEFT_CURVE' },               right: { pattern: 'RIGHT_CURVE' },             obstacles: null },
        STRAIGHT_PAIR:  { left: { pattern: 'STRAIGHT_LINE', tx: -2.2 },  right: { pattern: 'STRAIGHT_LINE', tx: 2.2 },  obstacles: null },
        CURVE_STRAIGHT: { left: { pattern: 'LEFT_CURVE' },               right: { pattern: 'STRAIGHT_LINE', tx: 2.4 },  obstacles: null },
        STRAIGHT_CURVE: { left: { pattern: 'STRAIGHT_LINE', tx: -2.4 },  right: { pattern: 'RIGHT_CURVE' },             obstacles: null },
        ARC_CURVE:      { left: { pattern: 'HIGH_ARC', tx: -2.2 },       right: { pattern: 'RIGHT_CURVE' },             obstacles: 'left' },
        CHAIN_S:        { left: { pattern: 'GATE_CHAIN' },               right: { pattern: 'S_CURVE' },                 obstacles: null },
        BANK_PAIR:      { left: { pattern: 'BANK_STARS', tx: -1.6 },     right: { pattern: 'RIGHT_CURVE' },             obstacles: 'left' },
        WALL_PAIR:      { left: { pattern: 'LEFT_CURVE' },               right: { pattern: 'WALL_GAP', tx: 2.4 },       obstacles: 'right' },
        DRIFT_PAIR:     { left: { pattern: 'STAR_DRIFT', tx: -2.2 },     right: { pattern: 'RIGHT_CURVE' },             obstacles: 'left' },
      },
    },
    shortPreview: { enabled: false, fraction: 0.16 },   // ★ 投球前の予測ライン(ハート玉の直後だけ。全軌道は見せない)
    energyColors: ['#3ee8ff', '#ff7ad9', '#b6ff5c', '#ffb13d'],
    /**
     * RoutePatternData:お手本の1投(guide)と、その周りに置くポイントのリスト。
     *   guide … { target: 部位, tx, ty(狙い点のずらし・world), power, spin }。現在キャラの CURVE ステータス込みで物理シミュレーションする
     *           → ポイントを guide の軌道に沿って置けば「その投げ方をすれば必ず届く」3D ルートになる
     *   points … { type: 'Energy' | 'Gate' | 'Obstacle' | 'Empty', at: レイヤー名 or 0〜1, to?(Energy の列の終点), count?,
     *              dx, dy(軌道からのずれ・world。X=左右 / Y=高さ / Z=at), anchor: 'path'(既定)| 'world'(x, y を絶対座標で指定),
     *              shape / move: { axis: 'x' | 'y', amp, speed(往復/秒) }(Obstacle)}
     *   kind … 'straight' | 'curve' | 'arc' | 'low' | 'obstacle'(ステージの抽選・テスト用の目安)
     */
    routePatterns: {
      STRAIGHT_LINE: { label: 'STRAIGHT LINE', kind: 'straight',
        guide: { target: 'chest', power: 0.85, spin: 0 },
        points: [
          { type: 'Energy', at: 'NEAR', to: 'FAR', count: 5 },
          { type: 'Gate', at: 'MID' },
          { type: 'Obstacle', shape: 'block', anchor: 'world', x: 3.8, y: 9, at: 0.6 },
        ] },
      LEFT_CURVE: { label: 'LEFT CURVE', kind: 'curve',   // 手前中央 → 左中間 → 左奥 → ボス中央
        guide: { target: 'chest', land: true, power: 0.85, spin: 1.0 },
        points: [
          { type: 'Energy', at: 0.16 },
          { type: 'Energy', at: 0.4, dy: 0.3 },
          { type: 'Gate', at: 'MID' },
          { type: 'Energy', at: 0.66, to: 'FAR', count: 2 },
          { type: 'Obstacle', shape: 'pillar', anchor: 'world', x: 3.6, y: 10, at: 0.55 },
        ] },
      RIGHT_CURVE: { label: 'RIGHT CURVE', kind: 'curve',
        guide: { target: 'chest', land: true, power: 0.85, spin: -1.0 },
        points: [
          { type: 'Energy', at: 0.16 },
          { type: 'Energy', at: 0.4, dy: 0.3 },
          { type: 'Gate', at: 'MID' },
          { type: 'Energy', at: 0.66, to: 'FAR', count: 2 },
          { type: 'Obstacle', shape: 'pillar', anchor: 'world', x: -3.8, y: 10, at: 0.55 },
        ] },
      HIGH_ARC: { label: 'HIGH ARC', kind: 'arc',   // 中間〜奥が高い(POWER を落として山なりに / 長く弾いて頭へ)
        guide: { target: 'head', power: 0.5, spin: 0 },
        points: [
          { type: 'Energy', at: 'NEAR' },
          { type: 'Gate', at: 0.45 },
          { type: 'Energy', at: 0.55, to: 0.9, count: 3 },
          { type: 'Obstacle', shape: 'panel', anchor: 'world', x: -3.8, y: 7, at: 'MID' },
        ] },
      LOW_ROUTE: { label: 'LOW ROUTE', kind: 'low',   // 床すれすれの低弾道(強い POWER で短く弾く)
        guide: { target: 'leftLeg', tx: -1.4, power: 1.0, spin: 0 },
        points: [
          { type: 'Energy', at: 0.2, to: 0.85, count: 4 },
          { type: 'Gate', at: 'FAR' },
          { type: 'Obstacle', shape: 'panel', anchor: 'world', x: 4.0, y: 4.5, at: 'MID' },
        ] },
      S_CURVE: { label: 'S CURVE', tier: 'hard', kind: 'curve',   // 右へ膨らんでから左へ切り返す
        guide: { target: 'stomach', land: true, power: 0.8, spin: -1.0 },
        points: [
          { type: 'Energy', at: 0.2 },
          { type: 'Gate', at: 0.38 },
          { type: 'Energy', at: 0.55 },
          { type: 'Gate', at: 'FAR' },
          { type: 'Energy', at: 0.9 },
        ] },
      GATE_CHAIN: { label: 'GATE CHAIN', tier: 'hard', kind: 'curve',
        guide: { target: 'chest', land: true, power: 0.9, spin: 0.9 },
        points: [
          { type: 'Gate', at: 0.25 },
          { type: 'Energy', at: 0.35, to: 0.45, count: 2 },
          { type: 'Gate', at: 0.55 },
          { type: 'Energy', at: 0.65 },
          { type: 'Gate', at: 0.82 },
        ] },
      WALL_GAP: { label: 'WALL GAP', tier: 'hard', kind: 'obstacle',   // 魔法の壁が左右に動く:開いた瞬間に通す / 回り込む
        guide: { target: 'chest', power: 0.95, spin: 0 },
        points: [
          { type: 'Energy', at: 'NEAR', to: 0.4, count: 2 },
          { type: 'Obstacle', shape: 'wall', at: 'MID', move: { axis: 'x', amp: 2.8, speed: 0.2 } },
          { type: 'Energy', at: 0.66, to: 'FAR', count: 2 },
          { type: 'Gate', at: 0.85 },
        ] },
      STAR_DRIFT: { label: 'WALL DRIFT', tier: 'hard', kind: 'obstacle',
        guide: { target: 'stomach', power: 0.85, spin: 0 },
        points: [
          { type: 'Energy', at: 0.2 },
          { type: 'Obstacle', shape: 'block', at: 0.45, dy: 0.4, move: { axis: 'x', amp: 2.6, speed: 0.28 } },
          { type: 'Obstacle', shape: 'pillar', at: 0.72, dy: -0.4, move: { axis: 'y', amp: 2.0, speed: 0.22 } },
          { type: 'Energy', at: 0.6, to: 0.9, count: 2 },
          { type: 'Gate', at: 'FAR', dy: 0.4 },
        ] },
      BANK_STARS: { label: 'BANK WALLS', tier: 'hard', kind: 'obstacle',   // 左右の壁に当てて跳ね返す(BANK SHOT)
        guide: { target: 'chest', power: 0.85, spin: 0 },
        points: [
          { type: 'Energy', at: 'NEAR', to: 'MID', count: 3 },
          { type: 'Obstacle', shape: 'block', anchor: 'world', x: -3.6, y: 11, at: 0.72 },
          { type: 'Obstacle', shape: 'block', anchor: 'world', x: 4.2, y: 11, at: 0.72 },
          { type: 'Gate', at: 'FAR' },
        ] },
    },
  },

  // ---- 難易度(DifficultyData)----
  // 最終的な設定 = StageData × DifficultyData。キャラクターの ATK / DEF は変えない(敵・ステージ・3D ギミック側だけ)
  //   heartCapacity … Boss Heart Capacity 倍率 / returnSpeed … 返球の速さ / catchWindow … キャッチ判定(時間・位置)の広さ
  //   energyDensity … Heart Energy の数 / energyJitter … Energy をお手本の軌道から少しずらす量(world。難しい配置)
  //   gateSize … Heart Gate の大きさ / obstacleCount … 障害物の上限の倍率 / extraMovers … パターンに足す「動く障害物」の数
  //   obstacleSpeed … 障害物の速さ / highRouteWeight … 高難度 Route Pattern(tier: 'hard')の出やすさ(0 = 等確率)
  //   exp … 獲得 EXP 倍率 / locked … 将来の解放条件用(今回は全部 false)
  // DifficultyData:ゲームプレイ上、難易度で変えるのは Heart Gate の大きさ(gateSize)と被ダメージ(damageTaken)だけ。
  // キャッチ判定幅・返球速度・HEART容量・Energy配置・障害物は全難易度共通。exp はクリア報酬倍率。
  //   damageTaken … ボスの攻撃の被ダメージ倍率(DEFENCE の軽減の後に掛かる・PERFECT は常に 0)。★ NORMAL は 0.6(以前の 60%)
  difficulties: {
    NORMAL: { id: 'NORMAL', label: 'NORMAL', ja: 'ノーマル', desc: '標準難易度', note: 'Heart Gate が大きく、受けるダメージが少ない', color: '#3fd98a',
      heartCapacity: 1.0, returnSpeed: 1.0, damageTaken: 0.6, energyDensity: 1.0, energyJitter: 0, gateSize: 1.0,
      obstacleCount: 1.0, extraMovers: 0, obstacleSpeed: 1.0, highRouteWeight: 0, exp: 1.0, locked: false },
    HARD: { id: 'HARD', label: 'HARD', ja: 'ハード', desc: '上級者向け', note: 'キャッチ判定は同じ。Gate が小さく、受けるダメージが増える', color: '#ff9b1f',
      heartCapacity: 1.0, returnSpeed: 1.0, damageTaken: 1.25, energyDensity: 1.0, energyJitter: 0, gateSize: 0.72,
      obstacleCount: 1.0, extraMovers: 0, obstacleSpeed: 1.0, highRouteWeight: 0, exp: 1.5, locked: false },
    HELL: { id: 'HELL', label: 'HELL', ja: '地獄', desc: '最高難易度', note: 'キャッチ判定は同じ。Gate がかなり小さく、受けるダメージがさらに増える', color: '#ff3d5a',
      heartCapacity: 1.0, returnSpeed: 1.0, damageTaken: 1.5, energyDensity: 1.0, energyJitter: 0, gateSize: 0.5,
      obstacleCount: 1.0, extraMovers: 0, obstacleSpeed: 1.0, highRouteWeight: 0, exp: 2.5, locked: false },
  },
  difficultyOrder: ['NORMAL', 'HARD', 'HELL'],
  // 実行中の難易度の値(GameManager.startStage が設定。判定・返球などはここを読む)
  runtime: { difficulty: 'NORMAL', returnSpeed: 1, gateSize: 1, damageTaken: 1 },

  // ---- サウンド ----
  audio: {
    bgm: true,               // ★ BGM を鳴らすか(開発用の一括スイッチ。ユーザーの ON/OFF は設定画面 = セーブの settings.audio)
    bgmVolume: 0.4,          // ★ BGM の最大音量(設定画面の音量 100% のとき)。実際の音量 = 設定値 × これ。ボイス・SE より小さく
    bgmFade: 0.5,            // BGM の音量変化のフェード(秒)
    dokunVolume: 0.9,    // ★ 心音「ドクン……」の音量
  },

  // ---- FEVER TIME(COMBO を続けたご褒美:現在キャラから4人が1投ずつ強力に投げるボーナスラウンド)----
  //   ゲージの役割は1つだけ:ボスへの攻撃の HIT で溜まる。COMBO(連続 HIT)が続くほど1回の増え方が大きい
  //   MISS で COMBO は 0 に戻るが、溜まったゲージは減らない(次の HIT はまた 1 COMBO の増え方から)
  //   Heart Gate(= ダメージ倍率)・Diamond(= SPECIAL ゲージ)・キャッチでは増えない
  fever: {
    // ★ HIT 1回で増える FEVER(%)。その HIT の COMBO 数が min 以上の一番上の段を使う
    //   当て続ける:5 → 10 → 18 → 26 → 34 → 45 → 56 → 67 → 81 → 95 → 100(11 HIT)/ COMBO が続かない:5% ずつ(20 HIT)
    comboGain: [{ min: 1, gain: 5 }, { min: 3, gain: 8 }, { min: 6, gain: 11 }, { min: 9, gain: 14 }],
    throwsPerActivation: 4,      // ★ FeverThrowsPerActivation
    energyCountMultiplier: 1.0,  // ★ FeverEnergyCountMultiplier(パターンの Orb 数に掛ける)
    energyPatternScale: 1.0,     // ★ EnergyPatternScale(螺旋・ジグザグの広がり)
    orbSpacing: 0.55,            // FEVER 中の Orb の最小間隔(通常 0.9)
    introDuration: 0.8,          // ★ FeverIntroDuration(実時間・秒)
    outroDuration: 0.45,         // ★ FeverOutroDuration(実時間・秒)
    slowMotionScale: 0.3,        // ★ FeverSlowMotionScale(突入演出中のゲーム時間)
    /**
     * FEVER 専用の Energy 配置パターン(毎投ランダム)。既存の Energy システム(ルート = お手本の1投を物理で
     * シミュレーションして軌道上に並べる)をそのまま使う → どのパターンも「その投げ方をすれば取れる」。
     * item: { route: ルート名 または {target, power, spin}, count, span:[開始,終了](軌道の割合), offset? }
     *   offset: { type:'spiral', radius, turns } | { type:'zigzag', amp }(EnergyPatternScale で拡縮)
     * kind: 'curve'(広いルートでまとめて取りやすい)/ 'straight'(狭いラインを正確に通すと大量)
     * パターンの追加 = ここに1件足すだけ
     */
    energyPatterns: [
      { id: 'ARC_LEFT', label: 'ARC LEFT', kind: 'curve', items: [
        { route: { target: 'chest', power: 0.88, spin: -0.55 }, count: 4, span: [0.15, 0.9] },
        { route: { target: 'chest', power: 0.88, spin: -0.8 }, count: 4, span: [0.2, 0.9] },
        { route: { target: 'chest', power: 0.88, spin: -1.0 }, count: 4, span: [0.25, 0.9] },
      ] },
      { id: 'ARC_RIGHT', label: 'ARC RIGHT', kind: 'curve', items: [
        { route: { target: 'stomach', power: 0.88, spin: 0.55 }, count: 4, span: [0.15, 0.9] },
        { route: { target: 'stomach', power: 0.88, spin: 0.8 }, count: 4, span: [0.2, 0.9] },
        { route: { target: 'stomach', power: 0.88, spin: 1.0 }, count: 4, span: [0.25, 0.9] },
      ] },
      { id: 'S_CURVE', label: 'S CURVE', kind: 'curve', items: [
        { route: { target: 'chest', power: 0.8, spin: 1.0 }, count: 9, span: [0.1, 0.92] },
        { route: { target: 'stomach', power: 0.8, spin: -1.0 }, count: 5, span: [0.1, 0.9] },
      ] },
      { id: 'ZIGZAG', label: 'ZIGZAG', kind: 'curve', items: [
        { route: 'curveLtoR', count: 6, span: [0.12, 0.88] },
        { route: 'curveRtoL', count: 6, span: [0.12, 0.88] },
        { route: { target: 'chest', power: 0.8, spin: 0 }, count: 3, span: [0.3, 0.8], offset: { type: 'zigzag', amp: 0.7 } },
      ] },
      { id: 'SPIRAL', label: 'SPIRAL', kind: 'straight', items: [
        { route: { target: 'chest', power: 0.82, spin: 0 }, count: 12, span: [0.08, 0.95], offset: { type: 'spiral', radius: 0.5, turns: 2 } },
        { route: { target: 'head', power: 0.6, spin: 0 }, count: 3, span: [0.4, 0.85] },
      ] },
      { id: 'STRAIGHT_BONUS', label: 'STRAIGHT BONUS', kind: 'straight', items: [
        { route: { target: 'chest', power: 0.95, spin: 0 }, count: 12, span: [0.06, 0.95] },
        { route: { target: 'stomach', power: 1.0, spin: 0 }, count: 3, span: [0.5, 0.9] },
      ] },
      { id: 'STRAIGHT_LANES', label: 'TWIN LANES', kind: 'straight', items: [
        { route: 'left', count: 7, span: [0.1, 0.92] },
        { route: 'right', count: 7, span: [0.1, 0.92] },
      ] },
    ],
  },

  special: {
    label: 'SPECIAL HEART',
    // SPECIAL 使用時のキャラクターカットイン(演出は実時間 = Unscaled で動く)
    cutIn: {
      enabled: true,
      delay: 0.2,          // ★ 離してからカットインが出るまでの待ち(実秒)。ハートはカットインが終わってから飛ぶ
      duration: 0.62,      // ★ カットイン全体の実時間(秒)。0.5〜0.8 推奨
      timeScale: 0.15,     // ★ カットイン中のゲーム時間倍率(完全停止ではなくスロー)
      dim: 0.55,           // ★ 背景を暗くする量
      flashAt: 0.72,       // 白フラッシュのタイミング(duration 比)
    },
    trailHearts: 0.05,     // ★ 飛行中に小さなハートを撒く間隔(秒)
    heartMul: 3,           // ★ SPECIAL のダメージ倍率の既定値(CharacterData.special.damageMul が無い時だけ。SSR 以外の共通 SPECIAL は damageMul 2)
    ballScale: 1.9,        // 見た目のボールサイズ
    hitstop: 0.32,
  },

  // ---- ボス返球 ----
  // 返球プロファイル:攻撃モーション無しでもボスごとの個性を出すためのデータ
  // ---- 敵の攻撃(返球の球種)。難易度差は「全体を速くする」のではなく、攻撃の種類・組み合わせ・変化量で作る ----
  //   各攻撃:type / curve / speed / speedChange / changeTiming / feint / tell / weight{ NORMAL, HARD, HELL }(src/return/AttackMotion.js)
  //   敵ごとの個性は bossProfiles[].attackStyle(倍率)/ attacks(その敵だけの攻撃)。★ 数値はすべて仮(バランス調整用)
  // ---- DEFENCE(ボスの攻撃を捌く)----
  //   攻撃タイプは4つだけ:NORMAL(タップ)/ HOLD(到達で長押し → 終わりで離す)/ FLICK(到達で指定方向へ弾く)/ MULTI(複数のハートを続けて)
  //   ★ = 「この戦闘でボスが何回攻撃したか」(1回目 ★1 … 5回目以降 ★5)。NORMAL / HARD / HELL とは別(どの難易度でも ★1 から上がる)
  //   判定:PERFECT は全難易度共通で約 1F(Config.catch)・PERFECT はダメージ 0(既存のまま)。タイミングは見た目だけで判断(カウント音なし)
  //   ボスごとに bossProfiles[id].defence.levels[★] で上書きできる(システム本体は書き換え不要)
  /**
   * ボス撃破時の余韻(GAME_CLEAR → リザルト)。秒はすべて撃破の瞬間から。合計 8〜12 秒
   *   セリフ・リアクションは BossAffection の defeat(ボスごと。HELL は defeat.hell)
   */
  clear: {
    hitstopSec: 0.22,     // 撃破の瞬間の止め
    uiFadeAt: 0.35,       // バトル UI を消し始める
    bgmFadeSec: 1.6,      // BGM のフェードアウト
    reactionAt: 0.6,      // 撃破リアクション(表情 + 短い声)
    reactionSec: 1.1,     // リアクションの声の表示時間(この後 lineAt まで何も表示しない)
    lineAt: 3.4,          // 何も表示しない間(1〜2 秒)のあと、撃破セリフ
    finalAt: 6.2,         // 最終表情(デレ)
    completeAt: 7.2,      // 「HEART BREAK / 攻略完了」+ クリア SE
    asmrAt: 8.9,          // HELL:ASMR UNLOCKED
    resultAt: 9.8,        // リザルトへ(HELL は hellResultAt)
    hellResultAt: 11.6,
    skipAfter: 1.2,       // タップで早送りできるまで
  },

  defence: {
    maxLevel: 5,
    levelBannerSec: 1.1,       // 攻撃開始時の「ATTACK LEVEL ★★★☆☆」の表示時間
    curveChance: 0.3,          // ★2 以降、ハートの軌道が左右に曲がる割合(見た目の変化だけ。タイミングは変わらない)
    hold: { sec: 0.8, releaseWindowMul: 2, scale: 1.6, pressScale: 0.86, color: '#ffd23e' },   // ★ HOLD:長押しの長さ(秒)・離す判定の幅(押し始めの何倍)・見た目
    // ★ FLICK = スライド:開始地点で押す → 指を離さず軌道に沿って終点まで運ぶ → 離す(osu! のスライダー)
    //   pathLen … 軌道の長さ(画面の短辺比)/ slideSec … 理想の運ぶ時間(ガイドがこの時間で終点へ)/ tol … 軌道から離れてよい距離(短辺比)
    //   endRadius … 終点に着いたとみなす距離 / endWindowMul … 終点で離すタイミングの判定幅(開始の判定の何倍)
    flick: { pathLen: 0.5, pathMargin: 0.1, pathTop: 0.22, slideSec: 0.7, tol: 0.13, endRadius: 0.075, endWindowMul: 3, color: '#5ad8ff' },
    multi: { damageMul: 1.5, gap: 0.1 },
    partySize: 4,           // ★ パーティ DEF(4人の DEF の合計)をこの人数で割って DEF のカーブに当てる(合計 200 = 等倍 / 400 = ×0.75)
    damageSpread: 0.1,      // ★ 被ダメージのゆらぎ:キャラごとに別々に ×(1 ± 0.1)  // ★ MULTI:1回の攻撃全体のダメージ倍率(各ハートに 1/個数 ずつ)・次のハートまでの間(秒)
    /**
     * ★ごとの攻撃の候補(weight で抽選)。notes:'NORMAL' | 'HOLD' | 'FLICK' か { type, hold(秒), dir('L'|'R'|'U'|'D'|'random') }
     *   interval … MULTI の2個目以降のハートが飛んでくる時間(秒)。短いほど忙しい
     */
    levels: {
      1: [{ id: 'N', weight: 1, notes: ['NORMAL'] }],
      2: [{ id: 'N', weight: 2, notes: ['NORMAL'] }, { id: 'H', weight: 1, notes: ['HOLD'] }],
      3: [{ id: 'N', weight: 2, notes: ['NORMAL'] }, { id: 'H', weight: 1, notes: ['HOLD'] }, { id: 'F', weight: 1.6, notes: ['FLICK'] }],
      4: [
        { id: 'NNN', weight: 2, notes: ['NORMAL', 'NORMAL', 'NORMAL'], interval: 0.85 },
        { id: 'NHN', weight: 1.5, notes: ['NORMAL', 'HOLD', 'NORMAL'], interval: 0.85 },
        { id: 'NFN', weight: 1.5, notes: ['NORMAL', 'FLICK', 'NORMAL'], interval: 0.85 },
        { id: 'F', weight: 0.8, notes: ['FLICK'] },
      ],
      5: [
        { id: 'NFFN', weight: 1.5, notes: ['NORMAL', 'FLICK', 'FLICK', 'NORMAL'], interval: 0.72 },
        { id: 'HNF', weight: 1.2, notes: ['HOLD', 'NORMAL', 'FLICK'], interval: 0.72 },
        { id: 'NNFHN', weight: 1, notes: ['NORMAL', 'NORMAL', 'FLICK', 'HOLD', 'NORMAL'], interval: 0.68 },
        { id: 'FNFN', weight: 1.2, notes: ['FLICK', 'NORMAL', 'FLICK', 'NORMAL'], interval: 0.66 },
      ],
    },
  },
  enemyAttacks: {
    samples: 120,           // 動きの計算の細かさ
    // 途中の変化の演出(色・粒・表示・音)。加速 / 減速 / 曲がり始め / フェイントで止まる・再び来る
    fx: {
      speedUp:   { color: '#ffd23e', count: 16, speed: 7, life: 0.4, boost: 0.8, sound: 'incoming' },
      speedDown: { color: '#7cc8ff', count: 12, speed: 4, life: 0.5, boost: 0.4 },
      lateCurve: { color: '#3ee8ff', count: 14, speed: 6, life: 0.35, boost: 0.5 },
      feintStop: { color: '#b07cff', count: 18, speed: 5, life: 0.5, boost: 1, label: '!?' },
      feintGo:   { color: '#ff5fa2', count: 18, speed: 8, life: 0.4, boost: 1, shockwave: 2, sound: 'bossSwing' },
    },
    speedBlend: 0.1,        // 速度変化のなめらかさ(進み具合の幅)。瞬間的に速さが変わらない(瞬間移動に見えない)
    screenMargin: 0.1,      // 返球の軌道は画面の端からこの割合より内側(はみ出す曲がり方は逆側へ / 小さく)。ボスへ寄ったカメラが戻る途中の分も見込む
    patterns: {
      // NORMAL「敵の攻撃を覚える」:STRAIGHT 中心・CURVE 少なめ・弱い SPEED CHANGE
      STRAIGHT:          { type: 'STRAIGHT', label: 'STRAIGHT', curve: 0, speed: 1, weight: { NORMAL: 72, HARD: 24, HELL: 8 } },
      CURVE:             { type: 'CURVE', label: 'CURVE', curve: 2.4, speed: 1, weight: { NORMAL: 18, HARD: 22, HELL: 12 } },
      SPEED_SOFT:        { type: 'SPEED_CHANGE', label: 'SPEED UP', speedChange: 1.35, changeTiming: 0.5, weight: { NORMAL: 10 } },
      // HARD「軌道を見て判断する」:CURVE / SPEED CHANGE / LATE CURVE を混ぜる
      SPEED_UP:          { type: 'SPEED_CHANGE', label: 'SPEED UP', speedChange: 1.9, changeTiming: 0.45, weight: { HARD: 14, HELL: 9 } },
      SPEED_DOWN:        { type: 'SPEED_CHANGE', label: 'SLOW DOWN', speedChange: 0.6, changeTiming: 0.5, weight: { HARD: 10, HELL: 8 } },
      LATE_CURVE:        { type: 'LATE_CURVE', label: 'LATE CURVE', curve: 2.2, changeTiming: 0.6, weight: { HARD: 18, HELL: 9 } },
      // HELL「敵の攻撃を見切る」:FEINT・強い LATE CURVE・SPEED CHANGE との組み合わせ
      LATE_CURVE_STRONG: { type: 'LATE_CURVE', label: 'LATE CURVE+', curve: 3.4, changeTiming: 0.68, weight: { HELL: 12 } },
      LATE_CURVE_SPEED:  { type: 'LATE_CURVE', label: 'LATE CURVE × SPEED', curve: 2.8, changeTiming: 0.62, speedChange: 1.6, weight: { HELL: 12 } },
      FEINT:             { type: 'FEINT', label: 'FEINT', feint: { at: 0.3, pause: 0.38, shake: 0.12 }, tell: { color: '#b07cff', label: '!?', chargeKicks: 2 }, weight: { HELL: 15 } },
      FEINT_CURVE:       { type: 'FEINT', label: 'FEINT CURVE', curve: 2.0, feint: { at: 0.28, pause: 0.32, shake: 0.12 }, tell: { color: '#b07cff', label: '!?', chargeKicks: 2 }, weight: { HELL: 10 } },
    },
  },
  bossProfiles: {
    lulu: {
      returnSpeed: 1.0,     // ★ 返球速度倍率
      returnPower: 20,      // ★ MISS時にプレイヤーが受けるダメージ(100%)
      returnAccuracy: 1.0,  // 1=マーカー通りに着弾 / 小さいほど着弾がマーカーからズレる
      catchAreaSize: 1.0,   // ★ CatchableArea の広さ倍率
      randomness: 1.0,      // 1=完全ランダム / 0=3x3グリッドを順に巡回
      // 攻撃の個性:Config.enemyAttacks の出やすさに掛ける倍率({ 攻撃 ID または type: 倍率 })。attacks で敵だけの攻撃を足せる
      attackStyle: {},
      // 投球ごとに出す Energy ルートの組み合わせ(順番に巡回)。ボスごとに変更できる
      energyArrangements: [
        ['center', 'curveRtoL', 'high'],
        ['center', 'curveLtoR', 'low'],
        ['left', 'right', 'high'],
        ['center', 'lowCurve', 'curveLtoR'],
        ['right', 'curveRtoL', 'low'],
      ],
    },
    // STAGE 01 リリス(FIRE / CURVE):標準。たまにカーブ返球
    lilith: {
      returnSpeed: 1.0, returnPower: 20, returnAccuracy: 1.0, catchAreaSize: 1.0, randomness: 1.0,
      attackStyle: { CURVE: 1.3, LATE_CURVE: 1.2 },   // ★ 仮:カーブ寄り(以前のカーブ返球 15% の名残)
      energyArrangements: [
        ['center', 'curveRtoL', 'high'],
        ['center', 'curveLtoR', 'low'],
        ['left', 'right', 'high'],
        ['center', 'lowCurve', 'curveLtoR'],
        ['right', 'curveRtoL', 'low'],
      ],
    },
    // STAGE 02 セイレーン(WATER / STRAIGHT):返球が少し速い・まっすぐ
    siren: {
      returnSpeed: 1.15, returnPower: 22, returnAccuracy: 1.0, catchAreaSize: 1.05, randomness: 1.0,
      attackStyle: { STRAIGHT: 1.3, SPEED_CHANGE: 1.3, CURVE: 0.6 },   // ★ 仮:まっすぐ + 速度変化寄り
      energyArrangements: [
        ['center', 'high', 'low'],
        ['left', 'curveLtoR', 'center'],
        ['right', 'curveRtoL', 'high'],
        ['center', 'lowCurve', 'left'],
        ['right', 'low', 'curveLtoR'],
      ],
    },
  },
  returnBall: {
    baseDuration: 1.45,    // ★ ReturnSpeed:ボス→キャッチ地点の基準秒(小さいほど速い)。距離とは独立に調整できる(旧 1.35)
    chargeTime: 0.4,       // 発射前の溜め(マーカーは溜め開始から表示)
    markerLead: 1.0,       // 外側リングが縮み始めてから到達までの秒
    catchArea: { xMin: 0.15, xMax: 0.85, yMin: 0.2, yMax: 0.8 }, // ★ CatchableArea(画面比)
    avoidRepeat: true,     // ★ 直前の返球地点付近を避ける
    minRepeatDistance: 0.22, // ★ 画面短辺比
    lateDepthScale: 0.6,   // 遅れ判定中に更に迫る終点(キャッチ距離×この値)
  },
  // RALLY による返球の高速化(キャッチ難易度)
  returnTiers: [
    { min: 20, speed: 1.5 },
    { min: 10, speed: 1.3 },
    { min: 5,  speed: 1.15 },
    { min: 0,  speed: 1.0 },
  ],

  // ---- キャッチ判定(位置+タイミング) ----
  catch: {
    // タイミングは実時間(ms)で判定(60Hz / 120Hz 端末で幅が変わらない)。全難易度共通。値は ±片側(秒)
    perfectTime: 0.00835,  // ★ PERFECT:合計 約1F(16.7ms = ±8.3ms)
    greatTime: 0.0333,     // ★ GREAT:合計 約4F(66.7ms = ±33.3ms)
    goodTime: 0.1,         // ★ GOOD:合計 約12F(200ms = ±100ms)。それ以外は MISS
    perfectRadius: 0.07,   // ★ PerfectPositionRadius(画面短辺比)
    greatRadius: 0.12,     // ★ GreatPositionRadius
    goodRadius: 0.19,      // ★ GoodPositionRadius
  },
  judgeDamageRate: { PERFECT: 0, GREAT: 0.25, GOOD: 0.5, MISS: 1.0 },

  // ---- AUTO(インゲーム右上の AUTO ボタン。ON の間は投球・DEFENCE を自動で行う。プレイヤーは SPECIAL(アイコンのタップ)だけ操作できる)----
  //   値は出やすさの重み(合計 100 でなくてもよい)。チュートリアルでは使えない
  auto: {
    defence: { PERFECT: 1, GREAT: 20, GOOD: 50, HIT: 28, MISS: 1 },   // ★ DEFENCE の判定。DEFENCE に HIT の段階は無いので HIT は defenceAs の判定になる
    defenceAs: { HIT: 'GOOD' },
    landing: { PERFECT: 1, GREAT: 20, GOOD: 50, HIT: 28, MISS: 1 },   // ★ 投球の着弾(敵の中央縦ラインからの距離)。ハートゲート・Diamond は狙わない
    throwDelay: 0.8,   // ★ 手番が来てから投げるまで(秒)
  },

  // ---- UI ----
  ui: {
    tutorialThrows: 2,     // 最初のこの回数だけ FLICK / CATCH の説明を出す
  },

  // ---- デバッグ ----
  debug: {
    showDebugUI: false,    // ★ 右上のデバッグボタン・投球数値・部位一覧(D キーで切替)
    showTrajectoryPreview: false, // 予測軌道(Debug UI から ON)
    showLastTrajectory: true,  // 直前の投球軌道を残す(練習用)
    showThrowInfo: true,       // 直前フリックの数値表示
    showColliders: false,
    // DevInput:PC のマウス / キーボード操作(Enter・Space・矢印・Esc・デバッグキー)は開発 / デバッグ専用のレイヤー。
    // 製品仕様はスマートフォンのタッチのみ。?dev=0 で無効化(製品相当の確認用)
    enableDevInput: params.get('dev') !== '0',
    log: params.get('log') === '1',  // [INIT] [SAVE] [HOME] [GACHA] … のコンソールログ(製品画面には出さない)
  },

  // ラリー段階(ハート玉の光り方の演出だけ。HEART の倍率には使わない:連続 HIT は COMBO → FEVER ゲージの役割)
  //   mul は旧仕様の値(参照なし)。ラリー数そのものはボスの返球の強さ(returnTiers)に使う
  rallyTiers: [
    { min: 20, mul: 2.0, color: '#ff4dff', label: 'FEVER' },
    { min: 10, mul: 1.5, color: '#ff8a3d', label: 'HOT' },
    { min: 5,  mul: 1.2, color: '#3ee8ff', label: 'UP' },
    { min: 0,  mul: 1.0, color: '#ffffff', label: '' },
  ],
};

export function rallyTier(rally) {
  return Config.rallyTiers.find((t) => rally >= t.min);
}
export function returnTier(rally) {
  return Config.returnTiers.find((t) => rally >= t.min);
}
export function bossProfile() {
  return Config.bossProfiles[Config.boss.profile];
}

/** キャッチ判定の値(難易度の catchWindow を掛けた実効値)*/
export function catchWin(key) { return Config.catch[key]; }   // 全難易度共通(難易度で判定幅を変えない)
/** 難易度データ */
export function difficultyData(id) { return Config.difficulties[id] ?? Config.difficulties.NORMAL; }

// アプリ全体(HOME / Navigation / Ownership / Gacha / Rewards)の設定は AppConfig.js
Object.assign(Config, APP_CONFIG);
