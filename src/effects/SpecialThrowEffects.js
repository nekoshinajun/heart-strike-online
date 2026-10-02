import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { heartGeometry } from '../controllers/BallController.js';

/**
 * SPECIAL 投球の見た目(キャラクターごと)。CharacterData.specialThrowEffect に ID を書くだけで切り替わる
 *   ★ 見た目だけ:分かれたハートに当たり判定・ダメージは無い。ダメージ・部位判定は本体の1投(既存の SPECIAL 1回分)だけ
 *   MULTI でも全クライアントが同じ投球(同じキャラ・同じ軌道)を再生するので、同じ見た目になる
 *
 * 1つの演出 = { start(fx, ctx), update(fx, dt), hit(fx, point), end(fx) }(fx = SpecialThrowFx。共通の道具を持つ)
 */
export const SPECIAL_THROW_EFFECTS = {
  /**
   * ドラゴンスプリット(ヨルナ):飛行中にハートが 1 → 3 → 7 個に分かれ、ドラゴンの翼のように左右へ広がる。
   * 紫〜ピンクの炎の軌跡を引いて飛び、本体の HIT で 6 個の分身がターゲットへ一斉に集まって巨大なハートの爆発
   */
  dragonSplit: {
    colors: ['#b14dff', '#ff4f9a', '#ff9ad5', '#d27bff'],
    start(fx) { fx.ensureClones(6, '#ff5fb0', '#b14dff'); fx.stageCount = 1; },
    update(fx, dt) {
      const T = Math.max(0.2, fx.flightTime), u = fx.t / T;
      // 1 → 3 → 7(飛行時間の割合で分かれる)
      const count = u < 0.12 ? 1 : u < 0.3 ? 3 : 7;
      if (count !== fx.stageCount) { fx.stageCount = count; fx.stages.push(count); fx.g.effects.burst(fx.g.ball.pos, '#ff9ad5', 10, 4, 0.5); fx.g.audio?.orb?.(count === 3 ? 2 : 4); }
      const { right, up, back } = fx.frame();
      const spread = count === 1 ? 0 : Math.min(1, (u - (count === 3 ? 0.12 : 0.3)) / 0.14);
      fx.clones.forEach((c, i) => {
        // i = 0,1 → 3 個目までの左右 / 2..5 → 翼の外側
        const visible = count === 7 || (count === 3 && i < 2);
        c.visible = visible;
        if (!visible) return;
        const side = i % 2 ? 1 : -1, k = count === 3 ? 1 : 1 + Math.floor(i / 2);   // k = 1, 2, 3(外側ほど大きく広がる)
        const s = spread * (0.55 + 0.1 * Math.sin(fx.t * 9 + i));
        c.position.copy(fx.g.ball.pos)
          .addScaledVector(right, side * 0.85 * k * s)
          .addScaledVector(up, (0.55 * k - 0.13 * k * k) * s + 0.06 * Math.sin(fx.t * 12 + i))   // 翼のように上へ反る
          .addScaledVector(back, 0.32 * k * s);
        c.scale.setScalar(0.92 - 0.1 * k);
        c.rotation.z = side * (0.35 + 0.15 * k) * s;
        c.rotation.y += dt * 6;
      });
      // 紫〜ピンクの炎の軌跡(数フレームに1回・プールの上限内)
      fx.trailAcc += dt;
      if (fx.trailAcc > 0.03) {
        fx.trailAcc = 0;
        const pts = [fx.g.ball.pos, ...fx.clones.filter((c) => c.visible).map((c) => c.position)];
        pts.forEach((p, j) => fx.g.effects.burst(p, this.colors[(j + fx.tick) % this.colors.length], 1, 0.6, 0.55));
        fx.tick++;
      }
    },
    hit(fx, point) {
      // 6 個の分身がターゲットへ一斉に集まる → 巨大なハート型の爆発(見た目だけ)
      fx.converge(point, 0.22, () => {
        const E = fx.g.effects;
        E.heartBurst(point, 70, 13, 1.6, ['#b14dff', '#ff4f9a', '#ff9ad5', '#ffffff', '#ffd23e']);
        E.burst(point, '#d27bff', 40, 14, 0.9);
        E.shockwave(point, '#b14dff', 11, fx.g.cam.camera);
        E.shockwave(point, '#ff4f9a', 7, fx.g.cam.camera);
        fx.g.ui.flash('#f3d2ff', 0.45);
        fx.g.cam.shake(0.6);
        fx.exploded = true;
      });
    },
  },
};

