import { CHARACTERS } from './GameData.js';

/**
 * HOME / ガチャ用のキャラクターデータ拡張(CharacterData に項目を足す)。
 *   home          … HOME での配置 { anchor:{x,y}(画面比:足元の中心), scale, bubbleAnchor:{x,y}(画像比:頭の横〜肩), idle }
 *   voiceStyle    … 性格タイプ('cool' | 'cheerful' | 'gentle' | 'proud')。Guidance の共通文の選択に使う(voiceNote は台本用メモ)
 *   homeDialogue  … HOME のセリフ(キー:launch / tap / afterClear / afterGacha / newlyObtained / newlySetHome / setHome / idle / return)
 *   guidanceLines … 案内のセリフ(キー = Guidance の Event。{stage} {diff} {boss} {count} {chara})。キャラ固有 → voiceStyle 共通文 → 既定文 の順
 *   homeVoice / homeReaction … ボイス・リアクション(素材が無くても成立。キーだけ用意)
 *   gacha         … { obtainDialogue:{default, firstTime}, obtainVoice, revealPose:{x,y,scale}, catchPoint:{u,v}(手元・画像比), presentationId }
 * 未設定の項目は DEFAULT_* を使う。セリフはシステム文をそのまま読ませず、キャラクターの言葉にする。
 */
export const DEFAULT_HOME = { anchor: { x: 0.42, y: 1 }, scale: 1, bubbleAnchor: null /* null = portraitFocus から自動(顔の右)*/, idle: 'breathe' };

export const DEFAULT_HOME_DIALOGUE = {
  launch: ['おはよう！ 今日もいっしょにがんばろ', 'あ、来てくれたんだ。待ってたよ', 'ねえねえ、今日はどこに行く？'],
  tap: ['なあに？ ちゃんと聞いてるよ', 'ふふ、くすぐったいってば', 'ハート、今日も届けに行こうね', 'そんなに見られると照れちゃう…'],
  afterClear: ['やったね！ ハート、ちゃんと届いたよ', 'おつかれさま！ いい投球だったね', 'あの子、すっごく嬉しそうだったね'],
  afterGacha: ['誰かに会ってきた？ いい子来た？', 'ハート、届いたみたいだね'],
  newlyObtained: ['はじめまして！ これからよろしくね'],
  newlySetHome: ['はじめまして！ 今日からここにいていいの？', 'わたしを選んでくれたんだ…これからよろしくね！'],
  setHome: ['また一緒にいられるね', 'えへへ、戻ってきちゃった'],
  idle: ['……ねえ、まだかな', 'ふぁ…ちょっと眠くなってきたかも'],
  return: ['おかえり！ ずっと待ってたんだから', 'ひさしぶり…ちゃんと覚えてるよ'],
};

/** Guidance の Event(何が起きたか)→ 既定のセリフ(やわらかい口調)。{stage} {diff} {boss} {count} {chara} を差し込み */
export const DEFAULT_GUIDANCE_LINES = {
  PENDING_REVEAL: ['さっきのハート…ちゃんと届いたか見に行こう？'],
  PRESENT_EXPIRING: ['プレゼント、もうすぐ期限みたい…急いで！'],
  PRESENT_ARRIVED: ['プレゼント届いてるよ！', '{count}個も届いてる！ 早く開けよ？'],
  MISSION_CLAIMABLE: ['ねえ、ミッションのごほうび受け取れるみたいだよ！'],
  EVENT_STAGE: ['{stage}で何か始まってるみたい…行ってみよ！'],
  NEW_STAGE: ['新しいステージ来てるよ！ {stage}、行ってみない？'],
  NEW_CHARACTER: ['新しい子、来たね！ {chara}ちゃんに会いに行こ？'],
  NEW_BANNER: ['まだ会ったことない子に、ハートを届けられるみたい…'],
  STAGE_FIRST_CLEAR: ['{boss}の{diff}、まだみたい！ 一緒に行こ？'],
  LEVEL_UP_NEAR: ['{chara}、もう少しでレベル上がりそう！'],
  RETURN_LONG: ['……ずっと待ってたんだから。'],
};

/** 性格タイプ別の共通文(キャラ固有 → 性格タイプ → 既定 の順に解決)*/
export const STYLE_GUIDANCE_LINES = {
  cool: {
    PRESENT_ARRIVED: ['プレゼント、届いてる。…見てきたら？'],
    STAGE_FIRST_CLEAR: ['{boss}の{diff}、まだでしょ。…行く？'],
    RETURN_LONG: ['…遅い。別に、待ってなかったけど'],
  },
  cheerful: {
    PRESENT_ARRIVED: ['ねえねえ、なんか届いてるって！'],
    STAGE_FIRST_CLEAR: ['{boss}の{diff}、まだクリアしてないよね！ 行こ行こ！'],
  },
  gentle: {
    PRESENT_ARRIVED: ['プレゼントが届いていますよ。見に行きましょうか'],
    RETURN_LONG: ['おかえりなさい。…少し、さみしかったです'],
  },
  proud: {
    PRESENT_ARRIVED: ['そなた宛ての品が届いておるぞ'],
    STAGE_FIRST_CLEAR: ['{boss}の{diff}、まだ攻めておらぬな？ 参るぞ'],
  },
};

