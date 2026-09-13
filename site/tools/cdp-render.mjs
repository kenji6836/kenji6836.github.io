// usage: node cdp-render.mjs <url> <width> <height> <out.png|out.jpg> [--selector CSS] [--scale N] [--quality Q] [--wait MS] [--eval JS]
//   exact-size render with device emulation (DPR = --scale, default 1). --selector clips to that element's box.
//   --eval runs JS after load (e.g. seek an animation) before capture. Fonts from Google Fonts load over the network.
import { spawn } from "node:child_process"; import { writeFileSync } from "node:fs";
const args = process.argv.slice(2); const pos = []; const opt = {};
for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) { opt[args[i].slice(2)] = args[i + 1]; i++; } else pos.push(args[i]); }
const [url, w = "1080", h = "1080", out = "render.png"] = pos;
const scale = +(opt.scale || 1), quality = +(opt.quality || 90), wait = +(opt.wait || 1500);
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, "--window-size=1280,900", "--user-data-dir=/tmp/cdp-prof-" + port, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws;
try {
  let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(250); }
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: scale, mobile: false });
  await send("Page.navigate", { url }); await sleep(wait);
  await send("Runtime.evaluate", { expression: "document.fonts ? document.fonts.ready.then(()=>1) : 1", awaitPromise: true });
  if (opt.eval) await send("Runtime.evaluate", { expression: opt.eval, awaitPromise: true });
  await sleep(200);
  let clip = { x: 0, y: 0, width: +w, height: +h, scale: 1 };
  if (opt.selector) { const r = await send("Runtime.evaluate", { expression: `JSON.stringify((()=>{const e=document.querySelector(${JSON.stringify(opt.selector)});const b=e.getBoundingClientRect();return {x:b.left+window.scrollX,y:b.top+window.scrollY,w:b.width,h:b.height}})())`, returnByValue: true }); const b = JSON.parse(r.result.result.value); clip = { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 }; }
  const fmt = out.endsWith(".jpg") || out.endsWith(".jpeg") ? "jpeg" : "png";
  const shot = await send("Page.captureScreenshot", { format: fmt, ...(fmt === "jpeg" ? { quality } : {}), clip, captureBeyondViewport: true });
  writeFileSync(out, Buffer.from(shot.result.data, "base64")); console.log(out, Math.round(clip.width * scale) + "x" + Math.round(clip.height * scale));
} finally { try { ws && ws.close(); } catch {} chrome.kill("SIGKILL"); }
