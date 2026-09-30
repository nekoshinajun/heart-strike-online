import { Config } from '../core/Config.js';
import { characterById, ATTRIBUTES, TYPES, RANKS } from '../data/GameData.js';
import { artUrl } from '../data/CharacterArt.js';
import { RARITY_OBTAIN_LINES } from '../data/CharacterVoice.js';
import { GachaThrowInput } from './GachaThrowInput.js';
import { Haptic, reducedMotion, Log } from '../app/Platform.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => t * t * (3 - 2 * t);
const RAINBOW = ['#ff5f8f', '#ffb347', '#ffe66b', '#7dffb0', '#5fd6ff', '#8f8bff', '#e07bff'];
// ワールド(2.5D):x 左右 / y 高さ / z 奥行き。Gate は z = 1, 2, 3、キャラは 4.2
const Z = { gates: [1.0, 2.0, 3.0], arrive: 4.3 };
const K = 1.55;

/**
 * GachaDirector:GachaSequencePlan の timeline を実時間で再生する(本編の TimeScale に依存しない)。演出から結果は書き換えない。
 *   ENTER → AWAIT_THROW → LAUNCH → GATES → CLIMAX(SSR)→ ARRIVAL → REVEAL → RESULT
 *   Canvas(2.5D の空・Gate・Heart・Particle)+ DOM(シルエット → Catch → 全身 Reveal・情報は画面下 1/4)
 *   SKIP »:初獲得 SSR の最低保証 Reveal(白フラッシュ → ドクン1回 → 全身 + 名前 + NEW + 一言)だけ残す
 *   タップ:Gate 区間 3倍速 / Reveal は次へ。静寂〜ドクン区間はタップを受け付けない
 */
