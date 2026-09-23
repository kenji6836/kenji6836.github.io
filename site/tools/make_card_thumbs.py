#!/usr/bin/env python3
"""カード（5 分類タイル・つくったもの・作品一覧）の画像を、表示に足りる大きさまで縮めた写しを作る。

カードの画像は画面のどこでも最大 362px 幅でしか出ないのに、元の画像は 1600x900 などの原寸。
トップを開くだけでカードの画像 7 枚が 928KB あり、スマホの初回表示を重くしていた（2026-09-23 実測）。

出力: /assets/card/<元のパスを - でつないだ名前>.jpg（幅 800px・品質 72・プログレッシブ）
build.py の card_thumb() が、この写しが元より新しければ自動で使う。無ければ元の画像のまま。

対象は build.py が実際に card_thumb() を通した画像（ビルドを 1 回回して集めるので、取りこぼさない）。

使い方: python3 site/tools/make_card_thumbs.py [--check]
Pillow が要る（build.py 本体は標準ライブラリだけで動く）。
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import build  # noqa: E402

WIDTH = build.CARD_THUMB_WIDTH
QUALITY = 72
OUT_DIR = build.ROOT / "assets/card"


def card_sources():
    """ビルドを 1 回回して、card_thumb() を通った元画像のパスを重複なしで返す。"""
    build.CARD_THUMB_SOURCES.clear()
    content = build.json.loads((build.SOURCE / "content.json").read_text(encoding="utf-8"))
    build.Site(content).outputs()
    return list(build.CARD_THUMB_SOURCES)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="作らずに、古い・足りない写しの一覧だけ出す")
    args = parser.parse_args()

    stale, made, skipped = [], [], []
    sources = card_sources()
    for src in sources:
        original = build.ROOT / src.lstrip("/")
        if not original.is_file():
            print("元の画像がない: " + src, file=sys.stderr)
            return 1
        width, _ = build.image_size(src)
        if width <= WIDTH:
            skipped.append(src)  # すでに小さいので写しは作らない（build.py が元をそのまま使う）
            continue
        name = src.lstrip("/")[len("assets/"):].replace("/", "-").rsplit(".", 1)[0] + ".jpg"
        thumb = OUT_DIR / name
        if thumb.is_file() and thumb.stat().st_mtime >= original.stat().st_mtime:
            continue
        stale.append(src)
        if args.check:
            continue
        from PIL import Image
        with Image.open(original) as picture:
            height = round(picture.height * WIDTH / picture.width)
            small = picture.convert("RGB").resize((WIDTH, height), Image.LANCZOS)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        small.save(thumb, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        made.append((src, original.stat().st_size, thumb.stat().st_size))

    if args.check:
        if stale:
            print("写しが古い・足りない: " + ", ".join(stale))
            return 1
        print("カードの写しはすべて最新（{} 枚・元が小さい {} 枚はそのまま）。".format(len(sources) - len(skipped), len(skipped)))
        return 0

    for src, before, after in made:
        print("{:>8.1f} KB → {:>6.1f} KB  {}".format(before / 1024, after / 1024, src))
    print("{} 枚作成・{} 枚は最新のまま・{} 枚は元が小さいので写し無し。".format(
        len(made), len(sources) - len(skipped) - len(made), len(skipped)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
