#!/usr/bin/env python3
"""Build the portfolio using only Python 3.9+ and its standard library."""

import argparse
import html
import json
import struct
import tempfile
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
from string import Template


ROOT = Path(__file__).resolve().parent.parent
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


def esc(value):
    return html.escape(str(value), quote=True)


def icon(name, extra=""):
    return (
        '<svg class="icon {extra}" width="24" height="24" viewBox="0 0 24 24" '
        'fill="none" stroke="currentColor" stroke-width="1.75" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
        'focusable="false"><use href="#i-{name}"></use></svg>'
    ).format(name=esc(name), extra=esc(extra))


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


def image(visual, eager=False):
    width, height = image_size(visual["src"])
    return (
        '<img src="{src}" alt="{alt}" width="{width}" height="{height}" '
        'loading="{loading}" decoding="async"{priority}>'
    ).format(src=esc(visual["src"]), alt=esc(visual["alt"]), width=width,
             height=height, loading="eager" if eager else "lazy",
             priority=' fetchpriority="high"' if eager else "")


def device(visual, eager=False):
    frame = visual["frame"]
    chrome = (
        '<span class="browser-chrome" aria-hidden="true">'
        '<i></i><i></i><i></i></span>' if frame == "browser" else ""
    )
    return '<div class="device-frame device-{}">{}{}</div>'.format(
        esc(frame), chrome, image(visual, eager))


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
    elif kind != "pipeline":
        raise ValueError("Unknown visual kind: " + kind)
    return '<figure class="mock mock-{}"{} role="img" aria-label="{}"><div class="mock-ui">{}</div><figcaption>{}</figcaption></figure>'.format(
        esc(kind), " data-compact" if compact else "", esc(visual["title"]), body, esc(visual["title"]))


def visual_markup(visual, compact=False):
    if visual["type"] == "image":
        return device(visual)
    if visual["type"] == "mock":
        return mock(visual, compact)
    raise ValueError("Unknown visual type: " + visual["type"])


