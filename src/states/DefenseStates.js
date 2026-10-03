import { GameState } from '../core/StateMachine.js';
import { Config, catchWin } from '../core/Config.js';
import { Judge } from '../catch/CatchJudge.js';
import { nearest } from '../defence/NotePath.js';
import { DefenseCalculator } from '../data/BattleCalc.js';

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
    if (g.online) { g.ui.hideCatchNotice?.(); g.online.beginAllCatch?.(); g.ui.showJudge(g.online.isDown() ? 'WATCH' : 'CATCH!', 'tier', g.turn.current.color, g.online.isDown() ? g.online.spectateLabel() : ''); }
    g.cam.reset();
    const forcedCatch = g.online ? g.online.catchPos : null;
    // ★ = この戦闘でボスが攻撃した回数(1回目 ★1 … 5回目以降 ★5)。MULTI はサーバーの回数(全員同じ)
    g.bossAttacks = g.online && Number.isFinite(g.online.bossAttacks) ? g.online.bossAttacks : (g.bossAttacks ?? 0) + 1;
    const level = Math.min(Config.defence.maxLevel ?? 5, g.bossAttacks);
    const plan = g.returnBall.plan(g.turn.rally, forcedCatch, g.online?.fieldSeed, level);
    plan.level = level;
    g.ui.showAttackLevel?.(level);
    this.plan = plan;
    this.wait = plan.chargeTime;
    this.chargeFx = 0;
    // 到達時刻は計画時点で確定 → マーカーはすぐ出して「どこへ来るか」を先に見せる
    plan.arrival = g.clock + plan.chargeTime + plan.duration;
    // 連続攻撃(MULTI)は osu! のコンボ番号と同じく 1, 2, 3 … をサークルに付ける(1個だけの攻撃は付けない)
    (plan.notes ?? []).forEach((n, k, a) => { n.combo = a.length > 1 ? k + 1 : null; });
    g.catchJudge.begin(plan.arrival, plan.markerLead);
    g.catchTarget.show(plan.markerWorld, g.turn.current.color);
    g.catchTarget.setNote?.(plan.notes?.[0]);
    g.catchTarget.setNext?.(plan.notes?.[1]);
    g.ui.showPrompt(g.online?.isDown() ? null : promptFor(plan.notes?.[0]), g.turn.current.color);   // 観戦中は操作の説明を出さない
    g.boss.view.playCharge();
    g.ball.hide();
    // 攻撃の予備動作(tell):色の違う溜め + ボスが何度か溜め直す + 短い表示(FEINT など。必ず見切れるサイン)
    const tell = plan.attack?.tell;
    this.chargeColor = tell?.color ?? '#ff5fa2';
    this.tellKicks = tell ? Math.max(0, (tell.chargeKicks ?? 1) - 1) : 0;
    this.tellEvery = this.tellKicks ? plan.chargeTime / (this.tellKicks + 1) : 0;
    this.tellNext = this.tellEvery;
    if (tell?.label) { const s = g.player.toScreen(plan.spawn); g.ui.damageNumber(s.x, s.y - 30, tell.label, { color: tell.color, label: plan.attack.label }); }
  }
  update(dt) {
    const g = this.g;
    const p = this.plan;
    g.catchTarget.update(g.catchJudge.ringProgress(g.clock));
    // 溜めエフェクト
    this.chargeFx -= dt;
    if (this.chargeFx <= 0) { this.chargeFx = 0.07; g.effects.burst(p.spawn, this.chargeColor, 4, 3, 0.6); }
    this.wait -= dt;
    if (this.tellKicks > 0 && p.chargeTime - this.wait >= this.tellNext) { this.tellKicks--; this.tellNext += this.tellEvery; g.boss.view.playCharge(); g.effects.burst(p.spawn, this.chargeColor, 14, 6, 0.6); }
    if (this.wait > 0) return;
    g.ball.returnTo(p.spawn, p.world, p.lateEnd, p.duration, lateDurFor(p.notes?.[0]), p.ctrlOffset, p.motion);
    g.ball.setNoteLook?.(p.notes?.[0]?.type);
    g.effects.burst(p.spawn, '#ff3d7f', 20, 10, 0.8);
    g.effects.shockwave(p.spawn, '#ff5fa2', 2.5, g.cam.camera);
    g.cam.shake(0.2);
    g.audio.bossSwing();
    g.sm.change(GameState.PLAYER_DEFENSE, p);
  }
}

