import { Config } from '../core/Config.js';
import { characterById, ATTRIBUTES, TYPES } from '../data/GameData.js';
import { artUrl } from '../data/CharacterArt.js';
import { RARITY_OBTAIN_LINES } from '../data/CharacterVoice.js';
import { giftById, giftName, giftIcon, giftRank } from '../data/RomanceData.js';
import { Haptic, reducedMotion, Log } from '../app/Platform.js';
import { rarityBadge, raritySparkle, charAccent } from '../app/Rarity.js';
import { revealEffectFor } from './RevealEffects.js';
import { mulberry32 } from './GachaService.js';
import { GachaParticles } from './GachaParticles.js';
import { GachaSfx } from './GachaSfx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
class Skipped extends Error {}

/** レアリティごとの光の色(粒・クリスタル・背景)*/
export const RARITY_LIGHT = {
  N: ['#ffffff', '#e4e8f2', '#c8cedb'],
  R: ['#ffffff', '#bfe1ff', '#7ab4ff', '#9fd0ff'],
  SR: ['#ffffff', '#e7d2ff', '#c08cff', '#ff9ccf'],
  SSR: ['#fff6d0', '#ffd36e', '#ff9ccf', '#ffb3dc', '#ffffff'],
};

/**
 * 演出の台本(結果は変えない。種は結果の seed から = 再現できる)
 *   hint    … 開ける前のハートの色(N / R / SR)。SSR は最後まで SR(ときどき R)に見せて、開ける途中で「昇格」
 *   promote … SSR の昇格演出をするか(SSR は必ず)
 */
export function planShow(tx) {
  const rng = mulberry32((tx.seed ^ 0x2f6b9a1d) >>> 0), D = Config.gacha.show.ssrDisguise;
  return tx.items.map((it) => {
    const r = it.rarity;
    if (r !== 'SSR') return { hint: r === 'SR' || r === 'R' || r === 'N' ? r : 'R', promote: false };
    return { hint: rng() < (D.SR ?? 0.7) ? 'SR' : 'R', promote: true };
  });
}

/**
 * ガチャ演出(恋が始まるまでの1回):暗転 → 小さなハート → 鼓動 → 光が集まる → ハートクリスタル → TOUCH → ヒビ → 光が漏れる
 *   →(SSR:停止 → 暗転 → ドクン → ピンクゴールドに再点灯 → 波紋 → ホワイトアウト)→ 弾ける → シルエット → 立ち絵 → 名前 / レアリティ / 属性 / セリフ
 *   10連:巨大なハート → 10個に分裂 → 1つずつ(タップ / ALL OPEN)開ける。SSR のハートだけ途中で止まって SSR 演出へ → 一覧へ戻る
 *   最後に BONUS PRESENT(テンポよく)→ 結果画面(GachaUI)
 * 画面は CSS(transform / opacity)中心 + Canvas 1枚の粒。結果(抽選)は一切書き換えない
 */
