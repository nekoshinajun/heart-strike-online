// HEART STRIKE:ゲームの「外側」(HOME / Navigation / 所持 / ガチャ / 報酬)の設定。
// ※ 価格・提供割合・報酬量などの数値はすべて Prototype 用の仮値。正式なバランスはまだ決めていない。
const params = new URLSearchParams(location.search);

/** 常設の Pool(どのガチャにも入る仲間)。PICK UP キャラは各ガチャの pool に足す */
const STANDARD_POOL = [
  { characterId: 'minamo', weight: 1, pickup: false }, { characterId: 'raimu', weight: 1, pickup: false }, { characterId: 'kagura', weight: 1, pickup: false },
  { characterId: 'hinoka', weight: 1, pickup: false }, { characterId: 'shizuku', weight: 1, pickup: false }, { characterId: 'kohaku', weight: 1, pickup: false },
  { characterId: 'akane', weight: 1, pickup: false }, { characterId: 'nagi', weight: 1, pickup: false },
];

export const APP_CONFIG = {
  app: {
    title: 'HEART STRIKE',
    titleJa: 'ハートストライク',
    version: 'v25',
    // テスト / デバッグ用:?boot=stage で STAGE SELECT から起動(製品の起動先は HOME)
    bootScreen: params.get('boot') || 'home',
    reducedMotion: 'auto',     // 'auto'(OS 設定に従う)| 'on' | 'off'
    lowPower: false,           // 低負荷モード(将来用:Particle を減らす)
  },

  // ---- キャラクター所持(Ownership)----
  ownership: {
    // LEGACY_ALL:ガチャの正式運用までは、既存ロスター(v23 で使えていた全キャラ)を常に所持扱いにする(false へは戻さない)
    // GACHA:所持はガチャ / スターター / 報酬でのみ増える(テスト用に ?ownership=GACHA)
    mode: params.get('ownership') || 'LEGACY_ALL',
    // v23 の CharacterData に実在し、ゲームで使えていたキャラクター(固定 ID)
    legacyRoster: ['minamo', 'hinoka', 'raimu', 'shizuku', 'akane', 'kohaku', 'kagura', 'nagi'],
  },

  // ---- 開発・テスト用の所持数の調整(1回だけ。セーブに id を記録し、2回目以降の起動では何もしない)----
  //   set.heartGem … 所持 HEART GEM(ダイヤ)をこの値にする(画面の表示ではなく所持データそのもの。その後のガチャ等の消費は普通に減る)
  //   既存セーブにも、次の起動時に1回だけ適用される。もう一度配る時は id を変えた項目を足す
  devGrants: [
    { id: 'dev-gem-10000-20261001', set: { heartGem: 10000 } },
  ],

  // ---- スターター(構造だけ。人数・キャラは未決定)----
  starter: {
    characters: [],            // 新規セーブで付与するキャラ ID(未決定のため空)
    grantOnNewSave: true,      // 既存セーブには starterGranted = true を立て、後から勝手に付与しない
  },

  // ---- 報酬(仮値)----
  rewards: {
    firstClearGem: { NORMAL: 50, HARD: 80, HELL: 120 },   // 仮:Stage × Difficulty の初回クリア報酬(HEART GEM)
  },

  // ---- ミッション(Prototype の仮データ。受け口の確認用)----
  missions: [
    { id: 'clear_any', label: 'ステージを1回クリアしよう', goal: { type: 'totalClears', count: 1 }, reward: { heartGem: 30 } },
    { id: 'clear_hard', label: 'HARD をクリアしよう', goal: { type: 'difficultyClear', difficulty: 'HARD', count: 1 }, reward: { heartGem: 50 } },
    { id: 'gacha_once', label: 'ガチャでハートを届けよう', goal: { type: 'gachaPulls', count: 1 }, reward: { heartGem: 20 } },
  ],

  // ---- イベントステージ(構造だけ。今は無し)----
  events: [],   // { stageId, difficulty, label, from, to }

  // ---- HOME ----
  home: {
    dialogueSeconds: 4,        // 吹き出しの表示時間
    tapLockSeconds: 1.5,       // タップ反応中の再入力抑制
    longPressMs: 450,          // 長押しで CHARACTER DETAIL
    characterHeight: 0.62,     // 全身の高さ(画面高さ比)
    guidanceCooldownMin: 30,   // 同じ Guidance を再び喋るまで(分)
    returnAfterHours: 72,      // RETURN_LONG:久しぶり(3日以上)
    guidanceEveryTaps: 3,      // キャラを3回タップするごとに1回、未解決の Guidance をもう一度言う
    levelUpNearRatio: 0.8,     // LEVEL_UP_NEAR:次のレベルまで 80% 以上
    avoidRecentLines: 2,       // 直近 n 件の通常セリフは避ける
    presentExpireSoonHours: 24,
    afterClearValidMin: 30,    // afterClear の pending trigger が有効な時間
  },
  guidancePriority: { CRITICAL: 100, REWARD: 80, NEW_CONTENT: 60, PROGRESS: 40, RETURN: 30, NORMAL: 0 },

  // ---- ガチャ(価格・提供割合・保証・Pickup・天井は UNDECIDED。以下は Prototype の仮値)----
  gacha: {
    seed: params.get('gachaSeed') ? Number(params.get('gachaSeed')) : null,   // テスト用の固定シード
    /**
     * ガチャ(GachaBanner)。ここに1件足すだけで新しいガチャを開催できる(PICK UP・季節限定・コラボ…)。コードに個別の分岐は書かない
     *   id / title(タイトル)/ name・sub(説明)/ order(TOP での並び。小さいほど左)/ focus(TOP を開いた時に中央に出す)
     *   isDefault … 常設の DEFAULT GACHA / startAt・endAt … 開催期間(ISO 文字列 or null = 常時)。期間外は TOP に出さない
     *   bannerCharacter … TOP に大きく出すキャラ(null = Pool の数人を並べる)
     *   pickupCharacters … PICK UP キャラ(Pool の pickup: true と同じ。表示・抽選の両方で使う)
     *   pickupRate … { [レアリティ]: そのレアリティが出た時に PICK UP キャラになる割合 }(★ 仮。確定までここだけ変える)
     *   rates … レアリティの提供割合(★ 仮)。Pool にキャラがいないレアリティは抽選の対象外(残りで割り直し)
     *   theme … TOP / 演出の配色テーマ(online.html の [data-theme])/ copy … TOP の文言
     *   cost … 価格 / guarantee … 10連保証 / presents … プレゼント抽選 / pity … 天井(未決定)
     */
    banners: [
      {
        id: 'yoruna_pickup', title: 'ヨルナ PICK UP', name: 'ヨルナ PICK UP ガチャ', sub: '闇夜を焦がす、恋の炎。',
        order: 0, focus: true, isDefault: false,
        bannerCharacter: 'yoruna', pickupCharacters: ['yoruna'],
        theme: 'darkDragon',
        copy: { badge: 'SSR PICK UP', epithet: 'ダークドラゴン', name: 'ヨルナ', catch: '闇夜を焦がす、恋の炎。', status: 'PICK UP 開催中' },
        cost: { single: 150, ten: 1500 },                 // 仮(DEFAULT と同じ)
        rates: { N: 0, R: 0.79, SR: 0.18, SSR: 0.03 },    // 仮(DEFAULT と同じ)
        pickupRate: { SSR: 0.5 },                         // ★ 仮:SSR が出た時に PICK UP キャラになる割合(未確定)
        pool: [{ characterId: 'yoruna', weight: 1, pickup: true }, ...STANDARD_POOL],
        guarantee: { tenPullMinRarity: 'SR' },
        presents: { rankRates: null, pool: null },
        pity: null,
        presentationId: 'default',
        startAt: null, endAt: null,
      },
      {
        id: 'standard', title: 'DEFAULT GACHA', name: 'ハートを届けよう', sub: 'まだ出会っていない子へ、あなたのハートを',
        order: 1, focus: false, isDefault: true,
        bannerCharacter: null, pickupCharacters: [],
        theme: 'default',
        copy: { badge: 'DEFAULT GACHA', epithet: null, name: null, catch: 'まだ出会っていない子へ、あなたのハートを', status: '常設' },
        cost: { single: 150, ten: 1500 },                // 仮
        rates: { N: 0, R: 0.79, SR: 0.18, SSR: 0.03 },   // 仮
        pickupRate: null,
        // Pool は最新 CharacterData に実在する ID のみ(起動時に存在しない ID は除外して Debug 警告)
        // 攻略対象(RomanceData.HEROINES)は CharacterData に無いので入らない。プレイアブル化した味方版を足す時だけ、その ID をここへ
        pool: [{ characterId: 'yoruna', weight: 1, pickup: false }, ...STANDARD_POOL],
        guarantee: { tenPullMinRarity: 'SR' },            // 仮
        // プレゼント抽選(キャラとは独立して、1回ごとに必ず1個)。排出率は未決定
        //   rankRates … ランク別の排出率 { [GIFT_RANKS の id]: 割合 }。null の間はランクを見ない
        //   pool      … 対象のプレゼント ID。null の間は GIFTS のうち drop.enabled のもの全部
        presents: { rankRates: null, pool: null },
        pity: null,                                        // 天井(未決定)
        presentationId: 'default',                         // 演出テーマ(抽選には使わない)
        startAt: null, endAt: null,
      },
    ],
    particleScale: 1,               // 演出の光の粒の量(低スペック端末は 0.5)
    haptic: true,
    // ---- 演出(src/gacha/GachaDirector.js)。抽選には一切使わない ----
    show: {
      ssrDisguise: { SR: 0.7, R: 0.3 },   // SSR のハートが開ける前に見せる色(SR かな? → 昇格)
      fastScale: 0.55,                    // FAST:時間をこの倍率に(SSR の昇格の流れは残す)
      // 時間(ミリ秒)
      timing: {
        intro: 380, seed: 420, beat: 520, gather: 1250, settle: 380,
        crack: 420, leak: 520, burst: 420, freeze: 380, dark: 420, dokun: 700, relight: 650, ripple: 900, whiteout: 700,
        silhouette: 620, unveil: 620, info: 260, hold: { N: 900, R: 1100, SR: 1600, SSR: 3600 },
        splitFly: 780, openSmall: 300, cardIn: 260, gridHold: 900, present: 70, presentHold: 1600,
        charFx: { dark: 380, flame: 900, heart: 620 },   // キャラ固有の追加演出(RevealEffects.js)
      },
      // 正式な SE が入ったらファイルを書く(null の間は合成音)。heartAppear / heartbeat / gather / crack / burst / charAppear / sr / ssrPromote / ssrConfirm / cardOpen / present
      sfx: { heartAppear: null, heartbeat: null, gather: null, crack: null, burst: null, charAppear: null, sr: null, ssrPromote: null, ssrConfirm: null, cardOpen: null, present: null },
    },
    keepTransactions: 20,
  },
};