const ORDER = [Judge.PERFECT, Judge.GREAT, Judge.GOOD, Judge.MISS];
const worse = (a, b) => ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b))];
const promptFor = (n) => (n?.type === 'HOLD' ? 'catchHold' : n?.type === 'FLICK' ? 'catchFlick' : 'catch');
/** 到達後に遅れて判定できる時間(HOLD は押し始めの判定のあと押し続けるので同じ)*/
function lateDurFor() { return catchWin('goodTime') + 0.02; }

/**
 * PLAYER_DEFENSE:ボスの攻撃を捌く。1回の攻撃 = 1個以上のハート(notes)。ハートごとに操作と判定
 *   NORMAL … 到達でタップ(位置 + タイミング。既存の CatchJudge)
 *   HOLD   … 到達で押し始め(位置 + タイミング)→ hold 秒押し続けて離す(離すタイミングも判定)。悪い方
 *   FLICK  … osu! のスライダー:開始のサークルで押す(位置 + タイミング)→ トラックを進むハート(ボール)に指でついていく → 終点で離す(離すタイミングも判定)
 *            軌道から大きく外れる / 終点まで運ばずに離す / タップだけ は MISS。軌道は NotePath(直線。将来カーブも)
 *   MULTI  … 1個ずつ順に飛んでくる(1個の判定が終わったら次が発射)
 * ダメージは全部のハートの判定が終わってから1回だけ(各ハート:判定のペナルティ × 1/個数 × multi.damageMul)。PERFECT は 0
 */
export class PlayerDefenseState {
  constructor(g) { this.g = g; }

  enter(plan) {
    this.plan = plan;
    this.notes = plan.notes?.length ? plan.notes : [{ type: 'NORMAL' }];
    this.idx = 0;
    this.grades = [];
    this.result = null;
    this.impacted = false;
    this.noteImpacted = -1;   // ステートは使い回されるので、前の攻撃の値を残さない
    this.pendingNote = null;
    this.beginNote(0, plan.arrival);
  }

  get note() { return this.notes[this.idx]; }

  /** MULTI で自分のキャラが全員 DOWN:操作できないので、ハートは届いた所で自動で進める(観戦)*/
  get spectating() { return !!this.g.online?.isDown(); }

  /** 観戦:ハートが届いた → HOLD はメーター / FLICK はスライダーボールを最後まで動かす(判定はしない)*/
  ghostStart() {
    const g = this.g, n = this.note;
    this.ghost = true;
    if (n.type === 'HOLD') { this.noteState = 'holding'; this.holdEnd = this.arrival + (n.hold ?? Config.defence.hold.sec); g.catchTarget.setHold?.(0, 'holding'); return; }
    if (n.type === 'FLICK') {
      this.noteState = 'sliding';
      this.slideEnd = this.arrival + (n.slideSec ?? Config.defence.flick.slideSec);
      this.slide = { consumed: 0, guide: 0, finger: null, reached: false, fail: false };
      g.catchTarget.setSlide?.(this.slide);
      return;
    }
    this.ghostFinish();
  }

  /** 観戦:1個のハートが終わった → 次のハートへ / 全部終わったら他の人のキャッチを待つ(ダメージ・判定・送信なし)*/
  ghostFinish() {
    const g = this.g;
    this.noteState = 'done';
    this.ghost = false;
    this.noteImpacted = this.idx;
    g.catchTarget.setHold?.(null);
    g.catchTarget.setSlide?.(null);
    g.ball.setPressed?.(0);
    g.catchTarget.flash(true);
    g.effects.burst(g.ball.pos.clone(), g.turn.current.color, 12, 5, 0.3);
    g.ball.hide();
    if (this.idx < this.notes.length - 1) {
      this.idx++;
      this.nextAt = g.clock + (Config.defence.multi.gap ?? 0.1);
      this.pendingNote = this.note;
      return;
    }
    this.impacted = true;
    const ct = g.catchTarget, shown = ct.world;
    setTimeout(() => { if (ct.world === shown) ct.hide(); }, 180);
    g.sm.change(GameState.PLAYER_CATCH, { down: true });
  }

