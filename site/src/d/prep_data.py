#!/usr/bin/env python3
"""prep_data.py — レーン D: 取得済み統計 JSON と GeoJSON を /viz/ 用の 1 ファイル（data.js / data.json）に整形する。

標準ライブラリのみ。入力は site/src/d/raw/（housing_starts.json・population.json・japan_prefs.geojson）。
出力: viz/data/data.js（window.VIZ = {...}・file:// でも読める）と viz/data/data.json（同内容）。
地図は等距円筒（緯度 37° で横縮尺補正）で 1000 幅の viewBox に投影し、沖縄は左下へ移動（先島諸島は省略）。
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "viz", "data")

REGION = {  # 地域ブロック（ツールチップ用・8 区分）
    "北海道": ["01"], "東北": ["02", "03", "04", "05", "06", "07"],
    "関東": ["08", "09", "10", "11", "12", "13", "14"], "中部": ["15", "16", "17", "18", "19", "20", "21", "22", "23"],
    "近畿": ["24", "25", "26", "27", "28", "29", "30"], "中国": ["31", "32", "33", "34", "35"],
    "四国": ["36", "37", "38", "39"], "九州・沖縄": ["40", "41", "42", "43", "44", "45", "46", "47"],
}
CODE2REGION = {c: r for r, cs in REGION.items() for c in cs}

# 投影: 等距円筒。lon/lat → x/y。沖縄（47）は本島周辺だけ残して左下（九州の西）へ平行移動
LAT0 = 37.0
KX = math.cos(math.radians(LAT0))
OKI_SHIFT = (+1.0, +3.0)          # 経度 +1.0°・緯度 +3.0° → 本島中心 (127.9, 26.5) が (128.9, 29.5) 付近（屋久島の南西・奄美の位置）
OKI_KEEP_LON = 126.0              # これより西（先島諸島）は省略
DROP_BELOW_LAT = {"13": 33.0, "46": 30.0}   # 東京: 小笠原・青ヶ島以南を省略／鹿児島: 吐噶喇・奄美群島以南を省略（沖縄インセットの置き場）
W = 1000.0


def load(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as f:
        return json.load(f)


def rings_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]


def project_all(geo):
    """全リングを投影して {code: [[(x,y),...], ...]} と viewBox を返す。"""
    pts = {}
    for f in geo["features"]:
        code = f["properties"]["code"]
        polys = []
        for poly in rings_of(f["geometry"]):
            outer = poly[0]
            if code in DROP_BELOW_LAT and max(p[1] for p in outer) < DROP_BELOW_LAT[code]:
                continue
            if code == "47":
                if min(p[0] for p in outer) < OKI_KEEP_LON:
                    continue
                outer = [(x + OKI_SHIFT[0], y + OKI_SHIFT[1]) for x, y in outer]
            polys.append([(x * KX, -y) for x, y in outer])  # 外周のみ（穴は簡略化で消えている）
        pts[code] = polys
    xs = [x for polys in pts.values() for r in polys for x, _ in r]
    ys = [y for polys in pts.values() for r in polys for _, y in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    s = W / (maxx - minx)
    H = (maxy - miny) * s
    out = {}
    for code, polys in pts.items():
        scaled = [[((x - minx) * s, (y - miny) * s) for x, y in r] for r in polys]
        # 簡略化で点になった極小の島（bbox 4 単位未満・6 頂点未満）は描かない（最大リングは常に残す）
        big = max(scaled, key=lambda r: (max(x for x, _ in r) - min(x for x, _ in r)) * (max(y for _, y in r) - min(y for _, y in r)))
        out[code] = [r for r in scaled if r is big or (len(r) >= 6 and max(x for x, _ in r) - min(x for x, _ in r) >= 4 and max(y for _, y in r) - min(y for _, y in r) >= 4)]
    return out, W, H


def path_d(polys):
    parts = []
    for r in polys:
        parts.append("M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in r) + "Z")
    return "".join(parts)


def centroid(polys):
    """最大リングの面積重心（ラベル・点の配置用）。"""
    best, area_best = None, -1
    for r in polys:
        a = cx = cy = 0.0
        n = len(r)
        for i in range(n):
            x0, y0 = r[i]; x1, y1 = r[(i + 1) % n]
            cr = x0 * y1 - x1 * y0
            a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr
        if abs(a) > area_best:
            area_best = abs(a)
            if a != 0:
                best = (cx / (3 * a), cy / (3 * a))
            else:
                best = r[0]
    return best


def main():
    housing = load("housing_starts.json")
    pop = load("population.json")
    geo = load("japan_prefs.geojson")
    assert len(housing["prefs"]) == 47 and len(pop["prefs"]) == 47 and len(geo["features"]) == 47
    proj, w, h = project_all(geo)
    prefs = []
    for hp, pp in zip(housing["prefs"], pop["prefs"]):
        assert hp["code"] == pp["code"], (hp["code"], pp["code"])
        code = hp["code"]
        prefs.append({
            "code": code, "name": hp["name"], "short": hp["name"][:-1] if hp["name"] != "北海道" and hp["name"][-1] in "県府都" else hp["name"],  # 末尾 1 文字だけ（rstrip だと京都府→京）
            "en": next(f["properties"]["name_en"] for f in geo["features"] if f["properties"]["code"] == code),
            "region": CODE2REGION[code],
            "h": [None if v is None else int(v) for v in hp["values"]],
            "p": [None if v is None else int(v) for v in pp["values"]],
            "path": path_d(proj[code]),
            "c": [round(v, 1) for v in centroid(proj[code])],
        })
    # 全国計（47 合計。住宅は原表の全国計と全年一致を取得時に検証済み）
    def national(key, n):
        out = []
        for i in range(n):
            vals = [p[key][i] for p in prefs]
            out.append(None if any(v is None for v in vals) and key == "p" else sum(v for v in vals if v is not None))
        return out
    data = {
        "title": "家は、どこに建っているのか。",
        "years_h": housing["years"], "years_p": pop["years"],
        "unit_h": "戸", "unit_p": "人",
        "national_h": national("h", len(housing["years"])),
        "national_p": national("p", len(pop["years"])),
        "prefs": prefs,
        "map": {"viewBox": f"0 0 {w:.0f} {h:.0f}", "okinawa_moved": True, "note": "沖縄県は本島周辺を鹿児島の南西へ移動して表示。先島諸島・奄美群島以南・小笠原諸島は省略"},
        "sources": {
            "housing": {"name": "建築着工統計調査（住宅着工統計）都道府県別 新設住宅戸数（年計・時系列）", "provider": "国土交通省",
                        "via": "政府統計の総合窓口（e-Stat）", "page": housing["source"]["page_url"], "file": housing["source"]["file_url"],
                        "fetched": housing["source"]["fetched_at"], "note": "沖縄県は 1973 年計から集計（それ以前は原表「－」）"},
            "population": {"name": "人口推計 都道府県別人口（各年 10 月 1 日現在・総人口）", "provider": "総務省統計局",
                           "via": "政府統計の総合窓口（e-Stat）・総務省統計局", "pages": [pt["page_url"] for pt in pop["source"]["parts"]],
                           "fetched": pop["source"]["fetched_at"], "note": "原表は千人単位。国勢調査年（2000/2005/2010/2015/2020）は確定人口"},
            "map": {"name": "国土数値情報（行政区域データ）", "provider": "国土交通省", "page": "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html",
                    "via": "SmartNews メディア研究所 japan-topography（簡略版）", "note": "さらに簡略化（Douglas–Peucker 0.006°・小島除去）"},
            "credit_estat": "出典：国土交通省「建築着工統計調査（住宅着工統計）」・総務省統計局「人口推計」（政府統計の総合窓口（e-Stat）ほか）を加工して作成",
            "credit_map": "「国土数値情報（行政区域データ）」（国土交通省）をもとに作成",
        },
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "data.json"), "w", encoding="utf-8") as f:
        f.write(js)
    with open(os.path.join(OUT_DIR, "data.js"), "w", encoding="utf-8") as f:
        f.write("window.VIZ=" + js + ";\n")
    print("wrote", OUT_DIR, "map", data["map"]["viewBox"], "bytes", len(js))


if __name__ == "__main__":
    main()
