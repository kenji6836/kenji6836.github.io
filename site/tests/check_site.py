#!/usr/bin/env python3
"""紹介HP v1 の受入テスト（stdlib のみ）。リポジトリルートで `python3 site/tests/check_site.py` を実行する。
生成物（index.html / works/**）が content.json と整合し、方針上の禁止語・壊れリンクが無いことを機械的に確認する。"""
import json, os, re, subprocess, sys
from html.parser import HTMLParser

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.chdir(ROOT)
FAILS = []
def fail(msg): FAILS.append(msg); print("FAIL:", msg)
def ok(msg): print("ok:", msg)

content = json.load(open("site/content.json", encoding="utf-8"))
works = content["works"]; cats = content["categories"]
shown = [w for w in works if not w.get("hidden")]  # 一覧・トップ・サイトマップ・hero.stats に出す作品（"hidden": true 以外）
slugs = [w["slug"] for w in works]

# 0. ビルドが冪等（--check が 0 で終わる）
r = subprocess.run([sys.executable, "site/build.py", "--check"], capture_output=True, text=True)
if r.returncode != 0: fail(f"build.py --check rc={r.returncode}: {r.stdout[-400:]} {r.stderr[-400:]}")
else: ok("build.py --check")

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.imgs=[]; self.text=[]; self.h1=0; self.title=""; self.meta_desc=""; self.lang=""
        self._in_title=False; self._skip=0; self.scripts=[]; self.stylesheets=[]; self.forms=0; self.ids=[]; self.tags={}; self.videos=[]; self.sources=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); self.tags[tag]=self.tags.get(tag,0)+1
        if tag=="html": self.lang=a.get("lang","")
        if tag=="a" and a.get("href"): self.links.append((a["href"], a))
        if tag=="img": self.imgs.append(a)
        if tag=="video": self.videos.append(a)
        if tag=="source": self.sources.append(a)
        if tag=="h1": self.h1+=1
        if tag=="title": self._in_title=True
        if tag=="meta" and a.get("name")=="description": self.meta_desc=a.get("content","")
        if tag=="script": self._skip+=1; self.scripts.append(a.get("src"))
        if tag=="style": self._skip+=1
        if tag=="link" and a.get("rel")=="stylesheet": self.stylesheets.append(a.get("href",""))
        if tag=="form": self.forms+=1
        if a.get("id"): self.ids.append(a["id"])
    def handle_endtag(self, tag):
        if tag=="title": self._in_title=False
        if tag in ("script","style"): self._skip=max(0,self._skip-1)
    def handle_data(self, data):
        if self._in_title: self.title+=data
        elif not self._skip: self.text.append(data)

def parse(path):
    p=P(); p.feed(open(path,encoding="utf-8").read()); return p

pages = ["index.html", "works/index.html"] + [f"works/{s}/index.html" for s in slugs]
for pg in pages:
    if not os.path.exists(pg): fail(f"missing page {pg}")
pages = [p for p in pages if os.path.exists(p)]
ok(f"{len(pages)} pages exist")

FORBIDDEN = ["副業", "会社員", "想定案件", "モック", "準備中", "Lorem", "TODO", "{{", "}}"]
ALLOWED_EXTERNAL = ("https://fonts.googleapis.com", "https://fonts.gstatic.com")

def resolve(href, frm):
    href = href.split("#")[0].split("?")[0]
    if not href: return None
    if href.startswith("/"): path = href.lstrip("/")
    else: path = os.path.normpath(os.path.join(os.path.dirname(frm), href))
    if path in ("", "."): path = "index.html"
    if os.path.isdir(path): path = os.path.join(path, "index.html")
    return path

