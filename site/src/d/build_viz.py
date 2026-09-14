#!/usr/bin/env python3
"""build_viz.py — レーン D: template.html + viz/data/data.json → viz/index.html（stdlib のみ・決定的出力）。

- 本文の数字（39%・減った県の数・熊本 +10.6% など）はデータから再計算して埋める（手書きしない）
- ヒーローの 75 年棒グラフ・探索用の塗り分け地図（2024 年・千人あたり）・表・noscript 用の静的図を生成
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
    return ("+" if n > 0 else "−" if n < 0 else "") + f"{abs(n):.1f}"


def seq_class(v, lo, hi):
    """viz.css の --seq-1..7 に対応するクラス名（ダークでも CSS 側で色が決まる）。"""
    t = max(0.0, min(0.9999, (v - lo) / (hi - lo)))
    return "s%d" % (int(t * 7) + 1)


def hero_bars(d):
    ys, vs = d["years_h"], d["national_h"]
    W, H, l, r, t, b = 1200, 330, 0, 0, 40, 34
    vmax = 2000000
    n = len(ys)
    bw = (W - l - r) / n
    x = lambda i: l + bw * i
    y = lambda v: t + (H - t - b) * (1 - v / vmax)
    peak = vs.index(max(vs))
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="全国の新設住宅着工戸数 1951–{ys[-1]}。1973 年 {fmt(max(vs))} 戸がピーク、{ys[-1]} 年は {fmt(vs[-1])} 戸。">']
    for v in (1000000, 2000000):
        out.append(f'<line class="chart-rule" x1="{l}" x2="{W-r}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
    for i, v in enumerate(vs):
        cls = "bar-key" if i in (peak, n - 1) else "bar-history"
        out.append(f'<rect class="{cls}" x="{x(i)+1:.1f}" y="{y(v):.1f}" width="{bw-2:.1f}" height="{H-b-y(v):.1f}"/>')
    for yr in (1951, 1970, 1990, 2010, ys[-1]):
        i = ys.index(yr)
        out.append(f'<text class="chart-tick" x="{x(i)+bw/2:.1f}" y="{H-8}" text-anchor="{"start" if i == 0 else "end" if i == n-1 else "middle"}">{yr}</text>')
    px = x(peak) + bw / 2
    out.append(f'<path class="chart-leader" d="M{px:.1f},{y(vs[peak])-6:.1f} V{t-12} H{px+14:.1f}"/>')
    out.append(f'<text class="chart-annotation" x="{px+20:.1f}" y="{t-14}">1973 年・ピーク</text>')
    out.append(f'<text class="chart-value" x="{px+20:.1f}" y="{t+8}">{fmt(vs[peak])} 戸</text>')
    lx = x(n - 1)
    out.append(f'<text class="chart-annotation latest-label" x="{lx-8:.1f}" y="{y(vs[-1])-6:.1f}" text-anchor="end">{ys[-1]} 年 {fmt(vs[-1])} 戸</text>')
    out.append("</svg>")
    return "".join(out)


def explore_map(d, i24, ip24):
    vb = d["map"]["viewBox"]
    out = [f'<svg id="explore-map" viewBox="{vb}" role="group" aria-label="都道府県の塗り分け地図">']
    for p in d["prefs"]:
        rate = p["h"][i24] / p["p"][ip24] * 1000
        out.append(f'<path class="pref-shape {seq_class(rate, 3, 12)}" data-code="{p["code"]}" d="{p["path"]}" tabindex="0" role="button" aria-pressed="false" aria-label="{html.escape(p["name"])}、2024 年、{fmt1(rate)} 戸"><title>{html.escape(p["name"])} {fmt1(rate)} 戸</title></path>')
    out.append('<g class="map-annotations">')
    for code, dx, dy in (("13", 120, -70), ("43", 110, 95)):
        p = next(q for q in d["prefs"] if q["code"] == code)
        cx, cy = p["c"]
        rate = p["h"][i24] / p["p"][ip24] * 1000
        anchor = "start" if dx > 0 else "end"
        out.append(f'<g class="map-label"><path d="M{cx:.1f},{cy:.1f} L{cx+dx*.75:.1f},{cy+dy:.1f} H{cx+dx:.1f}"/><circle cx="{cx:.1f}" cy="{cy:.1f}" r="5"/><text data-code="{code}" x="{cx+dx+(8 if dx>0 else -8):.1f}" y="{cy+dy+9:.1f}" text-anchor="{anchor}">{p["short"]} {fmt1(rate)}</text></g>')
    out.append("</g></svg>")
    return "".join(out)


def static_chart(d):
    ys, vs = d["years_h"], d["national_h"]
    W, H, l, r, t, b = 720, 260, 56, 16, 16, 28
    vmax = 2000000
    x = lambda i: l + (W - l - r) * i / (len(ys) - 1)
    y = lambda v: t + (H - t - b) * (1 - v / vmax)
    pts = " ".join(("M" if i == 0 else "L") + f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(vs))
    grid = "".join(f'<line x1="{l}" x2="{W-r}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#d9d6ce" stroke-width="1"/><text x="{l-6}" y="{y(v)+4:.1f}" font-size="11" text-anchor="end" fill="#6b7480">{v//10000} 万</text>' for v in (500000, 1000000, 1500000, 2000000))
    ticks = "".join(f'<text x="{x(ys.index(yr)):.1f}" y="{H-8}" font-size="11" text-anchor="middle" fill="#6b7480">{yr}</text>' for yr in (1951, 1973, 1990, 2009, ys[-1]))
    return (f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="全国の新設住宅着工戸数 1951–{ys[-1]}">{grid}{ticks}'
            f'<path d="{pts}" fill="none" stroke="#2457e6" stroke-width="2" stroke-linejoin="round"/></svg>'
            f'<figcaption>全国の新設住宅着工戸数（1951–{ys[-1]}・年計）。1973 年 {fmt(max(vs))} 戸 → {ys[-1]} 年 {fmt(vs[-1])} 戸。JavaScript が無効のため静的表示。都道府県別の値は末尾の表にあります。</figcaption>')


def table(d):
    yh, yp = d["years_h"], d["years_p"]
    i00, i24, i25 = yh.index(2000), yh.index(2024), yh.index(2025)
    head = "<tr><th scope=\"col\">都道府県</th><th scope=\"col\">着工 2000<br><span>戸</span></th><th scope=\"col\">着工 2024<br><span>戸</span></th><th scope=\"col\">着工 2025<br><span>戸</span></th><th scope=\"col\">着工の変化<br><span>2000→24 %</span></th><th scope=\"col\">人口 2000<br><span>千人</span></th><th scope=\"col\">人口 2024<br><span>千人</span></th><th scope=\"col\">人口の変化<br><span>2000→24 %</span></th><th scope=\"col\">1,000 人あたり<br><span>2024 戸</span></th></tr>"
    body = []
    for p in d["prefs"]:
        pop00, pop24 = p["p"][0], p["p"][-1]
        body.append(f"<tr data-row=\"{p['code']}\" data-selected=\"false\"><th scope=\"row\">{html.escape(p['name'])}</th><td>{fmt(p['h'][i00])}</td><td>{fmt(p['h'][i24])}</td><td>{fmt(p['h'][i25])}</td><td>{signed((p['h'][i24]/p['h'][i00]-1)*100)}</td><td>{fmt(pop00/1000)}</td><td>{fmt(pop24/1000)}</td><td>{signed((pop24/pop00-1)*100)}</td><td>{fmt1(p['h'][i24]/pop24*1000)}</td></tr>")
    nh, np_ = d["national_h"], d["national_p"]
    foot = f"<tr><th scope=\"row\">全国</th><td>{fmt(nh[i00])}</td><td>{fmt(nh[i24])}</td><td>{fmt(nh[i25])}</td><td>{signed((nh[i24]/nh[i00]-1)*100)}</td><td>{fmt(np_[0]/1000)}</td><td>{fmt(np_[-1]/1000)}</td><td>{signed((np_[-1]/np_[0]-1)*100)}</td><td>{fmt1(nh[i24]/np_[-1]*1000)}</td></tr>"
    return f"<table><thead>{head}</thead><tbody>{''.join(body)}</tbody><tfoot>{foot}</tfoot></table>"


def main():
    with open(os.path.join(VIZ, "data", "data.json"), encoding="utf-8") as f:
        d = json.load(f)
    with open(os.path.join(HERE, "template.html"), encoding="utf-8") as f:
        tpl = f.read()
    yh, yp, nh, np_ = d["years_h"], d["years_p"], d["national_h"], d["national_p"]
    i00, i24, ip00, ip24 = yh.index(2000), yh.index(2024), yp.index(2000), yp.index(2024)
    P = {p["code"]: p for p in d["prefs"]}
    rate = lambda p: p["h"][i24] / p["p"][ip24] * 1000
    h_chg = lambda p: (p["h"][i24] / p["h"][i00] - 1) * 100
    p_chg = lambda p: (p["p"][ip24] / p["p"][ip00] - 1) * 100
    top5 = sorted((p["h"][i24] for p in d["prefs"]), reverse=True)[:5]
    s = d["sources"]
    rep = {
        "{{HERO_V}}": fmt(nh[-1]), "{{HERO_YEAR}}": str(yh[-1]), "{{PEAK_V}}": fmt(max(nh)),
        "{{RATIO}}": str(round(nh[-1] / max(nh) * 100)),
        "{{TOP5_SHARE}}": f"{sum(top5) / nh[i24] * 100:.0f}",
        "{{N_DOWN}}": str(sum(1 for p in d["prefs"] if h_chg(p) < 0)),
        "{{N_POPDOWN}}": str(sum(1 for p in d["prefs"] if p_chg(p) < 0)),
        "{{KOCHI_H}}": fmt1(abs(h_chg(P["39"]))), "{{KUMA_H}}": fmt1(h_chg(P["43"])), "{{KUMA_P}}": fmt1(abs(p_chg(P["43"]))),
        "{{NAT_RATE}}": fmt1(nh[i24] / np_[ip24] * 1000), "{{NAT_RATE_2000}}": fmt1(nh[i00] / np_[ip00] * 1000),
        "{{TOKYO_R}}": fmt1(rate(P["13"])), "{{KUMA_R}}": fmt1(rate(P["43"])), "{{KOCHI_R}}": fmt1(rate(P["39"])), "{{AKITA_R}}": fmt1(rate(P["05"])), "{{AOMORI_R}}": fmt1(rate(P["02"])),
        "{{KUMA_H24}}": fmt(P["43"]["h"][i24]), "{{KUMA_P24}}": fmt(P["43"]["p"][ip24]),
        "{{HERO_BARS}}": hero_bars(d), "{{EXPLORE_MAP}}": explore_map(d, i24, ip24), "{{TABLE}}": table(d), "{{STATIC_CHART}}": static_chart(d),
        "{{PREF_OPTIONS}}": "".join(f'<option value="{p["code"]}"{" selected" if p["code"] == "43" else ""}>{html.escape(p["name"])}</option>' for p in d["prefs"]),
        "{{CREDIT_ESTAT}}": html.escape(s["credit_estat"]), "{{CREDIT_MAP}}": html.escape(s["credit_map"]),
        "{{SRC_H_PAGE}}": html.escape(s["housing"]["page"]), "{{SRC_H_FETCHED}}": html.escape(s["housing"]["fetched"]),
        "{{SRC_P_PAGE}}": html.escape(s["population"]["pages"][0]), "{{SRC_P_FETCHED}}": html.escape(s["population"]["fetched"]),
        "{{SRC_MAP_PAGE}}": html.escape(s["map"]["page"]), "{{MAP_NOTE}}": html.escape(d["map"]["note"]),
        "{{CSS_HASH}}": h8(os.path.join(VIZ, "viz.css")), "{{JS_HASH}}": h8(os.path.join(VIZ, "viz.js")), "{{DATA_HASH}}": h8(os.path.join(VIZ, "data", "data.js")),
    }
    out = tpl
    for k, v in rep.items():
        out = out.replace(k, v)
    assert "{{" not in out, "テンプレート残骸: " + out[out.index("{{"):out.index("{{") + 40]
    with open(os.path.join(VIZ, "index.html"), "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote viz/index.html", len(out), "bytes")


if __name__ == "__main__":
    main()
