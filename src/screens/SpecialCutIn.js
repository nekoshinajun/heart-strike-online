import { Config } from '../core/Config.js';
import { ATTRIBUTES } from '../data/GameData.js';
import { artUrl } from '../data/CharacterArt.js';

/**
 * SPECIAL 使用時のキャラクターカットイン(DOM)。
 *   画面を暗く → キャラが画面外から高速で入る → 少しオーバーシュート → 一瞬ドアップ → 白フラッシュ → 高速で消える
 * 画像は CurrentCharacter の CharacterData.art.specialCutIn から取得(固定画像は持たない)。
 * 表示範囲は画像を加工せず、CharacterData.cutIn(faceX/faceY/x/y/scale/rot)で配置・拡大・回転して決める。
 * アニメーションは Web Animations(実時間)で動くので、ゲームの TimeScale を落としても速度は変わらない(Unscaled)。
 */
export class SpecialCutIn {
  constructor(root) {
    this.root = root;
    const el = document.createElement('div');
    el.id = 'cutin';
    el.hidden = true;
    el.innerHTML = `<div class="ci-dim"></div><div class="ci-band"><i></i></div>
      <div class="ci-mask"><div class="ci-char"><img alt=""></div></div>
      <div class="ci-text"><b></b><span>SPECIAL HEART!</span></div><div class="ci-flash"></div>`;
    root.appendChild(el);
    this.el = el;
    this.img = el.querySelector('img');
    this.charEl = el.querySelector('.ci-char');
    this.anims = [];
    this.token = 0;
  }

  get playing() { return this.active === true; }

  /** SPECIAL を予約した時に画像を先に読み込んでおく(表示はしない)*/
  preload(ch) {
    const url = ch ? artUrl(ch, 'specialCutIn') : null;
    if (!url || this.preloaded === url) return;
    this.preloaded = url;
    const im = new Image(); im.src = url; im.decode?.().catch(() => {});
  }

  /** OnCutInComplete の購読(DOM イベント 'cutincomplete' も発行する) */
  onComplete(fn) { this.el.addEventListener('cutincomplete', fn); }

  /**
   * @param ch     現在キャラ(CharacterData + 進行度)
   * @param onDone 終了時(= 発射タイミング)に呼ぶ
   * @returns 実際に表示したか
   */
  play(ch, onDone) {
    this.stop();
    const C = Config.special.cutIn;
    const url = artUrl(ch, 'specialCutIn');
    const dur = C.duration * 1000;
    if (!C.enabled || !url) { onDone?.(); return false; }

    const el = this.el;
    const W = this.root.clientWidth, H = this.root.clientHeight;
    const c = ch.cutIn ?? { faceX: 0.5, faceY: 0.2, x: 0.5, y: 0.35, scale: 1.8, rot: 0 };
    const iw = W * c.scale, ih = iw * 1.5;               // 縦長 2:3 の画像
    const left = c.x * W - c.faceX * iw, top = c.y * H - c.faceY * ih;
    const cs = this.charEl.style;
    cs.width = `${iw}px`; cs.height = `${ih}px`;
    cs.left = `${left}px`; cs.top = `${top}px`;
    cs.transformOrigin = `${c.faceX * 100}% ${c.faceY * 100}%`;   // 顔を中心に拡大・回転
    this.img.src = url;
    const color = ATTRIBUTES[ch.attribute]?.color ?? '#ff7ab8';
    el.style.setProperty('--cc', color);
    el.querySelector('.ci-text b').textContent = ch.name;
    el.hidden = false;

    const r = c.rot ?? 0;
    const T = (k) => `rotate(${r}deg) ${k}`;
    const fa = C.flashAt;
    const opt = { duration: dur, easing: 'linear', fill: 'forwards' };
    this.anims = [
      el.querySelector('.ci-dim').animate([
        { opacity: 0 }, { opacity: C.dim, offset: 0.12 }, { opacity: C.dim, offset: 0.82 }, { opacity: 0 },
      ], opt),
      el.querySelector('.ci-band').animate([
        { transform: 'skewY(-8deg) scaleY(0)', opacity: 1 },
        { transform: 'skewY(-8deg) scaleY(1)', opacity: 1, offset: 0.14 },
        { transform: 'skewY(-8deg) scaleY(1.05)', opacity: 1, offset: 0.8 },
        { transform: 'skewY(-8deg) scaleY(0)', opacity: 0 },
      ], opt),
      // 画面外(右)から高速で入る → オーバーシュート → 停止 → ぐっと寄る → 左へ高速で抜ける
      this.charEl.animate([
        { transform: T('translateX(115%) scale(1.02)'), opacity: 1, easing: 'cubic-bezier(.1,.8,.3,1)' },
        { transform: T('translateX(-5%) scale(1.02)'), offset: 0.2, easing: 'ease-out' },
        { transform: T('translateX(0) scale(1)'), offset: 0.3, easing: 'ease-in' },
        { transform: T('translateX(0) scale(1.1)'), offset: fa, opacity: 1, easing: 'ease-in' },
        { transform: T('translateX(-70%) scale(1.3)'), opacity: 0 },
      ], opt),
      el.querySelector('.ci-text').animate([
        { transform: 'translateX(-120%)', opacity: 0 },
        { transform: 'translateX(0)', opacity: 1, offset: 0.25 },
        { transform: 'translateX(4%)', opacity: 1, offset: 0.8 },
        { transform: 'translateX(40%)', opacity: 0 },
      ], opt),
      el.querySelector('.ci-flash').animate([
        { opacity: 0 }, { opacity: 0, offset: Math.max(0, fa - 0.04) }, { opacity: 0.9, offset: fa }, { opacity: 0 },
      ], opt),
    ];
    // 完了は固定タイマーではなくアニメーションの完了イベント(Animation.finished)で判定する。
    // → duration を変えても「キャラ画像が完全に消えた瞬間」に発射される
    const token = ++this.token;
    this.active = true;
    let done = false;
    const complete = (reason) => {
      if (done || token !== this.token) return;   // 途中で stop() された / 二重通知は無視
      done = true;
      clearTimeout(this.safety);
      this.active = false;
      this.el.hidden = true;
      for (const a of this.anims) a.cancel();
      this.anims = [];
      this.lastCompleteReason = reason;
      this.el.dispatchEvent(new CustomEvent('cutincomplete', { detail: { character: ch.id, reason } }));
      onDone?.();
    };
    Promise.all(this.anims.map((a) => a.finished)).then(() => complete('animation'), () => { /* stop() で中断 */ });
    // 保険:アニメーション完了イベントが届かない環境(タブ非表示等)でも止まらないように
    this.safety = setTimeout(() => complete('fallback'), dur + 1500);
    return true;
  }

  stop() {
    this.token = (this.token ?? 0) + 1;
    this.active = false;
    clearTimeout(this.safety);
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.el.hidden = true;
  }
}
