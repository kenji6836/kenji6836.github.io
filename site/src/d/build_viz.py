#!/usr/bin/env python3
"""build_viz.py — レーン D: template.html + viz/data/data.json → viz/index.html（stdlib のみ・決定的出力）。

- 数値（ヒーロー・上位 5 都府県のシェア）はデータから再計算して埋める（本文の数字を手で書かない）
- 表ビュー（47 都道府県）と JS 無効時の静的チャート（全国 75 年の折れ線 SVG）を生成
- CSS/JS/データの URL に内容ハッシュ ?v= を付ける（本体サイトの build.py と同じ流儀）
"""
import hashlib, html, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VIZ = os.path.join(ROOT, "viz")


def h8(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def fmt(n):
    return "—" if n is None else f"{int(round(n)):,}"


def fmt1(n):
    return "—" if n is None else f"{n:,.1f}"


def signed(n):
    return ("+" if n >= 0 else "−") + f"{abs(n):.1f}%"


def static_chart(d):
    ys, vs = d["years_h"], d["national_h"]
    W, H, l, r, t, b = 720, 260, 56, 16, 16, 28
    vmax = 2000000
    x = lambda i: l + (W - l - r) * i / (len(ys) - 1)
    y = lambda v: t + (H - t - b) * (1 - v / vmax)
    pts = " ".join(("M" if i == 0 else "L") + f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(vs))
    grid = "".join(f'<line x1="{l}" x2="{W-r}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#d9d6ce" stroke-width="1"/><text x="{l-6}" y="{y(v)+4:.1f}" font-size="11" text-anchor="end" fill="#6b7480">{v//10000} 万</text>' for v in (500000, 1000000, 1500000, 2000000))
    ticks = "".join(f'<text x="{x(ys.index(yr)):.1f}" y="{H-8}" font-size="11" text-anchor="middle" fill="#6b7480">{yr}</text>' for yr in (1951, 1973, 1990, 2009, 2025))
    return (f'<figure><svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="全国の新設住宅着工戸数 1951–2025">{grid}{ticks}'
            f'<path d="{pts}" fill="none" stroke="#2457e6" stroke-width="2" stroke-linejoin="round"/></svg>'
            f'<figcaption>全国の新設住宅着工戸数（1951–2025・年計）。1973 年 {fmt(max(vs))} 戸 → 2025 年 {fmt(vs[-1])} 戸。JavaScript が無効のため静的表示。</figcaption></figure>')


def table(d):
    yh, yp = d["years_h"], d["years_p"]
    i00, i24, i25 = yh.index(2000), yh.index(2024), yh.index(2025)
    rows = []
    for p in d["prefs"]:
        pop00, pop24 = p["p"][0], p["p"][-1]
        rate24 = p["h"][i24] / pop24 * 1000
        rows.append((p["code"], p["name"], p["h"][i00], p["h"][i24], p["h"][i25], (p["h"][i24] / p["h"][i00] - 1) * 100, pop00, pop24, (pop24 / pop00 - 1) * 100, rate24))
    head = "<tr><th>都道府県</th><th>着工 2000</th><th>着工 2024</th><th>着工 2025</th><th>着工 変化 00→24</th><th>人口 2000（千人）</th><th>人口 2024（千人）</th><th>人口 変化 00→24</th><th>1,000 人あたり 2024</th></tr>"
    body = "".join(f"<tr><td>{html.escape(n)}</td><td class=\"num\">{fmt(a)}</td><td class=\"num\">{fmt(b)}</td><td class=\"num\">{fmt(c)}</td><td class=\"num\">{signed(dv)}</td><td class=\"num\">{fmt(p0/1000)}</td><td class=\"num\">{fmt(p1/1000)}</td><td class=\"num\">{signed(pc)}</td><td class=\"num\">{fmt1(r)}</td></tr>" for _, n, a, b, c, dv, p0, p1, pc, r in rows)
    nh = d["national_h"]; np_ = d["national_p"]
    tot = f"<tr><th>全国</th><td class=\"num\">{fmt(nh[i00])}</td><td class=\"num\">{fmt(nh[i24])}</td><td class=\"num\">{fmt(nh[i25])}</td><td class=\"num\">{signed((nh[i24]/nh[i00]-1)*100)}</td><td class=\"num\">{fmt(np_[0]/1000)}</td><td class=\"num\">{fmt(np_[-1]/1000)}</td><td class=\"num\">{signed((np_[-1]/np_[0]-1)*100)}</td><td class=\"num\">{fmt1(nh[i24]/np_[-1]*1000)}</td></tr>"
    return f"<table><thead>{head}</thead><tbody>{body}{tot}</tbody></table>"


def main():
    with open(os.path.join(VIZ, "data", "data.json"), encoding="utf-8") as f:
        d = json.load(f)
    with open(os.path.join(HERE, "template.html"), encoding="utf-8") as f:
        tpl = f.read()
    yh = d["years_h"]; nh = d["national_h"]
    i24 = yh.index(2024)
    top5 = sorted((p["h"][i24] for p in d["prefs"]), reverse=True)[:5]
    s = d["sources"]
    rep = {
        "{{HERO_V}}": fmt(nh[-1]), "{{HERO_YEAR}}": str(yh[-1]), "{{HERO_N}}": fmt(round(nh[-1] / 1000)),
        "{{PEAK_V}}": fmt(max(nh)), "{{TOP5_SHARE}}": f"{sum(top5) / nh[i24] * 100:.0f}",
        "{{TABLE}}": table(d), "{{STATIC_CHART}}": static_chart(d),
        "{{CREDIT_ESTAT}}": html.escape(s["credit_estat"]), "{{CREDIT_MAP}}": html.escape(s["credit_map"]),
        "{{SRC_H_PAGE}}": html.escape(s["housing"]["page"]), "{{SRC_H_FETCHED}}": html.escape(s["housing"]["fetched"]),
        "{{SRC_P_PAGE}}": html.escape(s["population"]["pages"][0]), "{{SRC_P_FETCHED}}": html.escape(s["population"]["fetched"]),
        "{{SRC_MAP_PAGE}}": html.escape(s["map"]["page"]), "{{MAP_NOTE}}": html.escape(d["map"]["note"]),
        "{{CSS_HASH}}": h8(os.path.join(VIZ, "viz.css")), "{{JS_HASH}}": h8(os.path.join(VIZ, "viz.js")), "{{DATA_HASH}}": h8(os.path.join(VIZ, "data", "data.js")),
    }
    out = tpl
    for k, v in rep.items():
        out = out.replace(k, v)
    assert "{{" not in out, "テンプレート残骸"
    with open(os.path.join(VIZ, "index.html"), "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote viz/index.html", len(out), "bytes")


if __name__ == "__main__":
    main()
