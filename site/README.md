# サイトのビルド

Python 3.9 以降の標準ライブラリのみを使用します。
リポジトリルートで `python3 site/build.py` を実行します。
入力は `site/content.json`、原本は `site/templates/` と `site/static/` です。
生成ファイルとの一致確認: `python3 site/build.py --check`。
確認用一時ファイルは `.dd/` 内に生成し、自動で片付けます。
プレビュー: `python3 -m http.server 8765` → `http://127.0.0.1:8765/`。
フォーム送信先が空の場合は送信せず、設定されたエラー文を表示します。
