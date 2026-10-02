import { Config } from '../core/Config.js';

/**
 * FEVER TIME:ボスへの攻撃を当て続けた(COMBO)チームへのご褒美。現在の手番から4人が1投ずつ強力に投げるボーナスラウンド。
 *
 * 状態(ここに集約):
 *   combo               COMBO(ボスへの攻撃の連続 HIT 数)。HIT で +1 / MISS で 0
 *   gauge               FeverGauge 0〜100 = combo ÷ comboToFever(浮動小数を足し続けない。COMBO から毎回計算)
 *                       ★ ゲージを増やすのは COMBO だけ(Heart Gate・Diamond・キャッチでは増えない)
 *   pendingStart        12 COMBO(100%)に達した → 次のフェーズの最初の投球前に FEVER_INTRO を挟む(到達したら確定)
 *   active (IsFever)    FEVER 中
 *   level               FeverLevel 1〜3(Lv.1 / Lv.2 / Lv.MAX)
 *   throwsRemaining     FeverThrowsRemaining(発射した時点で1減る)
 *   startPlayer         FeverStartPlayer(開始時の手番 index)
 *   thrown              この FEVER で投げた手番 index の一覧(UI の ✓)
 * 時間制ではなく「投球数制」。ターン順は TurnManager のまま(A→B→C→D)なので、開始手番から4人に1回ずつ回る。
 * 演出(突入 / 終了)は DOM の Web Animations(実時間)で再生し、完了イベントでステートを進める。
 */
export class FeverSystem {
  constructor(g) {
    this.g = g;
    this.buildUI();
    this.reset();
  }

  get F() { return Config.fever; }
  get heartMul() { return this.active && !this.paused ? this.F.heartMul[this.level - 1] ?? 1 : 1; }
  get levelLabel() { return this.F.levelLabels[this.level - 1] ?? ''; }
  get throwsTotal() { return Math.max(1, Math.round(this.F.throwsPerActivation)); }

  reset() {
    this.combo = 0;
    this.gauge = 0;
    this.pendingStart = false;
    this.active = false;
    this.level = 1;
    this.throwsRemaining = 0;
    this.startPlayer = -1;
    this.thrown = [];
    this.finishing = false;
    this.paused = false;
    this.anim?.cancel?.();
    this.fx.hidden = true;
    this.banner.hidden = true;
    this.g.container.classList.remove('fever', 'fever-lv1', 'fever-lv2', 'fever-lv3');
    this.updateUI();
  }

  // ---------------- COMBO → ゲージ ----------------
  get comboToFever() { return Math.max(1, Math.round(this.F.comboToFever ?? 12)); }
  /** COMBO → ゲージ %(0〜100) */
  gaugeFor(combo) { return Math.min(100, (combo / this.comboToFever) * 100); }

  /**
   * ボスへの攻撃が HIT(BOSS_HIT)→ COMBO +1 → ゲージ。12 COMBO で FEVER MAX(次のフェーズの最初に FEVER 突入)
   *   FEVER 中も COMBO は数える(表示だけ。ゲージは FEVER の残り投球数を表示)
   * → { combo, gauge, max(この HIT で 100% に到達)}。ゲージの表示(updateUI)は呼び出し側が演出に合わせて行う
   */
  onHit() {
    this.combo++;
    let max = false;
    if (!this.active && !this.pendingStart) {
      this.gauge = this.gaugeFor(this.combo);
      if (this.gauge >= 100) { this.pendingStart = true; max = true; }
    }
    if (this.g.stats) this.g.stats.maxCombo = Math.max(this.g.stats.maxCombo ?? 0, this.combo);
    return { combo: this.combo, gauge: this.gauge, max };
  }

  /** 攻撃が MISS → COMBO 0・ゲージ 0%(FEVER MAX に達していた分は確定済みなので取り消さない)*/
  onMiss() {
    const had = this.combo;
    this.combo = 0;
    if (!this.active && !this.pendingStart) this.gauge = 0;
    return had;
  }

  /** キャッチ判定ごとに呼ぶ(PlayerDefenseState)。ゲージは増えない。FEVER 中の PERFECT で FEVER LEVEL UP(FEVER の効果)*/
  onCatch(judge) {
    if (!this.active) return;
    if (judge === 'PERFECT' && this.level < 3) {
      this.level++;
      this.applyLevelClass();
      this.g.ui.partCallout(`♡ FEVER ${this.levelLabel}! ♡`, 'all');
      this.g.audio.rallyUp();
    } else if (judge === 'MISS' && this.F.missLevelDown && this.level > 1) {
      this.level--;
      this.applyLevelClass();
    }
    this.updateUI();
  }

