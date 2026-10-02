import * as THREE from '../lib/three.js';
import { Config } from '../core/Config.js';
import { BOSS_AFFECTION, DEFAULT_AFFECTION } from '../data/BossAffection.js';
import { BOSS_IMAGES } from '../assets/bossImages.js';

/**
 * ボス = 攻略する女の子。TotalHeart を「LOVE(好感度)0〜100%」として扱い、
 *   ・25% ごとの表情段階(頬の赤み / 汗 / 視線をそらす / ハートの目)
 *   ・50% の会話イベント(質問 →「次の1投」で答える → 当てた場所でリアクション)
 *   ・100% LOVE MAX
 * を担当する。セリフ・段階・回答エリアはすべて data/BossAffection.js(ボスごと)。
 *
 * 表情は「正式な表情素材(stages[].image)があれば画像を差し替え、無ければ今の画像に重ねる仮表示」。
 */
export class AffectionSystem {
  constructor(g) {
    this.g = g;
    this.time = 0;
    this.buildDOM();
    this.textures = makeTextures();
    this.reset();
  }

  get data() { return BOSS_AFFECTION[this.g.stage?.boss?.affection] ?? DEFAULT_AFFECTION; }
  get rate() { const b = this.g.boss; return b ? (b.heart / b.maxHeart) * 100 : 0; }
  get stage() { return this.data.stages[this.stageIndex] ?? this.data.stages[0]; }

  /** HEART 50% の会話イベントを再生済みか(同じステージでは二度と再生しない。Stage 開始時にリセット)*/
  get heart50Triggered() { return !!this.talkDone.interest50; }

  /** 会話の空気:on で周りが暗くなりボスだけ浮かび上がる・UI を暗く・BGM を下げる / off で戻す */
  setMood(on) {
    if (this.mood === on) return;
    this.mood = on;
    this.g.spotlight?.set(on);
    this.g.audio?.duckBgm(on ? Config.audio.talkBgmLevel : 1);
  }

  /** 戦闘開始時(newGame) */
  reset() {
    this.stageIndex = 0;
    this.talkDone = {};             // 会話イベントは1プレイ1回
    this.activeTalk = null;
    this.answerMode = null;         // 「次の1投」待ちの会話イベント
    this.selectedInterest = null;   // 50% イベントで選んだ場所(例 'face' / 'miss')。75% 以降・LOVE MAX の分岐用に保持
    this.answers = {};              // talkId → zoneId(今後の拡張用)
    this.tempExpr = null;
    if (this.mood) this.setMood(false);
    this.hideLine();
    this.hideTalk();
    this.showAnswerHint(false);
    this.applyStage(this.stage, true);
  }

