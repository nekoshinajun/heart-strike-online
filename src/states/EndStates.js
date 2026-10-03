import { GameState } from '../core/StateMachine.js';
import { Config } from '../core/Config.js';
import { heroineByStage } from '../data/RomanceData.js';

/**
 * TITLE(= メニュー中):STAGE SELECT / PARTY EDIT / CHARACTER SELECT は MenuFlow が表示する。
 * ゲーム開始は MenuFlow → g.startStage()(クリック/Enter)。ここではゲーム画面の入力を受けない。
 */
export class TitleState {
  constructor(g) { this.g = g; }
  enter({ screen = null } = {}) {
    const g = this.g;
    g.ball.hide(); g.catchTarget.hide(); g.energy?.clear(); g.space?.clear(); g.fever?.reset(); g.affection?.reset(); g.ui.showLoveMax?.(false);
    if (screen) g.router.go(screen);   // 画面は ScreenRouter が出す(起動時は HOME)
  }
  onTap() { this.g.audio.unlock(); }
}

export function resultStats(g) {
  const s = g.stats;
  const sec = Math.round((performance.now() - s.startTime) / 1000);
  return [
    ['TIME', `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`],
    ['LOVE', `${Math.floor(g.boss.heartRate * 100)}%`],
    ['MAX COMBO', s.maxCombo ?? 0],
    ['LOVE MAX', `${g.boss.parts.maxCount} / ${g.boss.parts.list.length}`],
    ['DIAMOND', s.orbs ?? 0],
    ['FEVER', s.fevers ?? 0],
    ['GATE PASS / BANK SHOT', `${s.gates ?? 0} / ${s.banks ?? 0}`],
    ['PERFECT CATCH', s.perfect],
    ['GREAT / GOOD', `${s.great} / ${s.good}`],
    ['CATCH MISS', s.miss],
  ];
}

/**
 * GAME_CLEAR:ボス撃破 → 余韻(8〜12 秒)→ リザルト。時間は Config.clear、セリフはボスごとの BossAffection.defeat
 *   ヒットストップ → ハート命中の演出 → バトル UI / BGM をフェードアウト → 撃破リアクション → 何も出さない間
 *   → 撃破セリフ → 最終表情 → 「HEART BREAK / 攻略完了」+ クリア SE →(HELL:ASMR UNLOCKED)→ 少し間 → リザルト
 *   表情は HEART 75%(照れ)から続けて、撃破リアクションで一瞬崩れ → 最後にデレ(100%)
 *   タップで早送り(skipAfter 秒以降):まだなら「攻略完了」まで進める → もう一度でリザルト
 */
