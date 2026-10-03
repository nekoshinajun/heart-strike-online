import { TUTORIAL_LESSONS, TUTORIAL_HELP, lessonFlag } from './TutorialData.js';
import { tutorialProgress } from './TutorialDirector.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * チュートリアル(SUB 画面。HOME のキャラの下の「チュートリアル」から開く)
 *   上:レッスン一覧(リリス戦。済んだものに ✓)/ 下:読み物(バトルなし)
 *   S = AppScreens(共通のヘッダー・本文の枠を使う)
 */
export function showTutorialScreen(app, S) {
  S.frame('tutorial', 'チュートリアル', { back: true });
  const p = app.progress, pr = tutorialProgress(p);
  S.body.innerHTML = `
    <div class="tut-intro"><b>VS ♡ リリス</b><span>実際のバトルで練習できます。負けることはなく、報酬もありません。</span><em>${pr.done} / ${pr.total} クリア</em></div>
    <ul class="as-list tut-lessons">${TUTORIAL_LESSONS.map((l, k) => {
      const done = p.flag(lessonFlag(l.id));
      return `<li class="as-row${done ? ' cleared' : ''}">
        <i class="tut-no">${done ? '✓' : k + 1}</i>
        <div class="r-main"><b>${esc(l.title)}</b><span>${esc(l.summary)}</span></div>
        <button type="button" class="r-btn${done ? ' ghost' : ''}" data-lesson="${l.id}">${done ? 'もう一度' : 'はじめる'}</button>
      </li>`;
    }).join('')}</ul>
    <h4 class="tut-h">あそびかた</h4>
    <div class="tut-help">${TUTORIAL_HELP.map((h) => `<details><summary>${esc(h.title)}</summary><ul>${h.lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}</div>`;
  for (const b of S.body.querySelectorAll('[data-lesson]')) b.addEventListener('click', () => {
    if (!app.game) { app.toast('この端末ではバトルを開始できません(3D 表示が使えません)'); return; }
    app.game.startTutorial(b.dataset.lesson);
  });
}
