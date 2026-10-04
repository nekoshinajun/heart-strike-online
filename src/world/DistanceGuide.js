import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { GameState } from '../core/StateMachine.js';

/**
 * 敵までの距離ガイド(投げる前だけ出す見た目。判定・物理には関わらない)
 *   床に「ハート → 敵の足元」の道を引く:点線のリングと矢印を等間隔に並べ、敵の足元には光る円。
 *   同じ大きさのリングが奥ほど小さく見える = 敵がどれだけ遠いかが直感でわかる(床を見下ろすカメラ:Config.camera)。
 *   雑魚がいれば1体ずつ道を引く / いなければボスへ1本。光は手前 → 奥へ流れる(「あっちへ投げる」)。設定は Config.distanceGuide
 */
const G = () => Config.distanceGuide ?? {};
const FLOOR_Y = 0.04;
const _d = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Vector3(), _p = new THREE.Vector3();
const cache = {};
const canvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; };
const once = (key, draw) => cache[key] ?? (cache[key] = draw());
const texOf = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/** 点線のリング:白い粒 + 色の縁取り(明るい背景でも暗い背景でも見える)*/
function dottedRing(color) {
  return once(`ring${color}`, () => {
    const [c, x] = canvas(256);
    x.translate(128, 128);
    const n = 30;
    for (let i = 0; i < n; i++) {
      x.save();
      x.rotate((i / n) * Math.PI * 2);
      x.shadowColor = color; x.shadowBlur = 8;
      x.fillStyle = '#ffffff'; x.strokeStyle = color; x.lineWidth = 3.5;
      x.beginPath(); x.ellipse(106, 0, 5, 9.5, 0, 0, Math.PI * 2); x.fill(); x.stroke();
      x.restore();
    }
    return texOf(c);
  });
}

/** 太い矢印(先端ほど白く、色の太い縁取り)*/
function arrowTex(color) {
  return once(`arrow${color}`, () => {
    const [c, x] = canvas(128);
    const grd = x.createLinearGradient(0, 120, 0, 8);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, '#ffffff');
    x.beginPath();
    x.moveTo(64, 12); x.lineTo(110, 60); x.lineTo(83, 60); x.lineTo(83, 116);
    x.lineTo(45, 116); x.lineTo(45, 60); x.lineTo(18, 60); x.closePath();
    x.lineJoin = 'round';
    x.shadowColor = color; x.shadowBlur = 10;
    x.strokeStyle = color; x.lineWidth = 7; x.stroke();
    x.shadowBlur = 0;
    x.fillStyle = grd; x.fill();
    return texOf(c);
  });
}

/** 足元の光る円(色の太い輪 + 内側の白い輪 + うっすら塗り)*/
function padTex(color) {
  return once(`pad${color}`, () => {
    const [c, x] = canvas(256);
    const grd = x.createRadialGradient(128, 128, 0, 128, 128, 120);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.3, color);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.globalAlpha = 0.45; x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
    x.globalAlpha = 1;
    x.strokeStyle = 'rgba(40,8,30,0.55)'; x.lineWidth = 22;   // 暗い縁(明るい床の上でも輪郭が出る)
    x.beginPath(); x.arc(128, 128, 106, 0, Math.PI * 2); x.stroke();
    x.shadowColor = color; x.shadowBlur = 14;
    x.strokeStyle = color; x.lineWidth = 12;
    x.beginPath(); x.arc(128, 128, 106, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#ffffff'; x.lineWidth = 4;
    x.beginPath(); x.arc(128, 128, 106, 0, Math.PI * 2); x.stroke();
    x.setLineDash([10, 10]); x.lineWidth = 3;
    x.beginPath(); x.arc(128, 128, 70, 0, Math.PI * 2); x.stroke();
    return texOf(c);
  });
}

