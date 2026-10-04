import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { simulate } from '../physics/BallPhysics.js';
import { landingGrade } from '../data/BattleCalc.js';

const KEY = 'hs.auto';
const PARTS = ['chest', 'stomach', 'head', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];

/** 重み { id: weight } から1つ選ぶ */
export function rollWeighted(table, rand = Math.random) {
  const list = Object.entries(table ?? {}).filter(([, w]) => w > 0);
  const sum = list.reduce((a, [, w]) => a + w, 0);
  let r = rand() * sum;
  for (const [id, w] of list) { if ((r -= w) < 0) return id; }
  return list[list.length - 1]?.[0] ?? 'GOOD';
}

/**
 * AUTO モード(インゲーム右上の AUTO ボタン。OFF = グレー / ON = 色つき)
 *   ON の間:投球は自動(敵に当てる。着弾の段階は Config.auto.landing の重み。ハートゲート・Diamond は狙わない)
 *            DEFENCE も自動(判定は Config.auto.defence の重み)
 *            プレイヤーの投球 / キャッチの入力は無視(GameManager)。SPECIAL(アイコンのタップ)だけ操作できる
 *   MULTI:自分の端末だけの設定。自分の手番の投球・自分のキャッチだけ自動(結果は手動と同じくサーバーへ送る)
 *   チュートリアルでは使えない(ボタンも出さない)。ON / OFF はこのブラウザに保存
 */
export class AutoPlay {
  constructor(g) {
    this.g = g;
    this.on = false;
    try { this.on = localStorage.getItem(KEY) === '1'; } catch { /* 保存できない環境は OFF から */ }
    const btn = document.createElement('button');
    btn.id = 'autoBtn';
    btn.type = 'button';
    btn.textContent = 'AUTO';
    btn.setAttribute('aria-label', 'オートモード');
    // 押した操作は投球 / キャッチの入力へ流さない
    for (const ev of ['pointerdown', 'pointerup']) btn.addEventListener(ev, (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
    (document.getElementById('ui') ?? document.body).appendChild(btn);
    this.btn = btn;
    this.refresh();
  }

  /** 実際に自動で動かすか(チュートリアル中は OFF 扱い)*/
  get active() { return this.on && !this.g.tutorial; }

  toggle() {
    const g = this.g;
    if (g.tutorial) return;
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? '1' : '0'); } catch { /* 保存できなくても今回は効く */ }
    if (this.on && g.thrower.grabbing) { g.thrower.cancel(); g.ball.catchTo(g.player.holdAnchor, 0.16); }   // 掴んでいたハートは構えへ戻す
    if (this.on) g.ui.showPrompt(null);
    g.audio.grab?.();
    this.refresh();
  }

  refresh() {
    this.btn.setAttribute('aria-pressed', this.on ? 'true' : 'false');
    this.btn.hidden = !!this.g.tutorial;
  }

  /** DEFENCE の判定(PERFECT / GREAT / GOOD / MISS)*/
  rollDefence() {
    const A = Config.auto, r = rollWeighted(A.defence);
    return A.defenceAs?.[r] ?? r;
  }

  /**
   * 自動の1投:着弾の段階を重みで選び、その段階に入る点を狙った投球(実際の投球と同じ物理で下見して確かめる)
   *   見つからなければ敵に当たる投球 / それも無ければ正面
   */
  buildThrow() {
    const g = this.g;
    const want = rollWeighted(Config.auto.landing);
    const start = g.player.holdAnchor();
    const calc = g.player.thrower;
    const plane = g.targetPlane();
    const obstacles = g.space.obstacles.length ? g.space : null;
    const bands = { PERFECT: [0, 0.7], GREAT: [0.7, 1.7], GOOD: [1.7, 3.1], HIT: [3.1, 6], MISS: [8, 11] };
    for (const t of Config.landing.grades) if (t.id !== 'HIT') bands[t.id] = [bands[t.id][0], t.within];
    const tryAim = (grade, k) => {
      const aim = this.aimBase(k);
      const [a, b] = bands[grade];
      const dx = (a + Math.random() * (b - a)) * (Math.random() < 0.5 ? -1 : 1);
      const target = new THREE.Vector3(aim.cx + dx, aim.y, aim.z);
      const th = calc.buildThrow(start, target, 0, 0);
      const sim = simulate(start, th.velocity, th.curveAccel, plane, 0.03, obstacles, null);
      const res = sim.result;
      const hit = res?.type === 'hit';
      const cx = hit && res.minion != null ? g.wave?.unit(res.minion)?.x ?? aim.cx : g.boss.root.position.x;
      const got = hit ? landingGrade(res.point.x - cx).grade : 'MISS';
      return { th, got, hit };
    };
    let any = null;
    for (let k = 0; k < 24; k++) {
      const r = tryAim(want, k);
      if (r.got === want) return this.finish(r.th, start);
      if (r.hit && !any) any = r;
    }
    if (!any) for (let k = 0; k < 12 && !any; k++) { const r = tryAim('PERFECT', k); if (r.hit) any = r; }
    return this.finish((any ?? tryAim('PERFECT', 0)).th, start);
  }

  /** 狙いの基準:敵の中央縦ラインの X と、高さ(部位 / 雑魚の体のどこか)*/
  aimBase(k) {
    const g = this.g, z = (g.wave?.active ? g.wave.z : Config.boss.z) + 0.5;
    if (g.wave?.active) {
      const alive = g.wave.units.filter((u) => u.alive);
      const u = alive[k % Math.max(1, alive.length)];
      if (u) return { cx: u.x, y: u.y + (Math.random() - 0.5) * u.def.size * 0.5, z };
    }
    const p = g.boss.restPartCenter(PARTS[k % PARTS.length], new THREE.Vector3());
    return { cx: g.boss.root.position.x, y: p.y, z };
  }

  /** ThrowController.release と同じ形の投球データ(カーブなし・普通の強さ)*/
  finish(b, start) {
    const m = Config.power.minThrowPower, p = 0.5;
    return {
      ...b, start: start.clone(), power: m + (1 - m) * p, strength: p, pull: p,
      spin: 0, throwSpin: 0, turnDeg: 0, effects: [], route: null, strong: false,
      curveDir: 'straight', curveStrength: 0, direction: b.velocity.clone().normalize(), auto: true,
    };
  }
}
