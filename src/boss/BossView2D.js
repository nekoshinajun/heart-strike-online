import * as THREE from '../lib/three.js';
import { drawBody, drawHairBack, drawHead, drawArm } from './BossArt.js';
import { Config } from '../core/Config.js';

/**
 * ボス(推しVTuber)の「見た目」だけを担当する2D Spriteビュー。ロジック(HEART・部位)は持たない。
 * BossController からは下記インターフェースだけを呼ぶので、将来 Live2DBossView 等へ差し替え可能:
 *   setExpression(expr, holdSec) / setPartState(partId, state) / playHit(partId, power)
 *   setLook(x) / setHeartMax() / update(dt) / root(THREE.Object3D) / anchors(Collider配置用の親)
 *
 * 見た目はパーツ分割した板ポリ(レイヤー)。部位状態が変わると該当レイヤーを描き直す。
 * skin を差し替えれば PNG 素材にも置き換えられる(各関数が { canvas|image, bounds } を返せばよい)。
 */
// 内蔵の仮イラストには HEART 状態の衣装差分が無いため、衣装は常に通常(差分は各キャラの skin で用意する)
const NORMAL_ALL = (states) => Object.fromEntries(Object.keys(states).map((k) => [k, 'NORMAL']));
export const DefaultSkin = {
  body: (states) => drawBody(NORMAL_ALL(states)),
  hairBack: () => drawHairBack(),
  head: (expr) => drawHead(expr, 'NORMAL'),
  arm: (s) => drawArm(s, 'NORMAL'),
};

// Spring(揺れリアクション)
class Spring {
  constructor(k = 120, c = 12) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(v) { this.v += v; }
  update(dt) { this.v += (-this.k * this.x - this.c * this.v) * dt; this.x += this.v * dt; }
}

const SHOULDER = { x: 2.0, y: 12.55 };
const NECK = { x: 0, y: 13.4 };

/** 部位の HEART 状態デカール(ハート) */
let heartDecalTex = null;
function heartDecalTexture() {
  if (heartDecalTex) return heartDecalTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(64, 100);
  g.bezierCurveTo(10, 66, 22, 22, 64, 44);
  g.bezierCurveTo(106, 22, 118, 66, 64, 100);
  g.fill();
  heartDecalTex = new THREE.CanvasTexture(c);
  return heartDecalTex;
}

/** 部位状態デカール(ヒビ模様)。画像差し替え時の仮表示 */
let decalTex = null;
function decalTexture() {
  if (decalTex) return decalTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round';
  for (const [a, l] of [[0.3, 50], [1.4, 42], [2.5, 48], [3.6, 40], [4.7, 46], [5.6, 38]]) {
    g.beginPath(); g.moveTo(64, 64);
    const mx = 64 + Math.cos(a + 0.3) * l * 0.5, my = 64 + Math.sin(a + 0.3) * l * 0.5;
    g.lineTo(mx, my); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke();
  }
  decalTex = new THREE.CanvasTexture(c);
  return decalTex;
}

