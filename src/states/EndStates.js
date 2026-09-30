import { GameState } from '../core/StateMachine.js';

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
    ['INTEREST', g.affection.interestLabel],
    ['MAX RALLY', g.turn.maxRally],
    ['LOVE MAX', `${g.boss.parts.maxCount} / ${g.boss.parts.list.length}`],
    ['HEART ENERGY', s.orbs ?? 0],
    ['FEVER', s.fevers ?? 0],
    ['GATE PASS / BANK SHOT', `${s.gates ?? 0} / ${s.banks ?? 0}`],
    ['PERFECT CATCH', s.perfect],
    ['GREAT / GOOD', `${s.great} / ${s.good}`],
    ['CATCH MISS', s.miss],
  ];
}

export class GameClearState {
  constructor(g) { this.g = g; }
  enter() {
    const g = this.g;
    g.fever.abort();
    g.space.clear();
    g.ball.hide();
    g.cam.shake(1);
    g.ui.flash('#ffffff', 0.9);
    // LOVE MAX ♡:完全にデレた表情 + セリフ + ハートとキラキラ → 数秒後にリザルト
    g.affection.onLoveMax();
    g.cam.focusOn(g.boss.partCenter('head'), 12);
    g.ui.showLoveMax();
    this.shower = 0;
    g.audio.clear();
    this.wait = 3.6;
    this.elapsed = 0;
    this.shown = false;
  }
  update(dt) {
    this.wait -= dt;
    // ハートがあふれる
    this.shower -= dt;
    if (this.shower <= 0 && this.wait > -1) {
      this.shower = 0.12;
      const g = this.g;
      const c = g.boss.partCenter(['head', 'chest', 'stomach'][Math.floor(Math.random() * 3)]);
      g.effects.heartBurst(c, 14, 9, 1.2);
    }
    this.elapsed = (this.elapsed ?? 0) + dt;
    if (this.wait <= 0 && !this.shown) { this.shown = true; this.g.affection.hideTalk(); this.g.ui.showLoveMax(false); this.g.cam.reset(); this.g.onStageClear(resultStats(this.g)); }
  }
  /** LOVE MAX 演出はタップ / Enter で早送りできる(1.2 秒以降) */
  onTap() { if (!this.shown && this.elapsed > 1.2) this.wait = Math.min(this.wait, 0); }
}

export class GameOverState {
  constructor(g) { this.g = g; }
  enter() {
    this.g.fever.abort();
    this.g.affection.hideTalk();
    this.g.affection.showAnswerHint(false);
    this.g.catchTarget.hide();
    this.g.ui.showJudge('TRY AGAIN', 'miss', '#ff9ccc');
    this.wait = 1.4; this.shown = false;
  }
  update(dt) {
    this.wait -= dt;
    if (this.wait <= 0 && !this.shown) { this.shown = true; this.g.router.go('over', { stage: this.g.stage, stats: resultStats(this.g) }); }
  }
}
