# サイトのビルド

Python 3.9 以降の標準ライブラリのみを使用します。
リポジトリルートで `python3 site/build.py` を実行します。
入力は `site/content.json`、原本は `site/templates/` と `site/static/` です。
生成ファイルとの一致確認: `python3 site/build.py --check`。
確認用一時ファイルは `.dd/` 内に生成し、自動で片付けます。
プレビュー: `python3 -m http.server 8765` → `http://127.0.0.1:8765/`。
フォーム送信先が空の場合は送信せず、設定されたエラー文を表示します。
受入テスト: `python3 site/tests/check_site.py`（ビルド冪等・リンク・画像・禁止語・タイル→一覧→詳細の到達）。
表示確認（Node 24+・Chrome）: `node site/tools/cdp-shot.mjs http://127.0.0.1:8765/ 390 out.png [dark] [rm] [fold]`／横はみ出し検査: `node site/tools/cdp-eval.mjs <url> 390 844`。
　`--window-size=390` の単純 headless 撮影は最小ウィンドウ幅の制約で幅が合わないため、上記の CDP エミュレーションを使う。
問い合わせフォーム: Google フォーム（Apps Script `createContactForm` で作成・回答はスプレッドシート＋メール通知）。`content.json` の `contact.form_action` と各 `entry` が送信先。
　TODO（統合レーン I・2026-09-14）: 任意欄「ご予算感」「参考にしたいサイト・アプリ」は `entry` が空（Google フォーム側に項目が無い）。フォーム側の項目追加は統合時に Chrome で行い、発行された `entry.xxxx` を `content.json` に書いてから公開する。空のままでも送信は通るが、その 2 項目はフォームに記録されない。
Phase 2（2026-09-13）: 動画・広告・SNS の自主制作サンプルの原本は `site/src/{video,ad,sns}/`（HTML/SVG）。実寸レンダは `node site/tools/cdp-render.mjs <url> <w> <h> <out> [--selector CSS] [--scale N]`、動画は `node site/tools/render-video.mjs`（フレーム撮影→ffmpeg）。`<video>` は autoplay 属性を付けず、`site.js` が動きを減らす設定でない場合に可視範囲でのみ再生する。
キャッシュ対策（2026-09-13）: build.py が画像・動画の URL に内容ハッシュ `?v=<sha1 8 桁>` を自動付与する。同名で差し替えても URL が変わるので、公開後にブラウザ/CDN の古い画像が残らない（check_site.py が `?v=` の有無を検査）。
レーン統合（2026-09-14・HP 底上げ計画）: 各レーンは `site/lanes/<x>/works.json`（works エントリ／categories の lead／featured／hero_stats）と素材だけを納品し、`content.json` は統合レーンだけが触る。
　`python3 site/tools/merge_lanes.py --dry-run` で差分要約 → `--apply` で `content.json` へ冪等に反映（slug 一致は置換・無ければ追加・hero.stats は works の実数から再計算）→ `python3 site/build.py` → `python3 site/tests/check_site.py`。壊れたスニペットは理由つきで skip され exit 1。
　単体テスト: `python3 site/tests/test_merge_lanes.py`。独立ページ（`/lp/ /app/ /viz/ /demos/ /dashboard/ /cases/` 配下の index.html）は check_site.py が存在するときだけ同じ検査を掛ける（lang・title・description・img alt・外部 script/css・内部リンク・_blank noopener・video muted/playsinline・禁止語）。
トップの構成（2026-09-22・視覚主体）: `hero.catch`＋`tagline`＋ボタン 1 つ → `hero.band`（作品スクショが流れる帯 2 段。`{"work","visual"[,"item"]}` で作品のビジュアルを参照）→ `entry.items`（5 分類タイル: 題名・アイコン・スクショ・リンク先）→ `featured`（大サムネ 12 件。短い題名・使うビジュアル・種別札は `featured_cards[slug]`）→ できること（`categories`）→ `process.steps`（4 ステップ・`note` が見出し横の 1 行）→ 自己紹介（`hero.stats` を数字で表示）→ 相談フォーム。
　帯の画像の選び方: ぱっと見で何か分かる画面（写真・図・盤面・大きな見出し）を優先し、文字だけの画面や事例ページの表は入れない。
一覧の先頭（2026-09-22・視覚主体）: `listing.band`（`hero.band` と同じ `{"work","visual"[,"item"]}` の並び・1 段）が `/works/` の見出し直下に、実物の画面が流れる大きめの帯（`band-solo`: 高さ clamp(200px, 30vw, 320px)）として出る。選び方はトップの帯と同じ。空なら従来どおり見出しだけ。
一覧から外す（2026-09-22）: works エントリに `"hidden": true` を付けると、一覧・トップの帯/featured・サイトマップ・`hero.stats` の件数・前後リンクから外れる。作品ページ `/works/<slug>/` は生成され続け、直リンク（事例ページなど）は生きる。データは消さない。
一覧の「扱うもの」（2026-09-22）: works エントリの `tools`（アイコン id の文字列、または `{"icon","label"}`・最大 4 つ目安）がカード上の線画アイコン＋短い語になり、先頭がサムネ左上の札。既定ラベルは `tools_legend`、無い作品は分類のアイコンで代用。公式ロゴ（Slack・LINE・Gmail 等）は使わず中立の線画（`site/templates/icons.svg`）で表す。カードの浮き上がり・ホバーは `site.css`（`card-enter`・`hover: hover`）、動きを減らす設定では止まる。
