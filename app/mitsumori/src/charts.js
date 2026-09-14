// 依存なしの SVG チャート。単一系列は 1 色（ブランド）・状態色は「至急/未対応/返信済」だけに予約。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** 横棒（工種別内訳など）。items = [{label, value, color?}] */
export function hbar(items, { width = 420, rowH = 28, labelW = 92, max } = {}) {
  const m = max || Math.max(1, ...items.map((i) => i.value));
  const h = items.length * rowH;
  const plotW = width - labelW - 44;
  const rows = items.map((it, i) => {
    const y = i * rowH;
    const w = Math.max(it.value > 0 ? 4 : 0, Math.round((it.value / m) * plotW));
    const fill = it.color || "var(--brand)";
    return `<g class="row" tabindex="0" role="listitem" aria-label="${esc(it.label)} ${it.value} 件">
      <text x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="middle" class="lbl">${esc(it.label)}</text>
      <rect x="${labelW}" y="${y + 7}" width="${plotW}" height="${rowH - 14}" rx="4" class="track"/>
      <rect x="${labelW}" y="${y + 7}" width="${w}" height="${rowH - 14}" rx="4" fill="${fill}" class="bar"><title>${esc(it.label)}: ${it.value} 件</title></rect>
      <text x="${labelW + w + 8}" y="${y + rowH / 2}" dominant-baseline="middle" class="val">${it.value}</text>
    </g>`;
  });
  return `<svg class="chart hbar" viewBox="0 0 ${width} ${h}" width="100%" role="list" aria-label="内訳">${rows.join("")}</svg>`;
}

/** 縦棒（日別件数）。items = [{label, value, hi?}]・最後の棒を強調 */
export function vbar(items, { width = 420, height = 120, max } = {}) {
  const m = max || Math.max(1, ...items.map((i) => i.value));
  const gap = 4, padB = 18, padT = 14;
  const bw = (width - gap * (items.length - 1)) / items.length;
  const plotH = height - padB - padT;
  const bars = items.map((it, i) => {
    const x = i * (bw + gap);
    const bh = it.value > 0 ? Math.max(4, Math.round((it.value / m) * plotH)) : 0;
    const y = padT + plotH - bh;
    const last = i === items.length - 1;
    return `<g tabindex="0" role="listitem" aria-label="${esc(it.label)} ${it.value} 件">
      <rect x="${x}" y="${padT}" width="${bw}" height="${plotH}" class="track" rx="3"/>
      ${bh ? `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" class="bar ${last ? "last" : ""}"><title>${esc(it.label)}: ${it.value} 件</title></rect>` : ""}
      ${last || it.value === m ? `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" class="val">${it.value}</text>` : ""}
      ${i % 2 === 0 || last ? `<text x="${x + bw / 2}" y="${height - 4}" text-anchor="middle" class="lbl small">${esc(it.label)}</text>` : ""}
    </g>`;
  });
  return `<svg class="chart vbar" viewBox="0 0 ${width} ${height}" width="100%" role="list" aria-label="日別件数">${bars.join("")}</svg>`;
}

/** 積み上げ 1 本（状態や緊急度の構成比）。parts = [{label, value, cls}] */
export function stacked(parts, { width = 420, height = 14 } = {}) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  let x = 0;
  const segs = parts.map((p) => {
    const w = Math.round((p.value / total) * width);
    const s = `<rect x="${x}" y="0" width="${Math.max(0, w - 2)}" height="${height}" rx="4" class="seg ${p.cls}"><title>${esc(p.label)}: ${p.value} 件</title></rect>`;
    x += w;
    return p.value ? s : "";
  });
  const legend = parts.map((p) => `<li><span class="sw ${p.cls}"></span>${esc(p.label)} <b>${p.value}</b></li>`).join("");
  return `<svg class="chart stacked" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" aria-hidden="true">${segs.join("")}</svg><ul class="legend">${legend}</ul>`;
}
