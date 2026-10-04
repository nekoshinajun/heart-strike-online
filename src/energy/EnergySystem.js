import * as THREE from '../lib/three.js';
import { Config, bossProfile } from '../core/Config.js';
import { SpecialGauges, specialOrbGain } from '../data/SpecialGauge.js';
import { simulate } from '../physics/BallPhysics.js';
import { glowTexture, shadowTexture } from '../world/Textures.js';

const ROUTE_COLORS = ['#3ee8ff', '#ff7ad9', '#b6ff5c', '#ffb13d'];
const tmp = new THREE.Vector3();

/**
 * Diamond(コード上は Energy Orb)と SPECIAL(必殺技)ゲージ。
 *   役割は1つだけ:Diamond 1個 = SPECIAL +orbValue。キャラごとの必要個数(special.requiredDiamonds)で MAX → SPECIAL READY
 *   SPECIAL ゲージはキャラごと(data/SpecialGauge.js)。Diamond は投げたキャラ本人のゲージにだけ入り、必殺技で 0 に戻るのも本人だけ
 *   表示はアイコンを囲むリング(各キャラのゲージ)だけ。READY のキャラは今の手番ならアイコンをタップで必殺技を予約 / 解除
 *   Diamond を取ってもダメージ倍率・FEVER ゲージは増えない(Heart Gate = ダメージ / COMBO = FEVER)
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
    this.gauges = new SpecialGauges();
    this.armed = false;
    this.throwerIndex = null;   // この1投を投げたキャラの index(Diamond はこのキャラのゲージへ)
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
    this.bonus = [];
    this.bonusTaken = new Set();   // このターンに取ったボーナスアイテム(同じターンの次の投球では出さない)
    this.bonusTurn = 0;
    this.bonusMeshes = { heal: this.makeBonusMesh('heal', tex), big: this.makeBonusMesh('big', tex) };
  }

  /** ボーナスアイテムの見た目:heal = 緑に光る玉 + 白い十字 / big = 大きな Diamond(金の光)*/
  makeBonusMesh(kind, tex) {
    const B = Config.bonusItems, g = this.g, group = new THREE.Group();
    const add = (m) => { m.renderOrder = 10; group.add(m); return m; };
    let core;
    if (kind === 'heal') {
      core = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshBasicMaterial({ color: B.heal.color })));
      const white = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false });
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.06), white)).position.z = 0.43;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.06), white)).position.z = 0.43;
    } else {
      core = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color: B.big.color })));
      core.scale.set(1, 1.25, 1);
    }
    const halo = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: kind === 'heal' ? B.heal.color : B.big.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    halo.scale.setScalar(kind === 'heal' ? 2.4 : 3.8);
    group.visible = false;
    g.scene.add(group);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: kind === 'heal' ? B.heal.color : B.big.glow, transparent: true, depthWrite: false, opacity: 0.6, blending: THREE.AdditiveBlending }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(2.2);
    shadow.visible = false;
    g.scene.add(shadow);
    return { group, core, halo, shadow };
  }

  /** 今のターン(PLAYER ATTACK PHASE)の番号。1ターン目 = ボスの攻撃の前(MULTI はサーバーの回数なので全員同じ)*/
  get turnNo() { return (this.g.bossAttacks ?? 0) + 1; }

  /** このターンはボーナスアイテムが出るか(3ターン目以降、3の倍数のターン)*/
  bonusTurnNow() {
    const B = Config.bonusItems, t = this.turnNo;
    return !!B && t >= (B.fromTurn ?? 3) && t % (B.everyTurns ?? 3) === 0;
  }

  /**
   * ボーナスアイテムを置く(SpaceSystem.spawnForThrow から。MULTI は seed の乱数の中で呼ぶ → 全員同じ配置)
   *   カーブをかけた投球でしか取れない(まっすぐの投球が通っても取れない)。置く場所は「お手本のカーブの1投」の軌道の上:
   *   右カーブ / 左カーブそれぞれで敵に当たる投球を物理で作り、まっすぐの線から一番大きく膨らんだ所(画面に見える範囲)に置く
   *   左右どちらに回復 / Diamond を置くかはランダム。AUTO の投球はこの近くを通らない(AutoPlay)
   */
  spawnBonus() {
    const g = this.g, B = Config.bonusItems;
    if (this.bonusTurn !== this.turnNo) { this.bonusTurn = this.turnNo; this.bonusTaken = new Set(); }
    this.clearBonus();
    if (!this.bonusTurnNow() || g.tutorial) return;
    const kinds = ['heal', 'big'].filter((k) => !this.bonusTaken.has(k));
    if (!kinds.length) return;
    g.cam.settle();
    const start = g.player.holdAnchor(), calc = g.player.thrower, plane = g.targetPlane();
    const wave = g.wave?.active;
    const z = (wave ? g.wave.z : Config.boss.z) + 0.5;
    const aim = wave ? g.wave.focusPoint() : g.boss.restPartCenter('chest', new THREE.Vector3());
    // 画面の端で見切れない所(縦長スマホの基準の画角で判定 → MULTI で端末の画面サイズが違っても同じ配置)
    const refCam = g.cam.base.clone();
    refCam.aspect = 390 / 844;
    refCam.fov = Config.camera.fov + (0.5 - refCam.aspect) * 30;
    refCam.updateProjectionMatrix(); refCam.updateMatrixWorld(true);
    const gateNdc = (g.space.gates ?? []).map((gt) => {
      const c = gt.pos.clone().project(refCam), e = gt.pos.clone().add(new THREE.Vector3(Config.space.gate.radius ?? 1.45, 0, 0)).project(refCam);
      return { x: c.x, y: c.y, r: Math.abs(e.x - c.x) * refCam.aspect };
    });
    const spin = B.spin ?? 0.9;
    const order = Math.random() < 0.5 ? kinds : [...kinds].reverse();
    const sides = order.length === 1 ? [Math.random() < 0.5 ? -1 : 1] : [-1, 1];
    order.forEach((kind, k) => {
      const side = sides[k];   // -1 = 左に膨らむ(右カーブ) / 1 = 右に膨らむ(左カーブ)
      // 左右のアイテムは敵の左側 / 右側を狙う軌道に(1投で両方は取れない)。高さも変えて、ゲートと重ならない軌道を探す
      const tries = [];
      for (const dy of [0, 3, -3, 6]) for (const ox of [3, 4.5, 1.5, 6]) tries.push([side * ox, dy]);
      for (const [ox, dy] of tries) {
        const target = new THREE.Vector3(aim.x + ox, aim.y + dy + (Math.random() - 0.5), z);
        const th = calc.buildThrow(start, target, 0, -side * spin);
        const sim = simulate(start, th.velocity, th.curveAccel, plane, 0.02);
        if (sim.result?.type !== 'hit') continue;
        const end = sim.points[sim.points.length - 1];
        let best = null;
        for (const p of sim.points) {
          const f = (start.z - p.z) / Math.max(1e-3, start.z - end.z);
          if (f < 0.18 || f > 0.7) continue;   // 手前寄り(大きく見える)
          const n = p.clone().project(refCam);
          if (Math.abs(n.x) > 0.8 || n.y > 0.7 || n.y < -0.3) continue;
          // Heart Gate の輪と画面上で重ならない所(輪の大きさは奥行きで変わるので、画面上の輪の半径で比べる)
          if (gateNdc.some((q) => Math.hypot((q.x - n.x) * refCam.aspect, q.y - n.y) < q.r + 0.06)) continue;
          const bulge = side * (p.x - (start.x + (end.x - start.x) * f));   // まっすぐの線(発射位置 → 着弾点)からの膨らみ
          if (!best || bulge > best.bulge) best = { p, bulge };
        }
        if (best) { this.bonus.push({ kind, pos: best.p.clone(), taken: false, fly: 0, mesh: this.bonusMeshes[kind], hinted: false }); break; }
      }
    });
    for (const b of this.bonus) { b.mesh.group.visible = true; b.mesh.group.scale.setScalar(1); b.mesh.group.position.copy(b.pos); }
  }

  clearBonus() {
    for (const m of Object.values(this.bonusMeshes)) { m.group.visible = false; m.shadow.visible = false; }
    this.bonus = [];
  }

  /** 軌道(点の列)がまだ取られていないボーナスアイテムの近くを通るか(AUTO が取りに行かないように)*/
  nearBonus(points, extra = 0) {
    const live = this.bonus.filter((b) => !b.taken);
    if (!live.length || !points?.length) return false;
    const rr = Config.bonusItems.radius + Config.ball.radius + extra;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], seg = tmp.subVectors(points[i], a), len2 = seg.lengthSq();
      for (const b of live) {
        const t = len2 > 0 ? Math.max(0, Math.min(1, b.pos.clone().sub(a).dot(seg) / len2)) : 0;
        if (a.clone().addScaledVector(seg, t).distanceTo(b.pos) <= rr) return true;
      }
    }
    return false;
  }

  /** ボーナスアイテムを取った */
  collectBonus(b) {
    const g = this.g, B = Config.bonusItems;
    b.taken = true;
    b.fly = 0.001;
    this.bonusTaken.add(b.kind);
    if (b.kind === 'big') { this.collect({ pos: b.pos, color: B.big.glow, big: true }, B.big.diamonds ?? 5); return; }
    // 回復:生存している味方全員(最大 HP × ratio)。MULTI は投げた人がサーバーへ送り、全員が同じ HP になる(サーバーの HEAL で演出)
    g.effects.burst(b.pos, B.heal.color, 24, 6, 0.5);
    g.ball.pulseBoost(1);
    g.audio.rallyUp();
    const s = g.player.toScreen(b.pos);
    g.ui.damageNumber(s.x, s.y, 'HEAL!', { color: B.heal.color, label: '✚ 回復アイテム' });
    if (g.online) { if (g.lastThrowMine) g.online.sendItemHeal?.(B.heal.ratio); return; }
    const healed = [];
    g.turn.players.forEach((p, i) => {
      if (!p || !(p.hp > 0)) return;
      const before = p.hp, after = Math.min(p.maxHp ?? before, before + Math.round((p.maxHp ?? 100) * B.heal.ratio));
      p.hp = after;
      healed.push({ i, before, after, gained: after - before });
    });
    g.stats.healed = (g.stats.healed ?? 0) + healed.reduce((a, h) => a + h.gained, 0);
    g.ui.playItemHeal?.(healed, s);
  }

  /** 今操作中のキャラの SPECIAL(値 / 最大 / 使えるか)*/
  get index() { return this.g.turn.index; }
  get energy() { return this.gauges.value(this.index); }
  get max() { return this.gauges.max(this.index); }
  get ready() { return this.gauges.ready(this.index); }

  /** バトル開始(リトライ・次のバトルも):全キャラのゲージを初期値へ */
  reset() {
    this.gauges.reset(this.g.turn.players);
    this.armed = false;
    this.throwerIndex = null;
    this.arrangementIndex = Math.floor(Math.random() * 5);
    this.bonusTurn = 0; this.bonusTaken = new Set();
    this.clear();
    this.refreshUI();
  }

  /** 画面の SPECIAL 表示:各キャラのアイコンのリング(予約中のキャラは ON!)*/
  refreshUI(bump = false) {
    this.g.ui.setSpecialGauges?.(this.gauges.entries.map((_, i) => ({ ratio: this.gauges.ratio(i), ready: this.gauges.ready(i), armed: this.armed && i === this.index, bump: bump && i === this.index })));
  }

  /** 手番が変わった:予約は手番のキャラだけのもの → 解除して表示を切り替える(ゲージの値は各キャラが保持)*/
  onTurn() {
    if (this.armed && !this.g.specialSequencePlaying) { this.armed = false; this.g.ball.setSpecial(false); }
    this.refreshUI();
  }

  /** MULTI:サーバーが確定した値(他のプレイヤーのキャラ / 必殺技で 0)*/
  applyRemote(i, value) {
    if (!this.gauges.at(i)) return;
    this.gauges.set(i, value);
    this.refreshUI();
  }

  /** MULTI:このキャラの値を決めるのは自分(担当のプレイヤー)か。SOLO は全員自分 */
  ownsGauge(i) { return !this.g.online || !!this.g.turn.players[i]?.mine; }

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
    this.clearBonus();
    this.orbs = [];
    this.collecting = false;
  }

  /** 投球開始:ここから Orb を取得できる */
  beginThrow(spin = 0) { this.collecting = true; this.combo = 0; this.throwerIndex = this.g.turn.index; this.throwSpin = Number(spin) || 0; for (const b of this.bonus) b.hinted = false; }
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
    // ボーナスアイテム:カーブ(|spin| ≥ minSpin)の投球だけが取れる。まっすぐの球が通った時は「CURVE で取れる」と1回だけ知らせる
    const BI = Config.bonusItems, br = BI.radius + Config.ball.radius;
    for (const b of this.bonus) {
      if (b.taken) continue;
      let t = len2 > 0 ? b.pos.clone().sub(prev).dot(seg) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      if (prev.clone().addScaledVector(seg, t).distanceTo(b.pos) > br) continue;
      if (Math.abs(this.throwSpin ?? 0) >= (BI.minSpin ?? 0.35)) { this.collectBonus(b); continue; }
      if (!b.hinted) { b.hinted = true; const s = this.g.player.toScreen(b.pos); this.g.ui.damageNumber(s.x, s.y, 'CURVE!', { color: '#ffffff', label: 'カーブをかけると取れる' }); }
    }
  }

  /** mul:Diamond 何個分か(大きな Diamond = Config.bonusItems.big.diamonds)*/
  collect(o, mul = 1) {
    const g = this.g;
    o.taken = true;
    o.fly = 0.001;
    this.combo++;
    // Diamond 1個 = 投げたキャラ本人の SPECIAL +orbValue。本人が SPECIAL CHARGE を持っていれば ×1.2。MAX で止める(超えた分は切り捨て)
    const i = this.throwerIndex ?? g.turn.index;
    const chara = g.turn.players[i]?.chara;
    const one = specialOrbGain(chara), charged = one.charged, gain = one.gain * mul;
    const own = this.ownsGauge(i);
    const wasReady = this.gauges.ready(i);
    // MULTI で他のプレイヤーのキャラ:値は担当プレイヤー → サーバーから届く(ここでは演出だけ。二重加算しない)
    if (own) {
      this.gauges.add(i, gain);
      g.online?.sendSpecialGauge?.(i, this.gauges.value(i));
    }
    g.stats.orbs = (g.stats.orbs ?? 0) + 1;
    g.tutorial?.emit('orb');
    g.ball.pulseBoost(0.8);
    g.effects.burst(o.pos, o.color ?? o.slot.halo.material.color.getStyle(), o.big ? 30 : 10, o.big ? 7 : 4, 0.35);
    g.audio.orb(this.combo);
    // 「SPECIAL +○%」(ゲージ最大値に対する割合)→ Diamond が SPECIAL ゲージへ飛ぶ → 着いたらゲージが増える(MAX なら SPECIAL READY)
    const s = g.player.toScreen(o.pos);
    const add = Math.round((gain / this.gauges.max(i)) * 100);
    const reached = own && !wasReady && this.gauges.ready(i);
    g.ui.damageNumber(s.x, s.y, `SPECIAL +${add}%`, { color: charged ? '#ffd27a' : '#ffb3e0', label: `${o.big ? '◆ BIG DIAMOND' : '◆ DIAMOND'}${charged ? ' ・ SPECIAL CHARGE' : ''}` });
    const target = g.ui.cards?.[i]?.d;   // 投げたキャラのアイコン(リングのゲージ)へ
    g.ui.flyTo(s.x, s.y, target, '<i class="dia">◆</i>', 'diamond', 480).then(() => {
      this.refreshUI(i === g.turn.index);
      if (reached && this.gauges.ready(i)) {
        g.ui.partCallout('♡ SPECIAL READY! ♡', 'all');
        g.ui.showJudge('SPECIAL READY!', 'specialready', '#ffd23e', 'アイコンをタップで必殺技');
        g.audio.rallyUp();
      }
    });
  }

  /** 必殺技の予約/解除(今操作中のキャラのゲージが READY の時だけ。MULTI は自分の手番だけ)*/
  toggleArm() {
    if (!this.ready || this.g.specialSequencePlaying) return false;
    if (this.g.online && !this.g.online.isMyTurn()) return false;
    this.armed = !this.armed;
    this.refreshUI();
    this.g.ball.setSpecial(this.armed);
    if (this.armed) this.g.cutin?.preload?.(this.g.turn.current?.chara);   // 投げた瞬間に画像の読み込みで引っかからないように
    this.g.tutorial?.emit('specialArmed', { armed: this.armed });
    return this.armed;
  }

  /** 投球時:予約されていれば必殺技を消費して効果を返す(使ったキャラのゲージだけ 0。他のキャラは保持)*/
  consumeSpecial() {
    if (!this.armed || !this.ready || this.g.specialSequencePlaying) return null;
    this.armed = false;
    this.gauges.consume(this.g.turn.index);
    this.refreshUI();
    return { ...Config.special };   // heartMul / ballScale / hitstop
  }

  update(dt) {
    this.time += dt;
    for (const b of this.bonus) {
      const m = b.mesh, gr = m.group;
      if (b.taken) {
        // ハート玉へ吸い込まれて消える
        b.fly += dt / 0.18;
        const k = Math.min(1, b.fly);
        gr.position.lerpVectors(b.pos, this.g.ball.pos, k);
        gr.scale.setScalar(1 - k * 0.8);
        m.shadow.visible = false;
        if (k >= 1) gr.visible = false;
        continue;
      }
      gr.position.set(b.pos.x, b.pos.y + Math.sin(this.time * 2.6) * 0.12, b.pos.z);
      if (b.kind === 'big') m.core.rotation.y += dt * 1.8;
      else gr.rotation.y = Math.sin(this.time * 1.5) * 0.35;
      m.halo.material.opacity = 0.75 + Math.sin(this.time * 4) * 0.2;
      gr.scale.setScalar(1 + Math.sin(this.time * 4) * 0.06);
      m.shadow.visible = true;
      m.shadow.position.set(b.pos.x, 0.03, b.pos.z);
    }
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
      // FEVER 中は少しだけ強く発光。形・位置は変えない(視認性優先)
      const fv = !!this.g.fever?.active;
      o.slot.halo.scale.setScalar(1.3 * (1.15 - dk * 0.3) * (fv ? 1.1 * (1 + Math.sin(this.time * 8 + o.phase) * 0.06) : 1));
    }
  }
}