export class GachaDirector {
  constructor(app, root) {
    this.app = app; this.root = root;
    root.innerHTML = `
      <div class="gs" data-phase="idle">
        <div class="gs-bg"></div>
        <canvas class="gs-fx"></canvas>
        <div class="gs-rings" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="gs-crystal" aria-hidden="true">${heartSVG('gsC')}${crownSVG()}</div>
        <div class="gs-sfxtext" aria-hidden="true"></div>
        <div class="gs-touch" hidden><b>TOUCH</b><small>ハートにふれて</small></div>
        <div class="gs-grid" hidden></div>
        <div class="gs-rev" hidden>
          <div class="gs-rays"></div><div class="gs-bigheart">${heartSVG('gsB', false)}</div>
          <div class="gs-figwrap"><img class="gs-char" alt="" draggable="false"></div>
          <div class="gs-title"><div class="gs-crown">${crownSVG()}</div><div class="gs-rar"></div><div class="gs-name"></div><div class="gs-meta"></div><em class="gs-new" hidden>NEW!</em></div>
          <div class="gs-talk"><b class="gs-tname"></b><p class="gs-line"></p><i class="gs-tnext">▼</i></div>
          <div class="gs-tapnext" hidden>TAP</div>
        </div>
        <div class="gs-presents" hidden><header><small>＋</small><b>BONUS PRESENT</b></header><div class="gs-plist"></div><div class="gs-tapnext">TAP</div></div>
        <div class="gs-cfx" hidden aria-hidden="true"><i class="cfx-veil"></i><i class="cfx-flame"></i><i class="cfx-heart">♥</i></div>
        <div class="gs-flash"></div>
        <div class="gs-ctrl"><button type="button" class="gs-allopen" hidden>ALL OPEN</button><button type="button" class="gs-skip">SKIP ›</button></div>
      </div>`;
    this.el = root.querySelector('.gs');
    this.q = (s) => this.el.querySelector(s);
    this.fx = new GachaParticles(this.q('.gs-fx'), { scale: Config.gacha.particleScale ?? 1 });
    this.sfx = new GachaSfx(app.audio);
    this.q('.gs-skip').addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    this.q('.gs-allopen').addEventListener('click', (e) => { e.stopPropagation(); this.allOpen(); });
    this.el.addEventListener('pointerdown', (e) => { if (!e.target.closest('.gs-ctrl')) this.tap(e); });
    window.addEventListener('resize', () => { if (this.playing) this.fx.resize(); });
  }

  /** 演出の速さ:FULL = 1 / FAST = 短く(SSR の昇格は残す) */
  T(name) { const t = Config.gacha.show.timing; const v = name.split('.').reduce((o, k) => o?.[k], t) ?? 300; return v * (this.fast ? Config.gacha.show.fastScale : 1) * (reducedMotion() ? 0.6 : 1); }

  /**
   * @param tx   確定済みの結果(GachaService)
   * @param mode FULL | FAST | SKIP_TO_NEW(初めての SSR だけ見せる)
   */
  play(tx, { mode = 'FULL', onDone } = {}) {
    this.stop();
    this.tx = tx; this.onDone = onDone; this.plan = planShow(tx);
    this.fast = mode === 'FAST'; this.mode = mode;
    this.skipping = false; this.allOpening = false; this.playing = true; this.tapWaiter = null;
    this.el.className = 'gs'; this.el.dataset.kind = tx.count >= 10 ? 'ten' : 'single';
    this.reset();
    requestAnimationFrame(() => this.fx.resize());
    Log.info('GACHA', `show ${tx.txId} ${mode} ${this.plan.map((p, i) => `${tx.items[i].rarity}${p.promote ? `(${p.hint}→SSR)` : ''}`).join(',')}`);
    const run = mode === 'SKIP_TO_NEW' ? this.runSkipToNew() : tx.count >= 10 ? this.runTen() : this.runSingle();
    run.catch((e) => { if (!(e instanceof Skipped)) Log.warn('GACHA', 'show error', e); }).finally(() => this.finish());
  }

  reset() {
    const E = this.el;
    E.dataset.phase = 'idle'; E.dataset.hint = ''; E.dataset.rarity = '';
    for (const s of ['.gs-touch', '.gs-grid', '.gs-rev', '.gs-presents', '.gs-allopen', '.gs-cfx']) this.q(s).hidden = true;
    this.q('.gs-grid').innerHTML = ''; this.q('.gs-plist').innerHTML = '';
    this.q('.gs-crystal').className = 'gs-crystal';
    this.q('.gs-flash').className = 'gs-flash';
    this.fx.clear();
  }

  stop() {
    this.playing = false; this.skipping = true;
    this.tapWaiter?.(); this.tapWaiter = null;
    for (const t of this.timers ?? []) clearTimeout(t);
    this.timers = [];
    this.fx.stop();
  }

  finish() {
    if (!this.playing) return;
    this.playing = false;
    this.fx.stop();
    const done = this.onDone; this.onDone = null;
    done?.();
  }

  /** SKIP:どこからでも結果画面へ */
  skip() { if (!this.playing || this.skipping) return; this.skipping = true; this.tapWaiter?.(); this.tapWaiter = null; for (const t of this.timers) clearTimeout(t); this.timers = []; this.wake?.(); }

