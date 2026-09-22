#!/usr/bin/env python3
"""Build the portfolio using only Python 3.9+ and its standard library."""

import argparse
import hashlib
import html
import json
import struct
import tempfile
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
from string import Template


ROOT = Path(__file__).resolve().parent.parent
# 狭い幅で語の途中（「自主制作サンプ／ル」）で折れないよう、意味の切れ目に <wbr> を置く（label 文字列そのものは merge_lanes/check_site の識別子なので変えない）
STAT_LABEL_HTML = {"自主制作サンプル": "自主制作<wbr>サンプル"}
SOURCE = ROOT / "site"
LEGACY = (
    "style.css",
    "assets/blockwise.jpg",
    "assets/mission-control-hero.jpg",
    "assets/mission-control.jpg",
    "assets/reachlab.jpg",
    "assets/reversi-icon.png",
    "assets/sweepfield.jpg",
)


WIDE_KINDS = {"storyboard", "adset", "feed"}  # 詳細ページのギャラリーで 2 列に収めず全幅にする


def visible(works):
    """一覧・トップ（帯・featured）・件数・前後リンク・サイトマップに出す作品。"hidden": true は除く（作品ページ自体は生成し、直リンクは生きる）"""
    return [work for work in works if not work.get("hidden")]


def esc(value):
    return html.escape(str(value), quote=True)


def soft_break(text):
    """「アプリ・システム開発」を「開／発」で折らず「・」の後だけで折れるように、<wbr> を置く（keep-all と組で使う）"""
    return esc(text).replace("・", "・<wbr>")


def icon(name, extra=""):
    return (
        '<svg class="icon {extra}" width="24" height="24" viewBox="0 0 24 24" '
        'fill="none" stroke="currentColor" stroke-width="1.75" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
        'focusable="false"><use href="#i-{name}"></use></svg>'
    ).format(name=esc(name), extra=esc(extra))


@lru_cache(maxsize=None)
def asset_url(src):
    """同名で差し替えてもブラウザ/CDN のキャッシュを確実に破るため、内容ハッシュをクエリに付ける"""
    digest = hashlib.sha1((ROOT / src.lstrip("/")).read_bytes()).hexdigest()[:8]
    return "{}?v={}".format(src, digest)


@lru_cache(maxsize=None)
def image_size(src):
    """Read dimensions from the original PNG/JPEG, without decoding pixels."""
    data = (ROOT / src.lstrip("/")).read_bytes()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        pos = 2
        sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
               0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
        while pos < len(data):
            if data[pos] != 0xFF:
                break
            while data[pos] == 0xFF:
                pos += 1
            marker = data[pos]
            pos += 1
            if marker in sof:
                height, width = struct.unpack(">HH", data[pos + 3:pos + 7])
                return width, height
            if marker in (0xD9, 0xDA):
                break
            if marker == 0x01 or 0xD0 <= marker <= 0xD7:
                continue
            pos += struct.unpack(">H", data[pos:pos + 2])[0]
    raise ValueError("Unsupported image: " + src)


def image(visual, eager=False, priority=None):
    """priority=None なら eager と同じ（先読み画像は fetchpriority=high）。False で eager だけ付ける"""
    width, height = image_size(visual["src"])
    if priority is None:
        priority = eager
    return (
        '<img src="{src}" alt="{alt}" width="{width}" height="{height}" '
        'loading="{loading}" decoding="async"{priority}>'
    ).format(src=esc(asset_url(visual["src"])), alt=esc(visual["alt"]), width=width,
             height=height, loading="eager" if eager else "lazy",
             priority=' fetchpriority="high"' if priority else "")


def device(visual, eager=False):
    frame = visual["frame"]
    chrome = (
        '<span class="browser-chrome" aria-hidden="true">'
        '<i></i><i></i><i></i></span>' if frame == "browser" else ""
    )
    return '<div class="device-frame device-{}">{}{}</div>'.format(
        esc(frame), chrome, image(visual, eager))


def video(visual, eager=False):
    """縦型動画をスマホ枠で。autoplay は付けず site.js が非 reduced-motion かつ可視時のみ再生する"""
    width, height = image_size(visual["poster"])
    return (
        '<div class="device-frame device-phone device-video">'
        '<video class="promo-video" muted loop playsinline preload="{preload}" poster="{poster}" '
        'width="{width}" height="{height}" aria-label="{alt}">'
        '<source src="{webm}" type="video/webm"><source src="{mp4}" type="video/mp4">{alt}</video>'
        '<button class="video-toggle" type="button" aria-pressed="false" hidden>'
        '<span class="video-toggle-play">再生</span><span class="video-toggle-pause">一時停止</span></button></div>'
    ).format(preload="auto" if eager else "metadata", poster=esc(asset_url(visual["poster"])), width=width, height=height,
             alt=esc(visual["alt"]), webm=esc(asset_url(visual["webm"])), mp4=esc(asset_url(visual["mp4"])))


