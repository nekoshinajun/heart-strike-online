# assets/ の画像を data URI として JS モジュールに埋め込む(単一HTML配布のため)
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def emit(out, const, names, comment):
    lines = []
    for key, fn in names.items():
        b64 = base64.b64encode((root / 'assets' / fn).read_bytes()).decode()
        lines.append(f"  {key}: 'data:image/webp;base64,{b64}',")
    (root / 'src' / 'assets' / out).write_text(
        f"// 自動生成(tools/embed_assets.py)。直接編集しない。{comment}\n"
        f"export const {const} = {{\n" + "\n".join(lines) + "\n};\n")

emit('bossImages.js', 'BOSS_IMAGES', {'demon': 'boss_demon.webp', 'siren': 'boss_siren.webp', 'milk': 'boss_milk.webp', 'rato': 'boss_rato.webp'}, '')
# 味方キャラ画像:キー = CharacterData.art の値。追加はここに1行足す(assets/chara_<key>.webp)
CHARA = ['minamo', 'hinoka', 'raimu', 'shizuku', 'akane', 'yoruna', 'sera']
# 全身の切り抜き(アルファ付き・HOME / ガチャ Reveal 用)= assets/cut_<key>.webp(tools/cutout.py で生成、本番素材に差し替え可)
names = {k: f'chara_{k}.webp' for k in CHARA}
names.update({f'{k}_cut': f'cut_{k}.webp' for k in CHARA if (root / 'assets' / f'cut_{k}.webp').exists()})
emit('charaImages.js', 'CHARA_IMAGES', names, ' キー = CharacterData.art の値')
# 雑魚(Minion)の画像:キー = data/MinionData.js の image の値(assets/minion_<key>.webp・アルファ付き)。追加はここに1行足す
emit('minionImages.js', 'MINION_IMAGES', {'devil': 'minion_devil.webp', 'angel': 'minion_angel.webp'}, ' キー = MinionData の image の値')
