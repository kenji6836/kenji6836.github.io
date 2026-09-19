# レーン V 共通ルール（全サブエージェント必読）

- 作業ツリー: `/Users/kenji/Workspace/hp-lane-v`（git worktree・branch hp/v）。**この外に書かない**。`site/content.json` は読むだけ（変更禁止）。git 操作（add/commit/stash/checkout）は**しない**（本体が pathspec で commit する）
- 原本は `site/src/v/<area>/`、公開用の書き出しは `assets/works/v-<slug>-N.jpg|png|mp4|webm`（本体が最終配置を調整するので、まず `site/src/v/<area>/out/` に書き出してよい）
- 外部依存: npm/pip 追加なし・CDN 禁止。許可する外部は Google Fonts のみ（`fonts.googleapis.com` / `fonts.gstatic.com`）。画像はローカル
- 表記: 「自主制作」「自作」「サンプル」を正直に明記。顧客名・実績・数字の捏造禁止（数字は台帳/ログの実数か「サンプル」明記）。禁止語: 「副業」「会社員」「想定案件」「モック」「準備中」（受入テストで落ちる）。既存アプリ（Reversi/Sweepfield/Blockwise 等）を題材にしない
- ブランド（チャンネル）: `site/src/v/brand/brand.css` のトークンを使う（決定後に置かれる。無ければ BRIEF の暫定値）。HP のブランド青 `#2457e6`・Noto Sans JP・角丸 16/12/999・線画アイコン stroke 1.75
- レンダリング: `node site/tools/cdp-render.mjs <html> <w> <h> <out.png|jpg> [--selector CSS] [--scale N] [--quality Q] [--wait MS] [--eval JS]`（file:// 可・Google Fonts はネット経由で読める）。動画は `node site/tools/render-video.mjs <html> <outdir> <fps> <duration> [--frames i,j] [--from I --to J]` → ページ側に `window.__duration` と `window.__seek(t)`（`document.getAnimations()` を pause して currentTime=ms に固定・`site/src/video/promo.html` 末尾の実装をコピー）→ `ffmpeg -framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart out.mp4` と `-c:v libvpx-vp9 -b:v 0 -crf 32 out.webm`
- 実写風写真: `site/src/photos/*.jpg`（V が生成済み・用途は `site/src/photos/prompts.json`）。無い写真を新たに生成しない（本体に依頼する）
- Python: システム python3 は stdlib のみ。numpy/cv2 が要るときは `~/Workspace/app-factory/tools/imagegen/.venv/bin/python`
- 品質: 文字は 1080 幅で最小 40px（縦動画）・字幕は 2 行以内・無音でも意味が通る。生成イラストは使わない（写真・実画面・CSS/SVG のみ）。UI 風の図は「輪郭なし・2 段階陰影・光源統一・フラット」で HP と同じ語彙
- 報告: 詳細はファイル（`site/src/v/<area>/REPORT.md`）に書き、返答は「要約 10 行以内＋成果物パス一覧＋未確認事項」だけ。スクショで自分の目で確認してから完了と言う（H5: 実行した証拠のない完了報告は欠陥）
