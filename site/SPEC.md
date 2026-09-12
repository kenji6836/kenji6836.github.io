# Task: 紹介HP v1（自己紹介＋実績ポートフォリオ）の静的サイトジェネレータとテンプレート一式を実装する

## Context
- 対象リポジトリ: /Users/kenji/Workspace/kenji6836.github.io（GitHub Pages・ルート配信・Jekyll は使わない）
- 読むだけ: `site/content.json`（全文言・作品・カテゴリ・ビジュアル定義の唯一のソース。**編集禁止**）、`site/tests/check_site.py`（受入テスト・編集禁止）、`assets/works/*`（実画面画像・編集禁止）、`/Users/kenji/Workspace/client-work/drafts/hp-redesign-20260913/bench/patterns.md`（ベンチマーク 10 サイトから抽出したデザイン規則。§Design recipe を踏襲）
- 前提知識: 現行の `index.html` / `style.css` は旧サイト。**全面置き換え**（参考にしなくてよい。旧 `style.css` は削除する）。`blockwise/` `apps/` `mission-control/` `baccarat/` `app-ads.txt` は App Store 審査の supportUrl 等で参照されている既存ページ → 変更禁止
- 来訪者: 日本の法人担当者・クラウドソーシングの発注者。目的は「この人に何を任せられるか」と「実際に動いている制作物」が 10 秒で分かること

## Allowed files（これ以外の変更・作成は禁止）
- `site/build.py`（新規・stdlib のみ・python3.9 互換）
- `site/templates/**`・`site/static/**`（新規・テンプレート/CSS/JS/SVG アイコンの原本。構成は任意）
- `site/README.md`（新規・ビルド手順 10 行以内）
- 生成物: `index.html`（上書き）・`works/index.html`・`works/<slug>/index.html`（14 件）・`assets/site.css`・`assets/site.js`・`sitemap.xml`・`.nojekyll`
- 削除: `style.css`、旧画像 `assets/blockwise.jpg` `assets/mission-control-hero.jpg` `assets/mission-control.jpg` `assets/reachlab.jpg` `assets/reversi-icon.png` `assets/sweepfield.jpg`

## Forbidden
- `site/content.json` `site/tests/**` `assets/works/**` の変更、`blockwise/ apps/ mission-control/ baccarat/ app-ads.txt` への接触
- 外部依存: npm・pip・CDN の JS/CSS・Web フォント以外の外部リソース（許可する外部は Google Fonts のみ: `fonts.googleapis.com` / `fonts.gstatic.com`）。画像はローカルのみ
- 文言の創作: 可視テキストは content.json の値と、UI ラベル（「すべて」「制作実績を見る」「詳細を見る」「前の実績」「次の実績」「送信する」「トップ」など最小限）だけ。会社名・顧客名・数字の捏造禁止。「副業」「会社員」「想定案件」「モック」「準備中」を書かない（テストで落ちる）
- `<p>` の長文化: 説明文は content.json の 1〜2 文まで。自分で補足文を足さない

## Acceptance
- 受入テストが green: `python3 site/tests/check_site.py`（`site/build.py --check` の冪等性・全ページの構文/リンク/画像/禁止語・タイル→一覧→詳細の到達・CSS/JS 条件・保護パス不変を確認する）
- `python3 site/build.py` が 3 秒以内に完走し、上記の生成物を全て書き出す。`--check` は「再生成した結果が既存ファイルと一致すれば 0、違えば 1 と差分ファイル名」を返す
- 生成 HTML に `{{` などのテンプレート残骸が無い
- 手動確認項目（実装者も headless Chrome で確認して報告に含めること。**URL はルート絶対なので file:// では開かない**。リポジトリルートで `python3 -m http.server 8765` を起動し `http://127.0.0.1:8765/` を撮る。Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,900 --screenshot=out.png http://127.0.0.1:8765/`）:
  1. 1280px ライト／`--force-dark-mode` ダーク／390px の 3 条件でトップ・一覧・詳細 1 件が崩れない（横スクロールなし・文字の重なりなし）
  2. reduced-motion で全アニメーション停止（CSS `@media (prefers-reduced-motion: reduce)`）
  3. JS 無効でも全コンテンツが読める（フィルタは全件表示・ナビは開いた状態か CSS のみで開閉）