  // ---------------- 開始 / 投球 / 終了 ----------------
  /** FEVER 開始(FEVER_INTRO で呼ぶ) */
  start(turnIndex, count = this.throwsTotal) {
    this.pendingStart = false;
    this.active = true;
    this.level = 1;
    this.throwsRemaining = Math.max(1, Math.min(this.throwsTotal, count));   // フェーズの生存者の人数分(最大 throwsPerActivation)
    this.startPlayer = turnIndex;
    this.thrown = [];
    this.finishing = false;
    this.fx.hidden = false;
    this.g.container.classList.add('fever');
    this.applyLevelClass();
    this.updateUI();
    this.g.stats.fevers = (this.g.stats.fevers ?? 0) + 1;
  }

  /** FEVER 投球を1回消費(ボールを発射した時に1度だけ) */
  consumeThrow(turnIndex) {
    if (!this.active || this.paused || this.throwsRemaining <= 0) return false;
    this.throwsRemaining--;
    this.thrown.push(turnIndex);
    this.updateUI();
    return true;
  }

  /** HEART 50% 会話の間は FEVER を一時停止(回答の1投は FEVER の投球数を使わない・倍率も掛けない)。会話の後に再開 */
  pause(on) {
    this.paused = !!on && this.active;
    this.g.container.classList.toggle('fever-paused', this.paused);
    this.updateUI();
  }

  /** 全員が投げ終えた(BOSS_HIT の後で FEVER_OUTRO へ) */
  get done() { return this.active && this.throwsRemaining <= 0; }

  /** 通常状態へ戻す(FEVER_OUTRO の最後)。ゲージは 0 */
  finish() {
    if (!this.active) return;
    this.active = false;
    this.finishing = false;
    this.combo = 0;      // FEVER が終わったら COMBO もゼロから(次の FEVER はまた 12 COMBO)
    this.gauge = 0;
    this.level = 1;
    this.throwsRemaining = 0;
    this.thrown = [];
    this.fx.hidden = true;
    this.g.container.classList.remove('fever', 'fever-lv1', 'fever-lv2', 'fever-lv3');
    this.updateUI();
  }

  /** HEART MAX / GAME OVER / リスタート:演出なしで即終了(二重実行しない) */
  abort() {
    this.pause(false);
    this.anim?.cancel?.();
    this.banner.hidden = true;
    if (this.active) this.finish();
    this.pendingStart = false;
  }

  applyLevelClass() {
    const c = this.g.container.classList;
    c.remove('fever-lv1', 'fever-lv2', 'fever-lv3');
    if (this.active) c.add(`fever-lv${this.level}`);
  }

  onPatternPlaced(pattern, count) {
    this.lastPattern = pattern?.id;
    this.lastOrbCount = count;
    if (pattern) this.patternEl.textContent = `${pattern.label} ×${count}`;
  }

