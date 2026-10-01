// HEART STRIKE:ゲームの「外側」(HOME / Navigation / 所持 / ガチャ / 報酬)の設定。
// ※ 価格・提供割合・報酬量などの数値はすべて Prototype 用の仮値。正式なバランスはまだ決めていない。
const params = new URLSearchParams(location.search);

export const APP_CONFIG = {
  app: {
    title: 'HEART STRIKE',
    titleJa: 'ハートストライク',
    version: 'v25',
    // テスト / デバッグ用:?boot=stage で STAGE SELECT から起動(製品の起動先は HOME)
    bootScreen: params.get('boot') || 'home',
    reducedMotion: 'auto',     // 'auto'(OS 設定に従う)| 'on' | 'off'
    lowPower: false,           // 低負荷モード(将来用:Particle を減らす)
    introMultiMs: 3000,        // MULTI:攻略対象紹介を見せる時間(全員同じ。この後に同時に GAME START)
  },

  // ---- キャラクター所持(Ownership)----
  ownership: {
    // LEGACY_ALL:ガチャの正式運用までは、既存ロスター(v23 で使えていた全キャラ)を常に所持扱いにする(false へは戻さない)
    // GACHA:所持はガチャ / スターター / 報酬でのみ増える(テスト用に ?ownership=GACHA)
    mode: params.get('ownership') || 'LEGACY_ALL',
    // v23 の CharacterData に実在し、ゲームで使えていたキャラクター(固定 ID)
    legacyRoster: ['minamo', 'hinoka', 'raimu', 'shizuku', 'akane', 'kohaku', 'kagura', 'nagi'],
  },

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
    banners: [
      {
        id: 'standard', name: 'ハートを届けよう', sub: 'まだ出会っていない子へ、あなたのハートを',
        cost: { single: 150, ten: 1500 },                // 仮
        rates: { R: 0.79, SR: 0.18, SSR: 0.03 },          // 仮
        // Pool は最新 CharacterData に実在する ID のみ(起動時に存在しない ID は除外して Debug 警告)
        // 攻略対象(RomanceData.HEROINES)は CharacterData に無いので入らない。プレイアブル化した味方版を足す時だけ、その ID をここへ
        pool: [
          { characterId: 'minamo', weight: 1, pickup: false }, { characterId: 'raimu', weight: 1, pickup: false }, { characterId: 'kagura', weight: 1, pickup: false },
          { characterId: 'hinoka', weight: 1, pickup: false }, { characterId: 'shizuku', weight: 1, pickup: false }, { characterId: 'kohaku', weight: 1, pickup: false },
          { characterId: 'akane', weight: 1, pickup: false }, { characterId: 'nagi', weight: 1, pickup: false },
        ],
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
    // SSR の「演出ルート」の出やすさ。レアリティ抽選とは完全に独立(SSR 提供割合に影響しない)。初期値は実機テスト後に決定
    presentationWeights: { R: { R_NORMAL: 1 }, SR: { SR_NORMAL: 1 }, SSR: { SSR_DIRECT: 3, R_TO_SSR: 1, SR_TO_SSR: 1 } },
    fragmentHintMode: 'GOLD_ONLY',  // 10連の分裂時のヒント:NONE | GOLD_ONLY | RAINBOW_FLASH | MIXED(初期値は実機テスト後)
    revealOrderMode: 'DRAW_ORDER',  // DRAW_ORDER | SSR_LAST | NEW_SSR_LAST | PROMOTION_LAST | RARITY_ASCENDING(一覧は常に抽選順)
    particleScale: 1,               // 低スペック端末は 0.5
    camera: { followLag: 0.3, fovKick: 0.04, maxRollDeg: 8, promoRollDeg: 6 },
    haptic: true,
    // 演出時間(秒・Release = 0.0 の実時間。TimeScale 非依存)
    timing: {
      enter: 0.5, guideAfter: 2.0,
      gate1: 0.55, gate2: 0.95, gate3: 1.35, arriveR: 1.6, arriveSR: 1.7,
      ssr: { stop: 1.40, silenceEnd: 1.90, beat1: 1.90, beat2: 2.55, rainbowGate: 2.95, accel: 3.35, enter: 3.75, arrive: 3.90 },
      promo: { pulse: 1.35, silence: 1.45, beat1: 1.95, beat2: 2.60, route: 2.90, curve: 3.20, enter: 3.80, arrive: 3.95 },
      catch: 0.8, burst: 0.3, revealTap: { R: 1.2, SR: 1.6, SSR: 2.4 }, ssrUiDelay: 0.4,
      ten: { gate1: 0.5, split: 0.6, glintEnd: 0.75, flyEnd: 1.8, silhouetteEnd: 2.2, reveal: { R: 0.5, SR: 0.9, SSR: 3.5, PROMO: 4.5 }, beatInterval: 0.65, beatIntervalRepeat: 0.45, list: 1.0 },
      skipFloorSSR: 2.0,
      fast: { gateScale: 0.5, revealRS: 0.3 },   // FAST:Gate 区間 2倍速 / R・SR Reveal 0.3秒 / SSR の静寂とドクンは縮めない
      tapForward: 3,                              // 演出中タップ:Gate 区間を 3 倍速
    },
    keepTransactions: 20,
  },
};
