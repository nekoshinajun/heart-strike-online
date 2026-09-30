import { GameState } from '../core/StateMachine.js';
import { Config, catchWin } from '../core/Config.js';
import { Judge } from '../catch/CatchJudge.js';
import { DefenseCalculator, BattleTuning } from '../data/BattleCalc.js';

const JUDGE_COLOR = { PERFECT: '#ffd23e', GREAT: '#3ee8ff', GOOD: '#9dff7a', MISS: '#ff3d5a' };

/** NEXT_PLAYER:手番交代(リレー) */
export class NextPlayerState {
  constructor(g) { this.g = g; }
  enter({ label = 'NEXT', direct = false } = {}) {
    const g = this.g;
    this.direct = direct;   // 会話イベント後:返球・キャッチを挟まず、次の手番へ直接ボールを渡す
    g.energy.endThrow();
    g.energy.clear();
    g.space.clear();
    g.ball.setSpecial(false);
    const p = g.turn.advance();
    g.applyCharacter(p);   // 手番キャラの ATK/DEF/属性/タイプに切替
    g.ui.setPlayers(g.turn.players, g.turn.index);
    g.ui.showTurn(p, label);
    g.cam.setPlayerX(p.x);
    g.boss.lookAtPlayer(p.x);
    g.ball.setStyle(p.color, g.turn.tierLevel);
    this.wait = 0.28;
  }
  update(dt) {
    this.wait -= dt;
    if (this.wait > 0) return;
    if (this.direct) { this.g.ball.hold(this.g.player.holdAnchor); this.g.sm.change(GameState.PLAYER_ATTACK); return; }
    this.g.sm.change(GameState.BOSS_RETURN);
  }
}

/**
 * BOSS_RETURN:攻撃モーション無し。返球地点を決めてマーカーを出し、短い「溜め」の後にボス付近から発射。
 */
export class BossReturnState {
  constructor(g) { this.g = g; }
  enter() {
    const g = this.g;
    // 自分のキャッチフェーズへ入る直前に、事前予告テロップを消す。
    if (g.online) { g.ui.hideCatchNotice?.(); g.online.beginAllCatch?.(); }
    g.cam.reset();
    const forcedCatch = g.online ? g.online.catchPos : null;
    const plan = g.returnBall.plan(g.turn.rally, forcedCatch, g.online?.fieldSeed);
    this.plan = plan;
    this.wait = plan.chargeTime;
    this.chargeFx = 0;
    // 到達時刻は計画時点で確定 → マーカーはすぐ出して「どこへ来るか」を先に見せる
    plan.arrival = g.clock + plan.chargeTime + plan.duration;
    g.catchJudge.begin(plan.arrival, plan.markerLead);
    g.catchTarget.show(plan.markerWorld, g.turn.current.color);
    g.ui.showPrompt('catch', g.turn.current.color);
    g.boss.view.playCharge();
    g.ball.hide();
  }
  update(dt) {
    const g = this.g;
    const p = this.plan;
    g.catchTarget.update(g.catchJudge.ringProgress(g.clock));
    // 溜めエフェクト
    this.chargeFx -= dt;
    if (this.chargeFx <= 0) { this.chargeFx = 0.07; g.effects.burst(p.spawn, '#ff5fa2', 4, 3, 0.6); }
    this.wait -= dt;
    if (this.wait > 0) return;
    g.ball.returnTo(p.spawn, p.world, p.lateEnd, p.duration, catchWin('goodTime') + 0.02, p.ctrlOffset);
    g.effects.burst(p.spawn, '#ff3d7f', 20, 10, 0.8);
    g.effects.shockwave(p.spawn, '#ff5fa2', 2.5, g.cam.camera);
    g.cam.shake(0.2);
    g.audio.bossSwing();
    g.sm.change(GameState.PLAYER_DEFENSE, p);
  }
}

/** PLAYER_DEFENSE:マーカー位置 + タイミングでキャッチ */
export class PlayerDefenseState {
  constructor(g) { this.g = g; }

  enter(plan) {
    this.plan = plan;
    this.arrival = plan.arrival;
    this.result = null;
    this.impacted = false;
    this.lastBeep = 99;
  }

  onTap(e) {
    const g = this.g;
    if (g.online && g.online.isDown()) return;
    if (this.result) return;
    const target = g.catchTarget.screen();
    const tap = e.x != null ? { x: e.x, y: e.y } : null;
    const short = Math.min(g.viewport.w, g.viewport.h);
    // pointer event の timeStamp はブラウザ/端末で基準が異なることがある。
    // CatchJudge の arrival は g.clock 基準なので、入力判定も同じ g.clock を使う。
    const r = g.catchJudge.input(g.clock, tap, target, short);
    if (!r) return;
    if (tap) g.ui.tapRipple(tap.x, tap.y, JUDGE_COLOR[r]);
    this.decide(r);
  }

  decide(r) {
    const g = this.g;
    this.result = r;
    if (g.online) g.ui.hideCatchNotice();
    if (g.online && !g.online.isDown()) { const d=g.catchJudge.detail; g.online.sendCatch((d?.dt ?? 1) * 1000, r); }
    g.ui.showJudge(r, r.toLowerCase(), JUDGE_COLOR[r], g.catchJudge.describe());
    g.audio.judge(r);
    g.stats[r.toLowerCase()]++;
    g.fever.onCatch(r);   // FEVER ゲージ(FEVER 中は PERFECT で LEVEL UP)
    if (r === Judge.PERFECT) g.setTimeScale(0.2); // 到達までスローモーション
    if (r !== Judge.MISS && g.clock >= this.arrival) this.impact();
  }

