#!/usr/bin/env python3
"""各レーンの納品スニペット site/lanes/<x>/works.json を site/content.json へ冪等に反映する（stdlib のみ・Python 3.9+）。

使い方（リポジトリルートで）:
  python3 site/tools/merge_lanes.py --dry-run   # 差分要約だけ表示（書き込まない）
  python3 site/tools/merge_lanes.py --apply     # content.json を書き換える → python3 site/build.py → python3 site/tests/check_site.py

スニペット（site/lanes/<x>/works.json）の形:
  {
    "works":      [ <content.json の works と同じ形のエントリ>, ... ],   # slug 一致で置換・無ければ追加
    "categories": {"<id>": {"lead": "..."}},                            # 任意・カテゴリの lead を上書き
    "featured":   ["<slug>", ...],                                       # 任意・注目枠に無ければ先頭へ挿入（既にあれば位置を維持）
    "hero_stats": {"<label>": {"value": "..", "unit": ".."}}            # 任意・3 区分（自動再計算）以外の項目だけ反映
  }
  works エントリの並び指定（任意・書き込み時に除去）: "_after": "<slug>"（その直後へ）／"_position": <int>（0 始まり）
  置換のときは既存の位置を保つ（並び指定があればそこへ移動）。
  納品実態に合わせた受理（2026-09-14・レーン D/W/V の形）:
    "categories_lead": {"<id>": "..."}  は categories:{id:{lead}} と同じ扱い（両方で同じ id を指定したら error）
    レーンのメタ情報（lane / branch / generated / delivered_at / note / notes / merge_rule / pages / assets /
    independent_pages / kit / links_note / self_checks / hero_stats_delta / hero_stats_diff / featured_suggestion）は
    検証・反映せず note として表示するだけ（featured と hero.stats は統合レーンが決める）
    links[].url はサイト内パス（"/viz/" のように "/" 始まり）も可。リポジトリに実在しなければ error

hero.stats は works の実数から常に再計算する（check_site.py と同じ規則 = hero_stat_counts）:
  App Store 公開アプリ = label public かつ categories に app かつ apps.apple.com へのリンクあり
  公開ツール・デモ     = それ以外の label public
  自主制作サンプル     = label self
壊れたスニペットは理由つきで skip し、他のスニペットは処理したうえで exit 1 で終わる。
"""

import argparse
import copy
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
SOURCE = TOOLS.parent
DEFAULT_ROOT = SOURCE.parent
DEFAULT_CONTENT = "site/content.json"
DEFAULT_LANES = "site/lanes"

# ---- hero.stats（check_site.py が import して同じ規則で検査する） ----
STAT_APPS = "App Store 公開アプリ"
STAT_PUBLIC = "公開ツール・デモ"
STAT_SELF = "自主制作サンプル"
STAT_UNITS = {STAT_APPS: "本", STAT_PUBLIC: "件", STAT_SELF: "件"}
STAT_LABELS = (STAT_APPS, STAT_PUBLIC, STAT_SELF)
APP_STORE_PREFIX = "https://apps.apple.com/"

# ---- 検証規則（check_site.py の禁止語と同じ） ----
FORBIDDEN = ["副業", "会社員", "想定案件", "モック", "準備中", "Lorem", "TODO", "{{", "}}"]
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
REQUIRED_WORK_KEYS = {
    "slug": str, "title": str, "kicker": str, "categories": list, "label": str, "year": str,
    "summary": str, "role": str, "points": list, "stack": list, "links": list, "visuals": list,
}
DIRECTIVES = ("_after", "_position")
FEATURED_MAX = 6  # 目安（超えても書き込むが注意を出す）
SNIPPET_KEYS = {"works", "categories", "categories_lead", "featured", "hero_stats"}
# レーンが添える説明用のキー。検証も反映もしない（note に出すだけ）
META_KEYS = {"lane", "branch", "generated", "delivered_at", "note", "notes", "merge_rule", "pages", "assets",
             "independent_pages", "kit", "links_note", "self_checks", "hero_stats_delta", "hero_stats_diff",
             "featured_suggestion"}