export class GachaDirector {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    root.innerHTML = `
      <canvas class="ga-cv"></canvas>
      <div class="ga-rows" hidden></div>
      <div class="ga-reveal" hidden><div class="ga-halo"></div><div class="ga-fig"><img class="ga-sil" alt="" draggable="false"><img class="ga-col" alt="" draggable="false"><i class="ga-catch"></i></div>
        <div class="ga-bubble" hidden></div>
        <div class="ga-info" hidden><div class="gi-rank"></div><div class="gi-name"></div><div class="gi-meta"></div><div class="gi-new">NEW!</div></div>
        <div class="ga-tapnext" hidden>TAP</div></div>
      <div class="ga-hud"><span class="ga-count">×1</span><button type="button" class="ga-skip">SKIP »</button></div>
      <div class="ga-guide" hidden><i class="gg-finger"></i><span>引いて、投げて</span></div>
      <div class="ga-first" hidden>ハートを引いて、上へ投げよう ─ 投げ方で結果は変わりません</div>
      <div class="ga-flash"></div>`;
    this.cv = root.querySelector('.ga-cv');
    this.ctx = this.cv.getContext('2d');
    this.rv = root.querySelector('.ga-reveal');
    this.flashEl = root.querySelector('.ga-flash');
    this.guide = root.querySelector('.ga-guide');
    for (const ev of ['pointerdown', 'pointerup']) root.addEventListener(ev, (e) => e.stopPropagation());
    root.querySelector('.ga-skip').addEventListener('click', () => this.skip());
    this.input = new GachaThrowInput(this.cv, {
      heartScreen: () => this.heartScreenPos(),
      heartRadius: () => this.heartRadiusPx(),
      onGrab: () => { this.hideGuide(); this.touched = true; this.app.audio?.grab?.(); },
      onMove: (m) => { this.drag = m; if (m.phase === 'POWER_CHARGE' && performance.now() - (this.lastTick ?? 0) > 70) { this.lastTick = performance.now(); this.app.audio?.charge?.(m.power); } },
      onRelease: (p) => this.launch(p),
      onCancel: () => { this.drag = null; },
    });
    root.addEventListener('pointerdown', (e) => { if (!e.target.closest('button') && this.playing) this.tap(); });
    this.loop = this.loop.bind(this);
    this.clouds = null;
  }

  get audio() { return this.app.audio; }

  // ---------------- 再生 ----------------
  /** @param plan GachaSequencePlan / result GachaResult / onDone({skipped}) */
  play(plan, result, { onDone, firstTime = false } = {}) {
    this.stop();
    this.plan = plan; this.result = result; this.onDone = onDone;
    this.cues = [...plan.timeline].sort((a, b) => a.t - b.t);
    this.ci = 0; this.t = 0; this.speed = 1; this.playing = true; this.done = false; this.touched = false;
    this.phase = 'ENTER'; this.phaseT = 0;
    this.state = { color: 'R', rainbow: false, dim: 0, speedLines: 0, heartScale: 1, freeze: false, gateHidden: {}, gateWarp: 0, rainbowGate: null, pulses: 0, split: false, glint: false, protectedUntil: -1 };
    this.particles = []; this.trail = []; this.fragments = [];
    this.throwP = { power: 0.3, strength: 0, aimX: 0, aimY: 0, spin: 0 };
    this.passed = new Set();
    this.cam = { x: 0, y: 0, z: 0 };
    this.heart = { x: 0, y: 0.5, z: 0, visible: true, screen: null };
    this.sub = null; this.arrived = false; this.revealing = false; this.tapReady = false; this.catchAnim = null; this.heartHold = null; this.keys = null;
    this.state.protectedFrom = -1;
    this.ten = plan.kind === 'ten';
    this.root.querySelector('.ga-count').textContent = this.ten ? '×10' : '×1';
    this.rv.hidden = true; this.root.querySelector('.ga-rows').hidden = true;
    this.root.querySelector('.ga-first').hidden = !firstTime;
    this.resize();
    this.input.reset();
    this.input.enabled = false;
    this.last = performance.now();
    this.enterAt = this.last;
    requestAnimationFrame(this.loop);
    Log.info('GACHA', `play ${plan.kind} mode=${plan.mode} routes=${plan.items.map((x) => x.routeId).join(',')}`);
    if (plan.mode === 'SKIP_TO_NEW') this.skip();
  }

  stop() { this.playing = false; clearTimeout(this.guideTimer); this.input.enabled = false; this.hideGuide(); }

  resize() {
    const r = this.root.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width || 390; this.H = r.height || 844;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clouds = null;
  }

  // ---------------- 投球 ----------------
  heartBaseR() { return (this.ten ? 1.6 : 1) * 0.1; }
  heartScreenPos() { const p = this.project(this.heart.x, this.heart.y, this.heart.z); return p ?? { x: this.W / 2, y: this.H * 0.6 }; }
  heartRadiusPx() { const p = this.project(this.heart.x, this.heart.y, this.heart.z); return p ? this.heartBaseR() * this.W * 0.9 * p.s : 40; }
  showGuide() { if (this.phase === 'AWAIT_THROW' && !this.touched) this.guide.hidden = false; }
  hideGuide() { this.guide.hidden = true; }

  launch(p) {
    if (this.phase !== 'AWAIT_THROW') return;
    this.throwP = p;
    this.drag = null;
    this.input.enabled = false;
    this.hideGuide();
    this.root.querySelector('.ga-first').hidden = true;
    this.phase = 'PLAY'; this.t = 0;
    this.buildKeys();
    this.audio?.whoosh?.(p.strength);
    Haptic.light();
  }

  /** Heart の軌道のキー(timeline の時刻から)。AIM / SPIN は Gate 1 までの見た目の傾き・曲がりだけ */
  buildKeys() {
    const c = (name) => this.cues.find((x) => x.cue === name);
    const gates = this.cues.filter((x) => x.cue === 'gate');
    const keys = [{ t: 0, x: 0, y: 0.5, z: 0 }];
    for (const g of gates) keys.push({ t: g.t, x: 0, y: 0, z: Z.gates[g.params.index] });
    if (this.ten) {
      const sp = c('split');
      keys.push({ t: sp.t, x: 0, y: 0, z: Z.gates[0] + 0.35 });
    } else if (c('stop')) {
      const st = c('stop'), ac = c('accel'), en = c('flash'), ar = c('arrival');
      keys.push({ t: st.t, x: 0, y: 0, z: Z.gates[2] - 0.35 });
      keys.push({ t: ac.t, x: 0, y: 0, z: Z.gates[2] - 0.5 });   // 溜め(少し後ずさり)
      keys.push({ t: en.t, x: 0, y: 0, z: Z.gates[2] });
      keys.push({ t: ar.t, x: 0, y: 0.05, z: Z.arrive });
    } else if (c('selfPulse')) {
      const sp = c('selfPulse'), cv = c('curve'), en = c('flash'), ar = c('arrival');
      const side = cv.params.side === 'left' ? -1 : 1;
      keys.push({ t: sp.t, x: 0, y: 0, z: Z.gates[2] - 0.3 });
      keys.push({ t: cv.t, x: 0, y: 0, z: Z.gates[2] - 0.34 });
      keys.push({ t: (cv.t + en.t) / 2, x: -side * 0.16, y: 0.02, z: Z.gates[2] - 0.12 });   // 逆側へ膨らんでから(bulge)
      keys.push({ t: en.t, x: side * 0.55, y: 0, z: Z.gates[2] + 0.1 });                    // 大きく Curve(shift)
      keys.push({ t: ar.t, x: 0, y: 0.05, z: Z.arrive });
    } else {
      keys.push({ t: c('arrival').t, x: 0, y: 0.05, z: Z.arrive });
    }
    this.keys = keys.sort((a, b) => a.t - b.t);
    this.gate1T = gates[0]?.t ?? 0.5;
  }
  heartAt(t) {
    const k = this.keys;
    let i = 0;
    while (i < k.length - 2 && t > k[i + 1].t) i++;
    const a = k[i], b = k[Math.min(i + 1, k.length - 1)];
    const u = b.t > a.t ? clamp01((t - a.t) / (b.t - a.t)) : 1;
    const e = i === 0 ? u : ease(u);
    const p = { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e) };
    if (t < this.gate1T) {   // AIM / SPIN:最初だけ傾いて Gate 1 へ吸い込まれる
      const w = Math.sin(Math.PI * clamp01(t / this.gate1T));
      p.x += (this.throwP.aimX * 0.22 + this.throwP.spin * 0.3) * w;
      p.y += this.throwP.aimY * 0.1 * w;
    }
    return p;
  }

  // ---------------- 入力(演出中のタップ)----------------
  tap() {
    if (this.phase === 'SKIPFLOOR') { if (this.sub?.ready) this.sub.next(); return; }
    if (this.phase !== 'PLAY') return;
    if (this.t < this.state.protectedUntil && this.state.protectedFrom <= this.t) return;   // 静寂〜ドクンは早送りしない
    if (this.sub) { this.sub.hurry(); return; }
    if (this.revealing) { if (this.tapReady) this.finish(false); else this.jumpTo('tapReady'); return; }
    if (!this.arrived) this.speed = Config.gacha.timing.tapForward;
  }
  jumpTo(cueName) {
    const c = this.cues.find((x) => x.cue === cueName && x.t > this.t);
    if (c) this.t = c.t - 0.001;
  }

  skip() {
    if (this.phase === 'DONE') return;
    this.stop();
    this.playing = true;
    this.phase = 'SKIPFLOOR';
    this.sub = null;
    // 初獲得 SSR だけ最低保証の Reveal(reveal 順)
    const list = this.plan.revealOrder.map((i) => this.plan.items[i]).filter((x) => x.ssr && x.isNew);
    this.skipQueue = list;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.nextSkip();
  }
  nextSkip() {
    const it = this.skipQueue.shift();
    if (!it) { this.finish(true); return; }
    const T = Config.gacha.timing;
    this.rv.hidden = true;
    this.flash(0.25);
    const run = { ready: false, next: () => { clearTimeout(run.timer); this.nextSkip(); } };
    this.sub = run;
    setTimeout(() => { this.audio?.heartbeat?.({ variant: 'gachaSSR', count: 1 }); }, 250);
    setTimeout(() => { this.showReveal(it, { instant: true, uiDelay: 0.05 }); this.audio?.rainbowChord?.(); run.ready = true; }, 750);
    run.timer = setTimeout(() => { if (this.sub === run) run.next(); }, T.skipFloorSSR * 1000 + 1200);
  }

  finish(skipped) {
    if (this.phase === 'DONE') return;
    this.phase = 'DONE';
    this.stop();
    this.audio?.duckBgm?.(1, 0.3);
    const cb = this.onDone; this.onDone = null;
    cb?.({ skipped });
  }

  // ---------------- 毎フレーム ----------------
  loop(now) {
    if (!this.playing) return;
    requestAnimationFrame(this.loop);
    const t = performance.now();
    const dt = Math.max(0, Math.min(0.25, (t - this.last) / 1000));   // 実時間(TimeScale 非依存)
    this.last = t;
    if (this.root.clientWidth && Math.abs(this.root.clientWidth - this.W) > 1) this.resize();
    this.update(dt);
    this.draw(dt);
  }

  update(dt) {
    const T = Config.gacha.timing;
    if (this.phase === 'ENTER') {
      this.phaseT += dt;
      if (this.phaseT >= T.enter) {
        this.phase = 'AWAIT_THROW'; this.input.enabled = true;
        clearTimeout(this.guideTimer); this.guideTimer = setTimeout(() => this.showGuide(), T.guideAfter * 1000);
      }
      return;
    }
    if (this.phase === 'AWAIT_THROW') {
      // 引いている間は Heart が指に付いていく(見た目だけ)
      const d = this.drag;
      const target = d ? { x: (d.x - this.W / 2) / (this.W * 0.9), y: 0.5 + Math.min(d.pull, this.H * 0.25) / (this.H * 0.52) } : { x: 0, y: 0.5 };
      this.heart.x = lerp(this.heart.x, d ? target.x * 0.5 : 0, 0.3);
      this.heart.y = lerp(this.heart.y, target.y, 0.3);
      return;
    }
    if (this.phase !== 'PLAY') return;
    const inGates = !this.arrived && !this.state.freeze;
    this.t += dt * (inGates ? this.speed : 1);
    while (this.ci < this.cues.length && this.cues[this.ci].t <= this.t) this.cue(this.cues[this.ci++]);
    if (!this.arrived && !this.state.split && this.keys) Object.assign(this.heart, this.heartAt(this.t));
    // Camera:Heart の後ろにスプリング追従
    const lag = Config.gacha.camera.followLag;
    const k = 1 - Math.pow(0.001, dt / Math.max(0.05, lag));
    if (!this.arrived) {
      const tz = this.state.split ? Z.gates[0] - 0.2 : this.heart.z - 0.55;
      this.cam.z = lerp(this.cam.z, Math.max(-0.05, tz), k);
      this.cam.y = lerp(this.cam.y, this.heart.y - 0.02, k);
      this.cam.x = lerp(this.cam.x, this.heart.x * 0.6, k);
    }
    if (this.sub) this.sub.update(dt);
    this.state.heartScale = lerp(this.state.heartScale, 1, 1 - Math.pow(0.02, dt));
    const moving = !this.state.freeze && !this.arrived;
    this.state.speedLines = lerp(this.state.speedLines, moving ? (this.speed > 1 ? 1 : 0.6) : 0, 1 - Math.pow(0.05, dt));
  }

  /** timeline の1キュー */
  cue(c) {
    const s = this.state, p = c.params, T = Config.gacha.timing;
    switch (c.cue) {
      case 'gate': {
        this.passed.add(p.index);
        const pos = this.project(0, 0, Z.gates[p.index]);
        const metallic = p.color === 'SR';
        this.audio?.chime?.(p.index, metallic);
        if (p.goldify) s.color = 'SR';          // Gate の輪が内側から Gold に染まり、その光が Heart に移る
        if (pos) this.burst(pos.x, pos.y, p.color === 'SR' ? '#ffd23e' : '#8fd8ff', 14 * (1 + p.index * 0.4), 3);
        Haptic.light();
        break;
      }
      case 'stop':
        s.freeze = true; s.protectedFrom = c.t; s.protectedUntil = (this.cues.find((x) => x.cue === 'rainbowGate')?.t ?? c.t) + 0.3;
        this.speed = 1;
        break;
      case 'selfPulse':
        s.freeze = true; s.protectedFrom = c.t; s.protectedUntil = (this.cues.find((x) => x.cue === 'rainbowGate')?.t ?? c.t) + 0.3;
        this.speed = 1; s.heartScale = 1.35; s.gateWarp = 0.25;
        { const pos = this.heartScreenPos(); this.burst(pos.x, pos.y, '#ffffff', 16, 2.5, 'ring'); }
        break;
      case 'silence':
        s.dim = 0.45; this.audio?.duckBgm?.(0.1, 0.15);
        break;
      case 'heartbeat':
        s.heartScale = 1.25 + (p.n === 2 ? 0.1 : 0);
        s.gateWarp += 0.25;
        this.audio?.heartbeat?.({ variant: 'gachaSSR', count: 1, volume: p.n === 2 ? 1.5 : 1.2 });
        if (p.leak) s.leak = 1;
        break;
      case 'rainbowGate':
        s.rainbowGate = { side: p.side ?? 0, born: this.t };
        s.gateHidden[2] = true;
        this.audio?.glissando?.();
        break;
      case 'accel':
        s.freeze = false; s.rainbow = true; s.dim = 0.2;
        break;
      case 'curve':
        s.freeze = false; s.rainbow = true; s.dim = 0.2;
        break;
      case 'flash':
        s.rainbow = true; s.dim = 0;
        this.flash(0.35);
        this.audio?.rainbowChord?.(); this.audio?.duckBgm?.(1, 0.4);
        Haptic.medium();
        break;
      case 'arrival':
        this.arrived = true;
        this.speed = 1;
        this.startCatch(this.plan.items[0], T.catch);
        break;
      case 'catch': break;
      case 'burst': this.popHeart(this.plan.items[0]); break;
      case 'reveal': this.showReveal(this.plan.items[0], { uiDelay: p.uiDelay }); this.revealing = true; break;
      case 'tapReady': this.tapReady = true; this.rv.querySelector('.ga-tapnext').hidden = false; break;
      // ---- 10連 ----
      case 'split': this.splitHeart(); break;
      case 'glintEnd': s.glint = false; break;
      case 'silhouettes': this.showRows(); break;
      case 'revealItem': this.root.querySelector('.ga-rows').hidden = true; this.revealItem(this.plan.items[p.drawIndex], p); break;
      case 'list': this.finish(false); break;
    }
  }

  flash(sec) {
    const f = this.flashEl;
    f.style.transition = 'none'; f.style.opacity = '1';
    requestAnimationFrame(() => { f.style.transition = `opacity ${sec}s ease-out`; f.style.opacity = '0'; });
  }

  // ---------------- ARRIVAL → Catch → Burst → Reveal ----------------
  figureFor(it) {
    const ch = characterById(it.characterId);
    const P = it.presentation.reveal;
    const hFrac = it.finalRarity === 'SSR' ? P.heightSSR : it.finalRarity === 'SR' ? P.heightSR : P.heightR;
    const pose = ch.gacha?.revealPose ?? { x: 0, y: 0, scale: 1 };
    const h = this.H * hFrac * (pose.scale ?? 1), w = h * (2 / 3);
    const bottom = this.H * 0.77 + (pose.y ?? 0) * this.H;
    const left = this.W / 2 - w / 2 + (pose.x ?? 0) * this.W;
    const cp = ch.gacha?.catchPoint ?? { u: 0.5, v: 0.45 };
    return { ch, w, h, left, top: bottom - h, catchX: left + cp.u * w, catchY: bottom - h + cp.v * h };
  }
  /** シルエットが光の中に立ち、Heart が手元の光点へ吸い込まれる */
  startCatch(it, dur) {
    const f = this.figureFor(it);
    this.layoutFigure(it, f);
    this.rv.hidden = false;
    this.rv.classList.remove('revealed', 'ui', 'sink');
    this.rv.querySelector('.ga-info').hidden = true;
    this.rv.querySelector('.ga-bubble').hidden = true;
    this.rv.querySelector('.ga-tapnext').hidden = true;
    const from = this.heartScreenPos();
    this.catchAnim = { from, to: { x: f.catchX, y: f.catchY }, t0: performance.now(), dur: dur * 1000, r0: Math.max(10, this.heartRadiusPx()) };
  }
  layoutFigure(it, f) {
    const fig = this.rv.querySelector('.ga-fig');
    Object.assign(fig.style, { left: `${f.left}px`, top: `${f.top}px`, width: `${f.w}px`, height: `${f.h}px` });
    const url = artUrl(f.ch, 'cutout');
    for (const im of fig.querySelectorAll('img')) if (im.getAttribute('src') !== url) im.src = url;
    const c = fig.querySelector('.ga-catch');
    c.style.left = `${f.catchX - f.left}px`; c.style.top = `${f.catchY - f.top}px`;
    this.rv.dataset.rarity = it.finalRarity;
    this.rv.style.setProperty('--ac', ATTRIBUTES[f.ch.attribute].color);
  }
  popHeart(it) {
    this.catchAnim = null;
    this.heart.visible = false;
    const f = this.figureFor(it);
    const col = it.finalRarity === 'SSR' ? null : it.finalRarity === 'SR' ? '#ffd23e' : '#ff9ccc';
    this.burst(f.catchX, f.catchY, col, it.finalRarity === 'SSR' ? 40 : it.finalRarity === 'SR' ? 26 : 18, 5, 'heart');
    this.rv.classList.add('sink');
    this.audio?.pofu?.();
    Haptic.light();
  }
  /** 全身 Reveal + 下 1/4 に RARITY / 名前 / 属性・タイプ / NEW! + 一言(SSR は少し遅れて文字を出す)*/
  showReveal(it, { uiDelay = 0, instant = false, short = false } = {}) {
    const f = this.figureFor(it);
    this.layoutFigure(it, f);
    this.rv.hidden = false;
    if (instant) this.rv.classList.add('sink');
    this.rv.classList.add('revealed');
    const info = this.rv.querySelector('.ga-info');
    const ch = f.ch;
    info.querySelector('.gi-rank').textContent = RANKS[ch.rank].id;
    info.querySelector('.gi-rank').style.color = RANKS[ch.rank].color;
    info.querySelector('.gi-name').textContent = ch.name;
    info.querySelector('.gi-meta').textContent = `${ATTRIBUTES[ch.attribute].label} / ${TYPES[ch.type].label}`;
    info.querySelector('.gi-new').hidden = !it.isNew;
    const line = this.obtainLine(it);
    const b = this.rv.querySelector('.ga-bubble');
    b.textContent = line;
    b.style.left = `${Math.min(this.W - 190, f.left + f.w * 0.62)}px`; b.style.top = `${f.top + f.h * 0.12}px`;
    clearTimeout(this.uiTimer);
    info.hidden = true; b.hidden = true;
    this.uiTimer = setTimeout(() => { info.hidden = false; b.hidden = !line || short; this.rv.classList.add('ui'); }, uiDelay * 1000);
    if (it.finalRarity === 'SSR') Haptic.medium();
  }
  /** 獲得セリフ:firstTime(初獲得)→ default → レアリティ共通(HOME のセリフとは別管理)*/
  obtainLine(it) {
    const d = characterById(it.characterId).gacha?.obtainDialogue ?? {};
    return (it.isNew && d.firstTime) || d.default || RARITY_OBTAIN_LINES[it.finalRarity] || '';
  }

  // ---------------- 10連 ----------------
  splitHeart() {
    const s = this.state;
    s.split = true; s.glint = true;
    const pos = this.heartScreenPos();
    this.heart.visible = false;
    const n = this.plan.items.length;
    const order = this.plan.items.map((x, i) => i).sort(() => Math.random() - 0.5);   // 並びは Reveal 順と無関係にシャッフル
    this.fragments = order.map((i, k) => {
      const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.28;
      const gate = Math.floor(k / 2);
      return { item: this.plan.items[i], x: pos.x, y: pos.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 120, gate, glint: this.plan.items[i].fragmentGlint, born: this.t };
    });
    this.burst(pos.x, pos.y, '#ffffff', 24, 4, 'ring');
    this.audio?.chime?.(3, false);
  }
  showRows() {
    const r = this.root.querySelector('.ga-rows');
    r.innerHTML = this.plan.items.map(() => '<i></i>').join('');
    r.hidden = false;
    this.fragments = [];
  }
  /** 10連の1人分(R 0.5秒 / SR 0.9秒 / SSR 3.5秒 / 昇格 SSR 4.5秒)。タップで次へ(SSR の静寂〜ドクンは除く)*/
  revealItem(it, p) {
    const dir = this;
    const T = Config.gacha.timing;
    const fast = this.plan.mode === 'FAST';
    const f = this.figureFor(it);
    this.layoutFigure(it, f);
    this.rv.hidden = false;
    this.rv.classList.remove('revealed', 'ui', 'sink');
    this.rv.querySelector('.ga-info').hidden = true; this.rv.querySelector('.ga-bubble').hidden = true; this.rv.querySelector('.ga-tapnext').hidden = true;
    this.state.rainbow = false; this.state.color = it.ssr ? (it.displayRarity === 'SR' ? 'SR' : 'R') : it.finalRarity;
    this.heart.visible = true;
    const t0 = this.t;
    const dur = p.dur;
    const steps = [];
    const at = (t, fn) => steps.push({ t, fn });
    const heartIn = (from, until) => { this.catchAnim = { from: { x: this.W / 2, y: -30 }, to: { x: f.catchX, y: f.catchY - (it.ssr ? 90 : 0) }, t0: performance.now(), dur: (until - from) * 1000, r0: 22 }; };
    if (!it.ssr) {
      const k = fast ? 0.3 / dur : 1;
      at(0, () => heartIn(0, 0.22 * k));
      at(0.24 * k, () => { this.popHeart(it); if (it.finalRarity === 'SR') this.burst(f.catchX, f.catchY, '#ffd23e', 20, 4, 'ring'); });
      at(0.28 * k, () => this.showReveal(it, { short: it.finalRarity === 'R' }));
    } else {
      const promo = it.promotion;
      const iv = p.beatInterval || T.ten.beatInterval;
      at(0, () => heartIn(0, 0.3));
      at(0.35, () => { this.catchAnim = null; this.heartHold = { x: f.catchX, y: f.catchY - 90 }; this.state.dim = 0.45; this.state.freeze = true; this.audio?.duckBgm?.(promo ? 0 : 0.1, 0.15); this.state.protectedFrom = this.t; this.state.protectedUntil = this.t + (promo ? 2.1 : 1.5); });
      at(0.9, () => { this.state.heartScale = 1.3; this.audio?.heartbeat?.({ variant: 'gachaSSR', count: promo ? 2 : 1, interval: iv }); });
      const rg = promo ? 0.9 + iv + 0.5 : 1.5;
      at(rg, () => { this.state.rainbowGate = { side: 0, born: this.t, screen: { x: f.catchX, y: f.catchY - 90 } }; this.state.rainbow = true; this.audio?.glissando?.(); });
      at(rg + 0.4, () => { this.state.freeze = false; this.heartHold = null; this.catchAnim = { from: { x: f.catchX, y: f.catchY - 90 }, to: { x: f.catchX, y: f.catchY }, t0: performance.now(), dur: 250, r0: 26 }; });
      at(rg + 0.7, () => { this.flash(0.35); this.state.dim = 0; this.state.rainbowGate = null; this.audio?.rainbowChord?.(); this.audio?.duckBgm?.(1, 0.3); this.popHeart(it); });
      at(rg + 0.8, () => this.showReveal(it, { uiDelay: T.ssrUiDelay }));
    }
    steps.sort((a, b) => a.t - b.t);
    this.sub = {
      i: 0,
      update() {
        const lt = dir.t - t0;
        while (this.i < steps.length && steps[this.i].t <= lt) steps[this.i++].fn();
        if (lt >= dur) this.end();
      },
      hurry() {
        // タップ:残りを飛ばして次へ(SSR の静寂〜ドクンは tap() 側で弾く)
        while (this.i < steps.length) steps[this.i++].fn();
        const next = dir.cues.find((x) => x.t > dir.t);
        if (next) dir.t = next.t - 0.001;
        this.end();
      },
      end() { if (dir.sub === this) dir.sub = null; dir.catchAnim = null; dir.heartHold = null; },
    };
  }

  // ---------------- 描画 ----------------
  project(x, y, z) {
    const zr = z - this.cam.z;
    if (zr < -0.12) return null;
    const s = 1 / (1 + Math.max(0, zr) * K);
    return { x: this.W / 2 + (x - this.cam.x) * this.W * 0.9 * s, y: this.H * 0.34 + (y - this.cam.y) * this.H * 0.52 * s, s };
  }

  burst(x, y, color, n, speed, kind = 'dot') {
    n = Math.round(n * (Config.gacha.particleScale ?? 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (40 + Math.random() * 90) * speed;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9 + Math.random() * 0.5, age: 0, color: color ?? RAINBOW[i % RAINBOW.length], size: 2 + Math.random() * 3, kind });
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  draw(dt) {
    const c = this.ctx, W = this.W, H = this.H, s = this.state;
    if (!s) return;
    const P = this.plan.items[0].presentation;
    // 空(爽やか)→ 静寂は青みの夜空へ少し暗く
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.sky.top); g.addColorStop(1, P.sky.bottom);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    this.drawClouds(c);
    this.drawDust(c, dt);
    if (s.speedLines > 0.05 && !reducedMotion()) this.drawSpeedLines(c, s.speedLines);
    if (this.phase === 'PLAY' || this.phase === 'ENTER' || this.phase === 'AWAIT_THROW') {
      for (let i = 2; i >= 0; i--) if (!s.gateHidden[i] && !(this.ten && i > 0)) this.drawGate(c, i);
      if (s.rainbowGate) this.drawRainbowGate(c);
      this.drawFragments(c, dt);
      this.drawHeart(c);
    }
    // Particle
    for (const p of this.particles) {
      if (!s.freeze) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
      const a = 1 - p.age / p.life;
      if (a <= 0) continue;
      c.globalAlpha = a;
      c.fillStyle = p.color;
      if (p.kind === 'heart') this.heartPath(c, p.x, p.y, p.size * 2.2), c.fill();
      else { c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill(); }
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.age < p.life);
    if (s.dim > 0.01) { c.fillStyle = `rgba(22,34,86,${s.dim})`; c.fillRect(0, 0, W, H); }
    if (this.phase === 'ENTER') { c.fillStyle = `rgba(255,255,255,${1 - clamp01(this.phaseT / Config.gacha.timing.enter)})`; c.fillRect(0, 0, W, H); }
  }

  drawClouds(c) {
    if (!this.clouds) {
      const o = document.createElement('canvas'); o.width = this.W; o.height = this.H;
      const x = o.getContext('2d');
      const blobs = [[0.12, 0.2, 60], [0.3, 0.16, 44], [0.85, 0.24, 70], [0.7, 0.12, 40], [0.5, 0.42, 90], [0.1, 0.55, 70], [0.95, 0.6, 80]];
      for (const [bx, by, r] of blobs) {
        const gg = x.createRadialGradient(bx * this.W, by * this.H, 0, bx * this.W, by * this.H, r * 1.4);
        gg.addColorStop(0, 'rgba(255,255,255,0.85)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gg; x.beginPath(); x.arc(bx * this.W, by * this.H, r * 1.4, 0, Math.PI * 2); x.fill();
      }
      this.clouds = o;
    }
    const off = (this.cam.z * 18) % 40;
    c.globalAlpha = 0.9; c.drawImage(this.clouds, 0, off * 0.2, this.W, this.H); c.globalAlpha = 1;
  }
  drawDust(c, dt) {
    if (!this.dust) this.dust = Array.from({ length: Math.round(22 * (Config.gacha.particleScale ?? 1)) }, () => ({ x: Math.random(), y: Math.random(), v: 0.01 + Math.random() * 0.02, r: 3 + Math.random() * 4 }));
    c.fillStyle = this.plan.items[0].presentation.sky.dust;
    for (const d of this.dust) {
      if (!this.state.freeze) { d.y -= d.v * dt; if (d.y < -0.05) d.y = 1.05; }   // 静寂では空中で止まる
      c.globalAlpha = 0.35; this.heartPath(c, d.x * this.W, d.y * this.H, d.r); c.fill();
    }
    c.globalAlpha = 1;
  }
  drawSpeedLines(c, k) {
    c.strokeStyle = `rgba(255,255,255,${0.5 * k})`; c.lineWidth = 2;
    const cx = this.W / 2, cy = this.H * 0.36, n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (this.t * 0.7 % 1);
      const r1 = Math.max(this.W, this.H) * (0.35 + ((i * 37) % 10) / 30), r2 = r1 + 60 + 80 * k;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke();
    }
  }
  gateColor(i) {
    const cols = this.plan.items[0].presentation.gates.colors;
    if (this.ten) return cols.R;
    const cue = this.cues.find((x) => x.cue === 'gate' && x.params.index === i);
    const passed = this.passed.has(i);
    const col = cue?.params.color ?? 'R';
    if (col === 'SR') return passed || i === 2 ? cols.SR : cols.R;   // SR:Gate 2 から Blue → Gold
    return col === 'white' ? cols.white : cols.R;
  }
  drawGate(c, i) {
    const p = this.project(0, 0, Z.gates[i]);
    if (!p) return;
    const cue = this.cues.find((x) => x.cue === 'gate' && x.params.index === i);
    let r = 0.28 * (cue?.params.big ? 1.25 : 1) * this.W * 0.9 * p.s;
    if (i === 2 && this.state.gateWarp) r *= 1 + this.state.gateWarp * (1 + Math.sin(this.t * 20) * 0.05);   // Heart の力で輪が押し広げられる
    const col = this.gateColor(i);
    c.lineWidth = Math.max(2, r * 0.16);
    c.strokeStyle = col; c.globalAlpha = this.passed.has(i) ? 0.35 : 0.95;
    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.stroke();
    c.lineWidth = Math.max(1, r * 0.05); c.strokeStyle = '#ffffff'; c.globalAlpha *= 0.8;
    c.beginPath(); c.arc(p.x, p.y, r * 0.86, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  drawRainbowGate(c) {
    const rg = this.state.rainbowGate;
    let x, y, r;
    const grow = ease(clamp01((this.t - rg.born) / 0.4));
    if (rg.screen) { x = rg.screen.x; y = rg.screen.y; r = 70 * grow; }
    else {
      const p = this.project(rg.side * 0.55, 0, Z.gates[2] + (rg.side ? 0.1 : 0));
      if (!p) return;
      x = p.x; y = p.y; r = 0.28 * this.plan.items[0].presentation.ssrGate.scale * this.W * 0.9 * p.s * grow;
    }
    const rot = this.t * this.plan.items[0].presentation.ssrGate.spin;
    c.lineWidth = Math.max(3, r * 0.14);
    for (let k = 0; k < RAINBOW.length; k++) {
      c.strokeStyle = RAINBOW[k];
      const a0 = rot + (k / RAINBOW.length) * Math.PI * 2;
      c.beginPath(); c.arc(x, y, r, a0, a0 + (Math.PI * 2) / RAINBOW.length + 0.02); c.stroke();
    }
  }
  heartPath(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y + r * 0.9);
    c.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
    c.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
    c.closePath();
  }
  drawHeart(c) {
    if (!this.heart.visible) return;
    const s = this.state;
    let pos, r;
    if (this.catchAnim) {
      const a = this.catchAnim, u = clamp01((performance.now() - a.t0) / a.dur);
      pos = { x: lerp(a.from.x, a.to.x, ease(u)), y: lerp(a.from.y, a.to.y, ease(u)) };
      r = lerp(a.r0, 12, u);
    } else if (this.heartHold) { pos = this.heartHold; r = 26; }
    else { pos = this.heartScreenPos(); r = this.heartRadiusPx(); }
    if (this.arrived && !this.catchAnim && !this.heartHold && !this.sub) return;
    r *= s.heartScale;
    // Trail(POWER で長さ・レアリティ段階で色)
    if (this.phase === 'PLAY' && !s.freeze) { this.trail.push({ x: pos.x, y: pos.y, r }); if (this.trail.length > 8 + Math.round(12 * this.throwP.strength)) this.trail.shift(); }
    for (let i = 0; i < this.trail.length; i++) {
      const tp = this.trail[i], a = (i + 1) / this.trail.length;
      c.globalAlpha = a * 0.45;
      c.fillStyle = s.rainbow ? RAINBOW[i % RAINBOW.length] : s.color === 'SR' ? '#ffd23e' : '#bfe9ff';
      c.beginPath(); c.arc(tp.x, tp.y, tp.r * 0.55 * a, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    // Glow
    const glowCol = s.rainbow ? 'rgba(255,255,255,0.9)' : s.color === 'SR' ? 'rgba(255,210,62,0.75)' : 'rgba(143,216,255,0.7)';
    const gg = c.createRadialGradient(pos.x, pos.y, r * 0.3, pos.x, pos.y, r * 2.4);
    gg.addColorStop(0, glowCol); gg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(pos.x, pos.y, r * 2.4, 0, Math.PI * 2); c.fill();
    // Rainbow Leak(2拍目:ヒビから虹が漏れる)
    if (s.leak && !s.rainbow) {
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9 + this.t * 0.6;
        c.strokeStyle = RAINBOW[k]; c.globalAlpha = 0.55; c.lineWidth = 3;
        c.beginPath(); c.moveTo(pos.x, pos.y); c.lineTo(pos.x + Math.cos(a) * r * 3, pos.y + Math.sin(a) * r * 3); c.stroke();
      }
      c.globalAlpha = 1;
    }
    // 本体
    if (s.rainbow) {
      const lg = c.createLinearGradient(pos.x - r, pos.y - r, pos.x + r, pos.y + r);
      RAINBOW.forEach((col, k) => lg.addColorStop(k / (RAINBOW.length - 1), col));
      c.fillStyle = lg;
    } else c.fillStyle = s.color === 'SR' ? '#ffcf4a' : '#ff8fc4';
    this.heartPath(c, pos.x, pos.y, r); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    this.heartPath(c, pos.x - r * 0.28, pos.y - r * 0.2, r * 0.32); c.fill();
    if (this.ten && !s.split && this.phase !== 'PLAY' || (this.ten && this.phase === 'PLAY' && !s.split)) {
      // 10人分のハート(内部で光の粒が回る)
      for (let k = 0; k < 10; k++) { const a = this.t * 2 + k * 0.63 + performance.now() / 900; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(pos.x + Math.cos(a) * r * 0.45, pos.y + Math.sin(a) * r * 0.35, 2.2, 0, Math.PI * 2); c.fill(); }
    }
  }
  drawFragments(c, dt) {
    if (!this.fragments.length) return;
    const s = this.state;
    const N = Config.gacha.timing.ten;
    for (const f of this.fragments) {
      const age = this.t - f.born;
      // 分裂 → 扇状に広がる → 5つの Gate(1 Gate に2個)へ吸い込まれて奥へ
      const flyU = clamp01((this.t - N.glintEnd) / (N.flyEnd - N.glintEnd));
      const gx = this.W * (0.18 + f.gate * 0.16), gy = this.H * 0.3;
      f.x += f.vx * dt * (1 - flyU); f.y += f.vy * dt * (1 - flyU);
      const x = lerp(f.x, gx, ease(flyU)), y = lerp(f.y, gy, ease(flyU));
      const r = 14 * (1 - flyU * 0.85);
      let col = '#ffffff';
      if (s.glint) col = f.glint === 'gold' ? '#ffd23e' : f.glint === 'rainbow' ? (age < 0.1 ? RAINBOW[Math.floor(age * 70) % 7] : '#ffd23e') : '#dff4ff';
      c.fillStyle = col; this.heartPath(c, x, y, r); c.fill();
      if (flyU > 0 && flyU < 1) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(gx, gy, 18, 0, Math.PI * 2); c.stroke(); }
    }
  }
}