  update() {
    const g = this.g;
    const now = g.clock;
    const judge = g.catchJudge;
    const prog = judge.ringProgress(now);
    if (!this.impacted) g.catchTarget.update(prog);

    // 接近ビープ(3回)
    const beepIdx = Math.ceil(prog * 3);
    if (prog > 0 && prog <= 1 && beepIdx < this.lastBeep) { this.lastBeep = beepIdx; g.audio.incoming(); }
    if (prog > 0 && prog < 0.5) g.cam.kickFov((0.5 - prog) * 5);

    if (this.impacted) return;
    const timeout = judge.checkTimeout(now);
    if (timeout) { if (g.online && g.online.isDown()) return; this.decide(timeout); this.impact(); return; }
    if (this.result && this.result !== Judge.MISS && now >= this.arrival) this.impact();
    if (this.result === Judge.MISS && now >= judge.lateLimit) this.impact();
  }

  impact() {
    const g = this.g;
    if (this.impacted) return;
    this.impacted = true;
    g.setTimeScale(1);
    const r = this.result;
    g.catchTarget.flash(r !== Judge.MISS);
    setTimeout(() => g.catchTarget.hide(), 180);
    const p = g.turn.current;
    const pos = g.ball.pos.clone();
    // Defense:判定ごとのペナルティを DEF で軽減(DefenseCalculator は差し替え可能)
    // 難易度:PERFECT は常に 0。GREAT / GOOD / MISS の被ダメージだけ DifficultyData.damageTaken 倍
    const dmg = Math.round(DefenseCalculator.penalty(r, this.plan.power, p.chara?.def ?? BattleTuning.defBase) * (g.cfg.battle?.bossAttackMul ?? 1) * (g.cfg.runtime?.damageTaken ?? 1));

    if (r !== Judge.MISS) g.ui.tutorialDone('catch');
    if (r === Judge.PERFECT) {
      g.hitstop(0.2);
      g.cam.shake(0.45);
      g.cam.kickFov(-6);
      g.ui.flash('#fff6c8', 0.55);
      g.effects.burst(pos, '#ffd23e', 40, 9, 0.35);
      g.effects.burst(pos, p.color, 24, 6, 0.3);
      g.effects.shockwave(pos, '#ffd23e', 1.4, g.cam.camera);
      g.audio.catchBall();
    } else if (r === Judge.GREAT || r === Judge.GOOD) {
      g.hitstop(0.08);
      g.cam.shake(r === Judge.GREAT ? 0.3 : 0.4);
      g.ui.flash('#ffffff', 0.25);
      g.effects.burst(pos, p.color, 20, 6, 0.3);
      g.audio.catchBall();
    } else {
      g.hitstop(0.1);
      g.cam.shake(0.85);
      g.ui.flash('#ff2040', 0.55);
      g.turn.resetRally();
    }

    if (dmg > 0) {
      g.turn.damageCurrent(dmg);
      g.ui.hitPlayer(g.turn.index);
      g.ui.setPlayers(g.turn.players, g.turn.index);
      const s = g.player.toScreen(pos);
      g.ui.damageNumber(s.x, s.y + 40, `-${dmg}`, { color: '#ff5a6e', label: p.id });
    }

    if (g.turn.allDown) { g.ball.hide(); g.sm.change(GameState.GAME_OVER); return; }
    if (p.hp <= 0) {
      g.ui.showJudge(`${p.id} DOWN`, 'miss', '#ff3d5a');
      if (g.online && g.online.isMyTurn()) g.online.sendDown();
      g.ball.hide();
      g.sm.change(GameState.PLAYER_CATCH, { down: true });
      return;
    }
    g.sm.change(GameState.PLAYER_CATCH, { judge: r });
  }

  exit() {
    this.g.ui.hideCatchNotice?.();
    this.g.ui.showPrompt(null);
    this.g.catchJudge.reset();
  }
}

/** PLAYER_CATCH:キャッチしたボールを画面下の投球位置へ移動 */
export class PlayerCatchState {
  constructor(g) { this.g = g; }
  enter({ judge, down } = {}) {
    const g = this.g;
    this.down = down;
    this.wait = down ? 0.9 : (judge === Judge.MISS ? 0.45 : 0.18);
    if (!down) g.ball.catchTo(g.player.holdAnchor, judge === Judge.MISS ? 0.4 : 0.24);
    g.cam.reset();
  }
  update(dt) {
    this.wait -= dt;
    if (this.wait > 0) return;
    const g = this.g;
    if (this.down) { if (g.online) { if (g.online.catchRoundDone) g.online.finishCatchRound({ nextPlayerId:g.online.room?.players?.[g.online.room.currentIndex]?.id }); else this.wait=0.05; return; } g.sm.change(GameState.NEXT_PLAYER, { direct: true, label: 'NEXT' }); return; }
    // マルチは全員のキャッチ完了を待ってから、サーバーが次の投球者へ進める。
    if (g.online) { if (g.online.catchRoundDone) g.online.finishCatchRound({ nextPlayerId:g.online.room?.players?.[g.online.room.currentIndex]?.id }); else this.wait=0.05; return; }
    // FEVER ゲージ 100%:キャッチした人(この後投げる人)から FEVER 開始
    g.sm.change(g.fever.pendingStart && !g.fever.active ? GameState.FEVER_INTRO : GameState.PLAYER_ATTACK);
  }
}
