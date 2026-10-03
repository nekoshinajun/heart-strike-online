import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { simulate } from '../physics/BallPhysics.js';
import { glowTexture, shadowTexture, wallTexture } from '../world/Textures.js';
import { heartArch, HEART_ARCH } from '../world/Painted.js';

const GATE_PINK = '#ff7ab8';
const POOL = { gate: 6, block: 3, pillar: 3, panel: 3, wall: 3 };   // gate:2ルート × 最大3

/**
 * 3D 空間の攻略:RoutePatternData から Heart Energy / Heart Gate / 障害物 を3D配置する。
 *
 * 配置の考え方:パターンごとに「お手本の1投(guide)」を実際の物理で飛ばし、その軌道に沿って
 *   NEAR / MID / FAR(奥行きレイヤー)と dx / dy(左右・高さのずれ)でポイントを置く。
 *   → 完全ランダムではなく「その投げ方をすれば1本の3D軌道でまとめて取れる」ルートになる。
 *   guide は現在キャラのタイプ補正(STRAIGHT / CURVE)込みで計算するので、どのキャラでも攻略できる。
 * ステージごとの特徴は StageData.space(使うパターン・密度・Gate 数・障害物数・障害物の速さ)。
 *
 * 2ルート同時配置(Config.space.dualRoutes):1投ごとに左右2本のルート(それぞれ RoutePattern の Gate / Energy)を同時に置く。
 *   ルートはボタンで選ばない。投げた軌道がどちらのゲートを通ったかを自動で判定する(passedRoute)。
 *   MULTI はサーバーが配った seed で同じペア・同じ位置(全クライアントが同じ投球を同じ物理で飛ばすので通過判定も一致)。
 * Heart Gate:通過で GATE PASS → GATE CHAIN。ボーナスは「最後にボスへ当たった時だけ」HEART に掛かる。
 * 障害物:見た目はすべて壁(当ててはいけないもの)。当たると反射して飛行継続(POWER 減少)。その後ボスに当たれば BANK SHOT。
 */
export class SpaceSystem {
  constructor(g) {
    this.g = g;
    this.time = 0;
    this.gates = [];
    this.obstacles = [];
    this.chain = 0;
    this.collecting = false;
    this.pattern = null;
    this.passedRoutes = [];
    this.buildPools();
  }

  get stageSpace() {
    return this.g.stage?.space ?? { patterns: Object.keys(Config.space.routePatterns), energyDensity: 1, gateCount: 2, obstacleCount: 1, obstacleSpeed: 1 };
  }

