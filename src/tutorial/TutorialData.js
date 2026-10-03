/**
 * チュートリアルの内容(データ)。敵はリリス(STAGE 01 のボス)。説明はシステムの文
 *   文言・順番・レッスンの追加はこのファイルだけで変えられる(進行は TutorialDirector)
 *
 * Lesson
 *   id / title / summary … 一覧の表示
 *   field   … 投球ごとの 3D 空間:{ pattern(Config.space.dualRoutes のペア ID)、gates / energy / obstacles(false で消す)} / 'none' = 何も出さない
 *   defence … true:投球を飛ばして、すぐボスの攻撃から始める(DEFENCE のレッスン)
 *   attack  … DEFENCE で出す攻撃:{ notes: ['HOLD'] など、interval?, path?(Config.enemyAttacks.patterns の ID)}
 *   slow    … ボスの攻撃中のゲーム速度(1 = 通常)。初めてでも見えるように少しゆっくり
 *   steps   … 順に進む。1ステップ = do(開始時の処理)→ coach を出して wait を待つ → card(タップで次へ)
 *     wait(e, d) … イベント e(attack / throw / hit / miss / orb / specialArmed / phaseEnd(全員投げ終えた)/ bossAttack / catch / defenseEnd / feverEnd)で true なら次へ
 *     tip(e, d)  … 待っている間の失敗の一言(文字列を返すと coach に一時的に出す)
 *     tries      … この回数だけ投げても(DEFENCE は受けても)できなければ、先へ進める(詰まらないように)
 *     card       … { title, text, points?: [..], focus?: 光らせる要素の CSS セレクタ }
 */

const ANY_THROW_END = (e) => e === 'hit' || e === 'miss';

