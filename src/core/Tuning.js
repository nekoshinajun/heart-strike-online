import { Config, bossProfile } from './Config.js';
import { CHARACTERS, characterById } from '../data/GameData.js';

/**
 * 調整パネル(Unity の Inspector 相当)に出す項目の定義。
 * path は Config からのドットパス。値はブラウザごとに保存され、次回起動時も反映される。
 * apply: 'restart' の項目は次のゲーム開始時に反映。
 */
export const TUNING_SCHEMA = [
  { group: '投球(Pokémon GO 型)' },
  { path: 'throwInput.weakSpeed', label: '強さ 0 のフリックの速さ(画面高さ/秒)', min: 0.2, max: 2, step: 0.05 },
  { path: 'throwInput.strongSpeed', label: '強さ 1 のフリックの速さ(画面高さ/秒)', min: 1.5, max: 6, step: 0.1 },
  { path: 'throwInput.minVelocity', label: '強さ 0 の水平の初速', min: 4, max: 24, step: 0.1 },
  { path: 'throwInput.maxVelocity', label: '強さ 1 の水平の初速', min: 12, max: 60, step: 0.1 },
  { path: 'throwInput.launchDeg', label: '発射角(°)', min: 25, max: 70, step: 1 },
  { path: 'throwInput.yawGain', label: '斜めに弾いた時の左右の効き', min: 0.2, max: 1.2, step: 0.05 },
  { path: 'throwInput.releaseWindowMs', label: 'リリース方向を測る区間(ms)', min: 40, max: 200, step: 5 },
  { path: 'throw.gravity', label: 'Gravity', min: 10, max: 120, step: 1 },
  { group: 'カーブ' },
  { path: 'throwInput.fullTurnDeg', label: '最大カーブの回転量(°)', min: 360, max: 1800, step: 30 },
  { path: 'throwInput.deadDeg', label: 'ストレートとみなす回転(°)', min: 0, max: 90, step: 5 },
  { path: 'curve.shift', label: 'CurveStrength(曲がる量)', min: 0, max: 6, step: 0.1 },
  { path: 'curve.bulge', label: 'カーブの膨らみ', min: 0, max: 3, step: 0.1 },
  { path: 'hitMark.life', label: '着弾マーク 表示時間(秒)', min: 0.3, max: 3, step: 0.05 },
  { path: 'hitMark.size', label: '着弾マーク 大きさ', min: 0.3, max: 3, step: 0.05 },
  { group: 'HEART 50% 会話の演出 / サウンド' },
  { path: 'audio.bgm', label: 'BGM', type: 'bool' },
  { path: 'audio.bgmVolume', label: 'BGM 音量', min: 0, max: 1, step: 0.05 },
  { path: 'audio.dokunVolume', label: '心音の音量', min: 0, max: 2, step: 0.05 },
  { group: 'FEVER TIME' },
  { path: 'fever.comboGain.0.gain', label: 'FEVER +%(1 COMBO〜)', min: 0, max: 40, step: 1 },
  { path: 'fever.comboGain.1.gain', label: 'FEVER +%(3 COMBO〜)', min: 0, max: 40, step: 1 },
  { path: 'fever.comboGain.2.gain', label: 'FEVER +%(6 COMBO〜)', min: 0, max: 40, step: 1 },
  { path: 'fever.comboGain.3.gain', label: 'FEVER +%(9 COMBO〜)', min: 0, max: 40, step: 1 },
  { path: 'fever.energyCountMultiplier', label: 'FeverEnergyCountMultiplier', min: 0.3, max: 2, step: 0.05 },
  { path: 'fever.energyPatternScale', label: 'EnergyPatternScale', min: 0.3, max: 2, step: 0.05 },
  { path: 'fever.introDuration', label: 'FeverIntroDuration(秒)', min: 0.3, max: 1.5, step: 0.05 },
  { path: 'fever.outroDuration', label: 'FeverOutroDuration(秒)', min: 0.2, max: 1.2, step: 0.05 },
  { path: 'fever.slowMotionScale', label: 'FeverSlowMotionScale', min: 0, max: 1, step: 0.05 },
  { path: 'fever.throwsPerActivation', label: 'FeverThrowsPerActivation', min: 1, max: 8, step: 1 },
  { group: 'ハート玉の待機位置' },
  { path: 'ball.idlePositionY', label: 'ハートの待機位置(画面比)', min: 0.5, max: 0.9, step: 0.01 },
  { path: 'ball.idleMinBottomSpace', label: 'ハートの下の余白(画面比)', min: 0.02, max: 0.3, step: 0.01 },
  { group: 'エネルギー / 必殺技' },
  { path: 'energy.orbValue', label: 'Diamond 1個の SPECIAL(%)', min: 1, max: 50, step: 1 },
  { path: 'energy.max', label: 'SPECIAL ゲージ最大値', min: 20, max: 300, step: 10 },
  { path: 'special.heartMul', label: 'SPECIAL HEART 倍率', min: 1, max: 6, step: 0.5 },
  { path: 'special.ballScale', label: 'SPECIAL ハート玉の大きさ', min: 1, max: 3, step: 0.05 },
  { path: 'special.cutIn.enabled', label: 'カットイン表示', type: 'bool' },
  { path: 'special.cutIn.duration', label: 'カットイン時間(実秒)', min: 0.3, max: 1.2, step: 0.02 },
  { path: 'special.cutIn.timeScale', label: 'カットイン中の TimeScale', min: 0, max: 1, step: 0.05 },
  { path: 'special.cutIn.dim', label: 'カットイン 背景の暗さ', min: 0, max: 0.9, step: 0.05 },
  { group: '返球' },
  { path: 'returnBall.baseDuration', label: 'ReturnSpeed(秒)', min: 0.6, max: 2.5, step: 0.05 },
  { path: 'profile.returnSpeed', label: 'ボス返球速度倍率', min: 0.5, max: 2, step: 0.05 },
  { path: 'profile.returnPower', label: 'ReturnPower', min: 0, max: 60, step: 1 },
  { path: 'profile.catchAreaSize', label: 'CatchAreaSize', min: 0.3, max: 1.3, step: 0.05 },
  { path: 'returnBall.catchArea.xMin', label: 'CatchArea X min', min: 0, max: 0.5, step: 0.01 },
  { path: 'returnBall.catchArea.xMax', label: 'CatchArea X max', min: 0.5, max: 1, step: 0.01 },
  { path: 'returnBall.catchArea.yMin', label: 'CatchArea Y min', min: 0.05, max: 0.5, step: 0.01 },
  { path: 'returnBall.catchArea.yMax', label: 'CatchArea Y max', min: 0.5, max: 0.95, step: 0.01 },
  { path: 'returnBall.avoidRepeat', label: '連続同位置を避ける', type: 'bool' },
  { path: 'returnBall.minRepeatDistance', label: '避ける距離', min: 0, max: 0.5, step: 0.01 },
  { group: 'キャッチ判定' },
  { path: 'catch.perfectTime', label: 'PerfectTiming(秒)', min: 0.02, max: 0.2, step: 0.005 },
  { path: 'catch.greatTime', label: 'GreatTiming(秒)', min: 0.04, max: 0.3, step: 0.005 },
  { path: 'catch.goodTime', label: 'GoodTiming(秒)', min: 0.08, max: 0.4, step: 0.005 },
  { path: 'catch.perfectRadius', label: 'PerfectRadius', min: 0.02, max: 0.2, step: 0.005 },
  { path: 'catch.greatRadius', label: 'GreatRadius', min: 0.04, max: 0.3, step: 0.005 },
  { path: 'catch.goodRadius', label: 'GoodRadius', min: 0.06, max: 0.4, step: 0.005 },
  { group: '部位ごとの PartHeart(次のゲームから)' },
  ...Object.keys(Config.parts).map((k) => ({
    path: `parts.${k}.maxHeart`, label: `${Config.parts[k].label} HEART`, min: 10, max: 600, step: 10, apply: 'restart',
  })),
  { path: 'partHeart.partGainRate', label: 'PartHeart 加算率', min: 0.05, max: 1, step: 0.05 },
  { group: 'カットイン(キャラごとの表示調整)' },
  ...CHARACTERS.flatMap((c) => [
    { path: `chara.${c.id}.cutIn.faceX`, label: `${c.name} 顔の位置X(画像比)`, min: 0, max: 1, step: 0.01 },
    { path: `chara.${c.id}.cutIn.faceY`, label: `${c.name} 顔の位置Y(画像比)`, min: 0, max: 1, step: 0.01 },
    { path: `chara.${c.id}.cutIn.x`, label: `${c.name} 画面X`, min: 0, max: 1, step: 0.01 },
    { path: `chara.${c.id}.cutIn.y`, label: `${c.name} 画面Y`, min: 0, max: 1, step: 0.01 },
    { path: `chara.${c.id}.cutIn.scale`, label: `${c.name} Scale`, min: 0.8, max: 4, step: 0.05 },
    { path: `chara.${c.id}.cutIn.rot`, label: `${c.name} Rotation`, min: -30, max: 30, step: 1 },
  ]),
  { group: 'キャラアイコン(顔の切り出し:PortraitPosition / PortraitScale)' },
  ...CHARACTERS.flatMap((c) => [
    { path: `chara.${c.id}.portraitFocus.x`, label: `${c.name} 顔X(画像比)`, min: 0, max: 1, step: 0.01, apply: 'restart' },
    { path: `chara.${c.id}.portraitFocus.y`, label: `${c.name} 顔Y(画像比)`, min: 0, max: 1, step: 0.01, apply: 'restart' },
    { path: `chara.${c.id}.portraitFocus.zoom`, label: `${c.name} 拡大率`, min: 1, max: 8, step: 0.1, apply: 'restart' },
  ]),
  { group: 'CHARACTER DETAIL(全身イラスト:DetailPosition / Scale / Rotation)' },
  ...CHARACTERS.flatMap((c) => [
    { path: `chara.${c.id}.detail.x`, label: `${c.name} 位置X(画面比)`, min: 0, max: 1, step: 0.01 },
    { path: `chara.${c.id}.detail.y`, label: `${c.name} 位置Y(画面比)`, min: 0, max: 1, step: 0.01 },
    { path: `chara.${c.id}.detail.scale`, label: `${c.name} Scale`, min: 0.5, max: 2, step: 0.02 },
    { path: `chara.${c.id}.detail.rot`, label: `${c.name} Rotation`, min: -20, max: 20, step: 1 },
  ]),
  { group: '与ダメージ(ATK × アビリティ × ゲート × 着弾)' },
  { path: 'landing.grades.0.within', label: 'PERFECT の幅(中央ラインからの横の距離)', min: 0.1, max: 3, step: 0.05 },
  { path: 'landing.grades.1.within', label: 'GREAT の幅', min: 0.2, max: 5, step: 0.05 },
  { path: 'landing.grades.2.within', label: 'GOOD の幅', min: 0.3, max: 8, step: 0.05 },
  { path: 'battle.attributeMul.advantage', label: '属性 有利倍率(4要素の後に掛ける別枠)', min: 1, max: 3, step: 0.05 },
  { path: 'battle.attributeMul.neutral', label: '属性 通常倍率', min: 0.5, max: 2, step: 0.05 },
  { path: 'battle.attributeMul.disadvantage', label: '属性 不利倍率', min: 0.1, max: 1, step: 0.05 },
  { path: 'battle.heartCapacityScale', label: 'Heart Capacity 倍率(全ステージ)', min: 0.1, max: 3, step: 0.05, apply: 'restart' },
  // DifficultyData(最終設定 = StageData × DifficultyData。次のゲーム開始時に反映)
  ...['NORMAL', 'HARD', 'HELL'].flatMap((d) => [
    { group: `難易度 ${d}(DifficultyData)` },
    { path: `difficulties.${d}.heartCapacity`, label: 'HeartCapacityMultiplier', min: 0.5, max: 4, step: 0.05, apply: 'restart' },
    { path: `difficulties.${d}.returnSpeed`, label: 'ReturnSpeedMultiplier', min: 0.5, max: 2, step: 0.01, apply: 'restart' },
    { path: `difficulties.${d}.damageTaken`, label: '被ダメージ倍率(GREAT/GOOD/MISS)', min: 0.5, max: 3, step: 0.05, apply: 'restart' },
    { path: `difficulties.${d}.energyDensity`, label: 'EnergyDensityMultiplier', min: 0.2, max: 2, step: 0.05 },
    { path: `difficulties.${d}.energyJitter`, label: 'Energy 配置のずれ', min: 0, max: 1, step: 0.05 },
    { path: `difficulties.${d}.gateSize`, label: 'GateSizeMultiplier', min: 0.4, max: 1.5, step: 0.02, apply: 'restart' },
    { path: `difficulties.${d}.obstacleCount`, label: 'ObstacleCountMultiplier', min: 0, max: 3, step: 0.1 },
    { path: `difficulties.${d}.extraMovers`, label: '追加の動く障害物', min: 0, max: 3, step: 1 },
    { path: `difficulties.${d}.obstacleSpeed`, label: 'ObstacleSpeedMultiplier', min: 0.5, max: 2.5, step: 0.05 },
    { path: `difficulties.${d}.highRouteWeight`, label: 'HighDifficultyRouteWeight', min: 0, max: 8, step: 0.5 },
    { path: `difficulties.${d}.exp`, label: 'ExpMultiplier', min: 0.5, max: 5, step: 0.1 },
    { path: `difficulties.${d}.locked`, label: 'ロック(将来用)', type: 'bool' },
  ]),
];

