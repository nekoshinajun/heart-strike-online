import * as THREE from '../lib/three.js';
import { glowTexture } from './Textures.js';

const DOTS = 70;

/**
 * 投球の予測軌道(デバッグ用)。Config.debug.showTrajectoryPreview で ON/OFF。
 *  - live  : 掴んでいる間「今離したらこう飛ぶ」を点線表示
 *  - ghost : 直前に投げた実際の軌道を薄く残す(練習用)
 */
export class TrajectoryPreview {
  constructor(scene) {
    this.live = this.makeSet(scene, 0.26, 1.0);
    this.ghost = this.makeSet(scene, 0.16, 0.4);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32),
      new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthTest: false, side: THREE.DoubleSide })
    );
    this.marker.renderOrder = 12;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  makeSet(scene, size, opacity) {
    const dots = [];
    for (let i = 0; i < DOTS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), transparent: true, depthWrite: false, opacity,
      }));
      s.scale.setScalar(size);
      s.visible = false;
      s.renderOrder = 11;
      scene.add(s);
      dots.push(s);
    }
    return { dots, opacity };
  }

  draw(set, points, color) {
    const step = Math.max(1, Math.ceil(points.length / DOTS));
    let n = 0;
    for (let i = 0; i < points.length && n < DOTS; i += step, n++) {
      const d = set.dots[n];
      d.visible = true;
      d.position.copy(points[i]);
      d.material.color.set(color);
      // 先頭が大きく、奥ほど一定(Perspectiveで自然に小さくなる)
      d.material.opacity = set.opacity * (n % 2 === 0 ? 1 : 0.55);
    }
    for (; n < DOTS; n++) set.dots[n].visible = false;
  }

  /** @param result BallPhysics の result(hit なら終点にマーカー) */
  showLive(points, result, camera) {
    const hit = result?.type === 'hit';
    this.draw(this.live, points, hit ? '#7dffb0' : '#ff7a8a');
    this.marker.visible = true;
    this.marker.position.copy(points[points.length - 1]);
    this.marker.quaternion.copy(camera.quaternion);
    this.marker.material.color.set(hit ? '#7dffb0' : '#ff7a8a');
  }

  /** ハート玉の直後だけの短い予測ライン(到達点マーカーなし) */
  showShort(points) {
    this.draw(this.live, points, '#ffffff');
    const vis = this.live.dots.filter((d) => d.visible);
    vis.forEach((d, i) => { d.material.opacity = this.live.opacity * (1 - i / Math.max(1, vis.length)) * 0.9; });
    this.marker.visible = false;
  }

  hideLive() {
    this.live.dots.forEach((d) => (d.visible = false));
    this.marker.visible = false;
  }

  showGhost(points) { this.draw(this.ghost, points, '#ffffff'); }
  hideGhost() { this.ghost.dots.forEach((d) => (d.visible = false)); }
}