export const TUTORIAL_LESSONS = [
  {
    id: 'basic', title: '基本', summary: '投げる・真ん中を狙う・ボスの攻撃を受け止める',
    field: 'none',
    steps: [
      { card: { title: 'チュートリアル', text: 'ハートを投げて、リリスをドキドキさせよう!', points: ['上の LOVE ゲージを 100% にしたら攻略成功', 'みんなの HP が 0 になったら失敗(チュートリアルでは負けません)'], focus: '#heartBar' } },
      { card: { title: 'バトルの流れ', text: '4人が1回ずつ投げたら、ボスの反撃。これをくり返すよ。', points: ['右下のアイコンが、いっしょに戦う4人'], focus: '#players' } },
      {
        coach: 'ハートに指を置いて、ボスに向かって上へシュッと払おう',
        wait: (e) => e === 'hit',
        card: { title: '着弾', text: 'ボスの真ん中の縦ラインに近いほど、たくさんドキドキ!', points: ['PERFECT ×1.5 / GREAT ×1.3 / GOOD ×1.15 / HIT ×1.0', '当たる場所(顔・胸・脚)や球の速さでは変わらない。横の位置だけ'] },
      },
      {
        coach: '残りのメンバーも投げてみよう。全員が投げたらボスの反撃!',
        wait: (e) => e === 'bossAttack',
        card: { title: 'ボスの反撃', text: 'ハートが飛んでくるよ。外の輪が縮んで、真ん中の円にぴったり重なった瞬間にタップ!', points: ['PERFECT ならダメージ 0', 'ボスの攻撃はパーティ全員に当たる(DEF が高い子ほど痛くない)', 'タイミングは見た目だけで判断(カウント音はない)'] },
      },
      { coach: '輪が重なった瞬間にタップ!', wait: (e) => e === 'defenseEnd' },
    ],
    done: 'これで基本はばっちり! 次はレッスンで、カーブやハートゲートを覚えよう。',
  },
  {
    id: 'curve', title: 'カーブ', summary: 'ハートの周りをぐるぐる回してから投げると曲がる',
    field: 'none',
    steps: [
      { card: { title: 'カーブ', text: 'ハートを持ったまま、ハートの周りを指でぐるぐる回してから投げると曲がるよ。', points: ['時計回り = 右 / 反時計回り = 左', '1周で少し、3周で最大まで曲がる'] } },
      {
        coach: 'ハートを持ったまま、ハートの周りをぐるっと1周させてから投げよう',
        wait: (e, d) => e === 'throw' && d.turns >= 0.75, tries: 3,
        tip: (e, d) => (e === 'throw' ? 'まだ1周回っていないよ。ハートの周りを指でぐるっと1周させてね' : null),
      },
      {
        wait: ANY_THROW_END,
        card: { title: '1周', text: '1周だと少しだけ曲がるよ。次は3周回してみよう!' },
      },
      {
        coach: '今度はハートの周りをぐるぐる3周させてから投げよう',
        wait: (e, d) => e === 'throw' && d.turns >= 2.6, tries: 3,
        tip: (e, d) => (e === 'throw' ? `${Math.max(0.5, Math.floor(d.turns * 2) / 2)}周だったよ。3周回すと最大まで曲がる!` : null),
      },
      {
        wait: ANY_THROW_END,
        card: { title: '3周', text: '回した量はハートの上に RIGHT CURVE / LEFT CURVE と出るよ。3周で最大まで曲がる!', points: ['曲がりやすさはキャラで違う(CURVE タイプ・CURVE ステータスが高いほど大きく曲がる)'] },
      },
      { coach: '残りのメンバーも、カーブで投げてみよう', wait: (e) => e === 'phaseEnd' },
    ],
    done: 'カーブで、横にあるハートゲートも狙えるよ。',
  },
  {
    id: 'gate', title: 'ハートゲート', summary: '光る輪をくぐって当てるとダメージアップ',
    field: { pattern: 'STRAIGHT_PAIR', energy: false, obstacles: false },
    steps: [
      { card: { title: 'ハートゲート', text: 'ピンクに光る輪をくぐってボスに当てると、ダメージアップ!', points: ['左と右、どっちのルートを通すかは投げ方で選ぶ', 'くぐった数で倍率:1個 ×1.1 / 2個 ×1.25 / 3個 ×1.5', 'くぐってもボスに当たらなければボーナスなし'] } },
      {
        coach: 'ピンクの輪をくぐって、ボスに当てよう',
        wait: (e, d) => e === 'hit' && d.gates > 0, tries: 5,
        tip: (e, d) => (e === 'miss' && d.gates > 0 ? '輪はくぐれた! でもボスに当たらないとボーナスなし' : e === 'hit' ? 'ボスには当たったけど、輪をくぐっていないよ' : null),
        card: { title: 'GATE!', text: 'ゲートの倍率がダメージに乗ったよ。', points: ['難易度が上がるとゲートは小さくなる'] },
      },
      { coach: '残りのメンバーも、ゲートを狙って投げてみよう', wait: (e) => e === 'phaseEnd' },
    ],
    done: 'ゲートの位置を見て、まっすぐ・カーブ・山なりを使い分けよう。',
  },
  {
    id: 'wall', title: '壁と BANK SHOT', summary: '赤い壁は避ける。跳ね返して当てるのもアリ',
    field: { pattern: 'BANK_PAIR', energy: false },
    steps: [
      { card: { title: '壁', text: '赤い ✕ の壁は当てちゃダメ! 跳ね返って勢いが落ちるよ。', points: ['でも、跳ね返ってボスに当たれば BANK SHOT!'] } },
      { coach: '壁をよけて、ボスに当てよう(跳ね返しても OK)', wait: ANY_THROW_END },
    ],
    done: '壁が動くステージもあるよ。よく見て通そう。',
  },
  {
    id: 'special', title: 'Diamond と SPECIAL', summary: 'Diamond を集めて必殺技',
    field: { pattern: 'STRAIGHT_PAIR', gates: false, obstacles: false },
    steps: [
      { card: { title: 'Diamond', text: 'キラキラの Diamond を取ると、投げた子の SPECIAL ゲージが +10%。10個で MAX!', points: ['SPECIAL ゲージはキャラごと。取った子のゲージだけが増える', '右下のアイコンのまわりの輪が、各キャラのゲージ'] } },
      { coach: 'キラキラの Diamond を通るように投げよう', wait: (e) => e === 'orb', tries: 4 },
      { wait: (e) => e === 'attack' },   // 次の子の番になってから(SPECIAL ON は投げる子の番だけ)
      {
        do: (t) => t.fillSpecial(),
        card: { title: 'SPECIAL READY!', text: '練習なので、全員の SPECIAL ゲージを MAX にしたよ。', points: ['リングが光って READY! の、今投げる子のアイコンをタップすると「ON!」', 'その状態で投げると必殺技!(もう一度タップで OFF)'], focus: '#players .pcard.active' },
      },
      {
        coach: '光っているアイコンをタップして ON! にしてから投げよう',
        wait: (e, d) => e === 'throw' && d.special, tries: 3,
        tip: (e) => (e === 'throw' ? 'SPECIAL が OFF のまま投げたよ。光っているアイコンをタップして ON! にしてね' : null),
      },
      {
        wait: (e, d) => ANY_THROW_END(e) && d.special, tries: 1,   // SPECIAL で投げなかった時(tries で先へ進めた時)は出さない
        card: { title: 'SPECIAL HEART', text: '必殺技はダメージ ×3。キャラごとの演出と効果つき!', points: ['例:セラは味方全員の HP を回復', '使った子のゲージだけ 0 に戻る'] },
      },
    ],
    done: 'SPECIAL は温存もできるよ。ここぞという時に使おう。',
  },
  {
    id: 'fever', title: 'COMBO と FEVER', summary: '当て続けて FEVER TIME',
    field: { pattern: 'STRAIGHT_PAIR', gates: false, obstacles: false },
    steps: [
      { card: { title: 'COMBO と FEVER', text: '続けて当てると COMBO! COMBO が続くほど FEVER ゲージがぐんぐん貯まるよ。', points: ['外すと COMBO は 0 に戻るけど、貯まった FEVER ゲージは減らない', 'FEVER ゲージを増やすのは COMBO だけ', '100% になったら、次の攻撃ターンが FEVER TIME'], focus: '#combo' } },
      { do: (t) => t.startFever(), wait: (e, d) => e === 'attack' && d.fever },
      { card: { title: '♡ FEVER TIME ♡', text: '4人が1回ずつ投げられるよ! Diamond がたくさん並ぶチャンス', points: ['ダメージは増えない。Diamond を集めて SPECIAL ゲージを貯めよう'] } },
      { coach: 'どんどん投げよう!', wait: (e) => e === 'feverEnd' },
    ],
    done: 'FEVER は COMBO を続けたごほうび。外さないように狙おう。',
  },
  {
    id: 'hold', title: 'HOLD', summary: '押しっぱなしで受け止める(★2 から)',
    defence: true, attack: { notes: ['HOLD'] }, slow: 0.7,
    steps: [
      {
        wait: (e) => e === 'bossAttack',
        card: { title: 'HOLD!', text: '輪が重なったら押しっぱなし。真ん中からメーターが広がって、外の輪に届いて光ったら離してね。', points: ['ボスは攻撃するたびに強くなる。★が増えると HOLD などが出てくる'] },
      },
      {
        coach: '輪が重なったら押す → 光ったら離す',
        wait: (e, d) => e === 'catch' && d.grade !== 'MISS', tries: 4,
        tip: (e, d) => (e === 'catch' && d.grade === 'MISS' ? `もう一回! ${d.why || ''}` : null),
      },
    ],
    done: 'HOLD は「押すタイミング」と「離すタイミング」の悪い方が判定になるよ。',
  },
  {
    id: 'slide', title: 'SLIDE', summary: '動くハートについていく(★3 から)',
    defence: true, attack: { notes: ['FLICK'] }, slow: 0.7,
    steps: [
      {
        wait: (e) => e === 'bossAttack',
        card: { title: 'SLIDE!', text: '輪が重なったら押して、そのまま動くハートについていこう。終点で離してね。', points: ['線から大きく外れる・終点まで運ばずに離すと MISS'] },
      },
      {
        coach: '押したまま、ハートについていく → 終点で離す',
        wait: (e, d) => e === 'catch' && d.grade !== 'MISS', tries: 4,
        tip: (e, d) => (e === 'catch' && d.grade === 'MISS' ? `もう一回! ${d.why || ''}` : null),
      },
    ],
    done: 'SLIDE は ★3 から出てくるよ。',
  },
  {
    id: 'multi', title: '連続攻撃', summary: '1 → 2 → 3 の順に受け止める(★4 から)',
    defence: true, attack: { notes: ['NORMAL', 'NORMAL', 'NORMAL'], interval: 0.85 }, slow: 0.8,
    steps: [
      {
        wait: (e) => e === 'bossAttack',
        card: { title: '連続攻撃', text: 'ハートが続けて飛んでくるよ! 数字の 1 → 2 → 3 の順に受け止めてね。', points: ['全部 PERFECT なら ALL PERFECT', 'ダメージは最後にまとめて受ける'] },
      },
      { coach: '1 → 2 → 3 の順にタップ!', wait: (e) => e === 'defenseEnd' },
    ],
    done: '★5 では HOLD や SLIDE もまざって飛んでくるよ。',
  },
  {
    id: 'tricky', title: '変化する攻撃', summary: '速さが変わる・途中で曲がる・止まる',
    defence: true, attack: { notes: ['NORMAL'], path: 'FEINT' }, slow: 0.8,
    steps: [
      {
        wait: (e) => e === 'bossAttack',
        card: { title: '変化する攻撃', text: '「!?」は FEINT。一度止まってから来るよ。あわてないで!', points: ['SPEED UP / SLOW DOWN:途中で速さが変わる', 'LATE CURVE:途中から曲がる', 'どの攻撃も、着く場所はマーカーで先に見えている'] },
      },
      { coach: 'マーカーの輪をよく見てタップ!', wait: (e) => e === 'defenseEnd' },
    ],
    done: '変化する攻撃は HARD・HELL でたくさん出てくるよ。',
  },
];

