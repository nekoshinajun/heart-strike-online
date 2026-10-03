import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { minionById } from '../data/MinionData.js';
import { MINION_IMAGES } from '../assets/minionImages.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _v = new THREE.Vector3();
const images = {};
/** 雑魚の画像(data URI)。同じ画像は1回だけ読む */
function minionImage(key) {
  if (!MINION_IMAGES[key]) return null;
  if (!images[key]) { const im = new Image(); im.src = MINION_IMAGES[key]; images[key] = im; }
  return images[key];
}

/**
 * 雑魚の命中判定 = 2D の「攻撃面」(BossController の BossHitPlane と同じ考え方)
 *   ハートの軌道が雑魚の面を通った瞬間の X / Y で、どの雑魚に当たったかを決める
 *   円(MinionData.hitRadius)の中か、絵の不透明な部分なら HIT。判定は止まった位置(揺れ無し)で行う → MULTI の全員で同じ結果
 */
class MinionHitPlane {
  constructor(wave) { this.wave = wave; this.isHitPlane = true; }
  get z() { return this.wave.z; }
  resolve(prev, pos) {
    const z = this.z;
    if (!(prev.z > z && pos.z <= z)) return null;
    const k = (prev.z - z) / (prev.z - pos.z);
    return this.judge(prev.clone().lerp(pos, k));
  }
  judge(P) {
    const alive = this.wave.units.filter((u) => u.alive);
    let best = null;
    for (const u of alive) {
      const d = Math.hypot(P.x - u.x, P.y - u.y) / (u.def.size * (u.def.hitRadius ?? 0.46));
      if (d <= 1 && (!best || d < best.d)) best = { u, d };
    }
    if (!best) for (const u of alive) if (this.onSilhouette(u, P)) { best = { u, d: 1 }; break; }
    if (best) return { type: 'hit', part: 'minion', minion: best.u.index, point: P.clone(), object: best.u.hitObj };
    let minY = Infinity, maxY = -Infinity;
    for (const u of alive) { minY = Math.min(minY, u.y - u.h / 2); maxY = Math.max(maxY, u.y + u.h / 2); }
    return { type: P.y > maxY ? 'over' : P.y < minY ? 'low' : 'wide', point: P.clone() };
  }
  /** 絵の不透明な部分か(画像のアルファ。読めない時は false = 円だけで判定)*/
  onSilhouette(u, P) {
    const a = u.alpha;
    if (!a?.W) return false;
    const s = u.def.size, uu = (P.x - (u.x - s / 2)) / s, vv = 1 - (P.y - (u.y - u.h / 2)) / u.h;
    if (uu < 0 || uu > 1 || vv < 0 || vv > 1) return false;
    const ix = Math.min(a.W - 1, Math.floor(uu * a.W)), iy = Math.min(a.H - 1, Math.floor(vv * a.H));
    return a.data[(iy * a.W + ix) * 4 + 3] > 96;
  }
}

/**
 * 雑魚戦(ボスの前の WAVE)。データ:StageData.waves(どの雑魚をどこに出すか)+ data/MinionData.js(雑魚の性能・見た目)
 *   バトル開始 → WAVE の雑魚を全員同時に出す → 全員倒すと cleared → WaveAdvanceState(奥へ進む → ボス登場)
 *   雑魚がいる間はボスを隠し、投球の攻撃面・返球の発射位置を雑魚側に差し替える(GameManager.targetPlane / BossController.spawnFrom)
 */
export class MinionWave {
  constructor(g, waves) {
    this.g = g;
    this.waves = waves;
    this.index = -1;
    this.units = [];
    this.z = Config.boss.z + (Config.minion?.zOffset ?? 0.5);
    this.hitPlane = new MinionHitPlane(this);
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.hud = document.createElement('div');
    this.hud.className = 'mn-hud';
    document.getElementById('ui')?.appendChild(this.hud);
    this.t = 0;
    this.next();
  }

