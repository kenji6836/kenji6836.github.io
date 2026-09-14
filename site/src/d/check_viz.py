#!/usr/bin/env python3
"""check_viz.py — レーン D の自前検査（/viz/ は check_site.py の対象外）。stdlib のみ。exit 0 = 合格。

検査: 生成物の存在と冪等性／外部 script・css は Google Fonts のみ／禁止語／テンプレート残骸／
      本文の数字がデータの再計算と一致／表の行数／リンク先の実在（内部）と外部リンクの rel=noopener／
      サイズ上限（css ≤ 40KB・js ≤ 40KB・index ≤ 200KB・data.js ≤ 130KB）／noscript と出典文言の存在
"""
import json, os, re, subprocess, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VIZ = os.path.join(ROOT, "viz")
errors = []


def err(msg):
    errors.append(msg)


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def main():
    idx = os.path.join(VIZ, "index.html")
    for p in (idx, os.path.join(VIZ, "viz.css"), os.path.join(VIZ, "viz.js"), os.path.join(VIZ, "data", "data.js"), os.path.join(VIZ, "data", "data.json")):
        if not os.path.exists(p):
            err("missing " + p)
    if errors:
        return
    # 冪等性: 再生成して一致
    before = hashlib.sha1(open(idx, "rb").read()).hexdigest()
    subprocess.run([sys.executable, os.path.join(HERE, "build_viz.py")], check=True, capture_output=True)
    after = hashlib.sha1(open(idx, "rb").read()).hexdigest()
    if before != after:
        err("build_viz.py は決定的でない（再生成で差分）")
    html = read(idx)
    d = json.load(open(os.path.join(VIZ, "data", "data.json"), encoding="utf-8"))
    # 外部リソース
    for m in re.finditer(r'<(script|link)[^>]+(?:src|href)="(https?://[^"]+)"', html):
        if 'rel="canonical"' in m.group(0):
            continue
        if not (m.group(2).startswith("https://fonts.googleapis.com") or m.group(2).startswith("https://fonts.gstatic.com")):
            err("外部リソース禁止: " + m.group(2))
    if "<img" in html:
        err("画像は使わない（SVG/Canvas のみ）")
    # 禁止語・残骸
    for w in ("副業", "会社員", "想定案件", "モック", "準備中", "Lorem", "TODO", "{{", "}}"):
        if w in html:
            err("禁止語/残骸: " + w)
    # 数字の再計算一致
    yh, yp, nh, np_ = d["years_h"], d["years_p"], d["national_h"], d["national_p"]
    i00, i24 = yh.index(2000), yh.index(2024)
    hero = f"{int(nh[-1]):,}"; peak = f"{int(max(nh)):,}"; ratio = str(round(nh[-1] / max(nh) * 100))
    n_down = sum(1 for p in d["prefs"] if p["h"][i24] < p["h"][i00])
    n_popdown = sum(1 for p in d["prefs"] if p["p"][-1] < p["p"][0])
    kuma = next(p for p in d["prefs"] if p["code"] == "43")
    kuma_h = f"{(kuma['h'][i24] / kuma['h'][i00] - 1) * 100:.1f}"
    nat_rate = f"{nh[i24] / np_[-1] * 1000:.1f}"
    for label, needle in (("ヒーロー戸数", hero), ("ピーク", peak), ("比率 %", f'>{ratio}<span>%'), ("減った県", f">{n_down}</strong>"), ("人口減の県", f"{n_popdown} 都道府県"), ("熊本 +", f"+{kuma_h}"), ("全国 千人あたり", f">{nat_rate}</strong>")):
        if needle not in html:
            err(f"本文の数字がデータと不一致: {label} = {needle}")
    # 表
    if html.count('<tr data-row="') != 47:
        err("表の行数が 47 でない")
    if html.count('class="pref-shape') != 47:
        err("探索地図の path が 47 でない")
    if "<noscript>" not in html or "JavaScript が無効" not in html:
        err("noscript の静的図がない")
    for credit in (d["sources"]["credit_estat"], d["sources"]["credit_map"]):
        if credit.replace("&", "&amp;") not in html and credit not in html:
            err("出典文言がない: " + credit[:30])
    if "自主制作" not in html:
        err("自主制作の表記がない")
    # リンク
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>', html):
        tag, href = m.group(0), m.group(1)
        if href.startswith("http"):
            if 'target="_blank"' in tag and 'rel="noopener"' not in tag:
                err("外部リンクに noopener がない: " + href)
        elif href.startswith("#"):
            if f'id="{href[1:]}"' not in html:
                err("アンカー先がない: " + href)
        elif href.startswith("/"):
            local = os.path.join(ROOT, href.strip("/").split("?")[0])
            if href != "/" and not (os.path.exists(local) or os.path.exists(os.path.join(local, "index.html"))):
                err("内部リンク先がない: " + href)
    # サイズ
    limits = {"viz.css": 40000, "viz.js": 40000, "index.html": 200000, os.path.join("data", "data.js"): 130000}
    for name, lim in limits.items():
        size = os.path.getsize(os.path.join(VIZ, name))
        if size > lim:
            err(f"{name} が上限超過: {size} > {lim}")
    # 必須 CSS 機能
    css = read(os.path.join(VIZ, "viz.css"))
    for need in ("prefers-color-scheme: dark", "prefers-reduced-motion: reduce", "@media (max-width: 700px)"):
        if need not in css:
            err("CSS に必須機能がない: " + need)
    # JS 構文
    if subprocess.run(["node", "--check", os.path.join(VIZ, "viz.js")], capture_output=True).returncode != 0:
        err("viz.js の構文エラー")


if __name__ == "__main__":
    main()
    if errors:
        print("\n".join("NG " + e for e in errors)); sys.exit(1)
    print("check_viz: OK")
