#!/bin/sh
# 公式 Live2D Cubism Web Framework を1ファイルの ES Module(src/lib/live2d/CubismWebFramework.js)にまとめ直す。
#   シェーダー(Shaders/WebGL)は public/Live2D/Framework/ に置く(実行時に fetch される)
#   Cubism Core(public/Live2D/live2dcubismcore.min.js)は公式 SDK から手で置く(このスクリプトでは取得しない)
# 使い方:sh tools/build_cubism_framework.sh [タグ or ブランチ(既定 5-r.5)]
set -eu
REF="${1:-5-r.5}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
git clone -q --depth 1 --branch "$REF" https://github.com/Live2D/CubismWebFramework.git "$WORK/fw"
SHA="$(git -C "$WORK/fw" rev-parse --short HEAD)"
cat > "$WORK/entry.ts" <<'TS'
export { CubismFramework, Option, LogLevel } from './fw/src/live2dcubismframework';
export { CubismUserModel } from './fw/src/model/cubismusermodel';
export { CubismModelSettingJson } from './fw/src/cubismmodelsettingjson';
export { CubismMatrix44 } from './fw/src/math/cubismmatrix44';
export { CubismShaderManager_WebGL } from './fw/src/rendering/cubismshader_webgl';
TS
(cd "$WORK" && npm init -y >/dev/null && npm i -s esbuild >/dev/null && npx esbuild entry.ts --bundle --format=esm --target=es2020 --minify --legal-comments=none \
  --banner:js="/**
 * Live2D Cubism Web Framework $REF (https://github.com/Live2D/CubismWebFramework @ $SHA)
 * Copyright(c) Live2D Inc. All rights reserved.
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 *
 * 公式リポジトリの src/ を esbuild で1ファイルの ES Module にまとめたもの(コードの改変なし)。直接編集しない。
 * 作り直し:tools/build_cubism_framework.sh
 */" --outfile="$ROOT/src/lib/live2d/CubismWebFramework.js")
mkdir -p "$ROOT/public/Live2D/Framework/Shaders"
rm -rf "$ROOT/public/Live2D/Framework/Shaders/WebGL"
cp -r "$WORK/fw/Shaders/WebGL" "$ROOT/public/Live2D/Framework/Shaders/WebGL"
cp "$WORK/fw/LICENSE.md" "$ROOT/public/Live2D/Framework/LICENSE.md"
rm -rf "$WORK"
echo "built Cubism Web Framework $REF ($SHA)"
