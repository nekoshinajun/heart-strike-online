// BGM の割り当て(データだけ)。曲を追加・差し替える時はここを書き換えるだけでよい。
//   ファイルは assets/bgm/ に置く(音源は加工しない)。tracks が空の場面は無音のまま。
//
//   slot … 場面ごとの BGM
//     tracks … 曲ファイルの一覧(1曲以上)
//     pick   … 複数ある時の選び方:'random'(毎回ランダム)/ 'first'(先頭だけ)/ 'cycle'(順番)
//     gain   … 曲ごとの音の大きさの補正(0〜1。曲によって音圧が違う時だけ。省略時 1)
export const BGM_SLOTS = {
  battle: {
    tracks: [
      { src: 'assets/bgm/battle_01_heart_no_bug.mp3', title: 'ハートのバグ' },
      { src: 'assets/bgm/battle_02.mp3', title: null },
    ],
    pick: 'random',
  },
  battleHell: { tracks: [], pick: 'random' },   // HELL 専用(未設定の間は battle を使う)
  home: { tracks: [], pick: 'first' },          // 未設定
  gacha: { tracks: [], pick: 'first' },         // 未設定
  event: { tracks: [], pick: 'first' },         // 未設定
};

/** バトルの BGM:難易度ごとに専用があればそれ、無ければ battle */
export function battleSlot(difficulty) {
  if (difficulty === 'HELL' && BGM_SLOTS.battleHell?.tracks?.length) return 'battleHell';
  return 'battle';
}