all_text = {}
for pg in pages:
    p = parse(pg)
    all_text[pg] = "".join(p.text)
    if p.lang != "ja": fail(f"{pg}: <html lang> != ja")
    if p.h1 != 1: fail(f"{pg}: h1 count {p.h1}")
    if not p.title.strip(): fail(f"{pg}: empty <title>")
    if not p.meta_desc.strip(): fail(f"{pg}: empty meta description")
    if len(p.ids) != len(set(p.ids)): fail(f"{pg}: duplicate ids {[i for i in p.ids if p.ids.count(i)>1][:5]}")
    for src in p.scripts:
        if src and not src.startswith("/") and not src.startswith("assets") and not src.startswith("../"): fail(f"{pg}: external script {src}")
    for href in p.stylesheets:
        if href.startswith("http") and not href.startswith(ALLOWED_EXTERNAL): fail(f"{pg}: external stylesheet {href}")
    for img in p.imgs:
        if "alt" not in img: fail(f"{pg}: img without alt {img.get('src')}")
        src = img.get("src","")
        if src.startswith("http"): fail(f"{pg}: external image {src}")
        elif src and not src.startswith("data:"):
            path = resolve(src, pg)
            if not os.path.exists(path.split("?")[0]): fail(f"{pg}: missing image {src}")
    for href, a in p.links:
        if href.startswith(("mailto:", "tel:", "javascript:")): fail(f"{pg}: unexpected scheme {href}")
        elif href.startswith("http"):
            if a.get("target") == "_blank" and "noopener" not in a.get("rel",""): fail(f"{pg}: _blank without noopener {href}")
        elif href.startswith("#"):
            if href != "#" and href[1:] not in p.ids: fail(f"{pg}: broken anchor {href}")
        else:
            frag = href.split("#")[1] if "#" in href else None
            path = resolve(href, pg)
            if path and not os.path.exists(path): fail(f"{pg}: broken link {href} -> {path}")
            elif path and frag and not frag.startswith("cat="):
                if frag not in parse(path).ids: fail(f"{pg}: broken fragment {href}")
    txt = all_text[pg]
    for v in p.videos:  # 動画: autoplay 属性なし（再生は site.js が制御）・muted/playsinline/poster あり・poster 実在
        if "autoplay" in v: fail(f"{pg}: video has autoplay attribute")
        for need in ("muted", "playsinline", "poster", "aria-label"):
            if need not in v: fail(f"{pg}: video lacks {need}")
        if v.get("poster") and not os.path.exists(v["poster"].split("?")[0].lstrip("/")): fail(f"{pg}: missing poster {v.get('poster')}")
    for src in p.sources:
        spath = src.get("src","").split("?")[0].lstrip("/")
        if not os.path.exists(spath): fail(f"{pg}: missing video source {src.get('src')}")
        if os.path.exists(spath) and os.path.getsize(spath) > 3_000_000: fail(f"{pg}: video source > 3MB {src['src']}")
        if "?v=" not in src.get("src",""): fail(f"{pg}: video source without cache-busting query {src.get('src')}")
    for img in p.imgs:  # 差し替え時にキャッシュが残らないよう、サイト内画像は ?v=<hash> 付き
        if img.get("src","").startswith("/assets/") and "?v=" not in img["src"]: fail(f"{pg}: image without cache-busting query {img['src']}")
    for w in FORBIDDEN:
        if w in txt: fail(f"{pg}: forbidden word '{w}'")
    raw = open(pg, encoding="utf-8").read()
    for w in ("副業", "会社員"):
        if w in raw: fail(f"{pg}: forbidden word in raw html '{w}'")
    if os.path.getsize(pg) > 160_000: fail(f"{pg}: page > 160KB")
ok("per-page checks done")

# 1. トップ: 7 タイルが works/ に 1 クリックで到達
idx = parse("index.html"); idx_hrefs = [h for h,_ in idx.links]
for c in cats:
    if not any(re.search(rf"works/?(index\.html)?#cat={c['id']}$", h) for h in idx_hrefs):
        fail(f"index: no tile link to works/#cat={c['id']}")
ok("category tiles link to works")
for sec in ("services", "works", "about", "contact"):
    if sec not in idx.ids: fail(f"index: missing section id #{sec}")
if idx.forms < 1: fail("index: contact form missing")
if "会社名" not in all_text["index.html"]: fail("index: form fields not rendered")

# 2. 一覧: 表示作品のカード・data-cats。hidden の作品は一覧・サイトマップに出ない（作品ページは残る）
wl_raw = open("works/index.html", encoding="utf-8").read()
sitemap_raw = open("sitemap.xml", encoding="utf-8").read() if os.path.exists("sitemap.xml") else ""
for w in works:
    listed = bool(re.search(rf'href="(/works/{w["slug"]}/|{w["slug"]}/|\.\./works/{w["slug"]}/)"', wl_raw))
    in_sitemap = f"/works/{w['slug']}/</loc>" in sitemap_raw
    if w.get("hidden"):
        if listed: fail(f"works index: hidden work {w['slug']} is listed")
        if in_sitemap: fail(f"sitemap: hidden work {w['slug']} is listed")
    else:
        if not listed: fail(f"works index: no card link for {w['slug']}")
        if not in_sitemap: fail(f"sitemap: {w['slug']} missing")
if f"すべて ({len(shown)})" not in wl_raw: fail(f"works index: filter 'すべて' count != {len(shown)}")
for c in cats:
    n = sum(1 for w in shown if c["id"] in w["categories"])
    if n == 0: fail(f"category {c['id']} has no works")
    if f'data-cats' not in wl_raw: fail("works index: cards lack data-cats"); break
    if len(re.findall(rf'data-cats="[^"]*\b{c["id"]}\b', wl_raw)) < n: fail(f"works index: fewer cards tagged {c['id']} than content ({n})")
