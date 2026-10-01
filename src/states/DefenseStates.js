import { GameState } from '../core/StateMachine.js';
import { Config, catchWin } from '../core/Config.js';
import { Judge } from '../catch/CatchJudge.js';
import { DefenseCalculator, BattleTuning } from '../data/BattleCalc.js';

const JUDGE_COLOR = { PERFECT: '#ffd23e', GREAT: '#3ee8ff', GOOD: '#9dff7a', MISS: '#ff3d5a' };

/**
 * NEXT_PLAYER:手番交代(PLAYER ATTACK PHASE の中で次の味方へ / 新しいフェーズの先頭へ)。ボスの反撃はフェーズの最後に1回だけ
 *   to    … 次に投げる手番 index(省略時は今のまま)
 *   phase … 新しい PLAYER ATTACK PHASE(投げた人の記録をリセット。to が無ければ生存している先頭 = A 側から)
 */
export class NextPlayerState {
  constructor(g) { this.g = g; }
  enter({ label = 'NEXT', to = null, phase = false } = {}) {
    const g = this.g;
    this.phase = phase;
    g.energy.endThrow();
    g.energy.clear();
    g.space.clear();
    g.ball.setSpecial(false);
    let p;
    if (phase && to == null) p = g.turn.beginAttackPhase();
    else { if (phase) g.turn.thrown = new Set(); p = g.turn.setIndex(to ?? g.turn.index); }
    g.applyCharacter(p);   // 手番キャラの ATK/DEF/属性/タイプに切替
    g.ui.setPlayers(g.turn.players, g.turn.index);
    g.ui.showTurn(p, phase ? 'PLAYER ATTACK' : label);
    g.cam.setPlayerX(p.x);
    g.boss.lookAtPlayer(p.x);
    g.ball.setStyle(p.color, g.turn.tierLevel);
    this.wait = 0.28;
  }
  update(dt) {
    this.wait -= dt;
    if (this.wait > 0) return;
    const g = this.g;
    g.ball.hold(g.player.holdAnchor);
    // FEVER ゲージ 100%:新しいフェーズの最初の投球前に FEVER 突入(フェーズ全員の投球が FEVER)
    if (this.phase && !g.online && g.fever.pendingStart && !g.fever.active) { g.sm.change(GameState.FEVER_INTRO); return; }
    g.sm.change(GameState.PLAYER_ATTACK);
  }
}

/**
 * BOSS_TAUNT:全員が投げ終えた → ボスが喋る(攻撃ボイス)→ 一瞬の間 → BOSS_RETURN(まとめて反撃)
 *   1. カメラ・視線をボスへ寄せる / 「BOSS ATTACK」表示 / BGM を少し下げる
 *   2. 攻略対象データの attackVoices からランダムで1つ(前回と同じものは除外。MULTI はサーバーの乱数で全員同じボイス)
 *   3. 喋っている間はボスが声に合わせて揺れる。キャッチ判定(BOSS_RETURN)はボイスが終わるまで始めない
 *   4. ボイス終了 → voiceGapSec の間 → 攻撃
 *   ボイスが無い・読み込めない・タップ前で音が出せない時は、noVoicePauseSec の間だけ置いて攻撃(進行は止めない)
 */
