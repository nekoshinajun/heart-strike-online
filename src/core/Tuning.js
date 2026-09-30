import { Config, bossProfile } from './Config.js';
import { CHARACTERS, characterById } from '../data/GameData.js';

/**
 * 調整パネル(Unity の Inspector 相当)に出す項目の定義。
 * path は Config からのドットパス。値はブラウザごとに保存され、次回起動時も反映される。
 * apply: 'restart' の項目は次のゲーム開始時に反映。
 */
export const TUNING_SCHEMA = [
  { group: '投球' },
  { path: 'power.maxSpeed', label: 'ThrowPower(最大初速)', min: 20, max: 60, step: 0.5 },
  { path: 'power.minSpeed', label: '最小初速(Power 0%)', min: 8, max: 30, step: 0.5 },
  { path: 'power.chargeThreshold', label: 'PowerChargeThreshold(px)', min: 4, max: 60, step: 1 },
  { path: 'power.maxChargeDistanceRatio', label: 'MaxChargeDistance(画面高さ比)', min: 0.08, max: 0.4, step: 0.005 },
  { path: 'power.minThrowPower', label: 'MinThrowPower(引かずに投げた時)', min: 0.1, max: 0.8, step: 0.01 },
  { path: 'power.heartAtMin', label: 'HEART倍率(最低POWER)', min: 0.3, max: 1.5, step: 0.05 },
  { path: 'power.heartAtMax', label: 'HEART倍率(POWER 100%)', min: 1, max: 3, step: 0.05 },
  { path: 'aim.gain', label: 'Aim感度(長さ→高さ)', min: 0.5, max: 3, step: 0.05 },
  { path: 'throw.gravity', label: 'Gravity', min: 10, max: 60, step: 1 },
  { group: 'カーブ' },
  { path: 'curve.enableCurveBall', label: 'カーブ有効', type: 'bool' },
  { path: 'curve.shift', label: 'CurveStrength(曲がる量)', min: 0, max: 6, step: 0.1 },
  { path: 'curve.bulge', label: 'カーブの膨らみ', min: 0, max: 3, step: 0.1 },
  { path: 'curve.spinGain', label: '軌跡→Spin感度', min: 1, max: 8, step: 0.1 },
  { group: 'HEART 50% 会話の演出 / サウンド' },
  { path: 'talk.dim', label: 'ボス以外の暗さ', min: 0, max: 0.9, step: 0.02 },
  { path: 'talk.glow', label: 'ボスの後ろの光', min: 0, max: 1, step: 0.05 },
  { path: 'talk.fadeIn', label: '暗くなる時間(秒)', min: 0.1, max: 1, step: 0.05 },
  { path: 'talk.fadeOut', label: '明るく戻る時間(秒)', min: 0.1, max: 1, step: 0.05 },
  { path: 'talk.pause', label: '静かな間(秒)', min: 0, max: 1, step: 0.05 },
  { path: 'talk.heart50TriggerDelay', label: 'Heart50TriggerDelay(命中→暗転 秒)', min: 0, max: 1, step: 0.05 },
  { path: 'talk.hitSlow', label: '50% 命中の瞬間のゲーム速度', min: 0.05, max: 1, step: 0.05 },
  { path: 'audio.bgm', label: 'BGM', type: 'bool' },
  { path: 'audio.bgmVolume', label: 'BGM 音量', min: 0, max: 1, step: 0.05 },
  { path: 'audio.talkBgmLevel', label: '会話中の BGM(通常=1)', min: 0, max: 1, step: 0.05 },
  { path: 'audio.dokunVolume', label: '心音の音量', min: 0, max: 2, step: 0.05 },
  { group: 'FEVER TIME' },
  { path: 'fever.gain.PERFECT', label: 'FeverGaugeGainPerfect(%)', min: 0, max: 50, step: 1 },
  { path: 'fever.gain.GREAT', label: 'FeverGaugeGainGreat(%)', min: 0, max: 50, step: 1 },
  { path: 'fever.gain.GOOD', label: 'FeverGaugeGainGood(%)', min: 0, max: 50, step: 1 },
  { path: 'fever.heartMul.0', label: 'FeverHeartMultiplierLv1', min: 1, max: 5, step: 0.1 },
  { path: 'fever.heartMul.1', label: 'FeverHeartMultiplierLv2', min: 1, max: 5, step: 0.1 },
  { path: 'fever.heartMul.2', label: 'FeverHeartMultiplierLvMax', min: 1, max: 6, step: 0.1 },
  { path: 'fever.energyCountMultiplier', label: 'FeverEnergyCountMultiplier', min: 0.3, max: 2, step: 0.05 },
  { path: 'fever.energyPatternScale', label: 'EnergyPatternScale', min: 0.3, max: 2, step: 0.05 },
  { path: 'fever.introDuration', label: 'FeverIntroDuration(秒)', min: 0.3, max: 1.5, step: 0.05 },
  { path: 'fever.outroDuration', label: 'FeverOutroDuration(秒)', min: 0.2, max: 1.2, step: 0.05 },
  { path: 'fever.slowMotionScale', label: 'FeverSlowMotionScale', min: 0, max: 1, step: 0.05 },
  { path: 'fever.throwsPerActivation', label: 'FeverThrowsPerActivation', min: 1, max: 8, step: 1 },
  { path: 'fever.missLevelDown', label: 'MISS で FEVER LEVEL を下げる', type: 'bool' },
  { group: 'ハート玉の待機位置' },
  { path: 'ball.idlePositionY', label: 'HeartBallIdlePositionY(画面比)', min: 0.4, max: 0.85, step: 0.01 },
  { path: 'ball.idleMinChargeSpace', label: '下の操作空間(画面比)', min: 0.1, max: 0.45, step: 0.01 },
  { group: 'エネルギー / 必殺技' },
  { path: 'energy.orbValue', label: 'OrbValue', min: 1, max: 50, step: 1 },
  { path: 'energy.max', label: 'Energy最大値', min: 20, max: 300, step: 10 },
  { path: 'special.heartMul', label: 'SPECIAL HEART 倍率', min: 1, max: 6, step: 0.5 },
  { path: 'special.ballScale', label: 'SPECIAL ハート玉の大きさ', min: 1, max: 3, step: 0.05 },
  { path: 'special.cutIn.enabled', label: 'カットイン表示', type: 'bool' },
  { path: 'special.cutIn.duration', label: 'カットイン時間(実秒)', min: 0.3, max: 1.2, step: 0.02 },
  { path: 'special.cutIn.timeScale', label: 'カットイン中の TimeScale', min: 0, max: 1, step: 0.05 },
  { path: 'special.cutIn.dim', label: 'カットイン 背景の暗さ', min: 0, max: 0.9, step: 0.05 },
  ...[0, 1, 2, 3, 4].map((i) => ({ path: `energy.throwBonus.${i}`, label: `1投で Energy ${i}${i === 4 ? '個以上' : '個'} の倍率`, min: 1, max: 4, step: 0.05 })),
  { group: '返球' },
  { path: 'returnBall.baseDuration', label: 'ReturnSpeed(秒)', min: 0.6, max: 2.5, step: 0.05 },
  { path: 'profile.returnSpeed', label: 'ボス返球速度倍率', min: 0.5, max: 2, step: 0.05 },
  { path: 'profile.returnPower', label: 'ReturnPower', min: 0, max: 60, step: 1 },
  { path: 'profile.curveChance', label: 'カーブ返球率', min: 0, max: 1, step: 0.05 },
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
  { path: 'partHeart.loveSpotMul', label: 'LOVE SPOT 倍率', min: 1, max: 3, step: 0.1 },
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
  { group: 'キャラクター性能 / 属性' },
  { path: 'battle.atkBase', label: 'ATK基準(ATK÷この値=倍率)', min: 20, max: 200, step: 5 },
  { path: 'battle.defBase', label: 'DEF基準(大きいほど痛い)', min: 20, max: 300, step: 5 },
  { path: 'battle.attributeMul.advantage', label: '属性 有利倍率', min: 1, max: 3, step: 0.05 },
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