class Site:
    def __init__(self, content):
        self.content = content
        self.site = content["site"]
        self.person = content["person"]
        self.works = content["works"]
        self.categories = content["categories"]
        self.work_by_slug = {work["slug"]: work for work in self.works}
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

    def section_heading(self, kicker, heading):
        heading_html = "<br>".join(esc(line) for line in heading.split("\n"))
        return '<div class="section-heading reveal"><span class="eyebrow">{}</span><h2>{}</h2></div>'.format(esc(kicker), heading_html)

    def hero(self):
        hero = self.content["hero"]
        headline = "<br>".join(esc(line) for line in hero["headline"].split("\n"))
        headline = headline.replace("まとめて任せられます。", '<span class="accent">まとめて任せられます。</span>')
        stats = "".join('<div><dt>{}</dt><dd><strong>{}</strong><span>{}</span></dd></div>'.format(
            esc(stat["label"]), esc(stat["value"]), esc(stat["unit"])) for stat in hero["stats"])
        devices = "".join('<div class="hero-device hero-device-{}">{}</div>'.format(
            i, device(self.work_by_slug[item["work"]]["visuals"][item["visual"]], eager=i == 0))
            for i, item in enumerate(hero["visual"]))
        primary, secondary = hero["cta_primary"], hero["cta_secondary"]
        return (
            '<section id="top" class="hero"><div class="container hero-grid"><div class="hero-copy">'
            '<h1>{}</h1><p class="hero-lead">{}</p><div class="hero-actions">{}{}</div>'
            '<dl class="hero-stats">{}</dl></div><div class="device-stage">{}</div></div></section>'
        ).format(headline, esc(hero["sub"]), self.button(primary["label"], primary["href"], True),
                 self.button(secondary["label"], secondary["href"]), stats, devices)

    def services(self):
        tiles = "".join(
            '<a class="service-tile reveal" href="/works/#cat={}"><span class="service-icon">{}</span>'
            '<h3>{}</h3><p>{}</p><span class="service-count">制作実績 {} 件 {}</span></a>'.format(
                esc(cat["id"]), icon(cat["icon"]), esc(cat["name"]), esc(cat["lead"]), self.counts[cat["id"]], icon("arrow"))
            for cat in self.categories)
        return '<section id="services" class="section section-alt"><div class="container">{}<div class="services-grid stagger-grid">{}</div></div></section>'.format(
            self.section_heading("SERVICES", "任せられること"), tiles)

    def featured(self):
        cards = "".join(self.card(self.work_by_slug[slug]) for slug in self.content["featured"])
        return '<section id="works" class="section"><div class="container">{}<div class="works-grid stagger-grid">{}</div><div class="section-action">{}</div></div></section>'.format(
            self.section_heading("WORKS", "制作実績"), cards,
            self.button("すべての制作実績（{} 件）を見る".format(len(self.works)), "/works/"))

    def process(self):
        steps = "".join('<li class="process-step reveal"><span class="process-number">{}</span><h3>{}</h3><p>{}</p></li>'.format(
            esc(step["step"]), esc(step["title"]), esc(step["text"])) for step in self.content["process"])
        return '<section id="process" class="section section-alt"><div class="container">{}<ol class="process-grid stagger-grid">{}</ol></div></section>'.format(
            self.section_heading("PROCESS", "進め方"), steps)

    def about(self):
        person = self.person
        avatar = image({"src": person["photo"], "alt": person["name"]}) if person["photo"] else '<span>{}</span>'.format(esc(person["initial"]))
        facts = "".join('<li class="status-pill">{}{}</li>'.format(icon("check"), esc(fact)) for fact in person["facts"])
        bio = "".join("<p>{}</p>".format(esc(line)) for line in person["bio"])
        skills = "".join('<li class="chip">{}</li>'.format(esc(skill)) for skill in person["skills"])
        links = "".join(self.button(link["label"], link["url"], external=True, glyph="github") for link in person["links"])
        return (
            '<section id="about" class="section"><div class="container">{}<div class="about-grid">'
            '<div class="avatar reveal"{}>{}</div><div class="about-copy reveal"><h3>{}</h3><p class="tagline">{}</p>'
            '<ul class="fact-list">{}</ul><div class="bio">{}</div><ul class="skill-list">{}</ul>'
            '<div class="button-row">{}</div></div></div></div></section>'
        ).format(self.section_heading("ABOUT", "自己紹介"), ' aria-hidden="true"' if not person["photo"] else "",
                 avatar, esc(person["name"]), esc(person["tagline"]), facts, bio, skills, links)

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
                control = '<select {}>{}</select>'.format(attrs, options)
            else:
                control = '<input {} type="{}"{}>'.format(attrs, esc(field["type"]),
                    ' autocomplete="{}"'.format(autocomplete[field["name"]]) if field["name"] in autocomplete else "")
            fields.append('<div class="form-field"><label for="{}">{}</label>{}</div>'.format(esc(field_id), esc(field["label"]), control))
        platforms = "".join(self.button(platform["label"], platform["url"], external=True)
                            for platform in contact["platforms"] if platform["url"])
        action = contact["form_action"].strip()
        return (
            '<section id="contact" class="section section-alt"><div class="container contact-grid">'
            '<div class="contact-copy">{}<p>{}</p><p class="contact-note">{}</p>{}</div>'
            '<div class="contact-card"><form{} data-action="{}" data-success="{}" data-error="{}" method="post">{}'
            '<button class="button button-primary submit-button" type="submit"{}>送信する{}</button>'
            '<p class="form-status" role="status" aria-live="polite" aria-atomic="true"></p>'
            '{}</form></div></div></section>'
        ).format(self.section_heading("CONTACT", contact["heading"]), esc(contact["lead"]), esc(contact["note"]),
                 '<div class="button-row">{}</div>'.format(platforms) if platforms else "",
                 # 送信先があるときは action も付けて JS 無効でも通常 POST で送れるようにする（JS 有効時は fetch で横取り）
                 ' action="{}"'.format(esc(action)) if action else "",
                 esc(action), esc(contact["success_text"]), esc(contact["error_text"]),
                 "".join(fields), "" if action else " disabled", icon("arrow"),
                 "" if action else '<noscript><p class="form-status">{}</p></noscript>'.format(esc(contact["error_text"])))

    def home(self):
        return self.page("/", self.site["title"], self.site["description"],
                         self.hero() + self.services() + self.featured() + self.process() + self.about() + self.contact())

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
        links = "".join(self.button(link["label"], link["url"], primary=i == 0, external=True) for i, link in enumerate(work["links"]))
        metadata = '<div><dt>担当</dt><dd>{}</dd></div><div><dt>技術</dt><dd><ul class="skill-list">{}</ul></dd></div>'.format(esc(work["role"]), stack)
        if links:
            metadata += '<div><dt>リンク</dt><dd class="button-row">{}</dd></div>'.format(links)
        gallery = "".join('<div class="visual-panel gallery-item reveal">{}</div>'.format(visual_markup(v)) for v in visuals[consumed:])
        previous = '<span></span>'
        following = '<span></span>'
        if index > 0:
            previous_work = self.works[index - 1]
            previous = '<a rel="prev" href="/works/{}/">{}<span>前の実績: {}</span></a>'.format(
                esc(previous_work["slug"]), icon("arrow", "arrow-back"), esc(previous_work["title"]))
        if index + 1 < len(self.works):
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
        og_image = next((v["src"] for v in visuals if v["type"] == "image"), "/assets/works/sweepfield-1.jpg")
        return self.page("/works/{}/".format(work["slug"]), work["title"] + " — " + self.site["name"],
                         work["summary"], body, og_image=og_image, detail=True)

    def outputs(self):
        result = {"index.html": self.home(), "works/index.html": self.listing()}
        paths = ["/", "/works/"]
        for index, work in enumerate(self.works):
            result["works/{}/index.html".format(work["slug"])] = self.detail(work, index)
            paths.append("/works/{}/".format(work["slug"]))
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
