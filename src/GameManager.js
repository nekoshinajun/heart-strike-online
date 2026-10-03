import * as THREE from './lib/three.js';
import { Config, difficultyData } from './core/Config.js';
import { EventBus } from './core/EventBus.js';
import { StateMachine, GameState } from './core/StateMachine.js';
import { Arena } from './world/Arena.js';
import { Effects } from './world/Effects.js';
import { BossController } from './controllers/BossController.js';
import { BallController } from './controllers/BallController.js';
import { CameraController } from './controllers/CameraController.js';
import { PlayerController } from './controllers/PlayerController.js';
import { InputManager } from './managers/InputManager.js';
import { TurnManager } from './managers/TurnManager.js';
import { CatchJudge } from './catch/CatchJudge.js';
import { CatchTargetController } from './catch/CatchTargetController.js';
import { ReturnBallController } from './return/ReturnBallController.js';
import { ThrowController } from './controllers/ThrowController.js';
import { loadTuning } from './core/Tuning.js';
import { InspectorPanel } from './managers/InspectorPanel.js';
import { BOSS_IMAGES } from './assets/bossImages.js';
import { bossAsset } from './data/CharacterAssets.js';
import { EnergySystem } from './energy/EnergySystem.js';
import { UIManager } from './managers/UIManager.js';
import { TrajectoryPreview } from './world/TrajectoryPreview.js';
import { PlayerAttackState, BallToBossState, BossHitState } from './states/AttackStates.js';
import { NextPlayerState, BossTauntState, BossReturnState, PlayerDefenseState, PlayerCatchState } from './states/DefenseStates.js';
import { TitleState, GameClearState, GameOverState } from './states/EndStates.js';
import { OpeningState } from './states/OpeningState.js';
import { STAGES } from './data/GameData.js';
import { battleSlot } from './audio/BgmTracks.js';
import { HitMarker } from './world/HitMarker.js';
import { heroineByStage, GIFTS } from './data/RomanceData.js';
import { shopOfStage } from './data/ShopData.js';
import { CLEAR_PRESENT } from './data/GrowthData.js';
import { throwModifiers } from './data/BattleCalc.js';
import { MenuFlow } from './screens/MenuFlow.js';
import { SpecialCutIn } from './screens/SpecialCutIn.js';
import { devInput, safe, Log } from './app/Platform.js';
import { FeverSystem } from './fever/FeverSystem.js';
import { SpecialThrowFx } from './effects/SpecialThrowEffects.js';
import { SpaceSystem } from './space/SpaceSystem.js';
import { AffectionSystem } from './affection/AffectionSystem.js';
import { FeverIntroState, FeverOutroState } from './states/FeverStates.js';

/**
 * 全体の組み立て・メインループ・時間管理(タイムスケール/ヒットストップ)を担当。
 * 各ステートは this(= g) を通して各マネージャ/コントローラへアクセスする。
 */