## Implementation notes（一意な指示。ここに無い細部は patterns.md の recipe とベンチマーク SmartHR / freee の作法に合わせる）

### ビルド（site/build.py）
- 入力 `site/content.json` → 出力は Allowed files の生成物。テンプレートは Python 側の関数でも `site/templates/*.html` の単純置換でもよいが、**出力は決定的**（辞書順・タイムスタンプを埋め込まない）
- URL は全てルート絶対（`/works/<slug>/`・`/assets/...`）。`href` 末尾は `/`（GitHub Pages の index.html 解決に合わせる）
- 各ページ: `<html lang="ja">`・`<title>`・`meta description`・`meta viewport`・`link canonical`（`site.url` 基準）・OGP（`og:title` `og:description` `og:type` `og:url`。`og:image` は作品詳細では最初の `type=="image"` ビジュアル（image が 1 つも無い作品＝mock のみの場合と、それ以外のページは `/assets/works/sweepfield-1.jpg`）。値は `site.url` を付けた絶対 URL）・`meta name="color-scheme" content="light dark"`・`theme-color`
- `sitemap.xml` は全ページの `<loc>` のみ（lastmod 不要）
- `--check` は一時ディレクトリに生成して既存と比較（バイト一致）

### デザインシステム（assets/site.css・1 ファイル・≤ 60KB・CSS 変数）
- テーマ: **白基調・ブランド色 1 色**。ライト: `--bg:#ffffff --bg-alt:#f6f8fb --surface:#ffffff --text:#14171f --text-2:#4a5361 --text-3:#6b7480 --line:#e5e9f0 --brand:#2457e6 --brand-ink:#ffffff --brand-soft:#e9efff --brand-line:#c5d3fb --ok:#1a7f4b --ok-soft:#e3f5ea`。ダーク（`prefers-color-scheme: dark`）: `--bg:#0e1116 --bg-alt:#131820 --surface:#161b23 --text:#e9edf2 --text-2:#c3cbd6 --text-3:#97a3b1 --line:#2a323d --brand:#86a8ff --brand-ink:#0b1430 --brand-soft:#1b2540 --brand-line:#33487e --ok:#5fd394 --ok-soft:#14301f`
- 書体: Google Fonts `Noto Sans JP`（400/500/700/900・`display=swap`・`preconnect` 2 本）＋ `system-ui, -apple-system, "Hiragino Sans", sans-serif` フォールバック。見出しは `font-feature-settings:"palt"`・`letter-spacing:-.01em`・`line-height:1.3`。本文 16〜17px・`line-height:1.8`。H1 は `clamp(30px, 4.6vw, 54px)` weight 900、H2 は `clamp(24px, 3vw, 36px)` weight 800、セクションの英字キッカー（例 SERVICES）は 12px・letter-spacing .12em・ブランド色
- レイアウト: コンテナ 1200px・左右 padding `clamp(16px, 4vw, 32px)`・セクション上下 `clamp(64px, 9vw, 120px)`・グリッド gutter 24px。角丸 16px（カード）/ 12px（小要素）/ 999px（チップ・ボタン）。影は `0 1px 2px rgba(16,24,40,.05), 0 10px 30px rgba(16,24,40,.07)` 程度のソフトなもの。カードは 1px `--line` の枠＋白面
- ボタン: primary = ブランド色べた・白文字・pill・14〜16px・weight 700・hover で少し濃く＋ `translateY(-1px)`。secondary = 1px `--brand-line` 枠のゴースト。外部リンクには 16px の矢印アイコン
- アイコン: 全て**インライン SVG の線画**（24×24・stroke 1.75・`stroke="currentColor"`・fill none・round cap/join）。`<svg><symbol id="i-web">…` を各ページ先頭に 1 度だけ埋め込み `<use href="#i-…">` で参照。必要なシンボル: `web app automation design marketing data planning arrow external check mail sheet file cloud code model phone ticket moon box sun filter list menu close github`（content.json の `icon` 値と一致させる）
- モーション（`assets/site.js` ≤ 12KB・依存なし）: ① `.reveal` 要素を IntersectionObserver で表示時に `opacity 0→1, translateY(14px→0)` 480ms・同一グリッド内は 60ms ずつ遅延 ② ヒーローのデバイスは 6s の緩い上下フロート（振幅 6px） ③ カード hover で `translateY(-3px)`＋影強調 ④ ナビのモバイル開閉 ⑤ 一覧のカテゴリフィルタ ⑥ フォーム送信。**`prefers-reduced-motion: reduce` では①②③を無効**（`.reveal` は初期状態で可視・`animation:none`・`transition:none`）
- フォーカス: `:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px }`。スキップリンク `#main`。ランドマーク（header/nav/main/footer）。現在ページのナビに `aria-current="page"`
- コントラスト AA 以上。ダークでも画像フレームの枠が見えること

