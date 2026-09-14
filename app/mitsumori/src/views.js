// 画面の描画（HTML 文字列を返す純関数）。イベントは app.js が委譲で受ける。
import { esc, icon, CHANNEL, STATUS, URGENCY_CLS } from "./ui.js";
import { formatBand } from "./classify.js";
import { relative, fmtDate, fmtDuration, receivedAt } from "./time.js";
import { hbar, vbar, stacked } from "./charts.js";

export const SLA_MS = 24 * 60 * 60 * 1000; // 初回返信の目標 24 時間

// ---------- ナビ ----------
export function nav(route, counts) {
  const cur = (r) => (route === r ? ' aria-current="page"' : "");
  return `
  <a class="brand" href="#/inbox"><span class="mark" aria-hidden="true">見</span><span>見積トリアージ<small>MITSUMORI TRIAGE</small></span></a>
  <a class="nv" href="#/inbox"${cur("inbox")}>${icon("inbox")}受信箱<span class="n" aria-label="未対応 ${counts.open} 件">${counts.open}</span></a>
  <a class="nv" href="#/dashboard"${cur("dashboard")}>${icon("chart")}ダッシュボード</a>
  <a class="nv" href="#/table"${cur("table")}>${icon("table")}概算目安表</a>
  <a class="nv" href="#/settings"${cur("settings")}>${icon("gear")}設定</a>
  <div class="grp kicker">絞り込み</div>
  <a class="nv" href="#/inbox?f=urgent"><span class="dot" style="color:var(--danger)"></span>至急<span class="n">${counts.urgent}</span></a>
  <a class="nv" href="#/inbox?f=missing"><span class="dot" style="color:var(--text-3)"></span>情報不足<span class="n">${counts.missing}</span></a>
  <div class="foot"><b>サンプル工務店</b>架空のデモ会社・見積担当 3 名</div>`;
}

export function tabbar(route) {
  const cur = (r) => (route === r ? ' aria-current="page"' : "");
  return `<a href="#/inbox"${cur("inbox")}>${icon("inbox")}受信箱</a><a href="#/dashboard"${cur("dashboard")}>${icon("chart")}ダッシュボード</a><a href="#/table"${cur("table")}>${icon("table")}目安表</a><a href="#/settings"${cur("settings")}>${icon("gear")}設定</a>`;
}