  // ---------------- UI ----------------
  buildUI() {
    // ゲージ:上部 HEART / RALLY の下にコンパクトに(SPECIAL = 左下のピンクとは別の配色)
    const bar = document.createElement('div');
    bar.id = 'feverBar';
    // 目盛り = COMBO の数(12 COMBO で 100%)。1 HIT ごとに1目盛り進むのが見える
    bar.innerHTML = '<span class="flabel">FEVER</span><div class="ftrack"><i></i><span class="fticks"></span></div><b class="fval">0%</b><span class="fdots"></span>';
    document.querySelector('.bossbar').appendChild(bar);
    this.bar = bar;
    // FEVER 中の画面演出(外周の発光・端の小さなハート)。中央は空ける
    const fx = document.createElement('div');
    fx.id = 'feverFx';
    fx.hidden = true;
    fx.innerHTML = '<div class="ff-edge"></div>' + Array.from({ length: 10 }, (_, i) => `<i class="ff-h" style="--i:${i}">♥</i>`).join('') + '<div id="feverPattern" class="ff-pattern"></div>';
    const ui = document.getElementById('ui');
    ui.insertBefore(fx, ui.firstChild);
    this.fx = fx;
    this.patternEl = fx.querySelector('#feverPattern');
    // 突入 / 終了のバナー
    const bn = document.createElement('div');
    bn.id = 'feverBanner';
    bn.hidden = true;
    bn.innerHTML = '<div class="fb-hearts">' + Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}">♥</i>`).join('') + '</div><div class="fb-text"></div><div class="fb-flash"></div>';
    ui.appendChild(bn);
    this.banner = bn;
  }

  updateUI(bump = false) {
    if (!this.bar) return;
    const b = this.bar;
    b.classList.toggle('on', this.active);
    b.classList.toggle('ready', this.pendingStart);
    b.style.setProperty('--fn', this.comboToFever);
    b.querySelector('i').style.transform = `scaleX(${this.active ? this.throwsRemaining / this.throwsTotal : this.gauge / 100})`;
    b.querySelector('.flabel').textContent = this.active ? `♡ FEVER ${this.levelLabel}` : 'FEVER';
    b.querySelector('.fval').textContent = this.active ? `${this.throwsTotal - this.throwsRemaining} / ${this.throwsTotal}` : this.pendingStart ? 'MAX!' : `${Math.floor(this.gauge)}%`;
    if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    // 右下のキャラアイコンと統合:FEVER で投げ終えた人に ✓
    const cards = this.g.ui?.cards ?? [];
    cards.forEach((c, i) => c.d.classList.toggle('fdone', this.active && this.thrown.includes(i)));
  }

  // ---------------- 演出(実時間・完了イベントで次へ)----------------
  /** 突入:ハートが中央へ集まる → 「♡ FEVER TIME! ♡」→ フラッシュ */
  playIntro(onDone) {
    return this.playBanner('intro', '♡ FEVER TIME! ♡', this.F.introDuration, onDone);
  }
  /** 終了:画面のハートがボスへ吸い込まれる → 「FEVER FINISH!」 */
  playOutro(onDone) {
    return this.playBanner('outro', 'FEVER FINISH!', this.F.outroDuration, onDone);
  }

  playBanner(kind, text, sec, onDone) {
    this.anim?.cancel?.();
    const bn = this.banner;
    bn.hidden = false;
    bn.dataset.kind = kind;
    bn.querySelector('.fb-text').textContent = text;
    const dur = Math.max(100, sec * 1000);
    const opt = { duration: dur, fill: 'forwards', easing: 'linear' };
    const W = this.g.container.clientWidth, H = this.g.container.clientHeight;
    // ボスの胸(終了時にハートが吸い込まれる先)
    let tx = W / 2, ty = H * 0.38;
    if (kind === 'outro') { const s = this.g.player.toScreen(this.g.boss.partCenter('chest')); tx = s.x; ty = s.y; }
    const anims = [];
    bn.querySelectorAll('.fb-hearts i').forEach((h, i) => {
      const a = (i / 12) * Math.PI * 2;
      const r = Math.max(W, H) * 0.6;
      const sx = W / 2 + Math.cos(a) * r, sy = H / 2 + Math.sin(a) * r;
      const from = kind === 'intro' ? [sx, sy] : [W / 2 + Math.cos(a) * W * 0.42, H * 0.5 + Math.sin(a) * H * 0.3];
      anims.push(h.animate([
        { transform: `translate(${from[0]}px, ${from[1]}px) scale(1.2)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.4)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 },
      ], { ...opt, easing: 'cubic-bezier(.5,0,.9,.6)' }));
    });
    const txt = bn.querySelector('.fb-text');
    anims.push(txt.animate(kind === 'intro' ? [
      { transform: 'scale(2.4)', opacity: 0 }, { transform: 'scale(2.4)', opacity: 0, offset: 0.35 },
      { transform: 'scale(1)', opacity: 1, offset: 0.55 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.88 }, { transform: 'scale(1.3)', opacity: 0 },
    ] : [
      { transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { transform: 'scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translateY(-30px)', opacity: 0 },
    ], opt));
    anims.push(bn.querySelector('.fb-flash').animate(kind === 'intro'
      ? [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 0.75, offset: 0.58 }, { opacity: 0 }]
      : [{ opacity: 0 }, { opacity: 0.35, offset: 0.1 }, { opacity: 0 }], opt));

    let finished = false;
    const token = {};
    this.anim = { cancel: () => { finished = true; for (const x of anims) x.cancel(); bn.hidden = true; } };
    const complete = () => {
      if (finished || this.anim?.token !== token) return;
      finished = true;
      clearTimeout(safety);
      for (const x of anims) x.cancel();
      bn.hidden = true;
      this.anim = null;
      onDone?.();
    };
    this.anim.token = token;
    Promise.all(anims.map((x) => x.finished)).then(complete, () => {});
    const safety = setTimeout(complete, dur + 1500);   // 完了イベントが届かない環境の保険
    return true;
  }
}