  /** 雑魚が1体でも生きている(= ボスはまだ出ない)*/
  get active() { return this.units.some((u) => u.alive); }
  get label() { return this.waves.length > 1 ? `WAVE ${this.index + 1}/${this.waves.length}` : 'WAVE'; }
  unit(i) { return this.units[i] ?? null; }
  /** 次の WAVE の雑魚を出す。WAVE が残っていなければ false */
  next() {
    this.clearUnits();
    this.index++;
    const w = this.waves[this.index];
    if (!w) return false;
    this.units = (w.minions ?? []).map((m, i) => this.makeUnit(m, i)).filter(Boolean);
    return this.units.length > 0;
  }
  get hasNext() { return this.index + 1 < this.waves.length; }

  makeUnit(m, index) {
    const def = minionById(m.id);
    if (!def) return null;
    const s = def.size;
    const u = { index, def, hp: def.hp, maxHp: def.hp, alive: true, x: m.x ?? 0, y: m.y ?? 17, h: s, dieT: -1, hitT: 0, phase: index * 1.7 };
    u.group = new THREE.Group();                  // 止まった位置(判定・着弾マーク)
    u.group.position.set(u.x, u.y, this.z);
    u.body = new THREE.Group();                   // ふわふわ揺れる見た目
    u.group.add(u.body);
    u.mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, color: '#ffffff' });
    u.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), u.mat);
    u.mesh.scale.set(s, s, 1);
    u.mesh.renderOrder = 3;
    u.body.add(u.mesh);
    u.live = new THREE.Object3D(); u.body.add(u.live);   // 着弾マークは揺れる見た目側に付ける
    u.hitObj = new THREE.Object3D(); u.hitObj.userData = { part: 'minion', live: u.live }; u.group.add(u.hitObj);
    this.root.add(u.group);
    const im = minionImage(def.image);
    const apply = () => {
      const tex = new THREE.Texture(im); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
      u.mat.map = tex; u.mat.needsUpdate = true;
      u.h = s * (im.naturalHeight / im.naturalWidth);
      u.mesh.scale.set(s, u.h, 1);
      u.alpha = alphaOf(im);
    };
    if (im) { if (im.complete && im.naturalWidth) apply(); else im.addEventListener('load', apply, { once: true }); }
    // HP バー(画面上で雑魚の頭の上に付いていく)
    u.el = document.createElement('div');
    u.el.className = 'mn-hp';
    // メロメロ度メーター(HP を減らす見せ方ではなく、ハートで溜まっていく。満タン = メロメロ = 撃破)
    u.el.innerHTML = `<b>${esc(def.name)}</b><i><s></s><u>♡</u></i><em>メロメロ 0%</em>`;
    this.hud.appendChild(u.el);
    u.fill = u.el.querySelector('s'); u.fill.style.transform = 'scaleX(0)'; u.num = u.el.querySelector('em');
    return u;
  }

  /** 与ダメージを確定(BossController.addHeart と同じ形の戻り値)。HP 0 で倒れる */
  damage(u, damage) {
    const gain = Math.max(0, Math.min(u.hp, Math.round(Number(damage) || 0)));
    u.hp -= gain;
    u.hitT = 0.25;
    const love = 1 - u.hp / u.maxHp;
    u.fill.style.transform = `scaleX(${love})`;
    u.num.textContent = u.hp > 0 ? `メロメロ ${Math.floor(love * 100)}%` : 'メロメロ MAX♡';
    u.el.classList.remove('bump'); void u.el.offsetWidth; u.el.classList.add('bump');
    const defeated = u.hp <= 0 && u.alive;
    if (defeated) {
      u.alive = false; u.dieT = 0;
      u.el.classList.add('down');
      const p = u.group.position;
      this.g.effects.heartBurst(p, 40, 9, 1.1);
      this.g.effects.burst(p, '#ffffff', 24, 10, 0.7);
      this.g.effects.shockwave(p, '#ffd0ea', 6, this.g.cam.camera);
      this.g.ui.partCallout?.(`${u.def.name} メロメロ♡`, 'break');
      this.g.audio.loveMax?.();
      this.g.syncWaveTarget();
    }
    return { heartGain: gain, defeated };
  }

  /** DEFENCE で受けるダメージの倍率:生きている雑魚の attackMul の最大 */
  get attackMul() { return Math.max(0, ...this.units.filter((u) => u.alive).map((u) => u.def.attackMul ?? 1)); }

  /** 返球の発射位置:生きている雑魚の中心(止まった位置。MULTI で全員同じ)*/
  spawnPoint(out = new THREE.Vector3()) {
    const alive = this.units.filter((u) => u.alive);
    if (!alive.length) return out.set(0, 17, this.z + 1.6);
    out.set(0, 0, 0);
    for (const u of alive) out.add(_v.set(u.x, u.y - u.h * 0.1, this.z + 1.6));
    return out.multiplyScalar(1 / alive.length);
  }
  /** カメラを寄せる先(WAVE 紹介 / 雑魚の攻撃)*/
  focusPoint(out = new THREE.Vector3()) {
    const list = this.units.filter((u) => u.alive);
    const us = list.length ? list : this.units;
    out.set(0, 0, 0);
    for (const u of us) out.add(_v.set(u.x, u.y, this.z));
    return us.length ? out.multiplyScalar(1 / us.length) : out.set(0, 17, this.z);
  }
  /**
   * 3D ルート(Gate / Energy のお手本の1投)の狙い点。ボスの部位名 → 同じ向きの雑魚(止まった位置)
   *   rightArm / rightLeg(画面の左)→ 左の雑魚 / leftArm / leftLeg → 右の雑魚 / head → 高い方 / それ以外 → 中央に近い方。脚は少し下・頭は少し上
   */
  aimPoint(part, out = new THREE.Vector3()) {
    const alive = this.units.filter((u) => u.alive).sort((a, b) => a.x - b.x);
    if (!alive.length) return out.set(0, 17, this.z);
    const p = String(part ?? '');
    const u = p.startsWith('right') ? alive[0] : p.startsWith('left') ? alive[alive.length - 1]
      : p === 'head' ? alive.reduce((a, b) => (b.y > a.y ? b : a)) : alive.reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a));
    const dy = p === 'head' ? 0.22 : p.endsWith('Leg') || p === 'stomach' ? -0.2 : 0;
    return out.set(u.x, u.y + u.def.size * dy, this.z);
  }
  names() { return this.units.map((u) => u.def.name); }

  update(dt) {
    this.t += dt;
    const g = this.g, vis = !g.container.classList.contains('app-opaque');
    this.hud.hidden = !vis;
    for (const u of this.units) {
      // ふわふわ浮く(見た目だけ。判定は group の止まった位置)
      u.body.position.y = Math.sin(this.t * 1.6 + u.phase) * 0.35;
      u.body.rotation.z = Math.sin(this.t * 1.1 + u.phase) * 0.05;
      if (u.hitT > 0) { u.hitT = Math.max(0, u.hitT - dt); const k = u.hitT / 0.25; u.body.position.x = Math.sin(k * 40) * 0.3 * k; u.mat.color.setRGB(1, 1 - 0.45 * k, 1 - 0.3 * k); }
      else if (u.alive) { u.body.position.x = 0; u.mat.color.setRGB(1, 1, 1); }
      if (u.dieT >= 0) {
        // 倒れた:白く光って膨らみながら消える
        u.dieT += dt;
        const k = Math.min(1, u.dieT / 0.6);
        u.mesh.scale.set(u.def.size * (1 + k * 0.35), u.h * (1 + k * 0.35), 1);
        u.mat.opacity = 1 - k;
        u.mat.color.setRGB(1, 1, 1);
        if (k >= 1) u.group.visible = false;
      }
      // HP バーの位置(頭の上)
      if (vis && u.el) {
        const s = g.player.toScreen(_v.set(u.x, u.y + u.h * 0.5 + u.body.position.y, this.z));
        u.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
      }
    }
  }

  clearUnits() {
    for (const u of this.units) {
      this.root.remove(u.group);
      u.mesh.geometry.dispose(); u.mat.map?.dispose(); u.mat.dispose();
      u.el?.remove();
    }
    this.units = [];
  }

  dispose() {
    this.clearUnits();
    this.g.scene.remove(this.root);
    this.hud.remove();
  }
}

const alphaCache = new WeakMap();
/** 画像のアルファ(当たり判定用に縮小して1回だけ読む)*/
function alphaOf(img) {
  let a = alphaCache.get(img);
  if (a) return a;
  try {
    const W = 128, H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, H);
    a = { W, H, data: cx.getImageData(0, 0, W, H).data };
  } catch { a = { W: 0 }; }
  alphaCache.set(img, a);
  return a;
}
