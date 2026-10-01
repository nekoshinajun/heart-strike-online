import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { heartTexture, glowTexture } from './Textures.js';

/**
 * 着弾マーク:ハートが実際に Collider へ当たった座標に、小さな ♡ の光を約1秒だけ付ける
 *   0.00s 命中 → 約1.25倍にポンッと出る(popSec)→ 通常サイズ → fadeFrom 秒から消えていく → life 秒で消える
 * マークは当たった Collider の親(ボスの体と一緒に揺れるグループ)のローカル座標に置く
 *   → カメラやボスの表示が動いても、当たった場所に付いたまま
 * 実時間で進める(ヒットストップ・スロー中も 1 秒で消える)
 */
export class HitMarker {
  constructor() { this.marks = []; }

  /** result = BallPhysics の命中結果 { point(ワールド), object(当たった Collider) } */
  show(result) {
    const H = Config.hitMark;
    const obj = result?.object;
    if (!result?.point || !obj) return null;
    const parent = obj.parent ?? obj;
    parent.updateWorldMatrix(true, false);
    const local = parent.worldToLocal(result.point.clone());
    const group = new THREE.Group();
    group.position.copy(local);
    // 親の拡大(ボスの表示倍率)を打ち消して、見た目の大きさを Config.hitMark.size(ワールド単位)にする
    const ws = new THREE.Vector3(); parent.getWorldScale(ws);
    group.scale.setScalar(1 / Math.max(1e-3, ws.x));
    const mk = (tex, color, size, opacity) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthTest: false, depthWrite: false, opacity, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(size); s.renderOrder = 40; group.add(s); return s;
    };
    const glow = mk(glowTexture(), H.color, H.size * 2.2, 0.55);
    const heart = mk(heartTexture(), H.color, H.size, 1);
    const core = mk(heartTexture(), '#ffffff', H.size * 0.55, 0.9);
    parent.add(group);
    const m = { group, parent, sprites: [glow, heart, core], base: [glow.material.opacity, 1, 0.9], t0: performance.now(), point: result.point.clone(), part: result.part };
    this.marks.push(m);
    while (this.marks.length > H.max) this.remove(this.marks[0]);
    return m;
  }

  update() {
    const H = Config.hitMark, now = performance.now();
    for (const m of [...this.marks]) {
      const t = (now - m.t0) / 1000;
      if (t >= H.life) { this.remove(m); continue; }
      // 拡大:最初の popSec で popScale → 1 へ
      const pop = t < H.popSec ? H.popScale - (H.popScale - 1) * (t / H.popSec) : 1;
      const fade = t < H.fadeFrom ? 1 : Math.max(0, 1 - (t - H.fadeFrom) / Math.max(0.01, H.life - H.fadeFrom));
      m.sprites.forEach((s, i) => { s.material.opacity = m.base[i] * fade; });
      m.group.children.forEach((s, i) => { const k = [2.2, 1, 0.55][i] * H.size * pop; s.scale.setScalar(k); });
    }
  }

  remove(m) {
    m.parent.remove(m.group);
    for (const s of m.sprites) s.material.dispose();
    this.marks = this.marks.filter((x) => x !== m);
  }
  clear() { for (const m of [...this.marks]) this.remove(m); }
}