  // ---------------- 表情オーバーレイ ----------------
  /** ボスを作り直した / 画像を読み込んだ後に呼ぶ(オーバーレイと回答エリアをボスへ取り付け) */
  attach(boss) {
    this.boss = boss;
    const view = boss.view;
    if (this.group) this.group.parent?.remove(this.group);
    if (this.zoneRoot) this.zoneRoot.parent?.remove(this.zoneRoot);
    this.group = new THREE.Group();
    this.zoneRoot = new THREE.Group();
    this.zones = [];
    view.body.add(this.group);
    view.anchors.body.add(this.zoneRoot);
    const mesh = view.imageMesh;
    this.imageMode = !!mesh;
    if (!mesh) { this.applyStage(this.stage, true); return; }
    const W = mesh.geometry.parameters.width, H = mesh.geometry.parameters.height;
    const im = Config.bossImage[Config.boss.layout] ?? { y: 0 };
    this.uv = (u, v, z = 0.4) => new THREE.Vector3((u - 0.5) * W, (1 - v) * H + (im.y ?? 0), z);
    this.imgW = W;
    const F = this.data.face;
    const spr = (tex, order = 7) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 })); s.renderOrder = order; this.group.add(s); return s; };
    this.blush = F.cheeks.map(([u, v]) => { const s = spr(this.textures.blush); s.position.copy(this.uv(u, v)); s.scale.set(F.size * W * 1.6, F.size * W * 0.9, 1); return s; });
    this.lines = F.cheeks.map(([u, v]) => { const s = spr(this.textures.lines, 8); s.position.copy(this.uv(u, v - 0.004)); s.scale.set(F.size * W * 1.1, F.size * W * 0.6, 1); return s; });
    this.eyes = F.eyes.map(([u, v]) => { const s = spr(this.textures.heart, 9); s.position.copy(this.uv(u, v)); s.scale.setScalar(F.size * W * 0.7); return s; });
    this.sweat = spr(this.textures.sweat, 9); this.sweat.position.copy(this.uv(F.sweat[0], F.sweat[1])); this.sweat.scale.set(F.size * W * 0.5, F.size * W * 0.75, 1);
    this.sparkles = Array.from({ length: 6 }, (_, i) => { const s = spr(this.textures.sparkle, 9); s.userData.a = (i / 6) * Math.PI * 2; return s; });
    this.faceCenter = this.uv((F.eyes[0][0] + F.eyes[1][0]) / 2, F.eyes[0][1] + 0.02);
    this.buildZones();
    this.applyStage(this.stage, true);
  }

  /** 50% 会話イベントの回答エリア(透明な当たり判定)。通常は見えない。Debug(Collider 表示)で半透明に */
  buildZones() {
    const talk = this.data.talks?.[0];
    if (!talk || !this.uv) return;
    const colors = ['#ff5fa2', '#3ee8ff', '#ffd23e', '#7dffb0'];
    const W = this.imgW, mesh = this.boss.view.imageMesh, H = mesh.geometry.parameters.height;
    for (const t of this.data.talks) {
      t.zones.forEach((z, i) => {
        for (const r of z.rects) {
          // 表示用(Debug のみ)。判定は「ボールが絵のどこを通ったか」を画像の割合で見る(zoneFromThrow)
          const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w * W, r.h * H), new THREE.MeshBasicMaterial({ color: colors[i % 4], transparent: true, opacity: 0.4, depthTest: false, side: THREE.DoubleSide, visible: false }));
          m.position.copy(this.uv(r.u, r.v, 0.05));
          m.userData.rect = r;
          m.renderOrder = 21;
          m.userData.part = z.id;
          m.userData.zone = z;
          m.userData.talk = t.id;
          this.zoneRoot.add(m);
          this.zones.push(m);
        }
      });
    }
  }

  /** 投球の当たり判定は通常どおり(回答エリアは Collider にしない)。止まった姿勢の判定用 Collider(全員で同じ結果)*/
  throwColliders() { return this.g.boss.hitPlane; }

  /**
   * 回答の1投が「絵のどこを通ったか」→ 回答エリア。
   *   ボスに当たった球:当たった点から進行方向へ延ばして絵の面と交わる点 / 外れた球:絵の面を横切った点
   *   → 画像の割合(u, v)にして zones[].rects と照合。3D の Collider の奥行きに左右されず、見た目どおりに判定できる
   */
  zoneFromThrow(result, flight) {
    const t = this.answerMode, view = this.boss?.view, mesh = view?.imageMesh;
    if (!t || !mesh) return null;
    let a = null, b = null;
    if (result?.type === 'hit' && flight) { a = result.point.clone(); b = a.clone().add(flight.vel.clone().normalize()); }
    else if (flight?.planeCross) { a = flight.planeCross.clone(); b = a.clone().add(flight.vel.clone().normalize()); }
    if (!a) return null;
    view.body.updateMatrixWorld(true);
    const la = view.body.worldToLocal(a), lb = view.body.worldToLocal(b);
    const dz = lb.z - la.z;
    const k = Math.abs(dz) > 1e-6 ? -la.z / dz : 0;
    const p = la.clone().lerp(lb, k);   // 絵の面(ローカル z = 0)上の点
    const W = mesh.geometry.parameters.width, H = mesh.geometry.parameters.height;
    const im = Config.bossImage[Config.boss.layout] ?? { y: 0 };
    const u = p.x / W + 0.5, v = 1 - (p.y - (im.y ?? 0)) / H;
    this.lastAnswerUV = { u, v };
    const margin = 1.15;   // 少し広めに取る(遊びやすさ優先)
    let best = null, bestD = Infinity;
    for (const z of t.zones) for (const r of z.rects) {
      const du = Math.abs(u - r.u) / (r.w / 2 * margin), dv = Math.abs(v - r.v) / (r.h / 2 * margin);
      if (du <= 1 && dv <= 1 && du + dv < bestD) { best = z; bestD = du + dv; }
    }
    return best;
  }

  zoneOf(partId) { return this.zones?.find((m) => m.userData.part === partId)?.userData.zone ?? null; }

  refreshZoneDebug() {
    const on = !!(this.answerMode && (Config.debug.showColliders || Config.debug.showDebugUI));
    for (const m of this.zones ?? []) m.material.visible = on && m.userData.talk === this.answerMode?.id;
  }

  /** 表情段階を適用(画像差し替え or 仮オーバーレイ) */
  applyStage(st, instant = false) {
    this.target = {
      blush: st.blush ?? 0,
      lines: (st.blush ?? 0) >= 0.6 ? 1 : 0,
      sweat: st.sweat ? 1 : 0,
      eyes: st.heartEyes ? 1 : 0,
      sparkle: st.sparkle ? 1 : 0,
      tilt: st.lookAway ? -0.045 : 0,
      x: st.lookAway ? -0.35 : 0,
    };
    if (instant) this.cur = { ...this.target };
    // 正式な表情素材があれば画像ごと差し替え
    const key = st.image;
    const view = this.boss?.view;
    if (view?.imageMesh) {
      const want = key && BOSS_IMAGES[key] ? key : this.g.stage?.boss?.image;
      if (want && this.imageKey !== want && BOSS_IMAGES[want]) {
        this.imageKey = want;
        const img = this.g.bossImgs?.[want];
        if (img?.complete && img.naturalWidth && view.imageMesh.material.map.image !== img) {
          const d = Config.bossImage[Config.boss.layout];
          view.setCustomImage(img, d.height, d.y);
        }
      }
    }
    if (view && !view.imageMesh) view.setExpression(st.heartEyes ? 'love' : st.blush > 0.3 ? 'happy' : 'normal');
  }

  /** リアクション用に一時的に別の段階の表情へ(sec 秒後に今の段階へ戻る) */
  flashExpr(stageId, sec = 1.8) {
    const st = this.data.stages.find((s) => s.id === stageId);
    if (!st) return;
    this.tempExpr = sec;
    this.applyStage({ ...st, blush: Math.max(st.blush ?? 0, this.stage.blush ?? 0) });
  }

  /** HEART が増えた後に呼ぶ(BossHitState)。段階が上がったら表情とひとこと */
  onHeartChanged() {
    const rate = this.rate;
    let idx = 0;
    // 100%(デレ)は撃破の余韻(GAME_CLEAR)で撃破セリフの後に出す。ここでは 75% までの段階
    this.data.stages.forEach((s, i) => { if (rate >= s.min && s.min < 100) idx = i; });
    if (idx <= this.stageIndex) return;
    this.stageIndex = idx;
    const st = this.stage;
    this.applyStage(st);
    this.g.effects.heartBurst(this.boss.partCenter('head'), 12, 4, 0.6);
    if (st.line && st.min < 100) this.showLine(st.line);
  }

  update(dt) {
    this.time += dt;
    if (this.tempExpr != null) { this.tempExpr -= dt; if (this.tempExpr <= 0) { this.tempExpr = null; this.applyStage(this.stage); } }
    if (!this.cur || !this.blush) { this.applyPose(); return; }
    const k = Math.min(1, dt * 4);
    for (const key of Object.keys(this.target)) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    const c = this.cur, t = this.time;
    const pulse = 1 + Math.sin(t * 4) * 0.08 * c.blush;
    for (const s of this.blush) { s.material.opacity = Math.min(0.9, c.blush * 0.85); s.scale.x = s.scale.y / 0.5625 * pulse; }
    for (const s of this.lines) s.material.opacity = c.lines * 0.85;
    for (const s of this.eyes) { s.material.opacity = c.eyes; s.scale.setScalar(this.data.face.size * this.imgW * 0.7 * (1 + Math.sin(t * 6) * 0.12)); }
    this.sweat.material.opacity = c.sweat * 0.9;
    this.sweat.position.y = this.uv(this.data.face.sweat[0], this.data.face.sweat[1]).y - (t * 0.25 % 0.3);
    this.sparkles.forEach((s, i) => {
      const a = s.userData.a + t * 0.9, r = this.imgW * (0.16 + 0.03 * Math.sin(t * 2 + i));
      s.position.set(this.faceCenter.x + Math.cos(a) * r, this.faceCenter.y + Math.sin(a) * r * 0.8, 0.5);
      s.material.opacity = c.sparkle * (0.6 + 0.4 * Math.sin(t * 5 + i));
      s.scale.setScalar(this.imgW * 0.05);
    });
    this.applyPose();
  }

  applyPose() {
    const v = this.boss?.view; if (!v) return;
    v.pose ??= { tilt: 0, x: 0, tTilt: 0, tX: 0 };
    v.pose.tTilt = this.target?.tilt ?? 0;
    v.pose.tX = this.target?.x ?? 0;
  }

  // ---------------- 会話イベント ----------------
  /** 今、発生させるべき会話(1プレイ1回)。FEVER 中でも待たない(FEVER は一時停止して会話を優先) */
  pendingTalk() {
    if (this.answerMode || this.activeTalk) return null;
    return (this.data.talks ?? []).find((t) => !this.talkDone[t.id] && this.rate >= t.at) ?? null;
  }

  startTalk(t) { this.talkDone[t.id] = true; this.activeTalk = t; }

  /** 「次の1投」を回答にする */
  beginAnswer() {
    this.answerMode = this.activeTalk;
    this.activeTalk = null;
    this.refreshZoneDebug();
    this.showAnswerHint(true, this.answerMode?.hint);
  }

  /** 回答の1投の結果 → { zone | null, line, talk }。selectedInterest に保存 */
  resolveAnswer(result, flight) {
    const t = this.answerMode;
    if (!t) return null;
    const zone = this.zoneFromThrow(result, flight);
    this.selectedInterest = zone ? zone.id : 'miss';
    this.answers[t.id] = this.selectedInterest;
    this.answerMode = null;
    this.refreshZoneDebug();
    this.showAnswerHint(false);
    return { talk: t, zone, line: zone ? zone.line : t.miss };
  }

  /** 50% イベントで選んだ場所の表示名(データのラベル)*/
  get interestLabel() {
    const id = this.selectedInterest;
    if (!id) return '-';
    if (id === 'miss') return 'MISS';
    for (const t of this.data.talks ?? []) { const z = t.zones.find((q) => q.id === id); if (z) return z.label; }
    return id;
  }

  /** 100% LOVE MAX:完全にデレた表情 + セリフ(selectedInterest で分岐できるよう loveMax.byInterest も参照)*/
  onLoveMax() {
    this.answerMode = null;
    this.showAnswerHint(false);
    this.hideLine();
    this.stageIndex = this.data.stages.length - 1;
    this.tempExpr = null;
    this.applyStage(this.stage);
    const L = this.data.loveMax ?? {};
    const line = L.byInterest?.[this.selectedInterest] ?? L.line;
    if (line) setTimeout(() => this.showTalk(line, { big: false }), 700);
  }

  // ---------------- DOM(セリフ)----------------
  buildDOM() {
    const ui = document.getElementById('ui');
    this.lineEl = document.createElement('div');
    this.lineEl.id = 'bossLine';
    this.lineEl.hidden = true;
    ui.appendChild(this.lineEl);
    this.talkEl = document.createElement('div');
    this.talkEl.id = 'talkBox';
    this.talkEl.hidden = true;
    this.talkEl.innerHTML = '<div class="tb-name"></div><div class="tb-text"></div><div class="tb-sub"></div><div class="tb-next">▼</div>';
    ui.appendChild(this.talkEl);
    this.hintEl = document.createElement('div');
    this.hintEl.id = 'answerHint';
    this.hintEl.hidden = true;
    ui.appendChild(this.hintEl);
  }

  /** 段階が上がった時のひとこと(進行は止めない) */
  showLine(text) {
    const el = this.lineEl;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.lineTimer);
    this.lineTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  hideLine() { clearTimeout(this.lineTimer); if (this.lineEl) this.lineEl.hidden = true; }

  /** 会話ボックス。タイプライター表示(実時間)。done(true) で全文表示済み */
  showTalk(text, { sub = '', big = false } = {}) {
    const el = this.talkEl;
    el.hidden = false;
    el.classList.toggle('big', big);
    el.querySelector('.tb-name').textContent = this.data.name ?? this.g.stage?.boss?.name ?? '';
    el.querySelector('.tb-sub').textContent = sub;
    const tx = el.querySelector('.tb-text');
    clearInterval(this.typeTimer);
    let n = 0;
    this.typed = false;
    tx.textContent = '';
    this.typeTimer = setInterval(() => {
      n += 1;
      tx.textContent = text.slice(0, n);
      if (n >= text.length) { clearInterval(this.typeTimer); this.typed = true; }
    }, 34);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  finishTyping(text) { clearInterval(this.typeTimer); this.talkEl.querySelector('.tb-text').textContent = text; this.typed = true; }
  hideTalk() { clearInterval(this.typeTimer); if (this.talkEl) this.talkEl.hidden = true; }

  showAnswerHint(on, text = '') {
    if (!this.hintEl) return;
    this.hintEl.hidden = !on;
    if (on) this.hintEl.innerHTML = `<b>♡ ANSWER</b><span>${text}</span>`;
  }
}

