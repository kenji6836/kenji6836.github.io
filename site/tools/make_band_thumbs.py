#!/usr/bin/env python3
"""帯（トップと一覧の流れる画面）の画像を、表示に足りる大きさまで縮めた写しを作る。

帯は最大でも高さ 320px でしか表示しないのに、元の画像は 1600x900 などの原寸。
先読みする 9 枚だけで 1.29MB あり、スマホの初回表示を重くしていた（2026-09-23 実測）。

出力: /assets/band/<元のパスを - でつないだ名前>.jpg（高さ 640px・品質 72・プログレッシブ）
build.py の band_thumb() が、この写しが元より新しければ自動で使う。無ければ元の画像のまま。

使い方: python3 site/tools/make_band_thumbs.py [--check]
Pillow が要る（build.py 本体は標準ライブラリだけで動く）。
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import build  # noqa: E402

HEIGHT = build.BAND_THUMB_HEIGHT
QUALITY = 72
OUT_DIR = build.ROOT / "assets/band"


def band_sources(site):
    """トップ（hero.band）と一覧（listing.band）の帯に出る画像のパスを重複なしで返す。"""
    rows = list(site.content["hero"]["band"])
    rows += site.content.get("listing", {}).get("band") or []
    seen = {}
    for refs in rows:
        for ref in refs:
            work = site.work_by_slug[ref["work"]]
            if work.get("hidden"):
                continue
            visual = site.pick_visual(work, ref if "visual" in ref else None)
            seen[visual["src"]] = None
    return list(seen)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="作らずに、古い・足りない写しの一覧だけ出す")
    args = parser.parse_args()

    content = build.json.loads((build.SOURCE / "content.json").read_text(encoding="utf-8"))
    sources = band_sources(build.Site(content))

    stale, made, skipped = [], [], []
    for src in sources:
        original = build.ROOT / src.lstrip("/")
        if not original.is_file():
            print("元の画像がない: " + src, file=sys.stderr)
            return 1
        _, height = build.image_size(src)
        if height <= HEIGHT:
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
            width = round(picture.width * HEIGHT / picture.height)
            small = picture.convert("RGB").resize((width, HEIGHT), Image.LANCZOS)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        small.save(thumb, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        made.append((src, original.stat().st_size, thumb.stat().st_size))

    if args.check:
        if stale:
            print("写しが古い・足りない: " + ", ".join(stale))
            return 1
        print("帯の写しはすべて最新（{} 枚・元が小さい {} 枚はそのまま）。".format(len(sources) - len(skipped), len(skipped)))
        return 0

    for src, before, after in made:
        print("{:>8.1f} KB → {:>6.1f} KB  {}".format(before / 1024, after / 1024, src))
    print("{} 枚作成・{} 枚は最新のまま・{} 枚は元が小さいので写し無し。".format(
        len(made), len(sources) - len(skipped) - len(made), len(skipped)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