// ---------- 一覧 ----------
export function list(rows, q, counts) {
  const tabs = [["open", "未対応"], ["wip", "対応中"], ["done", "返信済"], ["all", "すべて"]];
  const tab = q.tab || "open";
  const link = (patch) => "#/inbox?" + new URLSearchParams({ ...q, ...patch }).toString();
  return `
  <header>
    <h1>受信箱 <span class="muted small" style="font-weight:500">今日 ${counts.today} 件</span></h1>
    <label class="search">${icon("search")}<span class="vh">検索</span><input id="q" type="search" placeholder="件名・本文・差出人で検索" value="${esc(q.q || "")}" autocomplete="off"><kbd>/</kbd></label>
    <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<a role="tab" href="${link({ tab: id })}" aria-selected="${tab === id}">${label}<span class="n">${counts.tabs[id]}</span></a>`).join("")}</div>
  </header>
  <div class="toolbar">
    <button class="chipbtn" data-filter="urgent" aria-pressed="${q.f === "urgent"}">${icon("warn")}至急のみ</button>
    <button class="chipbtn" data-filter="missing" aria-pressed="${q.f === "missing"}">${icon("info")}情報不足</button>
    <label style="margin-left:auto">並び <select class="sel" id="sort" aria-label="並び順"><option value="urgent"${q.sort !== "new" ? " selected" : ""}>至急優先</option><option value="new"${q.sort === "new" ? " selected" : ""}>新着順</option></select></label>
  </div>
  <ul class="rows" role="list" id="rows">${rows.length ? rows.map(row).join("") : emptyState(tab, q)}</ul>`;
}

function emptyState(tab, q) {
  const msgs = { open: ["未対応はありません", "すべて対応済みです。お疲れさまでした"], wip: ["対応中の依頼はありません", "詳細画面のステータスで「対応中」にできます"], done: ["返信済みはまだありません", "返信案をコピーして「返信済みにする」と、ここに移ります"], all: ["依頼がありません", "設定からデモデータをリセットできます"] };
  const [t, s] = q.q || q.f ? ["該当する依頼がありません", "検索語や絞り込みを外してみてください"] : msgs[tab] || msgs.all;
  return `<li class="empty"><span class="ill">${icon("inbox")}</span><b>${t}</b><span class="small">${s}</span></li>`;
}

export function row(r) {
  const it = r.item, c = r.cls;
  const ch = CHANNEL[it.channel];
  const urg = c.urgency.finalId;
  const chips = [
    `<span class="chip ${URGENCY_CLS[urg]}">${esc(c.urgency.finalLabel)}</span>`,
    `<span class="chip type">${esc(c.type.finalName)}</span>`,
    `<span class="chip band">${esc(formatBand(c.band))}</span>`,
    r.status !== "open" ? `<span class="chip ${STATUS[r.status].cls}">${STATUS[r.status].label}</span>` : "",
    r.missingCount >= 2 && r.status === "open" ? `<span class="chip st-open">情報不足</span>` : "",
  ].join("");
  return `<li><a class="row ${urg === "high" ? "hi" : ""} ${r.seen ? "" : "unread"}" href="#/inbox/${it.id}${r.qs}" data-id="${it.id}" aria-current="${r.selected ? "true" : "false"}" aria-label="${esc(it.from.name)} 様 ${esc(it.subject)}">
    <span class="bar" aria-hidden="true"></span>
    <span class="who">${esc(it.from.name)} 様<span class="ch">· ${ch.label}</span></span>
    <span class="t"><time datetime="${new Date(r.receivedMs).toISOString()}">${relative(r.receivedMs, r.now)}</time></span>
    <span class="sub">${esc(it.subject)}</span>
    <span class="snip">${esc(snippet(it.body))}</span>
    <span class="chips">${chips}</span>
  </a></li>`;
}

function snippet(body) {
  return String(body).replace(/\s+/g, " ").replace(/^(ご担当者様|お世話になります。?|はじめまして。?)\s*/g, "").slice(0, 80);
}

// ---------- 詳細 ----------
export function detail(r, rules, draft, note) {
  if (!r) return `<div class="empty" style="margin-top:120px"><span class="ill">${icon("reply")}</span><b>依頼を選ぶと、ここに本文・仕分け・返信案が出ます</b><span class="small">j / k で移動・Enter で開く</span></div>`;
  const it = r.item, c = r.cls, ch = CHANNEL[it.channel];
  const urg = c.urgency.finalId;
  const initial = (it.from.name || "?").slice(0, 1);
  const typeOptions = [...rules.types, rules.other].map((t) => `<option value="${t.id}"${t.id === c.type.finalId ? " selected" : ""}>${esc(t.name)}</option>`).join("");
  const urgOptions = ["high", "normal", "low"].map((u) => `<option value="${u}"${u === urg ? " selected" : ""}>${esc(rules.urgency[u].label)}</option>`).join("");
  const typeWhy = c.type.manual
    ? `手動で変更（自動判定: ${esc(c.type.name)}${c.type.matched.length ? " — " + c.type.matched.map((k) => `<code>${esc(k)}</code>`).join(" ") : ""}）`
    : c.type.matched.length
      ? `根拠: ${c.type.matched.map((k) => `<code>${esc(k)}</code>`).join(" ")} の ${c.type.matched.length} 語が一致${c.type.runnerUp ? `（${esc(c.type.runnerUp.name)} ${c.type.runnerUp.score} 語）` : ""}`
      : "目安表のキーワードに一致する語がありません";
  const urgWhy = c.urgency.manual
    ? `手動で変更（自動判定: ${esc(c.urgency.label)}）`
    : c.urgency.matched.length
      ? `根拠: ${c.urgency.matched.map((k) => `<code>${esc(k)}</code>`).join(" ")}`
      : "至急語・検討語なし";
  const s = it.summary || {};
  const missing = (s.missing || []).map((m) => `<span class="chip st-open">${esc(m)}</span>`).join("") || `<span class="muted small">なし</span>`;
  const status = r.status;
  const stOptions = Object.entries(STATUS).map(([id, st]) => `<option value="${id}"${id === status ? " selected" : ""}>${st.label}</option>`).join("");
  const mailto = `mailto:${encodeURIComponent(it.from.email || "")}?subject=${encodeURIComponent("Re: " + it.subject)}&body=${encodeURIComponent(draft ?? it.reply)}`;
  return `
  <div class="top">
    <div style="min-width:0">
      <button class="btn ghost sm backbtn" data-action="back">${icon("back")}受信箱</button>
      <h1 id="detail-title" tabindex="-1">${esc(it.subject)}</h1>
      <div class="meta"><span>${esc(it.from.name)} 様</span><span>·</span><span>${icon(ch.icon)} ${ch.label}</span><span>·</span><span>${fmtDate(r.receivedMs)} 受信</span><span>·</span><span>${esc(it.id)}</span></div>
    </div>
    <div class="actions">
      <label class="vh" for="status">対応状況</label>
      <select id="status" class="stsel ${STATUS[status].cls}" data-action="status">${stOptions}</select>
    </div>
  </div>
  <div class="body">
    <article class="card msg span2" aria-label="受信した本文">
      <div class="hd">${icon(ch.icon)}受信した本文<span class="tag neutral">架空のサンプル</span></div>
      <div class="bd"><div class="from"><span class="av" aria-hidden="true">${esc(initial)}</span><div><b>${esc(it.from.name)} 様</b><br>${esc(it.from.email || (it.from.tel ? "電話 " + it.from.tel : "連絡先の記載なし"))}</div></div>${esc(it.body)}</div>
    </article>
    <section class="card" aria-labelledby="ai-h">
      <div class="hd" id="ai-h">${icon("sparkle")}AI 仕分け<span class="tag">固定ルール</span></div>
      <div class="bd"><dl class="kv">
        <dt>工種</dt><dd><div class="ovr"><select class="sel" data-action="type" aria-label="工種を変更">${typeOptions}</select>${c.type.manual ? `<span class="chip manual">手動</span><button class="btn ghost sm" data-action="reset-type">自動に戻す</button>` : ""}</div><div class="why">${typeWhy}</div></dd>
        <dt>緊急度</dt><dd><div class="ovr"><select class="sel" data-action="urgency" aria-label="緊急度を変更">${urgOptions}</select>${c.urgency.manual ? `<span class="chip manual">手動</span><button class="btn ghost sm" data-action="reset-urgency">自動に戻す</button>` : ""}</div><div class="why">${urgWhy}</div></dd>
        <dt>概算帯</dt><dd>${c.band ? `<div class="big">${c.band.min.toLocaleString("ja-JP")}〜${c.band.max.toLocaleString("ja-JP")}<small>万円</small></div><div class="why">目安表「${esc(c.type.finalName)}」の行を引用（${esc(c.band.note || "")}）。現地調査前の目安・金額は計算していません</div>` : `<div class="big" style="font-size:16px">該当行なし</div><div class="why">目安表に行がないため金額は出しません。担当者が確認します</div>`}</dd>
        <dt>要約</dt><dd><div class="small"><b>場所</b> ${esc(s.place || "未記載")}　<b>規模</b> ${esc(s.size || "未記載")}<br><b>時期</b> ${esc(s.timing || "未記載")}　<b>予算</b> ${esc(s.budget || "未記載")}</div><div class="why">要約は事前生成（デモ）</div></dd>
        <dt>不足情報</dt><dd><div class="miss">${missing}</div></dd>
      </dl></div>
    </section>
    <section class="card reply" aria-labelledby="rp-h">
      <div class="hd" id="rp-h">${icon("reply")}返信案<span class="tag">事前生成</span></div>
      <div class="bd"><label class="vh" for="draft">返信文（編集できます）</label><textarea id="draft" class="ta" data-action="draft" spellcheck="false">${esc(draft ?? it.reply)}</textarea></div>
      <div class="ft">
        <button class="btn primary sm" data-action="copy">${icon("copy")}コピー</button>
        <a class="btn sm" href="${mailto}" data-action="mailto">${icon("mail")}メールで開く</a>
        ${status === "done" ? `<button class="btn sm" data-action="reopen">${icon("reset")}未対応に戻す</button>` : `<button class="btn sm" data-action="done">${icon("check")}返信済みにする</button>`}
        ${draft != null && draft !== it.reply ? `<button class="btn ghost sm" data-action="reset-draft">元に戻す</button>` : ""}
        <span class="note">送信と金額の判断は人が行います</span>
      </div>
    </section>
    <section class="card" aria-labelledby="tl-h">
      <div class="hd" id="tl-h">${icon("clock")}対応履歴</div>
      <div class="bd timeline">${timeline(r)}</div>
    </section>
    <section class="card" aria-labelledby="nt-h">
      <div class="hd" id="nt-h">${icon("note")}メモ<span class="tag neutral">端末内に保存</span></div>
      <div class="bd"><label class="vh" for="note">メモ</label><textarea id="note" class="ta note-ta" data-action="note" placeholder="現地調査の候補日・担当者の申し送りなど">${esc(note || "")}</textarea></div>
    </section>
  </div>`;
}

function timeline(r) {
  const it = r.item, c = r.cls;
  const lines = [
    `<div><span class="dot on"></span>${fmtDate(r.receivedMs)} 受信（${CHANNEL[it.channel].label}）</div>`,
    `<div><span class="dot on"></span>${fmtDate(r.receivedMs)} 自動仕分け: ${esc(c.type.name)} / ${esc(c.urgency.label)} / ${esc(formatBand(c.band))}</div>`,
  ];
  if (c.type.manual || c.urgency.manual) lines.push(`<div><span class="dot on"></span>手動で仕分けを変更: ${esc(c.type.finalName)} / ${esc(c.urgency.finalLabel)}</div>`);
  if (r.repliedMs) {
    lines.push(`<div><span class="dot ok"></span>${fmtDate(r.repliedMs)} 返信済み（初回返信まで ${fmtDuration(r.repliedMs - r.receivedMs)}）</div>`);
  } else {
    const left = r.receivedMs + SLA_MS - r.now;
    lines.push(`<div><span class="dot ${left < 0 ? "hi" : ""}"></span>返信待ち — 目標 24 時間以内 <span class="sla ${left < 0 ? "late" : ""}">${left < 0 ? `（${fmtDuration(-left)} 超過）` : `（残り ${fmtDuration(left)}）`}</span></div>`);
  }
  return lines.join("");
}

// ---------- ダッシュボード ----------
export function dashboard(rows, rules, now) {
  const open = rows.filter((r) => r.status === "open");
  const urgentOpen = open.filter((r) => r.cls.urgency.finalId === "high");
  const week = rows.filter((r) => now - r.receivedMs < 7 * 86400e3);
  const late = open.filter((r) => now - r.receivedMs > SLA_MS);
  const durations = rows.filter((r) => r.repliedMs).map((r) => r.repliedMs - r.receivedMs).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  const within = durations.filter((d) => d <= SLA_MS).length;

  // 日別（14 日）
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d0 = new Date(now); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - i);
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    days.push({ label: `${d0.getMonth() + 1}/${d0.getDate()}`, value: rows.filter((r) => r.receivedMs >= d0 && r.receivedMs < d1).length });
  }
  // 工種別
  const byType = [...rules.types, rules.other].map((t) => ({ label: t.name, value: rows.filter((r) => r.cls.type.finalId === t.id).length })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  // 不足情報
  const missCount = {};
  for (const r of rows) for (const m of r.item.summary?.missing || []) missCount[m] = (missCount[m] || 0) + 1;
  const byMissing = Object.entries(missCount).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  const st = (id) => rows.filter((r) => r.status === id).length;
  const ug = (id) => rows.filter((r) => r.cls.urgency.finalId === id).length;
  const chn = Object.entries(CHANNEL).map(([id, c]) => ({ label: c.label, value: rows.filter((r) => r.item.channel === id).length }));

  return `
  <h1 id="page-title" tabindex="-1">ダッシュボード</h1>
  <p class="lead">架空のサンプル 30 件の集計。数字は端末内の操作を即時反映します</p>
  <div class="grid">
    <div class="card kpi ${urgentOpen.length ? "alert" : ""}"><div class="k">${icon("warn")}至急で未対応</div><div class="v">${urgentOpen.length}<small>件</small></div><div class="s">${urgentOpen.length ? "本日中に現地確認の連絡を" : "至急の未対応はありません"}</div></div>
    <div class="card kpi"><div class="k">${icon("inbox")}未対応</div><div class="v">${open.length}<small>件</small></div><div class="s">${late.length ? `<span style="color:var(--danger)">うち ${late.length} 件が目標 24 時間を超過</span>` : "24 時間超過なし"}</div></div>
    <div class="card kpi"><div class="k">${icon("clock")}初回返信までの中央値</div><div class="v">${median != null ? fmtDuration(median) : "—"}</div><div class="s">${durations.length} 件中 ${within} 件が 24 時間以内</div></div>
    <div class="card kpi"><div class="k">${icon("chart")}今週の依頼</div><div class="v">${week.length}<small>件</small></div><div class="s">直近 7 日の受信</div></div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <section class="card" aria-labelledby="c1"><div class="hd" id="c1">日別の受信件数（14 日）</div><div class="bd">${vbar(days)}</div></section>
    <section class="card" aria-labelledby="c2"><div class="hd" id="c2">工種別の内訳</div><div class="bd">${hbar(byType)}</div></section>
    <section class="card" aria-labelledby="c3"><div class="hd" id="c3">対応状況</div><div class="bd">${stacked([{ label: "未対応", value: st("open"), cls: "st-open" }, { label: "対応中", value: st("wip"), cls: "st-wip" }, { label: "返信済", value: st("done"), cls: "st-done" }, { label: "保留", value: st("hold"), cls: "st-hold" }])}
      <div style="margin-top:16px;font-weight:700;font-size:13px">緊急度</div>${stacked([{ label: "至急", value: ug("high"), cls: "hi" }, { label: "通常", value: ug("normal"), cls: "nm" }, { label: "検討中", value: ug("low"), cls: "lo" }])}
      <div style="margin-top:16px;font-weight:700;font-size:13px">受信経路</div>${hbar(chn, { rowH: 26 })}</div></section>
    <section class="card" aria-labelledby="c4"><div class="hd" id="c4">よく不足している情報</div><div class="bd">${byMissing.length ? hbar(byMissing, { labelW: 120 }) : '<span class="muted">なし</span>'}<div class="why" style="margin-top:8px">Web フォームの必須項目に加えると、返信までの往復が減ります</div></div></section>
  </div>`;
}

// ---------- 目安表 ----------
export function table(rules, edited) {
  const rowsHtml = rules.types.map((t) => `<tr>
    <td><b>${esc(t.name)}</b><div class="small muted">${esc(t.note || "")}</div></td>
    <td><div class="kws">${t.keywords.map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div></td>
    <td style="white-space:nowrap"><input class="inp" type="number" min="0" step="1" inputmode="numeric" value="${t.band[0]}" data-band="${t.id}" data-i="0" aria-label="${esc(t.name)} 下限（万円）"> 〜 <input class="inp" type="number" min="0" step="1" inputmode="numeric" value="${t.band[1]}" data-band="${t.id}" data-i="1" aria-label="${esc(t.name)} 上限（万円）"> 万円</td>
  </tr>`).join("");
  return `
  <h1 id="page-title" tabindex="-1">概算目安表</h1>
  <p class="lead">工種ごとの金額レンジ。仕分けはこの表の行を引用するだけで、金額の計算はしません。値は架空のサンプル${edited ? "（編集中・端末内に保存）" : ""}</p>
  <div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>工種</th><th>判定キーワード（1 語一致で 1 点）</th><th>概算帯（万円）</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
  <div class="bd" style="display:flex;gap:8px;align-items:center;border-top:1px solid var(--line)"><button class="btn sm" data-action="reset-table" ${edited ? "" : "disabled"}>${icon("reset")}初期値に戻す</button><span class="muted small">編集すると、受信箱の概算帯とダッシュボードに即反映します</span></div></div>
  <section class="card" style="margin-top:14px" aria-labelledby="ot"><div class="hd" id="ot">${icon("info")}該当なしの扱い</div><div class="bd small">どの行のキーワードにも一致しない依頼は「${esc(rules.other.name)}」になり、金額を出さずに担当者が確認します。緊急度は <b>${rules.urgency.high.keywords.slice(0, 6).map(esc).join("・")}</b> などの至急語、<b>${rules.urgency.low.keywords.slice(0, 5).map(esc).join("・")}</b> などの検討語で判定します</div></section>`;
}

// ---------- 設定 ----------
export function settings(env) {
  return `
  <h1 id="page-title" tabindex="-1">設定</h1>
  <p class="lead">このデモは端末内だけで動きます。サーバ・ログイン・外部 API はありません</p>
  <div class="grid two">
    <section class="card" aria-labelledby="m1"><div class="hd" id="m1">${icon("sparkle")}動作モード<span class="tag">デモ</span></div><div class="bd">
      <dl class="kv" style="grid-template-columns:110px 1fr">
        <dt>デモモード</dt><dd><b>有効</b><div class="why">架空のサンプル 30 件・仕分けは固定ルール（キーワード一致）・返信文と要約は 30 件ぶん事前生成</div></dd>
        <dt>本番モード</dt><dd><span class="chip st-hold">この環境では無効</span><div class="why">本番では返信文と要約を Claude API で生成します。接続は自社サーバ経由で、<b>API キーは端末（ブラウザ）に置きません</b>。切り替えはこのデモにはありません</div></dd>
      </dl>
      <div class="arch" role="img" aria-label="本番構成: ブラウザから自社サーバへ、自社サーバがキーを保管して Claude API へ接続">
        <div class="node">${icon("inbox")}<b>ブラウザ / PWA</b>依頼文・仕分け結果<br>キーなし</div><div class="arrow" aria-hidden="true">→</div>
        <div class="node">${icon("server")}<b>自社サーバ</b>${icon("lock")} キー保管・ログ<br>目安表・返信テンプレ</div><div class="arrow" aria-hidden="true">→</div>
        <div class="node">${icon("sparkle")}<b>Claude API</b>要約・返信下書き<br>金額は出さない</div>
      </div>
      <div class="why">金額は本番でも目安表の行を引用するだけです。送信は人が行います</div>
    </div></section>
    <section class="card" aria-labelledby="m2"><div class="hd" id="m2">${icon("wifi")}アプリとして使う</div><div class="bd">
      <dl class="kv" style="grid-template-columns:110px 1fr">
        <dt>インストール</dt><dd>${env.installed ? `<span class="chip st-done">${icon("check")}インストール済み</span>` : env.canInstall ? `<button class="btn primary sm" data-action="install">ホーム画面に追加</button>` : `<span class="small">ブラウザのメニューから「ホーム画面に追加」「アプリをインストール」を選べます</span>`}</dd>
        <dt>オフライン</dt><dd>${env.sw ? `<span class="chip st-done">${icon("check")}対応（端末内に保持）</span>` : `<span class="chip st-hold">準備中</span>`}<div class="why">一度開けば、機内モードでも受信箱・仕分け・返信案が使えます</div></dd>
        <dt>接続</dt><dd>${env.online ? `<span class="chip st-done">オンライン</span>` : `<span class="chip hi">オフライン</span>`}</dd>
      </dl>
    </div></section>
    <section class="card" aria-labelledby="m3"><div class="hd" id="m3">${icon("keyboard")}キーボード</div><div class="bd"><ul class="kbd">
      <li><kbd>j</kbd><kbd>k</kbd>次 / 前の依頼</li><li><kbd>Enter</kbd>依頼を開く</li><li><kbd>Esc</kbd>一覧に戻る（スマホ）</li><li><kbd>/</kbd>検索へ</li><li><kbd>c</kbd>返信案をコピー</li><li><kbd>d</kbd>返信済みにする</li><li><kbd>1</kbd>〜<kbd>4</kbd>受信箱 / ダッシュボード / 目安表 / 設定</li><li><kbd>?</kbd>この一覧</li>
    </ul></div></section>
    <section class="card" aria-labelledby="m4"><div class="hd" id="m4">${icon("reset")}デモデータ</div><div class="bd">
      <div class="small">対応状況・手動の仕分け・返信文の編集・メモ・目安表の編集は端末内（localStorage）だけに保存されています</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn sm danger" data-action="reset-all">${icon("reset")}初期状態に戻す</button><a class="btn sm" href="#/about">${icon("info")}仕組みを見る</a></div>
    </div></section>
  </div>
  <p class="small muted" style="margin-top:18px">見積トリアージ（デモ）v${esc(env.version)} · 架空のサンプルです。実在の会社・人物・案件とは関係ありません · <a href="/works/mitsumori-triage/">制作について</a></p>`;
}

// ---------- 仕組み ----------
export function about(rules, samples) {
  return `
  <h1 id="page-title" tabindex="-1">仕組み</h1>
  <p class="lead">「AI は下書きまで。送信と金額の判断は人」— このデモが何を自動で決め、何を決めないか</p>
  <ol class="steps card" style="padding:18px 20px">
    <li><div><b>受信</b> — Web フォーム・メール・電話メモの本文をそのまま受け取ります（デモでは架空のサンプル ${samples.items.length} 件）</div></li>
    <li><div><b>工種の判定</b> — 目安表の各行にあるキーワードが本文に何語含まれるかを数え、最多の行を選びます。同点は表の上の行。0 語なら「${esc(rules.other.name)}」</div></li>
    <li><div><b>緊急度の判定</b> — 至急語（${rules.urgency.high.keywords.slice(0, 5).map(esc).join("・")} など ${rules.urgency.high.keywords.length} 語）があれば「至急」、なければ検討語（${rules.urgency.low.keywords.slice(0, 4).map(esc).join("・")} など）で「検討中」、それ以外は「通常」</div></li>
    <li><div><b>概算帯</b> — 判定した行の金額レンジを<b>そのまま引用</b>します。規模や仕様から金額を計算することはしません</div></li>
    <li><div><b>要約と返信案</b> — デモでは ${samples.items.length} 件ぶんをあらかじめ用意した文面を表示します（AI 接続なし）。本番では Claude API が本文から要約と下書きを生成し、金額は同じく目安表の行を引用します</div></li>
    <li><div><b>人の判断</b> — 担当者が仕分けを直し、返信文を編集し、コピーして送ります。このアプリから送信はしません</div></li>
  </ol>
  <div class="rulelist" style="margin-top:14px">
    <section class="card" aria-labelledby="r1"><div class="hd" id="r1">至急語（${rules.urgency.high.keywords.length}）</div><div class="bd"><div class="kws" style="display:flex;gap:4px;flex-wrap:wrap">${rules.urgency.high.keywords.map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div></div></section>
    <section class="card" aria-labelledby="r2"><div class="hd" id="r2">検討語（${rules.urgency.low.keywords.length}）</div><div class="bd"><div class="kws" style="display:flex;gap:4px;flex-wrap:wrap">${rules.urgency.low.keywords.map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div></div></section>
    <section class="card" aria-labelledby="r3"><div class="hd" id="r3">不足情報の見方</div><div class="bd small">${rules.required_fields.map((f) => esc(f.label)).join("・")} の 5 項目が本文にあるかを見ます。デモの要約欄はサンプルごとに事前生成した内容です</div></section>
    <section class="card" aria-labelledby="r4"><div class="hd" id="r4">データの置き場所</div><div class="bd small">サンプル・目安表・ルールは静的ファイル、あなたの操作は端末内（localStorage）。サーバへ送る通信はありません（フォントのみ Google Fonts）</div></section>
  </div>
  <p style="margin-top:16px"><a class="btn" href="#/table">${icon("table")}目安表とキーワードを見る</a> <a class="btn ghost" href="#/inbox">${icon("inbox")}受信箱へ戻る</a></p>`;
}
