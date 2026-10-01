// WebAudio の効果音(合成)と BGM(ファイル。audio/BgmManager.js)。最初のタップで有効化。
// 音の系統:効果音 = master(SE)/ BGM = BgmManager のバス / ボイス = 将来用(voice)。それぞれ別に音量を持つ
import { Config } from '../core/Config.js';
import { Haptic } from '../app/Platform.js';
import { BgmManager } from '../audio/BgmManager.js';

const SE_MASTER = 0.35;   // 効果音の基準音量(従来値。SE 音量設定 1 のとき)

export class AudioManager {
  /** HeartbeatCue の Mood(count:拍数 / interval:間隔 / volume / reverb:残響 / grow:2拍目の強さ / haptic)*/
  static HEARTBEAT = {
    talk50: { count: 1, interval: 0.65, volume: 1, reverb: 0, grow: 1, haptic: null },
    gachaSSR: { count: 2, interval: 0.65, volume: 1.2, reverb: 0.35, grow: 1.25, haptic: 'medium' },
  };
  constructor() {
    this.ctx = null; this.muted = false;
    this.volumes = { se: 1, voice: 1 };   // ユーザー設定(0〜1)。BGM は this.bgm が持つ
    this.bgm = new BgmManager(this);
  }

  /** 系統ごとの音量(設定画面)。se は効果音の master に掛ける(1 = 従来どおり)。voice は将来のボイス用 */
  setVolume(kind, v) {
    const x = Math.max(0, Math.min(1, Number(v)));
    if (!Number.isFinite(x)) return;
    if (kind === 'bgm') { this.bgm.setVolume(x); return; }
    this.volumes[kind] = x;
    if (kind === 'se' && this.master) this.master.gain.value = SE_MASTER * x;
  }