/** 敵の体の下 → 床の円へ下ろす縦の点線(「この真下にいる」)*/
function dropTex(color) {
  return once(`drop${color}`, () => {
    const [c, x] = canvas(64);
    const grd = x.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, color); grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.globalAlpha = 0.55; x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    x.globalAlpha = 1; x.fillStyle = '#ffffff'; x.shadowColor = color; x.shadowBlur = 6;
    x.beginPath(); x.ellipse(32, 20, 7, 13, 0, 0, Math.PI * 2); x.fill();
    const t = texOf(c); t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

const mat = () => new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,   // 床のすぐ上(床・グリッドに埋もれない)
});
const flat = (m) => { m.rotation.order = 'YXZ'; return m; };

export class DistanceGuide {
  constructor(g) {
    this.g = g;
    this.root = new THREE.Group();
    this.root.visible = false;
    g.scene.add(this.root);
    this.lanes = [];
    this.alpha = 0;
    this.t = 0;
  }

  /** 道を i 本目まで用意(リング・矢印・足元の光る円)*/
  lane(i) {
    while (this.lanes.length <= i) {
      const n = G().rings ?? 6;
      const L = { rings: [], arrows: [], pad: null, drop: null };
      for (let k = 0; k < n; k++) {
        const r = flat(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat()));
        const a = flat(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat()));
        r.renderOrder = a.renderOrder = 1;
        this.root.add(r, a);
        L.rings.push(r); L.arrows.push(a);
      }
      L.pad = flat(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat()));
      L.pad.renderOrder = 1;
      L.drop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat());
      L.drop.material.map = null;
      L.drop.renderOrder = 1;
      this.root.add(L.pad, L.drop);
      this.lanes.push(L);
    }
    return this.lanes[i];
  }

  /** いま狙う相手の足元:{ x, z, pad(光る円の半径), color }。雑魚がいれば生きている雑魚 / いなければボス */
  targets() {
    const g = this.g, out = [];
    const w = g.wave;
    if (w?.active) {
      for (const u of w.units) {
        if (u.alive) out.push({ x: u.x, z: w.z, bottom: u.y - u.h * 0.42, pad: u.def.size * 0.32, color: u.def.id === 'angel' ? '#1fb6e8' : '#ff3d8f' });
      }
      return out;
    }
    if (!g.boss?.root?.visible || g.boss.full) return out;
    const b = g.boss.hitPlane.bounds();
    if (!Number.isFinite(b.minY)) return out;
    const p = g.boss.root.position;
    out.push({ x: p.x, z: p.z, bottom: 0, pad: (b.maxY - b.minY) * Config.boss.scale * 0.16, color: '#ff3d8f' });
    return out;
  }

  /** 真下の位置表示(床の円 + 縦の点線):バトル中はいつも出す(敵がどこに立っているか = 距離の基準)*/
  get padWanted() {
    const g = this.g;
    if (G().enabled === false || g.tutorial || !g.stage) return false;
    return !g.sm?.is(GameState.OPENING) && !g.sm?.is(GameState.WAVE_ADVANCE);
  }
  /** 床の道(リング + 矢印):投げる前(ハートを構えている / 掴んでいる)だけ出す */
  get wanted() {
    const g = this.g;
    if (!this.padWanted) return false;
    if (!g.sm?.is(GameState.PLAYER_ATTACK)) return false;
    return g.ball.mode === 'held' || g.ball.mode === 'grabbed';
  }

  /** 画面のこの高さ(NDC の y)に見える床の点 */
  floorAt(ndcY, out) {
    const cam = this.g.cam.camera;
    _d.set(0, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
    const k = _d.y < -1e-3 ? Math.min(60, (FLOOR_Y - cam.position.y) / _d.y) : 30;
    return out.copy(cam.position).addScaledVector(_d, k).setY(FLOOR_Y);
  }

  update(dt) {
    const C = G();
    this.t += dt;
    const want = this.wanted, padWant = this.padWanted;
    this.alpha += ((want ? 1 : 0) - this.alpha) * Math.min(1, dt * (want ? 6 : 12));
    this.padAlpha = (this.padAlpha ?? 0) + ((padWant ? 1 : 0) - (this.padAlpha ?? 0)) * Math.min(1, dt * 6);
    this.root.visible = this.padAlpha > 0.01;
    if (!this.root.visible) return;
    const cam = this.g.cam.camera;
    const list = this.targets();
    const S = this.floorAt(C.startNdc ?? -0.95, _s);
    const n = C.rings ?? 6, R = C.ringRadius ?? 1.5, A = C.arrowSize ?? 2.0, end = C.end ?? 0.9;
    for (let i = 0; i < Math.max(list.length, this.lanes.length); i++) {
      const L = this.lane(i), T = list[i];
      for (const m of [...L.rings, ...L.arrows, L.pad, L.drop]) m.visible = !!T;
      if (!T) continue;
      for (const m of [...L.rings, ...L.arrows]) m.visible = this.alpha > 0.01;
      if (L.color !== T.color) {   // 色ごとのテクスチャ(縁取りの色)
        L.color = T.color;
        for (const r of L.rings) { r.material.map = dottedRing(T.color); r.material.needsUpdate = true; }
        for (const a of L.arrows) { a.material.map = arrowTex(T.color); a.material.needsUpdate = true; }
        L.pad.material.map = padTex(T.color); L.pad.material.needsUpdate = true;
        L.drop.material.map = dropTex(T.color); L.drop.material.needsUpdate = true;
      }
      _e.set(T.x, FLOOR_Y, T.z);
      // 道は足元の光る円の手前まで
      const far = _p.copy(_e).sub(S);
      const len = far.length();
      const stop = Math.max(0.1, Math.min(end, 1 - (T.pad * 0.9) / Math.max(1, len)));
      const yaw = Math.atan2(-(_e.x - S.x), -(_e.z - S.z));   // 矢印の向き(奥 = -Z が 0)
      for (let k = 0; k < L.rings.length; k++) {
        const f = ((k + 0.5) / n) * stop;
        // 近い方から奥へ光が流れる
        const wave = 0.5 + 0.5 * Math.cos((f * 2.4 - this.t * (C.flowSpeed ?? 1.2)) * Math.PI * 2);
        const ring = L.rings[k], arrow = L.arrows[k];
        ring.position.copy(S).lerp(_e, f);
        ring.rotation.set(-Math.PI / 2, yaw, 0);
        ring.scale.set(R * 2, R * 2, 1);
        ring.material.opacity = this.alpha * (0.55 + 0.45 * wave);
        arrow.position.copy(ring.position);
        arrow.rotation.set(-Math.PI / 2, yaw, 0);
        arrow.scale.set(A, A, 1);
        arrow.material.opacity = this.alpha * (0.35 + 0.65 * wave);
      }
      // 足元の光る円(ゆっくり脈打つ)
      const r = T.pad * (C.padScale ?? 1) * (1 + Math.sin(this.t * 3 + i) * 0.05);
      L.pad.position.copy(_e);
      L.pad.rotation.set(-Math.PI / 2, 0, 0);
      L.pad.scale.set(r * 2, r * 2, 1);
      L.pad.material.opacity = this.padAlpha * 0.95;
      // 体の下 → 床の円へ縦の点線(浮いている雑魚でも「この真下」がわかる)。床に立つボスは出さない
      const hgt = (T.bottom ?? 0) - FLOOR_Y;
      L.drop.visible = hgt > 0.8;
      if (L.drop.visible) {
        L.drop.position.set(T.x, FLOOR_Y + hgt / 2, T.z);
        L.drop.rotation.set(0, Math.atan2(cam.position.x - T.x, cam.position.z - T.z), 0);   // 縦のまま、カメラへ向ける
        const w = C.dropWidth ?? 1.1;
        L.drop.scale.set(w, hgt, 1);
        L.drop.material.map.repeat.set(1, hgt / (w * 1.4));
        L.drop.material.map.offset.y = -this.t * 0.6;   // 点が下へ流れる
        L.drop.material.opacity = this.padAlpha * 0.9;
      }
    }
  }
}
