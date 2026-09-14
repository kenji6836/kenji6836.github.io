// Service Worker: アプリ本体を先読みして端末内に保持（オフラインで動く）。外部通信は Google Fonts のみ（初回取得後は端末内に保持）。
const VERSION = "v1";
const CACHE = `mitsumori-${VERSION}`;
const FONT_CACHE = `mitsumori-fonts-${VERSION}`;
const BASE = new URL("./", self.location).pathname;
const SHELL = [
  "", "index.html", "app.css", "app.js", "manifest.webmanifest",
  "src/classify.js", "src/store.js", "src/time.js", "src/ui.js", "src/views.js", "src/charts.js",
  "data/rules.json", "data/samples.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png", "icons/icon.svg",
].map((p) => BASE + p);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === self.location.origin && url.pathname.startsWith(BASE)) {
    // アプリ本体: 端末内を優先し、裏で更新
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const req = e.request.mode === "navigate" ? BASE + "index.html" : e.request;
        const hit = await c.match(req);
        const net = fetch(e.request).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
        return hit || (await net) || new Response("offline", { status: 503 });
      })
    );
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // フォント: 端末内にあれば即返し、裏で更新（stale-while-revalidate）
    e.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => null);
        return hit || (await net) || Response.error();
      })
    );
  }
});
