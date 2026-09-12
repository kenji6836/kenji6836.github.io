// usage: node cdp-eval.mjs <url> <width> <height> [dark|light] — prints JSON: scrollWidth, overflowing elements, js class
import { spawn } from "node:child_process";
const [url, w = "390", h = "844", theme = "light"] = process.argv.slice(2);
const port = 9333 + Math.floor(Math.random() * 500);
const args = ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--window-size=${w},${h}`, "--user-data-dir=/tmp/cdp-prof-" + port, "about:blank"];
if (theme === "dark") args.push("--force-dark-mode");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args, { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(250); }
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 });
  await send("Page.navigate", { url });
  await sleep(2500);
  const expr = `(() => { const vw = document.documentElement.clientWidth; const sw = document.documentElement.scrollWidth; const bad = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') bad.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 60), right: Math.round(r.right), width: Math.round(r.width) }); } bad.sort((a, b) => b.right - a.right); return JSON.stringify({ vw, sw, jsClass: document.documentElement.classList.contains('js'), bad: bad.slice(0, 12) }); })()`;
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  console.log(res.result.result.value);
} finally { try { ws && ws.close(); } catch {} chrome.kill("SIGKILL"); }
