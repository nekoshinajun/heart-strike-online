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
    // ATTACK / DEFENCE の効き(ステータス 0〜100 → 倍率)は GrowthData.STAT_EFFECTS
    attributeMul: { advantage: 1.3, neutral: 1.0, disadvantage: 0.7 },
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
    //            heartGain: 命中時に届く基本 HEART / maxHeart: 部位ごとの PartHeart 満タン値(★)
    head:     { label: 'HEAD',    ja: '頭部', heartGain: 150, maxHeart: 100 },
    chest:    { label: 'CHEST',   ja: '胸部', heartGain: 110, maxHeart: 200 },
    stomach:  { label: 'STOMACH', ja: '腹部', heartGain: 100, maxHeart: 200 },
    rightArm: { label: 'R-ARM',   ja: '右腕', heartGain: 75, maxHeart: 150 },
    leftArm:  { label: 'L-ARM',   ja: '左腕', heartGain: 75, maxHeart: 150 },
    rightLeg: { label: 'R-LEG',   ja: '右脚', heartGain: 60, maxHeart: 150 },
    leftLeg:  { label: 'L-LEG',   ja: '左脚', heartGain: 60, maxHeart: 150 },
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
    image: { height: 19, y: 0 },
  },
  partHeart: {
    partGainRate: 0.15,    // ★ PartHeart への加算 = 届いた HEART × この値(ATK倍率込みの HEART に掛かる)
    warmAt: 0.5,           // ★ PartHeart がこの割合以上で WARM(リアクション段階)
    loveSpotMul: 1.3,      // ★ HEART_MAX になった部位(LOVE SPOT)へ届けた時の HEART 倍率
  },


  camera: {
    fov: 70,
    // 構図:足元から見上げるのではなく、目の前の女の子と向き合う目線(顔・上半身を近く大きく)
    //   旧 pos(0, 1.6, 8.5)→ lookAt y 10.65(下から見上げる)。カメラを高く・ボスへ近づけ、注視点を顔の高さ寄りへ
    //   FOV は同じなので、ハート玉の画面上の位置・大きさ(構え位置はカメラ基準)は変わらない
    pos: { x: 0, y: 9, z: 4.5 },
    lookAt: { x: 0, y: 15, z: -14.45 },
  },

  ball: {
    skin: 'heart',        // 'heart'(ハート玉)| 'sphere'(旧ボール)
    radius: 0.3,
    holdOffset: { x: 0, y: -1.3, z: -3.2 },  // z = 構え位置の奥行き(カメラからの距離)。y は旧仕様(未使用)
    // ★ HeartBallIdlePositionY:投球前のハート玉の画面上の高さ(画面高さ比。0=上端 / 1=下端)
    //   端末ごとの px 固定ではなく割合で指定。下に POWER CHARGE 用の空間を空けるため旧 0.78 → 0.60
    idlePositionY: 0.63,
    // ★ ハート玉より下に必ず残す操作空間(画面高さ比。Safe Area の下端から測る)。縦に短い画面でも下がりすぎない
    idleMinChargeSpace: 0.27,
    catchDepth: 2.1,                          // キャッチ地点のカメラからの距離
    // ハートの見た目の回転(rad/秒)。投球前(構え / 引っ張り中)は全キャラ共通の一定速度。キャラ性能は投球後の軌道にだけ出す
    idleSpin: { held: 1.2, grabbed: 3, flying: 3 },
  },

  // ---- 投球(指でボールを投げる) ----
  // 速度は「画面高さ/秒」で正規化するので端末サイズに依存しない。
  throw: {
    grabRadiusScale: 1.9,  // ボール見かけ半径×この値 以内のタッチで掴める
    grabRadiusMin: 46,     // px
    followLerp: 22,        // 指への追従の速さ
    followMaxUp: 0.2,      // 掴んだボールが持ち上がれる上限(画面高さ比)
    sampleWindowMs: 80,    // 離す直前この時間の移動から速度を算出
    flickMaxMs: 380,       // フリック区間として遡る最大時間(それ以前の位置調整は無視)
    minUpSpeed: 0.55,      // 画面高さ/秒。これ未満の上方向速度は投球キャンセル
    baseSpeed: 5.7,        // 初速 = baseSpeed + speedGain(★ThrowPower) × 上方向速度
    speedGain: 4.2,
    maxSpeed: 40,
    shortFlick: 0.12,      // 距離(画面高さ比)がこれ未満だと初速を減衰
    shortFlickMin: 0.6,
    upRatio: 1.6,          // 前方速度に対する上向き成分
    lateralGain: 0.45,     // ★ フリック角度 → 横方向速度
    maxLateral: 1.1,
    gravity: 14,           // ★
    strongSpeed: 21,       // これ以上は「強投」演出
    fixedStep: 1 / 240,    // 物理の固定ステップ(同じフリック=同じ軌道)
    maxFlightTime: 3.5,
    floorBounce: 0.42,
  },

  // ---- 投球 = POWER / AIM / SPIN の3要素 ----
  // POWER:ボールを下へ引いた距離 → 初速の大きさ(高さは決めない)
  // AIM  :引いた後の上方向ジェスチャー(向き=左右、長さ=高さ)→ 狙う地点。初速はその地点を通る放物線を解いて決める
  // SPIN :ジェスチャー中の曲がり・切り返し(curve)
  power: {
    chargeThreshold: 18,   // ★ PowerChargeThreshold(px):これ以上下へ動いたら POWER_CHARGE
    // ★ MaxChargeDistance:ここまで下へ引くと Charge 100%。画面高さ比で指定(端末解像度に依存しない)
    //   v16:旧 150px(= 高さ880pxの画面で 0.17)→ 約1.5倍の 0.256
    maxChargeDistanceRatio: 0.384,
    maxChargeDistance: 225,// ratio を null にした時だけ使う固定 px
    lockThreshold: 10,     // 最下点からこれ以上上へ動いたら Power を固定して THROW_GESTURE へ
    // ★ MinThrowPower:引かずに投げた時の Power。finalPower = Lerp(MinThrowPower, 1, chargeRatio)
    minThrowPower: 0.10,
    // 初速 = minSpeed + (maxSpeed - minSpeed) × finalPower
    //   v25: Power 10% から開始。100% は従来の最強と同じ
    minSpeed: 21.6,        // ★ Power 0% の初速(実際の最低は MinThrowPower の値)(旧 28)
    maxSpeed: 53,          // ★ Power 100% の初速
    // HEART(ダメージ)は球速・引っ張り量で変えない(速い球 = 強い球ではない)。全投球に同じ倍率を掛ける
    //   旧仕様の POWER 倍率(0.8〜1.5)の中間あたりにして、ステージの HEART 量とのバランスを大きく崩さない(★ 仮)
    //   旧 ATK 倍率(ATK÷50:平均 ×2.0 前後)を新しい ATTACK 倍率(50 = ×1.0)へ置き換えた分もここで引き継ぐ(1.15 × 2.0)
    heartFlat: 2.3,
    maxPullDown: 0.14,     // 引いた時にボールが下がれる量(画面高さ比・見た目)(旧 0.1)
  },
  aim: {
    base: 0.08,            // ★ 狙いの届く距離 = 画面高さ × (base + gain × ジェスチャー長/画面高さ)
    gain: 1.6,             // ★ 長く弾くほど上(頭)を狙う
    minGesture: 0.04,      // これ未満のジェスチャー(画面高さ比)は投球にしない
    // 狙いの起点(画面高さ比)。ハート玉の待機位置を上げても同じジェスチャー = 同じ狙いになるよう旧位置に固定。null ならハート玉の位置
    originY: 0.784,
  },

  // ---- カーブ(指の軌跡の曲がり → Spin → 飛行中の横力) ----
  curve: {
    enableCurveBall: true, // ★
    spinGain: 2.4,         // 軌跡の横の膨らみ(弦長比) → spin の大きさ
    turnGain: 1.2,         // 切り返し角(π=1) → spin の大きさ
    minTurnDeg: 12,        // 切り返しがこれ未満ならストレート(向きが決まらない)
    deadZone: 0.08,        // これ未満の spin はストレート扱い
    maxSpin: 1.0,
    shift: 2.9,            // ★ CurveStrength:spin=1 のとき、狙い点から曲がる向きへずれる量(units)。ボス拡大に合わせ ×1.2(旧 2.4)
    bulge: 1.2,            // ★ spin=1 のとき、逆側へ膨らむ量(units)(旧 1.0)
    rampTime: 0.001,       // 横力の立ち上がり(0に近いほど解析どおりの軌道)
  },

  // ---- 投球ルート(★ 今はプレイヤーの操作に出さない:基本操作は「狙う・引く・投げる」だけ)----
  //   球速と直進性は下へ引く量だけで連続的に変わる(浅い = 曲がりやすい CURVE 寄り / 深い = まっすぐ DIRECT 寄り)
  //   DIRECT / CURVE のデータは将来の拡張用に残す(選択 UI は無い)
  throwRoute: {
    default: 'STANDARD',
    routes: {
      STANDARD: { label: 'STANDARD', curveMul: 1, preSpinMul: 1, driveMul: 1 },
      DIRECT: { label: 'DIRECT', curveMul: 0.85, preSpinMul: 0.8, driveMul: 0.85 },
      CURVE: { label: 'CURVE', curveMul: 1.2, preSpinMul: 1.3, driveMul: 1.2 },
    },
  },
  // ---- 下へ引く量(chargeRatio 0〜1)= 球速と直進性。ダメージには使わない ----
  //   浅く引く → 遅い・曲がりやすい・PRE-SPIN / DRIVE が強く出る / 深く引く → 速い・まっすぐ・球質の効きが少し弱い(0 にはしない)
  pull: {
    curveAtMin: 1.25, curveAtMax: 0.55,       // ★ カーブの効き(Curve Resistance)
    preSpinAtMin: 1.3, preSpinAtMax: 0.55,    // ★ PRE-SPIN の効き
    driveAtMin: 1.2, driveAtMax: 0.8,         // ★ DRIVE の効き
  },

  // ---- バトル開始演出(OPENING):インゲームに入り バトル BGM が流れる中でボス紹介 → BATTLE START → A の投球 ----
  //   各時刻は OPENING に入ってからの秒。MULTI はサーバーが全員に同じ長さ(totalSec)を配る
  opening: {
    dimAt: 0.0,          // 画面を少し暗くする
    bossAt: 0.2,         // ボスを強調(カメラを寄せる)
    nameAt: 0.4,         // TARGET / 名前
    diffAt: 0.6,         // 難易度
    textAt: 0.8,         // 紹介文 / セリフ(データがある時だけ)
    fadeAt: 2.8,         // 紹介 UI のフェードアウト開始
    fadeSec: 0.35,
    startSec: 0.8,       // 「BATTLE START」を見せてから A の投球へ
    dim: 0.45,           // 暗さ(0〜1)
    bossZoom: 4,         // ボスへ寄せる量
  },

  // ---- 投球前の球質(ハートを掴んだまま仕込む)。判定と効果の数値はここだけ ----
  //   PRE-SPIN:指で円を描く(時計回り = RIGHT / 反時計回り = LEFT)→ 投球時の SPIN に掛かる
  //   DRIVE   :上下へ素早く往復 → 終盤で下へ沈む
  //   ★ 今はプレイヤーの操作に出さない(enabled: false)。基本操作は「狙う・引く・投げる」だけ。仕組みは将来の球種用に残す
  //   どちらも「下へ引いて POWER → 上へ弾く」通常操作とは区別する(誤認識しない条件)
  preSpin: {
    enabled: false,
    sampleStepPx: 6,        // 指の軌跡をこの間隔で間引いて向きの変化を測る
    minTurnDeg: 300,        // ★ 成立に必要な回転量(指の進む向きが同じ向きに回った合計)
    fullTurnDeg: 360,       // この回転量で strength = 1
    maxStepTurnDeg: 75,     // 1区間でこれ以上向きが変わったら「折り返し」(引いて弾く等)→ 回転の計測をやり直す
    consistency: 0.85,      // 回転の向きの一貫性(同じ向きの回転量 / 全回転量)
    minPathRatio: 0.12,     // 最低移動量(画面の高さ比)。小さな指のブレは回転とみなさない
    minDurationMs: 160,     // 入力時間の下限(一瞬のブレを除く)
    maxDurationMs: 1600,    // この時間内に回し切る(ゆっくりした位置調整は除く)
    sameDirMul: 1.5,        // ★ 同じ向きのカーブ:SPIN × 1.5(strength 1 の時)
    oppositeDirMul: 0.7,    // ★ 逆向きのカーブ:SPIN × 0.7(曲がる向きは投球の SPIN のまま)
    baseSpin: 0.2,          // ★ ストレートに投げた時の回転の名残(SPIN 0 → 仕込んだ向きへ弱く曲がる。0 で無効)
  },
  drive: {
    enabled: false,
    minStrokes: 4,          // ★ 上下の往復回数(下→上→下→上 = 4ストローク)。「下へ引いて弾く」は2ストロークなので成立しない
    minAmplitudeRatio: 0.022, // 1ストロークの最低移動量(画面の高さ比)
    fullAmplitudeRatio: 0.06, // この振れ幅で strength = 1
    maxDurationMs: 900,     // ★ この時間内に往復し切る(短時間の往復だけを DRIVE とする)
    maxHorizontalRatio: 0.7, // 1ストロークの横移動 / 縦移動 の上限(縦の往復だけ)
    minStrength: 0.5,
    sink: 4.0,              // ★ strength 1 でボスの位置までに下へ沈む量(units。頭 → 胸 くらい)
    startFrac: 0.45,        // 飛行のこの割合までは通常の軌道(そこから沈み始め、終盤ほど強く)
  },
  // 命中した位置のマーク(実際に Collider に当たった座標)
  hitMark: { life: 1.0, popScale: 1.25, popSec: 0.12, fadeFrom: 0.75, size: 1.1, color: '#ff7ab8', max: 6 },

  // ---- エネルギー / 必殺技 ----
  energy: {
    label: 'HEART ENERGY', // 表示名(世界観に合わせて変更可)
    // 1投の途中で取った Energy 数 → 命中時の HEART 倍率(★)
    throwBonus: [1.0, 1.1, 1.25, 1.5, 2.0],
    max: 100,              // ★
    orbValue: 10,          // ★ Orb 1個
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
      bonus: 1.2,                // ★ BANK SHOT(障害物に当たってからボスに命中)の HEART 倍率
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
     *   guide … { target: 部位, tx, ty(狙い点のずらし・world), power, spin }。現在キャラのタイプ補正込みで物理シミュレーションする
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
    talkBgmLevel: 0.3,       // ★ HEART 50% 会話中の BGM(通常 = 1。25〜40% 推奨)
    dokunVolume: 0.9,    // ★ 心音「ドクン……」の音量
  },
  // ---- HEART 50% 会話の演出(暗転・ボス強調・間)----
  talk: {
    hitSlow: 0.3,            // ★ 50% を超えた命中の瞬間のゲーム速度
    heart50TriggerDelay: 0.25, // ★ Heart50TriggerDelay:HEART が 50% を超えた命中から暗転開始まで(実時間・秒。0.2〜0.5)
    fadeIn: 0.35,            // ★ 周りが暗くなる時間(実時間・秒)
    fadeOut: 0.45,           // ★ 明るく戻る時間(0.3〜0.5)
    dim: 0.62,               // ★ ボス以外の暗さ(0〜1)
    glow: 0.35,              // ★ ボスの後ろの淡い光
    pause: 0.35,             // ★ 暗くなってから「ドクン……」までの静かな間(秒)
    beatToTalk: 0.55,        // 「ドクン……」からセリフまで(秒)
    dokunOnLines: true,  // 重要なセリフ(「次の1投で答えて！」)でも控えめに心音
  },

  // ---- FEVER TIME(ラリーを続けたご褒美:現在キャラから4人が1投ずつ強力に投げるボーナスラウンド)----
  fever: {
    gain: { PERFECT: 15, GREAT: 12, GOOD: 8, MISS: 0 },   // ★ FeverGaugeGain(キャッチ成功ごと。%)
    heartMul: [2.0, 2.5, 3.0],   // ★ FeverHeartMultiplier Lv.1 / Lv.2 / Lv.MAX(既存の全倍率の最後に掛ける)
    levelLabels: ['Lv.1', 'Lv.2', 'Lv.MAX'],
    missLevelDown: false,        // MISS で FEVER LEVEL を1段階下げるか(初期実装:維持)
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
      duration: 0.62,      // ★ カットイン全体の実時間(秒)。0.5〜0.8 推奨
      timeScale: 0.15,     // ★ カットイン中のゲーム時間倍率(完全停止ではなくスロー)
      dim: 0.55,           // ★ 背景を暗くする量
      flashAt: 0.72,       // 白フラッシュのタイミング(duration 比)
    },
    trailHearts: 0.05,     // ★ 飛行中に小さなハートを撒く間隔(秒)
    heartMul: 3,           // ★ SPECIAL HEART:次の1投で届く HEART の倍率
    ballScale: 1.9,        // 見た目のボールサイズ
    hitstop: 0.32,
  },

  // ---- ボス返球 ----
  // 返球プロファイル:攻撃モーション無しでもボスごとの個性を出すためのデータ
  // ---- 敵の攻撃(返球の球種)。難易度差は「全体を速くする」のではなく、攻撃の種類・組み合わせ・変化量で作る ----
  //   各攻撃:type / curve / speed / speedChange / changeTiming / feint / tell / weight{ NORMAL, HARD, HELL }(src/return/AttackMotion.js)
  //   敵ごとの個性は bossProfiles[].attackStyle(倍率)/ attacks(その敵だけの攻撃)。★ 数値はすべて仮(バランス調整用)
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
    goodTime: 0.0667,      // ★ GOOD:合計 約8F(133.3ms = ±66.7ms)。それ以外は MISS
    perfectRadius: 0.07,   // ★ PerfectPositionRadius(画面短辺比)
    greatRadius: 0.12,     // ★ GreatPositionRadius
    goodRadius: 0.19,      // ★ GoodPositionRadius
  },
  judgeDamageRate: { PERFECT: 0, GREAT: 0.25, GOOD: 0.5, MISS: 1.0 },

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

  // ラリー倍率テーブル(届く HEART の倍率・ハート玉の演出)
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
