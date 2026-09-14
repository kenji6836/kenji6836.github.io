(() => {
  'use strict';
  const data = window.VIZ;
  if (!data || !data.prefs || !data.prefs.length) return;

  const $ = id => document.getElementById(id);
  const blue = '#2457e6';
  const gray = '#bdc5d2';
  const ink = '#505b6e';
  const rule = '#e1e5ec';
  const nf = new Intl.NumberFormat('ja-JP');
  const format = n => nf.format(n);
  const fixed = n => n.toFixed(1);
  const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fixed(Math.abs(n))}`;
  const shortName = p => p.name === '北海道' ? p.name : p.name.replace(/[都府県]$/, '');
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const firstYear = data.years_p[0];
  const lastYear = data.years_p[data.years_p.length - 1];
  const firstH = data.years_h.indexOf(firstYear);
  const lastH = data.years_h.indexOf(lastYear);
  const lastP = data.years_p.length - 1;
  const rate = (p, year) => p.h[data.years_h.indexOf(year)] / p.p[data.years_p.indexOf(year)] * 1000;
  const nationalRate = year => data.national_h[data.years_h.indexOf(year)] / data.national_p[data.years_p.indexOf(year)] * 1000;
  const prefs = data.prefs.map(p => ({
    ...p,
    shortName: shortName(p),
    housingChange: (p.h[lastH] / p.h[firstH] - 1) * 100,
    populationChange: (p.p[lastP] / p.p[0] - 1) * 100,
    rate: rate(p, lastYear),
    geometry: new Path2D(p.path)
  }));
  const byCode = new Map(prefs.map(p => [p.code, p]));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const allRates = prefs.flatMap(p => data.years_p.map(year => rate(p, year)));
  const colorMin = Math.floor(Math.min(...allRates));
  const colorMax = Math.ceil(Math.max(...allRates));
  function mapColor(n) {
    const t = clamp((n - colorMin) / (colorMax - colorMin), 0, 1);
    return `rgb(${Math.round(228 - 192 * t)},${Math.round(236 - 149 * t)},${Math.round(253 - 23 * t)})`;
  }

  document.documentElement.classList.add('js');

  // The same marks retain their prefecture identity across all four scenes.
  const canvas = $('story-canvas');
  const ctx = canvas.getContext('2d');
  const steps = [...document.querySelectorAll('.story-step')];
  const progressLinks = [...document.querySelectorAll('.story-progress a')];
  const sceneCopy = [
    ['家を建てる数の変化', `${firstYear} → ${lastYear}`, `${firstYear}年の着工戸数を100とした推移。点は${lastYear}年。`],
    ['人口と着工、二つの変化', `${firstYear} → ${lastYear}`, '横軸は人口、縦軸は着工戸数の増減率。破線は増減なし。'],
    ['人口でそろえた日本地図', `${lastYear}`, '円の面積 = 人口1,000人あたりの着工戸数。沖縄は位置を移動。'],
    ['同じ物差しで、並べる', `${lastYear}`, '人口1,000人あたりの着工戸数。上下の位置に数値の意味はない。']
  ];
  let width = 0;
  let height = 0;
  let mobile = false;
  let bounds;
  let mapTransform;
  let layouts = [];
  let positions = [];
  let activeScene = 0;
  let transition = null;
  let animationFrame = 0;
  let scrollFrame = 0;
  let indexMax;
  const housingIndices = prefs.map(p => p.h.slice(firstH, lastH + 1).map(h => h / p.h[firstH] * 100));
  indexMax = Math.ceil(Math.max(...housingIndices.flat()) / 50) * 50;
  const popMin = Math.floor(Math.min(...prefs.map(p => p.populationChange)) / 10) * 10;
  const popMax = Math.ceil(Math.max(...prefs.map(p => p.populationChange)) / 10) * 10;
  const housingMin = Math.floor(Math.min(...prefs.map(p => p.housingChange)) / 20) * 20;
  const housingMax = Math.ceil(Math.max(...prefs.map(p => p.housingChange)) / 20) * 20;
  const rateMin = Math.floor(Math.min(...prefs.map(p => p.rate)));
  const rateMax = Math.ceil(Math.max(...prefs.map(p => p.rate)));
  const xIndex = i => lerp(bounds.l, bounds.r, i / (data.years_p.length - 1));
  const yIndex = n => lerp(bounds.b, bounds.t, n / indexMax);
  const xPop = n => lerp(bounds.l, bounds.r, (n - popMin) / (popMax - popMin));
  const yHousing = n => lerp(bounds.b, bounds.t, (n - housingMin) / (housingMax - housingMin));
  const xRate = n => lerp(30, width - 30, (n - rateMin) / (rateMax - rateMin));

  function mark(x, y, size, radius, accent = 0) {
    return { x, y, w: size, h: size, r: radius, accent };
  }

  function createLayouts() {
    bounds = { l: mobile ? 37 : 45, r: width - (mobile ? 42 : 54), t: 34, b: height - 43 };
    const mapScale = Math.min((width - 30) / 1000, (height - 24) / 990);
    mapTransform = { s: mapScale, x: (width - mapScale * 1000) / 2, y: (height - mapScale * 990) / 2 };
    const trend = prefs.map(p => mark(bounds.r, yIndex(p.h[lastH] / p.h[firstH] * 100), 7, 0, p.code === '43' ? 1 : 0));
    const scatter = prefs.map(p => {
      const accent = ['13', '43', '05'].includes(p.code) ? 1 : 0;
      const size = accent ? 10 : 7;
      return mark(xPop(p.populationChange), yHousing(p.housingChange), size, size / 2, accent);
    });
    const map = prefs.map(p => {
      const size = Math.sqrt(p.rate) * (mobile ? 3.2 : 4.7);
      return mark(mapTransform.x + p.c[0] * mapScale, mapTransform.y + p.c[1] * mapScale, size, size / 2, ['13', '43'].includes(p.code) ? 1 : 0.12);
    });
    const swarm = [];
    const sorted = prefs.map((p, i) => ({ p, i })).sort((a, b) => a.p.rate - b.p.rate);
    const placed = [];
    const diameter = mobile ? 10 : 12;
    const gap = diameter + 3;
    const center = height * 0.48;
    for (const { p, i } of sorted) {
      const x = xRate(p.rate);
      let y = center;
      for (let level = 0; level < 100; level++) {
        const offset = Math.ceil(level / 2) * gap * (level % 2 ? 1 : -1);
        y = center + offset;
        if (placed.every(other => Math.hypot(other.x - x, other.y - y) >= gap)) break;
      }
      placed.push({ x, y });
      swarm[i] = mark(x, y, diameter, diameter / 2, ['13', '43'].includes(p.code) ? 1 : 0);
    }
    layouts = [trend, scatter, map, swarm];
  }

  function text(value, x, y, options = {}) {
    ctx.fillStyle = options.color || ink;
    ctx.font = `${options.weight || 400} ${options.size || 12}px "Noto Sans JP", sans-serif`;
    ctx.textAlign = options.align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function line(x1, y1, x2, y2, color = rule, dash = []) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function label(code, value, x, y, align = 'left') {
    const point = layouts[activeDrawingScene][prefs.findIndex(p => p.code === code)];
    line(point.x, point.y, x + (align === 'right' ? -3 : 3), y + 5, '#8aa4ed');
    ctx.save();
    ctx.font = `500 12px "Noto Sans JP", sans-serif`;
    const tw = ctx.measureText(value).width;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.fillRect(align === 'right' ? x - tw - 3 : x - 3, y - 13, tw + 6, 18);
    text(value, x, y, { color: blue, weight: 500, align });
    ctx.restore();
  }
  let activeDrawingScene = 0;

  function background(scene, opacity = 1) {
    if (opacity <= 0) return;
    activeDrawingScene = scene;
    ctx.save();
    ctx.globalAlpha = opacity;
    if (scene === 0) {
      text('着工戸数（2000年 = 100）', bounds.l, 15, { size: 11 });
      for (let tick = 0; tick <= indexMax; tick += 50) {
        const y = yIndex(tick);
        line(bounds.l, y, bounds.r + 4, y, tick === 100 ? '#a6afbe' : rule, tick === 100 ? [3, 4] : []);
        text(String(tick), bounds.l - 9, y + 4, { align: 'right', size: 11 });
      }
      // Draw the accent last so the one increase stays legible in the bundle.
      const order = prefs.map((p, i) => i).sort((a, b) => (prefs[a].code === '43') - (prefs[b].code === '43'));
      for (const i of order) {
        ctx.beginPath();
        ctx.strokeStyle = prefs[i].code === '43' ? blue : '#c8cfd9';
        ctx.lineWidth = prefs[i].code === '43' ? 1.8 : 0.8;
        housingIndices[i].forEach((n, j) => j ? ctx.lineTo(xIndex(j), yIndex(n)) : ctx.moveTo(xIndex(j), yIndex(n)));
        ctx.stroke();
      }
      text(String(firstYear), bounds.l, height - 15, { size: 11 });
      text(String(lastYear), bounds.r, height - 15, { align: 'right', size: 11 });
      ['43', '39'].forEach(code => {
        const p = byCode.get(code);
        text(p.shortName, bounds.r + 8, yIndex(p.h[lastH] / p.h[firstH] * 100) + 4, { color: code === '43' ? blue : ink });
      });
    } else if (scene === 1) {
      text('着工戸数の増減（%）', bounds.l, 15, { size: 11 });
      for (let tick = housingMin; tick <= housingMax; tick += 20) {
        const y = yHousing(tick);
        line(bounds.l, y, bounds.r, y, tick === 0 ? '#8d97a9' : rule, tick === 0 ? [4, 4] : []);
        text(String(tick), bounds.l - 9, y + 4, { align: 'right', size: 11 });
      }
      for (let tick = Math.ceil(popMin / 20) * 20; tick <= popMax; tick += 20) {
        const x = xPop(tick);
        line(x, bounds.t, x, bounds.b, tick === 0 ? '#8d97a9' : rule, tick === 0 ? [4, 4] : []);
        text(String(tick), x, bounds.b + 17, { align: 'center', size: 11 });
      }
      text('人口の増減（%）', bounds.r, height - 3, { align: 'right', size: 11 });
      const tokyo = byCode.get('13');
      const kuma = byCode.get('43');
      const akita = byCode.get('05');
      label('43', '熊本', xPop(kuma.populationChange) + 14, yHousing(kuma.housingChange) - 11);
      label('13', '東京', bounds.r - 1, yHousing(tokyo.housingChange) - 17, 'right');
      label('05', '秋田', xPop(akita.populationChange) + 12, yHousing(akita.housingChange) + 23);
    } else if (scene === 2) {
      ctx.save();
      ctx.translate(mapTransform.x, mapTransform.y);
      ctx.scale(mapTransform.s, mapTransform.s);
      ctx.fillStyle = '#f3f5f8';
      ctx.strokeStyle = '#dfe4eb';
      ctx.lineWidth = 1 / mapTransform.s;
      prefs.forEach(p => { ctx.fill(p.geometry); ctx.stroke(p.geometry); });
      ctx.restore();
      const tokyo = layouts[2][prefs.findIndex(p => p.code === '13')];
      const kuma = layouts[2][prefs.findIndex(p => p.code === '43')];
      label('13', `東京 ${fixed(byCode.get('13').rate)}戸`, Math.min(width - 84, tokyo.x + 35), tokyo.y - 22);
      label('43', `熊本 ${fixed(byCode.get('43').rate)}戸`, kuma.x + 45, Math.min(height - 17, kuma.y + 29));
    } else {
      text('人口1,000人あたり（戸）', 30, 15, { size: 11 });
      for (let tick = rateMin; tick <= rateMax; tick++) {
        const x = xRate(tick);
        line(x, 31, x, height - 36, '#eef0f4');
        text(String(tick), x, height - 15, { align: 'center', size: 11 });
      }
      const low = prefs.reduce((a, b) => a.rate < b.rate ? a : b);
      const point = layouts[3][prefs.indexOf(low)];
      text(`${low.shortName} ${fixed(low.rate)}`, 30, point.y + 33, { size: 11 });
      label('13', `東京 ${fixed(byCode.get('13').rate)}`, width - 27, Math.max(52, height * 0.22), 'right');
      label('43', `熊本 ${fixed(byCode.get('43').rate)}`, width - 27, Math.min(height - 45, height * 0.76), 'right');
    }
    ctx.restore();
  }

  function drawMarks(points) {
    points.forEach(p => {
      const x = p.x - p.w / 2;
      const y = p.y - p.h / 2;
      const r = clamp(p.r, 0, Math.min(p.w, p.h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + p.w, y, x + p.w, y + p.h, r);
      ctx.arcTo(x + p.w, y + p.h, x, y + p.h, r);
      ctx.arcTo(x, y + p.h, x, y, r);
      ctx.arcTo(x, y, x + p.w, y, r);
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(189 - 153 * p.accent)},${Math.round(197 - 110 * p.accent)},${Math.round(210 + 20 * p.accent)})`;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
  }

  function draw(time) {
    animationFrame = 0;
    ctx.clearRect(0, 0, width, height);
    if (transition) {
      const t = motion.matches ? 1 : clamp((time - transition.start) / 700, 0, 1);
      const eased = t * t * (3 - 2 * t);
      background(transition.fromScene, 1 - eased);
      background(activeScene, eased);
      positions = transition.from.map((point, i) => {
        const target = layouts[activeScene][i];
        const result = {};
        for (const key of ['x', 'y', 'w', 'h', 'r', 'accent']) result[key] = lerp(point[key], target[key], eased);
        return result;
      });
      if (t === 1) transition = null;
    } else {
      background(activeScene);
      positions = layouts[activeScene];
    }
    drawMarks(positions);
    if (transition) animationFrame = requestAnimationFrame(draw);
  }

  function setScene(index, immediate = false) {
    if (index === activeScene && !immediate) return;
    const previous = activeScene;
    activeScene = index;
    $('scene-number').textContent = String(index + 1).padStart(2, '0');
    $('scene-title').textContent = sceneCopy[index][0];
    $('scene-period').textContent = sceneCopy[index][1];
    $('scene-desc').textContent = sceneCopy[index][2];
    canvas.setAttribute('aria-label', `${sceneCopy[index][0]}。${sceneCopy[index][2]} 詳細は本文とデータ表に記載。`);
    progressLinks.forEach((link, i) => i === index ? link.setAttribute('aria-current', 'step') : link.removeAttribute('aria-current'));
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
    if (!layouts.length) return;
    transition = motion.matches || immediate ? null : { from: positions.map(p => ({ ...p })), fromScene: previous, start: performance.now() };
    if (animationFrame) cancelAnimationFrame(animationFrame);
    draw(performance.now());
  }

  function updateSceneFromScroll() {
    scrollFrame = 0;
    const threshold = window.innerHeight * (window.innerWidth <= 700 ? 0.76 : 0.6);
    let index = 0;
    steps.forEach((step, i) => { if (step.querySelector('h3').getBoundingClientRect().top <= threshold) index = i; });
    setScene(index);
  }
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateSceneFromScroll);
  }, { passive: true });
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    mobile = width < 450;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    createLayouts();
    setScene(activeScene, true);
    updateSceneFromScroll();
  }
  new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
  motion.addEventListener('change', () => setScene(activeScene, true));
  document.fonts.ready.then(() => { if (layouts.length) setScene(activeScene, true); });

  // Local SVG exploration: pointer previews are separate from the pinned region.
  let year = lastYear;
  let pinnedCode = '13';
  let hoveredCode = null;
  let pinnedTooltip = false;
  const tooltip = $('map-tooltip');
  const mapWrap = $('map-wrap');
  const shapes = [...document.querySelectorAll('.pref-shape')];
  const shapeByCode = new Map(shapes.map(shape => [shape.dataset.code, shape]));
  const svgNS = 'http://www.w3.org/2000/svg';
  function svgNode(tag, attrs, content) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, val]) => node.setAttribute(key, val));
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function renderSpark(p) {
    const svg = $('detail-spark');
    const values = data.years_p.map(y => rate(p, y));
    const national = data.years_p.map(nationalRate);
    const max = Math.ceil(Math.max(...values, ...national) / 2) * 2;
    const x = i => 28 + i / lastP * 287;
    const y = n => 110 - n / max * 91;
    const path = series => series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const nodes = [];
    for (const v of [0, max]) {
      nodes.push(svgNode('line', { x1: 28, x2: 315, y1: y(v), y2: y(v), stroke: '#dce1ea' }));
      nodes.push(svgNode('text', { x: 20, y: y(v) + 4, 'text-anchor': 'end', fill: ink, 'font-size': 11 }, String(v)));
    }
    nodes.push(svgNode('path', { d: path(national), fill: 'none', stroke: '#747e90', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
    nodes.push(svgNode('path', { d: path(values), fill: 'none', stroke: blue, 'stroke-width': 2 }));
    const index = data.years_p.indexOf(year);
    nodes.push(svgNode('line', { x1: x(index), x2: x(index), y1: 10, y2: 112, stroke: '#9ca9c1', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
    nodes.push(svgNode('circle', { cx: x(index), cy: y(values[index]), r: 4, fill: blue, stroke: 'white', 'stroke-width': 1.5 }));
    nodes.push(svgNode('text', { x: 28, y: 133, fill: ink, 'font-size': 11 }, String(firstYear)));
    nodes.push(svgNode('text', { x: 315, y: 133, fill: ink, 'font-size': 11, 'text-anchor': 'end' }, String(lastYear)));
    svg.replaceChildren(...nodes);
    svg.setAttribute('aria-label', `${p.name}と全国の人口1,000人あたり着工戸数。${year}年は${p.name}${fixed(rate(p, year))}戸、全国${fixed(nationalRate(year))}戸。縦軸は0から${max}戸。`);
    $('spark-pref').textContent = p.shortName;
  }

  function renderDetail(announce = false) {
    const p = byCode.get(pinnedCode);
    const h = p.h[data.years_h.indexOf(year)];
    const population = p.p[data.years_p.indexOf(year)];
    $('detail-name').textContent = p.name;
    $('detail-state').textContent = `選択中 / ${year}`;
    $('detail-rate').textContent = fixed(rate(p, year));
    $('national-comparison').textContent = `全国 ${fixed(nationalRate(year))}戸`;
    $('detail-h').replaceChildren(document.createTextNode(format(h)), unit(' 戸'));
    $('detail-p').replaceChildren(document.createTextNode(format(population)), unit(' 人'));
    $('detail-change').replaceChildren(document.createTextNode(signed((h / p.h[firstH] - 1) * 100)), unit(' %'));
    renderSpark(p);
    if (announce) $('detail-live').textContent = `${p.name}、${year}年。人口1,000人あたり${fixed(rate(p, year))}戸、着工${format(h)}戸、人口${format(population)}人。`;
  }
  function unit(value) { const span = document.createElement('span'); span.textContent = value; return span; }

  function showTooltip(code, event) {
    const p = byCode.get(code);
    const h = p.h[data.years_h.indexOf(year)];
    const population = p.p[data.years_p.indexOf(year)];
    tooltip.innerHTML = `<strong>${p.name} <span class="tooltip-sub">${year}年</span></strong><span class="tooltip-value">${fixed(rate(p, year))}</span>戸 / 1,000人<div class="tooltip-sub">着工 ${format(h)}戸 · 人口 ${format(population)}人</div><span class="tooltip-pin">${pinnedTooltip && code === pinnedCode ? '固定中 · Escで吹き出しを閉じる' : 'クリック・Enterでこの地域を固定'}</span>`;
    tooltip.hidden = false;
    const rect = mapWrap.getBoundingClientRect();
    const shapeRect = shapeByCode.get(code).getBoundingClientRect();
    const px = event && typeof event.clientX === 'number' ? event.clientX : shapeRect.left + shapeRect.width / 2;
    const py = event && typeof event.clientY === 'number' ? event.clientY : shapeRect.top + shapeRect.height / 2;
    let x = px - rect.left + 14;
    let y = py - rect.top + 16;
    if (x + tooltip.offsetWidth > rect.width - 8) x = px - rect.left - tooltip.offsetWidth - 14;
    if (y + tooltip.offsetHeight > rect.height - 8) y = py - rect.top - tooltip.offsetHeight - 14;
    tooltip.style.left = `${clamp(x, 8, Math.max(8, rect.width - tooltip.offsetWidth - 8))}px`;
    tooltip.style.top = `${clamp(y, 8, Math.max(8, rect.height - tooltip.offsetHeight - 8))}px`;
  }
  function restoreTooltip() {
    hoveredCode = null;
    if (pinnedTooltip) showTooltip(pinnedCode);
    else tooltip.hidden = true;
  }
  function selectPref(code, showPinnedTooltip = false, event) {
    pinnedCode = code;
    pinnedTooltip = showPinnedTooltip;
    $('pref-select').value = code;
    shapes.forEach(shape => shape.setAttribute('aria-pressed', String(shape.dataset.code === code)));
    document.querySelectorAll('tr[data-row]').forEach(row => row.dataset.selected = String(row.dataset.row === code));
    renderDetail(true);
    if (showPinnedTooltip) showTooltip(code, event);
    else tooltip.hidden = true;
  }
  shapes.forEach(shape => {
    const code = shape.dataset.code;
    shape.addEventListener('pointerenter', event => { hoveredCode = code; showTooltip(code, event); });
    shape.addEventListener('pointermove', event => showTooltip(code, event));
    shape.addEventListener('pointerleave', restoreTooltip);
    shape.addEventListener('focus', () => { hoveredCode = code; showTooltip(code); });
    shape.addEventListener('blur', restoreTooltip);
    shape.addEventListener('click', event => selectPref(code, true, event));
    shape.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectPref(code, true);
      }
    });
  });
  $('pref-select').addEventListener('change', event => selectPref(event.target.value));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { pinnedTooltip = false; hoveredCode = null; tooltip.hidden = true; }
  });
  document.addEventListener('pointerdown', event => {
    if (!mapWrap.contains(event.target)) { pinnedTooltip = false; tooltip.hidden = true; }
  });

  function renderYear() {
    const hIndex = data.years_h.indexOf(year);
    const pIndex = data.years_p.indexOf(year);
    $('year-output').textContent = year;
    $('year-range').setAttribute('aria-valuetext', `${year}年`);
    $('map-year').textContent = `${year}年`;
    document.querySelector('.table-year').textContent = `${year}年`;
    $('table-caption').textContent = `${year}年の新設住宅着工戸数・人口・人口1,000人あたり着工戸数。`;
    shapes.forEach(shape => {
      const p = byCode.get(shape.dataset.code);
      shape.setAttribute('fill', mapColor(rate(p, year)));
      shape.setAttribute('aria-label', `${p.name}、${year}年、人口1,000人あたり${fixed(rate(p, year))}戸`);
      shape.querySelector('title').textContent = `${p.name} ${fixed(rate(p, year))}戸`;
      const cells = document.querySelector(`tr[data-row="${p.code}"]`).querySelectorAll('td');
      cells[0].textContent = format(p.h[hIndex]);
      cells[1].textContent = format(p.p[pIndex]);
      cells[2].textContent = fixed(rate(p, year));
    });
    document.querySelectorAll('.map-annotations .map-label text').forEach((node, i) => {
      const p = byCode.get(i === 0 ? '13' : '43');
      node.textContent = `${p.shortName} ${fixed(rate(p, year))}`;
    });
    $('table-national-h').textContent = format(data.national_h[hIndex]);
    $('table-national-p').textContent = format(data.national_p[pIndex]);
    $('table-national-rate').textContent = fixed(nationalRate(year));
    renderDetail();
    if (hoveredCode || pinnedTooltip) showTooltip(hoveredCode || pinnedCode);
  }
  $('year-range').min = firstYear;
  $('year-range').max = lastYear;
  $('year-range').value = lastYear;
  $('year-range').addEventListener('input', event => { year = Number(event.target.value); renderYear(); });
  $('year-range').addEventListener('change', () => renderDetail(true));
  $('legend-domain').textContent = `${fixed(colorMin)}–${fixed(colorMax)} 戸`;
  // Credits also remain verbatim in HTML when scripts are disabled.
  $('credit-estat').textContent = data.sources.credit_estat;
  $('credit-map').textContent = data.sources.credit_map;
  selectPref(pinnedCode);
  renderYear();
  resizeCanvas();
})();
