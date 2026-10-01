import { BGM_SLOTS } from './BgmTracks.js';
import { Config } from '../core/Config.js';
import { Log } from '../app/Platform.js';

/**
 * BgmManager:BGM ファイルの再生を一元管理する(場面 = slot 単位。同時に鳴るのは常に1曲だけ)
 *   play(slot, { restart })  … その場面の曲を再生(同じ場面が鳴っていれば何もしない。restart で最初から)
 *   stop(fade)               … 停止(フェードアウト)
 *   setVolume(v) / setMuted(m) … ユーザー設定(設定画面)。音量 = v × Config.audio.bgmVolume(上限)
 *   duck(level, fade)        … 会話中などに一時的に下げる(1 = 元に戻す)
 *
 * 再生は WebAudio(AudioBufferSourceNode の loop)。
 *   - iPhone Safari は <audio> の volume を変えられないので、音量は GainNode で掛ける
 *   - <audio loop> はつなぎ目に隙間が出やすいので、デコード済みの音をサンプル単位でループする
 *   - 復号器が先頭・末尾に足す完全な無音(デジタル無音)だけはループ範囲から外す。音源そのものは加工しない
 * AudioContext は AudioManager と共有(ユーザー操作の中で unlock 済みのもの)。
 */
const SILENCE = 1e-5;          // これ以下は「完全な無音」(復号器の詰め物)
const MAX_PAD_SEC = 0.2;       // 先頭・末尾で無音として外すのはこの長さまで(曲の中の休符は外さない)

export class BgmManager {
  constructor(audio) {
    this.audio = audio;           // AudioManager(ctx を共有)
    this.volume = 0.5;            // ユーザー設定 0〜1
    this.muted = false;
    this.duckLevel = 1;
    this.cache = new Map();       // src → { buffer, loopStart, loopEnd }(直近の曲だけ持つ)
    this.loading = new Map();     // src → Promise
    this.cycle = {};
    this.token = 0;
    this.current = null;          // { slot, src, source, gain }
  }

  get ctx() { return this.audio?.ctx ?? null; }

  /** 出力:曲ごとの gain → BGM バス → スピーカー(効果音の master とは別系統)*/
  bus() {
    const c = this.ctx;
    if (!c) return null;
    if (!this.busGain || this.busGain.context !== c) {
      this.busGain = c.createGain();
      this.busGain.gain.value = this.targetGain();
      this.busGain.connect(c.destination);
    }
    return this.busGain;
  }
  targetGain() {
    if (this.muted || Config.audio.bgm === false) return 0;
    return Math.max(0, Math.min(1, this.volume)) * (Config.audio.bgmVolume ?? 0.4) * this.duckLevel;
  }
  applyGain(fade = 0.15) {
    const g = this.busGain, c = this.ctx;
    if (!g || !c) return;
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(this.targetGain(), t + fade);
  }

  setVolume(v) { this.volume = Math.max(0, Math.min(1, Number(v) || 0)); this.applyGain(); }
  setMuted(m) { this.muted = !!m; this.applyGain(); }
  duck(level = 1, fade = Config.audio.bgmFade ?? 0.5) { this.duckLevel = Math.max(0, Math.min(1, level)); this.applyGain(fade); }

  get playingSlot() { return this.current?.slot ?? null; }

  pickTrack(slot) {
    const S = BGM_SLOTS[slot];
    const list = (S?.tracks ?? []).filter((t) => t?.src);
    if (!list.length) return null;
    if (list.length === 1 || S.pick === 'first') return list[0];
    if (S.pick === 'cycle') { const i = (this.cycle[slot] = ((this.cycle[slot] ?? -1) + 1) % list.length); return list[i]; }
    return list[Math.floor(Math.random() * list.length)];
  }

  /** 曲を読み込んでデコード(1回だけ)。ループ範囲は先頭・末尾の完全な無音を外したもの */
  load(src) {
    if (this.cache.has(src)) return Promise.resolve(this.cache.get(src));
    if (this.loading.has(src)) return this.loading.get(src);
    const c = this.ctx;
    if (!c) return Promise.reject(new Error('no AudioContext'));
    const p = fetch(src).then((r) => { if (!r.ok) throw new Error(`BGM ${r.status} ${src}`); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const q = c.decodeAudioData(ab, res, rej); if (q?.then) q.then(res, rej); }))
      .then((buffer) => {
        const entry = { buffer, ...loopRange(buffer) };
        for (const k of [...this.cache.keys()]) if (k !== src && k !== this.current?.src) this.cache.delete(k);   // メモリ節約:直近の曲だけ
        this.cache.set(src, entry);
        this.loading.delete(src);
        return entry;
      })
      .catch((e) => { this.loading.delete(src); throw e; });
    this.loading.set(src, p);
    return p;
  }

  /** 先読み(バトル開始前のタップ等)。失敗しても何もしない */
  preload(slot) { const t = this.pickTrack(slot); if (t && this.ctx) this.load(t.src).catch(() => {}); }

  play(slot, { restart = false } = {}) {
    if (!restart && this.current?.slot === slot) return;     // 二重再生しない
    this.stop(0.25);
    this.duckLevel = 1;           // 前の場面の一時的な音量下げ(会話・ガチャ演出)は持ち越さない
    this.applyGain(0);
    const track = this.pickTrack(slot);
    if (!track || !this.ctx) return;
    const token = ++this.token;
    this.pending = slot;
    this.audio.resume?.();
    this.load(track.src).then((entry) => {
      if (token !== this.token) return;                       // 読み込み中に止められた / 別の曲に変わった
      const c = this.ctx, bus = this.bus();
      if (!c || !bus) return;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(track.gain ?? 1, c.currentTime + 0.4);
      const source = c.createBufferSource();
      source.buffer = entry.buffer;
      source.loop = true;
      source.loopStart = entry.loopStart;
      source.loopEnd = entry.loopEnd;
      source.connect(gain).connect(bus);
      source.start(0, entry.loopStart);
      this.current = { slot, src: track.src, source, gain };
      this.pending = null;
      Log.info('AUDIO', `bgm ${slot} ${track.src}`);
    }).catch((e) => { if (token === this.token) this.pending = null; Log.warn('AUDIO', 'bgm load failed', e?.message ?? e); });
  }

  stop(fade = 0.4) {
    this.token++;                 // 読み込み中の再生も取り消す
    this.pending = null;
    const cur = this.current;
    this.current = null;
    if (!cur || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + fade);
      cur.source.stop(t + fade + 0.02);
    } catch { /* 既に止まっている */ }
    setTimeout(() => { try { cur.source.disconnect(); cur.gain.disconnect(); } catch { /* noop */ } }, (fade + 0.2) * 1000);
  }
}

/** ループ範囲:先頭・末尾の「完全な無音」(MAX_PAD_SEC まで)を外す。曲中の音は外さない */
export function loopRange(buffer) {
  const n = buffer.length, sr = buffer.sampleRate, max = Math.floor(MAX_PAD_SEC * sr);
  const ch = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const loud = (i) => ch.some((d) => Math.abs(d[i]) > SILENCE);
  let a = 0; while (a < Math.min(max, n - 1) && !loud(a)) a++;
  let b = n - 1; while (b > Math.max(a, n - 1 - max) && !loud(b)) b--;
  if (a >= max) a = 0;                  // 長い無音は曲の一部として残す
  if (n - 1 - b >= max) b = n - 1;
  return { loopStart: a / sr, loopEnd: (b + 1) / sr };
}