const STORAGE_KEY = 'squash-titan-tuning-v1';
const COLLIDER_KEY = 'squash-titan-colliders-v1';

function resolve(path) {
  const keys = path.split('.');
  let obj, i = 1;
  if (keys[0] === 'profile') obj = bossProfile();
  else if (keys[0] === 'chara') { obj = characterById(keys[1]); i = 2; }   // CharacterData(cutIn など)
  else obj = Config[keys[0]];
  for (; i < keys.length - 1; i++) obj = obj[keys[i]];
  return { obj, key: keys[keys.length - 1] };
}

export function getValue(path) { const { obj, key } = resolve(path); return obj[key]; }

export function setValue(path, value, persist = true) {
  const { obj, key } = resolve(path);
  obj[key] = value;
  if (persist) save();
}

// 既定値を保持(リセット用)
const DEFAULTS = {};
for (const item of TUNING_SCHEMA) if (item.path) DEFAULTS[item.path] = getValue(item.path);

export function currentOverrides() {
  const out = {};
  for (const p in DEFAULTS) if (getValue(p) !== DEFAULTS[p]) out[p] = getValue(p);
  return out;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentOverrides())); } catch { /* 保存不可の環境では無視 */ }
}

/** 起動時に保存済みの調整値を反映 */
export function loadTuning() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { saved = {}; }
  for (const p in saved) if (p in DEFAULTS) setValue(p, saved[p], false);
  loadColliders();
}

