import { GameState } from '../core/StateMachine.js';

/**
 * TALK_QUESTION:好感度(HEART)が初めて 50% を超えた瞬間の会話(1プレイ1回 = Heart50EventTriggered)。
 *   [intro]  周りが暗くなり、ボスだけが浮かび上がる(Spotlight)/ UI も暗く / BGM を下げる
 *            → 静かな間 →「ドクン……」→ Heart50Expression へ表情変化
 *   [talk]   opening →「……私のどこに興味があるのよ？」→「次の1投で答えて！」(タップ / Enter / Space、または自動)
 *   → 次の手番へ直接ボールを渡す(返球・キャッチは挟まない)→ その1投が回答(暗いまま)→ TALK_REACTION の最後で明るく戻る
 * 演出は実時間(performance.now)で進める。SPECIAL / FEVER の演出はこのステートに入る前に必ず終わっている
 */
export class TalkQuestionState {
  constructor(g) { this.g = g; }
  enter({ talk }) {
    const g = this.g, A = g.affection;
    this.talk = talk;
    A.startTalk(talk);
    g.fever.pause(true);                   // FEVER 中なら残りの FEVER 進行を一時停止(会話と回答の後に再開)
    g.setTimeScale(1);
    g.ball.hide();
    g.energy.clear();
    g.space.clear();
    g.catchTarget.hide();
    g.ui.showJudge('', '');
    A.setMood(true);                       // 暗転・ボス強調・UI を暗く・BGM を下げる
    g.cam.focusOn(g.boss.partCenter('head'), 10);
    this.lines = [talk.opening, talk.question, talk.prompt].filter(Boolean);
    this.phase = 'intro';
    this.t0 = performance.now();
    this.beat = false;
    this.step = -1;
    this.done = false;
  }
  get elapsed() { return (performance.now() - this.t0) / 1000; }
  update() {
    const g = this.g, A = g.affection, T = g.cfg.talk;
    if (this.phase === 'intro') {
      if (!this.beat && this.elapsed >= T.fadeIn + T.pause) {
        this.beat = true;
        g.audio.dokun(1);                          // ドクン……
        A.flashExpr(A.data.heart50Expression ?? 'flustered', 99);
        g.boss.view.playHit?.('head', 0.6);             // 小さく跳ねる
        g.cam.focusOn(g.boss.partCenter('head'), 14);   // ボスとの距離が少し近づく
        this.tBeat = this.elapsed;
      }
      if (this.beat && this.elapsed - this.tBeat >= T.beatToTalk) { this.phase = 'talk'; this.nextLine(); }
      return;
    }
    const isLast = this.step === this.lines.length - 1;
    const auto = isLast ? 2.0 : 2.6;
    if (A.typed && this.elapsed - this.tLine > auto) this.nextLine();
  }
  onTap() {
    const A = this.g.affection;
    if (this.phase !== 'talk' || this.elapsed - this.tLine < 0.25) return;
    if (!A.typed) { A.finishTyping(this.lines[this.step]); return; }
    this.nextLine();
  }
  nextLine() {
    const g = this.g, A = g.affection;
    if (this.step < this.lines.length - 1) {
      this.step++;
      const isLast = this.step === this.lines.length - 1;
      A.showTalk(this.lines[this.step], { sub: isLast ? this.talk.hint : '', big: isLast });
      if (isLast && g.cfg.talk.dokunOnLines) g.audio.dokun(0.55);   // 重要なセリフで控えめに
      this.tLine = this.elapsed;
      return;
    }
    if (this.done) return;
    this.done = true;
    A.hideTalk();
    A.beginAnswer();                               // 次の1投 = 回答(暗いまま・ボスは明るい)
    g.cam.focusOn(g.boss.partCenter('head'), 14); // v25: 回答投球中も近距離を維持
    // 回答の1投:このフェーズでまだ投げていない次の味方。いなければ(フェーズの最後の人の命中で会話)先頭の味方が「おまけの1投」で答える
    const next = g.online ? g.online.nextThrowerIndex?.() ?? g.turn.index : g.turn.nextAttacker();
    if (!g.online && next < 0) g.answerExtraThrow = true;
    g.sm.change(GameState.NEXT_PLAYER, { to: next >= 0 ? next : g.turn.aliveIndexes[0], label: 'ANSWER' });
  }
  exit() { this.done = false; }
}

/**
 * TALK_REACTION:回答の1投が当たった場所へのリアクション(1〜2秒)。外したら MISS。
 *   その後は通常どおり(HEART MAX なら LOVE MAX 演出へ / FEVER が終わっていれば FEVER FINISH / 次の手番)
 */
export class TalkReactionState {
  constructor(g) { this.g = g; }
  enter({ answer }) {
    const g = this.g, A = g.affection;
    this.answer = answer;
    this.t = 0;
    this.done = false;
    g.cam.focusOn(g.boss.partCenter('head'), 14);
    if (answer.zone) {
      A.flashExpr(answer.zone.expr ?? 'embarrassed', 2.4);
      g.ui.showJudge(`♡ ${answer.zone.label}`, 'tier', '#ff7ab8', 'ANSWER');
      g.effects.heartBurst(g.boss.partCenter('head'), 30, 6, 0.8);
      g.audio.loveMax();
    } else {
      A.flashExpr('normal', 2.0);
      g.ui.showJudge('MISS', 'miss', '#ff3d5a');
      g.audio.whiff();
    }
    A.showTalk(answer.line, {});
  }
  update(dt) {
    this.t += Math.min(0.05, dt || 0.016);
    if (this.g.affection.typed && this.t > 1.9) this.finish();
  }
  onTap() {
    const A = this.g.affection;
    if (this.t < 0.6) return;
    if (!A.typed) { A.finishTyping(this.answer.line); return; }
    this.finish();
  }
  finish() {
    const g = this.g;
    if (this.done || g.sm.current !== this) return;
    this.done = true;
    g.affection.hideTalk();
    g.affection.setMood(false);   // 0.3〜0.5 秒で世界が明るく戻る・BGM も元の音量へ
    g.cam.reset();
    g.fever.pause(false);         // FEVER を再開(残り投球数・レベルはそのまま)
    if (g.boss.full) { g.fever.abort(); g.sm.change(GameState.GAME_CLEAR); return; }
    if (g.fever.done) { g.sm.change(GameState.FEVER_OUTRO); return; }
    g.afterThrow();
  }
}
