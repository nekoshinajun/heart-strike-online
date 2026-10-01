import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { glowTexture, shadowTexture, ballTexture } from '../world/Textures.js';
import { createFlight, stepFlight } from '../physics/BallPhysics.js';

const TRAIL = 14;

/** ハート形の立体(半径 r の球とほぼ同じ大きさ) */
export function heartGeometry(r) {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.9);
  sh.bezierCurveTo(-1.3, -0.1, -1.0, 1.05, 0, 0.45);
  sh.bezierCurveTo(1.0, 1.05, 1.3, -0.1, 0, -0.9);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.16, bevelSegments: 4, curveSegments: 18 });
  geo.center();
  geo.scale(r * 0.85, r * 0.85, r * 0.85);
  return geo;
}
const tmp = new THREE.Vector3();

/**
 * ボールの見た目と移動。ロジック(判定・ダメージ)は持たず、軌道の再生だけを担当。
 * mode: hidden | held | grabbed | flying | rebound | fade | toPlayer | catching
 */
export class BallController {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'hidden';
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.spin = new THREE.Vector3();

    const r = Config.ball.radius;
    // 見た目は skin で切替(当たり判定は常に半径 r の球)
    this.mesh = Config.ball.skin === 'heart'
      ? new THREE.Mesh(heartGeometry(r), new THREE.MeshStandardMaterial({ color: '#ff5fa2', roughness: 0.3, metalness: 0.1, emissive: '#ff2f86', emissiveIntensity: 0.35 }))
      : new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.25 }));
    this.isHeart = Config.ball.skin === 'heart';
    scene.add(this.mesh);

    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(), color: '#ffffff', transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.renderOrder = 10;
    scene.add(this.glow);

    this.trail = [];
    for (let i = 0; i < TRAIL; i++) {
      const s = new THREE.Sprite(glowMat.clone());
      s.visible = false;
      s.renderOrder = 10;
      scene.add(s);
      this.trail.push({ sprite: s, pos: new THREE.Vector3() });
    }

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    this.color = new THREE.Color('#ffffff');
    this.glowScale = 1.4;
    this.setVisible(false);
  }

  setVisible(v) {
    this.mesh.visible = v;
    this.glow.visible = v;
    this.shadow.visible = v;
    if (!v) this.trail.forEach((t) => (t.sprite.visible = false));
  }

  /** オンライン観戦中:手元の投球ハートだけをグレー表示 */
  setDisabledLook(on) {
    this.disabledLook = !!on;
    if (on) {
      this.mesh.material.color?.set?.('#8d96a0');
      this.mesh.material.emissive?.set?.('#626a73');
      this.mesh.material.emissiveIntensity = 0.08;
      this.glow.material.color.set('#9aa2aa');
      this.trail.forEach((t) => t.sprite.material.color.set('#9aa2aa'));
    } else {
      this.setStyle(this.color.getStyle(), this.styleLevel ?? 0);
    }
  }

  /** ラリー段階・プレイヤー色に応じた見た目 */
  setStyle(color, level = 0) {
    this.styleLevel = level;
    this.color.set(color);
    if (this.disabledLook) return this.setDisabledLook(true);
    if (this.isHeart) this.mesh.material.color.set('#ff5fa2');
    this.glow.material.color.set(color);
    this.trail.forEach((t) => t.sprite.material.color.set(color));
    if (!this.isHeart) this.mesh.material.emissive.set(color);
    this.mesh.material.emissiveIntensity = (this.isHeart ? 0.35 : 0.25) + level * 0.25; // RALLY が上がるほど発光
    this.glowScale = 1.4 + level * 0.55;
    this.trailWidth = 1 + level * 0.35;
  }

  resetTrail() {
    this.trail.forEach((t) => { t.pos.copy(this.pos); t.sprite.visible = false; });
  }

  hold(anchorFn) {
    this.mode = 'held';
    this.anchorFn = anchorFn;
    this.pos.copy(anchorFn());
    this.resetTrail();
    this.setVisible(true);
  }

  /** 指で掴んでいる:毎フレーム target へ追従(少し遅れてついてくる) */
  grab(target) {
    this.mode = 'grabbed';
    this.grabTarget = target.clone();
    this.spin.set(0, 0, 0);
  }
  setGrabTarget(v) { this.grabTarget.copy(v); }

  /**
   * 投球:物理(BallPhysics)で飛行。colliders と交差/床/場外で onResult(result)。
   * @param strength 0..1 軌跡・残像の強さ
   */
  launch(velocity, curveAccel, colliders, strength, onResult, start = null, obstacles = null, drive = null) {
    this.mode = 'flying';
    // 物理は start(構え位置)から。見た目だけ指の位置からなめらかに合流させる(同じ入力=同じ軌道)
    if (start) { this.visOffset = this.pos.clone().sub(start); this.pos.copy(start); }
    this.flight = createFlight(this.pos, velocity, curveAccel, obstacles, drive);
    this.colliders = colliders;
    this.onResult = onResult;
    this.flyStrength = strength;
    this.resetTrail();
    // 進行方向に対する前転+カーブ回転
    this.spin.set(-18 - strength * 30 - (drive ? 40 : 0), (curveAccel ? Math.sign(curveAccel.x) * 20 : 0), 0);   // DRIVE は縦回転を強く見せる
    this.setVisible(true);
  }

  /** Orb 取得時にボールの発光を一瞬強める */
  pulseBoost(k = 1) { this.boost = Math.min(2, (this.boost ?? 0) + k); }
  /** 必殺技の見た目(大きく・金色・太い軌跡)。off で元に戻す */
  setSpecial(on) {
    this.special = on;
    if (on) { this.glow.material.color.set('#ffd23e'); this.trail.forEach((t) => t.sprite.material.color.set('#ffd23e')); }
    else this.setStyle(this.color.getStyle(), 0);
  }

  /** カーブ球の見た目(横回転) */
  setCurveLook(spin) { this.spin.y = spin * 45; }

  /** ボスに当たって跳ねる(消える)。入射速度から決定的に算出 */
  rebound(inVel) {
    this.mode = 'rebound';
    const v = inVel ?? new THREE.Vector3(0, 0, -10);
    this.vel = new THREE.Vector3(v.x * 0.15, 6 + Math.abs(v.y) * 0.1, Math.abs(v.z) * 0.25);
    this.t = 0;
  }

  /** その場でフェードアウト(外れ球) */
  fadeOut() { this.mode = 'fade'; this.t = 0; }

  /**
   * ボス→プレイヤー。t=1で catchPoint 到達、その後 lateDur かけて lateEnd までさらに迫る(遅れ判定用)。
   */
  returnTo(start, catchPoint, lateEnd, duration, lateDur, ctrlOffset = null) {
    this.mode = 'toPlayer';
    this.from = start.clone();
    this.to = catchPoint.clone();
    this.lateEnd = lateEnd.clone();
    this.ctrl = start.clone().lerp(catchPoint, 0.45);
    this.ctrl.y += 1.2;
    if (ctrlOffset) this.ctrl.add(ctrlOffset); // カーブ返球(ベジェ制御点を横へずらす)
    this.dur = duration;
    this.lateDur = lateDur;
    this.t = 0;
    this.pos.copy(start);
    this.resetTrail();
    this.spin.set(30, 8, 0);
    this.setVisible(true);
  }

  /** キャッチ後に構え位置へ */
  catchTo(anchorFn, dur = 0.18) {
    this.mode = 'catching';
    this.anchorFn = anchorFn;
    this.from = this.pos.clone();
    this.dur = dur;
    this.t = 0;
    this.spin.set(0, 0, 0);
  }

  hide() { this.mode = 'hidden'; this.setVisible(false); }

  update(dt) {
    this.prev.copy(this.pos);
    switch (this.mode) {
      case 'held': {
        this.pos.copy(this.anchorFn());
        break;
      }
      case 'grabbed': {
        const k = 1 - Math.exp(-Config.throw.followLerp * dt);
        this.pos.lerp(this.grabTarget, k);
        break;
      }
      case 'flying': {
        const r = stepFlight(this.flight, dt, this.colliders);
        this.pos.copy(this.flight.pos);
        if (r) {
          const cb = this.onResult; this.onResult = null;
          this.mode = 'flown';
          cb?.(r, this.flight);
        }
        break;
      }
      case 'fade': {
        this.t += dt;
        const s = Math.max(0, 1 - this.t / 0.5);
        this.mesh.scale.setScalar(s);
        if (this.t > 0.5) { this.hide(); this.mesh.scale.setScalar(1); }
        break;
      }
      case 'rebound': {
        this.t += dt;
        this.vel.y -= 25 * dt;
        this.pos.addScaledVector(this.vel, dt);
        const s = Math.max(0, 1 - this.t / 0.45);
        this.mesh.scale.setScalar(s);
        if (this.t > 0.45) { this.hide(); this.mesh.scale.setScalar(1); }
        break;
      }
      case 'toPlayer': {
        this.t += dt;
        if (this.t <= this.dur) {
          // わずかに加速(ease-in)して「迫ってくる」感覚を強める
          const u = this.t / this.dur;
          const k = u * (0.75 + 0.25 * u);
          const a = 1 - k;
          this.pos.set(0, 0, 0)
            .addScaledVector(this.from, a * a)
            .addScaledVector(this.ctrl, 2 * a * k)
            .addScaledVector(this.to, k * k);
        } else {
          const k = Math.min(1, (this.t - this.dur) / this.lateDur);
          this.pos.lerpVectors(this.to, this.lateEnd, k);
        }
        break;
      }
      case 'catching': {
        this.t += dt / this.dur;
        const k = Math.min(1, this.t);
        const e = 1 - Math.pow(1 - k, 3);
        this.pos.lerpVectors(this.from, this.anchorFn(), e);
        if (k >= 1) this.mode = 'held';
        break;
      }
      default:
        return;
    }

    // 回転
    if (this.isHeart) {
      // ハートはこちらを向いたまま、ゆらゆら回る(カーブ時は横回転を強める)
      this.mesh.rotation.x = Math.sin(performance.now() / 300) * 0.25;
      this.mesh.rotation.y += (this.spin.y * 0.4 + (this.mode === 'held' ? 1.2 : 3)) * dt;
      this.mesh.rotation.z = Math.sin(performance.now() / 420) * 0.15;
    } else {
      this.mesh.rotation.x += this.spin.x * dt;
      this.mesh.rotation.y += this.spin.y * dt;
      if (this.mode === 'held') this.mesh.rotation.y += dt * 1.5;
    }
    const grabbed = this.mode === 'grabbed';
    const sp = this.special ? Config.special.ballScale : 1;
    this.mesh.scale.setScalar(this.mode === 'rebound' || this.mode === 'fade' ? this.mesh.scale.x : (grabbed ? 1.12 : 1) * sp);

    // 見た目の位置 = 物理位置 + 合流オフセット(発射直後だけ)
    if (this.visOffset) { this.visOffset.multiplyScalar(Math.exp(-14 * dt)); if (this.visOffset.lengthSq() < 1e-4) this.visOffset = null; }
    const vp = this.visOffset ? this.pos.clone().add(this.visOffset) : this.pos;
    this.mesh.position.copy(vp);
    this.glow.position.copy(vp);
    this.boost = Math.max(0, (this.boost ?? 0) - dt * 4);
    const pulse = (grabbed ? 1.35 : this.mode === 'held' ? 1 + Math.sin(performance.now() / 180) * 0.12 : 1) * (1 + this.boost * 0.9) * sp;
    // 投球中の発光:POWER が強いほど大きく明るい
    const powerGlow = this.mode === 'flying' && !this.special ? 0.7 + 0.8 * (this.flyStrength ?? 0.5) : 1;
    this.glow.scale.setScalar(Config.ball.radius * 2 * this.glowScale * pulse * powerGlow);

    // 影(床)- 高さで薄く・大きく
    const h = Math.max(0, this.pos.y);
    this.shadow.position.set(this.pos.x, 0.04, this.pos.z);
    this.shadow.scale.setScalar(0.8 + h * 0.08);
    this.shadow.material.opacity = Math.max(0.1, 0.8 - h * 0.06);

    // 軌跡(移動中のみ)
    const moving = this.mode === 'flying' || this.mode === 'toPlayer';
    // Trail:POWER が弱いほど短く細い / MAX ほど長く太い
    const trailLen = this.mode === 'flying' && !this.special ? Math.round(TRAIL * (0.35 + 0.65 * (this.flyStrength ?? 1))) : TRAIL;
    const width = (this.trailWidth ?? 1) * (this.mode === 'flying' ? 0.6 + this.flyStrength * 1.3 : 1) * (this.special ? 2.2 : 1) * (1 + (this.boost ?? 0) * 0.5);
    for (let i = TRAIL - 1; i > 0; i--) this.trail[i].pos.copy(this.trail[i - 1].pos);
    this.trail[0].pos.copy(vp);
    for (let i = 0; i < TRAIL; i++) {
      const tr = this.trail[i];
      tr.sprite.visible = moving && i > 0 && i < trailLen && this.mesh.visible;
      tr.sprite.position.copy(tr.pos);
      const f = Math.max(0, 1 - i / trailLen);
      tr.sprite.scale.setScalar(Config.ball.radius * 2.2 * f * width);
      tr.sprite.material.opacity = 0.55 * f;
    }
  }

  /** 画面上の見かけの半径(px)を計算(タイミングリングのサイズ合わせ用) */
  static screenRadius(camera, worldPos, heightPx) {
    tmp.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
    const dist = -tmp.z;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    return (Config.ball.radius / dist) / Math.tan(fovRad / 2) * (heightPx / 2);
  }
}
