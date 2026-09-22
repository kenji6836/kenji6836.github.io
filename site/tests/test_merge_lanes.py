#!/usr/bin/env python3
"""merge_lanes.py の単体テスト（unittest・stdlib のみ）。リポジトリルートで `python3 site/tests/test_merge_lanes.py`（`-m unittest site/...` は stdlib の site と衝突する）。"""
import io
import json
import os
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import merge_lanes  # noqa: E402

PNG_HEADER = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + struct.pack(">II", 12, 24)  # image_size が読む先頭 24 バイトだけ


def work(slug, label="public", cats=("app",), links=(), src="/assets/works/x.png", **extra):
    entry = {
        "slug": slug, "title": slug.upper(), "kicker": "K", "categories": list(cats), "label": label, "year": "2026",
        "summary": "S", "role": "R", "points": ["p"], "stack": ["s"], "links": list(links),
        "visuals": [{"type": "image", "src": src, "alt": "A", "frame": "phone"}],
    }
    entry.update(extra)
    return entry


class MergeLanesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "assets/works"))
        os.makedirs(os.path.join(self.root, "site/lanes"))
        with open(os.path.join(self.root, "assets/works/x.png"), "wb") as handle:
            handle.write(PNG_HEADER)
        self.content = {
            "site": {"name": "T"},
            "hero": {"stats": [{"value": "0", "unit": "本", "label": merge_lanes.STAT_APPS}]},
            "categories": [{"id": "app", "name": "App", "icon": "app", "lead": "old lead"},
                           {"id": "web", "name": "Web", "icon": "web", "lead": "web lead"}],
            "labels": {"public": "公開中", "self": "自主制作"},
            "featured": ["one"],
            "works": [work("one", links=[{"label": "App Store", "url": "https://apps.apple.com/app/id1"}]),
                      work("two", label="self", cats=("web",))],
        }
        self.write_content(self.content)

    def tearDown(self):
        self.tmp.cleanup()

    def write_content(self, content):
        with open(os.path.join(self.root, "site/content.json"), "w", encoding="utf-8") as handle:
            handle.write(merge_lanes.dump_json(content))

    def read_text(self):
        with open(os.path.join(self.root, "site/content.json"), encoding="utf-8") as handle:
            return handle.read()

    def read_content(self):
        return json.loads(self.read_text())

    def write_snippet(self, lane, text):
        os.makedirs(os.path.join(self.root, "site/lanes", lane), exist_ok=True)
        with open(os.path.join(self.root, "site/lanes", lane, "works.json"), "w", encoding="utf-8") as handle:
            handle.write(text if isinstance(text, str) else merge_lanes.dump_json(text))

    def run_merge(self, apply):
        out = io.StringIO()
        code, merged = merge_lanes.run(self.root, "site/content.json", "site/lanes", apply, out=out)
        return code, merged, out.getvalue()

    def test_add_new_work_recalculates_stats_and_is_idempotent(self):
        self.write_snippet("w", {"works": [work("three", label="public", cats=("web",), _after="one")],
                                 "categories": {"web": {"lead": "new lead"}}, "featured": ["three"]})
        code, merged, log = self.run_merge(apply=False)
        self.assertEqual(code, 0, log)
        self.assertEqual(self.read_content()["works"][0]["slug"], "one")  # dry-run は書かない
        self.assertEqual(len(self.read_content()["works"]), 2)
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 0, log)
        saved = self.read_content()
        self.assertEqual([w["slug"] for w in saved["works"]], ["one", "three", "two"])
        self.assertNotIn("_after", saved["works"][1])
        self.assertEqual(saved["featured"], ["three", "one"])
        self.assertEqual(saved["categories"][1]["lead"], "new lead")
        stats = {s["label"]: s["value"] for s in saved["hero"]["stats"]}
        self.assertEqual(stats, {merge_lanes.STAT_APPS: "1", merge_lanes.STAT_PUBLIC: "1", merge_lanes.STAT_SELF: "1"})
        text_after_first = self.read_text()
        code, _, log = self.run_merge(apply=True)  # 2 回目は変更なし
        self.assertEqual(code, 0, log)
        self.assertIn("content.json: no change", log)
        self.assertEqual(self.read_text(), text_after_first)

    def test_replace_existing_work_keeps_position(self):
        self.write_snippet("a", {"works": [work("one", title="ONE v2", links=[{"label": "App Store", "url": "https://apps.apple.com/app/id1"}])]})
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 0, log)
        saved = self.read_content()
        self.assertEqual([w["slug"] for w in saved["works"]], ["one", "two"])
        self.assertEqual(saved["works"][0]["title"], "ONE v2")
        self.assertIn("replaced one (title)", log)
        self.assertEqual(len(saved["works"]), 2)

    def test_broken_json_is_skipped_with_reason_and_exit_1(self):
        self.write_snippet("d", '{"works": [ {"slug": "bad", ')
        self.write_snippet("s", {"works": [work("four", label="self", cats=("web",))]})
        before = self.read_text()
        code, merged, log = self.run_merge(apply=False)
        self.assertEqual(code, 1)
        self.assertIn("SKIP site/lanes/d/works.json: invalid JSON", log)
        self.assertIn("OK   site/lanes/s/works.json: +1 (four)", log)  # 壊れていない方は処理される
        self.assertEqual(self.read_text(), before)

    def test_missing_asset_and_forbidden_word_are_reported(self):
        self.write_snippet("v", {"works": [work("five", src="/assets/works/missing.png", summary="準備中のもの")]})
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 1)
        self.assertIn("forbidden word ['準備中'] in summary", log)
        self.assertNotIn("five", [w["slug"] for w in self.read_content()["works"]])
        self.write_snippet("v", {"works": [work("five", src="/assets/works/missing.png")]})
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 1)
        self.assertIn("visuals[0] (image) cannot render", log)

    def test_lane_metadata_and_categories_lead_are_accepted(self):
        # レーン D/W/V の納品形: メタキー＋categories_lead＋サイト内リンク
        os.makedirs(os.path.join(self.root, "viz"))
        with open(os.path.join(self.root, "viz/index.html"), "w", encoding="utf-8") as handle:
            handle.write("<html lang=\"ja\"></html>")
        self.write_snippet("d", {
            "lane": "d", "branch": "hp/d", "delivered_at": "2026-09-14", "note": "n", "self_checks": {"script": "x"},
            "hero_stats_delta": {"self_delta": 1}, "featured_suggestion": "swap mission-control",
            "categories_lead": {"web": "lead from lane"},
            "works": [work("viz", label="self", cats=("web",), links=[{"label": "作品を見る", "url": "/viz/"}])],
        })
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 0, log)
        saved = self.read_content()
        self.assertEqual([w["slug"] for w in saved["works"]], ["one", "two", "viz"])
        self.assertEqual(saved["categories"][1]["lead"], "lead from lane")
        self.assertEqual(saved["featured"], ["one"])  # featured_suggestion は反映しない
        self.assertIn("featured_suggestion: not applied", log)
        self.assertIn("hero_stats_delta: not applied", log)
        stats = {s["label"]: s["value"] for s in saved["hero"]["stats"]}
        self.assertEqual(stats[merge_lanes.STAT_SELF], "2")
        self.assertNotIn("categories_lead", saved)

    def test_hidden_work_is_kept_but_not_counted(self):
        # "hidden": true は一覧・トップ・サイトマップから外す印。works には残るが hero.stats には数えない
        self.write_snippet("h", {"works": [work("six", label="self", cats=("web",), hidden=True)]})
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 0, log)
        saved = self.read_content()
        self.assertEqual([w["slug"] for w in saved["works"]], ["one", "two", "six"])
        self.assertIs(saved["works"][2]["hidden"], True)
        stats = {s["label"]: s["value"] for s in saved["hero"]["stats"]}
        self.assertEqual(stats[merge_lanes.STAT_SELF], "1")
        self.assertEqual(merge_lanes.hero_stat_counts(saved["works"]), {merge_lanes.STAT_APPS: 1, merge_lanes.STAT_PUBLIC: 0, merge_lanes.STAT_SELF: 1})
        self.write_snippet("h", {"works": [work("six", label="self", cats=("web",), hidden="yes")]})
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 1)
        self.assertIn("'hidden' must be true/false", log)

    def test_internal_link_must_exist_and_lead_conflict_is_reported(self):
        self.write_snippet("w", {"works": [work("lp", cats=("web",), links=[{"label": "LP", "url": "/lp/missing/"}])]})
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 1)
        self.assertIn("internal url '/lp/missing/' does not exist", log)
        self.assertNotIn("lp", [w["slug"] for w in self.read_content()["works"]])
        self.write_snippet("w", {"categories": {"web": {"lead": "a"}}, "categories_lead": {"web": "b"}})
        code, merged, log = self.run_merge(apply=True)
        self.assertEqual(code, 1)
        self.assertIn("categories_lead.web: also given in 'categories'", log)
        self.assertEqual(self.read_content()["categories"][1]["lead"], "web lead")


if __name__ == "__main__":
    unittest.main()
