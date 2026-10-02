import * as THREE from '../lib/three.js';
import { GameState } from '../core/StateMachine.js';
import { Config } from '../core/Config.js';
import { simulate } from '../physics/BallPhysics.js';
import { heartMultiplier } from '../data/BattleCalc.js';
import { abilityMul } from '../data/Growth.js';
import { powerStrength } from '../controllers/ThrowController.js';

/** PendingSpecialThrowData:指を離した瞬間の投球情報を複製して保存(発射位置 / 初速 / カーブ) */
function freezeThrow(th) {
  return {
    ...th,
    start: th.start.clone(),
    velocity: th.velocity.clone(),
    curveAccel: th.curveAccel ? th.curveAccel.clone() : null,
    direction: th.direction?.clone(),
    drive: th.drive ? { ...th.drive } : null,
    effects: th.effects?.map((e) => ({ ...e })) ?? [],
    savedAt: performance.now(),
  };
}

const MISS_LABEL = { short: 'TOO WEAK', over: 'TOO HIGH', wide: 'WIDE', low: 'TOO LOW' };

/**
 * PLAYER_ATTACK:画面下のボールを指で掴み → 追従 → 離した瞬間のフリックで投げる(ThrowController)
 */
export class PlayerAttackState {
  constructor(g) { this.g = g; }

  enter() {
    const g = this.g;
    const p = g.turn.current;
    if (g.ball.mode !== 'held' && g.ball.mode !== 'catching') g.ball.hold(g.player.holdAnchor);
    g.ball.setStyle(p.color, g.turn.tierLevel);
    g.ball.setDisabledLook?.(!!g.online && !g.online.isMyTurn());
    if (g.affection.answerMode) g.cam.focusOn(g.boss.partCenter('head'), 14);
    else g.cam.reset();
    g.ui.showPrompt('flick', p.color);
    // MULTI は全員が毎返球をキャッチするため、旧「NEXT キャッチ担当」予告は表示しない。
    if (g.online) g.ui.hideCatchNotice?.();
    g.thrower.cancel();
    g.space.spawnForThrow(g.online?.fieldPattern, g.online?.fieldSeed);   // 3D ルート(Energy / Heart Gate / 障害物)。FEVER 中は FEVER 専用の Energy 配置
  }

  update() {
    const g = this.g;
    if (!g.thrower.grabbing) {
      const s = g.player.heldBallScreen();
      g.ui.placeHint(s.x, s.y);
      return;
    }
    g.thrower.updatePreview();
  }

  onDragstart({ start }) {
    const g = this.g;
    if (g.online && !g.online.isMyTurn()) return;
    if (!g.thrower.canGrab()) return;
    if (!g.thrower.tryGrab(start)) { g.ui.nudgeBall(); return; }
    g.ui.showPrompt('grab', g.turn.current.color);
    g.audio.grab();
  }

  onDrag(d) { this.g.thrower.move(d); }

  onRelease(flick) {
    const g = this.g;
    if (g.specialSequencePlaying) return;
    const th = g.thrower.release(flick);
    if (th === undefined) return; // 掴んでいなかった
    g.ui.setThrowInfo(flick, th);
    if (!th) { g.ui.showPrompt('flick', g.turn.current.color); return; }
    // 前の人が投げ終えた瞬間に NEXT 予告を消す。
    if (g.online) g.ui.hideCatchNotice?.();
    const special = g.energy.consumeSpecial();
    if (g.online) g.online.sendThrow(th, !!special);
    g.sm.change(GameState.BALL_TO_BOSS, { th, flick, special });
  }

  exit() {
    this.g.ui.showPrompt(null);
    this.g.thrower.cancel();
  }
}

/** BALL_TO_BOSS:物理軌道(カーブ含む)で奥へ飛ぶ。Colliderと交差した部位が命中部位 */
export class BallToBossState {
  constructor(g) { this.g = g; }

