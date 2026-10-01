import { Config } from '../core/Config.js';
import { STAGES, stageById, characterById } from '../data/GameData.js';
import { artUrl } from '../data/CharacterArt.js';
import '../data/CharacterVoice.js';
import { PlayerProgress } from '../data/PlayerProgress.js';
import { BOSS_IMAGES } from '../assets/bossImages.js';
import { AudioManager } from '../managers/AudioManager.js';
import { setupMobile } from '../core/MobileSupport.js';
import { CharacterDetail } from '../screens/CharacterDetail.js';
import { ScreenRouter, KIND, BottomNav, SheetHost } from './ScreenRouter.js';
import { HomeScreen } from '../home/HomeScreen.js';
import { AppScreens, FavoriteSheet } from './SubScreens.js';
import { GachaUI } from '../gacha/GachaUI.js';
import { Log, safe, nullObject, Haptic } from './Platform.js';

/**
 * HEART STRIKE のアプリ本体(ゲームの「外側」)。
 *   Critical:Save(PlayerProgress)/ CharacterData / Router / 画面 → 失敗したら起動できない
 *   Noncritical:Audio(BGM / SE)/ Haptic / 3D ゲーム本体(WebGL)→ 失敗しても HOME は開く
 * 既存のインゲーム(GameManager)は attachGame() で後からつなぐ。STAGE SELECT 以降(MenuFlow)はそのまま再利用。
 */
export class App {
  constructor(container) {
    this.container = container;
    this.progress = new PlayerProgress();                        // [SAVE] v1 → v2 Migration もここ
    this.audio = safe('AUDIO', () => new AudioManager(), () => nullObject('audio'));
    this.router = new ScreenRouter(container);
    const mk = (id, cls, parent = container) => { const e = document.createElement('div'); e.id = id; e.className = cls; e.hidden = true; parent.appendChild(e); return e; };
    const homeEl = mk('home', 'layer app-light');
    const appEl = mk('appScreen', 'layer app-light');
    const gachaEl = mk('gachaLayer', 'layer app-light');
    const navEl = mk('bottomNav', 'bnav');
    const sheetEl = mk('sheetRoot', 'sheet');
    this.toastEl = mk('toast', 'toast');
    this.router.registerLayer('home', homeEl);
    this.router.registerLayer('app', appEl);
    this.router.registerLayer('gacha', gachaEl);
    this.nav = new BottomNav(this.router, navEl);
    this.sheet = new SheetHost(this.router, sheetEl);
    this.home = new HomeScreen(this, homeEl);
    this.screens = new AppScreens(this, appEl);
    this.favSheet = new FavoriteSheet(this);
    this.gacha = new GachaUI(this, gachaEl);
    this.detail = new CharacterDetail(this, this.progress, container);
    safe('TOUCH', () => setupMobile(this));
    this.registerScreens();
    this.router.onChange((id, def, ctx) => this.onRoute(id, def, ctx));
    this.applySettings();
    this.bindBack();
  }

  registerScreens() {
    const R = this.router, S = this.screens;
    R.register('home', { kind: KIND.TAB_ROOT, layer: 'home', opaque: true, show: (p, c) => this.home.show(p, c), hide: () => this.home.hide() });
    R.register('training', { kind: KIND.TAB_ROOT, layer: 'app', opaque: true, show: () => S.showTraining() });
    R.register('gacha', { kind: KIND.TAB_ROOT, layer: 'gacha', opaque: true, show: () => this.gacha.showTop() });
    R.register('collection', { kind: KIND.TAB_ROOT, layer: 'app', opaque: true, show: (p) => S.showCollection(p) });
    R.register('trainChar', { kind: KIND.SUB, layer: 'app', opaque: true, show: (p) => S.showTrainChar(p) });
    R.register('heroine', { kind: KIND.SUB, layer: 'app', opaque: true, show: (p) => S.showHeroine(p), hide: () => S.stopAsmr(), leave: () => S.stopAsmr() });
    R.register('mission', { kind: KIND.SUB, layer: 'app', opaque: true, show: () => S.showMission() });
    R.register('present', { kind: KIND.SUB, layer: 'app', opaque: true, show: () => S.showPresent() });
    R.register('settings', { kind: KIND.SUB, layer: 'app', opaque: true, show: () => S.showSettings() });
    R.register('detail', { kind: KIND.SUB, layer: null, overlay: true, opaque: true, show: (p, c) => { if (!c.restore) this.detail.open(p.id); }, hide: () => this.detail.hide() });
    R.register('favoriteSheet', { kind: KIND.SHEET, show: () => this.favSheet.show(), hide: () => this.favSheet.hide() });
    R.register('gachaConfirm', { kind: KIND.SHEET, show: (p) => this.gacha.showConfirm(p), hide: () => this.sheet.close() });
    R.register('gachaRates', { kind: KIND.SHEET, show: () => this.gacha.showRates(), hide: () => this.sheet.close() });
    R.register('gachaSeq', { kind: KIND.FLOW, layer: 'gacha', opaque: true, show: () => this.gacha.section('stage'), hide: () => this.gacha.director.stop() });
    R.register('gachaResult', { kind: KIND.FLOW, layer: 'gacha', opaque: true, show: (p) => this.gacha.showResult(p) });
    // 3D ゲームが使えない環境でも HOME / ガチャは動く(攻略・編成は案内だけ)
    for (const id of ['stage', 'partyTab']) R.register(id, { kind: id === 'stage' ? KIND.TAB_ROOT : KIND.SUB, layer: 'app', opaque: true, show: () => this.showGameUnavailable() });
  }

