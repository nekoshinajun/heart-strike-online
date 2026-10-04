import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { GameState } from '../core/StateMachine.js';

/**
 * 敵までの距離ガイド(投げる前だけ出す見た目。判定・物理には関わらない)
 *   ハート → 敵(雑魚なら1体ずつ / いなければボス)へ、点線の楕円リングと矢印を等間隔に並べる。
 *   同じ大きさのリングが奥ほど小さく見える = 敵がどれだけ遠いかが直感でわかる。
 *   敵の足元には光る円(足場)。リングは近い方から奥へ光が流れる(「あっちへ投げる」)。
 *   リング・矢印・足場はカメラへ向けた板(2.5D)。設定は Config.distanceGuide
 */
const G = () => Config.distanceGuide ?? {};
const cache = {};

/** 点線の楕円リング(白。色は material.color で付ける)*/
function dottedRing() {
  if (cache.ring) return cache.ring;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.translate(128, 128);
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    x.save();
    x.rotate(a);
    x.shadowColor = 'rgba(255,255,255,0.9)';
    x.shadowBlur = 10;
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.ellipse(108, 0, 3.6, 7.5, 0, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  // 内側のうっすら光
  const grd = x.createRadialGradient(0, 0, 40, 0, 0, 112);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.10)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.beginPath(); x.arc(0, 0, 112, 0, Math.PI * 2); x.fill();
  cache.ring = new THREE.CanvasTexture(c);
  return cache.ring;
}

/** 太い上向き矢印(白 → 先端ほど明るい)*/
function arrowTex() {
  if (cache.arrow) return cache.arrow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 120, 0, 8);
  grd.addColorStop(0, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  x.shadowColor = 'rgba(255,255,255,0.9)';
  x.shadowBlur = 12;
  x.fillStyle = grd;
  x.beginPath();
  x.moveTo(64, 10); x.lineTo(112, 62); x.lineTo(84, 62); x.lineTo(84, 120);
  x.lineTo(44, 120); x.lineTo(44, 62); x.lineTo(16, 62); x.closePath();
  x.fill();
  cache.arrow = new THREE.CanvasTexture(c);
  return cache.arrow;
}

/** 足元の光る円(中心が明るい + 外周のリング)*/
function padTex() {
  if (cache.pad) return cache.pad;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.2)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.lineWidth = 3;
  x.beginPath(); x.arc(128, 128, 62, 0, Math.PI * 2); x.stroke();
  cache.pad = new THREE.CanvasTexture(c);
  return cache.pad;
}

