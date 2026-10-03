import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { glowTexture, heartTexture } from './Textures.js';

/**
 * 戦闘の3Dアリーナ(ゆめかわ):パステルの夕焼け空 + ゆらぐオーロラ帯 + きらめく星 + ふわふわの雲 + 淡い虹 + 浮かぶハート。
 * 読みやすさ優先:空はゲート(ピンク)・エネルギー(シアン/黄)・白いリングより一段暗い藤色〜ラベンダーに抑え、
 *   明るいピンクは地平線(画面下 3 割あたり)だけ。浮かぶ飾りはレーンの外(|x| > 7)と遠景だけに置く。
 * 軽さ優先:ポストエフェクト無し。空は球1枚のシェーダー、星は Points 1回、雲・ハートは少数の Sprite。
 */
const SKY = {
  zenith: '#2a1f5c',    // 真上:夜の藤色
  mid: '#6a4fa8',       // ゲートの背景になる高さ:ラベンダー
  horizon: '#f3b5d6',   // 地平線:さくらピンク
  aurora: '#b6e4ff',    // 空にゆらぐ淡い水色の帯(加算で明るくするだけ)
};
const FOG = '#d9a6d8';
const STAR_COLORS = ['#ffffff', '#ffd6ec', '#d9ccff', '#c8fff1', '#fff3c4'];
const CLOUD_TINTS = ['#ffe3f1', '#efe2ff', '#e2f7ff', '#fff0f6'];
const HEART_TINTS = ['#ffb3d6', '#d9c2ff', '#b8f0e6', '#ffd9a8'];

export class Arena {
  constructor(scene) {
    this.scene = scene;
    scene.background = new THREE.Color(SKY.mid);
    scene.fog = new THREE.Fog(FOG, 22, 64);

    // ライト(ふんわり明るいパステル)
    scene.add(new THREE.HemisphereLight('#ffe8f6', '#a98fe0', 1.05));
    const key = new THREE.DirectionalLight('#fff4fb', 1.4);
    key.position.set(4, 14, 12);
    scene.add(key);
    const rimL = new THREE.PointLight('#ff8fc8', 55, 40, 1.6);
    rimL.position.set(-9, 12, -16);
    const rimR = new THREE.PointLight('#8fe6ff', 55, 40, 1.6);
    rimR.position.set(9, 12, -16);
    scene.add(rimL, rimR);

    this.buildSky();
    this.buildStars();
    this.buildRainbow();
    this.buildClouds();
    this.buildFloor();
    this.buildPillars();
    this.buildHearts();
  }

