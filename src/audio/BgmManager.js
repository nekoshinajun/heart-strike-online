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
const MAX_PAD_SEC = 0.2;
const CACHE_MAX = 2;           // デコード済みで持っておく曲数(1曲 約 50MB 前後)       // 先頭・末尾で無音として外すのはこの長さまで(曲の中の休符は外さない)

export class BgmManager {
  constructor(audio) {
    this.audio = audio;           // AudioManager(ctx を共有)
    this.volume = 0.5;            // ユーザー設定 0〜1
    this.muted = false;
    this.duckLevel = 1;
    this.cache = new Map();       // src → { buffer, loopStart, loopEnd }(直近 CACHE_MAX 曲)
    this.loading = new Map();     // src → Promise
    this.cycle = {};
    this.token = 0;
    this.current = null;          // { slot, src, source, gain, t0, offset, loopStart, loopEnd }
    this.positions = {};          // slot → { src, pos }(resume 用)
    this.holds = new Set();       // 一時停止の理由(ASMR 等)
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
        this.cache.set(src, entry);
        // メモリ節約:直近 CACHE_MAX 曲だけ持つ(HOME ⇄ バトルの往復で読み直さない)。再生中の曲は消さない
        for (const k of [...this.cache.keys()]) { if (this.cache.size <= CACHE_MAX) break; if (k !== src && k !== this.current?.src) this.cache.delete(k); }
        this.loading.delete(src);
        return entry;
      })
      .catch((e) => { this.loading.delete(src); throw e; });
    this.loading.set(src, p);
    return p;
  }

  /** 先読み(バトル開始前のタップ等)。失敗しても何もしない */
  preload(slot) { const t = this.pickTrack(slot); if (t && this.ctx) this.load(t.src).catch(() => {}); }

  /** AudioContext が使えるようになった(最初のタップ)時:待っていた場面の BGM を鳴らす */
  onUnlock() { if (this.wanted && !this.current && !this.pending && !this.holds.size) this.play(this.wanted, { resume: true }); }

  /**
   * 再生。同じ場面が鳴っている(または読み込み中)なら何もしない = 画面を切り替えても途切れない
   *   restart … 最初から(バトル開始・再戦)
   *   resume  … 前回止めた位置から(共通メニュー BGM:バトルから戻った時)
   */
  play(slot, { restart = false, resume = false } = {}) {
    if (!restart && (this.current?.slot === slot || this.pending === slot)) { this.wanted = slot; return; }   // 二重再生しない
    this.stop(0.25);
    this.wanted = slot;                                       // まだ音を出せない(タップ前・一時停止中)なら、出せるようになった時に再生
    this.duckLevel = 1;           // 前の場面の一時的な音量下げ(会話・ガチャ演出)は持ち越さない
    this.applyGain(0);
    if (this.holds.size) return;                              // ASMR 再生中などは鳴らさない(解除時に再開)
    const track = this.pickTrack(slot);
    if (!track || !this.ctx) return;
    const saved = resume && !restart ? this.positions[slot] : null;
    const token = ++this.token;
    this.pending = slot;
    this.audio.resume?.();
    this.load(track.src).then((entry) => {
      if (token !== this.token) return;                       // 読み込み中に止められた / 別の曲に変わった
      const c = this.ctx, bus = this.bus();
      if (!c || !bus) return;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(track.gain ?? 1, c.currentTime + (saved ? 0.6 : 0.4));
      const source = c.createBufferSource();
      source.buffer = entry.buffer;
      source.loop = true;
      source.loopStart = entry.loopStart;
      source.loopEnd = entry.loopEnd;
      source.connect(gain).connect(bus);
      // 前回の位置(同じ曲の時だけ)から。ループ範囲の外なら先頭へ
      const offset = saved && saved.src === track.src && saved.pos >= entry.loopStart && saved.pos < entry.loopEnd ? saved.pos : entry.loopStart;
      source.start(0, offset);
      this.current = { slot, src: track.src, source, gain, t0: c.currentTime, offset, loopStart: entry.loopStart, loopEnd: entry.loopEnd };
      this.pending = null;
      Log.info('AUDIO', `bgm ${slot} ${track.src} @${offset.toFixed(2)}s`);
    }).catch((e) => { if (token === this.token) this.pending = null; Log.warn('AUDIO', 'bgm load failed', e?.message ?? e); });
  }

  /** 今の再生位置(秒)。ループを考慮 */
  position() {
    const cur = this.current, c = this.ctx;
    if (!cur || !c) return null;
    const len = cur.loopEnd - cur.loopStart;
    let pos = cur.offset + (c.currentTime - cur.t0);
    if (pos >= cur.loopEnd && len > 0) pos = cur.loopStart + ((pos - cur.loopStart) % len);
    return pos;
  }

  stop(fade = 0.4) {
    this.wanted = null;
    this.token++;                 // 読み込み中の再生も取り消す
    this.pending = null;
    const cur = this.current;
    if (cur) this.positions[cur.slot] = { src: cur.src, pos: this.position() };   // 次に resume で再開する位置
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

  /**
   * 一時停止(reason ごと。例:ASMR を再生している間)。全部解除されたら、止めた位置から再開
   */
  hold(reason) {
    if (this.holds.has(reason)) return;
    this.holds.add(reason);
    const slot = this.current?.slot ?? this.pending ?? this.wanted;
    this.stop(0.3);
    this.wanted = slot;
  }
  release(reason) {
    if (!this.holds.delete(reason) || this.holds.size) return;
    if (this.wanted) this.play(this.wanted, { resume: true });
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
