import { GameState } from '../core/StateMachine.js';
import { TUTORIAL_LESSONS, lessonFlag, nextLesson } from './TutorialData.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 投球の MISS ごとの一言(MISS_LABEL と同じ種類)*/
const THROW_TIPS = { short: 'もう少し強く払ってみよう', over: 'もう少し弱く・低く投げてみよう', wide: 'ボスの方へまっすぐ払ってみよう', low: 'もう少し上へ払ってみよう' };

/**
 * チュートリアルの進行役(g.tutorial)。チュートリアル中だけ存在し、ふだんのバトルでは null
 *   レッスン(TutorialData)のステップを順に進める:coach(上の小さな案内。操作を待つ)/ card(ゲームを止めて説明。タップで次へ)
 *   ゲームの各ステートは g.tutorial?.emit(イベント, データ) を呼ぶだけ(チュートリアルの中身はここに閉じる)
 *   負けない(HP は 1 で止まる)・報酬なし(クリア / 敗北の処理に進まない)は GameManager / 各ステートが g.tutorial を見て行う
 */
export class TutorialDirector {
  constructor(g, lesson) {
    this.g = g;
    this.lesson = lesson;
    this.i = -1;
    this.started = false;
    this.waiting = false;
    this.finished = false;
    this.pendingState = null;
    this.buildUI();
  }

  get step() { return this.lesson.steps[this.i] ?? null; }
  get fieldPattern() { const f = this.lesson.field; return f && f !== 'none' ? f.pattern ?? null : null; }
  /** ボスの攻撃中だけ少しゆっくり(DEFENCE のレッスン)*/
  get timeMul() {
    const s = this.g.sm.currentName;
    return this.lesson.slow && (s === GameState.BOSS_RETURN || s === GameState.PLAYER_DEFENSE) ? this.lesson.slow : 1;
  }

  // ---------------- 開始 / 終了 ----------------
  /** バトル開始前:DEFENCE で出す攻撃を決め打ちにする */
  begin() {
    const rb = this.g.returnBall, a = this.lesson.attack;
    rb.forceSequence = a ? { id: 'TUTORIAL', notes: a.notes, interval: a.interval } : null;
    rb.forceAttack = a?.path ?? (a ? 'STRAIGHT' : null);
  }

  dispose() {
    const rb = this.g.returnBall;
    rb.forceSequence = null;
    rb.forceAttack = null;
    this.g.paused = false;
    this.unfocus();
    this.root.remove();
  }

  // ---------------- ゲームから呼ばれる ----------------
  /** PLAYER_ATTACK に入った(3D 空間は配置済み)*/
  onAttack() {
    const g = this.g, f = this.lesson.field;
    if (!g.fever.active && f) {
      const all = f === 'none';
      g.space.strip({ gates: all || f.gates === false, obstacles: all || f.obstacles === false });
      if (all || f.energy === false) g.energy.clear();
    }
    if (this.lesson.defence) this.pendingState = GameState.BOSS_TAUNT;   // 投げずにボスの攻撃へ
    this.emit('attack', { fever: g.fever.active });
  }

  /** PLAYER_ATTACK の update の先頭:別のステートへ移す必要があれば移して true */
  redirect() {
    if (!this.pendingState || this.g.paused) return false;
    const s = this.pendingState;
    this.pendingState = null;
    this.g.sm.change(s);
    return true;
  }

  emit(e, d = {}) {
    if (this.finished) return;
    if (!this.started) {
      if (e !== 'attack') return;
      this.started = true;
      this.enter(0);
    }
    if (!this.waiting) return;
    const st = this.step;
    // tries:投球が終わる(hit / miss)たびに数える。DEFENCE のレッスンはボスの攻撃を受け終わる(defenseEnd)たび
    if (this.lesson.defence ? e === 'defenseEnd' : e === 'hit' || e === 'miss') this.tries++;
    const ok = st.wait(e, d);
    if (ok || (st.tries && this.tries >= st.tries)) { this.waiting = false; this.coach(null); this.afterWait(!ok); return; }
    const tip = st.tip?.(e, d) ?? (e === 'miss' ? THROW_TIPS[d.type] ?? null : null);
    if (tip) this.coach(tip, true);
  }

  // ---------------- ステップ ----------------
  enter(i) {
    this.i = i;
    const st = this.step;
    if (!st) { this.complete(); return; }
    st.do?.(this);
    this.tries = 0;
    if (st.wait) { this.waiting = true; this.coach(st.coach ?? null); return; }
    this.afterWait();
  }