NOTED_META = ("featured_suggestion", "hero_stats_delta", "hero_stats_diff")


def is_app_store_app(work):
    return (work.get("label") == "public" and "app" in work.get("categories", [])
            and any(str(link.get("url", "")).startswith(APP_STORE_PREFIX) for link in work.get("links", [])))


def hero_stat_counts(works):
    """3 区分の件数。合計は works の件数と一致する（label が public/self のみのとき）。"""
    apps = sum(1 for w in works if is_app_store_app(w))
    public = sum(1 for w in works if w.get("label") == "public") - apps
    self_made = sum(1 for w in works if w.get("label") == "self")
    return {STAT_APPS: apps, STAT_PUBLIC: public, STAT_SELF: self_made}


def recalc_hero_stats(content):
    """hero.stats を 3 区分の実数で作り直す。3 区分以外の項目（スニペット由来）は後ろに残す。"""
    counts = hero_stat_counts(content["works"])
    extras = [s for s in content["hero"].get("stats", []) if s.get("label") not in STAT_LABELS]
    stats = [{"value": str(counts[label]), "unit": STAT_UNITS[label], "label": label} for label in STAT_LABELS]
    content["hero"]["stats"] = stats + extras
    return stats


# ---- build.py を使った描画プローブ（visuals が実際に描けるかを build 本体の関数で確かめる） ----
_build_module = None