  /** ALL OPEN(10連):残りのハートをまとめて開ける(SSR は短い SSR 演出だけ見せる)*/
  allOpen() { if (!this.playing || this.allOpening) return; this.allOpening = true; this.q('.gs-allopen').disabled = true; this.tapWaiter?.(); this.tapWaiter = null; }

  tap(e) {
    if (!this.playing) return;
    if (this.tapWaiter) { const w = this.tapWaiter; this.tapWaiter = null; w(e); }
  }

  /** ms 待つ(SKIP で中断)*/
  wait(ms) {
    if (this.skipping) return Promise.reject(new Skipped());
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.wake = null; this.skipping ? rej(new Skipped()) : res(); }, ms);
      this.timers.push(t);
      this.wake = () => { clearTimeout(t); rej(new Skipped()); };
    });
  }
  /** タップを待つ(auto ms 後は自動で進む / ALL OPEN 中はすぐ進む)*/
  waitTap(auto = null) {
    if (this.skipping) return Promise.reject(new Skipped());
    if (this.allOpening) return Promise.resolve(null);
    return new Promise((res, rej) => {
      let t = null;
      this.tapWaiter = (e) => { if (t) clearTimeout(t); this.skipping ? rej(new Skipped()) : res(e ?? null); };
      if (auto != null) { t = setTimeout(() => { if (this.tapWaiter) { this.tapWaiter = null; res(null); } }, auto); this.timers.push(t); }
      this.wake = () => { if (t) clearTimeout(t); this.tapWaiter = null; rej(new Skipped()); };
    });
  }

  phase(p) { this.el.dataset.phase = p; }
  /** 擬音(ドクン… / パキッ…)を一瞬だけ */
  say(text, cls = '') { const t = this.q('.gs-sfxtext'); t.textContent = text; t.className = `gs-sfxtext ${cls}`; void t.offsetWidth; t.classList.add('on'); }
  flash(kind = 'white', ms = 400) { const f = this.q('.gs-flash'); f.className = 'gs-flash'; void f.offsetWidth; f.classList.add(kind); f.style.setProperty('--d', `${ms}ms`); }
  center() { const r = this.el.getBoundingClientRect(); return { x: r.width / 2, y: r.height * 0.44 }; }

  // ---------------- 共通:ハートが生まれてクリスタルになるまで ----------------
  async formCrystal(hint) {
    const C = this.q('.gs-crystal'), c = this.center();
    this.el.dataset.hint = hint;
    this.phase('dark'); await this.wait(this.T('intro'));
    this.phase('seed'); this.sfx.play('heartAppear'); await this.wait(this.T('seed'));
    for (let i = 0; i < 2; i++) { C.classList.remove('beat'); void C.offsetWidth; C.classList.add('beat'); this.sfx.play('heartbeat', 0.6); Haptic.light(); if (!i) this.say('ドクン…', 'beat'); await this.wait(this.T('beat')); }
    this.phase('gather'); this.sfx.play('gather');
    this.fx.gather(c.x, c.y, RARITY_LIGHT[hint], hint === 'N' ? 40 : hint === 'R' ? 60 : 80, this.T('gather'));
    await this.wait(this.T('gather'));
    this.phase('crystal'); this.flash('soft', 300); Haptic.medium();
    if (hint !== 'N') this.fx.burst(c.x, c.y, { colors: RARITY_LIGHT[hint], kinds: hint === 'R' ? ['star', 'dot'] : ['star', 'heart', 'dot'], count: hint === 'SR' ? 30 : 18, speed: 0.6, gravity: 0 });
    await this.wait(this.T('settle'));
  }

  async touch() {
    this.q('.gs-touch').hidden = false; this.phase('touch');
    await this.waitTap(this.mode === 'FAST' ? 1200 : null);
    this.q('.gs-touch').hidden = true;
  }

  /** ヒビ → 光が漏れる(SR は鼓動が強い)*/
  async crack(hint) {
    const C = this.q('.gs-crystal');
    this.phase('crack'); C.classList.add('crack1'); this.sfx.play('crack'); Haptic.light(); this.say('パキッ…', 'crack');
    await this.wait(this.T('crack'));
    C.classList.add('crack2'); this.sfx.play('crack'); this.phase('leak');
    if (hint === 'SR') { this.sfx.play('heartbeat', 1); Haptic.medium(); }
    await this.wait(this.T('leak'));
  }

  /** SSR 昇格:「SRかな?」→ 一瞬停止 → 暗転 → ドクン → 再点灯(ピンクゴールド)→ 強い鼓動 → ハートの波紋 */
  async promote() {
    const C = this.q('.gs-crystal'), c = this.center();
    this.phase('freeze'); this.el.classList.add('freeze'); await this.wait(this.T('freeze'));
    this.phase('blackout'); C.classList.add('dim'); await this.wait(this.T('dark'));
    this.el.classList.remove('freeze');
    this.sfx.play('ssrPromote'); Haptic.heavy(); this.el.classList.add('shake'); C.classList.remove('beat'); void C.offsetWidth; C.classList.add('beat'); this.say('ドクン…', 'big');
    await this.wait(this.T('dokun'));
    this.el.classList.remove('shake');
    this.el.dataset.hint = 'SSR'; C.classList.remove('dim'); C.classList.add('relit'); this.phase('relight'); this.flash('gold', 500);
    this.fx.burst(c.x, c.y, { colors: RARITY_LIGHT.SSR, kinds: ['star', 'heart', 'dot'], count: 40, speed: 0.8, gravity: 0 });
    await this.wait(this.T('relight'));
    for (let i = 0; i < 2; i++) {
      C.classList.remove('beat'); void C.offsetWidth; C.classList.add('beat'); this.sfx.play('heartbeat', 1.3); Haptic.medium();
      this.fx.ripple(c.x, c.y, i ? '#ffd36e' : '#ff9ccf', this.T('ripple'));
      await this.wait(this.T('ripple') * 0.6);
    }
    this.sfx.play('ssrConfirm');
  }

  /** キャラ固有の追加演出(CharacterData.gachaReveal → RevealEffects.js)。無いキャラは何もしない */
  async charFx(it) {
    const fx = revealEffectFor(characterById(it.characterId));
    if (fx) await fx(this, it);
  }

  /** 弾ける(SR は花びら・リボン・ハート / SSR はホワイトアウト)*/
  async burst(rarity) {
    const c = this.center(), C = this.q('.gs-crystal');
    this.phase('burst'); C.classList.add('pop'); this.sfx.play('burst'); Haptic.heavy();
    const kinds = rarity === 'SSR' || rarity === 'SR' ? ['shard', 'heart', 'petal', 'ribbon', 'star'] : rarity === 'R' ? ['shard', 'star', 'dot'] : ['shard', 'dot', 'heart'];
    this.fx.burst(c.x, c.y, { colors: RARITY_LIGHT[rarity], kinds, count: rarity === 'SSR' ? 120 : rarity === 'SR' ? 90 : 60, speed: rarity === 'N' ? 0.8 : 1.15 });
    if (rarity === 'SR') this.sfx.play('sr');
    this.flash(rarity === 'SSR' ? 'whiteout' : 'white', rarity === 'SSR' ? this.T('whiteout') : 350);
    await this.wait(rarity === 'SSR' ? this.T('whiteout') : this.T('burst'));
  }

  /** キャラクター登場:光の中のシルエット → 立ち絵 → 名前 → レアリティ → 属性 → セリフ */
  async reveal(it, { short = false } = {}) {
    const ch = characterById(it.characterId), R = this.q('.gs-rev'), rar = it.rarity;
    R.dataset.rarity = rar; this.el.dataset.rarity = rar;
    R.className = 'gs-rev'; R.hidden = false;
    const img = R.querySelector('.gs-char');
    img.src = artUrl(ch, 'cutout'); img.alt = ch.name;
    R.querySelector('.gs-rar').innerHTML = rarityBadge(rar, 'gs-rb');
    R.querySelector('.gs-name').textContent = ch.name;
    R.querySelector('.gs-meta').textContent = `${ATTRIBUTES[ch.attribute]?.icon ?? ''} ${ATTRIBUTES[ch.attribute]?.label ?? ''} / ${TYPES[ch.type]?.label ?? ''}`;
    R.querySelector('.gs-line').textContent = this.line(it) ?? '';
    R.querySelector('.gs-tname').textContent = ch.name;
    R.querySelector('.gs-new').hidden = !it.isNew;
    R.querySelector('.gs-tapnext').hidden = true;
    this.phase('reveal');
    const step = (cls, ms) => { R.classList.add(cls); return this.wait(ms); };
    await step('sil', this.T('silhouette') * (short ? 0.5 : 1));
    this.sfx.play('charAppear');
    await step('unveil', this.T('unveil') * (short ? 0.6 : 1));
    if (rar === 'SSR') { this.fx.ambient(RARITY_LIGHT.SSR); Haptic.medium(); }
    else if (rar === 'SR') this.fx.ambient(RARITY_LIGHT.SR.slice(1));
    for (const cls of ['i-rar', 'i-name', 'i-meta']) await step(cls, this.T('info') * (short ? 0.5 : 1));
    await step('i-line', this.T('info') * 2 * (short ? 0.5 : 1));
    const hold = this.T(`hold.${rar}`) * (short ? 0.5 : 1);
    await this.wait(hold * 0.5);
    R.querySelector('.gs-tapnext').hidden = false;
    await this.waitTap(hold * 2 + 2500);
    this.fx.ambient(null);
    R.classList.add('out'); await this.wait(220);
    R.hidden = true;
  }

  line(it) {
    const d = characterById(it.characterId)?.gacha?.obtainDialogue ?? {};
    return (it.isNew && d.firstTime) || d.default || RARITY_OBTAIN_LINES[it.rarity] || '';
  }

  /** BONUS PRESENT(キャラより短く・テンポよく)*/
  async presents(list) {
    const P = this.q('.gs-presents'), L = P.querySelector('.gs-plist');
    const ps = list.filter(Boolean);
    if (!ps.length) return;
    L.innerHTML = ps.map((p, i) => { const g = giftById(p.giftId), rk = giftRank(g); return `<span class="gs-pr" style="--i:${i}${rk?.color ? `;--gk:${rk.color}` : ''}">${g?.image ? `<img src="${esc(g.image)}" alt="">` : `<i>${giftIcon(g)}</i>`}<b>${esc(giftName(g))}</b>${rk ? `<em>${esc(rk.label)}</em>` : ''}</span>`; }).join('');
    P.dataset.n = ps.length; P.hidden = false; this.phase('present');
    for (let i = 0; i < ps.length; i++) this.timers.push(setTimeout(() => this.sfx.play('present'), i * this.T('present')));
    await this.wait(ps.length * this.T('present') + 300);
    await this.waitTap(this.T('presentHold'));
    P.hidden = true;
  }

  // ---------------- 単発 ----------------
  async runSingle() {
    const it = this.tx.items[0], pl = this.plan[0];
    await this.formCrystal(pl.hint);
    await this.touch();
    await this.crack(pl.hint);
    if (pl.promote) await this.promote();
    await this.charFx(it);
    await this.burst(it.rarity);
    this.q('.gs-crystal').className = 'gs-crystal gone';
    await this.reveal(it);
    await this.presents([it.present]);
  }

  // ---------------- 10連 ----------------
  async runTen() {
    const items = this.tx.items, plan = this.plan;
    const top = plan.some((p) => p.hint === 'SR') ? 'SR' : 'R';     // 最初の大きなハートは「SR があるかも」まで(SSR は見せない)
    await this.formCrystal(top);
    await this.touch();
    // 10個に分裂して並ぶ
    const G = this.q('.gs-grid');
    G.innerHTML = items.map((it, i) => `<button type="button" class="gs-h" data-i="${i}" data-hint="${plan[i].hint}" style="--i:${i}" aria-label="${i + 1}個目を開ける">${heartSVG(`gsh${i}`)}</button>`).join('');
    this.q('.gs-crystal').className = 'gs-crystal split'; this.sfx.play('burst'); this.flash('soft', 300);
    G.hidden = false; this.phase('split');
    // 各ハートは中央(大きなハートの位置)から自分の場所へ飛んでいく
    const o = this.el.getBoundingClientRect(), c = this.center();
    for (const b of G.querySelectorAll('.gs-h')) { const r = b.getBoundingClientRect(); b.style.setProperty('--dx', `${o.left + c.x - (r.left + r.width / 2)}px`); b.style.setProperty('--dy', `${o.top + c.y - (r.top + r.height / 2)}px`); }
    void G.offsetWidth; G.classList.add('in');
    await this.wait(this.T('splitFly'));
    this.q('.gs-allopen').hidden = false; this.q('.gs-allopen').disabled = false;
    G.classList.add('ready');
    // 1つずつ開ける:タップしたハート(どこを押しても次のハート)/ ALL OPEN
    const opened = new Set();
    while (opened.size < items.length) {
      let i = [...items.keys()].find((k) => !opened.has(k));
      if (!this.allOpening) {
        const e = await this.waitTap(null);
        const b = e?.target?.closest?.('.gs-h');
        if (b && !opened.has(+b.dataset.i)) i = +b.dataset.i;
      }
      opened.add(i);
      await this.openSmall(i);
    }
    this.q('.gs-allopen').hidden = true;
    G.classList.add('done');
    await this.wait(this.T('gridHold'));
    G.hidden = true;
    await this.presents(items.map((x) => x.present));
  }

  /** 小さなハートを開ける。SSR のハートは途中で止まって SSR 演出へ */
  async openSmall(i) {
    const it = this.tx.items[i], pl = this.plan[i], b = this.q(`.gs-h[data-i="${i}"]`);
    b.classList.add('opening'); this.sfx.play('crack');
    const r = b.getBoundingClientRect(), o = this.el.getBoundingClientRect(), x = r.left - o.left + r.width / 2, y = r.top - o.top + r.height / 2;
    await this.wait(this.allOpening && !pl.promote ? 90 : this.T('openSmall'));
    if (pl.promote) {
      // 通常の開封 → 一瞬停止 → 暗転 → ドクン → SSR 演出(全画面)→ 一覧へ戻る
      const G = this.q('.gs-grid'), C = this.q('.gs-crystal');
      this.el.classList.add('freeze'); await this.wait(this.T('freeze'));
      this.el.classList.remove('freeze');
      G.classList.add('away'); C.className = 'gs-crystal relit dim'; this.el.dataset.hint = 'SR'; this.phase('blackout');
      await this.wait(this.T('dark'));
      this.sfx.play('ssrPromote'); Haptic.heavy(); this.el.classList.add('shake'); C.classList.remove('dim'); C.classList.add('beat'); this.say('ドクン…', 'big');
      await this.wait(this.T('dokun'));
      this.el.classList.remove('shake'); this.el.dataset.hint = 'SSR'; this.phase('relight'); this.flash('gold', 500);
      const c = this.center();
      for (let k = 0; k < 2; k++) { C.classList.remove('beat'); void C.offsetWidth; C.classList.add('beat'); this.sfx.play('heartbeat', 1.3); this.fx.ripple(c.x, c.y, k ? '#ffd36e' : '#ff9ccf', this.T('ripple')); await this.wait(this.T('ripple') * 0.6); }
      this.sfx.play('ssrConfirm');
      if (!this.allOpening) await this.charFx(it);
      await this.burst('SSR');
      C.className = 'gs-crystal gone';
      await this.reveal(it, { short: this.allOpening });
      G.classList.remove('away'); this.phase('split');
    } else {
      this.fx.burst(x, y, { colors: RARITY_LIGHT[it.rarity], kinds: it.rarity === 'SR' ? ['petal', 'heart', 'ribbon', 'star'] : ['shard', 'dot', 'star'], count: it.rarity === 'SR' ? 26 : 12, speed: 0.55, size: 0.7 });
      if (it.rarity === 'SR') { this.sfx.play('sr'); Haptic.light(); } else this.sfx.play('cardOpen');
    }
    b.outerHTML = cardHTML(it, i);
    await this.wait(this.allOpening ? 60 : this.T('cardIn'));
  }

  // ---------------- SKIP:初めての SSR だけ短く見せる ----------------
  async runSkipToNew() {
    const ssr = this.tx.items.filter((x) => x.rarity === 'SSR' && x.isNew);
    if (!ssr.length) return;
    this.fast = true;
    for (const it of ssr) { this.flash('whiteout', 500); await this.wait(400); await this.reveal(it, { short: true }); }
  }
}