/** 読み物(バトルなし)。チュートリアル画面の下に並べる */
export const TUTORIAL_HELP = [
  { title: 'キャラの性能', lines: ['ATK:与えるダメージの基本。ダメージ = ATK × アビリティ × ゲート × 着弾(このあと属性・SPECIAL)', 'DEF:ボスの攻撃で受けるダメージが減る', 'CONTROL:狙いのブレが小さくなる', 'CURVE:カーブがよく曲がる', 'タイプ:STRAIGHT = 速い球 / CURVE = よく曲がる'] },
  { title: '属性の相性', lines: ['💧WATER は 🔥FIRE に、🔥FIRE は ⚡THUNDER に、⚡THUNDER は 💧WATER に強い', '有利 ×1.3(EFFECTIVE♡)/ 不利 ×0.7(RESIST)'] },
  { title: 'アビリティ', lines: ['レベルアップで覚える。例:POWER UP(ダメージ +10%)/ GUARD UP(DEF +20)/ VITAL UP(HP +30)', 'SPECIAL MASTER(SPECIAL ×1.1)/ SPECIAL CHARGE(Diamond 1個で +12%)/ GATE MASTER(ゲート命中 ×1.1)', 'キャラごとの ULTIMATE もある'] },
  { title: '難易度', lines: ['NORMAL / HARD / HELL で変わるのは、ハートゲートの大きさと受けるダメージだけ', 'キャッチの判定の幅はどの難易度も同じ', 'HARD・HELL ほど変化する攻撃が多い'] },
  { title: 'MULTI(2〜4人)', lines: ['パーティはいつも4キャラ。2人 = 2キャラずつ / 3人 = ホスト2・ほか1 / 4人 = 1キャラずつ', '自分の担当キャラの番になったら自分が投げる', 'ボスの反撃は全員が毎回受け止める(ダメージは自分の担当キャラだけ)', 'SPECIAL ゲージはキャラごとで、全員の画面で同じ', '部屋は公開ルームか4桁のパスワード → 全員 READY → ホストが START'] },
];

export const lessonById = (id) => TUTORIAL_LESSONS.find((l) => l.id === id) ?? null;
export const nextLesson = (id) => TUTORIAL_LESSONS[TUTORIAL_LESSONS.findIndex((l) => l.id === id) + 1] ?? null;
/** 済んだレッスンの記録(PlayerProgress の flags)*/
export const lessonFlag = (id) => `tutorial:${id}`;