def build_module(root):
    global _build_module
    if _build_module is None:
        spec = importlib.util.spec_from_file_location("hp_build", str(SOURCE / "build.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _build_module = module
    _build_module.ROOT = Path(root)
    _build_module.image_size.cache_clear()
    _build_module.asset_url.cache_clear()
    return _build_module


def walk_strings(value, path=""):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, item in value.items():
            for found in walk_strings(item, "{}.{}".format(path, key) if path else str(key)):
                yield found
    elif isinstance(value, list):
        for index, item in enumerate(value):
            for found in walk_strings(item, "{}[{}]".format(path, index)):
                yield found


def internal_path_exists(root, url):
    """サイト内パス（"/viz/"・"/cases/aso/"・"/x.pdf"）が公開ディレクトリに実在するか（check_site.py の resolve と同じ規則）。"""
    path = url.split("#")[0].split("?")[0].lstrip("/")
    target = os.path.join(root, path) if path else root
    if os.path.isdir(target):
        target = os.path.join(target, "index.html")
    return os.path.isfile(target)


def validate_work(work, content, root, seen_slugs):
    errors = []
    if not isinstance(work, dict):
        return ["works entry is not an object"]
    slug = work.get("slug")
    where = "works[{}]".format(slug if isinstance(slug, str) else "?")
    for key, kind in REQUIRED_WORK_KEYS.items():
        if key not in work:
            errors.append("{}: missing key '{}'".format(where, key))
        elif not isinstance(work[key], kind):
            errors.append("{}: '{}' must be {}".format(where, key, kind.__name__))
    if errors:
        return errors
    if not SLUG_RE.match(slug):
        errors.append("{}: slug must match {}".format(where, SLUG_RE.pattern))
    if slug in seen_slugs:
        errors.append("{}: duplicate slug in snippet".format(where))
    known_cats = {c["id"] for c in content["categories"]}
    if not work["categories"]:
        errors.append("{}: categories is empty".format(where))
    for cat in work["categories"]:
        if cat not in known_cats:
            errors.append("{}: unknown category '{}'".format(where, cat))
    if work["label"] not in content["labels"]:
        errors.append("{}: unknown label '{}' (expected one of {})".format(where, work["label"], sorted(content["labels"])))
    for key in ("points", "stack"):
        if not all(isinstance(item, str) for item in work[key]):
            errors.append("{}: '{}' must be a list of strings".format(where, key))
    for index, link in enumerate(work["links"]):
        if not isinstance(link, dict) or not isinstance(link.get("label"), str) or not isinstance(link.get("url"), str):
            errors.append("{}: links[{}] needs string 'label' and 'url'".format(where, index))
        elif link["url"].startswith("/"):
            if not internal_path_exists(root, link["url"]):
                errors.append("{}: links[{}] internal url '{}' does not exist in the repository".format(where, index, link["url"]))
        elif not link["url"].startswith(("https://", "http://")):
            errors.append("{}: links[{}] url must be absolute http(s) or a site path starting with '/'".format(where, index))
    if not work["visuals"]:
        errors.append("{}: visuals is empty (detail page needs at least one)".format(where))
    for key in work:
        if key.startswith("_") and key not in DIRECTIVES:
            errors.append("{}: unknown directive '{}' (allowed: {})".format(where, key, ", ".join(DIRECTIVES)))
    if "_after" in work and not isinstance(work["_after"], str):
        errors.append("{}: '_after' must be a slug string".format(where))
    if "_position" in work and (isinstance(work["_position"], bool) or not isinstance(work["_position"], int)):
        errors.append("{}: '_position' must be an integer".format(where))
    for path, text in walk_strings({k: v for k, v in work.items() if not k.startswith("_")}):
        hit = [w for w in FORBIDDEN if w in text]
        if hit:
            errors.append("{}: forbidden word {} in {}".format(where, hit, path))
    if errors:
        return errors
    # 描画プローブ: 画像・動画の実在、mock の kind と必須キーを build.py の関数そのもので確かめる
    build = build_module(root)
    for index, visual in enumerate(work["visuals"]):
        try:
            build.visual_markup(visual)
            build.visual_markup(visual, True)
        except Exception as exc:  # noqa: BLE001 - 理由をそのまま報告する
            label = visual.get("type", "?") if isinstance(visual, dict) else "?"
            if isinstance(visual, dict) and "kind" in visual:
                label += "/" + str(visual["kind"])
            errors.append("{}: visuals[{}] ({}) cannot render: {}: {}".format(where, index, label, type(exc).__name__, exc))
    return errors


def normalize_categories(data):
    """categories_lead:{id:"..."} を categories:{id:{lead}} へ寄せる（data を書き換える）。矛盾は理由のリストで返す。"""
    errors = []
    leads = data.get("categories_lead")
    if leads is None:
        return errors
    if not isinstance(leads, dict) or not all(isinstance(v, str) for v in leads.values()):
        return ["'categories_lead' must be an object of category id -> lead string"]
    cats = data.get("categories")
    if cats is None:
        cats = data["categories"] = {}
    if not isinstance(cats, dict):
        return errors  # 形の誤りは validate_snippet 側が報告する
    for cat_id, lead in leads.items():
        if cat_id in cats:
            errors.append("categories_lead.{}: also given in 'categories' (specify one)".format(cat_id))
        else:
            cats[cat_id] = {"lead": lead}
    del data["categories_lead"]
    return errors


def validate_snippet(data, content, root):
    """壊れている理由のリストを返す（空なら合格）。"""
    errors = []
    if not isinstance(data, dict):
        return ["top level must be an object"]
    for key in data:
        if key not in SNIPPET_KEYS and key not in META_KEYS:
            errors.append("unknown top-level key '{}' (allowed: {})".format(key, ", ".join(sorted(SNIPPET_KEYS))))
    errors.extend(normalize_categories(data))
    works = data.get("works", [])
    if not isinstance(works, list):
        errors.append("'works' must be a list")
        works = []
    seen = set()
    for work in works:
        errors.extend(validate_work(work, content, root, seen))
        if isinstance(work, dict) and isinstance(work.get("slug"), str):
            seen.add(work["slug"])
    cats = data.get("categories", {})
    known_cats = {c["id"] for c in content["categories"]}
    if not isinstance(cats, dict):
        errors.append("'categories' must be an object keyed by category id")
    else:
        for cat_id, update in cats.items():
            if cat_id not in known_cats:
                errors.append("categories.{}: unknown category".format(cat_id))
            elif not isinstance(update, dict) or set(update) != {"lead"} or not isinstance(update["lead"], str):
                errors.append("categories.{}: only {{\"lead\": \"...\"}} is accepted".format(cat_id))
            elif any(w in update["lead"] for w in FORBIDDEN):
                errors.append("categories.{}: forbidden word in lead".format(cat_id))
    featured = data.get("featured", [])
    slugs = {w["slug"] for w in content["works"]} | seen
    if not isinstance(featured, list) or not all(isinstance(s, str) for s in featured):
        errors.append("'featured' must be a list of slugs")
    else:
        for slug in featured:
            if slug not in slugs:
                errors.append("featured: unknown slug '{}'".format(slug))
    stats = data.get("hero_stats", {})
    if not isinstance(stats, dict):
        errors.append("'hero_stats' must be an object keyed by label")
    else:
        for label, stat in stats.items():
            if not isinstance(stat, dict) or not isinstance(stat.get("value"), str) or not isinstance(stat.get("unit"), str):
                errors.append("hero_stats.{}: needs string 'value' and 'unit'".format(label))
    return errors


def place_work(works, entry, notes):
    """slug 一致なら置換（位置維持）、無ければ追加。_after/_position があればそこへ移動。"""
    slug = entry["slug"]
    clean = {k: v for k, v in entry.items() if not k.startswith("_")}
    index = next((i for i, w in enumerate(works) if w["slug"] == slug), None)
    replaced = index is not None
    changed_keys = []
    if replaced:
        old = works[index]
        changed_keys = sorted(k for k in set(old) | set(clean) if old.get(k) != clean.get(k))
        works.pop(index)
    target = index if replaced else len(works)
    if "_after" in entry:
        anchor = next((i for i, w in enumerate(works) if w["slug"] == entry["_after"]), None)
        if anchor is None:
            notes.append("works[{}]: _after '{}' not found, appended instead".format(slug, entry["_after"]))
            target = len(works)
        else:
            target = anchor + 1
    elif "_position" in entry:
        target = max(0, min(int(entry["_position"]), len(works)))
    works.insert(target, clean)
    return replaced, changed_keys


def merge_snippet(content, data):
    """検証済みスニペットを content（破壊的）へ反映し、要約を返す。"""
    summary = {"added": [], "replaced": [], "unchanged": [], "leads": [], "featured": [], "stats": [], "notes": []}
    for key in NOTED_META:
        if key in data:
            summary["notes"].append("{}: not applied (integration lane decides): {}".format(
                key, json.dumps(data[key], ensure_ascii=False)[:200]))
    for entry in data.get("works", []):
        replaced, changed = place_work(content["works"], entry, summary["notes"])
        if not replaced:
            summary["added"].append(entry["slug"])
        elif changed:
            summary["replaced"].append("{} ({})".format(entry["slug"], ", ".join(changed)))
        else:
            summary["unchanged"].append(entry["slug"])
    for cat_id, update in data.get("categories", {}).items():
        cat = next(c for c in content["categories"] if c["id"] == cat_id)
        if cat["lead"] != update["lead"]:
            summary["leads"].append(cat_id)
            cat["lead"] = update["lead"]
    new_featured = [s for s in data.get("featured", []) if s not in content["featured"]]
    if new_featured:
        content["featured"] = new_featured + content["featured"]
        summary["featured"] = new_featured
    for label, stat in data.get("hero_stats", {}).items():
        if label in STAT_LABELS:
            summary["notes"].append("hero_stats.{}: ignored (recalculated from works)".format(label))
            continue
        stats = content["hero"].setdefault("stats", [])
        current = next((s for s in stats if s.get("label") == label), None)
        wanted = {"value": stat["value"], "unit": stat["unit"], "label": label}
        if current is None:
            stats.append(wanted)
            summary["stats"].append(label)
        elif current != wanted:
            current.update(wanted)
            summary["stats"].append(label)
    return summary


def find_snippets(lanes_dir):
    if not os.path.isdir(lanes_dir):
        return []
    return sorted(
        os.path.join(lanes_dir, name, "works.json") for name in os.listdir(lanes_dir)
        if os.path.isfile(os.path.join(lanes_dir, name, "works.json"))
    )


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def dump_json(content):
    return json.dumps(content, ensure_ascii=False, indent=2) + "\n"


def run(root, content_path, lanes_dir, apply, out=sys.stdout):
    """戻り値: (exit_code, merged_content)。exit 1 = skip したスニペットがある。"""
    root = os.path.abspath(root)
    content_file = os.path.join(root, content_path)
    lanes_path = os.path.join(root, lanes_dir)
    with open(content_file, encoding="utf-8") as handle:
        original_text = handle.read()
    content = json.loads(original_text)
    before = copy.deepcopy(content)
    snippets = find_snippets(lanes_path)
    skipped = []
    if not snippets:
        print("no snippets under {} (hero.stats is still recalculated)".format(lanes_dir), file=out)
    for path in snippets:
        rel = os.path.relpath(path, root)
        try:
            data = load_json(path)
        except (OSError, ValueError) as exc:
            skipped.append((rel, ["invalid JSON: {}".format(exc)]))
            print("SKIP {}: invalid JSON: {}".format(rel, exc), file=out)
            continue
        errors = validate_snippet(data, content, root)
        if errors:
            skipped.append((rel, errors))
            print("SKIP {}:".format(rel), file=out)
            for error in errors:
                print("  - {}".format(error), file=out)
            continue
        summary = merge_snippet(content, data)
        parts = []
        if summary["added"]:
            parts.append("+{} ({})".format(len(summary["added"]), ", ".join(summary["added"])))
        if summary["replaced"]:
            parts.append("replaced {}".format("; ".join(summary["replaced"])))
        if summary["unchanged"]:
            parts.append("unchanged {}".format(", ".join(summary["unchanged"])))
        if summary["leads"]:
            parts.append("lead: {}".format(", ".join(summary["leads"])))
        if summary["featured"]:
            parts.append("featured: +{}".format(", ".join(summary["featured"])))
        if summary["stats"]:
            parts.append("hero_stats: {}".format(", ".join(summary["stats"])))
        print("OK   {}: {}".format(rel, " / ".join(parts) or "no change"), file=out)
        for note in summary["notes"]:
            print("  note: {}".format(note), file=out)
    recalc_hero_stats(content)
    old_stats = {s.get("label"): s.get("value") for s in before["hero"].get("stats", [])}
    print("hero.stats: " + ", ".join(
        "{} {}→{}".format(s["label"], old_stats.get(s["label"], "-"), s["value"]) for s in content["hero"]["stats"]), file=out)
    if len(content["featured"]) > FEATURED_MAX:
        print("note: featured has {} entries (> {})".format(len(content["featured"]), FEATURED_MAX), file=out)
    if len(content["hero"]["stats"]) > 3:
        print("note: hero.stats has {} entries (layout is 3 columns)".format(len(content["hero"]["stats"])), file=out)
    new_text = dump_json(content)
    changed = new_text != original_text
    if not changed:
        print("content.json: no change", file=out)
    elif apply:
        with open(content_file, "w", encoding="utf-8") as handle:
            handle.write(new_text)
        print("content.json: written ({} works, {} featured). next: python3 site/build.py && python3 site/tests/check_site.py".format(
            len(content["works"]), len(content["featured"])), file=out)
    else:
        print("content.json: would change ({} works, {} featured). run with --apply to write".format(
            len(content["works"]), len(content["featured"])), file=out)
    if skipped:
        print("RESULT: {} snippet(s) skipped".format(len(skipped)), file=out)
        return 1, content
    print("RESULT: OK", file=out)
    return 0, content


def main(argv=None):
    parser = argparse.ArgumentParser(description="レーン納品 site/lanes/*/works.json を site/content.json へ冪等に反映する")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="差分要約だけ表示する")
    mode.add_argument("--apply", action="store_true", help="content.json を書き換える")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="リポジトリルート（既定: このファイルから推定）")
    parser.add_argument("--content", default=DEFAULT_CONTENT, help="content.json の相対パス")
    parser.add_argument("--lanes", default=DEFAULT_LANES, help="スニペット置き場の相対パス")
    args = parser.parse_args(argv)
    code, _ = run(args.root, args.content, args.lanes, args.apply)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
