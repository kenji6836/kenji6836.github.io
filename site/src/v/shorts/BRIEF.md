# 縦型ショート「MAKING」シリーズ — 共通ブリーフ（3 本共通・各エージェントは自分の番号だけ作る）

## 仕様（固定）
- 1080×1920・30fps・**合計 26.0 秒** = イントロ 0.0–2.0s ／ 本編 2.0–23.0s ／ アウトロ 23.0–26.0s。`window.__duration=26`
- 無音でも意味が通る（字幕焼き込み）。BGM は本体が合成した `site/src/v/shorts/bgm/making-26s.wav` を最後に mux（無ければ無音で mp4 を作り REPORT に書く）
- 地色 = 紺 `#0b1430`（本編）・字幕は白 Noto Sans JP 900・**64px 以上**・1 行 13 文字まで・2 行以内・キーワードだけ琥珀 `#f5a524` か 青面 `#2457e6` の白抜きで強調。字幕の位置は **y=1180〜1460px**（下の UI 帯を避ける）。重要要素は上 220px・下 420px・右 120px を避ける（Shorts/Reels/TikTok の UI 重なり・🟡 一般的な安全域）
- 書体は Google Fonts（Noto Sans JP 400/700/900・IBM Plex Mono 500）。トークン = `site/src/v/brand/brand.css`（あれば）／無ければ `site/src/v/brand/tokens-provisional.css`
- **イントロ/アウトロは本体ブランディング担当が `site/src/v/brand/intro-outro.css` と `site/src/v/brand/intro-outro.html`（DOM 断片・`<section class="v-intro">`／`<section class="v-outro">`）を用意する。存在すればそれを short.html に埋め込み（iframe 不可・コピー）、アニメーションの開始時刻を 0.0s／23.0s にずらして使う（`animation-delay`）。未着なら本編を先に完成させ、最終レンダー前に再確認。25 分待っても無ければ「本編完成・イントロ待ち」で報告して終了（本体が続きを指示する）**
- 生成イラスト禁止。使えるのは: 実画面キャプチャ（`site/src/v/shorts/captures/`）・CSS/SVG で描く UI 風の図（HP と同じ語彙: 輪郭なし・2 段階陰影・光源統一・フラット・線画アイコン stroke 1.75）・「端末に日本語の指示を打ち込む」演出（Plex Mono・カーソル点滅・1 文字ずつ表示は `steps()` アニメで決定論的に）・写真（`site/src/photos/`）
- 内部の数字・顧客情報・売上・トークン消費額は出さない。出してよい実数は FACTS.md に列挙したものだけ（出典つき）。「サンプル」表示が必要なものは画面内に「サンプル」と書く
- 実装: `site/src/video/promo.html` と同じ「CSS/Web Animations ＋ `__seek(t)`」方式（末尾の `__ready/__seek` をコピー）。`animation-fill-mode: both`・`animation-delay` で時刻を組む。JS でタイマーを使わない（決定論が壊れる）。画像は `<img>` で先読み（`__ready` が decode を待つ）
- 書き出し: `node site/tools/render-video.mjs site/src/v/shorts/<nn>/short.html site/src/v/shorts/<nn>/frames 30 26` → `ffmpeg -y -framerate 30 -i frames/frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart out/v-short-<nn>-<slug>.mp4` と `-c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 out/….webm`。BGM: `ffmpeg -y -i out/….mp4 -i ../bgm/making-26s.wav -c:v copy -c:a aac -b:a 128k -shortest out/….with-bgm.mp4`（→ 完了後に with-bgm を正式名に置き換え・webm も `-c:a libopus -b:a 96k`）。ポスター = t=3.0s のフレームを jpg（品質 85）・絵コンテ 6 枚 = 代表 6 時刻のフレームを 540×960 の jpg → `sb-1..6.jpg` ＋ `storyboard.json`（`site/src/video/storyboard.json` と同じ 5 キー: src/time/label/note/alt。src は `/assets/works/v-short-<nn>-sb-N.jpg` で書く）
- まず `--frames 0,60,150,300,450,600,690,750` で試し撮りして自分で Read し（文字の重なり・はみ出し・豆腐・画像未ロードを確認）、直してから全フレーム。**フレーム PNG は encode 後に削除**（数百 MB になる）
- 報告は `site/src/v/shorts/<nn>/REPORT.md`（構成表: 時刻/字幕/画面・使った実数と出典・未確認）＋返答 10 行以内

## 本編の型（21 秒・5 ビート）
1. **フック（2.0–5.0s）**: 実画面が画面いっぱいにスッと入り、字幕「◯◯を、Claude Code で作った。」（作ったモノが 1 秒で分かる）
2. **指示（5.0–9.5s）**: 端末風パネル（紺より少し明るい面・Plex Mono）に日本語の指示が 1 文字ずつ打たれる（FACTS.md の「指示の例」を使う・実際の指示の要旨）。字幕「まず、日本語で頼む」
3. **設計/実装（9.5–14.5s）**: 作られる過程を図で（ファイルツリーが増える／JSON→ページ生成／テストが緑になる等）。字幕は FACTS.md のビート文
4. **検証（14.5–18.5s）**: 受入テスト・レビューの実数チップがポップ（例「自動テスト 235 項目」）。字幕「自分の目でも確認する」
5. **公開＋結果（18.5–23.0s）**: 実画面をスマホ枠で縦スクロール（`transform: translateY` を等速）。実数チップ 2〜3 個（FACTS.md）。字幕「公開して、使ってもらう。」→ 23.0s でアウトロへ（サークルワイプ等の転換を 22.5–23.0s に入れてよい）