def framed_image(src, alt, cls=""):
    width, height = image_size(src)
    return '<img class="{}" src="{}" alt="{}" width="{}" height="{}" loading="lazy" decoding="async">'.format(
        esc(cls), esc(asset_url(src)), esc(alt), width, height)


def pipeline(steps):
    items = "".join(
        '<li class="pipeline-step"><span class="step-icon">{}</span>'
        '<strong>{}</strong><span class="step-sub">{}</span></li>'.format(
            icon(step["icon"]), esc(step["label"]), esc(step["sub"]))
        for step in steps
    )
    return '<ol class="pipeline" style="--steps:{}">{}</ol>'.format(len(steps), items)


def mock(visual, compact=False):
    kind = visual["kind"]
    body = pipeline(visual["steps"]) if "steps" in visual else ""
    if kind == "pipeline" and "detail" in visual:
        detail = visual["detail"]
        if detail["kind"] == "table":
            heads = "".join('<th scope="col">{}</th>'.format(esc(h)) for h in detail["head"])
            rows = "".join("<tr>{}</tr>".format("".join(
                "<td>{}</td>".format(esc(cell)) for cell in row)) for row in detail["rows"])
            body += ('<table class="sample-table"><caption>{}</caption>'
                     '<thead><tr>{}</tr></thead><tbody>{}</tbody></table>').format(
                         esc(detail["caption"]), heads, rows)
        elif detail["kind"] == "bars":
            maximum = max(detail["values"]) or 1
            bars = "".join('<span style="--bar:{:.4f}%"></span>'.format(
                value / maximum * 100) for value in detail["values"])
            body += '<div class="chart-label">{}</div><div class="bar-chart" aria-hidden="true">{}</div>'.format(
                esc(detail["label"]), bars)
        else:
            raise ValueError("Unknown pipeline detail: " + detail["kind"])
    elif kind == "email":
        inbox = visual["inbox"]
        classes = "".join('<span class="chip{}">{}</span>'.format(
            " is-selected" if value == visual["selected"] else "", esc(value))
            for value in visual["classes"])
        draft = "".join('<div class="draft-line">{}</div>'.format(esc(line)) for line in visual["draft"])
        body = (
            '<div class="email-flow"><div class="mail-panel inbox">'
            '<span class="mail-from">{}</span><strong>{}</strong><p>{}</p></div>'
            '<div class="email-classes">{}<div class="class-list">{}</div>{}</div>'
            '<div class="mail-panel draft"><span class="status-pill">{}</span>{}</div></div>'
        ).format(esc(inbox["from"]), esc(inbox["subject"]), esc(inbox["preview"]),
                 icon("arrow"), classes, icon("arrow"), esc(visual["badge"]), draft)
    elif kind == "flow":
        timeline = "".join(
            '<li><time>{}</time><span class="timeline-dot" aria-hidden="true"></span>'
            '<span>{}</span></li>'.format(esc(item["t"]), esc(item["label"]))
            for item in visual["timeline"]
        )
        body += '<ol class="timeline">{}</ol>'.format(timeline)
    elif kind == "queue":
        rows = "".join(
            '<li><strong>{}</strong><span class="chip{}">{}</span><span class="budget">{}</span></li>'.format(
                esc(row["title"]), " is-selected" if row["lane"] == "法人" else "",
                esc(row["lane"]), esc(row["budget"])) for row in visual["rows"]
        )
        body += '<ul class="queue-list">{}</ul><div class="visual-note">{}</div>'.format(rows, esc(visual["caption"]))
    elif kind == "gate":
        criteria = "".join(
            '<li><strong>{}</strong><span class="step-sub">{}</span><div class="criterion-score">'
            '<span class="meter" aria-hidden="true"><span style="width:{:.4f}%"></span></span>'
            '<span class="chip">{}</span></div></li>'.format(
                esc(item["label"]), esc(item["sub"]), item["meter"] * 100, esc(item["verdict"]))
            for item in visual["criteria"]
        )
        body = '<ul class="criteria">{}</ul><div class="gate-result"><span class="status-pill">{}</span></div><div class="visual-note">{}</div>'.format(
            criteria, esc(visual["result"]), esc(visual["note"]))
    elif kind == "storyboard":
        frames = "".join(
            '<li class="sb-frame">{}<span class="sb-meta"><time>{}</time><strong>{}</strong></span>'
            '<span class="step-sub">{}</span></li>'.format(
                framed_image(item["src"], item["alt"]), esc(item["time"]), esc(item["label"]), esc(item["note"]))
            for item in visual["frames"]
        )
        body = '<ol class="storyboard">{}</ol><div class="visual-note">{}</div>'.format(frames, esc(visual["note"]))
    elif kind == "adset":
        cells = "".join(
            '<div class="ad-cell ad-{}">{}<span class="ad-meta"><strong>{}</strong><span>{} · {}</span></span></div>'.format(
                esc(item["slot"]), framed_image(item["src"], item["alt"]), esc(item["label"]), esc(item["size"]), esc(item["variant"]))
            for item in visual["items"]
        )
        body = '<div class="ad-board">{}</div><div class="visual-note">{}</div>'.format(cells, esc(visual["note"]))
    elif kind == "feed":
        profile = visual["profile"]
        stats = "".join('<li><strong>{}</strong><span>{}</span></li>'.format(esc(item["value"]), esc(item["label"])) for item in profile["stats"])
        posts = "".join(
            '<li class="feed-post" data-kind="{}">{}</li>'.format(esc(item["kind"]), framed_image(item["src"], item["alt"]))
            for item in visual["posts"]
        )
        legend = "".join('<li><span class="kind-dot kind-{}" aria-hidden="true"></span>{}</li>'.format(esc(key), esc(label)) for key, label in visual["legend"].items())
        body = (
            '<div class="feed-profile">{}<div class="feed-profile-text"><strong>{}</strong><span class="step-sub">{}</span>'
            '<ul class="feed-stats">{}</ul><p>{}</p></div></div><ol class="feed-grid">{}</ol>'
            '<ul class="feed-legend">{}</ul><div class="visual-note">{}</div>'
        ).format(framed_image(profile["avatar"], profile["name"] + " のアイコン", "feed-avatar"), esc(profile["name"]),
                 esc(profile["handle"]), stats, esc(profile["bio"]), posts, legend, esc(visual["note"]))
    elif kind == "calendar":
        head = "".join('<li class="cal-head">{}</li>'.format(esc(day)) for day in visual["days"])
        cells = "".join(
            '<li class="cal-cell{}">{}</li>'.format(
                " has-post" if cell else "",
                '<span class="kind-dot kind-{0}" aria-hidden="true"></span><span>{1}</span>'.format(esc(cell), esc(visual["legend"][cell])) if cell else "")
            for week in visual["weeks"] for cell in week
        )
        legend = "".join('<li><span class="kind-dot kind-{}" aria-hidden="true"></span>{}</li>'.format(esc(key), esc(label)) for key, label in visual["legend"].items())
        body = '<ol class="calendar">{}{}</ol><ul class="feed-legend">{}</ul><div class="visual-note">{}</div>'.format(
            head, cells, legend, esc(visual["note"]))
    elif kind == "insight":
        kpis = "".join(
            '<li class="kpi"><span class="step-sub">{}</span><strong>{}</strong><span class="kpi-sub">{}</span></li>'.format(
                esc(item["label"]), esc(item["value"]), esc(item["sub"])) for item in visual["kpis"]
        )
        body = '<ul class="kpi-row">{}</ul>'.format(kpis)
        if "bars" in visual:
            bars = visual["bars"]
            maximum = max(item["value"] for item in bars["items"]) or 1
            rows = "".join(
                '<li><span>{}</span><span class="hbar" aria-hidden="true"><span style="width:{:.4f}%"></span></span><strong>{}</strong></li>'.format(
                    esc(item["label"]), item["value"] / maximum * 100, esc(item["display"])) for item in bars["items"]
            )
            body += '<div class="chart-label">{}</div><ol class="hbar-list">{}</ol>'.format(esc(bars["label"]), rows)
        body += '<div class="visual-note">{}</div>'.format(esc(visual["note"]))
    elif kind != "pipeline":
        raise ValueError("Unknown visual kind: " + kind)
    return '<figure class="mock mock-{}"{} role="img" aria-label="{}"><div class="mock-ui">{}</div><figcaption>{}</figcaption></figure>'.format(
        esc(kind), " data-compact" if compact else "", esc(visual["title"]), body, esc(visual["title"]))