function texFrom(layer) {
  const t = new THREE.CanvasTexture(layer.canvas ?? layer.image);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function layerMesh(layer, renderOrder) {
  const { xMin, xMax, yMin, yMax } = layer.bounds;
  const geo = new THREE.PlaneGeometry(xMax - xMin, yMax - yMin);
  geo.translate((xMin + xMax) / 2, (yMin + yMax) / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: texFrom(layer), transparent: true, depthWrite: false, fog: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = renderOrder;
  return m;
}

export class BossView2D {
  constructor(parent, skin = DefaultSkin) {
    this.skin = skin;
    this.states = { head: 'NORMAL', chest: 'NORMAL', stomach: 'NORMAL', rightArm: 'NORMAL', leftArm: 'NORMAL', rightLeg: 'NORMAL', leftLeg: 'NORMAL' };
    this.expr = 'normal';
    this.baseExpr = 'normal';
    this.exprHold = 0;
    this.time = 0;
    this.flashT = 0;
    this.lookX = 0;
    this.lookTarget = 0;
    this.heartMax = false;
    this.clearT = 0;

    this.root = new THREE.Group();
    parent.add(this.root);

    // 足元の影
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 32),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.45, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.45, 1);
    shadow.position.y = 0.03;
    this.root.add(shadow);

    this.body = new THREE.Group();
    this.root.add(this.body);
    this.bodyMesh = layerMesh(skin.body(this.states), 2);
    this.body.add(this.bodyMesh);

    this.head = new THREE.Group();
    this.head.position.set(NECK.x, NECK.y, 0);
    this.body.add(this.head);
    this.hairBack = layerMesh(skin.hairBack(), 1);
    this.hairBack.position.z = -0.08;
    this.head.add(this.hairBack);
    this.headMesh = layerMesh(skin.head('normal', 'NORMAL'), 4);
    this.headMesh.position.z = 0.06;
    this.head.add(this.headMesh);
    this.headCache = {};

    this.arms = {};
    // 左右はキャラ自身の左右:右腕=画面左(s=-1)、左腕=画面右(s=+1・ラケット)
    for (const [side, s] of [['rightArm', -1], ['leftArm', 1]]) {
      const g = new THREE.Group();
      g.position.set(s * SHOULDER.x, SHOULDER.y, s > 0 ? 0.12 : 0.04);
      this.body.add(g);
      const mesh = layerMesh(skin.arm(s, 'NORMAL'), s > 0 ? 5 : 3);
      g.add(mesh);
      this.arms[side] = { group: g, mesh, s, spring: new Spring(90, 9) };
    }

    // 画像ボスの場合は読み込み完了まで内蔵イラストを出さない
    if (Config.boss.layout !== 'lulu') for (const m of [this.bodyMesh, this.hairBack, this.headMesh, this.arms.rightArm.mesh, this.arms.leftArm.mesh]) m.visible = false;

    this.headSpring = new Spring(110, 9);
    this.bodySpring = new Spring(80, 8);
    this.dipSpring = new Spring(90, 9);
    this.mats = [this.bodyMesh.material, this.hairBack.material, this.headMesh.material,
      this.arms.leftArm.mesh.material, this.arms.rightArm.mesh.material];
  }

  /**
   * キャラ画像の差し替え(1枚絵)。内蔵イラストのレイヤーを隠して画像の板ポリを表示する。
   * 部位差分の画像が無い間は、部位位置に「状態デカール」を重ねて DAMAGED / BROKEN を示す。
   */
  setCustomImage(img, height, y = 0) {
    if (this.imageMesh) { this.body.remove(this.imageMesh); this.imageMesh.geometry.dispose(); this.imageMesh.material.map.dispose(); }
    const w = height * (img.width / img.height);
    const geo = new THREE.PlaneGeometry(w, height);
    geo.translate(0, height / 2 + y, 0);
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.imageMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    this.imageMesh.renderOrder = 2;
    this.body.add(this.imageMesh);
    this.mats.push(this.imageMesh.material);
    for (const m of [this.bodyMesh, this.hairBack, this.headMesh, this.arms.rightArm.mesh, this.arms.leftArm.mesh]) m.visible = false;
    this.imageMode = true;
    this.refreshDecals();
  }

  /** 内蔵イラストに戻す */
  clearCustomImage() {
    if (!this.imageMesh) return;
    this.body.remove(this.imageMesh);
    this.mats = this.mats.filter((m) => m !== this.imageMesh.material);
    this.imageMesh = null;
    this.imageMode = false;
    for (const m of [this.bodyMesh, this.hairBack, this.headMesh, this.arms.rightArm.mesh, this.arms.leftArm.mesh]) m.visible = true;
    this.refreshDecals();
  }

  /** 画像サイズだけ変更 */
  resizeCustomImage(height, y = 0) {
    if (!this.imageMesh) return;
    this.setCustomImage(this.imageMesh.material.map.image, height, y);
  }

  /** Collider レイアウト(部位の位置)を受け取り、状態デカールの位置に使う */
  setPartAnchors(layout) { this.layout = layout; this.refreshDecals(); }

  refreshDecals() {
    if (!this.decals) {
      this.decals = {};
      const tex = heartDecalTexture();
      for (const id of Object.keys(this.states)) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        sp.renderOrder = 6;
        sp.visible = false;
        this.body.add(sp);
        this.decals[id] = sp;
      }
    }
    for (const [id, sp] of Object.entries(this.decals)) {
      const d = this.layout?.[id];
      const st = this.states[id];
      sp.visible = !!(d && st !== 'NORMAL');   // WARM / HEART_MAX の部位にハートを重ねる(LOVE SPOT 表示)
      if (!d) continue;
      sp.position.set(d.x, d.y, (d.z ?? 0.3) + 0.2);
      const size = d.shape === 'sphere' ? d.r * 1.6 : Math.max(1.2, Math.min(d.w, d.h) * 1.2);
      sp.scale.setScalar(size);
      sp.material.color.set(st === 'HEART_MAX' ? '#ff4fa8' : '#ffb3d6');
      sp.material.opacity = st === 'HEART_MAX' ? 0.95 : 0.55;
      sp.userData.max = st === 'HEART_MAX';
      sp.userData.base = size;
    }
  }

  /** Collider を配置する親(見た目と一緒に揺れる) */
  get anchors() {
    return { body: this.body, head: this.head, rightArm: this.arms.rightArm.group, leftArm: this.arms.leftArm.group };
  }

  /** 表情(holdSec 経過後は baseExpr に戻る) */
  setExpression(expr, holdSec = 0) {
    if (holdSec > 0) { this.expr = expr; this.exprHold = holdSec; }
    else { this.baseExpr = expr; if (this.exprHold <= 0) this.expr = expr; }
    this.refreshHead();
  }

  refreshHead() {
    const key = `${this.expr}|${this.states.head}`;
    if (this.currentHeadKey === key) return;
    this.currentHeadKey = key;
    if (!this.headCache[key]) this.headCache[key] = texFrom(this.skin.head(this.expr, this.states.head));
    this.headMesh.material.map = this.headCache[key];
  }

  /** 部位の破壊状態 → 衣装差分 */
  setPartState(part, state) {
    if (this.states[part] === state) return;
    this.states[part] = state;
    this.refreshDecals();
    if (part === 'head') this.refreshHead();
    else if (part === 'leftArm' || part === 'rightArm') {
      const a = this.arms[part];
      a.mesh.material.map.dispose();
      a.mesh.material.map = texFrom(this.skin.arm(a.s, state));
    } else {
      this.bodyMesh.material.map.dispose();
      this.bodyMesh.material.map = texFrom(this.skin.body(this.states));
    }
  }

  /** 被弾リアクション(揺れ+赤フラッシュ) */
  playHit(part, power = 1) {
    const p = Math.min(power, 2.5);
    this.flashT = 1;
    if (part === 'head') { this.headSpring.kick(4 * p * (this.time % 2 < 1 ? 1 : -1)); this.bodySpring.kick(-2 * p); }
    else if (part === 'chest' || part === 'stomach') { this.bodySpring.kick(-6 * p); this.headSpring.kick(2 * p); }
    else if (part === 'leftArm' || part === 'rightArm') { this.arms[part].spring.kick(-this.arms[part].s * 7 * p); this.bodySpring.kick(-1.5 * p); }
    else { this.dipSpring.kick(-6 * p); this.headSpring.kick((part === 'rightLeg' ? -3 : 3) * p); }
  }

  /** 返球前の「溜め」:体を少し沈める程度(攻撃モーションではない) */
  playCharge() { this.dipSpring.kick(-2.5); }

  setLook(x) { this.lookTarget = x; }
  /** TotalHeart 100%:喜びのリアクション(倒れる演出はしない) */
  setHeartMax() { this.heartMax = true; this.clearT = 0; this.setExpression('love'); }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.headSpring.update(dt);
    this.bodySpring.update(dt);
    this.dipSpring.update(dt);

    const breath = Math.sin(t * 2.0);
    this.body.scale.set(1 - breath * 0.004, 1 + breath * 0.008, 1);
    this.body.position.y = this.dipSpring.x * 0.12;
    this.body.position.z = this.bodySpring.x * 0.2;
    // 好感度の表情ポーズ(視線をそらす=少し顔を背ける 等)。AffectionSystem が pose を設定
    this.pose ??= { tilt: 0, x: 0, tTilt: 0, tX: 0 };
    this.pose.tilt += (this.pose.tTilt - this.pose.tilt) * Math.min(1, dt * 3);
    this.pose.x += (this.pose.tX - this.pose.x) * Math.min(1, dt * 3);
    this.body.rotation.z = Math.sin(t * 0.9) * 0.012 + this.pose.tilt;
    this.body.position.x = this.pose.x;

    this.lookX += (this.lookTarget - this.lookX) * Math.min(1, dt * 4);
    this.head.rotation.z = -this.lookX * 0.06 + this.headSpring.x * 0.05 + Math.sin(t * 1.3) * 0.02;
    this.head.position.x = this.lookX * 0.12;
    this.hairBack.rotation.z = Math.sin(t * 1.7) * 0.03 - this.headSpring.x * 0.03;

    for (const side of ['leftArm', 'rightArm']) {
      const a = this.arms[side];
      a.spring.update(dt);
      const base = a.s > 0 ? 0.12 + Math.sin(t * 1.4) * 0.04 : -0.1 - Math.sin(t * 1.4 + 1) * 0.04;
      a.group.rotation.z = base + a.spring.x * 0.05;
    }

    if (this.exprHold > 0) {
      this.exprHold -= dt;
      if (this.exprHold <= 0) { this.expr = this.baseExpr; this.refreshHead(); }
    }

    this.flashT = Math.max(0, this.flashT - dt * 5);
    const f = this.flashT;
    for (const m of this.mats) m.color.setRGB(1, 1 - f * 0.45, 1 - f * 0.4);

    // LOVE SPOT のハートは脈打つ
    if (this.decals) for (const sp of Object.values(this.decals)) if (sp.visible && sp.userData.max) sp.scale.setScalar(sp.userData.base * (1 + Math.sin(t * 6) * 0.12));

    if (this.heartMax) {
      // うれしそうに弾む
      this.clearT += dt;
      this.root.position.y = Math.abs(Math.sin(this.clearT * 5)) * 0.6 * Math.max(0, 1 - this.clearT / 3);
      this.body.scale.multiplyScalar(1 + Math.sin(this.clearT * 10) * 0.01);
    }
  }
}
