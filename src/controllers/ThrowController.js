import { Config } from '../core/Config.js';
import { InputManager } from '../managers/InputManager.js';
import { RotationCurve } from '../throw/RotationCurve.js';

const nowMs = () => performance.now();
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Pokémon GO型: リリース直前のフリック速度だけで投球パワーを決める。 */
export function powerFromFlick(flick) {
  const h = Math.max(1, window.innerHeight || 800);
  const upward = Math.max(0, -flick.velocity.y) / h * 1000;
  const speed = Math.max(upward, flick.speed / h * 1000);
  return clamp01((speed - 0.22) / 1.55);
}
export function powerFromCharge(r) { return clamp01(r); } // legacy/test compatibility
export function maxChargeDistancePx(viewH) { return viewH * 0.45; } // legacy/test compatibility
export function powerStrength(power) {
  const m = Config.power.minThrowPower;
  return clamp01((power - m) / Math.max(1e-6, 1 - m));
}

export const ThrowPhase = Object.freeze({
  IDLE:'IDLE', BALL_TOUCH:'BALL_TOUCH', THROW_GESTURE:'THROW_GESTURE', RELEASE:'RELEASE', BALL_FLYING:'BALL_FLYING',
});

/**
 * Pokémon GO型の投球入力。
 * 1) 画面下のハートを直接つかむ
 * 2) 指にハートが追従
 * 3) その場で円を描くと回転量を蓄積（時計/反時計でカーブ方向）
 * 4) 上へフリックして離す。方向=狙い、リリース速度=飛距離/球速
 * 下引きチャージ、POWERゲージ、DIRECT/CURVE切替は使わない。
 */
export class ThrowController {
  constructor(g) {
    this.g=g; this.phase=ThrowPhase.IDLE; this.drag=null;
    this.curve=new RotationCurve(Config.throwInput.rotate);
    this.effects={};
  }
  get rotateMode(){ return true; }
  get grabbing(){ return this.phase===ThrowPhase.BALL_TOUCH || this.phase===ThrowPhase.THROW_GESTURE; }
  get curveInput(){ return this.grabbing ? this.curve.value : 0; }
  get effectList(){ return []; }
  canGrab(){ const m=this.g.ball.mode; return this.phase===ThrowPhase.IDLE && (m==='held'||m==='catching'); }
  heartCenter(){ const s=this.g.player.heldBallScreen(); return {x:s.x,y:s.y,r:s.r}; }
  showCurve(){
    const c=this.heartCenter(),v=this.curve.value;
    this.g.ball.setCurveRoll?.(this.grabbing ? this.curve.angle : 0);
    this.g.ui.setCurveInput?.(this.grabbing && Math.abs(v)>.02 ? v : null,c,this.curve.decayed);
  }
  tick(){ if(this.grabbing && this.curve.update(nowMs())) this.showCurve(); }
  resetEffects(){ this.effects={}; this.g.ui.setBallEffects?.(null); }

  tryGrab(start){
    const g=this.g;
    if(!this.canGrab() || !g.player.isOnBall(start.x,start.y,g.ball.pos)) return false;
    this.phase=ThrowPhase.BALL_TOUCH;
    this.drag={start,current:start,samples:[start]};
    this.gesture=[start]; this.lastSample=start; this.lastCurveFed=start;
    this.curve.reset(nowMs());
    g.ball.grab(g.player.fingerToWorld(start.x,start.y));
    g.ui.setPowerGauge(null); g.ui.setThrowType?.(null);
    this.showCurve();
    return true;
  }

  move(d){
    if(!this.grabbing) return;
    this.drag=d;
    const c=this.heartCenter();
    const i=d.samples.lastIndexOf(this.lastCurveFed);
    let changed=false;
    for(const p of d.samples.slice(Math.max(0,i+1))) changed=this.curve.feed(p,c,c.r,nowMs())||changed;
    this.lastCurveFed=d.samples[d.samples.length-1];
    if(changed) this.showCurve();

    const cur=d.current;
    this.g.ball.setGrabTarget(this.g.player.fingerToWorld(cur.x,cur.y));
    const dy=cur.y-d.start.y, dist=Math.hypot(cur.x-d.start.x,dy);
    if(this.phase===ThrowPhase.BALL_TOUCH && dy < -Math.max(10,c.r*.28) && dist>c.r*.45) {
      this.phase=ThrowPhase.THROW_GESTURE;
      this.gesture=d.samples.slice();
    } else if(this.phase===ThrowPhase.THROW_GESTURE) {
      const j=d.samples.lastIndexOf(this.lastSample);
      for(const p of d.samples.slice(Math.max(0,j+1))) this.gesture.push(p);
    }
    this.lastSample=d.samples[d.samples.length-1];
    this.g.ui.setPowerGauge(null);
  }

  updatePreview(){ this.g.preview.hideLive(); }

  release(flick){
    const g=this.g;
    if(!this.grabbing) return undefined;
    this.phase=ThrowPhase.RELEASE;
    g.preview.hideLive(); g.ui.setPowerGauge(null); g.ui.setThrowType?.(null);
    g.ui.setCurveInput?.(null); g.ball.setCurveRoll?.(0);
    const samples=this.gesture?.length ? [...this.gesture] : [...(flick.samples||[])];
    if(!samples.length) samples.push(flick.start);
    const end=flick.end;
    const last=samples[samples.length-1];
    if(!last || last.t!==end.t) samples.push(end);
    const fi=InputManager.flickInfo(samples[0],end,samples);
    const h=Math.max(1,g.viewport.h);
    const upward=-fi.velocity.y/h*1000;
    const travel=-fi.dy/h;
    if(upward<0.18 || travel<0.035) {
      g.ball.catchTo(g.player.holdAnchor,0.16); this.phase=ThrowPhase.IDLE; this.curve.reset(nowMs()); return null;
    }
    const raw=powerFromFlick(fi);
    const min=Config.power.minThrowPower;
    const power=min+(1-min)*raw;
    const spin=this.curve.value*(Config.throwInput.rotate.maxSpin??1);
    const th=g.player.computeThrow(fi,power,g.player.holdAnchor(),[],g.throwRoute,spin);
    if(!th){ g.ball.catchTo(g.player.holdAnchor,0.16); this.phase=ThrowPhase.IDLE; return null; }
    th.start=g.player.holdAnchor();
    th.pogoFlick={speed:fi.speed,upward,travel};
    this.phase=ThrowPhase.BALL_FLYING; this.resetEffects();
    return th;
  }

  cancel(){
    this.phase=ThrowPhase.IDLE; this.drag=null; this.gesture=null; this.resetEffects();
    this.g.preview.hideLive(); this.g.ui.setPowerGauge(null); this.g.ui.setThrowType?.(null);
    this.curve.reset(nowMs()); this.g.ui.setCurveInput?.(null); this.g.ball.setCurveRoll?.(0);
  }
}