  /** k 番目のハートの判定を始める(1個目は BOSS_RETURN で発射済み)*/
  beginNote(k, arrival) {
    const g = this.g, n = this.notes[k];
    this.arrival = arrival;
    this.noteState = 'wait';
    this.ghost = false;
    this.noteGrade = null;
    this.slide = null;
    this.fxKeep = false;
    g.ball.setPressed?.(0);
    g.catchTarget.setNext?.(this.notes[k + 1]);
    this.events = (n.motion?.events ?? []).map((e) => ({ ...e }));
    if (k > 0) {
      g.catchJudge.begin(arrival, n.markerLead ?? Math.min(0.9, n.duration * 0.9));
      g.catchTarget.show(n.markerWorld, g.turn.current.color);
      g.catchTarget.setNote?.(n);
      g.ui.showPrompt(this.spectating ? null : promptFor(n), g.turn.current.color);
      g.ball.returnTo(g.boss.spawnPoint(), n.world, n.lateEnd, n.duration, lateDurFor(n), null, n.motion);
      g.ball.setNoteLook?.(n.type);
      g.effects.burst(g.boss.spawnPoint(), '#ff3d7f', 10, 8, 0.6);
      g.audio.bossSwing?.();
    }
  }

  onTap(e) {
    const g = this.g;
    if (g.online && g.online.isDown()) return;
    if (this.result || this.noteState !== 'wait') return;
    const n = this.note, target = g.catchTarget.screen();
    const tap = e.x != null ? { x: e.x, y: e.y } : null;
    const short = Math.min(g.viewport.w, g.viewport.h);
    // pointer event の timeStamp は端末で基準が違うことがあるので、判定は g.clock で(既存どおり)
    const r = g.catchJudge.input(g.clock, tap, target, short);
    if (!r) return;
    if (tap) g.ui.tapRipple(tap.x, tap.y, JUDGE_COLOR[r]);
    if (n.type === 'HOLD' && r !== Judge.MISS) {
      this.noteState = 'holding';
      this.startGrade = r;
      this.holdEnd = this.arrival + (n.hold ?? Config.defence.hold.sec);
      g.catchTarget.setHold?.(0, 'holding');
      return;
    }
    if (n.type === 'FLICK' && r !== Judge.MISS) {
      // 開始地点を押せた → 指を離さず終点まで運ぶ(ガイドは slideSec で終点へ)
      this.noteState = 'sliding';
      this.startGrade = r;
      this.slideEnd = Math.max(g.clock, this.arrival) + (n.slideSec ?? Config.defence.flick.slideSec);
      this.slide = { consumed: 0, guide: 0, finger: tap, reached: false, fail: false };
      g.catchTarget.setSlide?.(this.slide);
      return;
    }
    this.finishNote(r, g.catchJudge.describe());
  }

  /** FLICK(スライド)中:指の位置 → 軌道の進み。軌道から大きく外れたら MISS */
  onDrag(e) {
    if (this.result || this.noteState !== 'sliding' || !e?.current) return;
    this.follow({ x: e.current.x, y: e.current.y });
  }

  follow(p) {
    const g = this.g, F = Config.defence.flick, short = Math.min(g.viewport.w, g.viewport.h);
    const poly = g.catchTarget.pathPoly?.(this.note);
    if (!poly) return;
    const nr = nearest(poly, p), end = poly[poly.length - 1];
    const sl = this.slide;
    sl.finger = p;
    if (nr.dist > (F.tol ?? 0.13) * short) { this.failSlide('軌道から外れた'); return; }
    sl.consumed = Math.max(sl.consumed, nr.t);
    sl.reached = sl.reached || Math.hypot(p.x - end.x, p.y - end.y) <= (F.endRadius ?? 0.075) * short;
    if (sl.reached) sl.consumed = 1;
  }

  failSlide(why) {
    this.slide.fail = true;
    this.g.catchTarget.setSlide?.(this.slide);
    this.fxKeep = true;
    this.finishNote(Judge.MISS, why);
  }

