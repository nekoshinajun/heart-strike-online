import * as THREE from '../lib/three.js';
import { glowTexture, heartTexture } from './Textures.js';

/** 3D空間のヒットエフェクト(火花・衝撃波リング)。オブジェクトプールで生成コストを抑える。 */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.sparks = [];
    for (let i = 0; i < 140; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      s.visible = false;
      s.renderOrder = 10;
      scene.add(s);
      this.sparks.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: 1 });
    }
    // ハートのパーティクル(ふわっと上へ舞う)
    this.hearts = [];
    for (let i = 0; i < 120; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 11;
      scene.add(s);
      this.hearts.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: 1, spin: 0 });
    }
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1, 48),
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      m.visible = false;
      m.renderOrder = 10;
      scene.add(m);
      this.rings.push({ m, life: 0, max: 1, size: 1 });
    }
  }

  burst(pos, color, count = 30, speed = 12, size = 0.6) {
    let n = 0;
    for (const p of this.sparks) {
      if (p.life > 0) continue;
      p.s.visible = true;
      p.s.position.copy(pos);
      p.s.material.color.set(color);
      p.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.2).normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.max = p.life = 0.35 + Math.random() * 0.35;
      p.size = size * (0.5 + Math.random());
      if (++n >= count) break;
    }
  }

  /** ハートのパーティクル */
  heartBurst(pos, count = 20, speed = 6, size = 0.7, colors = ['#ff5fa2', '#ff9ccc', '#ffd23e', '#ffffff']) {
    let n = 0;
    for (const p of this.hearts) {
      if (p.life > 0) continue;
      p.s.visible = true;
      p.s.position.copy(pos);
      p.s.material.color.set(colors[n % colors.length]);
      p.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.3).normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.max = p.life = 0.7 + Math.random() * 0.6;
      p.size = size * (0.6 + Math.random() * 0.8);
      if (++n >= count) break;
    }
  }

  shockwave(pos, color, size = 4, camera) {
    const r = this.rings.find((x) => x.life <= 0) ?? this.rings[0];
    r.m.visible = true;
    r.m.position.copy(pos);
    if (camera) r.m.quaternion.copy(camera.quaternion);
    r.m.material.color.set(color);
    r.max = r.life = 0.4;
    r.size = size;
  }

  update(dt) {
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 18 * dt;
      p.v.multiplyScalar(1 - dt * 2.5);
      p.s.position.addScaledVector(p.v, dt);
      const k = Math.max(0, p.life / p.max);
      p.s.scale.setScalar(p.size * k);
      p.s.material.opacity = k;
      if (p.life <= 0) p.s.visible = false;
    }
    for (const p of this.hearts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y += 2.5 * dt;                 // ふわっと浮く
      p.v.multiplyScalar(1 - dt * 1.8);
      p.s.position.addScaledVector(p.v, dt);
      const k = Math.max(0, p.life / p.max);
      p.s.scale.setScalar(p.size * (0.4 + 0.6 * Math.min(1, (1 - k) * 6)) * (k < 0.3 ? k / 0.3 : 1));
      p.s.material.opacity = Math.min(1, k * 2);
      if (p.life <= 0) p.s.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life / r.max);
      r.m.scale.setScalar(0.3 + r.size * (1 - Math.pow(1 - k, 3)));
      r.m.material.opacity = 1 - k;
      if (r.life <= 0) r.m.visible = false;
    }
  }
}