  /** 最初のユーザー操作で呼ぶ。iOS はユーザー操作の中で resume + 無音再生しないと鳴らない */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = SE_MASTER * this.volumes.se;
        this.master.connect(this.ctx.destination);
      } catch { this.ctx = null; return; }
    }
    if (!this.primed) {
      try {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = b; src.connect(this.ctx.destination); src.start(0);
        this.primed = true;
      } catch { /* noop */ }
    }
    this.resume();
    this.bgm.onUnlock();
  }

  /** 一時停止(iOS のアプリ切替・着信など)からの復帰 */
  resume() {
    const c = this.ctx;
    if (c && (c.state === 'suspended' || c.state === 'interrupted')) c.resume().catch(() => {});
  }

  // ---------------- BGM(ファイル再生は BgmManager。ここは従来の呼び出し口)----------------
  /** 場面(slot)の BGM を再生。restart:最初から(再戦など)*/
  startBgm(slot = 'battle', opts = {}) { this.bgm.play(slot, opts); }
  stopBgm(fade = 0.6) { this.bgm.stop(fade); }
  /** 会話中などに BGM を level(0〜1)へ一時的に下げる。1 で元へ */
  duckBgm(level = 1, fade = Config.audio.bgmFade) { this.bgm.duck(level, fade); }

  /**
   * HeartbeatCue:「ドクン……」はブランドの共通 Cue(HEART 50% 会話 / ガチャ SSR)。音の芯は同じで、Mood だけ変える
   *   talk50   … 暗い・静か・恋愛的・緊張(残響なし、控えめ)
   *   gachaSSR … 静寂 → 期待 → 光の爆発(長い残響、2拍目を少し大きく)
   * @param o { variant, count, interval, volume, reverb, haptic, strength }
   */
  heartbeat(o = {}) {
    const V = { ...(AudioManager.HEARTBEAT[o.variant ?? 'talk50'] ?? AudioManager.HEARTBEAT.talk50), ...o };
    if (V.haptic) for (let i = 0; i < V.count; i++) setTimeout(() => Haptic.pulse(V.haptic === 'medium' ? 22 : 10), i * V.interval * 1000);
    if (!this.ctx || this.muted) return;
    const out = V.reverb > 0 ? this.reverbBus(V.reverb) : this.master;
    const base = Config.audio.dokunVolume * (V.volume ?? 1) * (o.strength ?? 1);
    const thump = (t0, vol) => {
      const t = this.ctx.currentTime + t0;
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(78, t); osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      f.type = 'lowpass'; f.frequency.value = 180;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(f).connect(g).connect(out); osc.start(t); osc.stop(t + 0.26);
    };
    for (let i = 0; i < V.count; i++) {
      const k = i > 0 ? V.grow ?? 1 : 1;
      thump(i * V.interval, 1.1 * base * k);
      thump(i * V.interval + 0.24, 0.75 * base * k);
    }
  }
  /** 残響(ガチャ SSR 用の長い余韻)*/
  reverbBus(amount) {
    if (!this.rvb) {
      const d = this.ctx.createDelay(1), fb = this.ctx.createGain(), wet = this.ctx.createGain(), inp = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
      d.delayTime.value = 0.19; fb.gain.value = 0.45; lp.type = 'lowpass'; lp.frequency.value = 900;
      inp.connect(this.master); inp.connect(d); d.connect(lp).connect(fb).connect(d); lp.connect(wet).connect(this.master);
      this.rvb = { inp, wet };
    }
    this.rvb.wet.gain.value = amount;
    return this.rvb.inp;
  }

  /** 心音「ドクン……」(HEART 50% 会話。v22 のタイミング・音量のまま = heartbeat({variant:'talk50'}))*/
  dokun(strength = 1) { this.heartbeat({ variant: 'talk50', strength }); }

  // ---- ガチャの音(仮:WebAudio 合成)----
  /** Gate 通過のチャイム(C → E → G と上がる)。metallic で SR の金属倍音 */
  chime(i = 0, metallic = false) {
    const f = [523.25, 659.25, 783.99, 1046.5][Math.min(3, i)];
    this.tone(f, 0.35, 'sine', 0.22); this.tone(f * 2, 0.2, 'sine', 0.06);
    if (metallic) { this.tone(f * 2.76, 0.45, 'triangle', 0.06); this.tone(f * 5.4, 0.3, 'sine', 0.03); }
  }
  whoosh(power = 0.5) { this.noise(0.28, 0.18 + power * 0.2, 1800 + power * 1600); this.tone(700, 0.15, 'sine', 0.12, 1.8); }
  charge(power) { this.tone(300 + power * 500, 0.05, 'sine', 0.05); }
  glissando() { if (!this.ctx) return; this.tone(220, 0.9, 'sawtooth', 0.05, 8); this.tone(330, 0.9, 'triangle', 0.08, 6); this.noise(0.8, 0.12, 5000); }
  rainbowChord() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 1.1, 'triangle', 0.13), i * 30)); }
  pofu() { this.noise(0.12, 0.35, 700); this.tone(420, 0.14, 'sine', 0.25, 0.7); setTimeout(() => [1568, 2093, 2637].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'sine', 0.08), i * 45)), 120); }

  tone(freq, dur, type = 'sine', vol = 0.5, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  noise(dur, vol = 0.4, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  partBreak() { this.noise(0.4, 0.7, 1800); [660, 880, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'square', 0.2), i * 60)); }
  orb(combo = 1) { this.tone(880 * Math.pow(1.12, Math.min(combo - 1, 8)), 0.12, 'sine', 0.3, 1.5); }
  heart(power = 1, perfect = false) {
    this.tone(660, 0.12, 'sine', 0.3, 1.5);
    setTimeout(() => this.tone(990, 0.16, 'triangle', 0.25), 60);
    if (perfect) setTimeout(() => this.tone(1320, 0.22, 'triangle', 0.25), 130);
    this.noise(0.12, 0.2 * power, 3000);
  }
  loveMax() { [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.25), i * 70)); }
  grab() { this.tone(420, 0.06, 'sine', 0.25, 1.4); }
  whiff() { this.tone(300, 0.25, 'sine', 0.2, 0.5); }
  throw(power) { this.noise(0.18, 0.3 * power, 2400); this.tone(500, 0.12, 'triangle', 0.15, 2); }
  hit(part, power) {
    this.noise(0.25, 0.6, part === 'head' ? 900 : 500);
    this.tone(part === 'head' ? 180 : 120, 0.3, 'square', 0.25 * power, 0.4);
  }
  bossSwing() { this.noise(0.3, 0.25, 700); }
  incoming() { this.tone(900, 0.08, 'square', 0.08); }
  judge(r) {
    if (r === 'PERFECT') { this.tone(880, 0.12, 'triangle', 0.4); setTimeout(() => this.tone(1320, 0.3, 'triangle', 0.35), 70); }
    else if (r === 'GREAT') this.tone(740, 0.2, 'triangle', 0.35);
    else if (r === 'GOOD') this.tone(560, 0.2, 'triangle', 0.3);
    else { this.tone(140, 0.35, 'sawtooth', 0.35, 0.5); this.noise(0.3, 0.5, 300); }
  }
  catchBall() { this.noise(0.1, 0.5, 1600); this.tone(300, 0.1, 'sine', 0.4, 0.6); }
  rallyUp() { this.tone(660, 0.1, 'square', 0.15); setTimeout(() => this.tone(990, 0.15, 'square', 0.15), 80); }
  clear() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'triangle', 0.35), i * 120)); }
}