def visual_markup(visual, compact=False):
    if visual["type"] == "image":
        return device(visual)
    if visual["type"] == "mock":
        return mock(visual, compact)
    if visual["type"] == "video":
        if compact:
            return device({"src": visual["poster"], "alt": visual["alt"], "frame": "phone"})
        return video(visual)
    raise ValueError("Unknown visual type: " + visual["type"])


class Site:
    def __init__(self, content):
        self.content = content
        self.site = content["site"]
        self.person = content["person"]
        self.all_works = content["works"]
        self.works = visible(self.all_works)  # 一覧・トップ・件数・前後リンク・サイトマップの対象
        self.categories = content["categories"]
        self.work_by_slug = {work["slug"]: work for work in self.all_works}
        self.cat_by_id = {category["id"]: category for category in self.categories}
        self.counts = {c["id"]: sum(c["id"] in w["categories"] for w in self.works) for c in self.categories}
        self.template = Template((SOURCE / "templates/page.html").read_text(encoding="utf-8"))
        self.symbols = (SOURCE / "templates/icons.svg").read_text(encoding="utf-8").strip()

    def button(self, label, href, primary=False, external=False, glyph=None):
        attrs = ' target="_blank" rel="noopener noreferrer"' if external else ""
        return '<a class="button {}" href="{}"{}>{}{}{}</a>'.format(
            "button-primary" if primary else "button-secondary", esc(href), attrs,
            icon(glyph) if glyph else "", esc(label), icon("external" if external else "arrow"))

    def wordmark(self, active=False):
        return '<a class="wordmark" href="/"{}><span class="brand-mark" aria-hidden="true">{}</span><span>{}</span></a>'.format(
            ' aria-current="page"' if active else "", icon("code"), esc(self.person["name"]))

    def nav(self, page):
        return "".join('<a href="{}"{}>{}</a>'.format(
            esc(item["href"]), ' aria-current="page"' if page != "/" and item["href"] == "/works/" else "",
            esc(item["label"])) for item in self.site["nav"])

    def header(self, page):
        return (
            '<header class="site-header"><div class="container header-inner">{}'
            '<nav id="site-nav" class="site-nav" aria-label="メインナビゲーション">{}</nav>'
            '<div class="header-actions">{}<button class="nav-toggle" type="button" '
            'aria-expanded="false" aria-controls="site-nav" aria-label="メニュー">{}{}</button></div>'
            '</div></header>'
        ).format(self.wordmark(page == "/"), self.nav(page), self.button("相談する", "/#contact", True),
                 icon("menu", "menu-icon"), icon("close", "close-icon"))

    def footer(self, page):
        links = "".join(self.button(link["label"], link["url"], external=True, glyph="github")
                        for link in self.person["links"])
        return (
            '<footer class="site-footer"><div class="container"><div class="footer-top">{}'
            '<nav class="footer-nav" aria-label="フッターナビゲーション">{}</nav>{}</div>'
            '<div class="footer-bottom"><small>© 2026 {}</small><p>{}</p></div></div></footer>'
        ).format(self.wordmark(page == "/"), self.nav(page), links, esc(self.person["name"]), esc(self.site["footer_note"]))

    def page(self, path, title, description, body, og_image="/assets/works/sweepfield-1.jpg", detail=False):
        canonical = self.site["url"].rstrip("/") + path
        return self.template.substitute(
            lang=esc(self.site["lang"]), title=esc(title), description=esc(description),
            canonical=esc(canonical), og_type="article" if detail else "website",
            og_image=esc(self.site["url"].rstrip("/") + og_image),
            theme_color=esc(self.site["brand_color"]), symbols=self.symbols,
            header=self.header(path), body=body, footer=self.footer(path),
        ).encode("utf-8")

    def label(self, work):
        return '<span class="work-label label-{}">{}</span>'.format(
            esc(work["label"]), esc(self.content["labels"][work["label"]]))

    def category_chips(self, work, linked=False):
        result = []
        for cat_id in work["categories"]:
            name = esc(self.cat_by_id[cat_id]["name"])
            if linked:
                result.append('<a class="chip" href="/works/#cat={}">{}</a>'.format(esc(cat_id), name))
            else:
                result.append('<span class="chip">{}</span>'.format(name))
        return "".join(result)

    def card(self, work):
        return (
            '<article class="card reveal" data-cats="{}"><a class="card-link" href="/works/{}/">'
            '<div class="card-visual">{}</div><div class="card-body"><p class="work-kicker">{}</p>'
            '<h3>{}</h3><div class="card-categories">{}</div><div class="card-bottom">{}'
            '<span class="card-arrow">{}</span></div></div></a></article>'
        ).format(esc(" ".join(work["categories"])), esc(work["slug"]), self.card_visual(work),
                 esc(work["kicker"]), esc(work["title"]), self.category_chips(work), self.label(work), icon("arrow"))

    def card_visual(self, work):
        """カード用: 先頭が icon なら連続する icon（最大 3）を 1 行で見せる。それ以外は先頭ビジュアル 1 つ"""
        visuals = work["visuals"]
        first = visuals[0]
        if first["type"] == "image" and first.get("frame") == "icon":
            icons = []
            for visual in visuals:
                if visual["type"] == "image" and visual.get("frame") == "icon" and len(icons) < 3:
                    icons.append(device(visual))
                else:
                    break
            return '<div class="card-icon-row">{}</div>'.format("".join(icons))
        return visual_markup(first, True)

    def section_heading(self, kicker, heading, lead=""):
        heading_html = "<br>".join(esc(line) for line in heading.split("\n"))
        lead_html = '<p class="section-lead">{}</p>'.format(esc(lead)) if lead else ""
        return '<div class="section-heading reveal"><div><span class="eyebrow">{}</span><h2>{}</h2></div>{}</div>'.format(esc(kicker), heading_html, lead_html)

    def pick_visual(self, work, ref=None):
        """作品のビジュアル参照を image() 用の dict に解決する。
        ref: None = 先頭の image/video（無ければ先頭の mock）／int = visuals の添字／
        {"visual": i, "item": slot} = adset の 1 点／{"src", "alt", "frame"} = 直接指定。video は poster をスマホ枠で使う"""
        if isinstance(ref, dict) and "src" in ref:
            return {"src": ref["src"], "alt": ref["alt"], "frame": ref.get("frame", "browser")}
        if ref is None:
            visual = next((v for v in work["visuals"] if v["type"] in ("image", "video")), work["visuals"][0])
        else:
            visual = work["visuals"][ref["visual"] if isinstance(ref, dict) else ref]
            if isinstance(ref, dict) and "item" in ref:
                item = next(i for i in visual["items"] if i["slot"] == ref["item"])
                return {"src": item["src"], "alt": item["alt"], "frame": "square" if ref["item"].startswith("square") else "browser"}
        if visual["type"] == "video":
            return {"src": visual["poster"], "alt": visual["alt"], "frame": "phone"}
        return visual

    def band_item(self, ref, eager=False, hidden=False):
        """帯の 1 枚。hidden は継ぎ目なしループ用の 2 周目（読み上げ・タブ移動の対象外）"""
        work = self.work_by_slug[ref["work"]]
        visual = self.pick_visual(work, ref if "visual" in ref else None)
        if hidden:
            visual = dict(visual, alt="")
        return '<li{}{}><a href="/works/{}/"{}>{}</a></li>'.format(
            ' class="band-phone"' if visual.get("frame") == "phone" else "", ' aria-hidden="true"' if hidden else "",
            esc(work["slug"]), ' tabindex="-1"' if hidden else "", image(visual, eager, priority=False))

    def band(self):
        """作品スクショが自動で流れる帯（2 段・逆向き）。並びは hero.band。
        選び方: ぱっと見で何か分かる画面（写真・図・盤面・大きな見出し）を優先し、文字だけの画面や事例ページの表は入れない。
        1 段目の 1 周目だけ先読み、2 周目（aria-hidden）は遅延読み込み"""
        rows = []
        for index, refs in enumerate(self.content["hero"]["band"]):
            refs = [ref for ref in refs if not self.work_by_slug[ref["work"]].get("hidden")]
            items = "".join(self.band_item(ref, eager=index == 0) for ref in refs)
            items += "".join(self.band_item(ref, hidden=True) for ref in refs)
            rows.append('<div class="band{}"><ul class="band-track">{}</ul></div>'.format(" band-reverse" if index % 2 else "", items))
        return '<div class="band-stack" aria-label="つくったものの画面（流れる帯）">{}</div>'.format("".join(rows))

    def hero(self):
        hero = self.content["hero"]
        catch = "<br>".join(esc(line) for line in hero["catch"].split("\n"))
        accent = esc(hero.get("catch_accent", ""))
        if accent and accent in catch:
            catch = catch.replace(accent, '<span class="accent">{}</span>'.format(accent), 1)
        cta = hero["cta"]
        return (
            '<section id="top" class="hero"><div class="container hero-copy"><h1>{}</h1><p class="hero-lead">{}</p>'
            '<div class="hero-actions">{}</div><p class="hero-scroll" aria-hidden="true">SCROLL{}</p></div>{}</section>'
        ).format(catch, "".join('<span class="unit">{}</span>'.format(esc(line)) for line in hero["tagline"].split("\n")),
                 self.button(cta["label"], cta["href"], True), icon("down"), self.band())

    def entry(self):
        """5 分類タイル: 作品スクショ＋アイコン＋題名だけ（段落なし）。押すと近い見本へ"""
        entry = self.content["entry"]
        tiles = "".join(
            '<li class="reveal"><a class="tile" href="{}"><div class="tile-visual">{}<span class="tile-icon">{}</span></div>'
            '<div class="tile-body"><h3>{}</h3>{}</div></a></li>'.format(
                esc(item["href"]), image(self.pick_visual(self.work_by_slug[item["image"]["work"]], item["image"])),
                icon(item["icon"]), soft_break(item["title"]), icon("arrow"))
            for item in entry["items"])
        return '<section id="entry" class="section section-alt"><div class="container">{}<ul class="tile-grid stagger-grid">{}</ul></div></section>'.format(
            self.section_heading(entry["kicker"], entry["heading"], entry.get("lead", "")), tiles)

    def shot(self, slug):
        """作品の大サムネ 1 枚（題名＋種別札だけ）。表示上書きは featured_cards[slug]（title・visual・kind）"""
        work = self.work_by_slug[slug]
        opts = self.content.get("featured_cards", {}).get(slug, {})
        visual = self.pick_visual(work, opts.get("visual"))
        frame = visual.get("frame")
        if visual.get("type") == "mock":
            markup = mock(visual, compact=True)
        elif frame == "phone":
            markup = '<div class="shot-phone">{}</div>'.format(image(visual))
        elif frame in ("square", "icon"):
            markup = '<div class="shot-square">{}</div>'.format(image(visual))
        else:
            markup = image(visual)
        public = work["label"] == "public"
        kind = opts.get("kind") or (self.content["labels"]["public"] if public else self.cat_by_id[work["categories"][0]]["name"])
        return (
            '<li class="reveal"><a class="shot" href="/works/{}/"><div class="shot-visual">{}</div>'
            '<div class="shot-body"><h3>{}</h3><span class="shot-kind{}">{}</span></div></a></li>'
        ).format(esc(slug), markup, soft_break(opts.get("title", work["title"])), " is-public" if public else "", esc(kind))

    def featured(self):
        cards = "".join(self.shot(slug) for slug in self.content["featured"] if not self.work_by_slug[slug].get("hidden"))
        return '<section id="works" class="section"><div class="container">{}<ul class="shot-grid stagger-grid">{}</ul><div class="section-action">{}</div></div></section>'.format(
            self.section_heading("WORKS", "つくったもの", self.site["footer_note"]), cards,
            self.button("すべて見る（{} 件）".format(len(self.works)), "/works/"))

    def services(self):
        """できること: 10 分野をアイコン札で（名前＋件数だけ）。各札は一覧の絞り込みへ"""
        tiles = "".join(
            '<li class="reveal"><a class="cat" href="/works/#cat={}"><span class="cat-icon">{}</span>'
            '<span><strong>{}</strong><small>{} 件</small></span></a></li>'.format(
                esc(cat["id"]), icon(cat["icon"]), soft_break(cat["name"]), self.counts[cat["id"]])
            for cat in self.categories)
        return '<section id="services" class="section section-alt"><div class="container">{}<ul class="cat-grid stagger-grid">{}</ul></div></section>'.format(
            self.section_heading("SERVICES", "できること"), tiles)

    def process(self):
        process = self.content["process"]
        steps = "".join('<li class="step reveal"><span class="step-num">{}</span><span class="step-glyph">{}</span><strong>{}</strong></li>'.format(
            esc(step["step"]), icon(step["icon"]), soft_break(step["title"])) for step in process["steps"])
        return '<section id="process" class="section"><div class="container">{}<ol class="steps stagger-grid">{}</ol></div></section>'.format(
            self.section_heading("PROCESS", process["heading"], process.get("note", "")), steps)

    def about(self):
        """自己紹介: 写真＋名前＋一言＋数字 3 つ（hero.stats）＋技術チップ。段落は置かない"""
        person = self.person
        avatar = image({"src": person["photo"], "alt": person["name"]}) if person["photo"] else '<span>{}</span>'.format(esc(person["initial"]))
        stats = "".join('<div><dt>{}</dt><dd><strong>{}</strong><span>{}</span></dd></div>'.format(
            STAT_LABEL_HTML.get(stat["label"], esc(stat["label"])), esc(stat["value"]), esc(stat["unit"])) for stat in self.content["hero"]["stats"])
        skills = "".join('<li class="chip">{}</li>'.format(esc(skill)) for skill in person["skills"])
        return (
            '<section id="about" class="section section-alt"><div class="container about-grid">'
            '<div class="avatar reveal"{}>{}</div><div class="about-copy reveal"><span class="eyebrow">ABOUT</span><h2>{}</h2>'
            '<p class="tagline">{}</p><dl class="stats">{}</dl><ul class="skill-list">{}</ul></div></div></section>'
        ).format(' aria-hidden="true"' if not person["photo"] else "", avatar, esc(person["name"]), esc(person["tagline"]), stats, skills)

    def contact(self):
        contact = self.content["contact"]
        fields = []
        autocomplete = {"name": "name", "company": "organization", "email": "email"}
        for field in contact["form_fields"]:
            field_id = "contact-" + field["name"]
            attrs = 'id="{}" name="{}"{}'.format(esc(field_id), esc(field["entry"] or field["name"]),
                                                       " required" if field["required"] else "")
            if field["type"] == "textarea":
                control = '<textarea {} rows="6"></textarea>'.format(attrs)
            elif field["type"] == "select":
                options = "".join('<option value="{}">{}</option>'.format(esc(value), esc(value)) for value in field["options"])
                if not field["required"]:  # 任意の select は未選択を既定にする（先頭の選択肢が黙って送られないように）
                    options = '<option value="">選択してください</option>' + options
                control = '<select {}>{}</select>'.format(attrs, options)
            else:
                control = '<input {} type="{}"{}>'.format(attrs, esc(field["type"]),
                    ' autocomplete="{}"'.format(autocomplete[field["name"]]) if field["name"] in autocomplete else "")
            fields.append('<div class="form-field"><label for="{}">{}</label>{}</div>'.format(esc(field_id), esc(field["label"]), control))
        platforms = "".join(self.button(platform["label"], platform["url"], external=True)
                            for platform in contact["platforms"] if platform["url"])
        action = contact["form_action"].strip()
        return (
            '<section id="contact" class="section"><div class="container contact-grid">'
            '<div class="contact-copy">{}<p>{}</p><p class="contact-note">{}</p>{}</div>'
            '<div class="contact-card"><form{} data-action="{}" data-success="{}" data-error="{}" method="post">{}'
            '<button class="button button-primary submit-button" type="submit"{}>送信する{}</button>'
            '<p class="form-status" role="status" aria-live="polite" aria-atomic="true"></p>'
            '{}</form>{}</div></div></section>'
        ).format(self.section_heading("CONTACT", contact["heading"]), esc(contact["lead"]), esc(contact["note"]),
                 '<div class="button-row">{}</div>'.format(platforms) if platforms else "",
                 # 送信先があるときは action も付けて JS 無効でも通常 POST で送れるようにする（JS 有効時は fetch で横取り）
                 ' action="{}"'.format(esc(action)) if action else "",
                 esc(action), esc(contact["success_text"]), esc(contact["error_text"]),
                 "".join(fields), "" if action else " disabled", icon("arrow"),
                 "" if action else '<noscript><p class="form-status">{}</p></noscript>'.format(esc(contact["error_text"])),
                 # 送信結果を取れない no-cors 経路の保険: Google フォーム本体への直接リンク（R2 指摘の回復手段）
                 '<p class="form-fallback">送信できない場合は <a href="{}" target="_blank" rel="noopener noreferrer">Google フォームから直接</a>お送りください。</p>'.format(esc(action.replace("/formResponse", "/viewform"))) if action else "")

    def home(self):
        return self.page("/", self.site["title"], self.site["description"],
                         self.hero() + self.entry() + self.featured() + self.services() + self.process() + self.about() + self.contact())

    def breadcrumb(self, work=None):
        crumbs = '<li><a href="/">トップ</a></li>'
        if work:
            crumbs += '<li><a href="/works/">制作実績</a></li><li><span aria-current="page">{}</span></li>'.format(esc(work["title"]))
        else:
            crumbs += '<li><span aria-current="page">制作実績</span></li>'
        return '<nav class="breadcrumbs" aria-label="パンくず"><ol>{}</ol></nav>'.format(crumbs)

    def listing(self):
        filters = '<button class="chip is-selected" type="button" data-cat="all" aria-pressed="true">すべて ({})</button>'.format(len(self.works))
        filters += "".join('<button class="chip" type="button" data-cat="{}" aria-pressed="false">{} ({})</button>'.format(
            esc(cat["id"]), esc(cat["name"]), self.counts[cat["id"]]) for cat in self.categories)
        body = (
            '<div class="container listing-page">{}<header class="page-heading"><h1>制作実績</h1><p>{}</p></header>'
            '<div class="work-filters" role="group" aria-label="カテゴリ">{}</div>'
            '<div class="works-grid stagger-grid" id="work-list">{}</div></div>'
        ).format(self.breadcrumb(), esc(self.site["footer_note"]), filters, "".join(self.card(work) for work in self.works))
        return self.page("/works/", "制作実績 — " + self.site["name"], self.site["footer_note"], body)

    def detail(self, work, index):
        """index は一覧（visible）での位置。hidden の作品は None で、前後リンクを付けない"""
        visuals = work["visuals"]
        consumed = 1
        if visuals[0].get("frame") == "icon":
            while consumed < len(visuals) and visuals[consumed].get("frame") == "icon":
                consumed += 1
            main_visual = '<div class="icon-row">{}</div>'.format("".join(device(v) for v in visuals[:consumed]))
        else:
            main_visual = visual_markup(visuals[0])
        points = "".join('<li class="point-card reveal">{}<span>{}</span></li>'.format(icon("check"), esc(point)) for point in work["points"])
        stack = "".join('<li class="chip">{}</li>'.format(esc(item)) for item in work["stack"])
        links = "".join(self.button(link["label"], link["url"], primary=i == 0, external=not link["url"].startswith("/"))
                        for i, link in enumerate(work["links"]))  # サイト内パス（/viz/ 等）は同タブ・矢印アイコン
        metadata = '<div><dt>担当</dt><dd>{}</dd></div><div><dt>技術</dt><dd><ul class="skill-list">{}</ul></dd></div>'.format(esc(work["role"]), stack)
        if links:
            metadata += '<div><dt>リンク</dt><dd class="button-row">{}</dd></div>'.format(links)
        gallery = "".join('<div class="visual-panel gallery-item reveal{}">{}</div>'.format(
            " is-wide" if v.get("kind") in WIDE_KINDS else "", visual_markup(v)) for v in visuals[consumed:])
        previous = '<span></span>'
        following = '<span></span>'
        if index is not None and index > 0:
            previous_work = self.works[index - 1]
            previous = '<a rel="prev" href="/works/{}/">{}<span>前の実績: {}</span></a>'.format(
                esc(previous_work["slug"]), icon("arrow", "arrow-back"), esc(previous_work["title"]))
        if index is not None and index + 1 < len(self.works):
            next_work = self.works[index + 1]
            following = '<a rel="next" href="/works/{}/"><span>次の実績: {}</span>{}</a>'.format(
                esc(next_work["slug"]), esc(next_work["title"]), icon("arrow"))
        body = (
            '<article class="container detail-page">{}<header class="detail-heading"><p class="work-kicker">{}</p>'
            '<h1>{}</h1><div class="detail-tags">{}{}<span class="work-year">{}</span></div><p class="detail-lead">{}</p></header>'
            '<div class="visual-panel main-visual">{}</div><section class="detail-section"><h2>ポイント</h2>'
            '<ul class="points-grid stagger-grid">{}</ul></section><dl class="work-meta{}">{}</dl>{}'
            '<nav class="work-pagination" aria-label="前後の制作実績">{}{}</nav><aside class="contact-band">'
            '<h2>似た内容のご相談はこちら</h2>{}</aside></article>'
        ).format(self.breadcrumb(work), esc(work["kicker"]), esc(work["title"]), self.label(work),
                 self.category_chips(work, True), esc(work["year"]), esc(work["summary"]), main_visual,
                 points, " has-links" if links else "", metadata,
                 '<div class="gallery">{}</div>'.format(gallery) if gallery else "", previous, following,
                 self.button("相談する（無料）", "/#contact", True))
        og_image = next((v["src"] if v["type"] == "image" else v["poster"] for v in visuals if v["type"] in ("image", "video")), "/assets/works/sweepfield-1.jpg")
        return self.page("/works/{}/".format(work["slug"]), work["title"] + " — " + self.site["name"],
                         work["summary"], body, og_image=og_image, detail=True)

    def outputs(self):
        result = {"index.html": self.home(), "works/index.html": self.listing()}
        paths = ["/", "/works/"]
        position = {work["slug"]: index for index, work in enumerate(self.works)}
        for work in self.all_works:  # hidden の作品ページも生成する（一覧・サイトマップには載せない）
            result["works/{}/index.html".format(work["slug"])] = self.detail(work, position.get(work["slug"]))
        paths += ["/works/{}/".format(work["slug"]) for work in self.works]
        site_url = self.site["url"].rstrip("/")
        for work in self.works:  # 独立ページ（/viz/ /app/… 静的配信・build 対象外）も実在すればサイトマップに載せる
            for link in work.get("links", []):
                url = link.get("url", "")
                if url.startswith(site_url + "/"):  # content.json 側がルート絶対ではなく絶対 URL で書かれていても拾う
                    url = url[len(site_url):]
                if url.startswith("/") and url.endswith("/") and url not in paths and (ROOT / url.strip("/") / "index.html").exists():
                    paths.append(url)
        for name in ("site.css", "site.js"):
            result["assets/" + name] = (SOURCE / "static" / name).read_bytes()
        sitemap = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
        for path in paths:
            ET.SubElement(ET.SubElement(sitemap, "url"), "loc").text = self.site["url"].rstrip("/") + path
        ET.indent(sitemap, space="  ")
        result["sitemap.xml"] = ET.tostring(sitemap, encoding="utf-8", xml_declaration=True) + b"\n"
        result[".nojekyll"] = b""
        return result


def write_outputs(destination, outputs):
    for relative in sorted(outputs):
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(outputs[relative])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare a temporary build with the checked-in outputs")
    args = parser.parse_args()
    content = json.loads((SOURCE / "content.json").read_text(encoding="utf-8"))
    outputs = Site(content).outputs()
    if args.check:
        scratch = ROOT / ".dd"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="site-check-", dir=str(scratch)) as temp:
            destination = Path(temp)
            write_outputs(destination, outputs)
            different = [path for path in sorted(outputs)
                         if not (ROOT / path).is_file() or (ROOT / path).read_bytes() != (destination / path).read_bytes()]
            different += [path for path in LEGACY if (ROOT / path).exists()]
        if different:
            print("\n".join(different))
            return 1
        print("All generated files match.")
        return 0
    write_outputs(ROOT, outputs)
    for relative in LEGACY:
        path = ROOT / relative
        if path.is_file():
            path.unlink()
    print("Generated {} files.".format(len(outputs)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
