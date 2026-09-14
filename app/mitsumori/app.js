// 見積トリアージ（デモ）— 起動・hash ルータ・描画・イベント委譲・キーボード・PWA。
// 画面の HTML は src/views.js（純関数）、仕分けは src/classify.js、状態は src/store.js（localStorage）。
import { classify, normalize } from "./src/classify.js";
import { createStore } from "./src/store.js";
import { receivedAt, repliedAt } from "./src/time.js";
import { $, $$, toast, copyText, icon } from "./src/ui.js";
import * as V from "./src/views.js";

export const VERSION = "1.0.0";
const ROUTES = ["inbox", "dashboard", "table", "settings", "about"];
const TITLES = { inbox: "受信箱", dashboard: "ダッシュボード", table: "概算目安表", settings: "設定", about: "仕組み" };
const mobile = () => matchMedia("(max-width: 900px)").matches;
const isTyping = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

let rules, samples, store;
let deferredInstall = null;
let env = { installed: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true, canInstall: false, sw: false, online: navigator.onLine, version: VERSION };
let pendingFocusId = null; // j/k で移動した直後にフォーカスする行
let lastRoute = null, lastSelected = null;

// ---------- ルート ----------
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const seg = path.split("/").filter(Boolean);
  const route = ROUTES.includes(seg[0]) ? seg[0] : "inbox";
  const id = route === "inbox" && seg[1] ? decodeURIComponent(seg[1]) : null;
  const q = Object.fromEntries(new URLSearchParams(qs));
  return { route, id, q };
}
function qsOf(q) {
  const clean = Object.fromEntries(Object.entries(q).filter(([k, v]) => v && ["tab", "f", "q", "sort"].includes(k)));
  const s = new URLSearchParams(clean).toString();
  return s ? "?" + s : "";
}
function hrefInbox(q, id) { return `#/inbox${id ? "/" + encodeURIComponent(id) : ""}${qsOf(q)}`; }
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }

// ---------- データ → 行 ----------
function effectiveRules(st) {
  if (!st.bandTable) return rules;
  return { ...rules, types: rules.types.map((t) => (st.bandTable[t.id] ? { ...t, band: st.bandTable[t.id] } : t)) };
}
function buildRows(q, selectedId, now = Date.now()) {
  const st = store.get(), rs = effectiveRules(st), qs = qsOf(q);
  return samples.items.map((item) => {
    const receivedMs = receivedAt(item, now);
    return {
      item, cls: classify(rs, item, st.override[item.id] || {}), status: st.status[item.id] || "open", seen: !!st.seen[item.id],
      receivedMs, repliedMs: repliedAt(item, st.replied[item.id], receivedMs, now),
      now, selected: item.id === selectedId, qs, missingCount: (item.summary?.missing || []).length,
    };
  });
}
const URG_RANK = { high: 0, normal: 1, low: 2 };
const matchesFilter = (r, f) => f === "urgent" ? r.cls.urgency.finalId === "high" : f === "missing" ? r.missingCount >= 2 : true;
function matchesQuery(r, q) {
  if (!q) return true;
  const t = normalize(`${r.item.subject}\n${r.item.body}\n${r.item.from.name}\n${r.item.id}`);
  return normalize(q).split(/\s+/).filter(Boolean).every((w) => t.includes(w));
}
function filterRows(all, q) {
  const tab = q.tab || "today";
  const base = all.filter((r) => matchesFilter(r, q.f) && matchesQuery(r, q.q));
  let rows = base.filter((r) => tab === "all" || r.status === (tab === "today" ? "open" : tab));
  if (tab === "today") {
    // 今日やること: 至急 → 待たせている順（古い順）。検索/絞り込み中は件数制限なし
    rows.sort((a, b) => URG_RANK[a.cls.urgency.finalId] - URG_RANK[b.cls.urgency.finalId] || a.receivedMs - b.receivedMs);
    if (!q.q && !q.f) rows = rows.slice(0, V.TODAY_MAX);
  } else {
    rows.sort((a, b) => (q.sort === "new" ? 0 : URG_RANK[a.cls.urgency.finalId] - URG_RANK[b.cls.urgency.finalId]) || b.receivedMs - a.receivedMs);
  }
  const counts = { tabs: { open: 0, wip: 0, done: 0, hold: 0, all: base.length } };
  for (const r of base) if (r.status in counts.tabs) counts.tabs[r.status]++;
  return { rows, counts };
}
function kpiOf(all, now) {
  const open = all.filter((r) => r.status === "open");
  const durations = all.filter((r) => r.repliedMs).map((r) => r.repliedMs - r.receivedMs).sort((a, b) => a - b);
  return { urgent: open.filter((r) => r.cls.urgency.finalId === "high").length, open: open.length, late: open.filter((r) => now - r.receivedMs > V.SLA_MS).length, median: durations.length ? durations[Math.floor(durations.length / 2)] : null, todayTotal: open.length };
}
function navCounts(all) {
  const open = all.filter((r) => r.status === "open");
  return { open: open.length, urgent: open.filter((r) => r.cls.urgency.finalId === "high").length, missing: open.filter((r) => r.missingCount >= 2).length };
}

