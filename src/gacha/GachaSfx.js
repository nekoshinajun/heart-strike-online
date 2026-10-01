import { Config } from '../core/Config.js';

/**
 * ガチャ演出の SE ポイント。正式な SE が入ったら Config.gacha.show.sfx[名前] にファイルを書くだけで差し替わる
 *   未設定(null)の間は AudioManager の合成音で鳴らす。音が無くても演出は成立する(映像だけで完結)
 */
export const GACHA_SFX = ['heartAppear', 'heartbeat', 'gather', 'crack', 'burst', 'charAppear', 'sr', 'ssrPromote', 'ssrConfirm', 'cardOpen', 'present'];

const FALLBACK = {
  heartAppear: (a) => a.tone?.(880, 0.18, 'sine', 0.18, 1.5),
  heartbeat: (a, s = 1) => a.heartbeat?.({ variant: 'gachaSSR', strength: s }),
  gather: (a) => a.glissando?.(),
  crack: (a) => { a.noise?.(0.12, 0.35, 3200); a.tone?.(1600, 0.08, 'triangle', 0.12, 0.6); },
  burst: (a) => { a.partBreak?.(); a.pofu?.(); },
  charAppear: (a) => a.chime?.(2),
  sr: (a) => [659, 880, 1175].forEach((f, i) => setTimeout(() => a.tone?.(f, 0.35, 'sine', 0.18), i * 90)),
  ssrPromote: (a) => a.dokun?.(1.4),
  ssrConfirm: (a) => { a.rainbowChord?.(); setTimeout(() => a.loveMax?.(), 260); },
  cardOpen: (a) => a.tone?.(1046, 0.1, 'sine', 0.14, 1.2),
  present: (a) => a.tone?.(1318, 0.06, 'sine', 0.08),
};

export class GachaSfx {
  constructor(audio) { this.audio = audio; this.cache = new Map(); }
  play(name, strength = 1) {
    try {
      const src = Config.gacha.show?.sfx?.[name];
      if (src) {
        let base = this.cache.get(src);
        if (!base) { base = new Audio(src); base.preload = 'auto'; this.cache.set(src, base); }
        const a = base.cloneNode(); a.volume = Math.min(1, 0.9 * strength); a.play().catch(() => {});
        return;
      }
      if (this.audio) FALLBACK[name]?.(this.audio, strength);
    } catch { /* 音は鳴らなくても演出は続ける */ }
  }
}
