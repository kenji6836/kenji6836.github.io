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
