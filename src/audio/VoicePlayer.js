import { Log } from '../app/Platform.js';

/**
 * VoicePlayer:キャラクターボイス(短い音声ファイル)の再生。AudioManager の「voice」系統(音量 = 設定画面のボイス音量)
 *   preload(srcs)        … 先に読み込んでおく(バトル開始時。最初の反撃で待たないように)
 *   play(src) → Promise<秒 | null> … 再生開始。同時に鳴るのは常に1つだけ(前のボイスは止める)
 *                           読み込めない・AudioContext がまだ無い(タップ前)時は null(呼び出し側はボイス無しで進める)
 *   stop()               … 停止(読み込み中の再生も取り消す)
 *   level()              … 今の音の大きさ 0〜1(ボスの「喋っている」揺れに使う)
 *
 * 再生は WebAudio(BGM と同じ AudioContext。最初のタップで unlock 済みのもの)。
 *   iPhone Safari は <audio> の音量を変えられない・同時再生の制限があるので、GainNode で鳴らす
 */
export class VoicePlayer {
  constructor(audio) {
    this.audio = audio;           // AudioManager(ctx と音量を共有)
    this.cache = new Map();       // src → AudioBuffer(ボイスは短いので全部持つ)
    this.loading = new Map();     // src → Promise
    this.token = 0;
    this.current = null;          // { src, source, gain, analyser }
  }

  get ctx() { return this.audio?.ctx ?? null; }
  get volume() { return Math.max(0, Math.min(1, this.audio?.volumes?.voice ?? 1)); }
  get playing() { return !!this.current; }

  load(src) {
    if (this.cache.has(src)) return Promise.resolve(this.cache.get(src));
    if (this.loading.has(src)) return this.loading.get(src);
    const c = this.ctx;
    if (!c) return Promise.reject(new Error('no AudioContext'));
    const p = fetch(src).then((r) => { if (!r.ok) throw new Error(`voice ${r.status} ${src}`); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const q = c.decodeAudioData(ab, res, rej); if (q?.then) q.then(res, rej); }))
      .then((buf) => { this.cache.set(src, buf); this.loading.delete(src); return buf; })
      .catch((e) => { this.loading.delete(src); throw e; });
    this.loading.set(src, p);
    return p;
  }

  preload(srcs = []) { if (!this.ctx) return; for (const s of srcs) if (s) this.load(s).catch((e) => Log.warn('AUDIO', 'voice preload failed', e?.message ?? e)); }

  play(src) {
    this.stop();
    const token = ++this.token;
    if (!src || !this.ctx) return Promise.resolve(null);
    this.audio.resume?.();
    return this.load(src).then((buf) => {
      if (token !== this.token) return null;      // 読み込み中に止められた / 別のボイスに変わった
      const c = this.ctx;
      const gain = c.createGain();
      gain.gain.value = this.volume;
      const analyser = c.createAnalyser();
      analyser.fftSize = 512;
      const source = c.createBufferSource();
      source.buffer = buf;
      source.connect(gain).connect(c.destination);
      gain.connect(analyser);
      const cur = { src, source, gain, analyser, data: new Float32Array(analyser.fftSize) };
      source.onended = () => { if (this.current === cur) { this.current = null; this.disconnect(cur); } };
      source.start(0);
      this.current = cur;
      Log.info('AUDIO', `voice ${src} ${buf.duration.toFixed(2)}s`);
      return buf.duration;
    }).catch((e) => { Log.warn('AUDIO', 'voice play failed', e?.message ?? e); return null; });
  }

  stop() {
    this.token++;
    const cur = this.current;
    this.current = null;
    if (!cur) return;
    try { cur.source.onended = null; cur.source.stop(); } catch { /* 既に止まっている */ }
    this.disconnect(cur);
  }
  disconnect(cur) { try { cur.source.disconnect(); cur.gain.disconnect(); cur.analyser.disconnect(); } catch { /* noop */ } }

  /** 音量設定の変更を再生中のボイスにも反映 */
  applyVolume() { if (this.current) this.current.gain.gain.value = this.volume; }

  level() {
    const cur = this.current;
    if (!cur) return 0;
    cur.analyser.getFloatTimeDomainData(cur.data);
    let s = 0;
    for (const x of cur.data) s += x * x;
    return Math.min(1, Math.sqrt(s / cur.data.length) * 4);
  }
}
