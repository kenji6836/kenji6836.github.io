// 端末内の状態（対応状況・手動上書き・メモ）。localStorage に保存。サーバなし。
const KEY = "mitsumori.demo.v1";

const defaultState = () => ({ status: {}, override: {}, notes: {}, replied: {}, seen: {}, bandTable: null, createdAt: Date.now() });

export function createStore(samples) {
  let state = load();
  const listeners = new Set();
  // 初期ステータス（サンプルの initial_status）を未設定分だけ流し込む
  let seeded = false;
  for (const it of samples.items) {
    if (!(it.id in state.status)) { state.status[it.id] = it.initial_status || "open"; seeded = true; }
    if (it.initial_status === "done" && !(it.id in state.replied) && it.replied_min_ago != null) {
      state.replied[it.id] = { minAgo: it.replied_min_ago, seeded: true }; seeded = true;
    }
  }
  if (seeded) save(state);

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return { ...defaultState(), ...JSON.parse(raw) }; } catch {}
    return defaultState();
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  function emit() { for (const l of listeners) l(state); }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setStatus(id, status) {
      state.status[id] = status;
      if (status === "done" && !state.replied[id]) state.replied[id] = { at: Date.now() };
      if (status !== "done" && state.replied[id] && !state.replied[id].seeded) delete state.replied[id];
      save(state); emit();
    },
    setOverride(id, patch) {
      const cur = state.override[id] || {};
      const next = { ...cur, ...patch };
      for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
      if (Object.keys(next).length) state.override[id] = next; else delete state.override[id];
      save(state); emit();
    },
    setNote(id, text) { if (text) state.notes[id] = text; else delete state.notes[id]; save(state); emit(); },
    markSeen(id) { if (!state.seen[id]) { state.seen[id] = Date.now(); save(state); emit(); } },
    setBandTable(table) { state.bandTable = table; save(state); emit(); },
    reset() { state = defaultState(); save(state); for (const it of samples.items) state.status[it.id] = it.initial_status || "open"; for (const it of samples.items) if (it.initial_status === "done" && it.replied_min_ago != null) state.replied[it.id] = { minAgo: it.replied_min_ago, seeded: true }; save(state); emit(); },
  };
}
