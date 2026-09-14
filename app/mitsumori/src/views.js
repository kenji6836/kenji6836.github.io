// 画面の描画（HTML 文字列を返す純関数）。イベントは app.js が委譲で受ける。
// 構成 = P3「今日やること」(2026-09-14 G2 決定): ホーム（挨拶＋KPI 3＋今日の依頼）＋右パネルの詳細（要点→概算帯→本文→返信案）
import { esc, icon, typeIcon, CHANNEL, STATUS, URGENCY_CLS, URGENCY_ICON } from "./ui.js";
import { formatBand } from "./classify.js";
import { relative, fmtDate, fmtDuration } from "./time.js";
import { hbar, vbar, stacked } from "./charts.js";

export const SLA_MS = 24 * 60 * 60 * 1000; // 初回返信の目標 24 時間
export const TODAY_MAX = 5; // 「今日やること」に出す件数

// ---------- ナビ（アイコンレール） ----------
export function nav(route, counts) {
  const cur = (r) => (route === r ? ' aria-current="page"' : "");
  const items = [["inbox", "inbox", "受信箱", counts.open], ["dashboard", "chart", "集計"], ["table", "table", "目安表"], ["settings", "gear", "設定"]];
  return `<a class="brand" href="#/inbox" aria-label="見積トリアージ"><span class="mark" aria-hidden="true">見</span></a>
  ${items.map(([r, ic, l, n]) => `<a class="nv" href="#/${r}"${cur(r)}>${icon(ic)}<span>${l}</span>${n ? `<span class="n" aria-label="未対応 ${n} 件">${n}</span>` : ""}</a>`).join("")}
  <a class="nv foot" href="#/about">${icon("help")}<span>仕組み</span></a>`;
}
export function tabbar(route) {
  const cur = (r) => (route === r ? ' aria-current="page"' : "");
  return `<a href="#/inbox"${cur("inbox")}>${icon("inbox")}受信箱</a><a href="#/dashboard"${cur("dashboard")}>${icon("chart")}集計</a><a href="#/table"${cur("table")}>${icon("table")}目安表</a><a href="#/settings"${cur("settings")}>${icon("gear")}設定</a>`;
}