  enter({ th, special }) {
    const g = this.g;
    this.launched = false;
    if (!special) { this.args = { th, special }; this.launch(); return; }
    // ---- SPECIAL シーケンス(カットインと飛行は同時に進めない)----
    //   Release → 投球入力を保存(PendingSpecialThrowData)→ ハート玉は待機 → スロー + カットイン
    //   → OnCutInComplete(アニメーション完了イベント)→ 速度を戻す → 保存した入力で SPECIAL HEART 発射
    this.pendingSpecialThrow = freezeThrow(th);
    this.args = { th: this.pendingSpecialThrow, special };
    g.specialSequencePlaying = true;           // 追加入力・通常 Launch・二重 SPECIAL・ターン進行をロック
    if (g.ball.mode === 'grabbed') g.ball.setGrabTarget(g.ball.pos.clone());  // 離した位置で待機(3D 空間ではまだ飛ばない / Energy 判定もしない)
    const C = Config.special.cutIn;
    g.setTimeScale(C.timeScale);
    g.ui.flash('#ffe28a', 0.25);
    g.cam.kickFov(-4);
    g.audio.loveMax();
    g.effects.heartBurst(g.ball.pos, 8, 2, 0.25);
    g.cutin.play(g.turn.current.chara, () => this.onCutInComplete());
  }

  /** OnCutInComplete:カットインのアニメーションが完全に終わった(キャラ画像が画面から消えた)時に呼ばれる */
  onCutInComplete() {
    const g = this.g;
    if (g.sm.current !== this || this.launched || !this.pendingSpecialThrow) return;
    this.launch();
  }

  /** 実際の発射(通常 / SPECIAL 共通)。1回の投球につき1度だけ */
  launch() {
    const g = this.g;
    if (this.launched && this.didLaunch) return;
    const { th, special } = this.args;
    this.launched = true;
    this.didLaunch = true;
    this.pendingSpecialThrow = null;
    g.specialSequencePlaying = false;
    g.setTimeScale(1);
    // フリックの強さ(0〜1)で軌跡・発光を変える(演出だけ。HEART は変わらない)
    const strength = special ? 1 : powerStrength(th.power);

    // 実際の飛行と同じ計算(練習用に軌道を残す/カメラの追従先)
    const sim = simulate(th.start, th.velocity, th.curveAccel, g.boss.hitPlane, 0.03, null, th.drive ?? null);
    if (Config.debug.showLastTrajectory && Config.debug.showTrajectoryPreview) g.preview.showGhost(sim.points);
    else g.preview.hideGhost();

    g.affection.showAnswerHint(false);
    // 50% 会話の回答の1投だけ、回答エリア(髪・顔・手・衣装)を部位より手前に足す
    g.ball.launch(th.velocity, th.curveAccel, g.affection.throwColliders(), strength, (result, flight) => {
      g.space.endThrow();
      g.sm.change(GameState.BOSS_HIT, { result, th, vel: flight.vel.clone(), special, banks: flight.obstacleHits, gates: g.space.chain, gateRoute: g.space.passedRoute, flight });
    }, th.start, g.space.obstacles.length ? g.space : null, th.drive ?? null);
    g.ball.flight.live = true;
    if (g.affection.answerMode) g.ball.flight.planeZ = g.boss.root.position.z;   // 回答の1投:絵の面を通った位置を記録
    g.space.beginThrow();    // Heart Gate の判定もここから(SPECIAL はカットイン完了後)
    g.energy.beginThrow();   // SPECIAL でも Energy を回収できる
    this.feverThrow = g.fever.consumeThrow(g.turn.index);   // FEVER 投球を1回消費(発射時に1度だけ)
    // このフェーズの投球として数える(50% 会話の回答をフェーズの最後の人の後に投げる「おまけの1投」は数えない)
    if (g.answerExtraThrow) g.answerExtraThrow = false; else g.turn.markThrown();
    g.ui.tutorialDone('flick');
    if (special) {
      // キャラ固有の SPECIAL 投球の見た目(CharacterData.specialThrowEffect。見た目だけ・ダメージは本体の1投だけ)
      g.specialFx.start(g.turn.current.chara, th);
      g.ui.showJudge('SPECIAL HEART!', 'perfect', '#ff7ab8');
      g.cam.kickFov(14); g.cam.shake(0.7); g.ui.speedLines(true);
      g.ui.flash('#ffffff', 0.5);
      g.effects.heartBurst(g.ball.pos, 14, 5, 0.3);
      g.effects.shockwave(g.ball.pos, '#ffd23e', 3.5, g.cam.camera);
      g.audio.throw(2.2);
    }
    g.cam.follow(sim.points[sim.points.length - 1]);
    g.cam.shake(0.06 + strength * 0.15);
    g.audio.throw(0.6 + strength);
    if (th.spin !== 0) {
      const dir = th.spin > 0 ? '→' : '←';
      if (!special) g.ui.showJudge(`CURVE ${dir}`, 'tier', '#7dffb0');
      g.ball.setCurveLook(th.spin);
    }
    if (th.strong && !special) {
      g.cam.kickFov(5 + strength * 5);
      g.ui.speedLines(true);
      if (th.spin === 0) g.ui.showJudge('FAST BALL', 'tier', '#3ee8ff');   // 速い球(強さの表示ではない)
      g.ui.flash('#ffffff', 0.12);
    }
  }