  /** 既存のインゲーム(STAGE SELECT → … → RESULT)をつなぐ */
  attachGame(g) {
    this.game = g;
    const R = this.router, M = g.menu;
    this.router.registerLayer('menu', M.el);
    const same = (id, c) => c.restore && M.screen === id && !M.el.hidden;
    R.register('stage', { kind: KIND.TAB_ROOT, layer: 'menu', opaque: true, show: (p, c) => { if (!same('stage', c)) M.showStageSelect(p); } });
    R.register('partyTab', { kind: KIND.SUB, layer: 'menu', opaque: true, show: (p, c) => { if (!(same('party', c) && M.partyMode === 'standalone')) M.showPartyEdit({ mode: 'standalone' }); } });
    R.register('diff', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p, c) => { if (!same('diff', c)) M.showDifficultySelect(p); } });
    R.register('party', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p, c) => { if (!(same('party', c) && M.partyMode === 'sortie')) M.showPartyEdit({ mode: 'sortie' }); } });
    R.register('chars', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p, c) => { if (!same('chars', c)) M.showCharacterSelect(); } });
    R.register('game', { kind: KIND.FLOW, layer: null, resetTo: 'stage', show: () => M.hide() });
    R.register('result', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p) => M.showResult(p.res ?? g.lastResult) });
    R.register('over', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p) => M.showGameOver(p.stage ?? g.stage, p.stats ?? []) });
  }

  showGameUnavailable() {
    this.screens.frame('stage', '攻略');
    this.screens.body.innerHTML = `<div class="as-empty">この端末では 3D 表示(WebGL)が使えないため、ステージを開始できません。<br>${this.gameError ? `<small>${String(this.gameError).replace(/[<>&]/g, '')}</small>` : ''}</div>`;
  }

  /** 起動:未表示のガチャ結果があれば最低保証 Reveal → Result、無ければ HOME */
  start() {
    const boot = Config.app.bootScreen;
    this.router.go(this.router.screens.has(boot) && this.router.def(boot).kind === KIND.TAB_ROOT ? boot : 'home');
    if (this.progress.data.gacha.pending) this.gacha.restore();
    // Noncritical:よく使う全身画像を先にデコード(初回表示のカクつきを減らす)
    safe('ASSET', () => setTimeout(() => { for (const id of this.progress.ownedIds.slice(0, 8)) { const im = new Image(); im.src = artUrl(characterById(id), 'cutout'); im.decode?.().catch(() => {}); } }, 800));
    Log.info('INIT', `start → ${this.router.currentId}`);
  }

  // ---------------- 画面遷移の共通処理 ----------------
  onRoute(id, def, ctx) {
    if (!def || ctx.sheet || ctx.sheetClosed) { this.refreshNotifications(); return; }
    // 行き先の画面を開いたら、その Guidance は解決済み
    const top = this.router.top;
    if (!ctx.restore) safe('HOME', () => this.home.agenda.resolveFor(id, top?.params ?? {}));
    if (id === 'stage') this.progress.clearNavPulse();          // 攻略 Pulse:Stage Select を開いたら既読
    if (id === 'detail' && top?.params?.id) this.progress.markIntroduced(top.params.id);
    if (def.kind === KIND.TAB_ROOT) this.refreshNotifications();
    // Android の Back キー / ブラウザの戻る = BACK
    if (!ctx.restore && def.kind !== KIND.TAB_ROOT) safe('ROUTER', () => history.pushState({ hs: this.router.stack.length }, ''));
  }
  bindBack() {
    safe('ROUTER', () => window.addEventListener('popstate', () => {
      if (this.router.currentId === 'game') { safe('ROUTER', () => history.pushState({ hs: 1 }, '')); return; }   // Game 中は戻れない
      if (!this.router.back() && this.router.currentId !== 'home') this.router.go('home');
    }));
  }

  /** Deep Link:{ screen:'stage', stageId, difficulty } → Stage Select(選択状態でスクロール)→ Difficulty(推奨を選択状態にするだけ。決定はプレイヤー)*/
  deepLink(d) {
    if (!d) return;
    if (d.screen === 'stage') {
      if (!this.game) { this.router.go('stage'); return; }
      this.router.go('stage', { stageId: d.stageId, difficulty: d.difficulty });
      const st = stageById(d.stageId);
      clearTimeout(this.deepTimer);
      this.deepTimer = setTimeout(() => { if (this.router.currentId === 'stage' && st) this.game.menu.pickStage(st, { recommend: d.difficulty }); }, 420);
      return;
    }
    if (d.screen === 'gachaResult') { if (!this.gacha.restore()) this.router.go('gacha'); return; }
    if (d.screen === 'detail') { this.router.go('detail', { id: d.id }); return; }
    this.router.go(d.screen, d);
  }

  refreshNotifications() { safe('HOME', () => this.applyNotifications(this.home.provider.notifications())); }
  applyNotifications(n) {
    this.nav.setDot('gacha', n.gacha.dot);
    this.nav.setPulse('stage', n.stage.pulse);
  }

  applySettings() {
    const s = this.progress.data.settings;
    Haptic.enabled = s.haptic && Config.gacha.haptic;
    Config.audio.bgm = !!s.bgm;
  }

  bossThumb(stage) { return BOSS_IMAGES[stage.boss.image] ?? BOSS_IMAGES[stage.boss.fallbackImage] ?? ''; }

  toast(text) {
    const t = this.toastEl;
    t.textContent = text; t.hidden = false;
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }
}
export { STAGES };