// ---------- ホーム（今日やること / 一覧） ----------
function greeting(now) {
  const h = new Date(now).getHours();
  return h < 5 ? "お疲れさまです" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
}
function dateLine(now) {
  const d = new Date(now);
  return `${d.getMonth() + 1}/${d.getDate()}（${"日月火水木金土"[d.getDay()]}）`;
}
/** home(rows, q, counts, kpi, now): rows = 表示する行（today なら最大 5 件）・kpi = {urgent, open, late, median, todayTotal} */
export function home(rows, q, counts, kpi, now) {
  const tab = q.tab || "today";
  const tabs = [["today", "今日やること"], ["open", "未対応"], ["wip", "対応中"], ["done", "返信済"], ["all", "すべて"]];
  const link = (patch) => { const p = Object.fromEntries(Object.entries({ ...q, ...patch }).filter(([, v]) => v)); const s = new URLSearchParams(p).toString(); return "#/inbox" + (s ? "?" + s : ""); };
  const hint = kpi.urgent ? `至急 ${kpi.urgent} 件から始めましょう` : kpi.open ? `未対応 ${kpi.open} 件・至急はありません` : "未対応はありません。お疲れさまでした";
  return `
  <header class="hh">
    <div><h1 id="list-title" tabindex="-1">${greeting(now)}</h1><div class="sub">${dateLine(now)} — ${hint}</div></div>
    <label class="search">${icon("search")}<span class="vh">検索</span><input id="q" type="search" placeholder="件名・本文・差出人" value="${esc(q.q || "")}" autocomplete="off"><kbd>/</kbd></label>
  </header>
  <div class="kpis">
    <a class="card kpi ${kpi.urgent ? "alert" : ""}" href="${link({ tab: "open", f: "urgent" })}"><span class="cir hi">${icon("bolt", "i lg")}</span><div><div class="v">${kpi.urgent}<small>件</small></div><div class="l">至急・未対応</div></div></a>
    <a class="card kpi" href="${link({ tab: "open", f: "" })}"><span class="cir nm">${icon("inbox", "i lg")}</span><div><div class="v">${kpi.open}<small>件</small></div><div class="l">未対応${kpi.late ? `<span class="late">${icon("warn", "i sm")}${kpi.late} 件が 24 時間超</span>` : ""}</div></div></a>
    <a class="card kpi" href="#/dashboard"><span class="cir ok">${icon("clock", "i lg")}</span><div><div class="v">${kpi.median != null ? fmtDuration(kpi.median).replace(/ 00 分$/, "") : "—"}</div><div class="l">初回返信の中央値</div></div></a>
  </div>
  <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<a role="tab" href="${link({ tab: id })}" aria-selected="${tab === id}">${id === "today" ? icon("bolt", "i sm") : ""}${label}${id !== "today" ? `<span class="n">${counts.tabs[id]}</span>` : ""}</a>`).join("")}</div>
  ${tab !== "today" ? `<div class="toolbar">
    <button class="chipbtn" data-filter="urgent" aria-pressed="${q.f === "urgent"}">${icon("bolt", "i sm")}至急のみ</button>
    <button class="chipbtn" data-filter="missing" aria-pressed="${q.f === "missing"}">${icon("question", "i sm")}情報不足</button>
    <label style="margin-left:auto">並び <select class="sel" id="sort" aria-label="並び順"><option value="urgent"${q.sort !== "new" ? " selected" : ""}>至急優先</option><option value="new"${q.sort === "new" ? " selected" : ""}>新着順</option></select></label>
  </div>` : ""}
  <ul class="rows" role="list" id="rows">${rows.length ? rows.map(row).join("") : emptyState(tab, q)}</ul>
  ${tab === "today" && kpi.todayTotal > rows.length ? `<a class="more" href="${link({ tab: "open" })}">ほか ${kpi.todayTotal - rows.length} 件は「未対応」へ ${icon("back", "i sm flip")}</a>` : ""}`;
}

function emptyState(tab, q) {
  const msgs = { today: ["今日やることはありません", "未対応の依頼がすべて片付いています"], open: ["未対応はありません", "すべて対応済みです。お疲れさまでした"], wip: ["対応中の依頼はありません", "詳細の対応状況で「対応中」にできます"], done: ["返信済みはまだありません", "返信案をコピーして「返信済み」にすると、ここに移ります"], all: ["依頼がありません", "設定からデモデータをリセットできます"] };
  const [t, s] = q.q || q.f ? ["該当する依頼がありません", "検索語や絞り込みを外してみてください"] : msgs[tab] || msgs.all;
  return `<li class="empty">${illustration(q.q || q.f ? "search" : tab === "open" || tab === "today" ? "clear" : "inbox")}<b>${t}</b><span class="small">${s}</span></li>`;
}

/** 空状態の線画イラスト（トレイ＋チェック / 虫眼鏡 / 空のトレイ） */
export function illustration(kind) {
  const tray = '<path d="M20 58l8-22h64l8 22v26a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M20 58h22l6 10h24l6-10h22"/>';
  const body = kind === "clear"
    ? `${tray}<circle cx="86" cy="28" r="14" fill="var(--ok-soft)" stroke="var(--ok)"/><path d="m79 28 5 5 9-10" stroke="var(--ok)"/><path d="M30 22l3-3M26 30h-4M34 14v-4" stroke="var(--brand)"/>`
    : kind === "search"
      ? `${tray}<circle cx="82" cy="30" r="13" fill="var(--surface)"/><path d="m91 39 10 10" stroke-width="3"/><path d="M76 30h12" stroke-dasharray="2 3"/>`
      : `${tray}<path d="M46 20h28M40 12h40" stroke-dasharray="3 4" opacity=".6"/>`;
  return `<svg class="ill" viewBox="0 0 120 92" aria-hidden="true" focusable="false"><g fill="var(--brand-soft)" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