  exit() {
    this.g.ui.speedLines(false);
    this.didLaunch = false;
    if (!this.launched) { this.g.cutin.stop(); this.g.setTimeScale(1); }
    this.pendingSpecialThrow = null;
    this.g.specialSequencePlaying = false;
  }
}

/** BOSS_HIT(ハートが届いた):TotalHeart & PartHeart が増える → LOVE UP / LOVE MAX でリアクション・差分 */
export class BossHitState {
  constructor(g) { this.g = g; }

  enter({ result, th, vel, special, banks = 0, gates = 0, flight = null }) {
    const g = this.g;
    const mul = g.turn.mul;
    const color = g.turn.current.color;
    const point = result.point;
    const scr = g.player.toScreen(point);
    this.wait = 0.55;
    this.talkLead = false;

    // 回答の1投:当たった場所 → リアクション(当たらなければ MISS)
    this.answer = g.affection.answerMode ? g.affection.resolveAnswer(result, flight) : null;
    g.ui.setHitInfo(result, g.space.passedRoute);   // デバッグ:命中位置 / 部位 / 通ったゲートのルート
    if (result.type === 'hit') {
      g.hitMarker.show(result);   // 実際に Collider に当たった座標へ着弾マーク(約1秒。MISS では出さない)
      const partId = result.part;
      // HeartGain = BaseHeart(部位) × Attack(ATTACK) × Attribute × Special × Gate × Bank × FEVER × Ability(球速・引っ張り量では変えない)
      //   役割の分離:Heart Gate = ダメージ倍率 / Diamond = SPECIAL ゲージだけ / COMBO = FEVER ゲージだけ
      //   → Diamond の数・COMBO(ラリー)は HEART の倍率に入れない
      const ch = g.turn.current.chara;
      const sMul = special ? special.heartMul : 1;
      // アビリティ(条件つき):投げた子のアビリティ × この投球の内容(SPIN・SPECIAL・ゲート)
      // ★ 統一ルール:引く量(球速)ではダメージは変わらない → HEART のアビリティ条件には pull を渡さない
      const abilityHeart = abilityMul(ch?.abilities, 'heart', { throwSpin: th.throwSpin ?? th.spin, special: !!special, gates });
      const hm = heartMultiplier({
        attack: ch?.stats?.attack ?? 50, attackBonus: ch?.bonusStats?.attack ?? 0, ability: abilityHeart, attribute: ch?.attribute, bossAttribute: g.stage?.boss.attribute,
        rally: 1, energy: 1, special: sMul, fever: g.fever.heartMul,
        // 3D 空間:GATE CHAIN / BANK SHOT は「ボスに当たった時だけ」
        gate: Config.space.gate.chainBonus[Math.min(gates, Config.space.gate.chainBonus.length - 1)],
        bank: banks > 0 ? Config.space.bank.bonus : 1,
      });
      const power = 0.8 + 0.5 * powerStrength(th.power);   // 演出の大きさだけ(速い球ほど派手に。HEART は変わらない)
      const heartMul = hm.total;
      const r = g.boss.addHeart(partId, heartMul, heartMul / (hm.attackMul * hm.attrMul));
      g.stats.heart += r.heartGain;
      g.stats.bestHit = Math.max(g.stats.bestHit ?? 0, r.heartGain);   // 記録:BestHeartPerThrow
      g.affection.onHeartChanged();   // LOVE 25% ごとの表情
      // HEART 50% 会話の直前:命中の瞬間にゲーム速度を一瞬落とす(HEART MAX になった時は除く)
      const pendingTalk = !g.boss.full && !g.affection.answerMode ? g.affection.pendingTalk() : null;
      // MULTI:この投球でフェーズが終わる(この後ボスの反撃)時は会話を次のフェーズの命中まで持ち越す(回答の1投を投げる人がいないため)
      if (g.online && pendingTalk && g.online.canStartTalk?.()) g.online.requestTalk50(pendingTalk);
      this.talkLead = !g.online && !!pendingTalk;
      // Heart50TriggerDelay:HEART 表示が 50% を超えてから会話(暗転)を始めるまでの実時間。ヒットストップ / スロー / FEVER に左右されない
      if (this.talkLead) { g.setTimeScale(g.cfg.talk.hitSlow); this.talkAt = performance.now() + g.cfg.talk.heart50TriggerDelay * 1000; g.heart50ReachedAt = performance.now(); }
      g.turn.addRally();
      const perfect = hm.total / hm.attackMul >= 2 || r.loveSpot;
      // ハートの演出(届いた量に応じて増える)
      g.effects.heartBurst(point, Math.min(60, 10 + Math.round(r.heartGain / 16)), 6 + power * 3, 0.7 + (special ? 0.5 : 0));
      g.effects.burst(point, '#ffffff', 12, 7, 0.5);
      g.effects.shockwave(point, special ? '#ffd23e' : '#ff5fa2', 3 + power * 2 * mul, g.cam.camera);
      const tags = [
        special ? 'SPECIAL HEART' : '',
        r.loveSpot ? 'LOVE SPOT' : '',
        hm.relation === 'advantage' ? 'EFFECTIVE♡' : hm.relation === 'disadvantage' ? 'RESIST' : '',
        hm.fever > 1 ? `FEVER ×${hm.fever}` : '',
        gates > 0 ? `GATE ×${hm.gate}` : '',
        banks > 0 ? `BANK SHOT ×${hm.bank}` : '',
        th.spin ? 'CURVE' : '',
      ].filter(Boolean).join(' ');
      g.ui.damageNumber(scr.x, scr.y, `+${r.heartGain} HEART`, {
        crit: perfect, color: '#ff7ab8', fever: g.fever.active ? g.fever.level : 0,
        label: perfect ? `PERFECT HIT! ${tags}` : (tags || r.part.label),
      });
      if (banks > 0) { g.stats.banks = (g.stats.banks ?? 0) + 1; g.ui.showJudge('BANK SHOT!', 'tier', '#b6ff5c', `HEART ×${hm.bank}`); }
      else if (gates >= 1) g.ui.showJudge(`GATE ×${hm.gate}`, 'tier', '#ffd23e', gates >= 2 ? `GATE CHAIN ${gates} ・ HEART ×${hm.gate}` : `HEART ×${hm.gate}`);
      // COMBO:HIT → 「N COMBO」→ FEVER ゲージへ(12 COMBO で FEVER!)
      this.comboHit(scr);
      g.ui.setHeart(g.boss.heart, g.boss.maxHeart, true);
      g.ui.setParts(g.boss.parts, partId);
      g.cam.shake(0.2 + (power - 0.8) * 0.4 + (mul - 1) * 0.2);
      g.hitstop(special ? special.hitstop : 0.05 + power * 0.04 + (perfect ? 0.04 : 0));
      if (special) { g.cam.shake(0.8); g.effects.heartBurst(point, 70, 12, 1.4); g.effects.shockwave(point, '#ffd23e', 9, g.cam.camera); g.ui.flash('#ffe0f0', 0.6); g.specialFx.hit(point); }
      g.ui.flash('#ffe6f2', 0.1 + (mul - 1) * 0.12);
      g.audio.heart(power, perfect);

      // 部位ごとの PartHeart の段階変化(壊すのではなくリアクションが大きくなる)
      if (false && r.changed) { // v25: 部位破壊/LOVE SPOTの視覚表示は廃止
        const name = `${r.part.ja ?? ''} ${r.part.label}`.trim();
        if (r.after === 'HEART_MAX') {
          g.stats.loveSpots++;
          g.hitstop(0.16);
          g.ui.flash('#ffd0e8', 0.5);
          g.effects.heartBurst(point, 50, 10, 1.1);
          g.ui.partCallout(`${name} LOVE SPOT!`, 'break');
          g.audio.loveMax();
          this.wait = 1.0;
          if (g.boss.parts.allMax) setTimeout(() => g.ui.partCallout('ALL LOVE SPOT!', 'all'), 700);
        } else if (r.after === 'WARM') {
          g.ui.partCallout(`${name} DOKI♡`, 'damaged');
        }
      }
      g.ball.rebound(vel);
    } else {
      // 外れ:自動補正はしない。ラリーは途切れる
      // Gate を通っても最後にボスへ当たらなければ GATE CHAIN のボーナスは無し
      g.specialFx.miss();
      // MISS:COMBO 0・FEVER ゲージ 0%
      const lost = g.fever.onMiss();
      g.ui.setCombo(0, { broke: lost > 0 });
      g.fever.updateUI(lost > 0);
      g.ui.showJudge(MISS_LABEL[result.type] ?? 'MISS', 'miss', '#b9b0ff', lost > 0 ? `${lost} COMBO → 0` : gates > 0 ? 'GATE ボーナスなし' : '');
      g.turn.resetRally();
      g.stats.throwMiss++;
      if (result.type === 'short') g.ball.fadeOut(); else g.ball.hide();
      g.audio.whiff();
      this.wait = 0.8;
    }
    g.cam.reset();
  }