/** SPECIAL 投球の見た目を再生する係(GameManager に1つ)。演出の中身は SPECIAL_THROW_EFFECTS */
export class SpecialThrowFx {
  constructor(g) {
    this.g = g;
    this.clones = [];
    this.active = null;
    this.stages = [];
  }

  /** 発射時:そのキャラの演出があれば始める(無ければ何もしない = 既存の SPECIAL の見た目)*/
  start(chara, th) {
    this.end();
    const def = SPECIAL_THROW_EFFECTS[chara?.specialThrowEffect];
    if (!def) return false;
    this.active = def; this.id = chara.specialThrowEffect;
    this.t = 0; this.trailAcc = 0; this.tick = 0; this.exploded = false; this.stages = [1];
    this.flightTime = th?.flightTime ?? 0.6;
    this.conv = null;
    def.start(this, { chara, th });
    return true;
  }

  /** 本体が HIT(BOSS_HIT)→ 集まる演出。MISS → 消える */
  hit(point) { if (this.active) { this.active.hit?.(this, point); } }
  miss() { this.end(); }

  /** dt = ゲーム時間 / realDt = 実時間(集まる演出はヒットストップ中も実時間で進める)*/
  update(dt, realDt = dt) {
    if (this.conv) { this.stepConverge(realDt); return; }
    if (!this.active) return;
    if (this.g.ball.mode !== 'flying') return;
    this.t += dt;
    this.active.update(this, dt);
  }

  end() {
    this.active = null; this.conv = null;
    for (const c of this.clones) c.visible = false;
  }

  // ---------------- 共通の道具 ----------------
  ensureClones(n, color, emissive) {
    const r = Config.ball.radius;
    while (this.clones.length < n) {
      const m = new THREE.Mesh(heartGeometry(r), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1, emissive, emissiveIntensity: 0.9, transparent: true, opacity: 0.92 }));
      m.visible = false; m.renderOrder = 8;
      this.g.scene.add(m);
      this.clones.push(m);
    }
    for (const c of this.clones) { c.material.color.set(color); c.material.emissive.set(emissive); }
  }

  /** 飛んでいる向きの座標軸(right / up / back)*/
  frame() {
    const v = this.g.ball.flight?.vel ?? new THREE.Vector3(0, 0, -1);
    const fwd = v.clone().normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    if (!Number.isFinite(right.x) || right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    return { right, up, back: fwd.clone().negate() };
  }

  /** 見えている分身を point へ ms 秒で集めてから done */
  converge(point, sec, done) {
    const list = this.clones.filter((c) => c.visible);
    this.converged = list.length;
    this.conv = { list: list.map((c) => ({ c, from: c.position.clone() })), to: point.clone(), t: 0, sec, done };
    this.active = null;
    if (!list.length) { this.conv = null; done?.(); }
  }
  stepConverge(dt) {
    const C = this.conv;
    C.t += dt;
    const k = Math.min(1, C.t / C.sec), e = k * k * (3 - 2 * k);
    for (const x of C.list) { x.c.position.lerpVectors(x.from, C.to, e); x.c.scale.setScalar(0.5 * (1 - e * 0.7)); }
    if (k >= 1) { for (const x of C.list) x.c.visible = false; this.conv = null; C.done?.(); }
  }
}
