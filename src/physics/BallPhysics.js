import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';

const ray = new THREE.Raycaster();
const seg = new THREE.Vector3();

/**
 * 投球の物理。固定ステップで積分するので「同じ初速=同じ軌道」になる(端末のFPSに依存しない)。
 * 実際の飛行(BallController)と予測軌道(TrajectoryPreview)は同じ関数を使う。
 *
 * Flight = { pos, vel, accel(カーブ横力), t, bounces, acc(ステップ余り), result }
 * result = null | { type: 'hit', part, point } | { type: 'short' | 'over' | 'wide', point }
 */
export function createFlight(p0, v0, curveAccel = null, obstacles = null) {
  return {
    obstacles,          // 3D 障害物(SpaceSystem)。当たると反射して飛行継続(Bank Shot)
    obstacleHits: 0,
    pos: p0.clone(),
    vel: v0.clone(),
    accel: curveAccel ? curveAccel.clone() : new THREE.Vector3(),
    t: 0,
    bounces: 0,
    acc: 0,
    result: null,
  };
}

/** 1固定ステップ進める。衝突したら f.result を設定 */
function fixedStep(f, h, colliders) {
  const T = Config.throw;
  const prev = f.pos.clone();
  f.vel.y -= T.gravity * h;
  // カーブの横力:投げた直後は弱く rampTime かけて最大に(前半は真っ直ぐ、後半で曲がる)
  f.vel.addScaledVector(f.accel, h * Math.min(1, f.t / Config.curve.rampTime));
  f.pos.addScaledVector(f.vel, h);
  f.t += h;
  // ボスの絵の面(planeZ)を横切った位置を記録(50% 会話の回答判定用。外れた球でも「どこを通ったか」が分かる)
  if (f.planeZ != null && !f.planeCross && prev.z > f.planeZ && f.pos.z <= f.planeZ) f.planeCross = prev.clone().lerp(f.pos, (prev.z - f.planeZ) / (prev.z - f.pos.z));

  // 3D 障害物:当たったら反射(POWER 減少)して飛行を続ける。即 MISS にはしない
  if (f.obstacles) f.obstacles.collide(f, prev);

  // ボスColliderとの交差(線分レイキャスト)
  seg.subVectors(f.pos, prev);
  const len = seg.length();
  if (len > 0 && colliders.length) {
    ray.set(prev, seg.normalize());
    ray.far = len + Config.ball.radius;
    const hits = ray.intersectObjects(colliders, false);
    if (hits.length) {
      f.pos.copy(hits[0].point);
      f.result = { type: 'hit', part: hits[0].object.userData.part, point: hits[0].point.clone() };
      return;
    }
  }

  // 床
  const r = Config.ball.radius;
  if (f.pos.y <= r) {
    f.pos.y = r;
    if (f.bounces < 1 && f.vel.y < -3) {
      f.vel.y = -f.vel.y * T.floorBounce;
      f.vel.x *= 0.7; f.vel.z *= 0.7;
      f.bounces++;
    } else {
      f.result = { type: 'short', point: f.pos.clone() };
      return;
    }
  }
  if (f.pos.z < Config.boss.z - 6 || f.pos.y > 45) {
    // ボスの横を抜けた=wide / 上を越えた=over
    f.result = { type: Math.abs(f.pos.x) > 5 ? 'wide' : 'over', point: f.pos.clone() };
  }
  else if (Math.abs(f.pos.x) > 16) f.result = { type: 'wide', point: f.pos.clone() };
  else if (f.t > T.maxFlightTime) f.result = { type: 'over', point: f.pos.clone() };
}

/** 可変dtを固定ステップに分割して進める */
export function stepFlight(f, dt, colliders) {
  const h = Config.throw.fixedStep;
  f.acc += dt;
  while (f.acc >= h && !f.result) {
    fixedStep(f, h, colliders);
    f.acc -= h;
  }
  return f.result;
}

/** 予測軌道。points は一定間隔の位置列 */
export function simulate(p0, v0, curveAccel, colliders, sampleEvery = 0.03, obstacles = null) {
  const f = createFlight(p0, v0, curveAccel, obstacles);
  const h = Config.throw.fixedStep;
  const points = [f.pos.clone()];
  let nextSample = sampleEvery;
  while (!f.result) {
    fixedStep(f, h, colliders);
    if (f.t >= nextSample) { points.push(f.pos.clone()); nextSample += sampleEvery; }
  }
  points.push(f.pos.clone());
  return { points, result: f.result, time: f.t, obstacleHits: f.obstacleHits };
}