### 共通部品
- **ヘッダー**: `position: sticky; top:0`・半透明白＋`backdrop-filter: blur(10px)`・下線 1px。左: ワードマーク（小さなブランド色の角丸マーク＋ `person.name`）。右: `site.nav` のリンク（≥ 900px で横並び）＋ primary ボタン「相談する」(`/#contact`)。< 900px はハンバーガー（`button[aria-expanded]`＋ JS。JS 無効時は `<noscript>` で常時表示か `:target` 方式）
- **フッター**: ワードマーク・ナビ・GitHub リンク・`© 2026 <person.name>`・`site.footer_note`
- **作品カード**（トップの注目 6 件と一覧で共用）: 上部 = ビジュアル領域（`aspect-ratio: 4 / 3`・`--bg-alt` 面に薄いドット格子）に「最初のビジュアル」を描画 → image/phone: 端末フレーム（角丸 28px・黒 6px 枠・上部ノッチ不要・幅 42%・中央・下端を少しはみ出させて奥行き）／image/browser: ブラウザフレーム（上部 24px のバーに 3 点ドット・角丸 12px・幅 88%・下端はみ出し）／image/icon: 中央に 96px の iOS 角丸（`border-radius: 22.5%`）／mock: 下記モック描画を `data-compact` で縮小表示（`transform: scale(.72)` 等で領域に収める。はみ出しは `overflow:hidden`）。下部 = `kicker`（小・`--text-3`）・タイトル（h3・700）・カテゴリ名チップ（最大 2）・**ラベル pill**（`labels[label]`。public = 緑ドット＋`--ok-soft` 面、self = `--brand-soft` 面）。カード全体が `/works/<slug>/` へのリンク（`a` で包むか stretched-link）
- **端末フレーム内画像**: `<img loading="lazy" decoding="async" width height>`（ヒーローの 1 枚目のみ eager）。`object-fit: cover; object-position: top`

