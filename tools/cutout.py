# HOME / ガチャ Reveal 用の全身切り抜き(アルファ付き)を作る開発用ツール。
#   元画像 assets/chara_<key>.webp は変更しない → assets/cut_<key>.webp を出力
#   モデル:rembg の isnet-anime.onnx(アニメ絵向けセグメンテーション)。実行時に配布物へは含めない
#   本番の透過素材が用意できたら assets/cut_<key>.webp をそれに置き換えるだけでよい
#   使い方:python3 tools/cutout.py /path/to/isnet-anime.onnx minamo hinoka ...
import sys, pathlib
import numpy as np
from PIL import Image, ImageFilter
import onnxruntime as ort
root = pathlib.Path(__file__).resolve().parent.parent

def run(model, keys):
    sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
    name = sess.get_inputs()[0].name
    for k in keys:
        im = Image.open(root / 'assets' / f'chara_{k}.webp').convert('RGB')
        x = np.asarray(im.resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255.0
        x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([1.0, 1.0, 1.0], np.float32)
        x = x.transpose(2, 0, 1)[None]
        y = sess.run(None, {name: x})[0][0, 0]
        y = (y - y.min()) / max(1e-6, y.max() - y.min())
        m = Image.fromarray((y * 255).astype(np.uint8)).resize(im.size, Image.LANCZOS)
        m = m.point(lambda v: 0 if v < 24 else 255 if v > 232 else int((v - 24) * 255 / 208)).filter(ImageFilter.GaussianBlur(0.8))
        out = im.convert('RGBA'); out.putalpha(m)
        out.save(root / 'assets' / f'cut_{k}.webp', 'WEBP', quality=86, method=6)
        print('cut', k)

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2:])