  // ---------------- 空:グラデーション + ゆらぐオーロラ帯 ----------------
  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(SKY.zenith) },
        uMid: { value: new THREE.Color(SKY.mid) },
        uHorizon: { value: new THREE.Color(SKY.horizon) },
        uAurora: { value: new THREE.Color(SKY.aurora) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith, uMid, uHorizon, uAurora;
        uniform float uTime;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.32, h));
          c = mix(c, uZenith, smoothstep(0.32, 0.85, h));
          // オーロラ帯(高さ 0.45〜0.7 の間をゆっくり波打つ)
          float a = atan(vDir.x, -vDir.z);
          float wave = 0.56 + sin(a * 3.0 + uTime * 0.15) * 0.05 + sin(a * 7.0 - uTime * 0.23) * 0.025;
          float band = exp(-pow((h - wave) / 0.07, 2.0));
          c += uAurora * band * 0.16;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  // ---------------- きらめく星(4方向の光芒)----------------
  buildStars() {
    const N = 180;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
    const c = new THREE.Color();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      // 空の上半分(地平線の少し上〜真上)。正面の真ん中(ゲートの通り道)は少しだけ薄く
      const az = (rnd() - 0.5) * Math.PI * 1.6;
      const el = 0.12 + Math.pow(rnd(), 0.8) * 1.3;
      const r = 80;
      pos[i * 3] = Math.sin(az) * Math.cos(el) * r;
      pos[i * 3 + 1] = Math.sin(el) * r;
      pos[i * 3 + 2] = -Math.cos(az) * Math.cos(el) * r;
      c.set(STAR_COLORS[i % STAR_COLORS.length]);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = rnd() < 0.12 ? 14 + rnd() * 6 : 5 + rnd() * 6;
      phase[i] = rnd() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMap: { value: sparkleTexture() }, uPR: { value: Math.min(window.devicePixelRatio || 1, 2) } },
      vertexShader: /* glsl */`
        attribute float size; attribute float phase; attribute vec3 color;
        uniform float uTime, uPR;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float tw = 0.5 + 0.5 * sin(uTime * (1.2 + fract(phase * 3.7) * 1.6) + phase);
          vColor = color;
          vAlpha = 0.35 + tw * 0.65;
          gl_PointSize = size * uPR * (0.7 + tw * 0.45);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const stars = new THREE.Points(geo, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    this.scene.add(stars);
  }

  // ---------------- 淡い虹(ボスの奥の遠景)----------------
  buildRainbow() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        vec3 band(float t) {
          vec3 a = vec3(1.0, 0.70, 0.82), b = vec3(1.0, 0.86, 0.66), c = vec3(1.0, 0.97, 0.70),
               d = vec3(0.72, 0.98, 0.84), e = vec3(0.70, 0.88, 1.0), f = vec3(0.82, 0.74, 1.0);
          t *= 5.0;
          if (t < 1.0) return mix(a, b, t);
          if (t < 2.0) return mix(b, c, t - 1.0);
          if (t < 3.0) return mix(c, d, t - 2.0);
          if (t < 4.0) return mix(d, e, t - 3.0);
          return mix(e, f, t - 4.0);
        }
        void main() {
          float r = vUv.y;   // 0 = 外周 / 1 = 内周(RingGeometry の uv を下で作り直す)
          float edge = smoothstep(0.0, 0.18, r) * smoothstep(1.0, 0.82, r);
          float foot = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);   // 両端は地平線に溶ける
          gl_FragColor = vec4(band(r), 0.32 * edge * foot);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const inner = 30, outer = 36, seg = 64;
    const geo = new THREE.RingGeometry(inner, outer, seg, 1, 0, Math.PI);
    // uv:x = 弧に沿った位置(0..1)、y = 外周 0 → 内周 1
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const ang = Math.atan2(y, x);
      uv.setXY(i, 1 - ang / Math.PI, (outer - Math.hypot(x, y)) / (outer - inner));
    }
    const rainbow = new THREE.Mesh(geo, mat);
    rainbow.position.set(0, -4, -70);
    rainbow.renderOrder = -8;
    this.scene.add(rainbow);
  }

  // ---------------- ふわふわの雲(地平線と両脇)----------------
  buildClouds() {
    const tex = cloudTexture();
    this.clouds = [];
    const spots = [
      // [x, y, z, 幅, 色]
      [-34, 3, -58, 30], [-20, 1, -66, 26], [26, 2, -60, 32], [48, 6, -46, 26],
      [-50, 7, -40, 24], [-26, 9, -30, 14], [28, 11, -28, 14], [40, 2, -66, 24],
    ];
    spots.forEach(([x, y, z, w], i) => {
      const mat = new THREE.SpriteMaterial({ map: tex, color: CLOUD_TINTS[i % CLOUD_TINTS.length], transparent: true, opacity: 0.75, depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat);
      s.scale.set(w, w * 0.42, 1);
      s.position.set(x, y, z);
      s.renderOrder = -7;
      s.userData = { x0: x, amp: 1.5 + (i % 3), speed: 0.05 + (i % 4) * 0.015, ph: i * 1.3 };
      this.scene.add(s);
      this.clouds.push(s);
    });
  }

  // ---------------- 床・レーン ----------------
  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: '#c7a8e6', roughness: 0.55, metalness: 0.15 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(140, 70, '#ffffff', '#ffc3e3');
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);

    // コートライン(プレイヤー→ボスへ伸びるレーン)
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
    const bz = Config.boss.z;
    const laneLen = 8 - bz;
    for (const x of [-3.2, 3.2]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, laneLen), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.02, 8 - laneLen / 2);
      this.scene.add(l);
    }
    // 奥行きを感じる横ライン(ハート玉〜ボスの間に等間隔)
    for (let z = 3; z > bz + 3; z -= 4.2) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.08), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(0, 0.02, z);
      this.scene.add(l);
    }

    // ボスの足元の光る輪(ピンク + 内側にミント)
    const s = Config.boss.scale / 1.15;
    const ring = (r0, r1, color, op) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(r0 * s, r1 * s, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.03, bz);
      this.scene.add(m);
      return m;
    };
    this.pit = ring(5.2, 6.2, '#ff8cc6', 0.7);
    this.pitInner = ring(4.4, 4.7, '#9ff0e0', 0.6);
  }

  // ---------------- 奥へ並ぶパステルの柱(パース強調)----------------
  buildPillars() {
    // 柱・飾りの輪・光はそれぞれ 1 回の描画にまとめる(InstancedMesh / Points)
    const tints = ['#f6c6e2', '#d8c8fb', '#bfeee6'].map((c) => new THREE.Color(c));
    const spots = [];
    for (let i = 0; i < 7; i++) for (const x of [-10, 10]) spots.push({ x, z: 6 - i * 7, tint: tints[i % tints.length] });
    const pillars = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.62, 0.72, 22, 14),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.05, emissive: '#ffffff', emissiveIntensity: 0.14 }),
      spots.length
    );
    const bands = new THREE.InstancedMesh(new THREE.TorusGeometry(0.78, 0.12, 6, 18), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), spots.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), one = new THREE.Vector3(1, 1, 1);
    const glowPos = [];
    spots.forEach(({ x, z, tint }, i) => {
      pillars.setMatrixAt(i, m.makeTranslation(x, 11, z));
      pillars.setColorAt(i, tint);
      bands.setMatrixAt(i * 2, m.compose(new THREE.Vector3(x, 3, z), q, one));
      bands.setMatrixAt(i * 2 + 1, m.compose(new THREE.Vector3(x, 3.5, z), q, one));
      glowPos.push(x, 3.25, z);
    });
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
    const glows = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTexture(), color: '#ffd1ec', size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pillars, bands, glows);
  }

  // ---------------- ゆっくり昇るハート(レーンの外だけ)----------------
  buildHearts() {
    const tex = heartTexture();
    this.hearts = [];
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const mat = new THREE.SpriteMaterial({ map: tex, color: HEART_TINTS[i % HEART_TINTS.length], transparent: true, opacity: 0.6, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const sc = 0.7 + ((i * 37) % 10) / 10;
      s.scale.setScalar(sc);
      s.position.set(side * (7.5 + ((i * 53) % 70) / 10), ((i * 29) % 26), -4 - ((i * 71) % 34));
      s.userData = { x0: s.position.x, speed: 0.6 + ((i * 13) % 7) / 10, ph: i * 0.9 };
      this.scene.add(s);
      this.hearts.push(s);
    }
  }

  update(dt, t) {
    this.pit.material.opacity = 0.55 + Math.sin(t * 3) * 0.2;
    this.pitInner.material.opacity = 0.45 + Math.sin(t * 3 + Math.PI) * 0.2;
    this.skyMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uTime.value = t;
    for (const c of this.clouds) {
      const u = c.userData;
      c.position.x = u.x0 + Math.sin(t * u.speed + u.ph) * u.amp;
    }
    for (const h of this.hearts) {
      const u = h.userData;
      h.position.y += u.speed * dt;
      if (h.position.y > 26) h.position.y = -1;
      h.position.x = u.x0 + Math.sin(t * 0.8 + u.ph) * 0.5;
      // 床から出る時・上で消える時はフェード
      h.material.opacity = 0.6 * Math.min(1, (h.position.y + 1) / 3, (26 - h.position.y) / 6);
    }
  }
}

// 4方向に光芒の伸びるキラキラ
function sparkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 14);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const tip = [32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31];
    const l = [32 + Math.cos(a + Math.PI / 4) * 4, 32 + Math.sin(a + Math.PI / 4) * 4];
    if (k === 0) g.moveTo(...tip); else g.lineTo(...tip);
    g.lineTo(...l);
  }
  g.closePath();
  g.fill();
  return new THREE.CanvasTexture(c);
}

// もこもこの雲(円を重ねてぼかす)
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 108;
  const g = c.getContext('2d');
  g.filter = 'blur(5px)';
  g.fillStyle = '#fff';
  for (const [x, y, r] of [[60, 70, 30], [100, 56, 38], [146, 50, 42], [190, 64, 32], [128, 78, 34], [82, 82, 24], [210, 82, 20], [40, 86, 18]]) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
