# レーン S（4 SNS 運用キット）納品 — 2026-09-14

- `works.json` … 統合レーン向け。`replaces` で `sns-feed-plan`（架空カフェ）を `sns-4-platform-kit` に差替え。件数 17 のまま・hero.stats 差分なし・新規画像なし（mock 3 種: flow / calendar / insight）
- `apply_works.py` … works.json を content.json に適用する補助（`python3 site/lanes/s/apply_works.py` → `python3 site/build.py` → `python3 site/tests/check_site.py`）。レーン S の検査で PASS 済み（2026-09-14）
- 運用キット本体（人間用・公開しない）: `~/Workspace/docs/hp-level-up-20260914/sns-kit.html`・承認キュー `sns-queue.json`
- 「運用中」表記は各 SNS の初回投稿 URL＋開始日を人間が確認してから。それまで本エントリの文言のまま
- 統合後に削除してよい旧素材: `remove_after_merge` 参照（sns-post-1..9.jpg・sns-avatar.jpg・site/src/sns/）
