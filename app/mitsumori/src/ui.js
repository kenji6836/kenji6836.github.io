// 小さな DOM ヘルパー・線画アイコン・トースト・キーボード
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ICONS = {
  inbox: '<path d="M3 12l2.5-7h13L21 12v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 12h5l1.5 3h5L16 12h5"/>',
  chart: '<path d="M4 19h16M6 16V9m6 7V5m6 11v-6"/>',
  table: '<path d="M4 5h16v14H4zM4 10h16M9 5v14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  mail: '<path d="M4 6h16v12H4zM4 7l8 6 8-6"/>',
  form: '<path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  sparkle: '<path d="m12 3 1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  reply: '<path d="M4 4h16v11H8l-4 4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  warn: '<path d="M12 9v4m0 4h.01M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  offline: '<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3-2.2M12 20h.01M19 13a10 10 0 0 0-8.8-3"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M2 9a14 14 0 0 1 20 0"/>',
  filter: '<path d="M3 5h18l-7 8v5l-4 2v-7z"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5"/>',
  server: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6"/>',
  note: '<path d="M6 3h9l5 5v13H6zM14 3v6h6M9 13h6M9 17h6"/>',
};
export function icon(name, cls = "i") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;
}

let toastTimer;
export function toast(msg, kind = "") {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.className = `show ${kind}`; el.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = ""), 2400);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch { return false; }
}

export const CHANNEL = { form: { label: "Web フォーム", icon: "form" }, mail: { label: "メール", icon: "mail" }, phone: { label: "電話メモ", icon: "phone" } };
export const STATUS = { open: { label: "未対応", cls: "st-open" }, wip: { label: "対応中", cls: "st-wip" }, done: { label: "返信済", cls: "st-done" }, hold: { label: "保留", cls: "st-hold" } };
export const URGENCY_CLS = { high: "hi", normal: "nm", low: "lo" };
