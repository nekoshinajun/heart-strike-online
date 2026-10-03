import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { heartTexture } from './Textures.js';
import { farCastles, archBridge, cloudSea, pathTiles, pathEdge, ribbonPillar, roseBush, floatIsland, petal } from './Painted.js';

/**
 * 戦闘の背景(2.5D):奥行きの違う位置に「2D の絵の板」を重ねる。ゲームの計算(軌道・判定)は 3D のまま。
 *   空(グラデーション)→ 遠景のお城と浮島 → 中景のアーチ橋 → 雲の海 + 石畳の道 → 道の脇のリボンの柱・バラ → 舞う花びら
 * カメラが動くと板ごとにずれて見える(視差)ので、平らな絵でも奥行きが出る。開幕の全体図(OpeningState)でいちばん効く。
 * 絵は今は Painted.js の仮の絵。本番イラストに差し替える時は Painted.js の各関数だけを替える。
 * 読みやすさ:ゲートやノーツの後ろになる空は中くらいの明るさのラベンダーに抑え、明るい色は地平線と足元だけ。
 */
const SKY = { zenith: '#6f5fc8', mid: '#b48fe0', horizon: '#ffd9ec' };
const FOG = '#f1d2ef';
const HEART_TINTS = ['#ffb3d6', '#d9c2ff', '#ffd9a8', '#ffc9e4'];

export class Arena {
  constructor(scene) {
    this.scene = scene;
    scene.background = new THREE.Color(SKY.mid);
    scene.fog = new THREE.Fog(FOG, 30, 95);

    // ライト(ゲート・障害物・ボール用。背景の板はライトの影響を受けない)
    scene.add(new THREE.HemisphereLight('#fff0fa', '#b8a0e8', 1.1));
    const key = new THREE.DirectionalLight('#fff6fb', 1.4);
    key.position.set(4, 14, 12);
    scene.add(key);

    this.buildSky();
    this.buildBackdrops();
    this.buildGround();
    this.buildProps();
    this.buildPetals();
    this.buildHearts();
  }

