// 固定ルールの仕分け（デモ用）。ブラウザと node の両方で動く純関数。
// 工種 = キーワード一致数が最大の行 / 緊急度 = 至急語 > 検討語 > 通常 / 概算帯 = 目安表の行を引用（計算しない）

export function normalize(text) {
  return String(text || "").normalize("NFKC").toLowerCase();
}

function hits(text, keywords) {
  return (keywords || []).filter((k) => text.includes(normalize(k)));
}

/** 工種を決める。戻り値 {id, name, score, matched[], runnerUp} */
export function classifyType(rules, subject, body) {
  const text = normalize(`${subject}\n${body}`);
  const scored = rules.types.map((t) => {
    const matched = hits(text, t.keywords);
    return { id: t.id, name: t.name, score: matched.length, matched };
  });
  let best = null;
  for (const s of scored) if (!best || s.score > best.score) best = s; // 同点は先勝ち
  const runnerUp = scored.filter((s) => s !== best && s.score > 0).sort((a, b) => b.score - a.score)[0] || null;
  if (!best || best.score === 0) {
    return { id: rules.other.id, name: rules.other.name, score: 0, matched: [], runnerUp: null };
  }
  return { ...best, runnerUp: runnerUp ? { id: runnerUp.id, name: runnerUp.name, score: runnerUp.score } : null };
}

/** 緊急度を決める。戻り値 {id: high|normal|low, label, matched[]} */
export function classifyUrgency(rules, subject, body) {
  const text = normalize(`${subject}\n${body}`);
  const hi = hits(text, rules.urgency.high.keywords);
  if (hi.length) return { id: "high", label: rules.urgency.high.label, matched: hi };
  const lo = hits(text, rules.urgency.low.keywords);
  if (lo.length) return { id: "low", label: rules.urgency.low.label, matched: lo };
  return { id: "normal", label: rules.urgency.normal.label, matched: [] };
}

/** 目安表から概算帯を引用する。戻り値 {min, max, note} | null（該当行なし） */
export function lookupBand(rules, typeId) {
  const t = rules.types.find((x) => x.id === typeId);
  if (!t || !t.band) return null;
  return { min: t.band[0], max: t.band[1], note: t.note };
}

/** 必須項目の有無（正規表現の存在チェックのみ）。戻り値 {present[], missing[]} */
export function checkFields(rules, subject, body) {
  const text = normalize(`${subject}\n${body}`);
  const present = [], missing = [];
  for (const f of rules.required_fields) {
    const def = rules[f.id];
    let ok = false;
    if (def && def.pattern) ok = new RegExp(def.pattern, "i").test(text);
    else if (def && def.keywords) ok = hits(text, def.keywords).length > 0;
    (ok ? present : missing).push(f);
  }
  return { present, missing };
}

/** まとめて仕分け。override = {type?, urgency?}（手動上書き） */
export function classify(rules, item, override = {}) {
  const type = classifyType(rules, item.subject, item.body);
  const urgency = classifyUrgency(rules, item.subject, item.body);
  const finalTypeId = override.type || type.id;
  const finalUrgencyId = override.urgency || urgency.id;
  const typeRow = rules.types.find((t) => t.id === finalTypeId) || rules.other;
  const urgencyLabel = finalUrgencyId === urgency.id ? urgency.label : rules.urgency[finalUrgencyId].label;
  return {
    type: { ...type, finalId: finalTypeId, finalName: typeRow.name, manual: !!override.type && override.type !== type.id },
    urgency: { ...urgency, finalId: finalUrgencyId, finalLabel: urgencyLabel, manual: !!override.urgency && override.urgency !== urgency.id },
    band: lookupBand(rules, finalTypeId),
    fields: checkFields(rules, item.subject, item.body),
  };
}

export function formatBand(band) {
  if (!band) return "該当行なし";
  return `${band.min.toLocaleString("ja-JP")}〜${band.max.toLocaleString("ja-JP")} 万円`;
}
