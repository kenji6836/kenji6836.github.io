# ブランディング レーン V — ステップ 1 報告（方向 3 案の比較）

## 成果物
- `site/src/v/brand/comps.html` — 3 列比較ページ（自己完結・Google Fonts のみ・1600px・全部 CSS/SVG 描画。写真は `../../../static/profile.jpg` を相対参照）
- `site/src/v/brand/comps.png` — 1600×1855 書き出し（`cdp-render.mjs --selector body --wait 2500`）。等倍と 2 倍クロップで目視済み: 文字重なり・豆腐・はみ出しなし（初回は 3 列目がはみ出したので grid を `minmax(0,1fr)` に修正）

## 各列に載せたもの（3 案共通の構成）
アイコン 2 種（マーク版／顔写真版・各 200px＋48px 丸を白 UI・黒 UI 上で）／X ヘッダー 1500×500 縮小（アバター重なり位置と名前行つき）／YouTube バナー 2560×1440 縮小（安全域 1546×423 を点線）／縦型投稿テンプレ 1080×1920 縮小（MAKING #01・見出し・実物スクショ枠・自主制作・ハンドル）／字幕スタイル 1 行／フィード行（白 UI・黒 UI）

マークは共通の SVG symbol `#mk`（角丸 22.5%・青 #2457e6・白 K = Noto Sans JP 900 60/100・右下に琥珀カーソル 15×24.5）と白抜き `#mkw`。顔写真版のバッジは 48px 丸クロップの内側に収まる位置（右下から 3px 内側）に置いた。案ごとの差はバッジのリング色（D1 紺・D2 白・D3 琥珀）のみ。

## 自己採点（各 1〜5・Q2 基準）
| 基準 | D1 工房（紺地） | D2 スタジオ（白地） | D3 シグナル（青地） |
|---|---|---|---|
| ① HP との同一人物感 | 4（青の面・Noto 900・琥珀は同じ。地は HP ダークテーマに近い） | 5（HP と同一） | 4（HP のブランド青そのもの。白基調の HP より強い） |
| ② 48px 判読 | 4 | 4 | 4（マークは 3 案共通。差はリング色のみ） |
| ③ フィード識別性 | 4 | 3（白 UI の中で白投稿が沈む） | 5（青べたは白 UI・黒 UI どちらでも一目） |
| ④ ライト/ダーク UI | 3（黒 UI で紺 #0b1430 が黒に溶ける） | 3（黒 UI では映えるが白 UI で溶ける） | 5 |
| ⑤ 違和感のなさ | 4 | 5 | 3（青一色は広告調に寄る＝主リスク） |
| 合計 | 19 | 20 | 21 |

## 推奨: D3 シグナル（青地）
1. SNS の目的は「フィードで同じ人物と即分かる」こと。青べたは X/YouTube/TikTok の黒 UI でも Instagram/X の白 UI でも沈まず（③④で唯一の 5）、HP のブランド青そのものなので①も落ちない。
2. D2 は HP と同一だが白 UI の中で白投稿が消える。D1 は動画の地と同じ強みがあるが、主戦場の黒 UI（TikTok・YouTube モバイル・X ダーク）で紺が黒に溶ける。
3. ⑤の「広告調」リスクはステップ 2 で抑える: アバターは青マークのまま（白抜きは青地の中だけ）・琥珀はカーソル＋左端の帯＋MAKING チップに限定・イントロ/アウトロは BRIEF どおり紺地（青は静止物と字幕帯に限定して、動画本編の地色と役割分担）。
次点は D1（動画との連続感を最優先するなら）。

## 未確認
- 実機の X/YouTube/TikTok UI での見え方は CSS 上の再現（白 #fff・黒 #000・X の余白/丸ボタン）で判定。実アカウントへの適用は未実施
- Instagram プロフィール（円形・110px 相当）と TikTok の縦動画上でのアイコン重なりは未描画（48px 丸と 200px で代表）
- 字幕は 1 行サンプルのみ。2 行時の行間・最小 40px@1080 はステップ 2 の brand.css で確定

---

# ステップ 2-1 報告（採用 = D1 工房を主面＋D3 の琥珀帯・薄い MAKING を取り込み）

## 成果物
- `site/src/v/brand/intro-outro.css` — `.v-intro`（2.0s）／`.v-outro`（3.0s）の全スタイル。`@keyframes`＋`animation-delay` のみ・JS なし。開始時刻は `--v-intro-start`（既定 0s）／`--v-outro-start`（既定 0s・ショートは 23s）で `calc()` ずらし。`.v-intro` は start+1.99s で `visibility:hidden`、`.v-outro` は start−0.01s まで `hidden`（フレーム境界 2.0s／23.0s ちょうどで切り替わるよう ±0.01s）
- `site/src/v/brand/intro-outro.html` — DOM 断片 2 セクション（`<link>` なし・必要フォントはコメント: Noto Sans JP 700/900・IBM Plex Mono 500）。マークはインライン SVG・画像なし。通番は `.v-no` を書き換え
- `site/src/v/brand/intro.html`／`outro.html` — 単体確認ページ（断片をコピー・`__ready/__seek` 対応・`__duration` 2/3）
- `site/src/v/brand/out/intro.mp4|webm`（60f）・`outro.mp4|webm`（90f）・`intro-poster.jpg`（t=1.5s）・`outro-poster.jpg`（t=2.5s）。1080×1920・30fps・ffprobe で尺 2.000/3.000 確認