/** ガチャ Reveal 専用(HOME のセリフとは別管理)。obtainDialogue は firstTime → default → レアリティ共通 の順 */
export const DEFAULT_GACHA = {
  obtainDialogue: { default: null, firstTime: null },
  obtainVoice: { default: null, firstTime: null },
  revealPose: { x: 0, y: 0, scale: 1 },
  catchPoint: { u: 0.5, v: 0.45 },
  presentationId: null,
};
export const RARITY_OBTAIN_LINES = { R: 'よろしくね！', SR: 'ハート、届いたよ！ よろしくね', SSR: '届いたーっ！ あなたのハート、ちゃんと受け取ったよ！' };

const EXT = {
  minamo: {
    voiceStyle: 'cool', voiceNote: 'クールで少し不器用なエース',
    homeDialogue: {
      launch: ['来たね。…別に待ってたわけじゃないけど', '今日も一直線でいこう'],
      tap: ['なに？ …練習の話なら聞くけど', 'ストレートなら誰にも負けないよ'],
      afterClear: ['当然の結果。…でも、あなたのおかげ'],
      newlySetHome: ['わたしでいいの？ …うん、これからよろしく'],
    },
    guidanceLines: { STAGE_FIRST_CLEAR: ['{boss}の{diff}、まだでしょ。…一緒に行く？'], PRESENT_ARRIVED: ['プレゼント届いてるよ。…開けないの？'] },
    gacha: { obtainDialogue: { default: '…届いた。まっすぐなハート、嫌いじゃない' } },
  },
  hinoka: {
    voiceStyle: 'cheerful', voiceNote: '面倒見のいい姉御肌',
    homeDialogue: {
      launch: ['よっ！ 今日も元気にいこうじゃん', 'おかえり。ちゃんとご飯食べた？'],
      tap: ['どした？ 相談ならいつでも乗るよ', 'あたしの直球、見せてあげよっか'],
      afterClear: ['ナイス！ 最高のチームだね'],
    },
    gacha: { obtainDialogue: { default: 'ハート、熱いの届いたよ！ よろしくね！' } },
  },
  raimu: {
    voiceStyle: 'cheerful', voiceNote: 'いたずら好きのテクニシャン',
    homeDialogue: {
      launch: ['にしし、今日はどんなカーブ描いちゃう？'],
      tap: ['くるっと曲げて、びっくりさせちゃお', 'ビリッときた？ ふふっ'],
    },
    gacha: { obtainDialogue: { default: 'ビリビリっと届いたよ！ これからよろしく〜！' } },
  },
  shizuku: {
    voiceStyle: 'gentle', voiceNote: 'おっとりした守りの要',
    homeDialogue: {
      launch: ['いらっしゃい。今日も静かで、いい日ですね'],
      tap: ['ゆっくりでいいんですよ', 'キャッチなら、任せてください'],
    },
    gacha: { obtainDialogue: { default: 'あなたのハート、そっと受け止めました' } },
  },
  akane: {
    voiceStyle: 'cheerful', voiceNote: '元気いっぱいの新人',
    homeDialogue: {
      launch: ['おはようございますっ！ 今日も特訓です！'],
      tap: ['わわっ、なんですか！？', 'レベル上げたら、もっと強くなれますよね！'],
    },
    gacha: { obtainDialogue: { default: '届きましたーっ！ がんばります！' } },
  },
  kohaku: {
    voiceStyle: 'cool', voiceNote: '素早く軽やか',
    homeDialogue: { tap: ['すき間があれば、撃ち抜くだけ'] },
    gacha: { obtainDialogue: { default: '稲妻みたいに届いたね！ よろしく！' } },
  },
  kagura: {
    voiceStyle: 'proud', voiceNote: '誇り高い火の巫女',
    homeDialogue: { launch: ['ふふ、待っておったぞ'], tap: ['わらわの炎、見惚れるでないぞ'] },
    gacha: { obtainDialogue: { default: 'よう届けた。そなたのハート、確かに受け取ったぞ' } },
  },
  nagi: {
    voiceStyle: 'gentle', voiceNote: '穏やかでやさしい',
    homeDialogue: { tap: ['のんびりいきましょう'] },
    gacha: { obtainDialogue: { default: '届きました。…あたたかいハートですね' } },
  },
};

// CharacterData に反映(未設定の項目は既定値)
for (const c of CHARACTERS) {
  const e = EXT[c.id] ?? {};
  c.home = { ...DEFAULT_HOME, ...(c.home ?? {}), ...(e.home ?? {}) };
  c.voiceStyle ??= e.voiceStyle ?? '';
  c.homeDialogue = { ...(e.homeDialogue ?? {}), ...(c.homeDialogue ?? {}) };
  c.guidanceLines = { ...(e.guidanceLines ?? {}), ...(c.guidanceLines ?? {}) };
  c.homeVoice ??= {};
  c.homeReaction ??= {};
  const g = { ...(e.gacha ?? {}), ...(c.gacha ?? {}) };
  c.gacha = { ...DEFAULT_GACHA, ...g, obtainDialogue: { ...DEFAULT_GACHA.obtainDialogue, ...(g.obtainDialogue ?? {}) }, obtainVoice: { ...DEFAULT_GACHA.obtainVoice, ...(g.obtainVoice ?? {}) } };
}