// ---------- 描画 ----------
function keyOf(el) {
  if (!el || el === document.body) return null;
  if (el.id) return "#" + CSS.escape(el.id);
  if (el.dataset.band) return `[data-band="${el.dataset.band}"][data-i="${el.dataset.i}"]`;
  if (el.dataset.action) return `[data-action="${el.dataset.action}"]`;
  const row = el.closest(".row"); if (row) return `.row[data-id="${row.dataset.id}"]`;
  return null;
}
const replay = (el) => { el.classList.remove("fade"); void el.offsetWidth; el.classList.add("fade"); };
export function render() {
  const { route, id, q } = parseHash();
  const now = Date.now();
  if (route === "inbox" && id && !store.get().seen[id] && samples.items.some((x) => x.id === id)) store.markSeen(id, { silent: true });
  const st = store.get();
  const all = buildRows(q, id, now);
  const app = $("#app");
  const focusKey = keyOf(document.activeElement);
  const scrollY = window.scrollY, pbEl = $("#detail .pb"), pbTop = pbEl ? pbEl.scrollTop : 0;
  const routeChanged = route !== lastRoute, selChanged = id !== lastSelected;

  app.dataset.route = route;
  $("#nav").innerHTML = V.nav(route, navCounts(all));
  $("#tabbar").innerHTML = V.tabbar(route);
  const list = $("#list"), detail = $("#detail"), page = $("#page");
  if (route === "inbox") {
    const { rows, counts } = filterRows(all, q);
    list.innerHTML = V.home(rows, q, counts, kpiOf(all, now), now);
    const r = id ? all.find((x) => x.item.id === id) || null : null;
    if (id && !r && selChanged) toast("その依頼は見つかりません");
    detail.innerHTML = V.detail(r, effectiveRules(st), r ? st.drafts[id] ?? null : null, r ? st.notes[id] : null);
    if (r && selChanged) replay(detail);
    app.dataset.open = String(!!r);
    list.hidden = false; detail.hidden = !r; page.hidden = true;
    if (!routeChanged) { if (!selChanged) { const pb = $("#detail .pb"); if (pb) pb.scrollTop = pbTop; } if (!(selChanged && mobile())) window.scrollTo(0, scrollY); }
  } else {
    const pageHtml = route === "dashboard" ? V.dashboard(all, effectiveRules(st), now)
      : route === "table" ? V.table(effectiveRules(st), !!st.bandTable)
      : route === "settings" ? V.settings(env)
      : V.about(rules, samples);
    page.innerHTML = pageHtml;
    if (routeChanged) replay(page);
    list.hidden = true; detail.hidden = true; page.hidden = false;
  }
  document.title = `${TITLES[route]} — 見積トリアージ（デモ）`;

  // フォーカス: j/k 移動 > ルート遷移で見出しへ > 再描画前の要素へ復元
  if (pendingFocusId) {
    const el = $(`.row[data-id="${pendingFocusId}"]`); pendingFocusId = null;
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "nearest" }); }
  } else if (routeChanged && lastRoute !== null && route !== "inbox") {
    $("#page-title")?.focus();
  } else if (route === "inbox" && selChanged && id && mobile()) {
    $("#detail-title")?.focus(); window.scrollTo(0, 0);
  } else if (focusKey) {
    const el = $(focusKey); if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }
  if (route === "inbox" && id && !mobile()) $(`.row[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  lastRoute = route; lastSelected = id;
}
// 検索入力中: hash を replaceState で更新（hashchange を起こさない）してホームを描き直し、検索欄のフォーカスと caret を末尾に戻す
function renderRows(q) {
  if (parseHash().route !== "inbox" || !$("#rows")) return; // 入力直後に別ページへ移った場合は何もしない（R2 指摘）
  history.replaceState(null, "", hrefInbox(q, parseHash().id));
  const now = Date.now(), all = buildRows(q, parseHash().id, now);
  const { rows, counts } = filterRows(all, q);
  $("#list").innerHTML = V.home(rows, q, counts, kpiOf(all, now), now);
  const inp = $("#q"); if (inp) { inp.focus({ preventScroll: true }); const n = inp.value.length; inp.setSelectionRange(n, n); }
}

// ---------- イベント ----------
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; };
const onSearch = debounce((value) => { const { q } = parseHash(); q.q = value.trim(); renderRows(q); }, 150);
const onDraft = debounce((id, value) => { store.setDraft(id, value); }, 250);
const onNote = debounce((id, value) => { store.setNote(id, value); }, 250);
const onBand = debounce(() => {
  const table = {};
  for (const inp of $$("[data-band]")) { const v = Number(inp.value); if (!Number.isFinite(v) || v < 0) return; (table[inp.dataset.band] ||= [0, 0])[+inp.dataset.i] = v; }
  for (const [tid, [min, max]] of Object.entries(table)) if (min > max) { toast(`${rules.types.find((t) => t.id === tid)?.name || tid}: 下限が上限を超えています`, "warn"); return; }
  store.setBandTable(table, { silent: true });
  const btn = $('[data-action="reset-table"]'); if (btn) btn.disabled = false;
  toast("目安表を保存しました（端末内）");
}, 400);

function currentItem() { const { id } = parseHash(); return id ? samples.items.find((x) => x.id === id) : null; }
async function doCopy() {
  const it = currentItem(); if (!it) return;
  const text = $("#draft")?.value ?? store.get().drafts[it.id] ?? it.reply;
  toast((await copyText(text)) ? "返信案をコピーしました" : "コピーできませんでした");
}
function doDone() { const it = currentItem(); if (!it) return; store.setStatus(it.id, "done"); toast("返信済みにしました"); }

document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-action]");
  if (a) {
    const act = a.dataset.action, it = currentItem(), { q } = parseHash();
    switch (act) {
      case "skip": e.preventDefault(); ($("#detail-title") || $("#page-title") || $("#list-title"))?.focus(); return;
      case "back": e.preventDefault(); go(hrefInbox(q, null)); return;
      case "copy": e.preventDefault(); await doCopy(); return;
      case "done": e.preventDefault(); doDone(); return;
      case "set-status": e.preventDefault(); if (it && a.dataset.value !== store.get().status[it.id]) { store.setStatus(it.id, a.dataset.value); toast(`${a.dataset.value === "done" ? "返信済みにしました" : a.dataset.value === "open" ? "未対応に戻しました" : a.dataset.value === "wip" ? "対応中にしました" : "保留にしました"}`); } return;
      case "reopen": e.preventDefault(); if (it) { store.setStatus(it.id, "open"); toast("未対応に戻しました"); } return;
      case "reset-draft": e.preventDefault(); if (it) { onDraft.cancel(); store.setDraft(it.id, null); const ta = $("#draft"); if (ta) ta.value = it.reply; a.hidden = true; toast("返信案を元に戻しました"); } return;
      case "reset-type": e.preventDefault(); if (it) store.setOverride(it.id, { type: null }); return;
      case "reset-urgency": e.preventDefault(); if (it) store.setOverride(it.id, { urgency: null }); return;
      case "reset-table": e.preventDefault(); onBand.cancel(); store.setBandTable(null); toast("目安表を初期値に戻しました"); return;
      case "install": e.preventDefault(); if (deferredInstall) { deferredInstall.prompt(); const { outcome } = await deferredInstall.userChoice; if (outcome === "accepted") { deferredInstall = null; env.canInstall = false; render(); } } return;
      case "reset-all": e.preventDefault();
        if (a.dataset.confirm !== "1") { a.dataset.confirm = "1"; a.innerHTML = `${icon("warn")}もう一度押すと初期状態に戻します`; setTimeout(() => { if (a.isConnected && a.dataset.confirm === "1") render(); }, 4000); return; }
        store.reset(); toast("初期状態に戻しました"); return;
      case "close-help": e.preventDefault(); toggleHelp(false); return;
      case "mailto": if (it) a.href = `mailto:${encodeURIComponent(it.from.email || "")}?subject=${encodeURIComponent("Re: " + it.subject)}&body=${encodeURIComponent($("#draft")?.value ?? it.reply)}`; return; // 編集中の返信文を反映（R1 指摘）
    }
  }
  const f = e.target.closest("[data-filter]");
  if (f) { const { q, id } = parseHash(); q.f = q.f === f.dataset.filter ? "" : f.dataset.filter; go(hrefInbox(q, id)); return; }
  if (e.target.closest(".help") && !e.target.closest(".help-card")) toggleHelp(false);
});

document.addEventListener("change", (e) => {
  const el = e.target, it = currentItem();
  if (el.id === "sort") { const { q, id } = parseHash(); q.sort = el.value === "new" ? "new" : ""; go(hrefInbox(q, id)); return; }
  if (!it) return;
  if (el.dataset.action === "status") { store.setStatus(it.id, el.value); return; }
  if (el.dataset.action === "type") { const auto = classify(rules, it).type.id; store.setOverride(it.id, { type: el.value === auto ? null : el.value }); return; }
  if (el.dataset.action === "urgency") { const auto = classify(rules, it).urgency.id; store.setOverride(it.id, { urgency: el.value === auto ? null : el.value }); return; }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "q") { onSearch(el.value); return; }
  if (el.dataset.band) { onBand(); return; }
  const it = currentItem(); if (!it) return;
  if (el.id === "draft") { const changed = el.value !== it.reply; onDraft(it.id, changed ? el.value : null); const b = $('[data-action="reset-draft"]'); if (b) b.hidden = !changed; return; }
  if (el.id === "note") { onNote(it.id, el.value); }
});

// ---------- キーボード ----------
function toggleHelp(open) {
  const h = $("#help");
  if (open === undefined) open = h.hidden;
  if (open) { h.innerHTML = V.help(); h.hidden = false; $('[data-action="close-help"]').focus(); }
  else if (!h.hidden) { h.hidden = true; h.innerHTML = ""; }
}
function moveCursor(dir) {
  const rows = $$("#rows .row"); if (!rows.length) return;
  const { q, id } = parseHash();
  let idx = id ? rows.findIndex((r) => r.dataset.id === id) : -1;
  if (idx < 0) idx = rows.findIndex((r) => r === document.activeElement);
  const next = rows[Math.min(rows.length - 1, Math.max(0, idx + dir))];
  if (!next || next.dataset.id === id) { next?.focus({ preventScroll: true }); next?.scrollIntoView({ block: "nearest" }); return; }
  if (mobile() && !id) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: "nearest" }); return; } // スマホの一覧: フォーカスだけ・Enter で開く
  if (!mobile()) pendingFocusId = next.dataset.id; // スマホで詳細を開いたまま j/k: 一覧は非表示なので見出しへ（render 側）
  go(hrefInbox(q, next.dataset.id));
}
document.addEventListener("keydown", (e) => {
  const help = $("#help");
  if (!help.hidden && e.key === "Tab") { e.preventDefault(); $('[data-action="close-help"]')?.focus(); return; }
  if (e.key === "Escape") {
    if (!help.hidden) { toggleHelp(false); return; }
    if (document.activeElement?.id === "q") { document.activeElement.blur(); return; }
    if (isTyping(document.activeElement)) return;
    const { route, q, id } = parseHash();
    if (route === "inbox" && id) { e.preventDefault(); go(hrefInbox(q, null)); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
  const { route, q } = parseHash();
  switch (e.key) {
    case "j": case "ArrowDown": if (route === "inbox") { e.preventDefault(); moveCursor(+1); } break;
    case "k": case "ArrowUp": if (route === "inbox") { e.preventDefault(); moveCursor(-1); } break;
    case "/": e.preventDefault(); if (route !== "inbox") { location.hash = "#/inbox"; render(); } $("#q")?.focus(); $("#q")?.select(); break;
    case "c": if (route === "inbox") { e.preventDefault(); doCopy(); } break;
    case "d": if (route === "inbox") { e.preventDefault(); doDone(); } break;
    case "1": go(hrefInbox(q, null)); break; // ルート単位のショートカット: 詳細を閉じて一覧へ（R1 指摘）
    case "2": go("#/dashboard"); break;
    case "3": go("#/table"); break;
    case "4": go("#/settings"); break;
    case "?": e.preventDefault(); toggleHelp(); break;
  }
});

// ---------- PWA・接続 ----------
function updateNet() {
  env.online = navigator.onLine;
  const n = $("#net");
  n.hidden = env.online; n.className = "net off"; n.textContent = env.online ? "" : "オフライン（端末内のデータで動作中）";
  if (parseHash().route === "settings") render();
}
window.addEventListener("online", () => { updateNet(); toast("オンラインに戻りました"); });
window.addEventListener("offline", () => { updateNet(); toast("オフラインです。端末内のデータで動きます", "warn"); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; env.canInstall = true; if (parseHash().route === "settings") render(); });
window.addEventListener("appinstalled", () => { env.installed = true; env.canInstall = false; deferredInstall = null; toast("ホーム画面に追加しました"); if (parseHash().route === "settings") render(); });
async function registerSW() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    env.sw = !!(reg.active || navigator.serviceWorker.controller);
    if (!env.sw) { const sw = reg.installing || reg.waiting; sw?.addEventListener("statechange", () => { if (sw.state === "activated") { env.sw = true; if (parseHash().route === "settings") render(); } }); }
  } catch { env.sw = false; }
}

// ---------- 起動 ----------
async function boot() {
  document.documentElement.classList.add("js");
  try {
    const [r, s] = await Promise.all([fetch("./data/rules.json"), fetch("./data/samples.json")]);
    if (!r.ok || !s.ok) throw new Error(`HTTP ${r.status}/${s.status}`);
    [rules, samples] = await Promise.all([r.json(), s.json()]);
  } catch (err) {
    $("#boot").innerHTML = `<div class="card" style="padding:20px;max-width:480px"><b>データを読み込めませんでした</b><div class="small muted" style="margin:6px 0 12px">${String(err.message || err)}</div><button class="btn primary sm" onclick="location.reload()">再読み込み</button></div>`;
    return;
  }
  store = createStore(samples);
  store.subscribe(render);
  if (!location.hash) history.replaceState(null, "", "#/inbox");
  $("#boot").remove();
  render();
  updateNet();
  window.addEventListener("hashchange", () => { onSearch.cancel(); render(); });
  matchMedia("(max-width: 900px)").addEventListener("change", render);
  setInterval(() => { if (document.visibilityState === "visible" && !isTyping(document.activeElement)) render(); }, 60_000); // 相対時刻の更新
  registerSW();
}
boot();
