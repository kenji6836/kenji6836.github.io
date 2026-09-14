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
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  yen: '<path d="M7 4l5 7 5-7M12 11v9M8 14h8M8 17h8"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  xc: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  question: '<path d="M4 4h16v11H8l-4 4z"/><path d="M10.5 8.5a1.6 1.6 0 1 1 2.2 1.5c-.5.2-.7.5-.7 1M12 13h.01"/>',
  // 工種
  roller: '<rect x="5" y="4" width="12" height="6" rx="1.5"/><path d="M17 7h2v4h-8v3"/><rect x="10" y="14" width="2" height="6" rx="1"/>',
  roof: '<path d="M3 12 12 4l9 8"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  pot: '<path d="M5 10h14v5a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z"/><path d="M3 10h18M9 7a3 3 0 0 1 6 0"/>',
  tub: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/>',
  toilet: '<path d="M8 4h5v6H8zM5 10h14a7 7 0 0 1-14 0zM10 17v3h4v-3"/>',
  sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 13a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5H3zM6 18v2M18 18v2"/>',
  fence: '<path d="M5 20V7l2-3 2 3v13M12 20V7l2-3 2 3v13M3 11h18M3 17h18"/>',
  hammer: '<path d="M14 5l5 5-2 2-5-5z"/><path d="M12 7 4 15l3 3 8-8"/><path d="M15 4l1-1 4 4-1 1"/>',
  house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M12 12v6M9 15h6"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
};
export const TYPE_ICON = { exterior_paint: "roller", roof: "roof", kitchen: "pot", bath: "tub", toilet: "toilet", interior: "sofa", exterior_works: "fence", extension: "hammer", new_build: "house", insulation: "shield", other: "help" };
export const typeIcon = (id, cls = "i") => icon(TYPE_ICON[id] || "help", cls);
export const URGENCY_ICON = { high: "bolt", normal: "clock", low: "calendar" };
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