/** 10連の一覧に並ぶカード(レアリティ枠は共通)*/
function cardHTML(it, i) {
  const ch = characterById(it.characterId);
  return `<div class="gs-card rar-frame" data-rarity="${it.rarity}" style="--i:${i}"><span class="gs-cface"><img src="${artUrl(ch, 'cutout')}" alt="" draggable="false"></span>${rarityBadge(it.rarity, 'gs-cb')}${raritySparkle(it.rarity)}${charAccent(ch)}<b>${esc(ch.name)}</b>${it.isNew ? '<em>NEW</em>' : ''}</div>`;
}

/** ハートの上の小さな王冠 */
function crownSVG() {
  return `<svg class="gs-crownsvg" viewBox="-40 -30 80 46" aria-hidden="true"><path d="M-30 10 L-34 -16 L-16 -2 L0 -24 L16 -2 L34 -16 L30 10 Z" /><rect x="-31" y="10" width="62" height="7" rx="3"/><circle cx="0" cy="-26" r="4"/><circle cx="-34" cy="-18" r="3"/><circle cx="34" cy="-18" r="3"/><path class="gem" d="M0 -8 l5 6 l-5 6 l-5 -6 z"/></svg>`;
}

/** ハートクリスタル(SVG:面のきらめき・ハイライト・ヒビ)。色は CSS 変数 --h1 / --h2 / --h3 */
function heartSVG(id, facets = true) {
  const P = 'M0 78 C-58 40 -98 6 -98 -34 C-98 -66 -72 -88 -46 -88 C-24 -88 -8 -74 0 -58 C8 -74 24 -88 46 -88 C72 -88 98 -66 98 -34 C98 6 58 40 0 78 Z';
  return `<svg viewBox="-110 -100 220 190" class="gs-hsvg"><defs>
    <radialGradient id="${id}g" cx="35%" cy="25%" r="85%"><stop offset="0" style="stop-color:var(--h1)"/><stop offset=".55" style="stop-color:var(--h2)"/><stop offset="1" style="stop-color:var(--h3)"/></radialGradient>
    <clipPath id="${id}c"><path d="${P}"/></clipPath></defs>
    <path class="hb" d="${P}" fill="url(#${id}g)"/>
    ${facets ? `<g class="facets" clip-path="url(#${id}c)">
      <path d="M0 -58 L-46 -88 L-70 -30 Z"/><path d="M0 -58 L46 -88 L70 -30 Z" class="f2"/><path d="M-70 -30 L0 -58 L0 20 Z" class="f3"/>
      <path d="M70 -30 L0 -58 L0 20 Z" class="f4"/><path d="M-98 -34 L-70 -30 L-40 30 Z" class="f2"/><path d="M98 -34 L70 -30 L40 30 Z" class="f3"/>
      <path d="M-40 30 L0 20 L0 78 Z" class="f4"/><path d="M40 30 L0 20 L0 78 Z"/></g>
    <path class="shine" d="M-62 -66 C-48 -80 -26 -78 -18 -66 C-36 -70 -50 -64 -60 -50 Z"/>
    <g class="cracks"><path class="k1" d="M-6 -50 L4 -28 L-10 -8 L6 14 L-2 40"/><path class="k2" d="M4 -28 L30 -40 L52 -36 M-10 -8 L-38 -14 L-62 4 M6 14 L32 20 L46 40"/></g>` : ''}
  </svg>`;
}
