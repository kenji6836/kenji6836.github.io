# Task: 「家は、どこに建っているのか。」— 物語型データビジュアライゼーションの高忠実度プロトタイプ（あなた独自のデザイン案）
<!-- R5 delegate spec（delegate.sh --spec の入力・第二系 gpt-6-astra 向け・Claude が検収）。ユーザー向け文書ではない -->

## Context
- ポートフォリオサイト（kenji6836.github.io・白基調・ブランド青 #2457e6・Noto Sans JP）の「データ・見える化」実績として、自主制作の公共データ可視化ページ `/viz/` を作る。デザイン賞（Information is Beautiful Awards / Malofiej）級の **センスと技術** を見せることが目的。
- 主系（Claude）も別案を作る。あなたの案は **独立したデザイン案** として並べて人間が選ぶ。凡庸な案（ワイヤーフレーム的・テンプレ的・「AI が作った」感のあるダークダッシュボード）は不採用になる。The Pudding・NYT Graphics・Reuters Graphics・FT Visual の実物水準を目標にすること。
- データは整形済み: `viz/data/data.js`（`window.VIZ`）。読むだけ。構造:
  - `years_h` 1951–2025（75 年）・`years_p` 2000–2024（25 年）・`national_h[]`・`national_p[]`
  - `prefs[47]`: `{code, name, short, en, region, h[75], p[25], path, c}`。`h` = 新設住宅着工戸数（戸・null あり: 沖縄 1951–1972）、`p` = 人口（人・千人単位を ×1000）、`path` = SVG path（viewBox は `map.viewBox` = "0 0 1000 990"・沖縄は左下へ移動済み）、`c` = 重心 [x,y]
  - `sources.credit_estat` / `sources.credit_map` = ページ末尾に必ず表示する出典文言（原文のまま）
- 物語の事実（データから計算済み・本文に使ってよい）: 1973 年 1,905,112 戸（ピーク）→ 2025 年 740,667 戸（39%・1963 年以来の低さ）／人口は 2008 年 1 億 2,808 万でピーク → 2024 年 1 億 2,380 万／2000→2024 で人口が減った県は 39／2000→2024 で着工が増えた県は熊本だけ（+10.6%）・高知 −67.9%・秋田 −66.8%・青森 −63.7%／2024 年の人口 1,000 人あたり着工: 東京 8.7・熊本 8.5・大阪 7.9・宮城 7.6・愛知 7.5 … 青森 3.7・秋田 3.4・高知 3.1（全国 2000 年 9.7 → 2024 年 6.4）。原因の推測（半導体工場・震災など）は書かない。

## Allowed files
- `viz-astra/index.html`（新規・自己完結）
- `viz-astra/style.css`・`viz-astra/app.js`（新規・任意。index.html に inline でもよい）
- `viz-astra/NOTES.md`（新規・設計意図 10 行以内: コンセプト／構成／配色／タイポ／モーション／技術）

## Forbidden
- 上記以外のファイルの変更・作成（`viz/` `site/` `assets/` `index.html` など既存物は読むだけ）
- 外部依存: npm・CDN・外部 script/css（許可する外部は Google Fonts の `fonts.googleapis.com` / `fonts.gstatic.com` のみ）。画像は使わない（すべて SVG/Canvas/CSS で描く）
- ネットワーク取得: データは `../viz/data/data.js` を `<script src>` で読む（file:// でも動く）
- 文言の捏造: 数字は data.js から計算した値だけ。顧客名・受賞歴の捏造禁止。「副業」「会社員」「想定案件」「モック」「準備中」を書かない
- 二軸チャート（y 軸 2 本）・レインボー配色・円グラフ
- 数値のラウンド: 千人単位の人口で割る「千人あたり」は小数 1 桁まで

## Acceptance（ホスト側で実行）
- `python3 -c "import re,sys;s=open('viz-astra/index.html',encoding='utf-8').read();assert '<html' in s and 'data.js' in s;assert not re.search(r'<script[^>]+src=\"https?://(?!fonts\\.googleapis)',s);assert not re.search(r'<link[^>]+href=\"https?://(?!fonts\\.g)',s);assert not re.search(r'副業|会社員|想定案件|モック|準備中|TODO|lorem',s);print('ok')"`
- `test -f viz-astra/NOTES.md`
- 手動（Claude が headless Chrome で確認）: 1280px と 390px で横スクロールなし・文字の重なりなし／ダーク or ライトのいずれかに **意図を持って** コミットしていること／`prefers-reduced-motion: reduce` でアニメーションが止まり全内容が読めること／JS 無効でも見出し・本文・出典が読めること

## Implementation notes（一意な指示。ここに無い細部はあなたの判断＝それがデザイン案）
- 構成は最低 3 段: ① 導入（ヒーロー）② スクロール連動で図が変化する物語（3〜5 ステップ）③ 触れる探索（47 都道府県のマップ or 散布図。hover ツールチップ必須・click で固定）。④ 表と出典（`<details>` 折りたたみ可・出典文言 2 つを原文のまま）
- **技術を見せる**: 例 — 47 都道府県の同じマーク（点・矩形）が段を跨いで **位置と形をトゥイーン** して並び替わる（タイムライン → ランキング → 地図座標 → 散布図）／Canvas 2D で 1 点＝1,000 戸の粒子（74 万戸＝741 粒子）／数字のカウントアップ／スクロール量でスクラブする年表。requestAnimationFrame ベース・60fps・依存ゼロで書くこと
- **センスを見せる**: 見出しのタイポグラフィ（書体の対比・字間・サイズの階層）・余白・1 色の強調と灰色の抑制・注釈（annotation）の置き方。色は「1 つの強調色 + 灰色 + 順序ランプ（1 色の明暗）」を基本に。色覚多様性: 系列の識別を色だけに頼らない（直接ラベル）
- 390px: 図は画面上部に sticky（高さ 50vh 程度）・テキストは下から重なる／1280px: 図とテキストを横並び（sticky）
- `prefers-reduced-motion: reduce` で transition/animation を止める。`<noscript>` 用に最終状態の静的 SVG を 1 つ以上置く
- 見出し・本文は日本語。書体は Google Fonts から 2 書体まで（例: 明朝 × ゴシック、または 1 書体でウェイト対比）
- ページ最上部に小さく「自主制作（公共データを用いたビジュアライゼーション）」、最下部に出典文言 2 つと「取得日 2026-09-14」を表示
- NOTES.md にコンセプトを 1 行で言い切ること（例: 「75 年の山を、47 の点が降りていく」）。デザインの判断理由を書く
