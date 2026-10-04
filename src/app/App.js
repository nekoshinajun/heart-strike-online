import { Config } from '../core/Config.js';
import { STAGES, characterById } from '../data/GameData.js';
import { shopOfStage } from '../data/ShopData.js';
import { castArtData } from '../screens/CaptureScreens.js';
import { artUrl } from '../data/CharacterArt.js';
import '../data/CharacterVoice.js';
import { PlayerProgress } from '../data/PlayerProgress.js';
import { BOSS_IMAGES } from '../assets/bossImages.js';
import { bossAsset } from '../data/CharacterAssets.js';
import { AudioManager } from '../managers/AudioManager.js';
import { setupMobile } from '../core/MobileSupport.js';
import { CharacterDetail } from '../screens/CharacterDetail.js';
import { ScreenRouter, KIND, BottomNav, SheetHost } from './ScreenRouter.js';
import { HomeScreen } from '../home/HomeScreen.js';
import { AppScreens } from './SubScreens.js';
import { GachaUI } from '../gacha/GachaUI.js';
import { Log, safe, nullObject, Haptic } from './Platform.js';
import { MENU_SLOT } from '../audio/BgmTracks.js';
import { showTutorialScreen } from '../tutorial/TutorialScreen.js';

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
    R.register('gacha', { kind: KIND.TAB_ROOT, layer: 'gacha', opaque: true, show: (p, ctx) => this.gacha.showTop(p, ctx) });
    R.register('collection', { kind: KIND.TAB_ROOT, layer: 'app', opaque: true, show: (p, c) => S.showCollection(p, c) });
    R.register('collectionItem', { kind: KIND.SHEET, show: (p) => S.showItemSheet(p), hide: () => this.sheet.close() });
    R.register('collectionSort', { kind: KIND.SHEET, show: (p) => S.showCollectionSortSheet(p), hide: () => this.sheet.close() });
    R.register('collectionFilter', { kind: KIND.SHEET, show: (p) => S.showCollectionFilterSheet(p), hide: () => this.sheet.close() });
    R.register('trainChar', { kind: KIND.SUB, layer: 'app', opaque: true, show: (p) => S.showTrainChar(p) });
    R.register('heroine', { kind: KIND.SUB, layer: 'app', opaque: true, show: (p) => S.showHeroine(p), hide: () => S.stopVoice(), leave: () => S.stopVoice() });
    R.register('mission', { kind: KIND.SUB, layer: 'app', opaque: true, show: () => S.showMission() });
    R.register('present', { kind: KIND.SUB, layer: 'app', opaque: true, show: () => S.showPresent() });
    R.register('settings', { kind: KIND.SUB, layer: 'app', opaque: true, show: () => S.showSettings() });
    R.register('tutorial', { kind: KIND.SUB, layer: 'app', opaque: true, show: () => showTutorialScreen(this, S) });
    R.register('detail', { kind: KIND.SUB, layer: null, overlay: true, opaque: true, show: (p, c) => { if (!c.restore) this.detail.open(p.id); }, hide: () => this.detail.hide() });
    // 育成 → キャラクター詳細:アビリティ / プレゼントはボタンで開くシート(詳細の下へ直接並べない)
    R.register('trainAbility', { kind: KIND.SHEET, show: () => S.openTrainSheet('ability'), hide: () => { S.trainSheet = null; this.sheet.close(); } });
    R.register('trainSpecial', { kind: KIND.SHEET, show: (p) => S.showSpecialSheet(p), hide: () => this.sheet.close() });
    R.register('trainGift', { kind: KIND.SHEET, show: () => S.openTrainSheet('gift'), hide: () => { S.trainSheet = null; this.sheet.close(); } });
    R.register('gachaConfirm', { kind: KIND.SHEET, show: (p) => this.gacha.showConfirm(p), hide: () => this.sheet.close() });
    R.register('gachaRates', { kind: KIND.SHEET, show: (p) => this.gacha.showRates(p), hide: () => this.sheet.close() });
    R.register('gachaSeq', { kind: KIND.FLOW, layer: 'gacha', opaque: true, noNav: true, show: () => this.gacha.section('stage'), hide: () => this.gacha.director.stop() });
    R.register('gachaResult', { kind: KIND.FLOW, layer: 'gacha', opaque: true, show: (p) => this.gacha.showResult(p) });
    // 3D ゲームが使えない環境でも HOME / ガチャは動く(攻略・編成は案内だけ)
    for (const id of ['stage', 'partyTab']) R.register(id, { kind: id === 'stage' ? KIND.TAB_ROOT : KIND.SUB, layer: 'app', opaque: true, show: () => this.showGameUnavailable() });
  }

  /** 既存のインゲーム(STAGE SELECT → … → RESULT)をつなぐ */
  attachGame(g) {
    this.game = g;
    g.setPowerSave?.(!!this.progress.data.settings.powerSave);   // 省電力モード(設定)
    const R = this.router, M = g.menu;
    this.router.registerLayer('menu', M.el);
    const same = (id, c) => c.restore && M.screen === id && !M.el.hidden;
    // 攻略:① お店を選ぶ(コンカフェ街マップ)→ ② お店の中(キャスト一覧)→ ③ キャストの攻略(SOLO/MULTI・難易度・挑戦する)
    R.register('stage', { kind: KIND.TAB_ROOT, layer: 'menu', opaque: true, show: (p, c) => { if (!same('shopmap', c)) M.showShopMap(p); else M.city?.start(); }, hide: () => M.city?.stop(), leave: () => M.city?.stop() });
    R.register('shop', { kind: KIND.SUB, layer: 'menu', opaque: true, show: (p, c) => { if (!same('shop', c)) M.showShop(p); } });
    R.register('cast', { kind: KIND.SUB, layer: 'menu', opaque: true, show: (p, c) => { if (!same('cast', c)) M.showStageSelect(p); } });
    R.register('partyTab', { kind: KIND.SUB, layer: 'menu', opaque: true, show: (p, c) => { if (!(same('party', c) && M.partyMode === 'standalone')) M.showPartyEdit({ mode: 'standalone' }); } });
    R.register('party', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p, c) => { if (!(same('party', c) && M.partyMode === 'sortie')) M.showPartyEdit({ mode: 'sortie' }); } });
    R.register('chars', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p, c) => { if (!same('chars', c)) M.showCharacterSelect(); } });
    R.register('game', { kind: KIND.FLOW, layer: null, battle: true, resetTo: 'stage', show: () => M.hide() });   // battle:インゲーム(下部メニュー非表示・バトル BGM)
    R.register('result', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p) => M.showResult(p.res ?? g.lastResult) });
    R.register('over', { kind: KIND.FLOW, layer: 'menu', opaque: true, show: (p) => M.showGameOver(p.stage ?? g.stage, p.stats ?? [], p.growth ?? []) });
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
    // BGM:インゲーム(game = 下部メニュー非表示)以外はすべて共通メニュー BGM。下部メニューと同じ境界(router.inBattle)。同じ曲が鳴っていれば何もしない(画面を切り替えても途切れない)
    //   バトル(game)は開始時に GameManager がバトル BGM を最初から鳴らす。リザルト / ゲームオーバー / 途中退出 / MULTI 終了で
    //   game 以外へ移った時は、メニュー BGM を前回止めた位置から再開する
    if (!this.router.inBattle) safe('AUDIO', () => { this.audio.voice?.stop(); this.audio.startBgm?.(MENU_SLOT, { resume: true }); });   // ゲームを離れたらボイスも残さない
    // MULTI のロビー(キャストの攻略画面の上に重なる)を開いたまま下部メニューで別の画面へ移った時は、ルームを抜けて閉じる
    if (!this.router.inBattle && id !== 'cast') safe('ONLINE', () => { const o = window.__online; if (o && !this.game?.online && o.root?.style.display !== 'none') o.closeLobby(); });
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

  /**
   * キャストの攻略画面を「お店を選ぶ → お店 → キャスト」の履歴つきで開く(戻るで1つずつ上の階層へ)
   *   Deep Link / バトル後のメニューへ戻る時に使う。stageId が無ければ「お店を選ぶ」
   */
  openCapture(stageId, { difficulty } = {}) {
    const shop = stageId ? shopOfStage(stageId) : null;
    if (!shop) { this.router.go('stage'); return; }
    this.router.reset([{ id: 'stage', params: { shopId: shop.id } }, { id: 'shop', params: { shopId: shop.id } }, { id: 'cast', params: { stageId, difficulty } }]);
  }

  /** Deep Link:{ screen:'stage', stageId, difficulty } → 攻略画面(ステージと推奨難易度を選択状態にするだけ。決定はプレイヤー)*/
  deepLink(d) {
    if (!d) return;
    if (d.screen === 'stage') {
      if (!this.game) { this.router.go('stage'); return; }
      this.openCapture(d.stageId, { difficulty: d.difficulty });
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
    const a = s.audio ?? {};
    safe('AUDIO', () => {
      this.audio.setVolume?.('bgm', a.bgmVolume ?? 0.5);
      this.audio.bgm?.setMuted?.(!!a.bgmMuted);
      this.audio.setVolume?.('se', a.seVolume ?? 1);
      this.audio.setVolume?.('voice', a.voiceVolume ?? 1);
    });
    safe('GAME', () => this.game?.setPowerSave?.(!!s.powerSave));
  }

  bossThumb(stage) { const a = bossAsset(stage); return BOSS_IMAGES[a?.thumbnail] ?? BOSS_IMAGES[a?.image?.fallback] ?? ''; }
  /** サムネイルを顔に合わせる CSS 変数(CharacterAssets の art.face)*/
  bossFocus(stage) { const f = castArtData(stage).face; return `--fu:${f.u};--fv:${f.v}`; }

  toast(text) {
    const t = this.toastEl;
    t.textContent = text; t.hidden = false;
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }
}
export { STAGES };