/** Colliderレイアウト・画像表示サイズの保存/読込(キャラ画像ごとの調整結果を残す) */
export function saveColliders() {
  try { localStorage.setItem(COLLIDER_KEY, JSON.stringify({ layouts: Config.colliderLayouts, bossImage: Config.bossImage })); } catch { /* noop */ }
}
function loadColliders() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(COLLIDER_KEY) || 'null'); } catch { saved = null; }
  if (!saved) return;
  for (const [name, layout] of Object.entries(saved.layouts || {})) {
    if (!Config.colliderLayouts[name]) Config.colliderLayouts[name] = {};
    for (const [part, d] of Object.entries(layout)) Config.colliderLayouts[name][part] = { ...Config.colliderLayouts[name][part], ...d };
  }
  for (const [k, v] of Object.entries(saved.bossImage || {})) if (v && typeof v === 'object') Config.bossImage[k] = { ...Config.bossImage[k], ...v };
}
const COLLIDER_DEFAULTS = JSON.parse(JSON.stringify({ layouts: Config.colliderLayouts, bossImage: Config.bossImage }));
export function resetColliders(layoutName) {
  Config.colliderLayouts[layoutName] = JSON.parse(JSON.stringify(COLLIDER_DEFAULTS.layouts[layoutName]));
  saveColliders();
}

export function resetTuning() {
  for (const p in DEFAULTS) setValue(p, DEFAULTS[p], false);
  save();
}