/** 行 = 3 段（名前 — 件名 / 4 つの事実 / 開く）。r={item,cls,status,seen,receivedMs,now,selected,qs,missingCount} */
export function row(r) {
  const it = r.item, c = r.cls, urg = c.urgency.finalId;
  return `<li><a class="row ${r.seen ? "" : "unread"}" href="#/inbox/${it.id}${r.qs}" data-id="${it.id}" aria-current="${r.selected ? "true" : "false"}" aria-label="${esc(c.urgency.finalLabel)} ${esc(it.from.name)} 様 ${esc(it.subject)}">
    <span class="cir ${URGENCY_CLS[urg]}" aria-hidden="true">${typeIcon(c.type.finalId, "i lg")}</span>
    <span class="rt">
      <span class="rn"><b>${esc(it.from.name)} 様</b><span class="rs">${esc(it.subject)}</span></span>
      <span class="rf"><span class="${urg === "high" ? "hi" : ""}">${icon(URGENCY_ICON[urg], "i sm")}${esc(c.urgency.finalLabel)}</span><span>${typeIcon(c.type.finalId, "i sm")}${esc(c.type.finalName)}</span><span>${icon("yen", "i sm")}${c.band ? `${c.band.min}〜${c.band.max} 万円` : "要確認"}</span><span><time datetime="${new Date(r.receivedMs).toISOString()}">${icon("clock", "i sm")}${relative(r.receivedMs, r.now)}</time></span>${r.status !== "open" ? `<span class="chip ${STATUS[r.status].cls}">${STATUS[r.status].label}</span>` : ""}${r.missingCount >= 2 && r.status === "open" ? `<span class="q">${icon("question", "i sm")}情報不足</span>` : ""}</span>
    </span>
    <span class="go" aria-hidden="true">開く ${icon("back", "i sm flip")}</span>
  </a></li>`;
}