export class GameManager {
  /** @param app HEART STRIKE のアプリ本体(Save / Router / Audio / HOME)。インゲームは STAGE SELECT 以降だけを担当 */
  constructor(container, canvas, app) {
    this.container = container;
    this.app = app;
    this.router = app.router;
    this.bus = new EventBus();
    this.viewport = { w: 1, h: 1 };
    loadTuning(); // 調整パネルで保存した値を反映(部位HP等はボス生成前に)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();

    this.cam = new CameraController(1);
    this.arena = new Arena(this.scene);
    this.effects = new Effects(this.scene);
    this.specialFx = new SpecialThrowFx(this);   // SPECIAL 投球の見た目(キャラごと。見た目だけ)
    this.hitMarker = new HitMarker();   // 着弾マーク(実際に当たった位置に約1秒)
    this.boss = new BossController(this.scene);
    this.ball = new BallController(this.scene);
    this.preview = new TrajectoryPreview(this.scene);
    this.player = new PlayerController(this.cam, this.boss, this.viewport);
    this.turn = new TurnManager(this.bus);
    this.thrower = new ThrowController(this);
    this.energy = null; // UI 生成後に作る
    this.catchJudge = new CatchJudge();
    this.catchTarget = new CatchTargetController(this.player, this.cam, this.viewport);
    this.returnBall = new ReturnBallController(this.player, this.boss, this.viewport);
    this.ui = new UIManager(this.turn.players);
    this.audio = app.audio;
    this.input = new InputManager(container, this.bus);
    this.inspector = new InspectorPanel(this);
    this.energy = new EnergySystem(this);
    this.fever = new FeverSystem(this);
    this.space = new SpaceSystem(this);
    this.affection = new AffectionSystem(this);
    this.cfg = Config;
    const eg = document.getElementById('energy');
    eg.addEventListener('pointerdown', (e) => e.stopPropagation());
    eg.addEventListener('click', () => this.energy.toggleArm());

    // 時間
    this.clock = 0;          // ゲーム時間(秒)
    this.timeScale = 1;
    this.hitstopLeft = 0;
    this.lastFrame = performance.now();

    // ステートマシン
    this.sm = new StateMachine((name) => { this.container.dataset.state = name; });
    const S = GameState;
    this.sm.register(S.TITLE, new TitleState(this));
    this.sm.register(S.PLAYER_ATTACK, new PlayerAttackState(this));
    this.sm.register(S.BALL_TO_BOSS, new BallToBossState(this));
    this.sm.register(S.BOSS_HIT, new BossHitState(this));
    this.sm.register(S.OPENING, new OpeningState(this));
    this.sm.register(S.NEXT_PLAYER, new NextPlayerState(this));
    this.sm.register(S.BOSS_TAUNT, new BossTauntState(this));
    this.sm.register(S.BOSS_RETURN, new BossReturnState(this));
    this.sm.register(S.PLAYER_DEFENSE, new PlayerDefenseState(this));
    this.sm.register(S.PLAYER_CATCH, new PlayerCatchState(this));
    this.sm.register(S.FEVER_INTRO, new FeverIntroState(this));
    this.sm.register(S.FEVER_OUTRO, new FeverOutroState(this));
    this.sm.register(S.GAME_CLEAR, new GameClearState(this));
    this.sm.register(S.GAME_OVER, new GameOverState(this));

    // 入力 → 現在のステートへ
    this.bus.on('tap', (e) => this.sm.dispatch('onTap', e));
    this.bus.on('dragstart', (e) => this.sm.dispatch('onDragstart', e));
    this.bus.on('drag', (e) => this.sm.dispatch('onDrag', e));
    this.bus.on('release', (e) => this.sm.dispatch('onRelease', e));
    this.bus.on('keyrelease', (e) => this.sm.dispatch('onKeyRelease', e));
    // ラリー(内部:ボスの返球の強さ)はハート玉の光り方だけに使う。画面の数字は COMBO(FeverSystem)
    this.bus.on('rally', () => this.ball.setStyle(this.turn.current.color, this.turn.tierLevel));
    // SPECIAL ゲージはキャラごと:手番が変わったら左下の SPECIAL 表示をそのキャラのゲージへ
    this.bus.on('turn', () => this.energy?.onTurn());

    // デバッグ切替(キー / 画面右上ボタン)
    window.addEventListener('keydown', (e) => {
      if (!devInput()) return;   // DevInput(開発用のキー操作)
      if (e.key === 'c') this.toggleDebug('colliders');
      if (e.key === 't') this.toggleDebug('trajectory');
      if (e.key === 's') this.energy.toggleArm();
      if (e.key === 'd') this.toggleDebug('ui');
    });
    this.ui.onDebugToggle = (k) => this.toggleDebug(k);
    this.ui.setDebugState(Config.debug);
    // 【必須】PCはクリックでも Enter でも開始できること → MenuFlow(各画面の主ボタン = Enter)
    this.progress = app.progress;
    this.setDifficulty('NORMAL');
    this.menu = new MenuFlow(this, this.progress);
    this.cutin = safe('ASSET', () => new SpecialCutIn(document.getElementById('ui')));
    // 同梱ボス画像を先読み(ステージ切替を即時に)
    this.bossImgs = {};
    for (const [k, src] of Object.entries(BOSS_IMAGES)) { const im = new Image(); im.src = src; this.bossImgs[k] = im; }

    this.prepareStage(STAGES[0]);
    this.ui.energyLabel = Config.energy.label;
    this.ui.resetTutorial(Config.ui.tutorialThrows);
    this.applyDebugUI();
    // 隠しコマンド:推しの名前を5回タップで Debug UI(スマホ用)。PC は D キー
    const nameEl = document.getElementById('bossName');
    let taps = 0, tapT = 0;
    nameEl.style.pointerEvents = 'auto';
    nameEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const now = performance.now();
      taps = now - tapT < 600 ? taps + 1 : 1; tapT = now;
      if (taps >= 5) { taps = 0; this.toggleDebug('ui'); }
    });
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.newGame();
    this.sm.change(GameState.TITLE);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---- ボスの見た目(画像)とレイアウトの切替 ----
  /** 1枚絵のボスにする。layout は当たり判定レイアウト名('demon' | 'image') */
  useImageBoss(img, layout) {
    this.customImage = img;
    Config.boss.layout = layout;
    const im = Config.bossImage[layout];
    this.boss.view.setCustomImage(img, im.height, im.y);
    this.boss.buildColliders();
  }
  useBuiltinBoss() {
    this.customImage = null;
    Config.boss.layout = 'lulu';
    this.boss.view.clearCustomImage();
    this.boss.buildColliders();
  }
  useLayout(name) {
    if (name === 'lulu') return this.useBuiltinBoss();
    if (BOSS_IMAGES[name]) return this.loadBundledImage(name);
  }
  /** 同梱画像(data URI)を読み込んでボスにする */
  loadBundledImage(name) {
    const img = new Image();
    img.onload = () => this.useImageBoss(img, name);
    img.src = BOSS_IMAGES[name];
  }

  /** 当たり判定の表示(デバッグボタン or 調整パネル表示中) */
  setColliderView(on, reason) {
    this.colliderViewReasons ??= new Set();
    if (on) this.colliderViewReasons.add(reason); else this.colliderViewReasons.delete(reason);
    this.refreshColliderView();
  }
  refreshColliderView() {
    const vis = Config.debug.showColliders || (this.colliderViewReasons?.size ?? 0) > 0;
    this.boss.setDebugColliders(vis);
    this.colliderLabelsOn = vis;
    if (!vis) this.ui.updateColliderLabels(null);
  }

  /** ShowDebugUI:軌道予測・Collider・投球数値・部位一覧などの開発用表示 */
  applyDebugUI() {
    const D = Config.debug;
    this.container.classList.toggle('debug', D.showDebugUI);
    if (!D.showDebugUI) {
      D.showTrajectoryPreview = false; D.showLastTrajectory = false; D.showColliders = false;
      this.preview?.hideLive(); this.preview?.hideGhost();
      this.refreshColliderView?.();
    }
    this.ui.setDebugState(D);
  }

  toggleDebug(key) {
    const D = Config.debug;
    if (key === 'ui') { D.showDebugUI = !D.showDebugUI; this.applyDebugUI(); return; }
    if (key === 'colliders') { D.showColliders = !D.showColliders; this.refreshColliderView(); }
    if (key === 'trajectory') {
      D.showTrajectoryPreview = !D.showTrajectoryPreview;
      D.showLastTrajectory = D.showTrajectoryPreview;
      if (!D.showTrajectoryPreview) { this.preview.hideLive(); this.preview.hideGhost(); }
    }
    this.ui.setDebugState(D);
  }

  newGame() {
    this.turn.reset();
    this.bossAttacks = 0;
    this.stats = { perfect: 0, great: 0, good: 0, miss: 0, throwMiss: 0, loveSpots: 0, orbs: 0, heart: 0, startTime: performance.now() };
    this.energy?.reset();
    this.fever?.reset();
    this.specialFx?.end();
    this.affection?.reset();
    this.preview?.hideGhost();
    this.ui.setPlayers(this.turn.players, 0);
    this.ui.setHeart(this.boss.heart, this.boss.maxHeart);
    this.ui.setParts(this.boss.parts);
    this.ui.setCombo(0);
    this.returnBall.reset();
    this.catchTarget.hide();
    this.cam.setPlayerX(this.turn.current.x);
  }

  // ---- ステージ / パーティ ----
  /** ステージのボス(画像・当たり判定・返球プロファイル・Heart Capacity)を用意する */
  prepareStage(stage) {
    this.stage = stage;
    const b = stage.boss;
    Config.boss.name = b.name;
    Config.boss.layout = b.layout;
    Config.boss.profile = b.profile;
    Config.boss.characterId = b.characterId ?? null;   // 見た目の定義(data/CharacterAssets.js のキー)
    // 最終設定 = StageData × DifficultyData(ATK / DEF は変えない)
    const D = difficultyData(this.difficulty);
    Config.boss.maxHeart = Config.boss.heartOverride || Math.round(b.maxHeart * Config.battle.heartCapacityScale * D.heartCapacity);
    document.getElementById('bossName').textContent = b.name;
    this.rebuildBoss();
  }

  /** ボスを作り直す(HEART・部位・表情をリセット) */
  rebuildBoss() {
    this.scene.remove(this.boss.root);
    this.boss.dispose();
    this.boss = new BossController(this.scene);
    this.player.boss = this.boss;
    this.returnBall.boss = this.boss;
    // 1枚絵のボスだけ画像を貼る(Live2D は Live2DBossView が自分で描く)。ステージが無い時は調整パネルで読み込んだ画像
    const asset = this.stage ? bossAsset(this.stage) : null;
    const im = asset?.rendererType === 'image' ? asset.image : null;
    const img = im ? (this.bossImgs[im.key] ?? this.bossImgs[im.fallback]) : asset ? null : this.customImage;
    const apply = (im) => {
      this.customImage = im;
      const d = Config.bossImage[Config.boss.layout] ?? Config.bossImage.demon;
      this.boss.view.setCustomImage(im, d.height, d.y);
      this.boss.buildColliders();
      this.affection?.attach(this.boss);   // 表情オーバーレイ
    };
    if (img) {
      if (img.complete && img.naturalWidth) apply(img);
      else { const boss = this.boss; img.addEventListener('load', () => { if (this.boss === boss) apply(img); }, { once: true }); }
    }
    this.refreshColliderView();
    if (!this.boss.view.imageMesh) this.affection?.attach(this.boss);
    this.ui.setHeart(0, this.boss.maxHeart);
  }

  /**
   * 1投が終わった後の進行(ターン構造の中心)
   *   PLAYER ATTACK PHASE:生存している味方が A→B→C→D の順に1投ずつ → 全員投げ終えたら BOSS_TAUNT → まとめて反撃
   *   SOLO はここで決める / MULTI はサーバーが決めた結果(OnlineSession)に従う
   */
  afterThrow() {
    const S = GameState;
    if (this.online) {
      const o = this.online;
      if (o.phaseEnd) { o.phaseEnd = false; this.sm.change(S.BOSS_TAUNT); return; }
      this.sm.change(S.NEXT_PLAYER, { to: o.nextThrowerIndex() });
      return;
    }
    const n = this.turn.nextAttacker();
    if (n >= 0) this.sm.change(S.NEXT_PLAYER, { to: n });
    else this.sm.change(S.BOSS_TAUNT);
  }


  /** このステージの攻略対象の攻撃ボイス(データ:RomanceData の attackVoices。ファイルのあるものだけ)*/
  attackVoices() { return (heroineByStage(this.stage?.id)?.attackVoices ?? []).filter((v) => v?.src); }
  /**
   * ボス攻撃フェーズのボイスを1つ選ぶ(前回と同じボイスは候補から外す)。ボイスが無ければ null
   *   roll … MULTI:サーバーが配った乱数(全員が同じボイスを選ぶ)。SOLO は null(Math.random)
   */
  pickAttackVoice(roll = null) {
    const list = this.attackVoices();
    if (!list.length) return null;
    const pool = list.length > 1 ? list.filter((v) => v.id !== this.lastAttackVoiceId) : list;
    const i = Number.isFinite(roll) ? Math.abs(Math.floor(roll)) % pool.length : Math.floor(Math.random() * pool.length);
    const v = pool[i];
    this.lastAttackVoiceId = v.id;
    return v;
  }

  /** 手番キャラの性能を投球へ反映(タイプ補正)。攻撃・防御の数値は各ステートが turn.current.chara から読む */
  applyCharacter(p) {
    this.player.thrower.mods = throwModifiers(p.chara);   // タイプの球速 + CURVE / CONTROL ステータス + アビリティ
    this.ball.setStyle(p.color, this.turn.tierLevel);
  }

  /** 難易度を選ぶ(Config.runtime へ反映。Heart Capacity は prepareStage で掛ける) */
  setDifficulty(id) {
    const D = difficultyData(id);
    this.difficulty = D.id;
    Object.assign(Config.runtime, { difficulty: D.id, returnSpeed: D.returnSpeed, gateSize: D.gateSize, damageTaken: D.damageTaken ?? 1 });
    this.container.dataset.diff = D.id;
    const badge = document.getElementById('diffBadge');
    if (badge) { badge.textContent = D.label; badge.style.setProperty('--dc', D.color); }
    return D;
  }

  /** GAME START:party は先頭キャラ(A)→B→C→D の順 */
  startStage(stage, party, { openingSec = null } = {}) {
    this.router.go('game');   // FLOW:Game 中は Bottom Navigation を出さない
    // バトル BGM(SOLO / MULTI 共通)。再戦でも最初から。画面を離れたら App.onRoute が止める
    safe('AUDIO', () => { this.audio.unlock(); this.audio.startBgm(battleSlot(this.difficulty), { restart: true }); });
    this.setDifficulty(this.difficulty);   // 調整パネルでの変更もここで反映
    // 攻略の内容:お店 / キャスト / SOLO・MULTI / 難易度(インゲームはこれを見る。MULTI はルームのステージ・難易度から全員同じ値)
    this.capture = { shopId: shopOfStage(stage.id)?.id ?? null, castId: heroineByStage(stage.id)?.id ?? null, stageId: stage.id, mode: this.online ? 'multi' : 'solo', difficulty: this.difficulty };
    Log.info('STAGE', `start ${JSON.stringify(this.capture)}`);
    this.prepareStage(stage);
    // ボスの攻撃ボイス:前のバトルのボイスを止め、このステージのボイスを先読み(最初の反撃で待たない)
    this.lastAttackVoiceId = null;
    this.hitMarker.clear();
    this.growthDone = false;   // このバトルの育成(クリア / 敗北)はまだ
    safe('AUDIO', () => { this.audio.voice.stop(); this.audio.voice.preload(this.attackVoices().map((v) => v.src)); });
    this.partyOrder = party;
    this.turn.reset(party);
    this.ui.buildPlayers(this.turn.players);
    this.newGame();
    this.menu.hide();
    this.applyCharacter(this.turn.current);
    this.ball.hold(this.player.holdAnchor);
    // バトル開始演出:バトル BGM(上で最初から再生)が流れる中でボス紹介 → BATTLE START → A の投球(OpeningState)
    //   MULTI はサーバーが配った長さ(全員同じ)。RETRY も新しいバトルとして同じ流れ
    this.sm.change(GameState.OPENING, { totalSec: openingSec });
  }

  retryStage() {
    if (!this.partyOrder) return this.backToMenu();
    const party = this.partyOrder.map((c) => this.progress.character(c.id));
    this.startStage(this.stage, party);
  }

  /** ゲームを終えてメニューへ(既定:攻略タブの STAGE SELECT。'home' で HOME)*/
  backToMenu(to = 'stage') {
    this.online?.leaveGame?.();   // MULTI 終了:ルームを抜けて g.online を外す(この後の SOLO に持ち越さない)
    safe('AUDIO', () => { this.audio.stopBgm(); this.audio.voice.stop(); });
    this.prepareStage(this.stage ?? STAGES[0]);
    this.sm.change(GameState.TITLE);
    // 攻略へ戻る時は、遊んだキャストの攻略画面(戻るでお店 → お店を選ぶ)
    if (to === 'stage' && this.app?.openCapture) this.app.openCapture(this.stage?.id);
    else this.router.go(to);
  }

  /**
   * 育成に入るキャラ:SOLO = 参加した4人 / MULTI = 自分が担当したキャラだけ(1〜2人。他のプレイヤーの育成データには触れない)
   */
  growthMembers() {
    if (this.online) {
      const o = this.online;
      const mine = o.myUnitIndexes().map((i) => this.partyOrder?.[i]).filter((c) => c && !c.remote && this.progress.isOwned(c.id));
      return [...new Set(mine.map((c) => c.id))];
    }
    return (this.partyOrder ?? []).map((c) => c.id).filter((id) => this.progress.isOwned(id));
  }

  /** 1回のバトルの育成(親密度 EXP + STAMINA)。クリア / 敗北で1度だけ */
  battleGrowth(result) {
    if (this.growthDone) return null;
    this.growthDone = true;
    return this.progress.battleRewards(result, this.difficulty, this.growthMembers());
  }

  /** クリア報酬のプレゼント(確率は GrowthData.CLEAR_PRESENT。GIFTS の drop の重みで1つ)*/
  rollClearPresent() {
    const C = CLEAR_PRESENT, chance = C.chance[this.difficulty] ?? 0;
    const out = [];
    for (let k = 0; k < C.count; k++) {
      if (Math.random() >= chance) continue;
      const pool = GIFTS.filter((g) => g.drop?.enabled !== false);
      const total = pool.reduce((a, g) => a + (Number.isFinite(g.drop?.weight) ? g.drop.weight : 1), 0);
      let r = Math.random() * total, pick = pool[0];
      for (const g of pool) { r -= Number.isFinite(g.drop?.weight) ? g.drop.weight : 1; if (r <= 0) { pick = g; break; } }
      if (pick && this.progress.addItem(pick.id, 1)) out.push(pick.id);
    }
    return out;
  }

  /** クリア:記録 → 参加した味方に親密度 EXP / STAMINA 消費 → プレゼント → RESULT 画面 */
  onStageClear(stats) {
    const stage = this.stage;
    const D = difficultyData(this.difficulty);
    const s = this.stats;
    const record = this.progress.markCleared(stage.id, D.id, { maxRally: this.turn.maxRally, maxGateChain: s.maxGateChain, bestHit: s.bestHit });
    const growth = this.battleGrowth('clear') ?? [];
    const presents = this.rollClearPresent();
    this.lastResult = { stage, growth, presents, stats, difficulty: D, record };
    this.router.go('result', { res: this.lastResult });
  }

  /** 敗北:参加した味方に親密度 EXP(少し)/ STAMINA 消費 */
  onStageDefeat() { return this.battleGrowth('defeat') ?? []; }

  /** 調整パネルの「再スタート」:プレイ中なら同じステージをやり直し */
  restart() {
    if (this.sm.is(GameState.TITLE) || !this.partyOrder) return this.backToMenu();
    this.retryStage();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.viewport.w = w; this.viewport.h = h;
    this.renderer.setSize(w, h, false);
    this.cam.setAspect(w / h);
  }

  /** ヒットストップ(実時間秒)。この間ゲーム時間は止まるがカメラシェイクは動く */
  hitstop(sec) { this.hitstopLeft = Math.max(this.hitstopLeft, sec); }
  setTimeScale(s) { this.timeScale = s; }

  /** 入力イベント時刻(performance.now)をゲーム時間に換算 */
  gameTimeAt(t) {
    const scale = this.hitstopLeft > 0 ? 0 : this.timeScale;
    return this.clock + ((t - this.lastFrame) / 1000) * scale;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const realDt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    let dt = this.paused ? 0 : realDt * this.timeScale;
    if (this.hitstopLeft > 0) { this.hitstopLeft -= realDt; dt = 0; }
    this.clock += dt;

    this.sm.update(dt);
    this.online?.update?.();
    this.boss.update(dt);
    this.ball.update(dt);
    if (this.energy.collecting && (this.ball.mode === 'flying' || this.ball.mode === 'flown')) this.energy.check(this.ball.prev, this.ball.pos);
    if (this.space.collecting && (this.ball.mode === 'flying' || this.ball.mode === 'flown')) this.space.check(this.ball.prev, this.ball.pos);
    this.space.update(dt);
    this.affection?.update(dt);
    this.energy.update(dt);
    // SPECIAL HEART:飛行中に小さなハートを撒く
    if (this.ball.special && this.ball.mode === 'flying' && dt > 0) {
      this.heartTrailT = (this.heartTrailT ?? 0) - dt;
      if (this.heartTrailT <= 0) { this.heartTrailT = Config.special.trailHearts; this.effects.heartBurst(this.ball.pos, 2, 1.4, 0.22); }
    }
    this.specialFx.update(dt, realDt);
    this.effects.update(dt);
    this.hitMarker.update();
    this.arena.update(dt, this.clock);
    this.cam.update(realDt);
    this.ui.update(realDt);
    if (this.colliderLabelsOn) this.ui.updateColliderLabels(this.boss, this.player);
    // HOME / ガチャ / メニュー等の不透明な画面の間は 3D を描かない(スマホの負荷を下げる)
    if (!this.container.classList.contains('app-opaque')) this.renderer.render(this.scene, this.cam.camera);
  }
}
