import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { heartTexture } from './Textures.js';
import { cloudSea, petal } from './Painted.js';

// 背景のレイヤー絵(ねこしなさんの素材シートから切り出し・透過したもの)
const BG = {
  far: 'assets/bg/bg_far.webp',         // ① 最奥:空・窓
  mid: 'assets/bg/bg_mid.webp',         // ② 奥の建築(アーチ + 階段)
  floor: 'assets/bg/bg_floor.webp',     // ③ 床(真上から見た形に直したタイル。縦は鏡写しでつなぐ)
  pillarL: 'assets/bg/bg_pillar_l.webp', // ④ 左右の柱・装飾
  pillarR: 'assets/bg/bg_pillar_r.webp',
  front: 'assets/bg/bg_front.webp',     // ⑤ 前景の花・花びら(画面の上に重ねる DOM)
};
const loader = new THREE.TextureLoader();
// 異方性フィルタは斜めに見える床だけ(正面を向いた板は見た目が変わらず、描画が重くなるだけ。発熱対策)
const load = (url, anisotropy = 1) => { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; return t; };

/**
 * 戦闘の背景(2.5D):奥行きの違う位置に「2D の絵の板」を重ねる。ゲームの計算(軌道・判定)は 3D のまま。
 *   空(グラデーション)→ ① 窓の壁 → ② アーチと階段 → 雲の海 + ③ 大理石の床 → ④ 左右の柱 → 舞う花びら → ⑤ 前景の花(画面の縁)
 * カメラが動くと板ごとにずれて見える(視差)ので、平らな絵でも奥行きが出る。開幕の全体図(OpeningState)でいちばん効く。
 * 絵は assets/bg/ の画像(BG)。差し替える時は同じファイル名で置き換える。
 * 読みやすさ:ゲートやノーツの後ろになる空は中くらいの明るさのラベンダーに抑え、明るい色は地平線と足元だけ。
 */
const SKY = { zenith: '#7f86d8', mid: '#d6a8e4', horizon: '#ffe0ec' };
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
    // 不透明な地面(雲の海・床)の後に描く:地面に隠れた所は深度テストで空を塗らずに済む(見た目は同じ。発熱対策)
    // 奥の絵の板(①②)は半透明なので、その後に重なる
    sky.renderOrder = 5;
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

  // ---------------- ① 窓の壁 / ② アーチと階段 ----------------
  buildBackdrops() {
    // ① はボスの後ろになるので少しだけ暗くして、ピンクのゲートや白いリングを見やすくする
    this.board(load(BG.far), 78, 70, 0, -6, -70, -15, { color: '#e2d2e2' });
    this.board(load(BG.mid), 34, 35, 0, -0.6, -32, -12);
  }

  // ---------------- 足元:雲の海 + 石畳の道 ----------------
  buildGround() {
    const sea = cloudSea();
    sea.repeat.set(14, 14);
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: sea, fog: true }));
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.y = -0.6;
    this.scene.add(cloud);

    // ③ 床:手前(z 12)から奥の階段(z -32)まで
    const z0 = 12, z1 = -32, len = z0 - z1, W = 9;
    const tiles = load(BG.floor, 4);
    tiles.wrapS = THREE.ClampToEdgeWrapping;
    tiles.wrapT = THREE.MirroredRepeatWrapping;   // 縦は鏡写しでつなぐ(継ぎ目が目立たない)
    tiles.repeat.set(1, len / (W * 340 / 512));
    const path = new THREE.Mesh(new THREE.PlaneGeometry(W, len), new THREE.MeshBasicMaterial({ map: tiles }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0, z0 - len / 2);
    this.scene.add(path);

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

  // ---------------- ④ 左右の柱(手前と奥の2組で奥行きを出す)----------------
  buildProps() {
    const L = load(BG.pillarL), R = load(BG.pillarR);
    const H = 18, Wd = H * 319 / 906;
    for (const [x, z, k] of [[7.6, -2, 1], [9.5, -16, 1.15]]) {
      this.board(L, Wd * k, H * k, -x, -0.5, z, -5, { fog: true });
      this.board(R, Wd * k, H * k, x, -0.5, z, -5, { fog: true });
    }
    // ⑤ 前景の花:画面の縁に重ねる(ゲームの画面の上・UI の下。触っても反応しない)
    const game = document.getElementById('game'), view = document.getElementById('view');
    if (game && view && !document.getElementById('fgFlowers')) {
      const fg = document.createElement('div');
      fg.id = 'fgFlowers';
      // 上の HUD(LOVE / FEVER)にかからないよう上の方は消す。主役(ゲート・ボス)を隠さないよう薄め
      //   真ん中の縦の帯も消す(床の道 = 敵までの距離ガイドとハートを隠さない。花は左右の縁だけ)
      const mask = 'linear-gradient(to bottom, transparent 0, transparent 13%, #000 24%), linear-gradient(to right, #000 0, #000 18%, transparent 34%, transparent 66%, #000 82%)';
      fg.style.cssText = `position:absolute;inset:0;pointer-events:none;background:url(${BG.front}) center/100% 100% no-repeat;opacity:.7;-webkit-mask-image:${mask};mask-image:${mask};-webkit-mask-composite:source-in;mask-composite:intersect`;
      view.after(fg);
      const st = document.createElement('style');
      st.textContent = '#game[data-state="TITLE"] #fgFlowers { display: none; }';
      document.head.appendChild(st);
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
    for (const h of this.hearts) {
      const u = h.userData;
      h.position.y += u.speed * dt;
      if (h.position.y > 26) h.position.y = -1;
      h.position.x = u.x0 + Math.sin(t * 0.8 + u.ph) * 0.5;
      h.material.opacity = 0.6 * Math.min(1, (h.position.y + 1) / 3, (26 - h.position.y) / 6);
    }
  }
}
