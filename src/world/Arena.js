import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';

// 簡易3Dアリーナ。奥行きを読み取りやすくするため、床グリッド・コートライン・奥へ並ぶ柱を配置。
export class Arena {
  constructor(scene) {
    this.scene = scene;
    const bg = new THREE.Color('#140f24');
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 18, 58);

    // ライト
    scene.add(new THREE.HemisphereLight('#9fa8ff', '#2a1530', 0.9));
    const key = new THREE.DirectionalLight('#fff1e0', 1.6);
    key.position.set(4, 14, 12);
    scene.add(key);
    const rimL = new THREE.PointLight('#ff3d7f', 60, 40, 1.6);
    rimL.position.set(-9, 12, -16);
    const rimR = new THREE.PointLight('#3dd6ff', 60, 40, 1.6);
    rimR.position.set(9, 12, -16);
    scene.add(rimL, rimR);

    // 床
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: '#221a3a', roughness: 0.85, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const grid = new THREE.GridHelper(120, 60, '#5b4a9a', '#3a2f63');
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    scene.add(grid);

    // コートライン(プレイヤー→ボスへ伸びるレーン)
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffe7a8', transparent: true, opacity: 0.8 });
    const bz = Config.boss.z;
    const laneLen = 8 - bz;
    for (const x of [-3.2, 3.2]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.08, laneLen), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.02, 8 - laneLen / 2);
      scene.add(l);
    }
    // 奥行きを感じる横ライン(ハート玉〜ボスの間に等間隔)
    const zs = [];
    for (let z = 3; z > bz + 3; z -= 4.2) zs.push(z);
    for (const z of zs) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.08), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(0, 0.02, z);
      scene.add(l);
    }

    // ボスの足元の発光ピット
    const pit = new THREE.Mesh(
      new THREE.RingGeometry(5.2 * Config.boss.scale / 1.15, 6.2 * Config.boss.scale / 1.15, 48),
      new THREE.MeshBasicMaterial({ color: '#ff3d7f', transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(0, 0.03, bz);
    scene.add(pit);
    this.pit = pit;

    // 奥へ並ぶ柱(パース強調)
    const pillarGeo = new THREE.BoxGeometry(1.4, 22, 1.4);
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#35285a', roughness: 0.6, flatShading: true });
    const capMat = new THREE.MeshBasicMaterial({ color: '#8e7bff' });
    for (let i = 0; i < 7; i++) {
      const z = 6 - i * 7;
      for (const x of [-10, 10]) {
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.set(x, 11, z);
        scene.add(p);
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 1.5), capMat);
        band.position.set(x, 3, z);
        scene.add(band);
      }
    }

    // 奥の壁(円弧)
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 34, 40, 40, 1, true, Math.PI * 0.75, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: '#2b1f4a', side: THREE.BackSide, roughness: 1 })
    );
    wall.position.set(0, 18, -4);
    scene.add(wall);
  }

  update(dt, t) {
    this.pit.material.opacity = 0.55 + Math.sin(t * 3) * 0.2;
  }
}
