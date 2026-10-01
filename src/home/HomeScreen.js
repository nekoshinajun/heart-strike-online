import { Config, difficultyData } from '../core/Config.js';
import { characterById, stageById, ATTRIBUTES, RANKS } from '../data/GameData.js';
import { artUrl } from '../data/CharacterArt.js';
import { HomeGuidanceProvider, HomeAgenda, DialogueResolver } from './Guidance.js';
import { Log, Haptic, reducedMotion } from '../app/Platform.js';
import { iconSvg } from '../app/ScreenRouter.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TOP_ICONS = {
  mission: '<path d="M7 4h10v3H7zM5 6h2v14h10V6h2v16H5z"/><path d="m8.5 13 2.2 2.2 4.8-4.8" fill="none" stroke="currentColor" stroke-width="2"/>',
  present: '<path d="M4 9h16v4H4zM5.5 13h13v8h-13zM12 9v12M12 9C10 5 6.5 5 7.5 7.5S12 9 12 9zm0 0c2-4 5.5-4 4.5-1.5S12 9 12 9z"/>',
  settings: '<path d="M10.3 3h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6V9.9L4.2 8.3l1.7-2.9 2.3.8 1.6-.9zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill-rule="evenodd"/>',
};
const topIcon = (k) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${TOP_ICONS[k]}</svg>`;

/**
 * HOME:メニュー一覧ではなく「推し(Favorite Character)に会う場所」
 *   Top Bar(HEART STRIKE / Player / HEART GEM / Mission / Present / Settings / 予備)→ 吹き出し → 全身 → ♡変更 → TODAY'S PICK → Bottom Nav
 * Gacha / Result との受け渡し:queueTrigger('afterClear') / receiveGachaResults([{id,isNew}]) だけ。ホームのキャラの変更(setFavorite)は育成 → キャラクター詳細からだけ。
 * どのセリフにするか(newlySetHome / setHome / afterGacha / afterClear)は HOME 側が決める。
 */
export class HomeScreen {
  constructor(app, el) {
    this.app = app;
    this.p = app.progress;
    this.el = el;
    this.provider = new HomeGuidanceProvider(this.p);
    this.agenda = new HomeAgenda(this.p, this.provider);
    this.voice = new DialogueResolver(this.p);
    this.sessionVisits = 0;
    this.taps = 0;
    el.innerHTML = `
      <div class="hm-bg"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
      <div class="hm-char"><div class="hm-shadow"></div><img alt="" draggable="false"></div>
      <div class="hm-bubble" hidden role="button"><p></p><span class="hm-go" hidden>▶</span></div>
      <header class="hm-top">
        <div class="hm-row">
          <div class="hm-brand">HEART <em>STRIKE</em><small>ハートストライク</small></div>
          <div class="hm-gem" aria-label="HEART GEM"><i>♦</i><b>0</b></div>
        </div>
        <div class="hm-row">
          <div class="hm-player"><span>PLAYER</span><b></b></div>
          <nav class="hm-icons">
            <button type="button" data-go="mission" aria-label="ミッション">${topIcon('mission')}<i class="dot" hidden></i></button>
            <button type="button" data-go="present" aria-label="プレゼント">${topIcon('present')}<i class="dot" hidden></i><i class="clock" hidden>⏱</i></button>
            <button type="button" data-go="settings" aria-label="設定">${topIcon('settings')}</button>
            <span class="hm-reserve" aria-hidden="true"></span>
          </nav>
        </div>
      </header>
      <button type="button" class="hm-pick" hidden><span class="pk-thumb"></span><span class="pk-main"><span class="pk-h">TODAY'S PICK <span class="role heroine sm">🎧 攻略対象</span></span><span class="pk-t"></span><span class="pk-s"></span></span><span class="pk-go">挑戦 ▶</span></button>`;
    this.img = el.querySelector('.hm-char img');
    this.charEl = el.querySelector('.hm-char');
    this.bubble = el.querySelector('.hm-bubble');
    for (const ev of ['pointerdown', 'pointerup']) el.addEventListener(ev, (e) => e.stopPropagation());
    for (const b of el.querySelectorAll('[data-go]')) b.addEventListener('click', () => app.router.go(b.dataset.go));
    el.querySelector('.hm-pick').addEventListener('click', () => this.pick && app.deepLink({ screen: 'stage', ...this.pick }));
    this.bubble.addEventListener('click', () => { if (this.bubbleDest) { const d = this.bubbleDest; this.hideBubble(); app.deepLink(d); } });
    this.bindCharacter();
  }

  get favorite() { return this.p.favoriteId ? this.p.character(this.p.favoriteId) : null; }

  // ---------------- 受け渡し(Contract)----------------
  /** Result → HOME:afterClear(Guidance より先に。Guidance は次に HOME を開いた時)*/
  queueTrigger(key) { this.p.setPendingHomeTrigger(key); }
  /** Gacha → HOME:results:[{id, isNew}] だけ受け取る。newlySetHome / setHome が既にあればそちらが優先 */
  receiveGachaResults(results) {
    const cur = this.p.data.pendingHomeTrigger;
    if (cur && (cur.key === 'newlySetHome' || cur.key === 'setHome')) return;
    this.p.setPendingHomeTrigger('afterGacha', { results: results.map((r) => ({ id: r.id, isNew: !!r.isNew })) });
  }
  /**
   * ホームのキャラを設定。★ 呼んでよいのは「育成 → キャラクター詳細 → ホームに設定」だけ(AppScreens.setHomeCharacter)。
   * HOME / ガチャ結果 / プロフィール / シートなど、ほかの画面からホームのキャラを変える導線は置かない。newlySetHome / setHome は HOME 到着時に再生
   */
  setFavorite(id) {
    const r = this.p.setFavorite(id);
    if (!r) return false;
    this.render();
    return true;
  }

  // ---------------- 表示 ----------------
  show(params, ctx) {
    this.render();
    let trig = this.p.takePendingHomeTrigger();
    if (trig?.key === 'afterClear' && Date.now() - trig.t > Config.home.afterClearValidMin * 60e3) trig = null;
    // 獲得後、初めて HOME で会う(newlySetHome が無い時の自己紹介)
    if (!trig && this.favorite && !this.p.data.characters[this.favorite.id].introducedAt) trig = { key: 'newlyObtained' };
    if (this.favorite) this.p.markIntroduced(this.favorite.id);
    this.p.save();
    if (ctx.restore && !trig) { this.refreshAgenda(); return; }
    this.arrive(trig);
  }
  hide() { this.hideBubble(); clearTimeout(this.idleTimer); }

  render() {
    const ch = this.favorite;
    const d = this.p.data;
    this.el.querySelector('.hm-gem b').textContent = d.wallet.heartGem.toLocaleString();
    this.el.querySelector('.hm-player b').textContent = d.player.name;
    if (ch) {
      const H = ch.home;
      this.charEl.style.setProperty('--ax', H.anchor.x);
      this.charEl.style.setProperty('--sc', H.scale);
      this.charEl.style.setProperty('--ac', ATTRIBUTES[ch.attribute].color);
      this.charEl.dataset.idle = reducedMotion() ? 'none' : H.idle;
      this.charEl.dataset.chara = ch.id;
      const src = artUrl(ch, 'cutout');
      if (this.img.dataset.src !== src) { this.img.src = src; this.img.dataset.src = src; }
      this.img.alt = ch.name;
    }
  }

  /** HOME 到着:pending trigger(afterClear 等)→ 無ければ Guidance 1件 → 無ければ通常挨拶 */
  arrive(trig) {
    this.sessionVisits++;
    const ch = this.favorite;
    const a = this.agenda.decide({ trigger: trig?.key, favoriteId: ch?.id });
    this.applyAgenda(a);
    let text = '', dest = null;
    if (trig) text = this.voice.pick(ch, trig.key);
    else if (a.guidance) { text = this.voice.guidance(ch, a.guidance); dest = a.guidance.destination ?? null; this.agenda.markShown(a.guidance); this.lastGuidance = a.guidance; }
    else text = this.voice.pick(ch, 'launch');
    this.p.data.home.lastVisitAt = Date.now();
    this.p.data.home.visits = (this.p.data.home.visits ?? 0) + 1;
    this.p.save();
    this.lastSpeech = { key: trig?.key ?? (a.guidance ? `guidance:${a.guidance.id}` : 'launch'), event: a.guidance?.event ?? null, text, dest };
    Log.info('HOME', `arrive: ${this.lastSpeech.key} pick=${a.pick ? `${a.pick.stageId}/${a.pick.difficulty}` : '-'}`);
    if (text) this.say(text, dest, { bounce: true });
    this.armIdle();
  }

  refreshAgenda() { this.applyAgenda(this.agenda.decide({ trigger: 'restore', favoriteId: this.favorite?.id })); }

  applyAgenda(a) {
    this.lastAgenda = a;
    this.pick = a.pick;
    this.app.applyNotifications(a.notifications);
    const card = this.el.querySelector('.hm-pick');
    this.el.classList.toggle('no-pick', !a.pick);
    card.hidden = !a.pick;
    card.classList.toggle('linked', !!a.pick?.linked);   // セリフと同じ Stage の時は枠を光らせる(「この話だよ」)
    if (a.pick) {
      const st = stageById(a.pick.stageId), D = difficultyData(a.pick.difficulty);
      card.style.setProperty('--dc', D.color);
      card.style.setProperty('--ac', ATTRIBUTES[st.boss.attribute].color);
      card.querySelector('.pk-thumb').style.backgroundImage = `url('${this.app.bossThumb(st)}')`;
      card.querySelector('.pk-t').innerHTML = `${esc(st.boss.name)} <b style="--dc:${D.color}">${D.label}</b>`;
      // 初回クリア報酬(Config.rewards。受取済みならそう表示)
      const gem = Config.rewards.firstClearGem?.[a.pick.difficulty] ?? 0;
      const got = this.p.record(a.pick.stageId, a.pick.difficulty)?.firstClearRewarded;
      const reward = gem ? (got ? '初回報酬 受取済' : `初回クリア ♦${gem}`) : '';
      card.querySelector('.pk-s').textContent = [a.pick.reason ?? `STAGE ${st.no}`, reward].filter(Boolean).join(' ・ ');
      card.dataset.stage = a.pick.stageId; card.dataset.diff = a.pick.difficulty;
    }
    const n = a.notifications;
    this.el.querySelector('[data-go="mission"] .dot').hidden = !n.mission.dot;
    this.el.querySelector('[data-go="present"] .dot').hidden = !n.present.dot;
    this.el.querySelector('[data-go="present"] .clock').hidden = !n.present.clock;
  }

  // ---------------- 吹き出し ----------------
  say(text, dest = null, { bounce = false } = {}) {
    const b = this.bubble;
    b.querySelector('p').textContent = text;
    this.bubbleDest = dest;
    b.querySelector('.hm-go').hidden = !dest;
    b.classList.toggle('linked', !!dest);
    b.hidden = false;
    this.placeBubble();
    b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
    if (bounce && !reducedMotion()) { this.charEl.classList.remove('react'); void this.charEl.offsetWidth; this.charEl.classList.add('react'); }
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => this.hideBubble(), Config.home.dialogueSeconds * 1000 + (dest ? 2000 : 0));
  }
  /** 吹き出しは頭の横〜肩(CharacterData.home.bubbleAnchor)。顔には重ねない・画面からはみ出さない */
  placeBubble() {
    const ch = this.favorite, b = this.bubble;
    const host = this.el.getBoundingClientRect(), r = this.img.getBoundingClientRect();
    if (!ch || !r.width) return;
    // 顔の位置 = portraitFocus(画像比)。吹き出しは顔の右(頭の横〜肩)→ 左 → 頭の上 の順。顔には重ねない
    const pf = ch.portraitFocus ?? { x: 0.5, y: 0.2 };
    const A = ch.home.bubbleAnchor ?? { x: pf.x + 0.17, y: pf.y + 0.02 };
    const ox = r.left - host.left, oy = r.top - host.top;
    const faceR = ox + (pf.x + 0.13) * r.width, faceL = ox + (pf.x - 0.13) * r.width, faceT = oy + (pf.y - 0.1) * r.height;
    const topLimit = this.el.querySelector('.hm-top').getBoundingClientRect().bottom - host.top + 4;
    // 右上の縦アイコン列(GEM / ミッション / プレゼント / 設定)には重ねない:右端はアイコン列の左まで
    const rail = this.el.querySelector('.hm-icons').getBoundingClientRect();
    const rightEdge = rail.width ? Math.min(host.width - 12, rail.left - host.left - 8) : host.width - 12;
    const availR = rightEdge - Math.max(faceR + 4, ox + A.x * r.width), availL = faceL - 4 - 12;
    b.style.maxWidth = '';
    let x, y;
    if (availR >= 140 || availR >= availL) { b.style.maxWidth = `${Math.min(230, availR)}px`; x = rightEdge - availR; }
    else { b.style.maxWidth = `${Math.min(230, availL)}px`; x = faceL - 4 - b.offsetWidth; }
    const bh = b.offsetHeight;
    y = oy + A.y * r.height - bh / 2;
    if (Math.min(availR, 230) < 120 && availL < 120) { b.style.maxWidth = `${Math.min(230, rightEdge - 12)}px`; x = Math.max(12, Math.min(rightEdge - b.offsetWidth, (faceL + faceR) / 2 - b.offsetWidth / 2)); y = faceT - b.offsetHeight - 8; }
    b.style.left = `${Math.max(12, x)}px`; b.style.top = `${Math.max(topLimit, y)}px`;
  }
  hideBubble() { clearTimeout(this.bubbleTimer); this.bubble.hidden = true; this.bubbleDest = null; }

  armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { if (!this.el.hidden && this.app.router.currentId === 'home' && !this.app.router.sheetOpen) this.say(this.voice.pick(this.favorite, 'idle')); }, 30000);
  }

  /** キャラ:タップ = 通常セリフ(約1.5秒は再入力しない)/ 長押し 450ms = CHARACTER DETAIL */
  bindCharacter() {
    const el = this.img;
    let timer = null, start = null, fired = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    el.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY }; fired = false;
      cancel();
      timer = setTimeout(() => {
        timer = null; fired = true;
        Haptic.light();
        this.app.router.go('detail', { id: this.favorite.id });
      }, Config.home.longPressMs);
    });
    el.addEventListener('pointermove', (e) => { if (start && timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
    el.addEventListener('pointerup', () => {
      const wasTap = !!timer && !fired;
      cancel(); start = null;
      if (!wasTap) return;
      const t = performance.now();
      if (t < (this.tapLockUntil ?? 0)) return;
      this.tapLockUntil = t + Config.home.tapLockSeconds * 1000;
      this.taps++;
      // 3回タップするごとに1回、未解決の Guidance をもう一度言う
      const g = this.taps % Config.home.guidanceEveryTaps === 0 ? this.agenda.unresolvedTop() : null;
      if (g) this.say(this.voice.guidance(this.favorite, g), g.destination ?? null, { bounce: true });
      else this.say(this.voice.pick(this.favorite, 'tap'), null, { bounce: true });
      this.p.save();
      this.armIdle();
    });
    el.addEventListener('pointercancel', () => { cancel(); start = null; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
