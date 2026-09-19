# レーン V 納品（hp/v）— 統合レーン向け

## merge 手順（3 行）
1. `git merge --no-ff origin/hp/v`（衝突しない: 触るのは site/src/v・site/src/photos・site/lanes/v・assets/works/v-*・design/・ads/ だけ。content.json と生成物は未変更）
2. `site/lanes/v/works.json` の `works`（4 件）を `site/content.json` の works 配列へ追記し、`categories_lead`（video/design/ad）と hero.stats「掲載中の制作実績」件数を反映 → `python3 site/build.py`
3. `python3 site/tests/check_site.py`（V 側でマージ状態を検査済み・PASS 2026-09-14 21:5x）→ 独立ページ `design/channel-brand/`・`design/mitsumori/`・`ads/mitsumori/` は check_site 対象外なので `node site/tools/cdp-eval.mjs <url> 390` で横はみ出し 0 を確認済み

## 注意
- `mitsumori-ads` と `mitsumori-design-system` の links に `/app/mitsumori/`（A レーン・9/18 目安）を含む。第 1 公開が A より先なら、そのリンクだけ外す（比較ページ・DS ページ内のリンクは相対で app を参照していない）
- 動画は check_site の 3MB 制限に合わせて再エンコード済み（assets/works）。SNS 投稿用マスターは `site/lanes/v/kit/shorts/*.mp4`
- 既存 works の `year` が全件 "2025"（実態は 2026）。V の 4 件も合わせて "2025" にしてある → 一括で直すなら統合時に
- featured への追加候補: `making-shorts`（動画が動く実物なので注目 6 件に入れる価値あり・判断は統合レーン）
- `site/src/v/assemble.py` を再実行すれば assets/works と独立ページを再配置できる（cv2 が要るので venv の python）