  /** 離した:HOLD は終わりのタイミング / FLICK は終点まで運べたか + 終点で離したタイミング */
  onRelease() {
    const g = this.g, n = this.note;
    if (this.result) return;
    if (this.noteState === 'holding') {
      const D = Config.defence.hold, dt = g.clock - this.holdEnd;
      const rg = endGrade(dt, D.releaseWindowMul ?? 2);
      const early = rg === Judge.MISS && dt < 0;
      if (early) { g.catchTarget.setHold?.(1 - (this.holdEnd - g.clock) / (n.hold ?? D.sec), 'early'); this.fxKeep = true; }   // 残り時間を赤で見せる
      this.finishNote(worse(this.startGrade, rg), rg === Judge.MISS ? (dt < 0 ? '離すのが早い' : '離すのが遅い') : '');
      return;
    }
    if (this.noteState === 'sliding') {
      if (!this.slide.reached) { this.failSlide('終点まで運んでいない'); return; }
      const rg = endGrade(g.clock - this.slideEnd, Config.defence.flick.endWindowMul ?? 3);
      this.fxKeep = true;
      g.catchTarget.setSlide?.(this.slide);
      this.finishNote(worse(this.startGrade, rg), rg === Judge.MISS ? (g.clock < this.slideEnd ? '運ぶのが早い' : '離すのが遅い') : '');
    }
  }

  /** キーボード(開発用):Space を離す = HOLD を離す */
  onKeyRelease() { if (this.noteState === 'holding') this.onRelease(null); }

  /** 1個のハートの判定が決まった */
  finishNote(r, why = '') {
    const g = this.g;
    this.noteGrade = r;
    this.noteState = 'done';
    this.noteWhy = why;
    g.catchJudge.result = r;
    if (!this.fxKeep) { g.catchTarget.setHold?.(null); g.catchTarget.setSlide?.(null); }
    g.ball.setPressed?.(0);
    const multi = this.notes.length > 1;
    g.ui.showJudge(r, r.toLowerCase(), JUDGE_COLOR[r], multi ? `${this.idx + 1} / ${this.notes.length}${why ? ` ・ ${why}` : ''}` : why);
    g.online?.sendNoteJudge?.(this.idx, this.notes.length, r);   // 観戦中の仲間に1個ずつの判定を見せる
    g.audio.judge(r);
    g.stats[r.toLowerCase()]++;
    g.fever.onCatch(r);   // FEVER 中の PERFECT で FEVER LEVEL UP(既存)
    if (r === Judge.PERFECT && !multi) g.setTimeScale(0.2); // 到達までスローモーション(1個の攻撃だけ)
    if (r === Judge.MISS || g.clock >= this.arrival || this.note.type !== 'NORMAL') this.noteImpact();
  }

  /** 1個のハートが届いた(キャッチ / MISS)→ 次のハートへ / 全部終わったらダメージ */
  noteImpact() {
    const g = this.g, r = this.noteGrade, pos = g.ball.pos.clone(), p = g.turn.current;
    if (this.noteImpacted === this.idx) return;
    this.noteImpacted = this.idx;
    g.setTimeScale(1);
    g.catchTarget.flash(r !== Judge.MISS);
    this.grades.push(r);
    if (r === Judge.PERFECT) { g.hitstop(this.notes.length > 1 ? 0.06 : 0.2); g.cam.shake(0.3); g.ui.flash('#fff6c8', 0.4); g.effects.burst(pos, '#ffd23e', 30, 8, 0.35); g.effects.shockwave(pos, '#ffd23e', 1.4, g.cam.camera); g.audio.catchBall(); }
    else if (r !== Judge.MISS) { g.hitstop(0.05); g.cam.shake(0.25); g.effects.burst(pos, p.color, 18, 6, 0.3); g.audio.catchBall(); }
    else { g.cam.shake(0.5); g.ui.flash('#ff2040', 0.35); }
    if (this.idx < this.notes.length - 1) {
      // 次のハート:少し間を置いて発射(MULTI)
      this.idx++;
      g.ball.hide();
      const n = this.note;
      this.nextAt = g.clock + (Config.defence.multi.gap ?? 0.1);
      this.pendingNote = n;
      return;
    }
    this.result = this.grades.reduce(worse, Judge.PERFECT);
    this.impact();
  }

  /** 攻撃の途中の変化(曲がり始めなど)の演出 */
  motionFx() {
    const g = this.g;
    if (!this.events?.length || g.ball.mode !== 'toPlayer') return;
    const t = g.ball.t;
    while (this.events.length && t >= this.events[0].t) {
      const e = this.events.shift(), pos = g.ball.pos.clone(), F = Config.enemyAttacks.fx?.[e.kind];
      if (!F) continue;
      g.effects.burst(pos, F.color, F.count ?? 14, F.speed ?? 6, F.life ?? 0.4);
      if (F.boost) g.ball.pulseBoost(F.boost);
    }
  }

