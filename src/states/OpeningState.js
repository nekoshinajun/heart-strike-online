import { GameState } from '../core/StateMachine.js';
import { Config } from '../core/Config.js';
import { heroineByStage } from '../data/RomanceData.js';
import { difficultyData } from '../core/Config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * OPENING:インゲームのバトル開始演出(ボス紹介)。GameManager.startStage がバトル BGM を最初から鳴らした直後に入る
 *   0.0 暗く → 0.2 ボスを強調 → 0.4 TARGET / 名前 → 0.6 難易度 → 0.8 紹介文 / セリフ → フェードアウト → BATTLE START → PLAYER_ATTACK(A)
 *   時刻は Config.opening。この間は投球・POWER・ターン進行・ボス攻撃なし(入力ハンドラを持たない)
 *   MULTI:サーバーが配った totalSec(全員同じ)まで待つ。サーバーもその時刻までは投球を受け付けない
 * 表示する文章はデータ(攻略対象 / ステージ)にあるものだけ。無い項目は出さない
 */
export class OpeningState {
  constructor(g) { this.g = g; }

  enter({ totalSec = null } = {}) {
    const g = this.g, O = Config.opening;
    this.t = 0;
    this.total = Math.max(O.fadeAt + O.fadeSec + O.startSec, totalSec ?? 0);
    this.fadeAt = this.total - O.startSec - O.fadeSec;   // MULTI で長い時は紹介を長く見せる
    this.step = 0;
    this.started = false;
    g.ui.showPrompt(null);
    g.ball.hide();   // 紹介中はハートを出さない(カメラを寄せるので手前に大きく映る)。BATTLE START で構える
    g.cam.reset();
    // 全体図:最初の1投のコース(ゲート・Energy・障害物)を先に置いて、高い位置から見せる。PLAYER_ATTACK はこの配置をそのまま使う
    g.space.spawnForThrow(g.online?.fieldPattern ?? g.tutorial?.fieldPattern, g.online?.fieldSeed);
    g.space.keepForTurn = g.turn.current;
    g.cam.setOverview(1);
    const st = g.stage, h = heroineByStage(st?.id), D = difficultyData(g.difficulty);
    const profile = h?.profile ?? st?.concept ?? null;
    const line = h?.line ?? st?.line ?? null;
    const el = this.el = document.getElementById('opening');
    // 雑魚戦から始まるステージ:最初は WAVE の紹介(ボスの紹介は雑魚を全員倒した後:WaveAdvanceState)
    if (g.wave) el.innerHTML = `<div class="op-dim"></div>
      <section class="op-card">
        <small class="op-target">${esc(g.wave.label)}</small>
        <strong class="op-name op-minions">${g.wave.names().map(esc).join('<span>&amp;</span>')}</strong>
        <span class="op-diff" style="--dc:${D.color}">${esc(D.label)}</span>
        <p class="op-line">${esc(st?.boss?.name)} の前に、まずはこの子たちを倒そう！</p>
      </section>`;
    else el.innerHTML = `<div class="op-dim"></div>
      <section class="op-card">
        <small class="op-target">TARGET</small>
        <strong class="op-name">${esc(st?.boss?.name)}</strong>
        <span class="op-diff" style="--dc:${D.color}">${esc(D.label)}</span>
        ${profile ? `<p class="op-profile">${esc(profile)}</p>` : ''}
        ${line ? `<p class="op-line">「${esc(line)}」</p>` : ''}
      </section>`;
    el.style.setProperty('--op-dim', O.dim);
    el.className = '';
    el.hidden = false;
  }

  update(dt) {
    const g = this.g, O = Config.opening, el = this.el;
    this.t += dt;
    const t = this.t;
    // 全体図 → プレイ位置へ寄る(ゆっくり始まりゆっくり止まる)
    const OV = O.overview;
    if (OV) { const k = Math.min(1, Math.max(0, (t - OV.hold) / OV.move)); g.cam.setOverview(1 - k * k * (3 - 2 * k)); }
    const at = (k, cls) => { if (t >= k && !el.classList.contains(cls)) el.classList.add(cls); };
    at(O.dimAt, 'dim');
    if (t >= O.bossAt && this.step < 1) { this.step = 1; g.cam.focusOn(g.wave ? g.wave.focusPoint() : g.boss.partCenter('chest'), O.bossZoom); }
    at(O.nameAt, 'name');
    at(O.diffAt, 'diff');
    at(O.textAt, 'text');
    if (t >= this.fadeAt && this.step < 2) { this.step = 2; el.classList.add('out'); g.cam.reset(); }
    if (t >= this.fadeAt + O.fadeSec && !this.started) {
      this.started = true;
      el.hidden = true;
      g.ball.hold(g.player.holdAnchor);
      g.ui.showTurn(g.turn.current, 'BATTLE START');
    }
    if (t >= this.total) g.sm.change(GameState.PLAYER_ATTACK);
  }

  exit() {
    if (this.el) { this.el.hidden = true; this.el.className = ''; }
    this.g.cam.setOverview(0);
    this.g.cam.reset();
  }
}