const mat = (map, additive = false) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class DistanceGuide {
  constructor(g) {
    this.g = g;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.lanes = [];
    this.alpha = 0;
    this.t = 0;
  }

  /** レーンを i 本目まで用意(リング・矢印・足場の板)*/
  lane(i) {
    while (this.lanes.length <= i) {
      const n = G().rings ?? 5;
      const L = { rings: [], arrows: [], pad: null, padGlow: null };
      for (let k = 0; k < n; k++) {
        const r = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(dottedRing()));
        const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(arrowTex()));
        r.renderOrder = a.renderOrder = 5;   // 敵の絵(ボス 2 / 雑魚 3)の上
        this.root.add(r, a);
        L.rings.push(r); L.arrows.push(a);
      }
      L.pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(padTex(), true));
      L.pad.renderOrder = 1;   // 足場は敵の絵の後ろ(足元に敷く)
      this.root.add(L.pad);
      this.lanes.push(L);
    }
    return this.lanes[i];
  }

  /** いま狙う相手:{ aim(狙う所), foot(足元), color, size }。雑魚がいれば生きている雑魚 / いなければボス */
  targets() {
    const g = this.g, out = [];
    const w = g.wave;
    if (w?.active) {
      for (const u of w.units) {
        if (!u.alive) continue;
        out.push({ aim: new THREE.Vector3(u.x, u.y, w.z), foot: new THREE.Vector3(u.x, u.y - u.h * 0.42, w.z), color: u.def.guideColor ?? (u.def.id === 'angel' ? '#5fe6ff' : '#ff5fa2'), size: u.def.size * 0.55, pad: u.def.size * 0.3 });
      }
      return out;
    }
    if (!g.boss?.root?.visible || g.boss.full) return out;
    const b = g.boss.hitPlane.bounds();
    if (!Number.isFinite(b.minY)) return out;
    const m = g.boss.hitRoot.matrixWorld;
    const aim = new THREE.Vector3(0, (b.minY + b.maxY) / 2, 0).applyMatrix4(m);
    const foot = new THREE.Vector3(0, b.minY + (b.maxY - b.minY) * 0.08, 0).applyMatrix4(m);
    out.push({ aim, foot, color: '#ff5fa2', size: (b.maxY - b.minY) * Config.boss.scale * 0.32, pad: (b.maxY - b.minY) * Config.boss.scale * 0.13 });
    return out;
  }

  /** 投げる前(ハートを構えている / 掴んでいる)だけ出す */
  get wanted() {
    const g = this.g;
    if (G().enabled === false) return false;
    if (!g.sm?.is(GameState.PLAYER_ATTACK)) return false;
    if (g.tutorial) return false;
    return g.ball.mode === 'held' || g.ball.mode === 'grabbed';
  }

  update(dt) {
    const C = G();
    this.t += dt;
    this.alpha += ((this.wanted ? 1 : 0) - this.alpha) * Math.min(1, dt * (this.wanted ? 6 : 12));
    const on = this.alpha > 0.01;
    this.root.visible = on;
    if (!on) return;
    const cam = this.g.cam.camera;
    const q = cam.quaternion;
    const start = this.g.player.holdAnchor();
    start.y += C.startDrop ?? -0.15;
    const list = this.targets();
    if (C.mode === 'floor') return this.updateFloor(list, start, C);
    for (let i = 0; i < Math.max(list.length, this.lanes.length); i++) {
      const L = this.lane(i), T = list[i];
      const show = !!T;
      for (const m of [...L.rings, ...L.arrows, L.pad]) m.visible = show;
      if (!show) continue;
      const col = new THREE.Color(T.color);
      const n = L.rings.length;
      const from = C.from ?? 0.3, to = C.to ?? 0.86;
      const flatten = C.flatten ?? 0.42;
      const R = C.ringRadius ?? 1.05;
      // 画面上の進む向き(矢印の回転)
      _a.copy(start).project(cam); _b.copy(T.aim).project(cam);
      const ang = Math.atan2((_b.y - _a.y), (_b.x - _a.x) * cam.aspect) - Math.PI / 2;
      // 画面上で近すぎるリングは間引く(敵が画面でハートの近くにいる時に重なって白飛びしない)
      const minGap = (C.minGapPx ?? 54) / (this.g.viewport?.h ?? innerHeight) * 2;
      let lastX = Infinity, lastY = Infinity;
      for (let k = 0; k < n; k++) {
        const f = n === 1 ? from : from + (to - from) * (k / (n - 1));
        _p.copy(start).lerp(T.aim, f);
        _s.copy(_p).project(cam);
        const ring = L.rings[k], arrow = L.arrows[k];
        const gap = Math.hypot((_s.x - lastX) * cam.aspect, _s.y - lastY);
        if (gap < minGap) { ring.visible = arrow.visible = false; continue; }
        lastX = _s.x; lastY = _s.y;
        // 近い方から奥へ光が流れる
        const wave = 0.5 + 0.5 * Math.cos((f * 3.2 - this.t * (C.flowSpeed ?? 1.4)) * Math.PI * 2);
        const fade = 1 - 0.35 * (k / Math.max(1, n - 1));
        // 楕円は進む向きに対して横に寝かせる(床に置いたリングの見え方)。矢印は進む向き
        ring.position.copy(_p);
        ring.quaternion.copy(q);
        ring.rotateZ(ang);
        ring.scale.set(R * 2, R * 2 * flatten, 1);
        ring.material.opacity = this.alpha * fade * (0.6 + 0.4 * wave);
        ring.material.color.set(T.color);
        arrow.position.copy(_p);
        arrow.quaternion.copy(q);
        arrow.rotateZ(ang);
        arrow.scale.set(R * 1.1, R * 1.1, 1);
        arrow.material.opacity = this.alpha * fade * (0.45 + 0.55 * wave);
        arrow.material.color.set('#ffffff').lerp(col, 0.35);
      }
      // 足元の光る円(ゆっくり脈打つ)
      const pulse = 1 + Math.sin(this.t * 3 + i) * 0.05;
      L.pad.position.copy(T.foot);
      L.pad.quaternion.copy(q);
      L.pad.scale.set(T.size * 2 * pulse, T.size * 2 * flatten * 0.7 * pulse, 1);
      L.pad.material.color.copy(col).multiplyScalar(this.alpha * 0.9);   // 足場は加算(光)
    }
  }

  /** 画面の下の方(NDC の y)に見える床の点(リングの並びの手前の端)*/
  floorAtScreen(ndcY, y, x) {
    const cam = this.g.cam.camera;
    const d = new THREE.Vector3(0, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
    const k = d.y < -1e-3 ? (y - cam.position.y) / d.y : 20;
    const P = cam.position.clone().addScaledVector(d, Math.min(k, 40));
    P.x = x; P.y = y;
    return P;
  }

  /** 床モード(カメラが床を見下ろす構図用):リング・矢印・足場を床(y = floorY)に寝かせて並べる */
  updateFloor(list, start, C) {
    const y = C.floorY ?? 0.03;
    const n0 = C.rings ?? 5;
    for (let i = 0; i < Math.max(list.length, this.lanes.length); i++) {
      const L = this.lane(i), T = list[i];
      for (const m of [...L.rings, ...L.arrows, L.pad]) m.visible = !!T;
      if (!T) continue;
      const col = new THREE.Color(T.color);
      const S = this.floorAtScreen(C.floorStartNdc ?? -0.75, y, start.x);
      const E = new THREE.Vector3(T.aim.x, y, T.aim.z);
      const ang = Math.atan2(E.x - S.x, -(E.z - S.z));
      const R = C.floorRingRadius ?? 1.6;
      for (let k = 0; k < n0; k++) {
        const f = (k + 0.5) / n0 * 0.92;
        const wave = 0.5 + 0.5 * Math.cos((f * 3.2 - this.t * (C.flowSpeed ?? 1.4)) * Math.PI * 2);
        const ring = L.rings[k], arrow = L.arrows[k];
        ring.position.copy(S).lerp(E, f);
        ring.rotation.set(-Math.PI / 2, 0, -ang);
        ring.scale.set(R * 2, R * 2, 1);
        ring.material.opacity = this.alpha * (0.6 + 0.4 * wave);
        ring.material.color.set(T.color);
        arrow.position.copy(ring.position); arrow.position.y += 0.01;
        arrow.rotation.set(-Math.PI / 2, 0, -ang);
        arrow.scale.set(R * 1.3, R * 1.3, 1);
        arrow.material.opacity = this.alpha * (0.45 + 0.55 * wave);
        arrow.material.color.set('#ffffff').lerp(col, 0.35);
      }
      const pulse = 1 + Math.sin(this.t * 3 + i) * 0.05;
      L.pad.position.set(T.aim.x, y + 0.02, T.aim.z);
      L.pad.rotation.set(-Math.PI / 2, 0, 0);
      L.pad.scale.set(T.pad * 2 * pulse, T.pad * 2 * pulse, 1);
      L.pad.material.color.copy(col).multiplyScalar(this.alpha * 0.9);
    }
  }
}