ok("works index cards")

# 3. 詳細: ラベル・カテゴリ・リンク・ビジュアル（架空ブランド/数値サンプルの開示を含む）
labels = content["labels"]
SAMPLE_KINDS = {"adset", "feed", "calendar", "insight", "storyboard"}
for w in works:
    pg = f"works/{w['slug']}/index.html"
    if pg not in all_text: continue
    t = all_text[pg]; raw = open(pg, encoding="utf-8").read()
    if labels[w["label"]] not in t: fail(f"{pg}: label '{labels[w['label']]}' missing")
    if w["title"] not in t: fail(f"{pg}: title missing")
    for pt in w["points"]:
        if pt not in t: fail(f"{pg}: point missing: {pt[:20]}")
    for l in w["links"]:
        if l["url"] not in raw: fail(f"{pg}: link missing {l['url']}")
    for v in w["visuals"]:
        if v["type"] == "image" and v["src"] not in raw: fail(f"{pg}: visual missing {v['src']}")
        if v["type"] == "mock" and v["title"] not in raw: fail(f"{pg}: mock '{v['title']}' not rendered")
        if v["type"] == "video":
            for key in ("mp4", "webm", "poster"):
                if v[key] not in raw: fail(f"{pg}: video {key} missing {v[key]}")
        if v["type"] == "mock" and v["kind"] in SAMPLE_KINDS:
            for item in v.get("items", []) + v.get("posts", []) + v.get("frames", []):
                if item["src"] not in raw: fail(f"{pg}: {v['kind']} image missing {item['src']}")
    if any(v["type"] == "mock" and v["kind"] in SAMPLE_KINDS for v in w["visuals"]) and "サンプル" not in t:
        fail(f"{pg}: sample visuals without 「サンプル」 disclosure")
    if w["label"] == "self" and any(v["type"] == "mock" and v["kind"] in SAMPLE_KINDS for v in w["visuals"]) and "架空" not in t and "自作" not in t:
        fail(f"{pg}: self-made sample without 「架空」/「自作」 disclosure")
    if "#contact" not in raw: fail(f"{pg}: no CTA to contact")
ok("detail pages")

# 4. CSS/JS
css = open("assets/site.css", encoding="utf-8").read() if os.path.exists("assets/site.css") else ""
js = open("assets/site.js", encoding="utf-8").read() if os.path.exists("assets/site.js") else ""
if not css: fail("assets/site.css missing")
for need in ("prefers-reduced-motion", "prefers-color-scheme: dark", "focus-visible"):
    if need not in css: fail(f"site.css lacks {need}")
# 上限は「際限なく増やさない」ための目安。節ごとに 1KB 前後増えるため 2026-09-23 に 60KB→64KB（配信時は gzip で 1/5 程度）
if len(css.encode()) > 64_000: fail("site.css > 64KB")
if len(js.encode()) > 12_000: fail("site.js > 12KB")
for need in ("prefers-reduced-motion", ".device-video", "IntersectionObserver"):
    if need not in js: fail(f"site.js lacks {need}")
sys.path.insert(0, os.path.join(ROOT, "site", "tools"))
from merge_lanes import hero_stat_counts, STAT_LABELS  # 3 区分の数え方は merge_lanes.py と共有（再計算と検査が同じ規則）
stats = {s["label"]: s["value"] for s in content["hero"]["stats"]}
counts = hero_stat_counts(works)
for label in STAT_LABELS:
    if stats.get(label) != str(counts[label]): fail(f"hero stat '{label}' {stats.get(label)} != works {counts[label]}")
if sum(counts.values()) != len(shown): fail(f"hero stats sum {sum(counts.values())} != shown works {len(shown)} (label must be public/self)")
if re.search(r"https?://(?!fonts\.g)", css): fail("site.css references external URL")
if not os.path.exists(".nojekyll"): fail(".nojekyll missing")
if os.path.exists("style.css"): fail("old root style.css still present")
ok("css/js checks")

# 4b. 帯の画像が「表示に足りる大きさの写し」になっているか（原寸のままだとスマホの初回表示が重い）
r = subprocess.run([sys.executable, "site/tools/make_band_thumbs.py", "--check"], capture_output=True, text=True)
if r.returncode != 0: fail(f"band thumbs stale: {r.stdout.strip()[:300]} {r.stderr.strip()[:200]}")
else: ok("band thumbs up to date")

