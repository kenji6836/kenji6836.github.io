# /viz/ 実装計画（レーン D・2026-09-14）
<!-- Claude/第二系向けの作業計画（R1 review --plan の入力）。ユーザー向け文書ではない -->

## 成果物
- `viz/index.html`（自己完結・Google Fonts のみ外部・JS 無効でも全チャートが静的 SVG で読める）
- `viz/viz.css`・`viz/viz.js`（依存ゼロ・≤ 40KB / ≤ 30KB）
- `viz/data/housing.json`（都道府県 47 × 1951–2025・戸）・`viz/data/population.json`（47 × 2000–2024・人）・`viz/data/japan.geojson`（119KB・簡略化済み）
- `site/lanes/d/works.json`（works エントリ 1 件・categories.data の lead 更新案・hero.stats 差分）・`assets/works/viz-1.jpg`（1280 スクショ）
- 生成器 `site/src/d/build_viz.py`（stdlib のみ。データ JSON → 静的 SVG を index.html に埋め込み。決定的出力）

## 構成（8 段・G1 で候補 A/B/C を選択。配色以外は共通）
0. 導入: ヒーロー数字（2025 年 74.1 万戸）＋ 1973 年 190.5 万戸との対比
1. 全国 75 年の折れ線（1951→2025）— 注釈 1973 / 2009 / 2025。scroll で線が描画（stroke-dashoffset）
2. 人口 1,000 人あたり（全国 9.7 → 6.4）— 指数 2000=100 で人口と着工を 1 軸に重ねる
3. 47 本に分解（2000→2024 変化率）— 灰色 47 本 + emphasis（熊本 / 高知 / 秋田 / 青森）
4. 千人あたりランキング棒（2024）
5. 触れる散布図（x 人口増減率 2000→2024 / y 千人あたり 2024）— hover ツールチップ・click で固定・地域ブロック 3 色
6. 都道府県マップ（choropleth）— 指標 3 種・年スライダー・click で県別の推移ミニチャート
7. 表ビュー（全値・`<details>`）＋ 出典（e-Stat 規定文言・国土数値情報 規定文言）＋ 手法 ＋ 「自主制作」明記

## 技術
- スクロール連動: IntersectionObserver（step ごとに `data-step` を sticky 図に反映）。図の更新は class 切替 + CSS transition（opacity / transform / stroke-dashoffset）中心。パス d のモーフはしない（60fps 維持）
- 地図: GeoJSON → 自前の等距円筒 + 縦横比補正で SVG path 化（build 時に Python で path 文字列を事前生成 → JS は fill だけ更新）。沖縄は左下インセット
- 散布図: 各点に 24px の透明ヒット領域・最近傍でツールチップ・キーボード（tab で各点にフォーカス）
- reduced-motion: `prefers-reduced-motion: reduce` で全 transition/animation を無効・sticky 図は最終状態で静止
- ダーク: 候補 A/C は prefers-color-scheme 両対応（CSS 変数）。候補 B はダーク固定
- 390px: sticky 図は上 52vh に固定、テキストは下から重なる。横スクロールなし（cdp-eval で検査）
- 配色: dataviz スキル validate_palette.js を light/dark ともに PASS 済み（A: #2457e6 #e0891f #1a7f4b／dark #3987e5 #d95926 #199e70。B/C 第 2 幕: #c98500 #199e70 #9085e9 on #0f1420）。sequential は 1 色ランプ・diverging は青↔赤（灰の中点）
- 検査: 自前スクリプト `site/src/d/check_viz.py`（外部 script/css なし・img alt・禁止語・`{{` 残骸・JSON 整合・数値の再計算一致）＋ cdp-shot 1280/390/dark/rm ＋ cdp-eval 390 横はみ出し

## 出典（確定・2026-09-14 JST）
- 住宅着工: 国土交通省「建築着工統計調査（住宅着工統計）」都道府県別 新設住宅戸数 時系列・年計（e-Stat statInfId=000040405972・xls）。47 都道府県合計＝全国計が全 75 年で一致
- 人口: 総務省統計局「人口推計」都道府県別人口（各年 10/1）。2000–2020 は e-Stat statInfId=000013168605、2021–2024 は stat.go.jp 05k{year}-2.xlsx。原表は千人単位
- 地図: 「国土数値情報（行政区域データ）」（国土交通省）をもとに作成（SmartNews japan-topography の簡略版をさらに簡略化）
- 表記: 「出典：…を加工して作成」（e-Stat 利用規約 / 国土数値情報 利用規約 の記載例に準拠）

## リスク
- 千人単位の人口で「千人あたり」を計算 → 小数 1 桁で表示（有効数字を超えない）
- 熊本の +10.6% など「発見」を書くときは断定せず「データ上は」と限定（原因の推測は書かない）
- 沖縄 1951–1972 の着工は null（原表「－」）→ 地図は「データなし」のハッチ表示