  /** gaveUp:tries で先へ進めた時は、成功した時の説明カードは出さない */
  afterWait(gaveUp = false) {
    const st = this.step;
    if (st.card && !gaveUp) this.card(st.card, () => this.enter(this.i + 1));
    else this.enter(this.i + 1);
  }

  complete() {
    this.finished = true;
    this.coach(null);
    const g = this.g, next = nextLesson(this.lesson.id);
    g.progress.setFlag(lessonFlag(this.lesson.id));
    this.card({ title: `${this.lesson.title} クリア!`, text: this.lesson.done }, null, [
      ...(next ? [{ label: `つぎ:${next.title}`, primary: true, fn: () => g.startTutorial(next.id) }] : []),
      { label: 'もう一度', fn: () => g.startTutorial(this.lesson.id) },
      { label: '一覧へもどる', primary: !next, fn: () => g.endTutorial() },
    ]);
  }

  // ---------------- レッスン用の操作 ----------------
  /** 全員の SPECIAL ゲージを MAX(練習用)*/
  fillSpecial() {
    const E = this.g.energy;
    E.gauges.entries.forEach((_, i) => E.gauges.set(i, E.gauges.max(i)));
    E.refreshUI();
  }

  /** FEVER ゲージを 100% にして、すぐ FEVER TIME へ */
  startFever() {
    const F = this.g.fever;
    F.gauge = 100;
    F.pendingStart = true;
    F.updateUI(true);
    this.pendingState = GameState.FEVER_INTRO;
  }

  // ---------------- 表示 ----------------
  buildUI() {
    const el = (this.root = document.createElement('div'));
    el.id = 'tutorial';
    el.innerHTML = `<button type="button" class="tut-quit">✕ やめる</button>
      <div class="tut-coach" hidden></div>
      <div class="tut-card" hidden role="dialog" aria-modal="true"><div class="tut-box">
        <small>TUTORIAL</small><h3></h3><p></p><ul></ul><div class="tut-btns"></div></div></div>`;
    // ゲームの入力(投球・タップ)へ流さない
    for (const ev of ['pointerdown', 'pointerup']) {
      el.querySelector('.tut-quit').addEventListener(ev, (e) => e.stopPropagation());
      el.querySelector('.tut-card').addEventListener(ev, (e) => e.stopPropagation());
    }
    el.querySelector('.tut-quit').addEventListener('click', () => this.g.endTutorial());
    this.coachEl = el.querySelector('.tut-coach');
    this.cardEl = el.querySelector('.tut-card');
    document.getElementById('ui').appendChild(el);
  }

  /** 上の小さな案内(操作を待つ間ずっと出す)。tip = 失敗の一言(少しの間だけ出して、元の案内へ戻す)*/
  coach(text, tip = false) {
    const el = this.coachEl;
    clearTimeout(this.tipTimer);
    if (!tip) this.coachText = text;
    el.hidden = !text;
    el.textContent = text ?? '';
    el.classList.toggle('tip', tip);
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    if (tip) this.tipTimer = setTimeout(() => this.coach(this.coachText), 2200);
  }

  /** 説明カード:ゲームを止めて見せる。buttons を省略すると「OK」(タップで次へ)*/
  card(c, onClose, buttons = null) {
    const g = this.g, el = this.cardEl;
    g.paused = true;
    el.querySelector('h3').textContent = c.title ?? '';
    el.querySelector('p').textContent = c.text ?? '';
    el.querySelector('ul').innerHTML = (c.points ?? []).map((x) => `<li>${esc(x)}</li>`).join('');
    const list = buttons ?? [{ label: 'OK', primary: true, fn: () => {} }];
    const box = el.querySelector('.tut-btns');
    box.innerHTML = list.map((b, k) => `<button type="button" data-k="${k}" class="${b.primary ? 'primary' : ''}">${esc(b.label)}</button>`).join('');
    for (const b of box.querySelectorAll('button')) b.addEventListener('click', () => {
      el.hidden = true;
      this.unfocus();
      g.paused = false;
      list[Number(b.dataset.k)].fn();
      onClose?.();
    }, { once: true });
    this.focus(c.focus);
    el.hidden = false;
  }

  focus(sel) {
    this.unfocus();
    const t = sel ? document.querySelector(sel) : null;
    if (t) { t.classList.add('tut-focus'); this.focused = t; }
  }
  unfocus() { this.focused?.classList.remove('tut-focus'); this.focused = null; }
}

/** 済んだレッスンの数(HOME の入口の点・一覧の ✓)*/
export function tutorialProgress(progress) {
  const done = TUTORIAL_LESSONS.filter((l) => progress.flag(lessonFlag(l.id)));
  return { done: done.length, total: TUTORIAL_LESSONS.length, basicDone: progress.flag(lessonFlag('basic')) };
}
