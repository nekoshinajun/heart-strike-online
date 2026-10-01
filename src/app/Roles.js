import { HEROINE_ASMR_UNLOCK } from '../data/RomanceData.js';
import { stageById } from '../data/GameData.js';
import { difficultyData } from '../core/Config.js';

/**
 * 「仲間」と「攻略対象」を画面のどこでも同じ見た目で見分けるための小さな部品。
 *   仲間(味方の女の子)… ピンク「♡ 仲間」:育成・親密度・デートメンバー(戦闘)で使う側。ASMR は無い
 *   攻略対象            … ラベンダー「🎧 攻略対象」:コンカフェで口説く側。仲間にはならない。HELL クリアで ASMR 解放
 */
export const roleTag = (role, cls = '') => role === 'heroine'
  ? `<span class="role heroine ${cls}">🎧 攻略対象</span>`
  : `<span class="role ally ${cls}">♡ 仲間</span>`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 解放条件の説明文(データの条件から作る。条件を変えれば文言も変わる)*/
export function unlockText(cond, heroine) {
  if (!cond) return '解放条件は準備中';
  if (cond.type === 'clear') {
    const st = stageById(cond.stageId ?? heroine?.stageId);
    const d = cond.difficulty ? difficultyData(cond.difficulty).label : '';
    const where = cond.stageId && cond.stageId !== heroine?.stageId && st ? `STAGE ${st.no} ` : '';
    return `${where}${d}クリアで解放`;
  }
  return '解放条件は準備中';
}
export const defaultUnlockText = (heroine) => unlockText(HEROINE_ASMR_UNLOCK, heroine);

/** 攻略対象の難易度ごとのクリア状況(NORMAL / HARD / HELL の小さなバッジ)*/
export function clearChips(progress, stageId, order) {
  return `<span class="clr-chips">${order.map((d) => {
    const D = difficultyData(d), on = progress.isCleared(stageId, d);
    return `<i class="${on ? 'on' : ''}" style="--dc:${D.color}" title="${esc(D.label)}">${esc(D.label)}${on ? ' ✓' : ''}</i>`;
  }).join('')}</span>`;
}

/** ASMR の状態を1行で(攻略対象のみ)*/
export function asmrStatus(progress, heroine) {
  const tracks = progress.asmrTracks(heroine.id);
  if (!tracks.length) return `<span class="asmr-st soon">🎧 ASMR 準備中 ・ ${esc(defaultUnlockText(heroine))}</span>`;
  const n = tracks.filter((t) => t.unlocked).length;
  if (!n) return `<span class="asmr-st lock">🔒 ASMR ・ ${esc(defaultUnlockText(heroine))}</span>`;
  return `<span class="asmr-st open">🎧 ASMR ${n} / ${tracks.length} 解放${tracks.some((t) => t.isNew) ? ' <b>NEW</b>' : ''}</span>`;
}
