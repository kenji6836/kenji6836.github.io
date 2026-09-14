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
