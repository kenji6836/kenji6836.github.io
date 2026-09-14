/* /viz/ — 1 粒 = 1,000 戸。同じ粒が段を跨いで並び替わる（Canvas 2D + SVG overlay・依存ゼロ）
   構成: 導入(粒の漂い) → 01 山(スクラブ) → 02 指数線 → 03 散布図 → 04 粒を地図へ → 05 塗り分け → 06 ドットプロット → 探索 */
(function () {
  "use strict";
  var D = window.VIZ; if (!D || !D.prefs) return;
  document.documentElement.classList.add("js");
  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var UNIT = 1000;
  var YH = D.years_h, YP = D.years_p, last = YH.length - 1, lastP = YP.length - 1;
  var iH = function (y) { return YH.indexOf(y); }, iP = function (y) { return YP.indexOf(y); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var SVGNS = "http://www.w3.org/2000/svg";
  var fmt = function (n) { return n == null ? "—" : Math.round(n).toLocaleString("ja-JP"); };
  var fmt1 = function (n) { return n == null ? "—" : (Math.round(n * 10) / 10).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  var signed = function (n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt1(Math.abs(n)); };
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  var el = function (tag, attrs, parent, text) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

  /* ---------- derived ---------- */
  var P = D.prefs, byCode = {};
  P.forEach(function (p, i) {
    p.i = i; byCode[p.code] = p;
    p.rate = YP.map(function (y, k) { var h = p.h[iH(y)], pop = p.p[k]; return (h == null || !pop) ? null : h / pop * 1000; });
    p.popChg = (p.p[lastP] / p.p[0] - 1) * 100; p.hChg = (p.h[iH(2024)] / p.h[iH(2000)] - 1) * 100;
    p.h2024 = p.h[iH(2024)]; p.rate2024 = p.rate[lastP];
    p.index = YP.map(function (y) { return p.h[iH(y)] / p.h[iH(2000)] * 100; });
    p.rings = p.path.split("Z").filter(Boolean).map(function (s) { return s.slice(1).trim().split(" ").map(function (pt) { var a = pt.split(","); return [+a[0], +a[1]]; }); });
    p.mainRing = p.rings.reduce(function (best, r) { var b = bbox(r); return (!best || b.a > best.a) ? { r: r, a: b.a, b: b } : best; }, null);
  });
  var natRate = YP.map(function (y, k) { return D.national_h[iH(y)] / D.national_p[k] * 1000; });
  var peakI = D.national_h.indexOf(Math.max.apply(null, D.national_h));
  var rankRate = P.slice().sort(function (a, b) { return b.rate2024 - a.rate2024; }); P.forEach(function (p) { p.rankRate = rankRate.indexOf(p) + 1; });
  var order2024 = P.slice().sort(function (a, b) { return b.h2024 - a.h2024; });
  function bbox(r) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; r.forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }); return { x0: x0, y0: y0, x1: x1, y1: y1, a: (x1 - x0) * (y1 - y0) }; }
  function mulberry32(seed) { return function () { seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; } // 決定的で格子にならない乱数（LCG は連続ペアが直線に並ぶ）
  function pointInRing(x, y, ring) { var inside = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
  var seqRamp = function () { return [1, 2, 3, 4, 5, 6, 7].map(function (i) { return css("--seq-" + i); }); };
  var divRamp = function () { return ["--div-n2", "--div-n1", "--div-0", "--div-p1", "--div-p2"].map(css); };
  function seqColor(v, lo, hi) { var r = seqRamp(); if (v == null) return css("--nodata"); var t = clamp((v - lo) / (hi - lo), 0, .9999); return r[Math.floor(t * r.length)]; }
  function divColor(v, mx) { var r = divRamp(); if (v == null) return css("--nodata"); var t = clamp(v / mx, -1, 1); return r[Math.round((t + 1) / 2 * (r.length - 1))]; }

  /* ---------- particle engine ---------- */
  function Engine(canvas) { this.c = canvas; this.ctx = canvas.getContext("2d"); this.ps = []; this.running = false; this.t0 = 0; this.dur = 900; this.total = 900; this.dpr = Math.min(2, window.devicePixelRatio || 1); this.resize(); }
  Engine.prototype.resize = function () { var r = this.c.getBoundingClientRect(); this.w = r.width; this.h = r.height; this.c.width = Math.round(r.width * this.dpr); this.c.height = Math.round(r.height * this.dpr); this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); };
  Engine.prototype.ensure = function (n) { while (this.ps.length < n) this.ps.push({ x: Math.random() * this.w, y: -20 - Math.random() * this.h * .5, a: 0, r: 2.2, c: null, sx: 0, sy: 0, sr: 2.2, tx: 0, ty: 0, tr: 2.2, ta: 0, sa: 0, d: 0 }); };
  /* targets[i] = {x,y,r?,a?,c?(color),ring?}; 足りない粒は上から降り、余る粒は消える */
  Engine.prototype.moveTo = function (targets, opts) {
    opts = opts || {}; this.ensure(targets.length); var dur = RM ? 0 : (opts.dur != null ? opts.dur : 900), stag = RM ? 0 : (opts.stagger != null ? opts.stagger : 400);
    for (var i = 0; i < this.ps.length; i++) {
      var p = this.ps[i], t = targets[i]; p.sx = p.x; p.sy = p.y; p.sa = p.a; p.sr = p.r;
      if (t) { p.tx = t.x; p.ty = t.y; p.ta = t.a != null ? t.a : 1; p.tr = t.r || 2.2; p.c = t.c || null; p.ring = !!t.ring; if (p.a === 0 && opts.spawn !== "stay") { p.sx = t.x + (Math.random() - .5) * 30; p.sy = t.y - 60 - Math.random() * 120; } }
      else { p.tx = p.x; p.ty = p.y + 40; p.ta = 0; p.tr = p.r; }
      p.d = stag ? Math.random() * stag : 0;
    }
    this.dur = dur; this.total = dur + stag; this.t0 = performance.now(); this.start();
  };
  Engine.prototype.start = function () { if (!this.running) { this.running = true; var self = this; requestAnimationFrame(function f(now) { if (self.step(now)) requestAnimationFrame(f); else self.running = false; }); } };
  Engine.prototype.step = function (now) {
    var ctx = this.ctx, done = true, t = now - this.t0; ctx.clearRect(0, 0, this.w, this.h); var base = css("--dot"), paper = css("--paper");
    for (var i = 0; i < this.ps.length; i++) {
      var p = this.ps[i], u = this.dur ? clamp((t - p.d) / this.dur, 0, 1) : 1; if (u < 1) done = false; var e = ease(u);
      p.x = lerp(p.sx, p.tx, e); p.y = lerp(p.sy, p.ty, e); p.a = lerp(p.sa, p.ta, e); p.r = lerp(p.sr, p.tr, e);
      if (p.a <= .01) continue; ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fillStyle = p.c || base; ctx.fill();
      if (p.ring && p.r >= 3.5) { ctx.lineWidth = 1.5; ctx.strokeStyle = paper; ctx.stroke(); }
    }
    ctx.globalAlpha = 1; if (this.onFrame) this.onFrame(now);
    return !done || !!this.loop;
  };
  Engine.prototype.repaint = function () { this.t0 = performance.now() - this.total - 1; this.start(); };

  /* ---------- hero: 741 粒の漂い ---------- */
  var heroC = $("#hero-canvas");
  if (heroC) {
    var hero = new Engine(heroC), heroN = Math.round(D.national_h[last] / UNIT);
    var heroLayout = function () { // 見出し・本文・注釈の矩形（外周 12px）には粒を置かない（可読性）
      var cr = heroC.getBoundingClientRect(), zones = $$(".hero-copy, .hero .eyebrow, .hero-bottom, .hero-ratio, .masthead-row").map(function (e) { var r = e.getBoundingClientRect(); return { x0: r.left - cr.left - 12, y0: r.top - cr.top - 12, x1: r.right - cr.left + 12, y1: r.bottom - cr.top + 12 }; });
      var mob = window.innerWidth <= 700, out = [], tries = 0;
      while (out.length < heroN && tries < heroN * 40) { tries++; var x = Math.random() * hero.w, y = Math.random() * hero.h, ok = true; for (var z = 0; z < zones.length; z++) { var q = zones[z]; if (x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1) { ok = false; break; } } if (ok) out.push({ x: x, y: y, a: mob ? .26 : .34, r: mob ? 1.8 : 2.2 }); }
      return out; };
    hero.moveTo(heroLayout(), { dur: 1500, stagger: 900 });
    if (!RM) { hero.loop = true; var drift = hero.ps.map(function () { return { vx: (Math.random() - .5) * .1, vy: .05 + Math.random() * .08 }; }); hero.onFrame = function () { for (var i = 0; i < hero.ps.length; i++) { var p = hero.ps[i]; if (p.a < .3) continue; p.x += drift[i].vx; p.y += drift[i].vy; p.tx = p.sx = p.x; p.ty = p.sy = p.y; if (p.y > hero.h + 4) { p.y = p.ty = p.sy = -4; } } }; hero.start(); }
    window.addEventListener("resize", function () { hero.resize(); hero.moveTo(heroLayout(), { dur: 0 }); });
    new IntersectionObserver(function (es) { es.forEach(function (e) { hero.loop = e.isIntersecting && !RM; if (hero.loop) hero.start(); }); }).observe(heroC);
  }

  /* ---------- stage ---------- */
  var stage = $("#stage"); if (!stage) return;
  var eng = new Engine($("#stage-canvas")), svg = $("#stage-svg"), legend = $("#stage-legend");
  var G = {}, proj = { k: "" };
  function area() { G.mob = window.innerWidth <= 700; G.x0 = G.mob ? 34 : 46; G.x1 = eng.w - (G.mob ? 40 : 54); G.y0 = 30; G.y1 = eng.h - 40; G.w = G.x1 - G.x0; G.h = G.y1 - G.y0; }
  function fitMap() { var vb = D.map.viewBox.split(" ").map(Number), vw = vb[2], vh = vb[3]; var s = Math.min((eng.w - 20) / vw, (eng.h - 16) / vh); var ox = (eng.w - vw * s) / 2, oy = (eng.h - vh * s) / 2; proj.s = s; proj.ox = ox; proj.oy = oy; proj.k = Math.round(s * 1000) + ":" + Math.round(ox) + ":" + Math.round(oy); proj.x = function (x) { return ox + x * s; }; proj.y = function (y) { return oy + y * s; }; }
  var L = {}; ["timeline", "index", "scatter", "map", "swarm", "anno"].forEach(function (n) { L[n] = el("g", { "class": "layer", id: "l-" + n }, svg); });
  var mapG = el("g", {}, L.map), prefEls = {}; P.forEach(function (p) { prefEls[p.code] = el("path", { "class": "pref", d: p.path }, mapG); });
  var COPY = {
    timeline: ["01", "75 年の山", "1951 → " + YH[last], "1 粒 ＝ 1,000 戸。スクロールで年が進む。"],
    index: ["02", "家を建てる数の変化", "2000 → 2024", "2000 年の着工戸数を 100 とした推移。点は 2024 年。"],
    scatter: ["03", "人口と着工、二つの変化", "2000 → 2024", "横軸は人口、縦軸は着工戸数の増減率。破線は増減なし。"],
    dots: ["04", "同じ粒を、地図の上に置く", "2024", "1 粒 ＝ 1,000 戸。粒は県の形の中に散らしている。"],
    rate: ["05", "人口でそろえた日本地図", "2024", "色が濃いほど、人口 1,000 人あたりの着工戸数が多い。"],
    swarm: ["06", "同じ物差しで、並べる", "2024", "人口 1,000 人あたりの着工戸数。上下の位置に数値の意味はない。"]
  };

  // --- 01 timeline
  var tl = {};
  function drawTimeline() {
    L.timeline.innerHTML = ""; var vmax = 2000000; tl.x = function (i) { return G.x0 + G.w * i / last; }; tl.y = function (v) { return G.y1 - 26 - (G.h - 60) * v / vmax; };
    [500000, 1000000, 1500000, 2000000].forEach(function (v) { el("line", { "class": "stage-rule", x1: tl.x(0), x2: tl.x(last), y1: tl.y(v), y2: tl.y(v) }, L.timeline); el("text", { "class": "stage-text", x: tl.x(0), y: tl.y(v) - 4 }, L.timeline, (v / 10000) + " 万戸"); });
    el("line", { "class": "stage-rule zero", x1: tl.x(0), x2: tl.x(last), y1: tl.y(0), y2: tl.y(0), style: "stroke-dasharray:none" }, L.timeline);
    (G.mob ? [1951, 1973, 2000, 2025] : [1951, 1960, 1973, 1980, 1990, 2000, 2009, 2025]).forEach(function (y) { el("text", { "class": "stage-text", x: tl.x(iH(y)), y: tl.y(0) + 16, "text-anchor": "middle" }, L.timeline, y); });
    var d = D.national_h.map(function (v, i) { return (i ? "L" : "M") + tl.x(i).toFixed(1) + "," + tl.y(v).toFixed(1); }).join(" ");
    el("path", { "class": "stage-area", d: d + " L" + tl.x(last).toFixed(1) + "," + tl.y(0).toFixed(1) + " L" + tl.x(0).toFixed(1) + "," + tl.y(0).toFixed(1) + "Z" }, L.timeline);
    el("path", { "class": "stage-line national", d: d }, L.timeline);
    tl.cur = el("line", { "class": "cursor-line", x1: 0, x2: 0, y1: tl.y(0), y2: tl.y(0) }, L.timeline);
    tl.yr = el("text", { "class": "cursor-year", x: G.x1, y: G.y0 + 26, "text-anchor": "end" }, L.timeline); tl.val = el("text", { "class": "cursor-val", x: G.x1, y: G.y0 + 46, "text-anchor": "end" }, L.timeline);
    tl.anno = el("g", {}, L.timeline);
  }
  function annotate(g, x, y, t1, t2, strong, below) { var right = x < G.x0 + G.w * .5, dx = right ? 14 : -14, dy = below ? 1 : -1; el("line", { "class": "leader", x1: x, y1: y, x2: x + dx * .6, y2: y + dy * 18 }, g); el("text", { "class": "stage-text" + (strong ? " strong" : " ink"), x: x + dx, y: y + dy * 22 + (below ? 10 : 0), "text-anchor": right ? "start" : "end" }, g, t1); el("text", { "class": "stage-text", x: x + dx, y: y + dy * 8 + (below ? 28 : 0), "text-anchor": right ? "start" : "end" }, g, t2); }
  function timelineAt(i, snap) {
    var v = D.national_h[i], n = Math.round(v / UNIT), x = tl.x(i), yTop = tl.y(v), yBase = tl.y(0), w = G.mob ? 22 : 34;
    tl.cur.setAttribute("x1", x); tl.cur.setAttribute("x2", x); tl.cur.setAttribute("y2", yTop);
    tl.yr.textContent = YH[i]; tl.val.textContent = fmt(v) + " 戸 ＝ " + fmt(n) + " 粒";
    var h = Math.max(4, yBase - yTop), s = Math.sqrt(w * h / Math.max(1, n)), cols = Math.max(1, Math.round(w / s)); s = w / cols; var out = [];
    for (var k = 0; k < n; k++) out.push({ x: x - w / 2 + s * (k % cols + .5), y: yBase - s * (Math.floor(k / cols) + .5), r: clamp(s * .36, 1.1, 2.6) });
    eng.moveTo(out, { dur: snap ? 160 : 500, stagger: snap ? 50 : 240, spawn: "stay" });
    tl.anno.innerHTML = "";
    if (i >= peakI + 5 || i === peakI) annotate(tl.anno, tl.x(peakI), tl.y(D.national_h[peakI]), "1973 年 " + fmt(D.national_h[peakI]) + " 戸", "ピーク", true);
    if (i >= iH(2009) + 5 || i === iH(2009)) annotate(tl.anno, tl.x(iH(2009)), tl.y(D.national_h[iH(2009)]), "2009 年 " + fmt(D.national_h[iH(2009)]) + " 戸", "45 年ぶりの水準", false, true);
    if (i >= last) annotate(tl.anno, tl.x(last), tl.y(D.national_h[last]), YH[last] + " 年 " + fmt(D.national_h[last]) + " 戸", "1973 年の " + Math.round(D.national_h[last] / D.national_h[peakI] * 100) + "%", true);
  }

  // --- 02 index lines
  var ix = {};
  function drawIndex() {
    L.index.innerHTML = ""; var mx = Math.ceil(Math.max.apply(null, P.map(function (p) { return Math.max.apply(null, p.index); })) / 50) * 50;
    ix.x = function (k) { return lerp(G.x0, G.x1 - (G.mob ? 30 : 40), k / lastP); }; ix.y = function (v) { return lerp(G.y1, G.y0 + 8, v / mx); };
    el("text", { "class": "stage-text", x: G.x0, y: G.y0 - 8 }, L.index, "着工戸数（2000 年 ＝ 100）");
    for (var t = 0; t <= mx; t += 50) { el("line", { "class": "stage-rule" + (t === 100 ? " zero" : ""), x1: G.x0, x2: ix.x(lastP) + 4, y1: ix.y(t), y2: ix.y(t) }, L.index); el("text", { "class": "stage-text", x: G.x0 - 8, y: ix.y(t) + 4, "text-anchor": "end" }, L.index, t); }
    P.slice().sort(function (a, b) { return (a.code === "43") - (b.code === "43"); }).forEach(function (p) { el("path", { "class": "stage-line" + (p.code === "43" ? " accent" : ""), d: p.index.map(function (v, k) { return (k ? "L" : "M") + ix.x(k).toFixed(1) + "," + ix.y(v).toFixed(1); }).join(" ") }, L.index); });
    el("text", { "class": "stage-text", x: G.x0, y: G.y1 + 18 }, L.index, "2000"); el("text", { "class": "stage-text", x: ix.x(lastP), y: G.y1 + 18, "text-anchor": "middle" }, L.index, "2024");
    [["43", "blue"], ["39", "ink"]].forEach(function (c) { var p = byCode[c[0]]; el("text", { "class": "stage-text " + c[1], x: ix.x(lastP) + 9, y: ix.y(p.index[lastP]) + 4 }, L.index, p.short + " " + signed(p.hChg) + "%"); });
  }
  function indexLayout() { return P.map(function (p) { return { x: ix.x(lastP), y: ix.y(p.index[lastP]), r: 3.5, c: p.code === "43" ? css("--blue") : css("--gray-mark"), ring: true }; }); }

  // --- 03 scatter
  var sc = {};
  function drawScatter() {
    L.scatter.innerHTML = ""; var pmin = Math.floor(Math.min.apply(null, P.map(function (p) { return p.popChg; })) / 10) * 10, pmax = Math.ceil(Math.max.apply(null, P.map(function (p) { return p.popChg; })) / 10) * 10;
    var hmin = Math.floor(Math.min.apply(null, P.map(function (p) { return p.hChg; })) / 20) * 20, hmax = Math.ceil(Math.max.apply(null, P.map(function (p) { return p.hChg; })) / 20) * 20;
    sc.x = function (v) { return lerp(G.x0, G.x1, (v - pmin) / (pmax - pmin)); }; sc.y = function (v) { return lerp(G.y1, G.y0 + 8, (v - hmin) / (hmax - hmin)); };
    el("text", { "class": "stage-text", x: G.x0, y: G.y0 - 8 }, L.scatter, "着工戸数の増減（%）2000→2024");
    for (var t = hmin; t <= hmax; t += 20) { el("line", { "class": "stage-rule" + (t === 0 ? " zero" : ""), x1: G.x0, x2: G.x1, y1: sc.y(t), y2: sc.y(t) }, L.scatter); el("text", { "class": "stage-text", x: G.x0 - 8, y: sc.y(t) + 4, "text-anchor": "end" }, L.scatter, t); }
    for (var u = Math.ceil(pmin / 10) * 10; u <= pmax; u += 10) { el("line", { "class": "stage-rule" + (u === 0 ? " zero" : ""), x1: sc.x(u), x2: sc.x(u), y1: G.y0 + 8, y2: G.y1 }, L.scatter); if (u % 20 === 0) el("text", { "class": "stage-text", x: sc.x(u), y: G.y1 + 17, "text-anchor": "middle" }, L.scatter, u); }
    el("text", { "class": "stage-text", x: G.x1, y: G.y1 + 32, "text-anchor": "end" }, L.scatter, "人口の増減（%）2000→2024");
    [["43", 12, -12], ["13", -12, -14], ["05", 12, 20]].forEach(function (c) { var p = byCode[c[0]], x = sc.x(p.popChg), y = sc.y(p.hChg); el("line", { "class": "leader", x1: x, y1: y, x2: x + c[1] * .7, y2: y + c[2] * .7 }, L.scatter); el("text", { "class": "stage-text blue", x: x + c[1], y: y + c[2] + 4, "text-anchor": c[1] < 0 ? "end" : "start" }, L.scatter, p.short + " " + signed(p.hChg) + "%"); });
  }
  function scatterLayout() { return P.map(function (p) { var acc = ["13", "43", "05"].indexOf(p.code) >= 0; return { x: sc.x(p.popChg), y: sc.y(p.hChg), r: acc ? 5.5 : 3.8, c: acc ? css("--blue") : css("--gray-mark"), ring: true }; }); }

  // --- 04/05 map
  function dotsLayout() { // 粒 i<47 は自県の 1 粒目、残りは多い順に埋める（同じ粒が県へ帰る）
    var per = {}; P.forEach(function (p) { per[p.code] = inPolygon(p, Math.round(p.h2024 / UNIT)); });
    var out = P.map(function (p) { return per[p.code][0] || { x: proj.x(p.c[0]), y: proj.y(p.c[1]), r: 2 }; });
    order2024.forEach(function (p) { for (var k = 1; k < per[p.code].length; k++) out.push(per[p.code][k]); });
    return out;
  }
  function inPolygon(p, n) { var cache = p._cache || (p._cache = {}), key = n + ":" + proj.k; if (cache[key]) return cache[key]; var b = p.mainRing.b, out = [], tries = 0, r = mulberry32(+p.code * 7919);
    while (out.length < n && tries < n * 60) { tries++; var x = b.x0 + r() * (b.x1 - b.x0), y = b.y0 + r() * (b.y1 - b.y0); if (pointInRing(x, y, p.mainRing.r)) out.push({ x: proj.x(x), y: proj.y(y), r: 2 }); }
    while (out.length < n) out.push({ x: proj.x(p.c[0]) + (r() - .5) * 8, y: proj.y(p.c[1]) + (r() - .5) * 8, r: 2 });
    return (cache[key] = out); }
  function drawMap() { mapG.setAttribute("transform", "translate(" + proj.ox + "," + proj.oy + ") scale(" + proj.s + ")"); }
  function fillMap(mode) { P.forEach(function (p) { prefEls[p.code].style.fill = mode === "rate" ? seqColor(p.rate2024, 3, 9) : "transparent"; }); // 粒の上に地図が乗るので、粒の場面は塗りを透明にする
    if (mode === "rate") { legend.innerHTML = '<div>2024 年・人口 1,000 人あたり（戸）</div><div class="ramp">' + seqRamp().map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + '</div><div class="ends"><span>3</span><span>9</span></div>'; legend.classList.add("on"); } else legend.classList.remove("on"); }
  function mapAnno() { L.anno.innerHTML = ""; var k = G.mob ? .7 : 1; [["13", 1, 1], ["43", -1, 1], ["39", 1, 1], ["05", -1, -1]].forEach(function (c) { var p = byCode[c[0]], x = proj.x(p.c[0]), y = proj.y(p.c[1]), dx = c[1] * 30 * k, dy = c[2] * 22 * k; el("line", { "class": "leader", x1: x, y1: y, x2: x + dx, y2: y + dy }, L.anno); el("text", { "class": "stage-text blue", x: x + dx + (c[1] > 0 ? 4 : -4), y: y + dy + (c[2] > 0 ? 12 : -4), "text-anchor": c[1] > 0 ? "start" : "end" }, L.anno, p.short + " " + fmt1(p.rate2024)); }); } // 海側へ出す（東京→右下・熊本→左下・高知→右下・秋田→左上）

  // --- 06 swarm
  var sw = {};
  function drawSwarm() {
    L.swarm.innerHTML = ""; var rmin = Math.floor(Math.min.apply(null, P.map(function (p) { return p.rate2024; }))), rmax = Math.ceil(Math.max.apply(null, P.map(function (p) { return p.rate2024; })));
    sw.x = function (v) { return lerp(G.x0, G.x1, (v - rmin) / (rmax - rmin)); };
    el("text", { "class": "stage-text", x: G.x0, y: G.y0 - 8 }, L.swarm, "人口 1,000 人あたり（戸）・2024 年");
    for (var t = rmin; t <= rmax; t++) { el("line", { "class": "stage-rule", x1: sw.x(t), x2: sw.x(t), y1: G.y0 + 8, y2: G.y1 }, L.swarm); el("text", { "class": "stage-text", x: sw.x(t), y: G.y1 + 17, "text-anchor": "middle" }, L.swarm, t); }
    var dia = G.mob ? 9 : 12, gap = dia + 3, cy = G.y0 + G.h * .5, placed = []; sw.pos = {};
    P.slice().sort(function (a, b) { return a.rate2024 - b.rate2024; }).forEach(function (p) { var x = sw.x(p.rate2024), y = cy; for (var lv = 0; lv < 100; lv++) { y = cy + Math.ceil(lv / 2) * gap * (lv % 2 ? 1 : -1); if (placed.every(function (o) { return Math.hypot(o.x - x, o.y - y) >= gap; })) break; } placed.push({ x: x, y: y }); sw.pos[p.code] = { x: x, y: y, r: dia / 2 }; });
    [["13", -1, 1], ["43", 1, -1], ["39", 1, -1], ["05", -1, -1]].forEach(function (c) { var p = byCode[c[0]], q = sw.pos[p.code], dy = c[1] * (G.mob ? 26 : 34), dx = c[2] * (G.mob ? 14 : 18); el("line", { "class": "leader", x1: q.x, y1: q.y, x2: q.x + dx, y2: q.y + dy }, L.swarm); el("text", { "class": "stage-text " + (p.code === "39" || p.code === "05" ? "ink" : "blue"), x: q.x + dx + (c[2] > 0 ? 3 : -3), y: q.y + dy + (c[1] > 0 ? 12 : -5), "text-anchor": c[2] > 0 ? "start" : "end" }, L.swarm, p.short + " " + fmt1(p.rate2024)); });
  }
  function swarmLayout() { return P.map(function (p) { var q = sw.pos[p.code], acc = p.code === "13" || p.code === "43"; return { x: q.x, y: q.y, r: q.r, c: acc ? css("--blue") : css("--gray-mark"), ring: true }; }); }

  /* ---------- scenes ---------- */
  var scene = null, scrubI = 0, steps = $$(".story-step"), progress = $$(".story-progress a");
  function setScene(name, force) {
    if (scene === name && !force) return; scene = name;
    ["timeline", "index", "scatter", "map", "swarm", "anno"].forEach(function (k) { L[k].classList.remove("on"); });
    var c = COPY[name]; $("#scene-number").textContent = c[0]; $("#scene-title").textContent = c[1]; $("#scene-period").textContent = c[2]; $("#scene-desc").textContent = c[3];
    var idx = ["timeline", "index", "scatter", "dots", "rate", "swarm"].indexOf(name);
    progress.forEach(function (a, i) { if (i === idx) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
    steps.forEach(function (s) { s.classList.toggle("is-active", s.getAttribute("data-scene") === name); });
    if (name !== "rate" && name !== "dots") legend.classList.remove("on");
    if (name === "timeline") { L.timeline.classList.add("on"); timelineAt(scrubI, false); }
    if (name === "index") { L.index.classList.add("on"); eng.moveTo(indexLayout(), { dur: 800, stagger: 300 }); }
    if (name === "scatter") { L.scatter.classList.add("on"); eng.moveTo(scatterLayout(), { dur: 800, stagger: 300 }); }
    if (name === "dots") { L.map.classList.add("on"); fillMap("none"); eng.moveTo(dotsLayout(), { dur: 1100, stagger: 700 }); }
    if (name === "rate") { L.map.classList.add("on"); L.anno.classList.add("on"); fillMap("rate"); mapAnno(); eng.moveTo([], { dur: 500, stagger: 300 }); }
    if (name === "swarm") { L.swarm.classList.add("on"); eng.moveTo(swarmLayout(), { dur: 900, stagger: 400 }); }
  }
  function layoutAll() { eng.resize(); area(); fitMap(); drawTimeline(); drawIndex(); drawScatter(); drawMap(); drawSwarm(); P.forEach(function (p) { p._cache = null; }); if (scene) setScene(scene, true); }
  layoutAll();
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(layoutAll, 120); });
  var tallStep = $(".story-step.tall");
  function onScroll() {
    var th = window.innerHeight * (G.mob ? .76 : .6), name = "timeline";
    steps.forEach(function (s) { if (s.querySelector("h3").getBoundingClientRect().top <= th) name = s.getAttribute("data-scene"); });
    if (tallStep) { var r = tallStep.getBoundingClientRect(), vh = window.innerHeight; var p = clamp((vh * .6 - r.top) / (r.height - vh * .45), 0, 1); var i = Math.round(p * last); if (i !== scrubI) { scrubI = i; if (scene === "timeline") timelineAt(i, true); } }
    setScene(name);
  }
  var ticking = false; window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { onScroll(); ticking = false; }); } }, { passive: true });
  if (RM) scrubI = last; onScroll(); if (!scene) setScene("timeline");
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layoutAll(); });

  /* ---------- explorer ---------- */
  var ex = $("#explore"); if (!ex) return;
  var shapes = $$(".pref-shape"), shapeBy = {}; shapes.forEach(function (s) { shapeBy[s.getAttribute("data-code")] = s; });
  var metric = "rate", year = 2024, pinned = "43", hovered = null, pinnedTip = false;
  var tip = $("#map-tooltip"), mapWrap = $("#map-wrap"), yrIn = $("#year-range"), yrOut = $("#year-output"), sel = $("#pref-select");
  var METRIC = { rate: { title: "人口 1,000 人あたりの新設住宅着工戸数", unit: "戸", lo: 3, hi: 12, ends: ["少ない", "多い"], years: YP }, count: { title: "新設住宅着工戸数", unit: "戸", ends: ["少ない", "多い"], years: YH }, pop: { title: "人口の増減（2000 年比）", unit: "%", ends: ["減少", "増加"], years: YP } };
  function val(p, y) { if (metric === "count") return p.h[iH(y)]; if (metric === "rate") return p.rate[iP(y)]; return (p.p[iP(y)] / p.p[0] - 1) * 100; }
  function natVal(y) { if (metric === "count") return D.national_h[iH(y)]; if (metric === "rate") return natRate[iP(y)]; return (D.national_p[iP(y)] / D.national_p[0] - 1) * 100; }
  function color(p, y) { var v = val(p, y); if (metric === "count") return seqColor(v == null ? null : Math.log10(Math.max(1000, v)), 3.3, 5.35); if (metric === "rate") return seqColor(v, 3, 12); return divColor(v, 25); }
  function label(v) { if (v == null) return "データなし"; if (metric === "count") return fmt(v); if (metric === "rate") return fmt1(v); return signed(v); }
  function paint() {
    var m = METRIC[metric]; shapes.forEach(function (s) { var p = byCode[s.getAttribute("data-code")]; s.style.fill = color(p, year); s.setAttribute("aria-label", p.name + "、" + year + " 年、" + label(val(p, year)) + " " + m.unit); });
    var ramp = metric === "pop" ? divRamp() : seqRamp(); $("#legend-ramp").innerHTML = ramp.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("");
    $("#legend-lo").textContent = m.ends[0]; $("#legend-hi").textContent = m.ends[1]; $("#legend-domain").textContent = metric === "count" ? "2 千〜22 万戸（対数）" : metric === "rate" ? "3.0–12.0 戸" : "−25〜+25 %";
    $("#map-title").textContent = m.title; $("#map-year").textContent = (metric === "pop" ? "2000 → " : "") + year + " 年"; yrOut.textContent = year; yrIn.setAttribute("aria-valuetext", year + "年");
    $$(".map-label text").forEach(function (t) { var p = byCode[t.getAttribute("data-code")]; t.textContent = p.short + " " + label(val(p, year)); });
    renderDetail(false); if (hovered || pinnedTip) showTip(hovered || pinned);
  }
  function setMetric(m) { metric = m; $$("#metric button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === m ? "true" : "false"); }); var ys = METRIC[m].years; yrIn.min = ys[0]; yrIn.max = ys[ys.length - 1]; year = clamp(year, ys[0], ys[ys.length - 1]); yrIn.value = year; $("#range-start").textContent = ys[0]; $("#range-end").textContent = ys[ys.length - 1]; paint(); }
  function renderSpark(p) {
    var svgE = $("#detail-spark"), ys = METRIC[metric].years, series = ys.map(function (y) { return val(p, y); }), nat = metric === "count" ? null : ys.map(natVal);
    var vals = series.filter(function (v) { return v != null; }).concat(nat || []); var mx = Math.max.apply(null, vals), mn = Math.min(0, Math.min.apply(null, vals)); if (metric === "rate") mx = Math.ceil(mx / 2) * 2;
    var x = function (i) { return 28 + i / (ys.length - 1) * 287; }, y = function (v) { return 110 - (v - mn) / (mx - mn) * 91; };
    var path = function (s) { var out = []; s.forEach(function (v, i) { if (v != null) out.push((out.length ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)); }); return out.join(" "); };
    svgE.innerHTML = ""; [mn, mx].forEach(function (v) { el("line", { x1: 28, x2: 315, y1: y(v), y2: y(v), stroke: css("--line") }, svgE); el("text", { x: 20, y: y(v) + 4, "text-anchor": "end", fill: css("--muted"), "font-size": 11 }, svgE, metric === "count" ? (Math.round(v / 10000) + "万") : fmt1(v)); });
    if (nat) el("path", { d: path(nat), fill: "none", stroke: css("--muted"), "stroke-width": 1.5, "stroke-dasharray": "4 3" }, svgE);
    el("path", { d: path(series), fill: "none", stroke: css("--blue"), "stroke-width": 2 }, svgE);
    var k = ys.indexOf(year); if (series[k] != null) { el("line", { x1: x(k), x2: x(k), y1: 10, y2: 112, stroke: css("--line-2"), "stroke-dasharray": "2 3" }, svgE); el("circle", { cx: x(k), cy: y(series[k]), r: 4, fill: css("--blue"), stroke: css("--paper"), "stroke-width": 1.5 }, svgE); }
    el("text", { x: 28, y: 133, fill: css("--muted"), "font-size": 11 }, svgE, ys[0]); el("text", { x: 315, y: 133, fill: css("--muted"), "font-size": 11, "text-anchor": "end" }, svgE, ys[ys.length - 1]);
    $("#spark-title").innerHTML = ""; $("#spark-title").appendChild(document.createTextNode(METRIC[metric].title + "の推移 ")); var sp = document.createElement("span"); sp.textContent = ys[0] + "–" + ys[ys.length - 1]; $("#spark-title").appendChild(sp);
    $("#spark-pref").textContent = p.short; $(".spark-legend > span:last-child").hidden = !nat;
  }
  function renderDetail(announce) {
    var p = byCode[pinned], hy = p.h[iH(year)], py = iP(year) >= 0 ? p.p[iP(year)] : null;
    $("#detail-name").textContent = p.name; $("#detail-state").textContent = "選択中 / " + year; $("#detail-metric-label").textContent = METRIC[metric].title; $("#detail-rate").textContent = label(val(p, year)); $("#detail-unit").textContent = METRIC[metric].unit;
    $("#national-comparison").textContent = "全国 " + label(natVal(year)) + " " + METRIC[metric].unit + (metric === "rate" ? "・2024 年は全国 " + p.rankRate + " 位" : "");
    setDD("#detail-h", fmt(hy), " 戸"); setDD("#detail-p", py == null ? "—" : fmt(py), " 人"); setDD("#detail-change", hy == null ? "—" : signed((hy / p.h[iH(2000)] - 1) * 100), " %");
    renderSpark(p); $$("tr[data-row]").forEach(function (r) { r.setAttribute("data-selected", r.getAttribute("data-row") === pinned ? "true" : "false"); });
    if (announce) $("#detail-live").textContent = p.name + "、" + year + " 年。" + METRIC[metric].title + " " + label(val(p, year)) + " " + METRIC[metric].unit + "。";
  }
  function setDD(id, v, u) { var d = $(id); d.innerHTML = ""; d.appendChild(document.createTextNode(v)); var s = document.createElement("span"); s.textContent = u; d.appendChild(s); }
  function showTip(code, ev) {
    var p = byCode[code], hy = p.h[iH(year)], py = iP(year) >= 0 ? p.p[iP(year)] : null;
    tip.innerHTML = ""; var st = document.createElement("strong"); st.textContent = p.name + " "; var sub = document.createElement("span"); sub.className = "tooltip-sub"; sub.textContent = year + " 年"; st.appendChild(sub); tip.appendChild(st);
    var v = document.createElement("span"); v.className = "tooltip-value"; v.textContent = label(val(p, year)); tip.appendChild(v); tip.appendChild(document.createTextNode(METRIC[metric].unit + (metric === "rate" ? " / 1,000 人" : "")));
    var d = document.createElement("div"); d.className = "tooltip-sub"; d.textContent = "着工 " + fmt(hy) + " 戸" + (py != null ? " · 人口 " + fmt(py) + " 人" : ""); tip.appendChild(d);
    var pin = document.createElement("span"); pin.className = "tooltip-pin"; pin.textContent = pinnedTip && code === pinned ? "固定中 · Esc で吹き出しを閉じる" : "クリック・Enter でこの地域を固定"; tip.appendChild(pin);
    tip.hidden = false; var rect = mapWrap.getBoundingClientRect(), sr = shapeBy[code].getBoundingClientRect();
    var px = ev && typeof ev.clientX === "number" ? ev.clientX : sr.left + sr.width / 2, py2 = ev && typeof ev.clientY === "number" ? ev.clientY : sr.top + sr.height / 2;
    var x = px - rect.left + 14, y = py2 - rect.top + 16; if (x + tip.offsetWidth > rect.width - 8) x = px - rect.left - tip.offsetWidth - 14; if (y + tip.offsetHeight > rect.height - 8) y = py2 - rect.top - tip.offsetHeight - 14;
    tip.style.left = clamp(x, 8, Math.max(8, rect.width - tip.offsetWidth - 8)) + "px"; tip.style.top = clamp(y, 8, Math.max(8, rect.height - tip.offsetHeight - 8)) + "px";
  }
  function restoreTip() { hovered = null; if (pinnedTip) showTip(pinned); else tip.hidden = true; }
  function select(code, withTip, ev) { pinned = code; pinnedTip = !!withTip; sel.value = code; shapes.forEach(function (s) { s.setAttribute("aria-pressed", String(s.getAttribute("data-code") === code)); }); renderDetail(true); if (withTip) showTip(code, ev); else tip.hidden = true; }
  shapes.forEach(function (s) { var code = s.getAttribute("data-code");
    s.addEventListener("pointerenter", function (ev) { hovered = code; showTip(code, ev); }); s.addEventListener("pointermove", function (ev) { showTip(code, ev); }); s.addEventListener("pointerleave", restoreTip);
    s.addEventListener("focus", function () { hovered = code; showTip(code); }); s.addEventListener("blur", restoreTip);
    s.addEventListener("click", function (ev) { select(code, true, ev); }); s.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(code, true); } });
  });
  sel.addEventListener("change", function (ev) { select(ev.target.value); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { pinnedTip = false; hovered = null; tip.hidden = true; } });
  document.addEventListener("pointerdown", function (ev) { if (!mapWrap.contains(ev.target)) { pinnedTip = false; tip.hidden = true; } });
  yrIn.addEventListener("input", function (ev) { year = +ev.target.value; paint(); }); yrIn.addEventListener("change", function () { renderDetail(true); });
  $$("#metric button").forEach(function (b) { b.addEventListener("click", function () { setMetric(b.getAttribute("data-m")); }); });
  select(pinned); setMetric("rate");
})();
