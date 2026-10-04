import { GameState } from '../core/StateMachine.js';
import { Config, difficultyData } from '../core/Config.js';
import { heroineByStage } from '../data/RomanceData.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * WAVE_ADVANCE:雑魚を全員倒した → 奥へ進む → ボス(攻略対象)登場 → 元の進行(次の味方 / ボスの反撃)
 *   時刻は Config.minion.advance(この間は投球・ターン進行なし。MULTI は全員同じ長さ)
 *   clearAt  … 「WAVE CLEAR!」(倒れる演出を見せてから)
 *   goAt     … カメラが奥へ突き進む + スピード線 + 画面が白く抜ける
 *   arriveAt … 白の中で雑魚を片付けてボスを出す → カメラは手前から到着
 *   cardAt   … TARGET / 名前 / 難易度(バトル開始のボス紹介と同じ見た目)
 *   endAt    … 紹介を消して元の進行へ
 *   次の WAVE がある時は、ボスの代わりに次の雑魚が出る(紹介は WAVE)
 */
export class WaveAdvanceState {
  constructor(g) { this.g = g; }

  enter() {
    const g = this.g;
    this.t = 0;
    this.step = 0;
    g.ui.showPrompt(null);
    g.ball.hide();
    g.energy.endThrow(); g.energy.clear(); g.space.clear();
    this.fx = document.getElementById('waveFx');
    this.el = document.getElementById('opening');
  }

  update(dt) {
    const g = this.g, A = Config.minion.advance, t = (this.t += dt);
    if (this.step === 0 && t >= A.clearAt) {
      this.step = 1;
      g.ui.showJudge('WAVE CLEAR!', 'fevermax', '#ffd23e', g.wave?.hasNext ? 'さらに奥へ…' : '奥へ進む…');
      g.audio.rallyUp?.();
    }
    if (this.step === 1 && t >= A.goAt) {
      // 奥へ突き進む:カメラを前へ・視野を広げてスピード感 → 画面が白く抜ける
      this.step = 2;
      g.cam.dollyTarget = A.dolly;
      g.cam.fovHoldTarget = A.fov;
      g.ui.speedLines(true);
      this.fx?.classList.remove('arrive');
      this.fx?.classList.add('go');
      g.audio.throw?.(2);
    }
    if (this.step === 2 && t >= A.arriveAt) {
      // 白の中で入れ替え:次の WAVE / ボス → カメラは手前から到着
      this.step = 3;
      const nextWave = g.wave?.next();
      if (!nextWave) g.endWave();
      g.syncWaveTarget();
      g.cam.dolly = -A.dolly * 0.35; g.cam.dollyTarget = 0;
      g.cam.fovHoldTarget = 0;
      g.ui.speedLines(false);
      this.fx?.classList.remove('go');
      this.fx?.classList.add('arrive');
      if (!g.wave) g.boss.view.playHit?.('chest', 1.6);
      g.cam.shake(0.35);
      this.showCard();
    }
    if (this.step === 3 && t >= A.cardAt) {
      this.step = 4;
      this.el?.classList.add('dim', 'name', 'diff', 'text');
      g.cam.focusOn(g.wave ? g.wave.focusPoint() : g.boss.partCenter('chest'), Config.opening.bossZoom);
    }
    if (this.step === 4 && t >= A.endAt - Config.opening.fadeSec) { this.step = 5; this.el?.classList.add('out'); g.cam.reset(); }
    if (t >= A.endAt) {
      if (g.fever.done) { g.sm.change(GameState.FEVER_OUTRO); return; }
      g.afterThrow();
    }
  }

  /** 紹介カード(OpeningState と同じ #opening を使う):ボス = TARGET / 次の WAVE = 雑魚の名前 */
  showCard() {
    const g = this.g, el = this.el;
    if (!el) return;
    const D = difficultyData(g.difficulty);
    if (g.wave) {
      el.innerHTML = `<div class="op-dim"></div><section class="op-card">
        <small class="op-target">${esc(g.wave.label)}</small>
        <strong class="op-name op-minions">${g.wave.names().map(esc).join('<span>&amp;</span>')}</strong></section>`;
    } else {
      const st = g.stage, h = heroineByStage(st?.id);
      const line = h?.line ?? st?.line ?? null;
      el.innerHTML = `<div class="op-dim"></div><section class="op-card">
        <small class="op-target">TARGET</small>
        <strong class="op-name">${esc(st?.boss?.name)}</strong>
        <span class="op-diff" style="--dc:${D.color}">${esc(D.label)}</span>
        ${line ? `<p class="op-line">「${esc(line)}」</p>` : ''}</section>`;
    }
    el.style.setProperty('--op-dim', Config.opening.dim);
    el.className = '';
    el.hidden = false;
  }

  exit() {
    const g = this.g;
    if (this.el) { this.el.hidden = true; this.el.className = ''; }
    this.fx?.classList.remove('go', 'arrive');
    g.ui.speedLines(false);
    g.cam.reset();
  }
}
