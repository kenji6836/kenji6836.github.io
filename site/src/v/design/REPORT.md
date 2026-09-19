# デザインシステム 1 ページ（ショーケース A『見積トリアージ』）— 報告

## 成果物
- `site/src/v/design/system.html` — 自己完結・Google Fonts（Noto Sans JP 400/500/700/900・IBM Plex Mono）のみ・相対パス・ライト/ダーク（`prefers-color-scheme` ＋ ヘッダの手動トグル auto/light/dark）・390px 対応・`prefers-reduced-motion` 対応。将来 `/design/mitsumori/` に置く前提
- `site/src/v/design/out/system-1280.png`（1280×4233）・`system-390.png`（390×7379）・`system-dark.png`（1280・ダーク）・`system-rm.png`（1280・reduced-motion）— `cdp-shot.mjs` で書き出し、全 4 枚を分割して目視済み

## 構成（BRIEF 1〜9 に対応）
1. 原則 3 行（カード 3 枚）
2. 色: **ペア札 12 枚**（左半分ライト・右半分ダーク・各面に実測コントラスト比）。`text/surface`・`text-2/surface`・`text-3/surface`・`text-3/bg`・`line-2/surface`（UI 3:1）・`brand/surface`・`brand-ink/brand`・`brand/brand-soft`・`danger`・`warn`・`amber`・`ok` の各 soft ペア。トークン全表（名前・ライト値・ダーク値・用途 20 行）は `<details>` 内
3. 書体: ウェイト 4 種・palt on/off・サイズ階段 11〜32（8 段）。行間・英字・600/800 の丸め注記は `<details>`
4. 余白 4px 刻み（4〜48）・角丸 14/10/999・影 2 段（`--shadow` v1 ＋ `--shadow-2` 提案）・線 3 種
5. 部品（すべて tokens-draft.css の実 CSS）: チップ 10 種・ボタン 4 種・デモ帯・空状態・返信下書きカード（バッジ「下書き」）・受信箱の行 2 行（至急の赤帯・選択行 `aria-current`）・仕分けパネル 3 段・トースト（ボタンで実動）
6. 状態と動き: default/hover/focus/disabled/loading・スケルトン・エラー入力・160/240ms バー・reduced-motion で全停止（ページ右上に「reduced-motion 中」表示）
7. アクセシビリティ: フォーカスリング・ランドマーク図（SVG）・タップ 44px 図・色だけに頼らない（grayscale 並置）。キーボード操作は `<details>`
8. モバイル: 3 ペイン→タブの流れ図（SVG）＋ 390px 端末枠（デモ帯・タブ・行・タブバー 64px/各 44px）
9. 出典/注記: フッターに「A レーンのトークン v1（2026-09-14 G1 確定）に基づく。実装後の差分は統合時に同期」「自主制作」

## コントラスト実測（WCAG 2.x 相対輝度・Python と JS の二重計算・一致）
| ペア | ライト | ダーク | 判定 |
|---|---|---|---|
| text / surface | 17.92 | 14.70 | AA |
| text-2 / surface | 7.77 | 10.56 | AA |
| text-3 / surface | 4.74 | 6.74 | AA |
| text-3 / bg | **4.38** | 7.38 | ライト不足（赤表示） |
| line-2 / surface（UI 3:1） | **1.36** | **1.67** | 両方不足（赤表示） |
| brand / surface | 5.86 | 7.45 | AA |
| brand-ink / brand | 5.86 | 7.83 | AA |
| brand / brand-soft | 5.10 | 6.54 | AA |
| danger / danger-soft | 4.79 | 6.17 | AA |
| warn / warn-soft | 4.89 | 6.95 | AA |
| amber / amber-soft | **3.34** | 7.78 | ライト不足（赤表示） |
| ok / ok-soft | **4.43** | 7.63 | ライト不足（赤表示） |

対処案（ページの `<details>` に記載・トークン v1 は変更していない）: `--amber:#9a6415`（4.58:1）・`--ok:#17734a`（5.16:1）・ページ地上のラベルは `--text-2` を使う・枠線はラベル/影/フォーカスリングで境界を補う。JS は読み込み時に各札の描画色を `getComputedStyle` で取得して再計算し、静的値を上書き（ライト/ダークとも同時に表示・JS 無効時は静的値のまま）。

## 自己検査
- 横スクロール: `cdp-eval.mjs` 390/1280（ライト・ダーク）で `scrollWidth == clientWidth`・はみ出し要素 0
- 重なり・豆腐: 4 枚を分割して目視。なし（Google Fonts はネット経由で読めた）
- 可視テキスト: 閉じた `<details>` の中身を除き **1,424 字**（空白除く・空白込み 1,485）。`<details>` 内は 1,998 字
- 禁止語（副業/会社員/想定案件/モック/準備中）: grep 0 件。「サンプル画面」表記
- 外部依存: Google Fonts の 2 ドメインのみ・CDN なし・画像なし（全部 CSS/SVG）
- `<details>` を開いた状態も 1280/390 で描画確認（トークン全表 20 行・対処案）

## 指示と変えた点
- 「コントラスト表」を独立した表ではなく**ペア札**に統合（トークン札＝色見本＋用途＋実測値）。1,500 字制限と「名前・値・用途」の両立のため。値の全表は `<details>`
- `.tabbar` は v1 では `position:fixed`（≤900px）だが、本ページでは端末枠内に静的表示するよう上書き
- ボタン hover/focus/disabled・入力エラー・スケルトン・トーストの CSS は v1 に無いので本ページで定義（`--dur-1/2`・`--ease`・`--shadow-2` は「提案」と明記）

## 未確認
- 実機（iOS Safari / Android Chrome）での描画・VoiceOver 読み上げは未確認（headless Chrome のみ）
- `color-mix()`（ヘッダ背景）は Chrome 111+/Safari 16.2+ 前提。古い環境ではヘッダが不透明になる程度
- A レーン実装後のトークン差分（600/800 ウェイトの扱い・`--shadow-2` 採否）は統合時に要同期