  update() {
    const g = this.g;
    if (this.impacted) return;
    if (this.pendingNote) {
      if (g.clock < this.nextAt) return;
      const n = this.pendingNote; this.pendingNote = null;
      this.beginNote(this.idx, g.clock + n.duration);
      return;
    }
    this.motionFx();
    const now = g.clock, judge = g.catchJudge, prog = judge.ringProgress(now);
    if (this.noteState !== 'done') g.catchTarget.update(prog);
    if (prog > 0 && prog < 0.5) g.cam.kickFov((0.5 - prog) * 5);
    // タイミングを知らせるカウント音は鳴らさない(見た目だけで判断する)
    if (this.noteState === 'holding') {
      // メーターが中心から外の輪まで届く(100%)→ 光る = 離してよい(CSS:--hk = メーターの大きさ)
      const n = this.note, k = 1 - (this.holdEnd - now) / (n.hold ?? Config.defence.hold.sec);
      g.catchTarget.setHold?.(Math.max(0, Math.min(1, k)), k >= 1 ? 'ready' : 'holding');
      g.ball.pinAt?.(n.markerWorld ?? n.world);   // ハートはマーカーの中央に固定
      g.ball.setPressed?.(Math.max(0.2, Math.min(1, k)));
      if (this.ghost) { if (k >= 1) this.ghostFinish(); return; }
      const late = (Config.defence.hold.releaseWindowMul ?? 2) * catchWin('goodTime');
      if (now > this.holdEnd + late) this.finishNote(Judge.MISS, '離さなかった');
      return;
    }
    if (this.noteState === 'sliding') {
      const n = this.note, sl = this.slide;
      sl.guide = Math.max(0, Math.min(1, (now - (this.slideEnd - (n.slideSec ?? Config.defence.flick.slideSec))) / (n.slideSec ?? Config.defence.flick.slideSec)));
      g.catchTarget.setSlide?.(sl);
      // ハート = osu! のスライダーボール:指ではなく、理想の速さ(slideSec)でトラックを進む。指はそれについていく
      const b = g.catchTarget.pointOnPath?.(sl.guide, n);
      g.ball.pinAt?.(b ? g.player.screenToWorld(b.x, b.y, Config.ball.catchDepth) : n.markerWorld ?? n.world);
      if (this.ghost) { sl.consumed = sl.guide; sl.reached = sl.guide >= 1; if (sl.guide >= 1) this.ghostFinish(); return; }
      const late = (Config.defence.flick.endWindowMul ?? 3) * catchWin('goodTime');
      if (now > this.slideEnd + late) { if (sl.reached) { this.fxKeep = true; this.finishNote(Judge.MISS, '離すのが遅い'); } else this.failSlide('終点まで運んでいない'); }
      return;
    }
    if (this.noteState === 'done') { if (this.noteImpacted !== this.idx && now >= this.arrival) this.noteImpact(); return; }
    if (this.spectating && now >= this.arrival) { this.ghostStart(); return; }
    if (now > judge.lateLimit) { if (g.online && g.online.isDown()) return; this.finishNote(Judge.MISS, 'タップなし'); }
  }

  /** テスト / デバッグ:今のハートの判定を直接決める(1個だけの攻撃は全体が決まる)*/
  decide(r) { if (!this.result && this.noteState !== 'done') this.finishNote(r); }

  damageFor(pl, r) {
    const g = this.g;
    return Math.round(DefenseCalculator.penalty(r, this.plan.power, pl.chara) * (g.cfg.battle?.bossAttackMul ?? 1) * (g.cfg.runtime?.damageTaken ?? 1));
  }

  /** 全部のハートの合計ダメージ(各ハート:判定のペナルティ × 1/個数 × multi.damageMul。1個の攻撃は今までと同じ)*/
  totalDamageFor(pl) {
    const n = this.grades.length || 1, share = n > 1 ? (Config.defence.multi.damageMul ?? 1.5) / n : 1;
    return Math.round(this.grades.reduce((a, r) => a + this.damageFor(pl, r) * share, 0));
  }