  /** HIT → COMBO +1。「N COMBO」のハートが FEVER ゲージへ飛び、着いたらゲージが増える。12 COMBO で FEVER! */
  comboHit(scr) {
    const g = this.g, F = g.fever;
    const r = F.onHit();
    g.ui.setCombo(r.combo, { hit: true });
    const pct = r.max ? 'MAX' : F.active || F.pendingStart ? '' : `${Math.round(F.gaugeFor(r.combo))}%`;
    g.ui.flyTo(scr.x, scr.y + 34, 'feverBar', `<b>${r.combo}</b> COMBO${pct ? `<small>FEVER ${pct}</small>` : ''}`, 'combo', 560).then(() => {
      F.updateUI(true);
      if (r.max) {
        // 12 COMBO → FEVER MAX → (次のフェーズの最初に)FEVER 突入
        g.ui.showJudge('♡ FEVER! ♡', 'fevermax', '#ff4fa8', `${r.combo} COMBO → FEVER MAX`);
        g.ui.flash('#ffd0ea', 0.35);
        g.audio.rallyUp();
      }
    });
  }

  update(dt) {
    const g = this.g;
    // HEART 50% 到達:命中演出(HEART 加算表示・Hit Effect・Hit Reaction)の後、他の処理(返球・キャッチ・手番交代・FEVER FINISH)より先に会話へ
    if (this.talkLead) {
      if (performance.now() < this.talkAt) return;
      this.talkLead = false;
      g.setTimeScale(1);
      const talk = g.affection.pendingTalk();
      if (talk && !g.boss.full) { g.sm.change(GameState.TALK_QUESTION, { talk }); return; }
      this.wait = 0;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    // 優先順:回答へのリアクション → HEART MAX(LOVE MAX)→ 50% 会話 → FEVER 全員投げ終わり → 通常(次の味方 / ボスの反撃)。どれか1つだけに進む
    if (this.answer) { const answer = this.answer; this.answer = null; g.sm.change(GameState.TALK_REACTION, { answer }); return; }
    if (g.boss.full) { g.fever.abort(); g.sm.change(GameState.GAME_CLEAR); return; }   // 攻略成功:反撃には移らない
    const talk = g.affection.pendingTalk();
    if (talk && !g.online) { g.sm.change(GameState.TALK_QUESTION, { talk }); return; }
    if (g.online && !g.online.throwResolved) return;   // MULTI:この投球の後の進行(次の人 / ボスの反撃)をサーバーから受け取るまで待つ
    if (g.fever.done) { g.sm.change(GameState.FEVER_OUTRO); return; }
    g.afterThrow();   // 次の味方の投球 / 全員投げ終えたらボスの反撃
  }
}
