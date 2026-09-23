# kenji6836.github.io（紹介サイト）

## いちばん大事なこと
`index.html` と `works/**/index.html` は **生成物**。原本は `site/content.json`・`site/templates/`・`site/static/`。
生成物を直接編集しても、次の `python3 site/build.py` で消える（同じ直しが何度も消えた実績あり）。必ず原本を直す。

- 独立ページ（`lp/ app/ viz/ demos/ dashboard/ cases/` の配下）は手書きで、ビルドの対象外。触って試せる見本はここに置く。
- 見せ方を増やすときは `site/build.py` に visual の `type`/`kind` を足し、`site/static/site.css`・`site/static/site.js` に対応を書く。

## 終える前に必ず
```bash
python3 site/build.py && python3 site/tests/check_site.py
```
帯（トップと一覧の流れる画面）に画像を足したら `python3 site/tools/make_band_thumbs.py`（Pillow が要る）。
帯は最大 320px でしか表示しないので、原寸のまま載せるとスマホの初回表示が重くなる。写しが古いと受入テストが落ちる。
表示の確認（Node 24+・Chrome）: `node site/tools/cdp-shot.mjs <url> 390 out.png` ／ 横はみ出し: `node site/tools/cdp-eval.mjs <url> 390 844`。
ローカルの表示確認はサーバが要る（`python3 -m http.server 8765`）。サーバを立てられない時は、絶対パスを相対に直した写しを一時ディレクトリに作り、`file://` を上の道具で撮る。

## 文章の方針
道具名（サービス名・製品名）は出さない。何ができるかを平易な日本語で書く。`site/tests/check_site.py` の禁止語も参照。
