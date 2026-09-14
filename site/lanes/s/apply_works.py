#!/usr/bin/env python3
"""レーン納品 works.json を content.json に適用する（レーン S の検査用・統合レーンも流用可）。
使い方: python3 site/lanes/s/apply_works.py [site/lanes/s/works.json] [site/content.json]
- replaces: {旧slug: 新slug} → 旧エントリの位置に新エントリを差し込む（featured 内の旧 slug も置換）
- replaces に無い works は末尾に追加
- categories[].lead を更新。hero_stats_delta は null のとき変更なし
"""
import json, sys

lane_path = sys.argv[1] if len(sys.argv) > 1 else "site/lanes/s/works.json"
content_path = sys.argv[2] if len(sys.argv) > 2 else "site/content.json"
lane = json.load(open(lane_path))
content = json.load(open(content_path))

replaces = lane.get("replaces", {})
by_slug = {w["slug"]: w for w in lane["works"]}
placed = set()
works = []
for w in content["works"]:
    new_slug = replaces.get(w["slug"])
    if new_slug and new_slug in by_slug:
        works.append(by_slug[new_slug]); placed.add(new_slug)
    else:
        works.append(w)
for w in lane["works"]:
    if w["slug"] not in placed:
        works.append(w)
content["works"] = works
content["featured"] = [replaces.get(s, s) for s in content.get("featured", [])]
for c in lane.get("categories", []):
    for cat in content["categories"]:
        if cat["id"] == c["id"]:
            cat["lead"] = c["lead"]
delta = lane.get("hero_stats_delta")
if delta:
    for s in content["hero"]["stats"]:
        if s["label"] in delta:
            s["value"] = str(delta[s["label"]])
json.dump(content, open(content_path, "w"), ensure_ascii=False, indent=2)
open(content_path, "a").write("\n")
print("applied", lane_path, "->", content_path, "works:", len(works))