r = subprocess.run([sys.executable, "site/tools/make_card_thumbs.py", "--check"], capture_output=True, text=True)
if r.returncode != 0: fail(f"card thumbs stale: {r.stdout.strip()[:300]} {r.stderr.strip()[:200]}")
else: ok("card thumbs up to date")

# 5. 既存サブページ不変（git 管理下のみ）
r = subprocess.run(["git", "status", "--porcelain", "--", "blockwise", "apps", "baccarat", "app-ads.txt"], capture_output=True, text=True)
if r.stdout.strip(): fail(f"protected paths modified: {r.stdout.strip()[:200]}")
else: ok("protected paths untouched")

# 6. 独立ページ（各レーンが置く自己完結ページ）: 配下に index.html があれば同じ検査・無ければ skip
EXTRA_DIRS = ("lp", "app", "viz", "demos", "dashboard", "cases")
extra_pages = []
for d in EXTRA_DIRS:
    if os.path.isdir(d):
        for dirpath, _dirs, files in os.walk(d):
            if "index.html" in files: extra_pages.append(os.path.join(dirpath, "index.html"))
extra_pages.sort()
for pg in extra_pages:
    p = parse(pg); raw = open(pg, encoding="utf-8").read(); txt = "".join(p.text)
    if p.lang != "ja": fail(f"{pg}: <html lang> != ja")
    if not p.title.strip(): fail(f"{pg}: empty <title>")
    if not p.meta_desc.strip(): fail(f"{pg}: empty meta description")
    for src in p.scripts:
        if src and (src.startswith(("http://", "https://", "//"))): fail(f"{pg}: external script {src}")
    if re.search(r"""(?:\bfrom|import\s*\()\s*["']https?://""", raw): fail(f"{pg}: external module import in inline script")
    for href in p.stylesheets:
        if href.startswith(("http", "//")) and not href.startswith(ALLOWED_EXTERNAL): fail(f"{pg}: external stylesheet {href}")
    if re.search(r"""@import\s+(?:url\()?["']?https?://(?!fonts\.googleapis\.com)""", raw): fail(f"{pg}: external @import in style")
    for img in p.imgs:
        if "alt" not in img: fail(f"{pg}: img without alt {img.get('src')}")
        src = img.get("src", "")
        if src.startswith(("http", "//")): fail(f"{pg}: external image {src}")
        elif src and not src.startswith("data:"):
            path = resolve(src, pg)
            if not os.path.exists(path): fail(f"{pg}: missing image {src}")
    # demos/ は顧客向け納品物のデモ（例: 議員サイトは公選法上 連絡先の明記が必要）→ mailto/tel を許可。javascript: は引き続き禁止
    contact_ok = pg.startswith("demos/")
    for href, a in p.links:
        if contact_ok and href.startswith(("mailto:", "tel:")): continue
        if href.startswith(("mailto:", "tel:", "javascript:")): fail(f"{pg}: unexpected scheme {href}")
        elif href.startswith(("http", "//")):
            if a.get("target") == "_blank" and "noopener" not in a.get("rel", ""): fail(f"{pg}: _blank without noopener {href}")
        elif href.startswith("#"):
            # "#/..." はアプリ内の hash ルート（/app/ の SPA）— DOM の id ではないので対象外
            if href != "#" and not href.startswith("#/") and href[1:] not in p.ids: fail(f"{pg}: broken anchor {href}")
        else:
            frag = href.split("#")[1] if "#" in href else None
            path = resolve(href, pg)
            if path and not os.path.exists(path): fail(f"{pg}: broken link {href} -> {path}")
            elif path and frag and not frag.startswith("cat=") and path.endswith(".html"):
                if frag not in parse(path).ids: fail(f"{pg}: broken fragment {href}")
    for v in p.videos:
        for need in ("muted", "playsinline"):
            if need not in v: fail(f"{pg}: video lacks {need}")
        if v.get("poster") and not os.path.exists(resolve(v["poster"], pg)): fail(f"{pg}: missing poster {v.get('poster')}")
    for src in p.sources:
        spath = resolve(src.get("src", ""), pg)
        if spath and not os.path.exists(spath): fail(f"{pg}: missing video source {src.get('src')}")
    for w in FORBIDDEN:
        if w in txt: fail(f"{pg}: forbidden word '{w}'")
ok(f"{len(extra_pages)} independent pages checked ({', '.join(d for d in EXTRA_DIRS if os.path.isdir(d)) or 'none present'})")

print("\nRESULT:", "PASS" if not FAILS else f"FAIL ({len(FAILS)})")
sys.exit(1 if FAILS else 0)