  // ---------------- 空 ----------------
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uZenith: { value: new THREE.Color(SKY.zenith) }, uMid: { value: new THREE.Color(SKY.mid) }, uHorizon: { value: new THREE.Color(SKY.horizon) } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith, uMid, uHorizon;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.3, h));
          c = mix(c, uZenith, smoothstep(0.3, 0.9, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), mat);
    sky.renderOrder = -20;
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  /** 絵の板(背景用:ライト・フォグ無し、奥から順に描く) */
  board(map, w, h, x, y, z, order, opts = {}) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, ...opts })
    );
    m.position.set(x, y + h / 2, z);
    m.renderOrder = order;
    this.scene.add(m);
    return m;
  }

  // ---------------- 遠景・中景 ----------------
  buildBackdrops() {
    // 遠景:お城と浮島(地平線の少し下から立ち上がる)
    this.board(farCastles(), 260, 104, 0, -18, -120, -15);
    // 浮島(空の左右に浮かぶ。ゆっくり上下する)
    this.islands = [
      [-46, 30, -85, 22], [50, 34, -90, 26], [-30, 44, -100, 14], [34, 20, -70, 12],
    ].map(([x, y, z, s], i) => {
      const m = this.board(floatIsland(), s, s, x, y, z, -14);
      m.userData = { y0: m.position.y, ph: i * 1.7 };
      return m;
    });
    // 中景:アーチ橋(ボスの奥)
    this.board(archBridge(), 200, 50, 0, -10, -62, -12);
  }

  // ---------------- 足元:雲の海 + 石畳の道 ----------------
  buildGround() {
    const sea = cloudSea();
    sea.repeat.set(14, 14);
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: sea, fog: true }));
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.y = -0.6;
    this.scene.add(cloud);

    // 道:手前(z 12)からボスの奥(z -58)まで
    const z0 = 12, z1 = -58, len = z0 - z1, W = 8;
    const tiles = pathTiles().clone();
    tiles.needsUpdate = true;
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    tiles.repeat.set(2, len / 4);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(W, len), new THREE.MeshBasicMaterial({ map: tiles }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0, z0 - len / 2);
    this.scene.add(path);
    const edgeTex = pathEdge().clone();
    edgeTex.needsUpdate = true;
    edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
    edgeTex.repeat.set(1, len / 3);
    for (const x of [-W / 2, W / 2]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.45, len), new THREE.MeshBasicMaterial({ map: edgeTex }));
      e.rotation.x = -Math.PI / 2;
      e.position.set(x, 0.01, z0 - len / 2);
      this.scene.add(e);
    }

    // ボスの足元:ふんわり光るハートの魔法陣
    const bz = Config.boss.z;
    const s = Config.boss.scale / 1.15;
    this.pit = new THREE.Mesh(
      new THREE.RingGeometry(5.2 * s, 6.0 * s, 48),
      new THREE.MeshBasicMaterial({ color: '#ff9fcf', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
    );
    this.pit.rotation.x = -Math.PI / 2;
    this.pit.position.set(0, 0.03, bz);
    this.scene.add(this.pit);
  }

  // ---------------- 道の脇:リボンの柱とバラ(いつもカメラの方を向く板)----------------
  buildProps() {
    const pillar = new THREE.SpriteMaterial({ map: ribbonPillar(), transparent: true, depthWrite: false });
    const rose = new THREE.SpriteMaterial({ map: roseBush(), transparent: true, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const z = 4 - i * 9;
      for (const x of [-7.4, 7.4]) {
        const p = new THREE.Sprite(pillar);
        p.center.set(0.5, 0);
        p.scale.set(3.2, 8, 1);
        p.position.set(x, 0, z);
        this.scene.add(p);
        const r = new THREE.Sprite(rose);
        r.center.set(0.5, 0.1);
        r.scale.set(4.4, 2.75, 1);
        r.position.set(x + Math.sign(x) * 1.6, -0.2, z + 2.5);
        this.scene.add(r);
      }
    }
  }

  // ---------------- 舞う花びら(1 回の描画)----------------
  buildPetals() {
    const N = 70;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 30;
      pos[i * 3 + 2] = 8 - Math.random() * 60;
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.petalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMap: { value: petal() }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
      vertexShader: /* glsl */`
        attribute float seed;
        uniform float uTime, uPR;
        varying float vRot;
        void main() {
          vec3 p = position;
          float t = uTime + seed;
          p.y = mod(p.y - t * 0.9, 30.0);              // ゆっくり落ちる(上へ戻ってくり返す)
          p.x += sin(t * 0.7) * 1.5;
          p.z += cos(t * 0.5) * 1.0;
          vRot = t * 1.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPR * 260.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying float vRot;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float s = sin(vRot), k = cos(vRot);
          vec4 col = texture2D(uMap, vec2(k * c.x - s * c.y, s * c.x + k * c.y) + 0.5);
          if (col.a < 0.05) discard;
          gl_FragColor = vec4(col.rgb, col.a * 0.8);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(geo, this.petalMat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  // ---------------- ゆっくり昇るハート(レーンの外だけ)----------------
  buildHearts() {
    const tex = heartTexture();
    this.hearts = [];
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const mat = new THREE.SpriteMaterial({ map: tex, color: HEART_TINTS[i % HEART_TINTS.length], transparent: true, opacity: 0.6, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.7 + ((i * 37) % 10) / 10);
      s.position.set(side * (9 + ((i * 53) % 70) / 10), (i * 29) % 26, -4 - ((i * 71) % 34));
      s.userData = { x0: s.position.x, speed: 0.6 + ((i * 13) % 7) / 10, ph: i * 0.9 };
      this.scene.add(s);
      this.hearts.push(s);
    }
  }

  update(dt, t) {
    this.pit.material.opacity = 0.45 + Math.sin(t * 3) * 0.2;
    this.petalMat.uniforms.uTime.value = t;
    for (const m of this.islands) m.position.y = m.userData.y0 + Math.sin(t * 0.4 + m.userData.ph) * 0.8;
    for (const h of this.hearts) {
      const u = h.userData;
      h.position.y += u.speed * dt;
      if (h.position.y > 26) h.position.y = -1;
      h.position.x = u.x0 + Math.sin(t * 0.8 + u.ph) * 0.5;
      h.material.opacity = 0.6 * Math.min(1, (h.position.y + 1) / 3, (26 - h.position.y) / 6);
    }
  }
}