## 構成
- イントロ: 設計図グリッド＋薄い MAKING（5%）→ 琥珀帯が左端に伸びる（0.1–0.6s）→ マーク 340px が落下して弾んで着地（0.1–0.95s）→ 「MAKING #01▮」が下から立ち上がる（0.7s）→ タグライン（1.05s）→ カーソル点滅（1.15s〜）→ 1.75–2.0s で全体がスケール＋フェードアウト → 2.0s で hidden
- アウトロ: 帯（0.05s）→ マーク 220px ポップ（0.05s）→ Kenji Ido（0.35s）→ @idk0723ai（0.5s）→ 「作った実物は HP で」（0.9s）→ 青パネル `kenji6836.github.io`（1.25s）→ カーソル点滅（1.8s〜）
- 安全域: 主要素は y 540–1300・x 130–950（上 220／下 420／右 120 を回避）。初回は「MAKING #01▮」が右 120px に入っていたので 176→144px に縮小して再書き出し

## 確認したこと
- 試し撮り（intro 6 フレーム・outro 6 フレーム）と書き出しフレームを目視: 豆腐・重なり・はみ出しなし
- 両セクションを同居させ `--v-outro-start:23s` にした検証ページで `__seek` → computed visibility を確認: 0〜1.98s intro=visible／2.0s〜 hidden、22.9s outro=hidden／23.0s〜 visible。24.7s のフレームは単体 1.7s と同じ見た目

## 未確認
- ショート本編（2.0–23.0s）との実つなぎ（本編側の 22.5–23.0s の転換演出との重なり）は各ショートで確認
- BGM との同期は対象外（イントロ/アウトロは無音素材）

---

# ステップ 2-2〜2-5 報告（brand.css／logo.svg／書き出し一式／guide.html）

## 成果物
- `site/src/v/brand/brand.css` — トークン（色・書体・角丸・影・左端帯 `--v-band`・外周線 `--v-edge`・グリッド）＋部品（`.v-surface` 主面・`.v-panel` 青の面・`.v-signal` 副面・`.v-term`・`.v-cur`・`.cap` 字幕・`.v-chip`・`.v-btn`・`.v-wordmark`・`.v-icon`）
- `site/src/v/brand/logo.svg` — symbol 3 種（`#mark`／`#mark-white`／`#wordmark`）＋単体表示用の見本。文字は `<text>`（@import で Google Fonts）
- `site/src/v/brand/export.html` — 書き出し元（各 `.asset` を `cdp-render --selector` で切り出し）
- `site/src/v/brand/out/`: `icon-mark-1024.png`・`icon-mark-400.png`（丸クロップ前提の全面塗り）・`icon-photo-1024.png`・`icon-photo-400.png`（写真＋右下マーク・丸クロップ内側に配置）・`x-header-1500x500.png`・`yt-banner-2560x1440.png`（creator-desk.jpg 42%＋紺のグラデ・安全域 1546×423 中央に主要素）・`post-square-1080.png`・`post-vertical-1080x1920.png`・`post-x-1600x900.png`（副面＝青べた）。9 枚とも Read で確認（post-x は見出しがスクショ枠に重なっていたので 92→78px に縮小・枠を右へ移動して再書き出し）
- `site/src/v/brand/guide.html` — 自己完結・Google Fonts のみ・ライト/ダーク対応・可視テキスト 1,480 字（details 除く）・画像は `./out/…` 相対参照。8 節: マーク（3 形態・余白・禁止例 4）／色／書体／面と部品（brand.css 実物）／字幕／アイコン・ヘッダー・バナー／投稿テンプレ／各 SNS 画像規格表（出典 URL＋確認日 2026-09-14 JST）

## 規格表の確認結果（各 SNS 1 回・公式ドメイン限定）
- ✅ X: プロフィール 400×400・ヘッダー 1500×500（help.x.com は WebFetch 403 → 公式ドメイン限定の検索スニペットで確認）
- ✅ YouTube バナー: 最小 2048×1152・推奨 2560×1440・6 MB 以下・安全域 1235×338（最小時）— support.google.com/youtube/answer/10456525。BRIEF の 1546×423 は 2560 換算値（🟡 と併記）
- ✅ Instagram フィード: 幅 1080・1.91:1〜4:5 — help.instagram.com/1631821640426723
- 🟡 YouTube プロフィール 800×800／Instagram リール 9:16／Instagram プロフィール 320×320／TikTok プロフィール・動画: 公式ページ本文が JS 描画で取得できず慣用値のまま

## 判定基準への自己採点（採用 D1 主面＋D3 取り込み後）
①同一人物感 4（青・書体・マーク・顔写真は HP と同じ。地は紺）／②48px 判読 4（icon-photo は 400 で確認、48 相当は comps.png）／③フィード識別性 4（琥珀帯＋外周線で紺が黒に溶けない）／④ライト/ダーク UI 4（guide.html 両モードで確認）／⑤違和感のなさ 4

## 未確認
- 各 SNS の管理画面での実アップロード（丸クロップの実際の位置・バナーの端末別クロップ・X ヘッダーのモバイル表示）。🟡 の規格は公開前に実測して guide.html を更新する
- logo.svg の K は `<text>`（フォント依存）。`<img>` で使う場面はフォントが読めないので PNG（out/icon-*）を使う。パス化（アウトライン）は fontTools 等が要るため未実施
- 投稿テンプレのスクショは HP の実キャプチャ（shorts/captures）を使用。数字は HP に載っている実数のみ