  // ---------------- 見た目(仮素材)----------------
  buildPools() {
    const g = this.g, S = Config.space;
    const shadowMat = () => new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.5 });
    const shadow = () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat()); m.rotation.x = -Math.PI / 2; m.visible = false; g.scene.add(m); return m; };
    this.pool = { gate: [], block: [], pillar: [], panel: [], wall: [] };
    // Heart Gate:金のハートのアーチの絵(2D の板。内径 = 判定の半径)+ 内側のうっすら膜 + 発光
    for (let i = 0; i < POOL.gate; i++) {
      const R = S.gate.radius;
      const grp = new THREE.Group();
      const archW = R / HEART_ARCH.innerRatio;
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(archW, archW), new THREE.MeshBasicMaterial({ map: heartArch(), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
      const film = new THREE.Mesh(new THREE.CircleGeometry(R, 40), new THREE.MeshBasicMaterial({ color: '#ff9ccc', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff5fa2', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(R * 3.2);
      grp.add(glow, film, ring);
      grp.visible = false;
      g.scene.add(grp);
      const gsh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32), new THREE.MeshBasicMaterial({ color: '#ff7ab8', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      gsh.rotation.x = -Math.PI / 2; gsh.visible = false; g.scene.add(gsh);
      this.pool.gate.push({ group: grp, ring, film, glow, shadow: gsh, busy: false });
    }
    // 障害物:すべて「壁」系(石の壁 + 赤黒の警告ストライプ + ✕)。形と大きさだけ違う(block / pillar / panel / wall)
    const O = S.obstacleShapes;
    const wallMesh = (w, h, d) => {
      const grp = new THREE.Group();
      const face = new THREE.MeshStandardMaterial({ map: wallTexture(w / h), color: '#ffffff', emissive: '#ff2a2a', emissiveIntensity: 0.12, roughness: 0.85, metalness: 0.05 });
      const side = new THREE.MeshStandardMaterial({ color: '#2b2430', emissive: '#3a0d12', emissiveIntensity: 0.4, roughness: 0.9 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, face, face]);   // 前後の面に壁の模様
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: '#ff4a4a' }));
      grp.add(box, edges);
      return grp;
    };
    for (const shape of ['block', 'pillar', 'panel']) {
      const [w, h, d] = O[shape].size;
      for (let i = 0; i < POOL[shape]; i++) this.addObstacleMesh(shape, wallMesh(w, h, d));
    }
    for (let i = 0; i < POOL.wall; i++) this.addObstacleMesh('wall', wallMesh(O.wall.w, O.wall.h, O.wall.d));
    this.shadowFactory = shadow;
  }

  addObstacleMesh(shape, obj) {
    const grp = obj.isGroup ? obj : new THREE.Group().add(obj);
    grp.visible = false;
    this.g.scene.add(grp);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
    sh.rotation.x = -Math.PI / 2; sh.visible = false;
    this.g.scene.add(sh);
    this.pool[shape].push({ group: grp, shadow: sh, shape, busy: false });
  }

  // ---------------- 配置 ----------------
  /** 投球の前に呼ぶ(PlayerAttackState)。FEVER 中は FEVER 専用の Energy 配置(Gate / 障害物は置かない) */
  spawnForThrow(forcedPattern = null, seed = null) {
    const g = this.g;
    this.clear();
    if (g.fever?.active) { g.energy.spawnForThrow(); return; }
    const sp = this.stageSpace;
    const oldRandom = Math.random;
    if (seed != null && g.online) { let x=(Number(seed)||1)>>>0; Math.random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}; }
    const list = sp.patterns?.length ? sp.patterns : Object.keys(Config.space.routePatterns);
    const DR = Config.space.dualRoutes?.pairs ?? {};
    // 2ルート:ステージで使えるパターンだけのペアから選ぶ(MULTI は seed の乱数で全員同じペア)
    const pairs = Object.keys(DR).filter((k) => list.includes(DR[k].left.pattern) && list.includes(DR[k].right.pattern));
    if (forcedPattern && DR[forcedPattern]) this.spawnDual(forcedPattern);
    else if (pairs.length) this.spawnDual(this.pickPattern(pairs, DR, !g.online));
    else this.spawnPattern(forcedPattern && Config.space.routePatterns[forcedPattern] ? forcedPattern : this.pickPattern(list));
    Math.random = oldRandom;
  }

  /** 難易度込みの重み付き抽選:tier:'hard' のルートは重み (1 + HighDifficultyRouteWeight)。
   *  HighDifficultyRouteWeight > 0 ならステージに無い hard ルートも候補に入る。同じルートの連続は避ける */
  pickPattern(list, table = null, avoidRepeat = true) {
    const P = Config.space.routePatterns, hw = this.diff.highRouteWeight ?? 0;
    const R = table ?? P;
    const hard = (k) => (table ? [R[k].left.pattern, R[k].right.pattern].some((id) => P[id]?.tier === 'hard') : R[k].tier === 'hard');
    const pool = [...list];
    if (hw > 0 && !table) for (const [k, v] of Object.entries(R)) if (v.tier === 'hard' && !pool.includes(k)) pool.push(k);
    // 同じルートの連続は避ける(MULTI は全員の乱数を揃えるため、端末ごとの履歴は使わない)
    const cand = pool.filter((k) => R[k] && (!avoidRepeat || pool.length < 2 || k !== this.lastPatternId));
    const w = cand.map((k) => (hard(k) ? 1 + hw : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1] ?? list[0];
  }

  /** 現在の DifficultyData */
  get diff() { return Config.difficulties?.[Config.runtime?.difficulty] ?? {}; }

  /** RoutePatternData を1本だけ配置(テスト・デバッグ用。通常の投球は spawnDual の2ルート) */
  spawnPattern(id) {
    const S = Config.space;
    const pat = S.routePatterns[id];
    if (!pat) return;
    this.clear();
    this.g.energy.clear();
    this.pattern = { id, ...pat };
    this.lastPatternId = id;
    const route = { side: null, pat, path: this.guidePath(pat.guide) };
    this.path = route.path;
    this.placeRoutes([route], route);
  }

  /**
   * 2ルートを同時に配置。左右のゲートが近すぎる(奥行きが近いのに minGateGap 未満)時は、狙い点を左右へ広げて組み直す。
   * どちらのルートも「そのルートのお手本の1投」を実際の物理で飛ばした軌道の上に置くので、どちらも攻略できる。
   */
  spawnDual(id) {
    const S = Config.space, D = S.dualRoutes, pair = D?.pairs?.[id];
    if (!pair) return;
    this.clear();
    this.g.energy.clear();
    this.pattern = { id, dual: true, label: id };
    this.lastPatternId = id;
    const gateCount = this.stageSpace.gateCount ?? 3;
    const routes = ['left', 'right'].map((side) => ({ side, pat: S.routePatterns[pair[side].pattern], tx: pair[side].tx ?? 0, obstacles: pair.obstacles === side }));
    for (let it = 0; it < 4; it++) {
      for (const r of routes) {
        r.path = this.guidePath({ ...r.pat.guide, tx: (r.pat.guide.tx ?? 0) + r.tx });
        r.gatePts = r.pat.points.filter((p) => p.type === 'Gate').slice(0, gateCount).map((pt) => ({ pt, f: this.depth(pt.at), pos: this.place(r.path, this.depth(pt.at), pt, 0.25) }));
      }
      let need = 0, fAt = 0.5;
      for (const a of routes[0].gatePts) for (const b of routes[1].gatePts) {
        if (Math.abs(a.pos.z - b.pos.z) > 3) continue;
        const short = D.minGateGap - (b.pos.x - a.pos.x);   // 右 − 左。交差していれば大きく広げる
        if (short > need) { need = short; fAt = Math.min(a.f, b.f); }
      }
      if (need <= 0.01) break;
      const d = (need / 2 + 0.05) / Math.max(0.2, fAt);   // ボス面での狙い点のずらし → ゲートの奥行き fAt では約 fAt 倍
      routes[0].tx -= d; routes[1].tx += d;
    }
    this.routes = routes;
    this.path = routes[0].path;
    this.placeRoutes(routes, routes.find((r) => r.obstacles) ?? null);
  }

  /** ルートの Gate / Energy を置き、障害物(1本のルートから)を全ルート・全ゲートから離して置く */
  placeRoutes(routes, obstacleRoute) {
    const g = this.g, S = Config.space;
    const sp = this.stageSpace, D = this.diff;
    const energies = [];
    const pending = [];   // 障害物は Gate を置いた後に、基本ルートと Gate から離して置く
    let obs = 0;
    const cap = Math.round((sp.obstacleCount ?? 3) * (D.obstacleCount ?? 1));
    for (const r of routes) {
      const { pat, path } = r, tag = r.side ? `${r.side}:` : '';
      let gates = 0;
      pat.points.forEach((pt, pi) => {
        const at = this.depth(pt.at);
        if (pt.type === 'Energy') {
          const to = pt.to != null ? this.depth(pt.to) : at;
          const n = Math.max(1, Math.round((pt.count ?? 1) * (sp.energyDensity ?? 1) * (D.energyDensity ?? 1)));
          for (let k = 0; k < n; k++) {
            const f = n === 1 ? at : at + (to - at) * (k / (n - 1));
            const pos = this.place(path, f, pt);
            // 難易度:Energy をルートから少しずらす(良いルートを通らないと取りにくい)
            if (D.energyJitter) { const j = D.energyJitter * 4; pos.x += (Math.random() * 2 - 1) * j; pos.y = Math.max(0.6, pos.y + (Math.random() * 2 - 1) * j * 0.6); }
            energies.push({ pos, color: pt.color ?? S.energyColors[pi % S.energyColors.length], route: `${tag}${pat.label}#${pi}`, depth: f });
          }
        } else if (pt.type === 'Gate') {
          if (gates >= (sp.gateCount ?? 3)) return;
          gates++;
          this.addGate(this.place(path, at, pt, 0.25), this.dirAt(path, at), r.side);   // Gate は基本ルートの上に置く(低い弾道でも中心がルートから外れない)
        } else if (pt.type === 'Obstacle') {
          if (r !== obstacleRoute || obs >= cap) return;
          obs++;
          pending.push({ pt, pos: this.place(path, at, pt), f: at });
        }
      });
    }
    // 難易度:追加の動く障害物(ルートの途中を横切る。止まった瞬間は必ず抜けられる振れ幅)
    const path0 = (obstacleRoute ?? routes[0]).path;
    for (let k = 0; k < (D.extraMovers ?? 0) && obs < cap; k++) {
      const f = [0.5, 0.66, 0.38][k % 3];
      const pt = { type: 'Obstacle', shape: k % 2 ? 'pillar' : 'block', at: f, dy: k % 2 ? -0.5 : 0.5,
        move: { axis: k % 2 ? 'y' : 'x', amp: 2.4, speed: 0.25 }, extra: true };
      if (!this.pool[pt.shape]?.some((o) => !o.busy)) break;
      obs++;
      pending.push({ pt, pos: this.place(path0, f, pt), f });
    }
    const paths = routes.map((r) => r.path);
    for (const o of pending) { if (this.keepClear(o, paths)) this.addObstacle(o.pt, o.pos, (sp.obstacleSpeed ?? 1) * (D.obstacleSpeed ?? 1)); }
    g.energy.placeAt(energies, 0.8);
  }

  /**
   * 障害物を Heart Gate の基本ルート(guide)と Gate から離す。
   * Gate を正しく狙った投球は障害物に邪魔されない(障害物は空間の変化や、大きく外れた投球・BANK SHOT 用)。
   * 動く障害物は往復の範囲ごと離す。距離は難易度に依らず同じ(Gate の見た目の大きさではなく基準の半径で測る)
   */
  keepClear(o, paths) {
    const S = Config.space, O = S.obstacleShapes[o.pt.shape ?? 'block'];
    const rx = O.w ? O.w / 2 : O.radius, ry = O.h ? O.h / 2 : O.radius;
    const clear = S.obstacleClearance ?? 1.9;
    const mv = o.pt.move, A = mv?.amp ?? 0, alongX = !!mv && mv.axis !== 'y';
    // 2ルートの両方の基本ルートから離す。近くの Gate(奥行きが近いもの)はリングの外側 + 余白まで離す
    const refs = (Array.isArray(paths) ? paths : [paths]).map((path) => ({ p: this.pointAt(path, o.f), r: clear }));
    for (const gt of this.gates) if (Math.abs(gt.pos.z - o.pos.z) < 2.5) refs.push({ p: gt.pos, r: S.gate.radius + clear * 0.8 });
    const nearest = (p) => {
      const dx = Math.max(0, Math.abs(o.pos.x - p.x) - (alongX ? A : 0) - rx);
      const dy = Math.max(0, Math.abs(o.pos.y - p.y) - (!alongX && mv ? A : 0) - ry);
      return Math.hypot(dx, dy);
    };
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const { p, r } of refs) {
        if (nearest(p) >= r) continue;
        const side = Math.sign(o.pos.x - p.x) || (this.sideFlip = -(this.sideFlip || 1));
        o.pos.x = p.x + side * (r + rx + (alongX ? A : 0));
        moved = true;
      }
      if (!moved) { o.cleared = true; return true; }
    }
    // 2本のルートの間に収まらない(動く壁など):両方のルートの外側(左端の外 / 右端の外)の近い方へ
    const out = Math.max(...refs.map(({ r }) => r)) + rx + (alongX ? A : 0);
    const xs = refs.map(({ p }) => p.x), x0 = o.pos.x;
    const cand = [Math.min(...xs) - out, Math.max(...xs) + out].sort((a, b) => Math.abs(a - x0) - Math.abs(b - x0));
    for (const x of cand) { o.pos.x = x; if (refs.every(({ p, r }) => nearest(p) >= r)) { o.cleared = true; return true; } }
    o.pos.x = x0;
    o.cleared = false;
    return o.cleared;   // 2本のルートの間に置き場所が無ければ置かない(どちらのルートも邪魔しない)
  }

  depth(v) { return typeof v === 'string' ? Config.space.layers[v] ?? 0.5 : v ?? 0.5; }

  /** お手本の1投を物理でシミュレーション(障害物は無視)。現在キャラのタイプ補正込み */
  guidePath(gd) {
    const g = this.g;
    g.cam.settle();
    const start = g.player.holdAnchor();
    const target = g.boss.restPartCenter(gd.target, new THREE.Vector3());   // 揺れていない姿勢の部位(端末・タイミングで変わらない)
    target.x += gd.tx ?? 0; target.y += gd.ty ?? 0;
    target.z = Config.boss.z + 0.5;
    // land:target に「着弾」させる(カーブは狙い点から shift だけ曲がる向きへずれるので、その分だけ逆へ狙う)
    if (gd.land && gd.spin) {
      const L = Config.curve.shift * Math.min(Config.curve.maxSpin, Math.abs(gd.spin)) * (g.player.thrower.mods?.curveMul ?? 1);
      target.x -= Math.sign(gd.spin) * L;
    }
    const th = g.player.thrower.buildThrow(start, target, gd.power, gd.spin ?? 0);
    const sim = simulate(start, th.velocity, th.curveAccel, g.boss.hitColliders, 0.01);
    return { points: sim.points, start, planeZ: Config.boss.z + 0.5, result: sim.result, th, target };
  }

  /** 奥行き割合 f(0 = 構え位置 → 1 = ボス面)での guide 上の点 */
  pointAt(path, f) {
    const P = path.points;
    const zt = path.start.z + (path.planeZ - path.start.z) * f;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if ((a.z - zt) * (b.z - zt) <= 0 && a.z !== b.z) return a.clone().lerp(b, (a.z - zt) / (a.z - b.z));
    }
    return P[Math.min(P.length - 1, Math.round(f * (P.length - 1)))].clone();
  }

  dirAt(path, f) {
    const a = this.pointAt(path, Math.max(0, f - 0.02)), b = this.pointAt(path, Math.min(1, f + 0.02));
    return b.sub(a).normalize();
  }

  place(path, f, pt, minY = 0.6) {
    if (pt.anchor === 'world') return new THREE.Vector3(pt.x ?? 0, pt.y ?? 3, path.start.z + (path.planeZ - path.start.z) * f);
    const p = this.pointAt(path, f);
    p.x += pt.dx ?? 0; p.y += pt.dy ?? 0;
    p.y = Math.max(minY, p.y);
    return p;
  }

  addGate(pos, dir, route = null) {
    const slot = this.pool.gate.find((s) => !s.busy);
    if (!slot) return;
    slot.busy = true;
    slot.group.visible = true;
    slot.group.position.copy(pos);
    slot.group.lookAt(pos.clone().add(dir));   // リング面を飛行方向へ向ける
    slot.shadow.visible = true;
    this.gates.push({ slot, pos: pos.clone(), normal: dir.clone(), passed: false, index: this.gates.length, pulse: 0, route });
    this.setGateColor(this.gates.at(-1), GATE_PINK);
  }

  setGateColor(gt, c) {
    // 絵の色はそのまま(通過したら少し明るく光らせる)。膜と発光は c の色
    gt.slot.ring.material.color.set(c === GATE_PINK ? '#ffffff' : '#fff8d8');
    gt.slot.glow.material.color.set(c);
    gt.slot.film.material.color.set(c);
  }

  addObstacle(pt, pos, speedMul) {
    const shape = pt.shape ?? 'block';
    const slot = this.pool[shape]?.find((s) => !s.busy);
    if (!slot) return;
    slot.busy = true;
    slot.group.visible = true;
    slot.shadow.visible = true;
    slot.group.rotation.set(0, 0, 0);
    const O = Config.space.obstacleShapes[shape];
    this.obstacles.push({
      slot, shape, base: pos.clone(), pos: pos.clone(),
      move: pt.move ? { ...pt.move, speed: pt.move.speed * speedMul } : null,
      phase: Math.random() * Math.PI * 2,
      radius: O.radius, box: shape === 'wall' ? { hx: O.w / 2, hy: O.h / 2, hz: O.d / 2 } : null,
    });
    this.updateObstacles(0);
  }

  /** 配置したゲート / 障害物だけを消す(チュートリアル:レッスンで扱わないものを出さない)*/
  strip({ gates = false, obstacles = false } = {}) {
    const free = (s) => { s.busy = false; s.group.visible = false; s.shadow.visible = false; };
    if (gates) { for (const gt of this.gates) free(gt.slot); this.gates = []; }
    if (obstacles) { for (const o of this.obstacles) free(o.slot); this.obstacles = []; }
  }

  clear() {
    for (const k of Object.keys(this.pool)) for (const s of this.pool[k]) { s.busy = false; s.group.visible = false; s.shadow.visible = false; }
    this.gates = [];
    this.obstacles = [];
    this.collecting = false;
    this.chain = 0;
    this.pattern = null;
    this.routes = null;
    this.passedRoutes = [];
  }

  // ---------------- 投球中 ----------------
  /** 発射の瞬間(SPECIAL はカットイン完了後)から Gate 判定を始める */
  beginThrow() {
    this.collecting = true;
    this.chain = 0;
    this.passedRoutes = [];
    for (const gt of this.gates) { gt.passed = false; this.setGateColor(gt, GATE_PINK); }
  }
  endThrow() { this.collecting = false; }
  /** この投球で通ったルート('left' / 'right'。最初に通ったゲートのルート。どちらも通らなければ null)*/
  get passedRoute() { return this.passedRoutes[0] ?? null; }

  /** Gate の大きさ = Config.space.gate.radius × DifficultyData.GateSizeMultiplier */
  get gateScale() { return Config.runtime?.gateSize ?? 1; }
  get gateRadius() { return Config.space.gate.radius * this.gateScale; }

  /** GATE CHAIN の倍率(ボスに当たった時だけ使う) */
  get chainMul() { const t = Config.space.gate.chainBonus; return t[Math.min(this.chain, t.length - 1)]; }

  /** ボールの移動線分がリング面を横切り、その点がリングの内側なら通過 */
  check(prev, cur) {
    if (!this.collecting) return;
    const R = this.gateRadius;
    for (const gt of this.gates) {
      if (gt.passed) continue;
      const s0 = prev.clone().sub(gt.pos).dot(gt.normal), s1 = cur.clone().sub(gt.pos).dot(gt.normal);
      if (s0 === s1 || s0 * s1 > 0) continue;
      const t = s0 / (s0 - s1);
      const p = prev.clone().lerp(cur, t);
      if (p.distanceTo(gt.pos) <= R) this.passGate(gt);
    }
  }

  passGate(gt) {
    const g = this.g;
    gt.passed = true;
    gt.pulse = 1;
    this.chain++;
    if (gt.route && !this.passedRoutes.includes(gt.route)) this.passedRoutes.push(gt.route);
    if (g.stats) g.stats.maxGateChain = Math.max(g.stats.maxGateChain ?? 0, this.chain);
    this.setGateColor(gt, '#ffd23e');
    g.effects.burst(gt.pos, '#ffd23e', 16, 5, 0.4);
    g.effects.heartBurst(gt.pos, 6, 3, 0.35);
    g.audio.rallyUp();
    g.ball.pulseBoost(0.6);
    const s = g.player.toScreen(gt.pos);
    // Heart Gate の役割はダメージ倍率だけ:通った時点の倍率を表示(ボスに当たった時に掛かる)。FEVER / SPECIAL は増えない
    g.ui.damageNumber(s.x, s.y, `GATE ×${this.chainMul}`, { color: '#ffd23e', label: this.chain > 1 ? `GATE CHAIN ${this.chain}` : gt.route ? `${gt.route === 'left' ? 'LEFT' : 'RIGHT'} GATE PASS!` : 'GATE PASS!' });
    g.stats.gates = (g.stats.gates ?? 0) + 1;
  }

  /**
   * 障害物との衝突(BallPhysics の固定ステップから呼ばれる)。反射 → POWER 減少 → 飛行継続。
   * 球(星・ハート・雲)と箱(魔法の壁)。f.live のときだけ演出を出す(予測計算では出さない)
   */
  collide(f, prev) {
    const B = Config.space.bank;
    if (f.obstacleHits >= B.maxHits) return;
    const r = Config.ball.radius;
    for (const o of this.obstacles) {
      let n = null, surface = null;
      if (o.box) {
        const b = o.box, c = o.pos;
        const q = new THREE.Vector3(
          THREE.MathUtils.clamp(f.pos.x, c.x - b.hx, c.x + b.hx),
          THREE.MathUtils.clamp(f.pos.y, c.y - b.hy, c.y + b.hy),
          THREE.MathUtils.clamp(f.pos.z, c.z - b.hz, c.z + b.hz));
        const d = f.pos.clone().sub(q);
        const dist = d.length();
        if (dist > r) continue;
        n = dist > 1e-5 ? d.divideScalar(dist) : prev.clone().sub(c).setY(0).normalize();
        surface = q.clone().addScaledVector(n, r + 0.01);
      } else {
        const d = f.pos.clone().sub(o.pos);
        const dist = d.length();
        const R = o.radius + r;
        if (dist > R) continue;
        n = dist > 1e-5 ? d.divideScalar(dist) : new THREE.Vector3(0, 0, 1);
        surface = o.pos.clone().addScaledVector(n, R + 0.01);
      }
      const vn = f.vel.dot(n);
      if (vn >= 0) continue;   // 離れていく向きなら何もしない
      f.vel.addScaledVector(n, -(1 + B.restitution) * vn).multiplyScalar(B.speedKeep);
      f.accel.multiplyScalar(B.curveKeep);
      f.pos.copy(surface);
      f.obstacleHits++;
      if (f.live) this.onBounce(o, surface.clone());
      return;
    }
  }

  onBounce(o, point) {
    const g = this.g;
    o.hitPulse = 1;
    g.effects.burst(point, Config.space.obstacleShapes[o.shape].color, 18, 6, 0.45);
    g.cam.shake(0.25);
    g.audio.hit?.('chest', 0.6);
    const s = g.player.toScreen(point);
    g.ui.damageNumber(s.x, s.y, 'BOUNCE!', { color: '#b6ff5c', label: 'BANK SHOT CHANCE' });
  }

  // ---------------- 毎フレーム ----------------
  update(dt) {
    this.time += dt;
    this.updateObstacles(dt);
    for (const gt of this.gates) {
      gt.pulse = Math.max(0, gt.pulse - dt * 2.5);
      const k = this.gateScale * (1 + gt.pulse * 0.25) + Math.sin(this.time * 3 + gt.index) * 0.03;
      gt.slot.group.scale.setScalar(k);
      gt.slot.glow.material.opacity = 0.35 + gt.pulse * 0.5 + Math.sin(this.time * 4 + gt.index) * 0.08;
      gt.slot.shadow.position.set(gt.pos.x, 0.04, gt.pos.z);
      gt.slot.shadow.scale.setScalar(this.gateRadius * (1 + gt.pulse * 0.3));
      gt.slot.shadow.material.color.copy(gt.slot.glow.material.color);
    }
  }

  updateObstacles(dt) {
    for (const o of this.obstacles) {
      o.pos.copy(o.base);
      if (o.move) o.pos[o.move.axis === 'y' ? 'y' : 'x'] += Math.sin(this.time * Math.PI * 2 * o.move.speed + o.phase) * o.move.amp;
      o.slot.group.position.copy(o.pos);
      o.hitPulse = Math.max(0, (o.hitPulse ?? 0) - dt * 3);
      o.slot.group.scale.setScalar(1 + (o.hitPulse ?? 0) * 0.25);
      this.placeShadow(o.slot.shadow, o.pos, (o.box ? o.box.hx * 2 : o.radius * 2.2));
    }
  }

  /** 床への簡易投影(高さで薄く・大きく)→ 奥行きと高さが読める */
  placeShadow(sh, pos, size) {
    sh.position.set(pos.x, 0.035, pos.z);
    const h = Math.max(0, pos.y);
    sh.scale.setScalar(size * (1 + h * 0.03));
    sh.material.opacity = Math.max(0.12, 0.6 - h * 0.025);
  }
}