export class BossTauntState {
  constructor(g) { this.g = g; }
  enter() {
    const g = this.g, B = Config.battle;
    g.energy.endThrow();
    g.energy.clear();
    g.space.clear();
    g.ball.setSpecial(false);
    g.ball.hide();
    g.boss.lookAtPlayer(0);
    g.cam.focusOn(g.boss.partCenter('head'), 8);
    g.ui.showTurn({ color: '#ff3f8f', name: g.stage?.boss.name ?? '' }, 'BOSS ATTACK');
    this.done = false;
    this.speaking = false;
    this.lastLevel = 0;
    const now = performance.now();
    this.endAt = now + (B.noVoicePauseSec ?? 0.9) * 1000;   // ボイス無しの時の間(ボイスが始まったら置き換える)
    this.loadLimit = now + (B.voiceLoadWaitSec ?? 1.2) * 1000;
    const voice = g.pickAttackVoice(g.online ? g.online.voiceRoll : null);
    this.voice = voice;
    this.waitingVoice = !!voice && !!g.audio.ctx;
    if (!this.waitingVoice) return;
    const token = (this.token = (this.token ?? 0) + 1);
    g.audio.duckBgm(B.voiceBgmDuck ?? 0.45, 0.2);
    if (voice.text) g.affection.showLine(voice.text);   // 字幕(データに書いた時だけ)
    g.audio.voice.play(voice.src).then((dur) => {
      if (token !== this.token || g.sm.current !== this || !this.waitingVoice) { if (token === this.token && dur) g.audio.voice.stop(); return; }
      this.waitingVoice = false;
      if (!dur) { this.endAt = performance.now() + (B.noVoicePauseSec ?? 0.9) * 1000; g.audio.duckBgm(1, 0.3); return; }
      this.speaking = true;
      this.speakEnd = performance.now() + dur * 1000;
      this.endAt = this.speakEnd + (B.voiceGapSec ?? 0.35) * 1000;
    });
  }
  update() {
    const g = this.g, now = performance.now();
    if (this.done) return;
    if (this.waitingVoice) {
      if (now < this.loadLimit) return;
      this.waitingVoice = false;                 // 読み込みが間に合わない:ボイス無しで進める(後から鳴らさない)
      g.audio.voice.stop();
      g.audio.duckBgm(1, 0.3);
      this.endAt = now + (Config.battle.noVoicePauseSec ?? 0.9) * 1000;
      return;
    }
    if (this.speaking) {
      // 声に合わせてボスが揺れる(音の立ち上がりで小さく弾む)
      const lv = g.audio.voice.level();
      if (lv > 0.18 && this.lastLevel <= 0.18) g.boss.view.playSpeak?.(lv);
      this.lastLevel = lv;
      if (now >= this.speakEnd) { this.speaking = false; g.audio.duckBgm(1, 0.4); g.boss.view.playCharge(); }
      return;
    }
    if (now < this.endAt) return;
    this.done = true;
    this.g.sm.change(GameState.BOSS_RETURN);
  }
  exit() {
    // リトライ・離脱・ゲームオーバー等でこのステートを抜けたら、ボイスを残さない
    this.token = (this.token ?? 0) + 1;
    this.waitingVoice = false;
    if (this.speaking || this.g.audio.voice.playing) this.g.audio.voice.stop();
    this.speaking = false;
    this.g.audio.duckBgm(1, 0.3);
    if (this.voice?.text) this.g.affection.hideLine();
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
    if (g.online) { g.ui.hideCatchNotice?.(); g.online.beginAllCatch?.(); g.ui.showJudge('CATCH!', 'tier', g.turn.current.color); }
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
    if (g.online && !g.online.isDown()) { const d=g.catchJudge.detail; const p=g.turn.current; const damage=Math.round(DefenseCalculator.penalty(r, this.plan.power, p.chara?.def ?? BattleTuning.defBase) * (g.cfg.battle?.bossAttackMul ?? 1) * (g.cfg.runtime?.damageTaken ?? 1)); g.online.sendCatch((d?.dt ?? 1) * 1000, r, damage); }
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
    const damageFor = (pl) => Math.round(DefenseCalculator.penalty(r, this.plan.power, pl.chara?.def ?? BattleTuning.defBase) * (g.cfg.battle?.bossAttackMul ?? 1) * (g.cfg.runtime?.damageTaken ?? 1));

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

    // ボスの反撃は全員へ:SOLO は1回の判定を生存している全員に適用(ダメージは各自の DEF で個別)/ MULTI は自分のキャラだけ
    const targets = g.online ? [p] : g.turn.players.filter((pl) => pl.hp > 0);
    const s0 = g.player.toScreen(pos);
    const downs = [];
    targets.forEach((pl, k) => {
      const dmg = damageFor(pl);
      if (dmg <= 0) return;
      g.turn.damage(pl, dmg);
      const i = g.turn.players.indexOf(pl);
      g.ui.hitPlayer(i);
      g.ui.damageNumber(s0.x + (k - (targets.length - 1) / 2) * 46, s0.y + 40 + (k % 2) * 26, `-${dmg}`, { color: '#ff5a6e', label: pl.id });
      if (pl.hp <= 0) downs.push(pl);
    });
    g.ui.setPlayers(g.turn.players, g.turn.index);

    if (!g.online && g.turn.allDown) { g.ball.hide(); g.sm.change(GameState.GAME_OVER); return; }
    if (downs.length) {
      g.ui.showJudge(`${downs.map((d) => d.id).join('・')} DOWN`, 'miss', '#ff3d5a');
      // Online DOWN is finalized by the server from this player's CATCH result.
      if (g.online) { g.ball.hide(); g.sm.change(GameState.PLAYER_CATCH, { down: true }); return; }
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
    // マルチは全員のキャッチ完了を待ってから、サーバーが次のフェーズの先頭の投球者を決める
    if (g.online) { if (g.online.catchRoundDone) g.online.finishCatchRound({ nextPlayerId: g.online.room?.players?.[g.online.room.currentIndex]?.id }); else this.wait = 0.05; return; }
    // 次の PLAYER ATTACK PHASE(生存している A 側から。FEVER ゲージ 100% ならこのフェーズが FEVER)
    g.sm.change(GameState.NEXT_PLAYER, { phase: true });
  }
}