### モック描画（build.py 内で HTML/SVG を生成。content.json の `visuals[].type == "mock"`）
共通: 白いカード（角丸 16・1px 枠・薄い影）の中に「製品 UI の一部」を描く。ラベルは全て content.json の値。`role="img" aria-label="<title>"`。カード外に `title` を小見出しとして表示。線画アイコンは上記シンボルを使う。色はブランド色＋グレー＋ `--ok` のみ。
- `pipeline`: `steps` を横一列（< 640px は縦）に「アイコン丸（40px・`--brand-soft` 面）＋ label（700）＋ sub（12px）」で並べ、間を矢印（線＋三角・`--line`）で接続。`detail.kind == "table"` は下に 3 行の小さな表（`head`/`rows`・`caption` は右下に 11px で表示）、`detail.kind == "bars"` は 6 本の棒グラフ（高さ `values` 比例・最後の 1 本をブランド色・`label` を上に）
- `email`: 左に受信メールカード（`from` を小さく・`subject` を 700・`preview` を 2 行）→ 中央に分類チップ 3 つ（`classes`・`selected` だけブランド色べた）→ 右に返信下書きカード（`draft` を 3 行・右上に `badge` を `--ok-soft` の pill）。< 760px は縦積み
- `flow`: `pipeline` と同じ横列（4 ステップ）＋その下に `timeline`（横一直線に 4 つの点・`t` を上・`label` を下・最後の点だけブランド色べた、他は `--brand-line` の輪）
- `queue`: 上に `steps`（3 ステップの横列・pipeline と同じ部品）、下に `rows` を 3 行のリスト（左 = title・中 = `lane` チップ（"法人" はブランド色べた・他はグレー枠）・右 = budget を等幅寄り 12px）。右下に `caption` 11px
- `gate`: `criteria` 3 列（label 700・sub 12px・メーター = 高さ 8px の pill 型バー・`meter` 比率をブランド色で塗る・右端に `verdict` チップ）。下中央に `result` を大きめの pill（`--ok-soft`）・右下に `note` 11px

### ページ構成
**トップ `/index.html`**（セクション id は順に `top` `services` `works` `process` `about` `contact`）
1. ヒーロー: 2 カラム（≥ 980px。それ未満は縦・テキストが先）。左: H1 = `hero.headline`（`\n` で `<br>`。2 行目の「まとめて任せられます。」は `<span class="accent">` でブランド色）・`hero.sub`・ボタン 2 つ（primary = `cta_primary`・secondary = `cta_secondary`）・`hero.stats` を 3 つ横並び（数字 32〜40px weight 900＋単位・ラベル 13px `--text-3`）。右: **デバイスステージ** = `hero.visual` の 3 点を重ねる。中央奥に browser フレーム（reachlab-1・幅 78%）、その左手前に phone フレーム（sweepfield-1・幅 34%・少し下げる）、右下手前に小さな browser カード（mission-control-1・幅 46%）。背景に半径 60% の放射グラデ（ブランド色 8%→透明）と薄いドット格子。全体は `perspective` なしの平面・影で奥行き。フロート②は phone と小カードだけ位相をずらす
2. `services`: キッカー SERVICES／H2「任せられること」／リード 1 行は不要。`categories` 7 件のタイル: 線画アイコン（44px の `--brand-soft` 丸）・`name`（h3 18px 700）・`lead`（14px `--text-2`）・下部に「制作実績 N 件 →」（N = その id を含む works 数）。タイル全体が `/works/#cat=<id>` へのリンク。グリッド: ≥ 1100px 4 列（7 件なので 2 行目は 3 件・左寄せでよい）／≥ 640px 2 列／それ未満 1 列。hover: 枠がブランド色・`translateY(-3px)`
3. `works`: キッカー WORKS／H2「制作実績」／`featured` の 6 件を作品カードで 3 列（≥ 1000px）→ 2 列 → 1 列。下に secondary ボタン「すべての制作実績（14 件）を見る」→ `/works/`（件数は works の長さから算出）
4. `process`: キッカー PROCESS／H2「進め方」／`process` 4 件を横一列（数字 = ブランド色の 40px 丸に白文字・title 700・text 14px）。項目間を細い線で接続。< 800px は 2 列、< 520px は 1 列
5. `about`: キッカー ABOUT／H2「自己紹介」／2 カラム: 左 = アバター（`person.photo` が null のときは 160px の円にブランド色グラデ＋ `person.initial` を白 64px weight 900。photo があれば `<img>`）。右 = `person.name`（h3 28px）・`tagline`（18px `--text-2`）・`facts` をチップ 3 つ（`--ok-soft`・チェックアイコン）・`bio` を `<p>` 3 つ（16px）・`skills` をグレー枠チップ・`links` を secondary ボタン（GitHub アイコン）
6. `contact`: 背景 `--bg-alt`。2 カラム（≥ 900px）。左: キッカー CONTACT／H2 = `contact.heading`／`contact.lead`／`contact.note`（13px `--text-3`）／`platforms` のうち `url` が空でないものだけ secondary ボタンで表示（v1 は両方空なので**何も表示しない**）。右: フォームカード（白・角丸 16・影）。`form_fields` を順に描画（label 上・input 44px 高・角丸 10・1px `--line`・focus でブランド枠。select は `options`・textarea は 6 行）。送信ボタン = primary 幅 100%「送信する」。`form_action` が空文字のときは `<form data-action="">` とし、JS は送信時に `preventDefault` して `contact.error_text` を表示（送信先が設定されたら `fetch(action, {method:"POST", mode:"no-cors", body: FormData})` → 成功表示 `success_text`）。各 input の `name` は `entry` が空なら `name` を、あれば `entry` を使う（Google フォームの `entry.NNN` 形式）
   - 成功/失敗メッセージは `role="status"` の要素に表示