export class GameClearState {
  constructor(g) { this.g = g; }
  enter() {
    const g = this.g, C = Config.clear;
    this.hell = g.difficulty === 'HELL';
    const D = g.affection.data?.defeat ?? {};
    this.lines = { ...D, ...(this.hell ? D.hell ?? {} : {}) };
    this.lines.line ??= g.affection.data?.loveMax?.line ?? null;
    this.beats = [
      [0, () => this.impact()],
      [C.uiFadeAt, () => { document.getElementById('ui')?.classList.add('afterglow'); g.audio.stopBgm(C.bgmFadeSec); }],
      [C.reactionAt, () => this.reaction()],
      [C.reactionAt + C.reactionSec, () => g.affection.hideLine()],
      [C.lineAt, () => { if (this.lines.line) g.affection.showTalk(this.lines.line, { big: this.hell }); }],
      [C.finalAt, () => this.finalFace()],
      [C.completeAt, () => { g.affection.hideTalk(); g.ui.showClearBanner?.('complete', { hell: this.hell }); g.audio.clear(); }],
      ...(this.hell ? [[C.asmrAt, () => this.asmr()]] : []),
      [this.hell ? C.hellResultAt : C.resultAt, () => this.toResult()],
    ];
    this.next = 0;
    this.t0 = performance.now();   // 演出は実時間(フレームレートに左右されない)
    this.skip = 0;
    this.elapsed = 0;
    this.shower = 0;
    this.shown = false;
    this.complete = false;
  }
  impact() {
    const g = this.g, head = g.boss.partCenter('head');
    g.setTimeScale(1);
    g.fever.abort();
    g.space.clear();
    g.energy?.clear();
    g.ball.hide();
    g.catchTarget.hide();
    g.affection.hideLine();
    g.hitstop(Config.clear.hitstopSec);
    g.cam.shake(1);
    g.ui.flash('#ffffff', 0.9);
    g.effects.heartBurst(head, 40, 12, 1.4);
    g.effects.shockwave?.(head, '#ff5fa2', 3.2, g.cam.camera);
    g.boss.view.playHit?.('head', 1.6);
    g.cam.focusOn(head, 12);
    g.audio.heart?.(1, true);
    // 表情は 75%(照れ)のまま余韻へ(最終表情 = デレは撃破セリフの後)
    const A = g.affection, i75 = A.data.stages.findIndex((st) => st.min >= 75);
    if (i75 >= 0) { A.stageIndex = i75; A.tempExpr = null; A.applyStage(A.stage); }
  }
  reaction() {
    const g = this.g;
    g.affection.flashExpr('flustered', 1.2);   // 75% の照れから一瞬崩れる → 照れに戻る
    g.boss.view.playHit?.('chest', 1.2);
    g.cam.shake(0.4);
    if (this.lines.reaction) g.affection.showLine(this.lines.reaction);
  }
  finalFace() {
    const g = this.g;
    g.affection.hideLine();
    g.affection.stageIndex = g.affection.data.stages.length - 1;
    g.affection.tempExpr = null;
    g.affection.applyStage(g.affection.stage);   // 最終表情(デレ)
    g.effects.heartBurst(g.boss.partCenter('head'), 20, 6, 1.4);
    this.showering = true;
  }
  asmr() {
    const g = this.g, h = heroineByStage(g.stage?.id), v = h?.rewardVoices?.HELL ?? null;
    g.ui.showClearBanner?.('asmr', { title: v?.title ?? `${g.stage?.boss?.name ?? ''} HELL ASMR`, ready: !!v?.src });
    g.audio.loveMax?.();
  }
  toResult() {
    if (this.shown) return;
    const g = this.g;
    this.shown = true;
    g.affection.hideTalk();
    g.ui.showClearBanner?.(null);
    document.getElementById('ui')?.classList.remove('afterglow');
    g.cam.reset();
    g.onStageClear(resultStats(g));
  }
  update(dt) {
    this.elapsed = (performance.now() - this.t0) / 1000 + this.skip;
    while (this.next < this.beats.length && this.elapsed >= this.beats[this.next][0]) this.beats[this.next++][1]();
    if (this.showering && !this.shown) {
      this.shower -= dt;
      if (this.shower <= 0) { this.shower = 0.16; const g = this.g; g.effects.heartBurst(g.boss.partCenter(['head', 'chest', 'stomach'][Math.floor(Math.random() * 3)]), 10, 7, 1.2); }
    }
  }
  /** タップで早送り:「攻略完了」まで → もう一度でリザルト */
  onTap() {
    if (this.shown || this.elapsed < Config.clear.skipAfter) return;
    const C = Config.clear, to = this.elapsed < C.completeAt ? C.completeAt : this.hell && this.elapsed < C.asmrAt ? C.asmrAt : Infinity;
    if (to === Infinity) return this.toResult();
    this.skip += to - this.elapsed;
  }
  exit() {
    document.getElementById('ui')?.classList.remove('afterglow');
    this.g.ui.showClearBanner?.(null);
  }
}

export class GameOverState {
  constructor(g) { this.g = g; }
  enter() {
    this.g.fever.abort();
    this.g.affection.hideTalk();
    this.g.catchTarget.hide();
    this.g.ui.showJudge('TRY AGAIN', 'miss', '#ff9ccc');
    this.wait = 1.4; this.shown = false;
  }
  update(dt) {
    this.wait -= dt;
    if (this.wait <= 0 && !this.shown) { this.shown = true; const growth = this.g.onStageDefeat(); this.g.router.go('over', { stage: this.g.stage, stats: resultStats(this.g), growth }); }
  }
}
