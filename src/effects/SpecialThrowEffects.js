import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { heartGeometry } from '../controllers/BallController.js';

/**
 * SPECIAL 投球の見た目(キャラクターごと)。CharacterData.special.visualEffect に ID を書くだけで切り替わる
 *   ★ 見た目だけ:分かれたハートに当たり判定・ダメージは無い。ダメージ・部位判定は本体の1投(既存の SPECIAL 1回分)だけ
 *   MULTI でも全クライアントが同じ投球(同じキャラ・同じ軌道)を再生するので、同じ見た目になる
 *
 * 1つの演出 = { start(fx, ctx), update(fx, dt), hit(fx, point, result), end(fx) }(fx = SpecialThrowFx。共通の道具を持つ)
 *   result = SPECIAL の効果の結果(src/effects/SpecialEffects.js。回復量など)。MISS では hit は呼ばれない
 */
export const SPECIAL_THROW_EFFECTS = {
  /**
   * ドラゴントレイル(ヨルナ):投げたハートの後ろから、2つのハートが少し遅れて付いてくる(合計3つ)。
   * 紫〜ピンクの炎の軌跡を引いて飛び、本体の HIT で 2 つのハートがターゲットへ集まって巨大なハートの爆発
   */
  dragonTrail: {
    colors: ['#b14dff', '#ff4f9a', '#ff9ad5', '#d27bff'],
    lag: 0.07,   // 1つ目は 0.07 秒、2つ目は 0.14 秒遅れて本体の通った所を追う(ゲーム時間)
    start(fx) { fx.ensureClones(2, '#ff5fb0', '#b14dff'); fx.history = []; },
    update(fx, dt) {
      const pos = fx.g.ball.pos;
      fx.history.push({ t: fx.t, p: pos.clone() });
      while (fx.history.length > 2 && fx.history[1].t < fx.t - this.lag * 2 - 0.05) fx.history.shift();
      const { right } = fx.frame();
      const appear = Math.min(1, fx.t / 0.12);   // 投げた直後に本体から出てくる
      fx.clones.forEach((c, i) => {
        if (i > 1) { c.visible = false; return; }
        const at = fx.t - this.lag * (i + 1);
        const h = fx.history.find((x) => x.t >= at) ?? fx.history[0];
        const side = i ? 1 : -1;
        c.visible = true;
        c.position.copy(h.p).addScaledVector(right, side * 0.22 * appear + 0.04 * Math.sin(fx.t * 14 + i * 2));
        c.scale.setScalar((0.85 - 0.08 * i) * (0.4 + 0.6 * appear));
        c.rotation.set(0, 0, side * 0.25);   // カメラへ正面を向けたまま(ハートの形が見えるように)
      });
      // 紫〜ピンクの炎の軌跡(数フレームに1回・プールの上限内)
      fx.trailAcc += dt;
      if (fx.trailAcc > 0.03) {
        fx.trailAcc = 0;
        const pts = [pos, ...fx.clones.filter((c) => c.visible).map((c) => c.position)];
        pts.forEach((p, j) => fx.g.effects.burst(p, this.colors[(j + fx.tick) % this.colors.length], 1, 0.6, 0.55));
        fx.tick++;
      }
    },
    hit(fx, point) {
      // 付いてきた 2 つのハートがターゲットへ集まる → 巨大なハート型の爆発(見た目だけ)
      fx.converge(point, 0.16, () => {
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

SPECIAL_THROW_EFFECTS.angelHeal = {
  /**
   * エンジェルハート(セラ):命中 → 巨大な白い翼が開く → 中央から白〜金の光 → 金の羽根と光のハートが各味方へ →
   * HP ゲージが伸びる → 「ALL HEAL +○○」(約 1.2 秒)。投球中の見た目は通常の SPECIAL のまま
   */
  start() {},
  update() {},
  hit(fx, point, result) {
    const g = fx.g;
    g.effects.heartBurst(point, 30, 8, 1.1, ['#ffffff', '#fff3c4', '#ffd76a', '#ffe9f4']);
    g.effects.shockwave(point, '#fff1b8', 9, g.cam.camera);
    fx.active = null;
    if (result?.type === 'healAll' && !result.preview) g.ui.playAngelHeal?.(result);   // MULTI(preview)はサーバーの HEAL を受け取った時に再生
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
    const id = chara?.special?.visualEffect ?? chara?.specialThrowEffect;   // CharacterData.special.visualEffect
    const def = SPECIAL_THROW_EFFECTS[id];
    if (!def) return false;
    this.active = def; this.id = id;
    this.t = 0; this.trailAcc = 0; this.tick = 0; this.exploded = false; this.stages = [1];
    this.flightTime = th?.flightTime ?? 0.6;
    this.conv = null;
    def.start(this, { chara, th });
    return true;
  }

  /** 本体が HIT(BOSS_HIT)→ 集まる演出。MISS → 消える */
  hit(point, result = null) { if (this.active) { this.active.hit?.(this, point, result); } }
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