// ---------- 詳細（右パネル） ----------
/** 要約の予算文（例「150万円以内」「建物本体2500万円程度」）から万円の数値を取り出す。取れなければ null */
export function parseBudget(text) {
  const m = String(text || "").match(/(\d[\d,]*)\s*万円/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}
/** 軸の上限を 1/2/5×10^n に丸める（例 188 → 200） */
export function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
/** 概算帯のレンジバー。帯の両端に金額ラベル・依頼者の予算はピンで重ねる（帯内 = 青・帯外 = 黄）— R7 指摘反映 */
export function rangeBar(band, budget) {
  const max = niceMax(Math.max(band.max, budget || 0) * 1.15);
  const pct = (v) => Math.min(100, Math.round((v / max) * 1000) / 10);
  const inBand = budget != null && budget >= band.min && budget <= band.max;
  const fmt = (v) => v.toLocaleString("ja-JP");
  const pin = budget != null ? `<div class="pin ${inBand ? "" : "out"}" style="left:${pct(budget)}%"><span>ご予算 ${fmt(budget)} 万${inBand ? "" : budget < band.min ? "（帯より下）" : "（帯より上）"}</span></div>` : "";
  const label = `目安 ${band.min}〜${band.max} 万円${budget != null ? `・ご予算 ${budget} 万円は${inBand ? "帯の中" : "帯の外"}` : "・予算は未記載"}`;
  return `<div class="range" role="img" aria-label="${esc(label)}">${pin}<div class="track"><div class="seg" style="left:${pct(band.min)}%;width:${pct(band.max) - pct(band.min)}%"></div></div>
    <div class="ends"><span style="left:${pct(band.min)}%">${fmt(band.min)}万</span><span style="left:${pct(band.max)}%">${fmt(band.max)}万</span></div>
    <div class="ticks"><span>0</span><span>${fmt(max)} 万円</span></div></div>`;
}

export function detail(r, rules, draft, note) {
  if (!r) return "";
  const it = r.item, c = r.cls, ch = CHANNEL[it.channel], urg = c.urgency.finalId, s = it.summary || {}, status = r.status;
  const budget = parseBudget(s.budget);
  const typeOptions = [...rules.types, rules.other].map((t) => `<option value="${t.id}"${t.id === c.type.finalId ? " selected" : ""}>${esc(t.name)}</option>`).join("");
  const urgOptions = ["high", "normal", "low"].map((u) => `<option value="${u}"${u === urg ? " selected" : ""}>${esc(rules.urgency[u].label)}</option>`).join("");
  const kw = (arr) => arr.map((k) => `<code>${esc(k)}</code>`).join(" ");
  const typeWhy = c.type.manual ? `手動で変更（自動判定: ${esc(c.type.name)}）` : c.type.matched.length ? `${kw(c.type.matched)} の ${c.type.matched.length} 語が一致${c.type.runnerUp ? `（次点 ${esc(c.type.runnerUp.name)} ${c.type.runnerUp.score} 語）` : ""}` : "一致する語なし";
  const urgWhy = c.urgency.manual ? `手動で変更（自動判定: ${esc(c.urgency.label)}）` : c.urgency.matched.length ? `${kw(c.urgency.matched)} を検出` : "至急語・検討語なし";
  const points = [["pin", "場所", s.place], ["house", "規模", s.size], ["calendar", "時期", s.timing], ["yen", "予算", s.budget]]
    .map(([ic, l, v]) => { const ok = v && v !== "未記載"; return `<div class="pt ${ok ? "" : "ng"}"><span class="cir ${ok ? "neutral" : "am"}">${icon(ok ? ic : "xc", "i sm")}</span><div><div class="l">${l}</div><div class="v">${ok ? esc(v) : "未記載"}</div></div></div>`; }).join("");
  const contactOk = !!(it.from.email || it.from.tel);
  const missing = (s.missing || []).map((m) => `<span class="chip st-open">${icon("question", "i sm")}${esc(m)}</span>`).join("");
  const steps = [["open", "inbox"], ["wip", "edit"], ["done", "check"], ["hold", "clock"]].map(([id, ic]) => `<button class="step ${id} ${id === status ? "on" : ""}" data-action="set-status" data-value="${id}" aria-pressed="${id === status}">${icon(ic, "i sm")}${STATUS[id].label}</button>`).join("");
  const mailto = `mailto:${encodeURIComponent(it.from.email || "")}?subject=${encodeURIComponent("Re: " + it.subject)}&body=${encodeURIComponent(draft ?? it.reply)}`;
  return `
  <div class="ph">
    <div class="who"><button class="btn ghost sm backbtn" data-action="back">${icon("back")}戻る</button><span>${esc(it.from.name)} 様</span><span>${icon(ch.icon, "i sm")}${ch.label}</span><span>${icon("clock", "i sm")}${relative(r.receivedMs, r.now)}</span><button class="btn ghost sm closebtn" data-action="back" aria-label="閉じる">${icon("x")}</button></div>
    <h1 id="detail-title" tabindex="-1">${esc(it.subject)}</h1>
    <div class="st"><span class="big ${URGENCY_CLS[urg]}">${icon(URGENCY_ICON[urg])}${esc(c.urgency.finalLabel)}</span><span class="big type">${typeIcon(c.type.finalId)}${esc(c.type.finalName)}</span>${c.type.manual || c.urgency.manual ? `<span class="chip manual">手動</span>` : ""}</div>
  </div>
  <div class="pb">
    <div class="pts">${points}</div>
    ${missing ? `<div class="miss"><span class="l">${icon("question", "i sm")}返信で確認</span>${missing}</div>` : ""}
    <div class="bandbox">
      <div class="l">${icon("yen", "i sm")}概算の目安（現地調査前・目安表の行を引用）</div>
      ${c.band ? `<div class="v">${c.band.min.toLocaleString("ja-JP")}〜${c.band.max.toLocaleString("ja-JP")}<small>万円</small></div>${rangeBar(c.band, budget)}` : `<div class="v" style="font-size:16px">該当行なし</div><div class="why">目安表に行がないため金額は出しません。担当者が確認します</div>`}
    </div>
    <details class="sec">
      <summary>${icon("form")}本文を読む<span class="tag neutral">架空のサンプル</span></summary>
      <div class="msg"><div class="from"><span class="av" aria-hidden="true">${esc((it.from.name || "?").slice(0, 1))}</span><div><b>${esc(it.from.name)} 様</b><br>${esc(it.from.email || (it.from.tel ? "電話 " + it.from.tel : "連絡先の記載なし"))}</div></div>${esc(it.body)}</div>
    </details>
    <details class="sec" open>
      <summary>${icon("reply")}返信案<span class="tag">事前生成</span></summary>
      <label class="vh" for="draft">返信文（編集できます）</label><textarea id="draft" class="ta" data-action="draft" spellcheck="false">${esc(draft ?? it.reply)}</textarea>
      <div class="ft"><button class="btn ghost sm" data-action="reset-draft"${draft != null && draft !== it.reply ? "" : " hidden"}>元に戻す</button><span class="note">${icon("user", "i sm")}送信と金額の判断は人が行います</span></div>
    </details>
    <details class="sec">
      <summary>${icon("sparkle")}判定の詳細<span class="tag">固定ルール</span></summary>
      <dl class="kv">
        <dt>工種</dt><dd><div class="ovr"><select class="sel" data-action="type" aria-label="工種を変更">${typeOptions}</select>${c.type.manual ? `<button class="btn ghost sm" data-action="reset-type">自動に戻す</button>` : ""}</div><div class="why">${typeWhy}</div></dd>
        <dt>緊急度</dt><dd><div class="ovr"><select class="sel" data-action="urgency" aria-label="緊急度を変更">${urgOptions}</select>${c.urgency.manual ? `<button class="btn ghost sm" data-action="reset-urgency">自動に戻す</button>` : ""}</div><div class="why">${urgWhy}</div></dd>
        <dt>5 項目</dt><dd><ul class="check">${[["場所", s.place], ["規模", s.size], ["時期", s.timing], ["予算", s.budget], ["連絡先", contactOk ? "あり" : ""]].map(([l, v]) => { const ok = v && v !== "未記載"; return `<li class="${ok ? "ok" : "ng"}">${icon(ok ? "checkc" : "xc", "i sm")}${l}</li>`; }).join("")}</ul></dd>
      </dl>
    </details>
    <details class="sec">
      <summary>${icon("clock")}履歴とメモ<span class="tag neutral">端末内に保存</span></summary>
      <div class="timeline">${timeline(r)}</div>
      <label class="vh" for="note">メモ</label><textarea id="note" class="ta note-ta" data-action="note" placeholder="現地調査の候補日・担当者の申し送りなど">${esc(note || "")}</textarea>
    </details>
  </div>
  <div class="pf">
    <div class="stepper" role="group" aria-label="対応状況">${steps}</div>
    <div class="acts"><button class="btn primary" data-action="copy">${icon("copy")}コピー</button><a class="btn" href="${mailto}" data-action="mailto">${icon("mail")}メール</a>${status === "done" ? `<button class="btn" data-action="reopen">${icon("reset")}未対応へ</button>` : `<button class="btn ok" data-action="done">${icon("check")}返信済み</button>`}</div>
  </div>`;
}

function timeline(r) {
  const it = r.item, c = r.cls;
  const lines = [
    `<div><span class="tdot on">${icon(CHANNEL[it.channel].icon, "i sm")}</span><span>${fmtDate(r.receivedMs)} 受信（${CHANNEL[it.channel].label}）</span></div>`,
    `<div><span class="tdot on">${icon("sparkle", "i sm")}</span><span>${fmtDate(r.receivedMs)} 自動仕分け: ${esc(c.type.name)} / ${esc(c.urgency.label)} / ${esc(formatBand(c.band))}</span></div>`,
  ];
  if (c.type.manual || c.urgency.manual) lines.push(`<div><span class="tdot on">${icon("edit", "i sm")}</span><span>手動で仕分けを変更: ${esc(c.type.finalName)} / ${esc(c.urgency.finalLabel)}</span></div>`);
  if (r.repliedMs) {
    lines.push(`<div><span class="tdot ok">${icon("check", "i sm")}</span><span>${fmtDate(r.repliedMs)} 返信済み（初回返信まで ${fmtDuration(r.repliedMs - r.receivedMs)}）</span></div>`);
  } else {
    const left = r.receivedMs + SLA_MS - r.now;
    lines.push(`<div><span class="tdot ${left < 0 ? "hi" : "wait"}">${icon(left < 0 ? "warn" : "clock", "i sm")}</span><span>返信待ち — 目標 24 時間以内 <span class="sla ${left < 0 ? "late" : ""}">${left < 0 ? `（${fmtDuration(-left)} 超過）` : `（残り ${fmtDuration(left)}）`}</span></span></div>`);
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
    <div class="card kpi ${urgentOpen.length ? "alert" : ""}"><span class="ico hi">${icon("bolt")}</span><div class="k">至急で未対応</div><div class="v">${urgentOpen.length}<small>件</small></div><div class="s">${urgentOpen.length ? "本日中に現地確認の連絡を" : "至急の未対応はありません"}</div>
      ${urgentOpen.length ? `<ul class="mini">${urgentOpen.slice(0, 3).map((r) => `<li><a href="#/inbox/${r.item.id}">${typeIcon(r.cls.type.finalId, "i sm")}<b>${esc(r.item.from.name)} 様</b><span>${esc(r.item.subject)}</span></a></li>`).join("")}${urgentOpen.length > 3 ? `<li><a href="#/inbox?f=urgent">ほか ${urgentOpen.length - 3} 件 →</a></li>` : ""}</ul>` : ""}</div>
    <div class="card kpi"><span class="ico st-open">${icon("inbox")}</span><div class="k">未対応</div><div class="v">${open.length}<small>件</small></div><div class="s">${late.length ? `<span style="color:var(--danger)">${icon("warn", "i sm")}うち ${late.length} 件が目標 24 時間を超過</span>` : `${icon("check", "i sm")}24 時間超過なし`}</div></div>
    <div class="card kpi"><span class="ico ok">${icon("clock")}</span><div class="k">初回返信までの中央値</div><div class="v">${median != null ? fmtDuration(median).replace(/ 00 分$/, "") : "—"}</div><div class="s">${durations.length} 件中 ${within} 件が 24 時間以内</div>${durations.length ? `<div class="meter" role="img" aria-label="24 時間以内の割合 ${Math.round((within / durations.length) * 100)}%"><span style="width:${Math.round((within / durations.length) * 100)}%"></span></div>` : ""}</div>
    <div class="card kpi"><span class="ico brand">${icon("chart")}</span><div class="k">今週の依頼</div><div class="v">${week.length}<small>件</small></div><div class="s">直近 7 日の受信</div></div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <section class="card" aria-labelledby="c1"><div class="hd" id="c1">日別の受信件数（14 日）</div><div class="bd">${vbar(days)}</div></section>
    <section class="card" aria-labelledby="c2"><div class="hd" id="c2">工種別の内訳</div><div class="bd">${hbar(byType)}</div></section>
    <section class="card" aria-labelledby="c3"><div class="hd" id="c3">対応状況</div><div class="bd">${stacked([{ label: "未対応", value: st("open"), cls: "st-open" }, { label: "対応中", value: st("wip"), cls: "st-wip" }, { label: "返信済", value: st("done"), cls: "st-done" }, { label: "保留", value: st("hold"), cls: "st-hold" }])}
      <div style="margin-top:16px;font-weight:700;font-size:13px">緊急度</div>${stacked([{ label: "至急", value: ug("high"), cls: "hi" }, { label: "通常", value: ug("normal"), cls: "nm" }, { label: "検討中", value: ug("low"), cls: "lo" }])}
      <div style="margin-top:16px;font-weight:700;font-size:13px">受信経路</div>${hbar(chn, { rowH: 26 })}</div></section>
    <section class="card" aria-labelledby="c4"><div class="hd" id="c4">よく不足している情報</div><div class="bd">${byMissing.length ? hbar(byMissing, { labelW: 150 }) : '<span class="muted">なし</span>'}<div class="why" style="margin-top:8px">Web フォームの必須項目に加えると、返信までの往復が減ります</div></div></section>
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
        <div class="node">${icon("inbox")}<b>ブラウザ / PWA</b>依頼文と<br>仕分け結果・キーなし</div><div class="arrow" aria-hidden="true">→</div>
        <div class="node">${icon("server")}<b>自社サーバ</b>${icon("lock", "i inl")}キー保管・ログ<br>目安表・返信テンプレ</div><div class="arrow" aria-hidden="true">→</div>
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
    <section class="card" aria-labelledby="m3"><div class="hd" id="m3">${icon("keyboard")}キーボード</div><div class="bd">${keyList()}</div></section>
    <section class="card" aria-labelledby="m4"><div class="hd" id="m4">${icon("reset")}デモデータ</div><div class="bd">
      <div class="small">対応状況・手動の仕分け・返信文の編集・メモ・目安表の編集は端末内（localStorage）だけに保存されています</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn sm danger" data-action="reset-all">${icon("reset")}初期状態に戻す</button><a class="btn sm" href="#/about">${icon("info")}仕組みを見る</a></div>
    </div></section>
  </div>
  <p class="small muted" style="margin-top:18px">見積トリアージ（デモ）v${esc(env.version)} · 架空のサンプルです。実在の会社・人物・案件とは関係ありません · <a href="/works/mitsumori-triage/">制作について</a></p>`;
}

// ---------- キーボードヘルプ ----------
export const KEYS = [["j", "k", "次 / 前の依頼"], ["Enter", "", "依頼を開く"], ["Esc", "", "一覧に戻る（スマホ）・閉じる"], ["/", "", "検索へ"], ["c", "", "返信案をコピー"], ["d", "", "返信済みにする"], ["1", "4", "受信箱 / 集計 / 目安表 / 設定"], ["?", "", "この一覧"]];
export function keyList() {
  return `<ul class="kbd">${KEYS.map(([a, b, l]) => `<li><kbd>${esc(a)}</kbd>${b ? (b === "4" ? "〜" : "") + `<kbd>${esc(b)}</kbd>` : ""}${esc(l)}</li>`).join("")}</ul>`;
}
export function help() {
  return `<div class="help-card card" role="document"><div class="hd">${icon("keyboard")}キーボード操作<button class="btn ghost sm" data-action="close-help" aria-label="閉じる" style="margin-left:auto">${icon("x")}</button></div><div class="bd">${keyList()}</div></div>`;
}

// ---------- 仕組み ----------
export function about(rules, samples) {
  return `
  <h1 id="page-title" tabindex="-1">仕組み</h1>
  <p class="lead">「AI は下書きまで。送信と金額の判断は人」— このデモが何を自動で決め、何を決めないか</p>
  <div class="flow card" role="img" aria-label="流れ: 受信 → 工種の判定 → 緊急度 → 概算帯の引用 → 要約と返信案 → 人が確認して送信">
    ${[["mail", "受信", "フォーム / メール / 電話"], ["table", "工種の判定", "キーワード一致数"], ["bolt", "緊急度", "至急語・検討語"], ["yen", "概算帯", "目安表の行を引用"], ["sparkle", "要約・返信案", "デモは事前生成"], ["user", "人が判断", "編集・コピー・送信"]].map(([ic, t, d], i) => `${i ? '<span class="arrow" aria-hidden="true">→</span>' : ""}<div class="node ${i === 5 ? "human" : ""}">${icon(ic)}<b>${t}</b>${d}</div>`).join("")}
  </div>
  <ol class="steps card" style="padding:18px 20px;margin-top:14px">
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
