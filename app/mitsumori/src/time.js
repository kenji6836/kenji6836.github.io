// 相対時刻の表示（サンプルは「表示時刻からの相対分」で持つ）
export function receivedAt(item, now = Date.now()) { return now - item.received_min_ago * 60_000; }

export function relative(ms, now = Date.now()) {
  const d = Math.max(0, now - ms);
  const m = Math.round(d / 60_000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m} 分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 時間前`;
  const days = Math.floor(h / 24);
  if (days === 1) return "昨日";
  if (days < 14) return `${days} 日前`;
  return fmtDate(ms);
}

export function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDuration(ms) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} 分`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 時間 ${String(m % 60).padStart(2, "0")} 分`;
  return `${Math.floor(h / 24)} 日 ${h % 24} 時間`;
}

/** 返信時刻。サンプルの受信時刻は「表示時刻からの相対」で動くので、返信も受信からの経過（durationMs）で持って一緒に動かす（R2 指摘: 絶対時刻だと所要時間が縮んで負になる） */
export function repliedAt(item, rep, receivedMs, now = Date.now()) {
  if (!rep) return null;
  if (rep.minAgo != null) return now - rep.minAgo * 60_000; // サンプル初期値（表示時刻からの相対）
  return receivedMs + item.received_min_ago * 60_000; // 手動で返信済みにした時点の「受信からの経過」= その時のサンプル年齢
}
