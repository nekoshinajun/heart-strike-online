/**
 * Live2D Cubism SDK for Web の起動(1回だけ)。
 *   Cubism Core(公式・live2dcubismcore.min.js)は <script> で読み込む(グローバル Live2DCubismCore)
 *   Cubism Framework(公式・src/lib/live2d/CubismWebFramework.js)は ES Module。読み込み時に Core を参照するので Core の後で import する
 *   Framework のシェーダーは public/Live2D/Framework/Shaders/WebGL/ から fetch される
 * Live2D のボスが出るステージでだけ読み込む(他のステージには影響しない)。
 */
export const CUBISM_CORE_URL = 'public/Live2D/live2dcubismcore.min.js';
export const CUBISM_SHADER_PATH = 'public/Live2D/Framework/Shaders/WebGL/';

let ready = null;

function loadCore() {
  if (globalThis.Live2DCubismCore) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CUBISM_CORE_URL;
    s.onload = () => (globalThis.Live2DCubismCore ? resolve() : reject(new Error('Live2DCubismCore not found')));
    s.onerror = () => reject(new Error(`failed to load ${CUBISM_CORE_URL}`));
    document.head.appendChild(s);
  });
}

/** Core の読み込み → Framework の import・startUp / initialize → Framework のモジュール。何度呼んでも1回だけ */
export function startCubism() {
  ready ??= loadCore().then(() => import('../lib/live2d/CubismWebFramework.js')).then((F) => {
    const { CubismFramework, Option, LogLevel } = F;
    const option = new Option();
    option.logFunction = (msg) => console.warn(msg);
    option.loggingLevel = LogLevel.LogLevel_Warning;
    CubismFramework.startUp(option);
    CubismFramework.initialize();
    return F;
  });
  return ready;
}
