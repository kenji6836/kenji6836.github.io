/* /viz/ — 1 粒 = 1,000 戸。同じ粒が段を跨いで並び替わる（Canvas 2D + SVG overlay・依存ゼロ） */
(function () {
  "use strict";
  var D = window.VIZ; if (!D) return;
  var RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var UNIT = 1000; // 1 粒 = 1,000 戸
  var Y0 = D.years_h[0], YH = D.years_h, YP = D.years_p;
  var iH = function (y) { return YH.indexOf(y); }, iP = function (y) { return YP.indexOf(y); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var SVGNS = "http://www.w3.org/2000/svg";
  var fmt = function (n) { return n == null ? "—" : Math.round(n).toLocaleString("ja-JP"); };
  var fmt1 = function (n) { return n == null ? "—" : (Math.round(n * 10) / 10).toLocaleString("ja-JP", { minimumFractionDigits: 1 }); };
  var css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  var el = function (tag, attrs, parent) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* ---------- derived metrics ---------- */
  var P = D.prefs;
  var last = YH.length - 1, lastP = YP.length - 1;
  P.forEach(function (p) {
    p.rate = YP.map(function (y, i) { var h = p.h[iH(y)], pop = p.p[i]; return (h == null || !pop) ? null : h / pop * 1000; });
    p.popChg = (p.p[lastP] / p.p[0] - 1) * 100;              // 2000→2024 %
    p.hChg = (p.h[iH(YP[lastP])] / p.h[iH(YP[0])] - 1) * 100; // 2000→2024 %
    p.h2024 = p.h[iH(2024)];
    p.rate2024 = p.rate[lastP];
  });
  var natRate = YP.map(function (y, i) { return D.national_h[iH(y)] / D.national_p[i] * 1000; });
  var peakI = D.national_h.indexOf(Math.max.apply(null, D.national_h));
  var rankRate = P.slice().sort(function (a, b) { return b.rate2024 - a.rate2024; });
  P.forEach(function (p) { p.rankRate = rankRate.indexOf(p) + 1; });

  /* ---------- palette helpers ---------- */
  var seqRamp = function () { return [1, 2, 3, 4, 5, 6, 7].map(function (i) { return css("--seq-" + i); }); };
  var divRamp = function () { return ["--div-n2", "--div-n1", "--div-0", "--div-p1", "--div-p2"].map(css); };
  function seqColor(v, lo, hi) { var r = seqRamp(); if (v == null) return css("--nodata"); var t = Math.max(0, Math.min(.9999, (v - lo) / (hi - lo))); return r[Math.floor(t * r.length)]; }
  function divColor(v, mx) { var r = divRamp(); if (v == null) return css("--nodata"); var t = Math.max(-1, Math.min(1, v / mx)); var i = Math.round((t + 1) / 2 * (r.length - 1)); return r[i]; }
  function pointInRing(x, y, ring) { var inside = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
  P.forEach(function (p) { // path → rings（最大リングを粒の配置に使う）
    p.rings = p.path.split("Z").filter(Boolean).map(function (s) { return s.slice(1).trim().split(" ").map(function (pt) { var a = pt.split(","); return [+a[0], +a[1]]; }); });
    p.mainRing = p.rings.reduce(function (best, r) { var bw = bbox(r); return (!best || bw.a > best.a) ? { r: r, a: bw.a, b: bw } : best; }, null);
  });
  function bbox(r) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; r.forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }); return { x0: x0, y0: y0, x1: x1, y1: y1, a: (x1 - x0) * (y1 - y0) }; }

  /* ---------- particle engine ---------- */
  function Engine(canvas) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.ps = []; this.running = false; this.t0 = 0; this.dur = 900; this.onFrame = null; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.resize();
  }
  Engine.prototype.resize = function () { var r = this.c.getBoundingClientRect(); this.w = r.width; this.h = r.height; this.c.width = Math.round(r.width * this.dpr); this.c.height = Math.round(r.height * this.dpr); this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); };
  Engine.prototype.ensure = function (n) { while (this.ps.length < n) this.ps.push({ x: Math.random() * this.w, y: -20 - Math.random() * this.h * .5, a: 0, r: 2.2, sx: 0, sy: 0, tx: 0, ty: 0, ta: 0, sa: 0, d: 0 }); };
  /* targets: [{x,y,a?,r?}]; 粒 i が targets[i] へ。足りない粒は上から降り、余る粒は消える */
  Engine.prototype.moveTo = function (targets, opts) {
    opts = opts || {}; var n = targets.length; this.ensure(n); var dur = RM ? 0 : (opts.dur != null ? opts.dur : 900); var stag = RM ? 0 : (opts.stagger != null ? opts.stagger : 400);
    for (var i = 0; i < this.ps.length; i++) {
      var p = this.ps[i], t = targets[i];
      p.sx = p.x; p.sy = p.y; p.sa = p.a;
      if (t) { p.tx = t.x; p.ty = t.y; p.ta = t.a != null ? t.a : 1; p.r = t.r || 2.2; if (p.a === 0 && opts.spawn !== "stay") { p.sx = t.x + (Math.random() - .5) * 30; p.sy = t.y - 60 - Math.random() * 120; } }
      else { p.tx = p.x; p.ty = p.y + 40; p.ta = 0; }
      p.d = stag ? Math.random() * stag : 0;
    }
    this.dur = dur; this.t0 = performance.now(); this.total = dur + stag; this.start();
  };
  Engine.prototype.start = function () { if (!this.running) { this.running = true; var self = this; requestAnimationFrame(function f(now) { if (self.step(now)) requestAnimationFrame(f); else self.running = false; }); } };
  Engine.prototype.step = function (now) {
    var ctx = this.ctx, done = true, t = now - this.t0; ctx.clearRect(0, 0, this.w, this.h); var col = css("--dot"); ctx.fillStyle = col;
    for (var i = 0; i < this.ps.length; i++) {
      var p = this.ps[i]; var u = this.dur ? Math.max(0, Math.min(1, (t - p.d) / this.dur)) : 1; if (u < 1) done = false; var e = ease(u);
      p.x = p.sx + (p.tx - p.sx) * e; p.y = p.sy + (p.ty - p.sy) * e; p.a = p.sa + (p.ta - p.sa) * e;
      if (p.a <= 0.01) continue; ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1; if (this.onFrame) this.onFrame(now);
    return !done || !!this.loop;
  };
  Engine.prototype.redraw = function () { this.t0 = performance.now() - this.total - 1; this.start(); };

  /* ---------- layouts ---------- */
  function layoutColumn(n, x, yBase, yTop, w) { // x 中央・yBase 下端・yTop 上端の矩形に n 粒を格子で詰める
    var h = Math.max(4, yBase - yTop), area = w * h, s = Math.sqrt(area / Math.max(1, n)); var cols = Math.max(1, Math.round(w / s)); s = w / cols; var out = [];
    for (var i = 0; i < n; i++) { var row = Math.floor(i / cols), c = i % cols; out.push({ x: x - w / 2 + s * (c + .5), y: yBase - s * (row + .5), r: Math.min(2.6, Math.max(1.2, s * .36)) }); }
    return out;
  }
  function layoutInPolygon(p, n, proj, rnd) { // 多角形内に n 粒（決定的乱数で安定）
    var cache = p._cache || (p._cache = {}); var key = n + ":" + proj.k; if (cache[key]) return cache[key];
    var b = p.mainRing.b, out = [], tries = 0, seed = +p.code * 7919; var r = rnd || function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    while (out.length < n && tries < n * 60) { tries++; var x = b.x0 + r() * (b.x1 - b.x0), y = b.y0 + r() * (b.y1 - b.y0); if (pointInRing(x, y, p.mainRing.r)) out.push({ x: proj.x(x), y: proj.y(y), r: 2 }); }
    while (out.length < n) out.push({ x: proj.x(p.c[0]) + (r() - .5) * 8, y: proj.y(p.c[1]) + (r() - .5) * 8, r: 2 });
    return (cache[key] = out);
  }

  /* ---------- hero ---------- */
  var heroC = $("#hero-canvas");
  if (heroC) {
    var hero = new Engine(heroC), heroN = Math.round(D.national_h[last] / UNIT);
    var heroLayout = function () { var out = []; for (var i = 0; i < heroN; i++) out.push({ x: Math.random() * hero.w, y: Math.random() * hero.h, a: .62, r: 2.4 }); return out; };
    hero.moveTo(heroLayout(), { dur: 1600, stagger: 900 });
    if (!RM) { hero.loop = true; var drift = hero.ps.map(function () { return { vx: (Math.random() - .5) * .12, vy: .06 + Math.random() * .1 }; }); hero.onFrame = function () { for (var i = 0; i < hero.ps.length; i++) { var p = hero.ps[i]; if (p.a < .5) continue; p.x += drift[i].vx; p.y += drift[i].vy; p.tx = p.x; p.ty = p.y; p.sx = p.x; p.sy = p.y; if (p.y > hero.h + 4) { p.y = -4; p.ty = p.sy = -4; } } }; hero.start(); }
    // count-up
    var v = $("#hero-v"); if (v && !RM) { var target = D.national_h[last], t0 = performance.now(); (function tick(now) { var u = Math.min(1, (now - t0) / 1800); v.textContent = fmt(target * ease(u)); if (u < 1) requestAnimationFrame(tick); })(t0); }
    window.addEventListener("resize", function () { hero.resize(); hero.moveTo(heroLayout(), { dur: 0 }); });
    // hero canvas はスクロールで隠れたらループ停止（省電力）
    new IntersectionObserver(function (es) { es.forEach(function (e) { hero.loop = e.isIntersecting && !RM; if (hero.loop) hero.start(); }); }).observe(heroC);
  }

  /* ---------- stage (scrolly) ---------- */
  var stage = $("#stage"); if (!stage) return;
  var eng = new Engine($("#stage-canvas")), svg = $("#stage-svg");
  var G = {}; // graphic area
  function area() { var mob = window.innerWidth <= 760; var W = eng.w, H = eng.h; G.mob = mob; G.x0 = mob ? 20 : 48; G.x1 = mob ? W - 20 : Math.max(W * .55, W - 480); G.y0 = mob ? 44 : 72; G.y1 = H - (mob ? 34 : 64); G.w = G.x1 - G.x0; G.h = G.y1 - G.y0; }
  var proj = { k: 0 };
  function fitMap() { var vb = D.map.viewBox.split(" ").map(Number), vw = vb[2], vh = vb[3]; var s = Math.min(G.w / vw, G.h / vh) * (G.mob ? 1 : .98); var ox = G.x0 + (G.w - vw * s) / 2, oy = G.y0 + (G.h - vh * s) / 2; proj.s = s; proj.ox = ox; proj.oy = oy; proj.k = Math.round(s * 1000) + ":" + Math.round(ox) + ":" + Math.round(oy); proj.x = function (x) { return ox + x * s; }; proj.y = function (y) { return oy + y * s; }; }

  // layers
  var Ltl = el("g", { "class": "layer", id: "l-timeline" }, svg), Lst = el("g", { "class": "layer", id: "l-stacks" }, svg), Lmap = el("g", { "class": "layer", id: "l-map" }, svg), Lanno = el("g", { "class": "layer anno", id: "l-anno" }, svg);
  var mapG = el("g", {}, Lmap), prefEls = {};
  P.forEach(function (p) { prefEls[p.code] = el("path", { "class": "pref", d: p.path }, mapG); });
  var legend = $("#stage-legend"), caption = $("#stage-caption");

  // timeline scale
  var tl = {};
  function tlScales() { var vmax = 2000000; tl.x = function (i) { return G.x0 + 24 + (G.w - 34) * i / (YH.length - 1); }; tl.y = function (v) { return G.y1 - 28 - (G.h - 60) * v / vmax; }; tl.vmax = vmax; }
  function drawTimeline() {
    Ltl.innerHTML = ""; tlScales();
    var ax = el("g", { "class": "axis" }, Ltl);
    [500000, 1000000, 1500000, 2000000].forEach(function (v) { el("line", { x1: tl.x(0), x2: tl.x(YH.length - 1), y1: tl.y(v), y2: tl.y(v) }, ax); var t = el("text", { x: tl.x(0), y: tl.y(v) - 4 }, ax); t.textContent = (v / 10000) + " 万戸"; });
    el("line", { x1: tl.x(0), x2: tl.x(YH.length - 1), y1: tl.y(0), y2: tl.y(0), style: "stroke:var(--line-2)" }, ax);
    var ticks = G.mob ? [1951, 1973, 2000, 2025] : [1951, 1960, 1973, 1980, 1990, 2000, 2009, 2025];
    ticks.forEach(function (y) { var t = el("text", { x: tl.x(iH(y)), y: tl.y(0) + 16, "text-anchor": "middle" }, ax); t.textContent = y; });
    var d = D.national_h.map(function (v, i) { return (i ? "L" : "M") + tl.x(i).toFixed(1) + "," + tl.y(v).toFixed(1); }).join(" ");
    el("path", { "class": "area", d: d + " L" + tl.x(YH.length - 1).toFixed(1) + "," + tl.y(0).toFixed(1) + " L" + tl.x(0).toFixed(1) + "," + tl.y(0).toFixed(1) + "Z" }, Ltl);
    el("path", { "class": "line", d: d }, Ltl);
    var cur = el("g", { "class": "cursor" }, Ltl); tl.curLine = el("line", { x1: 0, x2: 0, y1: tl.y(0), y2: tl.y(0) }, cur); tl.curYr = el("text", { "class": "yr", x: 0, y: G.y0 + 30 }, cur); tl.curV = el("text", { x: 0, y: G.y0 + 52 }, cur);
    tl.anno = el("g", { "class": "anno" }, Ltl);
  }
  function timelineAt(i, snap) {
    var v = D.national_h[i], n = Math.round(v / UNIT), x = tl.x(i), yTop = tl.y(v), yBase = tl.y(0);
    tl.curLine.setAttribute("x1", x); tl.curLine.setAttribute("x2", x); tl.curLine.setAttribute("y2", yTop);
    tl.curYr.setAttribute("x", G.x0 + 8); tl.curV.setAttribute("x", G.x0 + 8);
    tl.curYr.textContent = YH[i] + " 年"; tl.curV.textContent = fmt(v) + " 戸 ＝ " + fmt(n) + " 粒";
    var w = G.mob ? 26 : 40;
    eng.moveTo(layoutColumn(n, x, yBase, yTop, w), { dur: snap ? 180 : 500, stagger: snap ? 60 : 260, spawn: "stay" });
    tl.anno.innerHTML = "";
    if (i >= peakI) annotate(tl.anno, tl.x(peakI), tl.y(D.national_h[peakI]), "1973 年 " + fmt(D.national_h[peakI]) + " 戸", "ピーク", true);
    if (i >= iH(2009)) annotate(tl.anno, tl.x(iH(2009)), tl.y(D.national_h[iH(2009)]), "2009 年 " + fmt(D.national_h[iH(2009)]) + " 戸", "半世紀ぶりの水準", false);
    if (i >= last) annotate(tl.anno, tl.x(last), tl.y(D.national_h[last]), "2025 年 " + fmt(D.national_h[last]) + " 戸", "1973 年の 39%", true);
  }
  function annotate(g, x, y, t1, t2, strong) { var right = x < G.x0 + G.w * .5; var dx = right ? 14 : -14; el("line", { x1: x, y1: y, x2: x + dx * .6, y2: y - 18 }, g); var a = el("text", { x: x + dx, y: y - 22, "text-anchor": right ? "start" : "end", "class": strong ? "strong" : "" }, g); a.textContent = t1; var b = el("text", { x: x + dx, y: y - 7, "text-anchor": right ? "start" : "end" }, g); b.textContent = t2; }

  // stacks (2024 都道府県別・多い順) — 横並びの行。名前は左、粒は右へ伸びる
  var st = {};
  function drawStacks() {
    Lst.innerHTML = ""; var order = P.slice().sort(function (a, b) { return b.h2024 - a.h2024; }); st.order = order;
    var n = order.length; st.rowH = (G.y1 - G.y0 - 8) / n; st.lx = G.x0 + (G.mob ? 40 : 64); st.s = Math.max(2.6, Math.min(6, st.rowH / 2.1)); st.rows = st.rowH >= 9 ? 2 : 1;
    var maxN = Math.round(order[0].h2024 / UNIT), cols = Math.ceil(maxN / st.rows); st.s = Math.min(st.s, (G.x1 - st.lx - 56) / cols);
    var lbl = el("g", {}, Lst);
    order.forEach(function (p, k) { var strong = G.mob ? (k === 0 || k === n - 1) : (k < 5 || k >= n - 3); var y = G.y0 + 4 + st.rowH * (k + .5);
      if (!G.mob || strong || (k % 4 === 0 && k > 0 && k < n - 2)) { var t = el("text", { "class": "bar-lbl" + (strong ? " strong" : ""), x: st.lx - 8, y: y + 4, "text-anchor": "end" }, lbl); t.textContent = p.short; }
      if (strong) { var cnt = Math.round(p.h2024 / UNIT), w = Math.ceil(cnt / st.rows) * st.s; var v = el("text", { "class": "bar-lbl" + (k < 5 ? " strong" : ""), x: st.lx + w + 8, y: y + 4 }, lbl); v.textContent = fmt(p.h2024) + " 戸"; } });
    el("line", { x1: st.lx - 2, x2: st.lx - 2, y1: G.y0, y2: G.y1, style: "stroke:var(--line-2)" }, Lst);
  }
  function stacksLayout() { var out = []; st.order.forEach(function (p, k) { var n = Math.round(p.h2024 / UNIT), y = G.y0 + 4 + st.rowH * (k + .5); for (var i = 0; i < n; i++) { var col = Math.floor(i / st.rows), r = i % st.rows; out.push({ x: st.lx + st.s * (col + .5), y: y + (st.rows === 2 ? (r - .5) * st.s : 0), r: st.s * .42 }); } }); return out; }
  function mapLayout() { var out = []; st.order.forEach(function (p) { var n = Math.round(p.h2024 / UNIT); out.push.apply(out, layoutInPolygon(p, n, proj)); }); return out; }

  function drawMapLayer() { mapG.setAttribute("transform", "translate(" + proj.ox + "," + proj.oy + ") scale(" + proj.s + ")"); }
  function fillMap(metric) {
    var mx = Math.max.apply(null, P.map(function (p) { return Math.abs(p.popChg); }));
    P.forEach(function (p) { var e = prefEls[p.code], c;
      if (metric === "none") c = "transparent";
      else if (metric === "rate") c = seqColor(p.rate2024, 3, 9);
      else if (metric === "pop") c = divColor(p.popChg, 25);
      else c = css("--nodata");
      e.style.fill = c; });
    if (metric === "rate") { legend.innerHTML = '<div>2024 年・人口 1,000 人あたり新設住宅着工（戸）</div><div class="ramp">' + seqRamp().map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + '</div><div class="ends"><span>3.0</span><span>9.0</span></div>'; legend.classList.add("on"); }
    else if (metric === "pop") { legend.innerHTML = '<div>人口の増減 2000→2024（%）</div><div class="ramp">' + divRamp().map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + '</div><div class="ends"><span>−25</span><span>0</span><span>+25</span></div>'; legend.classList.add("on"); }
    else legend.classList.remove("on");
  }
  function mapAnno(kind) {
    Lanno.innerHTML = ""; if (!kind) return;
    var picks = kind === "rate" ? [["13", "東京 8.7"], ["43", "熊本 8.5"], ["39", "高知 3.1"], ["05", "秋田 3.4"]] : [["13", "東京 +17.5%"], ["47", "沖縄 +11.2%"], ["05", "秋田 −24.6%"], ["02", "青森 −21.1%"]];
    picks.forEach(function (pk) { var p = P.filter(function (q) { return q.code === pk[0]; })[0]; var x = proj.x(p.c[0]), y = proj.y(p.c[1]); var right = x < G.x0 + G.w * .55; var dx = right ? 34 : -34; el("line", { x1: x, y1: y, x2: x + dx, y2: y - 22 }, Lanno); var t = el("text", { "class": "strong", x: x + dx + (right ? 4 : -4), y: y - 26, "text-anchor": right ? "start" : "end" }, Lanno); t.textContent = pk[1]; });
  }

  /* ---------- scenes ---------- */
  var scene = null, scrubI = 0;
  function setScene(name) {
    if (scene === name) return; scene = name;
    [Ltl, Lst, Lmap, Lanno].forEach(function (l) { l.classList.remove("on"); });
    if (name === "timeline") { Ltl.classList.add("on"); caption.textContent = "全国の新設住宅着工戸数（1951–2025・年計）— 1 粒 ＝ 1,000 戸"; fillMap("none"); legend.classList.remove("on"); timelineAt(scrubI, false); }
    if (name === "stacks") { Lst.classList.add("on"); caption.textContent = "2024 年・都道府県別の新設住宅着工戸数（多い順）— 1 粒 ＝ 1,000 戸"; fillMap("none"); eng.moveTo(stacksLayout(), { dur: 900, stagger: 500 }); }
    if (name === "map") { Lmap.classList.add("on"); caption.textContent = "同じ粒を、地図の上に置く（2024 年・1 粒 ＝ 1,000 戸）"; P.forEach(function (p) { prefEls[p.code].style.fill = "transparent"; }); $$(".pref", mapG).forEach(function (e) { e.style.stroke = css("--line-2"); }); legend.classList.remove("on"); eng.moveTo(mapLayout(), { dur: 1100, stagger: 700 }); }
    if (name === "rate") { Lmap.classList.add("on"); Lanno.classList.add("on"); caption.textContent = "2024 年・人口 1,000 人あたりの新設住宅着工"; $$(".pref", mapG).forEach(function (e) { e.style.stroke = css("--bg"); }); fillMap("rate"); mapAnno("rate"); eng.moveTo([], { dur: 500, stagger: 300 }); }
    if (name === "pop") { Lmap.classList.add("on"); Lanno.classList.add("on"); caption.textContent = "人口の増減 2000→2024 — 減った県 39・増えた県 8"; fillMap("pop"); mapAnno("pop"); eng.moveTo([], { dur: 300 }); }
  }
  function layoutAll() { eng.resize(); area(); fitMap(); drawTimeline(); drawStacks(); drawMapLayer(); var s = scene; scene = null; if (s) setScene(s); }
  layoutAll();
  window.addEventListener("resize", function () { clearTimeout(window.__vizR); window.__vizR = setTimeout(layoutAll, 120); });

  // steps
  var steps = $$(".step"); var tallStep = $(".step.tall");
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) setScene(e.target.getAttribute("data-scene")); }); }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  steps.forEach(function (s) { io.observe(s); });
  function onScroll() { if (!tallStep) return; var r = tallStep.getBoundingClientRect(); var vh = window.innerHeight; var p = (vh * .6 - r.top) / (r.height - vh * .4); p = Math.max(0, Math.min(1, p)); var i = Math.round(p * (YH.length - 1)); if (i !== scrubI) { scrubI = i; if (scene === "timeline") timelineAt(i, true); } }
  var ticking = false; window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { onScroll(); ticking = false; }); } }, { passive: true });
  onScroll(); setScene("timeline"); timelineAt(RM ? last : scrubI, false);

  /* ---------- explore: map + detail ---------- */
  var ex = $("#explore"); if (!ex) return;
  var exSvg = $("#ex-map"), exEls = {}, exG = el("g", {}, exSvg); exSvg.setAttribute("viewBox", D.map.viewBox);
  P.forEach(function (p) { var e = el("path", { "class": "pref", d: p.path, tabindex: 0, role: "button", "aria-label": p.name }, exG); exEls[p.code] = e; });
  var metric = "rate", year = 2024, sel = null;
  var exLegend = $("#ex-legend"), tip = $("#tip"), yrIn = $("#yr"), yrOut = $("#yr-out");
  function metricVal(p, y) { if (metric === "count") return p.h[iH(y)]; if (metric === "rate") return p.rate[iP(y)]; return y === 2000 ? 0 : (p.p[iP(y)] / p.p[0] - 1) * 100; }
  function metricColor(p, y) { var v = metricVal(p, y); if (metric === "count") return seqColor(v == null ? null : Math.log10(Math.max(1000, v)), 3.3, 5.35); if (metric === "rate") return seqColor(v, 3, 12); return divColor(v, 25); }
  function metricLabel(v) { if (v == null) return "データなし"; if (metric === "count") return fmt(v) + " 戸"; if (metric === "rate") return fmt1(v) + " 戸 / 千人"; return (v >= 0 ? "+" : "−") + fmt1(Math.abs(v)) + " %"; }
  function paint() {
    P.forEach(function (p) { exEls[p.code].style.fill = metricColor(p, year); });
    var ramp = metric === "pop" ? divRamp() : seqRamp(); var ends = metric === "count" ? ["2 千戸", "22 万戸"] : metric === "rate" ? ["3", "12"] : ["−25%", "0", "+25%"];
    var title = metric === "count" ? "新設住宅着工戸数（" + year + " 年）" : metric === "rate" ? "人口 1,000 人あたり着工（" + year + " 年）" : "人口の増減 2000→" + year;
    exLegend.innerHTML = "<div>" + title + "</div><div class=\"ramp\">" + ramp.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</div><div class=\"ends\">" + ends.map(function (e) { return "<span>" + e + "</span>"; }).join("") + "</div>";
    yrOut.textContent = year; if (sel) detail(sel);
  }
  function setMetric(m) { metric = m; $$("#metric button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === m ? "true" : "false"); }); var lo = m === "count" ? Y0 : YP[0], hi = m === "count" ? YH[last] : YP[lastP]; yrIn.min = lo; yrIn.max = hi; if (year < lo) year = lo; if (year > hi) year = hi; yrIn.value = year; paint(); }
  $$("#metric button").forEach(function (b) { b.addEventListener("click", function () { setMetric(b.getAttribute("data-m")); }); });
  yrIn.addEventListener("input", function () { year = +yrIn.value; paint(); });
  var playing = null; $("#play").addEventListener("click", function () { if (playing) { clearInterval(playing); playing = null; this.textContent = "▶"; return; } var self = this; self.textContent = "❚❚"; playing = setInterval(function () { year = year >= +yrIn.max ? +yrIn.min : year + 1; yrIn.value = year; paint(); }, RM ? 600 : 220); });
  function showTip(p, ev) { tip.innerHTML = "<b>" + p.name + "</b><br>" + metricLabel(metricVal(p, year)) + "<br><span style=\"opacity:.75\">" + year + " 年・着工 " + fmt(p.h[iH(year)]) + " 戸" + (iP(year) >= 0 ? "・人口 " + fmt1(p.p[iP(year)] / 10000) + " 万人" : "") + "</span>"; tip.classList.add("on"); moveTip(ev); }
  function moveTip(ev) { if (!ev) return; tip.style.left = ev.clientX + "px"; tip.style.top = ev.clientY + "px"; }
  P.forEach(function (p) { var e = exEls[p.code];
    e.addEventListener("pointerenter", function (ev) { showTip(p, ev); }); e.addEventListener("pointermove", moveTip); e.addEventListener("pointerleave", function () { tip.classList.remove("on"); });
    e.addEventListener("focus", function () { var r = e.getBoundingClientRect(); showTip(p, { clientX: r.left + r.width / 2, clientY: r.top }); }); e.addEventListener("blur", function () { tip.classList.remove("on"); });
    e.addEventListener("click", function () { select(p); }); e.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(p); } });
  });
  function select(p) { sel = p; P.forEach(function (q) { exEls[q.code].classList.toggle("sel", q === p); }); detail(p); }
  var det = $("#detail");
  function detail(p) {
    var i24 = iH(2024), cur = p.h[iH(year)];
    det.innerHTML = '<span class="eyebrow">' + p.region + '</span><h3>' + p.name + '</h3>' +
      '<div class="row"><div><b class="num">' + fmt(cur) + '</b><span>' + year + ' 年の新設住宅着工（戸）</span></div>' +
      '<div><b class="num">' + fmt1(p.rate2024) + '</b><span>2024 年・1,000 人あたり（戸）・全国 ' + p.rankRate + ' 位</span></div>' +
      '<div><b class="num">' + (p.popChg >= 0 ? "+" : "−") + fmt1(Math.abs(p.popChg)) + '%</b><span>人口 2000→2024</span></div></div>' +
      '<figure>' + sparkline(p) + '<figcaption>新設住宅着工戸数 1951–2025（' + (p.code === "47" ? "1973 年から集計・" : "") + 'ピーク ' + peakYear(p) + '）</figcaption></figure>' +
      '<p class="rank">2000→2024 の着工の変化 <b class="num">' + (p.hChg >= 0 ? "+" : "−") + fmt1(Math.abs(p.hChg)) + '%</b>（全国 ' + fmt1((D.national_h[i24] / D.national_h[iH(2000)] - 1) * 100) + '%）</p>';
  }
  function peakYear(p) { var m = -1, y = null; p.h.forEach(function (v, i) { if (v != null && v > m) { m = v; y = YH[i]; } }); return y + " 年 " + fmt(m) + " 戸"; }
  function sparkline(p) { var W = 360, H = 120, l = 8, r = 8, t = 10, b = 22; var mx = Math.max.apply(null, p.h.filter(function (v) { return v != null; })); var x = function (i) { return l + (W - l - r) * i / (YH.length - 1); }, y = function (v) { return t + (H - t - b) * (1 - v / mx); }; var pts = []; p.h.forEach(function (v, i) { if (v != null) pts.push((pts.length ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)); }); var d = pts.join(" "); var i0 = p.h.findIndex(function (v) { return v != null; }); var cx = x(iH(year)), cv = p.h[iH(year)];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + p.name + ' の推移"><path class="spark-area" d="' + d + ' L' + x(last).toFixed(1) + ',' + (H - b) + ' L' + x(i0).toFixed(1) + ',' + (H - b) + 'Z"/><line class="spark-axis" x1="' + l + '" x2="' + (W - r) + '" y1="' + (H - b) + '" y2="' + (H - b) + '"/><path class="spark-line" d="' + d + '"/>' + (cv != null ? '<circle cx="' + cx.toFixed(1) + '" cy="' + y(cv).toFixed(1) + '" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>' : "") + '<text class="spark-t" x="' + l + '" y="' + (H - 6) + '">1951</text><text class="spark-t" x="' + (W - r) + '" y="' + (H - 6) + '" text-anchor="end">2025</text><text class="spark-t" x="' + x(iH(1973)).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">1973</text></svg>';
  }
  setMetric("rate"); select(P.filter(function (p) { return p.code === "43"; })[0]);
})();
