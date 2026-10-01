import * as THREE from '../lib/three.js';
import { Config, bossProfile } from '../core/Config.js';
import { simulate } from '../physics/BallPhysics.js';
import { glowTexture, shadowTexture } from '../world/Textures.js';

const ROUTE_COLORS = ['#3ee8ff', '#ff7ad9', '#b6ff5c', '#ffb13d'];
const tmp = new THREE.Vector3();

/**
 * Energy Orb と Energy ゲージ。
 *
 * Orb の配置は「ルート」単位のデータ(Config.energy.routes)で定義する。
 * ルート = お手本の1投(狙う部位・POWER・SPIN)。それを実際の物理でシミュレーションし、
 * 軌道上に Orb を並べる → 配置は必ず取得可能で、しかも「その軌道で投げないと取れない」。
 *   例:center(ストレート)= 1個 / curveRtoL(↑→← の左カーブ)= 4個 / high(Power を落とした山なり)= 3個
 * 投球ごとに bossProfile().energyArrangements から組み合わせを選ぶ(ボスごとに変更可能)。
 */
export class EnergySystem {
  constructor(g) {
    this.g = g;
    this.energy = 0;
    this.armed = false;
    this.arrangementIndex = 0;
    this.orbs = [];
    this.collecting = false;
    this.combo = 0;
    this.time = 0;

    const tex = glowTexture();
    this.pool = [];
    for (let i = 0; i < 72; i++) {   // FEVER の大量配置にも足りる数(通常時は一部だけ使う)
      const group = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22),
        new THREE.MeshBasicMaterial({ color: '#ffffff' })
      );
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.3);
      core.renderOrder = 9; halo.renderOrder = 9;
      group.add(core, halo);
      group.visible = false;
      g.scene.add(group);
      // 床への簡易投影(高さ・奥行きを読みやすく)
      // 床に Orb の色の光の点を落とす(手前→奥へ床の上に並ぶので、どれが手前か一目で分かる)
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.visible = false;
      g.scene.add(shadow);
      this.pool.push({ group, core, halo, shadow });
    }
  }

  get max() { return Config.energy.max; }
  get ready() { return this.energy >= this.max; }

  reset() {
    this.energy = 0;
    this.armed = false;
    this.arrangementIndex = Math.floor(Math.random() * 5);
    this.clear();
    this.g.ui.setEnergy(0, this.max, false, false);
  }

  /**
   * 次の投球用に Orb を配置。
   *   通常:bossProfile().energyArrangements(ルート名の組み合わせ)を順に巡回
   *   FEVER:Config.fever.energyPatterns から毎投ランダム(同じパターンの連続は避ける)。Orb 数・広がりは調整値で拡縮
   */
  spawnForThrow() {
    const g = this.g;
    this.clear();
    const fever = g.fever?.active;
    let items, spacing = 0.9;
    this.pattern = null;
    if (fever) {
      const F = Config.fever;
      const list = F.energyPatterns;
      let idx = Math.floor(Math.random() * list.length);
      if (list.length > 1 && list[idx].id === this.lastFeverPattern) idx = (idx + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      this.pattern = list[idx];
      this.lastFeverPattern = this.pattern.id;
      items = this.pattern.items.map((it) => ({ ...it, count: Math.max(1, Math.round((it.count ?? 1) * F.energyCountMultiplier)) }));
      spacing = F.orbSpacing;
    } else {
      const list = bossProfile().energyArrangements ?? [['center']];
      items = list[this.arrangementIndex++ % list.length].map((name) => ({ route: name }));
    }
    this.placeItems(items, spacing, fever ? Config.fever.energyPatternScale : 1);
    if (fever) g.fever.onPatternPlaced(this.pattern, this.orbs.length);
  }

  /** 3D の位置リストに Orb を置く(SpaceSystem の RoutePattern から)。{ pos, color, route } */
  placeAt(list, spacing = 0.8) {
    let pi = this.orbs.length;
    for (const it of list) {
      if (this.orbs.some((o) => o.pos.distanceTo(it.pos) < spacing)) continue;
      const slot = this.pool[pi++];
      if (!slot) return;
      slot.group.visible = true;
      slot.group.position.copy(it.pos);
      slot.group.scale.setScalar(1);
      slot.halo.material.color.set(it.color);
      slot.core.material.color.set(it.color);
      this.orbs.push({ slot, pos: it.pos.clone(), taken: false, route: it.route, phase: Math.random() * 6, fly: 0, depth: it.depth ?? 0.5 });
    }
  }

  /** ルート(お手本の1投)を実際の物理でシミュレーションし、その軌道上に Orb を並べる */
  placeItems(items, spacing, patternScale = 1) {
    const g = this.g;
    const E = Config.energy;
    g.cam.settle();   // 構え位置を確定(Orb の軌道と実際の投球を一致させる)
    const start = g.player.holdAnchor();
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    let pi = 0;
    items.forEach((item, ri) => {
      const r = typeof item.route === 'string' ? E.routes[item.route] : item.route;
      if (!r) return;
      const count = item.count ?? r.count ?? 1;
      const span = item.span ?? r.span ?? [0.3, 0.8];
      const target = g.boss.restPartCenter(r.target, new THREE.Vector3());   // 揺れていない姿勢(MULTI で全員同じ配置)
      target.z = Config.boss.z + 0.5;
      const th = g.player.thrower.buildThrow(start, target, r.power, r.spin ?? 0);
      const sim = simulate(start, th.velocity, th.curveAccel, g.boss.hitColliders);
      const pts = sim.points;
      const n = pts.length;
      for (let k = 0; k < count; k++) {
        const f = count === 1 ? span[0] : span[0] + (span[1] - span[0]) * (k / (count - 1));
        const fi = f * (n - 1), i0 = Math.max(0, Math.min(n - 2, Math.floor(fi)));
        const p = pts[i0].clone().lerp(pts[i0 + 1] ?? pts[i0], fi - i0);   // 軌道上を補間(点が密に並べられる)
        const off = item.offset;
        if (off) {
          const dir = (pts[i0 + 1] ?? pts[i0]).clone().sub(pts[i0]).normalize();
          right.set(1, 0, 0).addScaledVector(dir, -dir.x).normalize();
          up.crossVectors(right, dir).normalize();
          if (off.type === 'spiral') {
            const a = (k / Math.max(1, count - 1)) * off.turns * Math.PI * 2;
            p.addScaledVector(right, Math.cos(a) * off.radius * patternScale).addScaledVector(up, Math.sin(a) * off.radius * patternScale);
          } else if (off.type === 'zigzag') {
            p.addScaledVector(right, (k % 2 ? 1 : -1) * off.amp * patternScale);
          }
        }
        if (this.orbs.some((o) => o.pos.distanceTo(p) < spacing)) continue;   // 重なりは1つに
        const slot = this.pool[pi++];
        if (!slot) return;
        slot.group.visible = true;
        slot.group.position.copy(p);
        slot.group.scale.setScalar(1);
        const color = item.color ?? ROUTE_COLORS[ri % ROUTE_COLORS.length];
        slot.halo.material.color.set(color);
        slot.core.material.color.set(color);
        this.orbs.push({ slot, pos: p.clone(), taken: false, route: typeof item.route === 'string' ? item.route : `${this.pattern?.id ?? 'custom'}#${ri}`, phase: Math.random() * 6, fly: 0, depth: f });
      }
    });
  }

  clear() {
    for (const s of this.pool) { s.group.visible = false; s.shadow.visible = false; }
    this.orbs = [];
    this.collecting = false;
  }

  /** 投球開始:ここから Orb を取得できる */
  beginThrow() { this.collecting = true; this.combo = 0; }
  /** この1投で取った Energy 数 */
  get throwCount() { return this.combo; }
  endThrow() { this.collecting = false; }

  /** ボールの移動線分と Orb の接触判定(固定ステップの物理位置で判定) */
  check(prev, cur) {
    if (!this.collecting) return;
    const rr = Config.energy.orbRadius + Config.ball.radius;
    const seg = tmp.subVectors(cur, prev);
    const len2 = seg.lengthSq();
    for (const o of this.orbs) {
      if (o.taken) continue;
      // 線分と点の最短距離
      let t = len2 > 0 ? o.pos.clone().sub(prev).dot(seg) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const closest = prev.clone().addScaledVector(seg, t);
      if (closest.distanceTo(o.pos) <= rr) this.collect(o);
    }
  }

  collect(o) {
    const g = this.g;
    o.taken = true;
    o.fly = 0.001;
    this.combo++;
    const before = this.energy;
    this.energy = Math.min(this.max, this.energy + Config.energy.orbValue);
    g.stats.orbs = (g.stats.orbs ?? 0) + 1;
    g.ball.pulseBoost(0.8);
    g.effects.burst(o.pos, o.slot.halo.material.color.getStyle(), 10, 4, 0.35);
    g.audio.orb(this.combo);
    const s = g.player.toScreen(o.pos);
    const tb = Config.energy.throwBonus;
    g.ui.damageNumber(s.x, s.y, `♡+${Config.energy.orbValue}`, { color: '#3ee8ff', label: `${this.combo} ENERGY ×${tb[Math.min(this.combo, tb.length - 1)]}` });
    g.ui.setEnergy(this.energy, this.max, this.ready, this.armed, true);
    if (before < this.max && this.ready) {
      g.ui.partCallout('SPECIAL READY!', 'all');
      g.audio.rallyUp();
    }
  }

  /** 必殺技の予約/解除(READY の時だけ) */
  toggleArm() {
    if (!this.ready || this.g.specialSequencePlaying) return false;
    this.armed = !this.armed;
    this.g.ui.setEnergy(this.energy, this.max, this.ready, this.armed);
    this.g.ball.setSpecial(this.armed);
    return this.armed;
  }

  /** 投球時:予約されていれば必殺技を消費して効果を返す */
  consumeSpecial() {
    if (!this.armed || !this.ready || this.g.specialSequencePlaying) return null;
    this.armed = false;
    this.energy = 0;
    this.g.ui.setEnergy(0, this.max, false, false);
    return { ...Config.special };   // heartMul / ballScale / hitstop
  }

  update(dt) {
    this.time += dt;
    for (const o of this.orbs) {
      const gr = o.slot.group;
      // 床の影(取得済み・吸い込み中は消す)
      const sh = o.slot.shadow;
      sh.visible = !o.taken;
      if (!o.taken) {
        sh.position.set(o.pos.x, 0.03, o.pos.z);
        sh.material.color.copy(o.slot.core.material.color);
        const h = Math.max(0, o.pos.y);
        sh.scale.setScalar(1.4 + h * 0.05);
        sh.material.opacity = Math.max(0.22, 0.6 - h * 0.02);
      }
      if (o.taken) {
        // ボールへ吸い込まれて消える
        o.fly += dt / 0.14;
        const k = Math.min(1, o.fly);
        gr.position.lerpVectors(o.pos, this.g.ball.pos, k);
        gr.scale.setScalar(1 - k * 0.8);
        if (k >= 1) gr.visible = false;
        continue;
      }
      gr.position.set(o.pos.x, o.pos.y + Math.sin(this.time * 3 + o.phase) * 0.08, o.pos.z);
      o.slot.core.rotation.y += dt * 2.5;
      o.slot.core.rotation.x += dt * 1.3;
      // 遠近:手前ほど明るく大きく、奥ほど淡く小さく(パースに加えて空気遠近で奥行きを読みやすく)
      const dk = o.depth ?? 0.5;
      o.slot.halo.material.opacity = (0.95 - dk * 0.35) + Math.sin(this.time * 5 + o.phase) * 0.15;
      o.slot.core.scale.setScalar(1.2 - dk * 0.35);
      // FEVER 中は少しだけ強く発光(Lv が上がるほど)。形・位置は変えない(視認性優先)
      const fl = this.g.fever?.active ? this.g.fever.level : 0;
      o.slot.halo.scale.setScalar(1.3 * (1.15 - dk * 0.3) * (1 + fl * 0.1) * (fl ? 1 + Math.sin(this.time * 8 + o.phase) * 0.06 : 1));
    }
  }
}