/** 仮の表情パーツ(Canvas)。正式な表情素材が来たら stages[].image で画像ごと差し替える */
function makeTextures() {
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  return {
    blush: tex(128, 72, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,70,120,0.95)'); r.addColorStop(0.5, 'rgba(255,90,140,0.55)'); r.addColorStop(1, 'rgba(255,120,160,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }),
    lines: tex(96, 56, (g) => { g.strokeStyle = 'rgba(220,40,90,0.9)'; g.lineWidth = 5; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(24 + i * 20, 42); g.lineTo(38 + i * 20, 14); g.stroke(); } }),
    heart: tex(64, 64, (g) => { g.fillStyle = '#ff3d8f'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 6, 10, 22, 10); g.bezierCurveTo(28, 10, 32, 16, 32, 20); g.bezierCurveTo(32, 16, 36, 10, 42, 10); g.bezierCurveTo(58, 10, 60, 34, 32, 54); g.fill(); g.stroke(); }),
    sweat: tex(48, 72, (g) => { g.fillStyle = 'rgba(150,220,255,0.95)'; g.strokeStyle = '#2a6f9e'; g.lineWidth = 3; g.beginPath(); g.moveTo(24, 6); g.bezierCurveTo(40, 34, 44, 50, 24, 64); g.bezierCurveTo(4, 50, 8, 34, 24, 6); g.fill(); g.stroke(); }),
    sparkle: tex(64, 64, (g) => { g.fillStyle = '#fff6c8'; g.beginPath(); g.moveTo(32, 2); g.quadraticCurveTo(36, 28, 62, 32); g.quadraticCurveTo(36, 36, 32, 62); g.quadraticCurveTo(28, 36, 2, 32); g.quadraticCurveTo(28, 28, 32, 2); g.fill(); }),
  };
}
