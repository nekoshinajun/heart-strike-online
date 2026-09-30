import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { glowTexture } from './Textures.js';

const LAYER = 1;   // ボス強調用の描画レイヤー

/**
 * HEART 50% 会話の「周囲が暗くなり、ボスだけが浮かび上がる」描画。
 *   1) いつも通りシーン全体を描く
 *   2) 画面全体に暗いレイヤー(量 = amount × Config.talk.dim)
 *   3) 深度をクリアして、強調するもの(ボス・ハート玉・ハートの粒)だけを暗転レイヤーの上にもう一度描く
 * → 黒い板を全体に置くのと違い、ボスは明るさを保ったまま、周り(床・Energy・障害物・背景)だけが暗くなる。
 * ボスの後ろにはごく弱い光(Glow)を置き、DOM の Vignette と合わせて視線をボスへ集める。
 * amount は実時間でフェード(on:fadeIn 秒 / off:fadeOut 秒)。
 */
export class Spotlight {
  constructor(g) {
    this.g = g;
    this.amount = 0;
    this.target = 0;
    this.dimScene = new THREE.Scene();
    this.dimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#05030c', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.overlay.position.z = -0.5;
    this.dimScene.add(this.overlay);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffc2e0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.renderOrder = 1;
    this.vig = document.getElementById('focusVig');
    this.emphasized = [];
  }

  get active() { return this.amount > 0.002; }

  /** on / off(フェードは update で)*/
  set(on) {
    const T = Config.talk;
    this.target = on ? 1 : 0;
    this.fade = on ? T.fadeIn : T.fadeOut;
    if (on) this.emphasize();
  }

  /** 強調するもの:ボス(表情オーバーレイ・回答エリア込み)・ハート玉・ハートの粒・投球前の予測ライン */
  emphasize() {
    const g = this.g;
    this.clearEmphasis();
    const list = [g.boss.root, g.ball.mesh, g.ball.glow, ...g.ball.trail.map((t) => t.sprite),
      ...g.effects.hearts.map((h) => h.s), ...g.effects.sparks.map((s) => s.s), ...g.preview.live.dots];
    for (const o of list) o.traverse((c) => c.layers.enable(LAYER));
    this.emphasized = list;
    // ボスの後ろの淡い光(ボスの子にしてボスと一緒に揺れる)
    const im = g.boss.view.imageMesh;
    const H = im ? im.geometry.parameters.height : 18;
    g.boss.view.body.add(this.glow);
    this.glow.position.set(0, H * 0.55, -0.6);
    this.glow.scale.set(H * 1.05, H * 1.2, 1);
    this.glow.layers.enable(LAYER);
  }

  clearEmphasis() {
    for (const o of this.emphasized) o.traverse((c) => c.layers.disable(LAYER));
    this.emphasized = [];
    this.glow.parent?.remove(this.glow);
  }

  update() {
    // フェードは実時間(フレームレートやヒットストップに左右されない)
    const now = performance.now();
    const realDt = Math.min(0.1, ((now - (this.last ?? now)) / 1000));
    this.last = now;
    if (this.amount !== this.target) {
      const step = realDt / Math.max(0.05, this.fade ?? 0.4);
      this.amount = this.target > this.amount ? Math.min(this.target, this.amount + step) : Math.max(this.target, this.amount - step);
      if (this.amount === 0 && this.target === 0) this.clearEmphasis();
    }
    const e = this.amount * this.amount * (3 - 2 * this.amount);   // smoothstep
    this.overlay.material.opacity = e * Config.talk.dim;
    this.glow.material.opacity = e * Config.talk.glow * (0.9 + Math.sin(performance.now() / 700) * 0.1);
    if (this.vig) this.vig.style.opacity = String(e);
    this.g.container.classList.toggle('talkmood', this.target > 0);
  }

  /** GameManager の描画から呼ぶ */
  render(renderer, scene, camera) {
    // 初回だけ暗転用の描画を空打ちしてシェーダーを先にコンパイル(50% 到達時の暗転開始が遅れないように)
    // (ボスを作り直したら warmed = false。強調レイヤーもフォグ無しで描くので、その組み合わせのシェーダーもここで作る)
    if (!this.active && !this.warmed) {
      this.warmed = true;
      this.emphasize();
      this.overlay.material.opacity = 0; this.glow.material.opacity = 0;
      this.renderPasses(renderer, scene, camera);
      this.clearEmphasis();
      return;
    }
    if (!this.active) { renderer.render(scene, camera); return; }
    this.renderPasses(renderer, scene, camera);
  }

  renderPasses(renderer, scene, camera) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clear();
    camera.layers.set(0);
    renderer.render(scene, camera);
    renderer.render(this.dimScene, this.dimCam);
    renderer.clearDepth();
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null;
    camera.layers.set(LAYER);
    renderer.render(scene, camera);
    camera.layers.set(0);
    scene.background = bg; scene.fog = fog;
    renderer.autoClear = auto;
  }
}
