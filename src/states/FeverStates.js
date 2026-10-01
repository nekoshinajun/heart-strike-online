import { GameState } from '../core/StateMachine.js';
import { Config } from '../core/Config.js';

/**
 * FEVER_INTRO:キャッチ後、ゲージ 100% なら投球前に挟む(0.5〜1.0秒)。
 *   スロー → ハートが中央へ集まる → 「♡ FEVER TIME! ♡」→ フラッシュ → PLAYER_ATTACK(FEVER 配置の Energy)
 */
export class FeverIntroState {
  constructor(g) { this.g = g; }
  enter() {
    const g = this.g;
    g.fever.start(g.turn.index, g.turn.aliveIndexes.length);   // このフェーズの全員(生存者の人数分)の投球が FEVER
    g.setTimeScale(Config.fever.slowMotionScale);
    g.audio.loveMax();
    g.cam.kickFov(6);
    this.done = false;
    g.fever.playIntro(() => this.finish());
  }
  finish() {
    const g = this.g;
    if (this.done || g.sm.current !== this) return;
    this.done = true;
    g.setTimeScale(1);
    g.ui.flash('#ffd0ea', 0.5);
    g.sm.change(GameState.PLAYER_ATTACK);
  }
  exit() { this.g.setTimeScale(1); }
}

/**
 * FEVER_OUTRO:4人分の FEVER 投球の後(0.3〜0.6秒)。
 *   ハートがボスへ吸い込まれる → 「FEVER FINISH!」→ 通常へ(ゲージ 0)→ ボスの反撃(フェーズの最後)
 */
export class FeverOutroState {
  constructor(g) { this.g = g; }
  enter() {
    const g = this.g;
    this.done = false;
    g.fever.finishing = true;
    g.effects.heartBurst(g.boss.partCenter('chest'), 30, 6, 0.9);
    g.fever.playOutro(() => this.finish());
  }
  finish() {
    const g = this.g;
    if (this.done || g.sm.current !== this) return;
    this.done = true;
    g.fever.finish();
    g.afterThrow();
  }
}