  impact() {
    const g = this.g;
    if (this.impacted) return;
    this.impacted = true;
    g.setTimeScale(1);
    const r = this.result;
    // HOLD を早く離した / FLICK の結果は少し残して見せる。その間に次の攻撃のマーカーが出ていたら消さない
    const ct = g.catchTarget, shown = ct.world;
    setTimeout(() => { if (ct.world === shown) ct.hide(); }, this.fxKeep ? 650 : 180);
    if (r !== Judge.MISS) g.ui.tutorialDone('catch');
    if (this.grades.some((x) => x === Judge.MISS)) g.turn.resetRally();
    if (this.notes.length > 1) g.ui.showJudge(r === Judge.PERFECT ? 'ALL PERFECT!' : `${this.grades.filter((x) => x !== Judge.MISS).length} / ${this.grades.length} DEFENCE`, r === Judge.PERFECT ? 'perfect' : 'tier', JUDGE_COLOR[r], this.grades.join(' ・ '));
    // MULTI:全部のハートの判定が決まってから1回だけ送る(HP は判定した時点の値から引く)
    if (g.online) this.hpBefore = new Map(g.turn.players.map((pl) => [pl, pl.hp]));
    if (g.online && !g.online.isDown()) { const damages = {}; for (const i of g.online.myUnitIndexes()) { const pl = g.turn.players[i]; if (pl?.hp > 0) damages[i] = this.totalDamageFor(pl); } g.online.sendCatch(0, r, damages); }
    const pos = g.ball.pos.clone();
    // ボスの反撃は全員へ:SOLO は生存している全員 / MULTI は自分が担当するキャラだけ(ダメージは各自の DEF で個別)
    const targets = (g.online ? g.online.myUnitIndexes().map((i) => g.turn.players[i]) : g.turn.players).filter((pl) => pl && (g.online ? this.hpBefore?.get(pl) ?? pl.hp : pl.hp) > 0);
    const s0 = g.player.toScreen(pos);
    const downs = [];
    targets.forEach((pl, k) => {
      const dmg = this.totalDamageFor(pl);
      if (dmg <= 0) return;
      if (g.online) { pl.hp = Math.max(0, (this.hpBefore?.get(pl) ?? pl.hp) - dmg); g.bus.emit('playerHp', pl); } else g.turn.damage(pl, dmg);
      const i = g.turn.players.indexOf(pl);
      g.ui.hitPlayer(i);
      g.ui.damageNumber(s0.x + (k - (targets.length - 1) / 2) * 46, s0.y + 40 + (k % 2) * 26, `-${dmg}`, { color: '#ff5a6e', label: pl.id });
      if (pl.hp <= 0) downs.push(pl);
    });
    if (targets.some((pl) => this.totalDamageFor(pl) > 0)) { g.hitstop(0.1); g.cam.shake(0.6); }
    g.ui.setPlayers(g.turn.players, g.turn.index);

    if (!g.online && g.turn.allDown) { g.ball.hide(); g.sm.change(GameState.GAME_OVER); return; }
    if (downs.length) {
      g.ui.showJudge(`${downs.map((d) => d.id).join('・')} DOWN`, 'miss', '#ff3d5a');
      if (g.online && g.online.myUnitIndexes().every((i) => !(g.turn.players[i]?.hp > 0))) { g.ball.hide(); g.sm.change(GameState.PLAYER_CATCH, { down: true }); return; }
    }
    g.sm.change(GameState.PLAYER_CATCH, { judge: r });
  }

  exit() {
    this.g.ui.hideCatchNotice?.();
    this.g.ui.showPrompt(null);
    this.g.catchJudge.reset();
    // HOLD を早く離した残り / FLICK の結果は、マーカーを消す時(impact の少し後の hide)まで残す
    if (!this.fxKeep) { this.g.catchTarget.setNote?.(null); this.g.catchTarget.setNext?.(null); }
    this.g.ball.setNoteLook?.(null);
    this.g.ball.setPressed?.(0);
  }
}

/** 終わり(離す)のタイミングの判定:開始の判定の幅 × mul */
function endGrade(dt, mul) {
  const a = Math.abs(dt) / mul;
  return a <= catchWin('perfectTime') ? Judge.PERFECT : a <= catchWin('greatTime') ? Judge.GREAT : a <= catchWin('goodTime') ? Judge.GOOD : Judge.MISS;
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
    if (g.online) { if (g.online.catchRoundDone) g.online.finishCatchRound({ nextIndex: g.online.room?.currentIndex }); else this.wait = 0.05; return; }
    // 次の PLAYER ATTACK PHASE(生存している A 側から。FEVER ゲージ 100% ならこのフェーズが FEVER)
    g.sm.change(GameState.NEXT_PLAYER, { phase: true });
  }
}