**一覧 `/works/index.html`**
- ページヘッダー: パンくず（トップ › 制作実績）・H1「制作実績」・リード = `site.footer_note`
- フィルタ: `role="tablist"` ではなく `button.chip[data-cat]` の並び（「すべて (14)」＋各カテゴリ名 (N)）。選択中はブランド色べた。クリックで `.card[data-cats]` を表示/非表示（`hidden` 属性）。読み込み時に `location.hash` が `#cat=<id>` なら該当を選択し、選択変更で `history.replaceState` で hash を更新。JS 無効時は全件表示
- カード: 作品カード（トップと同じ部品）を content.json の順で全 14 件・3 列 → 2 列 → 1 列。各 `article.card` に `data-cats="<space 区切りの id>"` を付ける

**詳細 `/works/<slug>/index.html`**
- パンくず（トップ › 制作実績 › タイトル）・`kicker`（12px 英字風ではなく日本語のまま・`--text-3`）・H1 = `title`・その下にラベル pill＋カテゴリ名チップ（各 `/works/#cat=<id>` へリンク）＋ `year`
- リード = `summary`（18px `--text-2`・最大 60ch）
- メインビジュアル = `visuals[0]` を大きく（image/phone は中央に幅 min(360px, 80%)、browser は幅 100%、icon は 3 つ横並び（`app-icons` のように icon が連続する場合は連続分をまとめて 1 行に）、mock はフルサイズ）。背景 `--bg-alt` の角丸 24px パネル・上下 padding 40px
- 「ポイント」: `points` をチェックアイコン付きカード（2 列 → 1 列）
- メタ: 3 カラムの定義リスト「担当」= `role` ／「技術」= `stack` チップ ／「リンク」= `links` を primary（1 つ目）と secondary（2 つ目以降）ボタン・`target="_blank" rel="noopener noreferrer"`・外部アイコン。`links` が空なら「リンク」列自体を出さない
- ギャラリー: `visuals[1:]` を 2 列（phone 同士は 3 列可）で描画（image はフレーム付き・mock はフルサイズ）。`app-icons` の 2 つ目以降の icon は上のメインにまとめたので重複表示しない
- 前後ナビ: content.json の順で「← 前の実績: タイトル」「次の実績: タイトル →」（端は片側のみ）
- CTA バンド: `--brand-soft` 面・角丸 24・「似た内容のご相談はこちら」＋ primary「相談する（無料）」→ `/#contact`

### 画像サイズ（`width`/`height` 属性の実値）
sweepfield-1/2/3 780×1695・blockwise-1/2/3 780×1688・reversi-1 660×1420・reachlab-1 1600×1000・reachlab-2 780×1688・mission-control-1 1600×700・kyotei-1 1600×500・store-listing-1 1600×1125・各 *-icon.png 512×512（build.py で PNG/JPEG ヘッダから読んでもよい・stdlib の struct で可）

## On ambiguity
不明点があれば推測実装せず、status="blocked" にして blockers に記載して停止すること。content.json の文言・構造を変えたくなった場合も blocked にして理由を書く（主系が判断する）。
