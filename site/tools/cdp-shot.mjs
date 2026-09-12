// usage: node cdp-shot.mjs <url> <width> <out.png> [dark] [rm] [fold]  — full-page screenshot with device emulation (mobile when width<600)
import { spawn } from "node:child_process"; import { writeFileSync } from "node:fs";
const [url, w = "390", out = "shot.png", ...flags] = process.argv.slice(2);
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, "--window-size=1280,900", "--user-data-dir=/tmp/cdp-prof-" + port, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws;
try {
  let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(250); }
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  const features = [];
  if (flags.includes("dark")) features.push({ name: "prefers-color-scheme", value: "dark" });
  if (flags.includes("rm")) features.push({ name: "prefers-reduced-motion", value: "reduce" });
  if (features.length) await send("Emulation.setEmulatedMedia", { features });
  const vh = flags.includes("fold") ? (+w < 600 ? 844 : 900) : 900;
  await send("Emulation.setDeviceMetricsOverride", { width: +w, height: vh, deviceScaleFactor: 1, mobile: +w < 600 });
  await send("Page.navigate", { url }); await sleep(2500);
  // trigger reveal animations by scrolling through the page, then back to top
  await send("Runtime.evaluate", { expression: `(async()=>{const h=document.documentElement.scrollHeight;for(let y=0;y<h;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));}window.scrollTo(0,0);})()`, awaitPromise: true });
  await sleep(900);
  let clip;
  if (!flags.includes("fold")) { const m = await send("Page.getLayoutMetrics"); const cs = m.result.cssContentSize || m.result.contentSize; clip = { x: 0, y: 0, width: +w, height: Math.ceil(cs.height), scale: 1 }; await send("Emulation.setDeviceMetricsOverride", { width: +w, height: Math.ceil(cs.height), deviceScaleFactor: 1, mobile: +w < 600 }); await sleep(1800); }
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !flags.includes("fold"), clip: clip || { x: 0, y: 0, width: +w, height: vh, scale: 1 } });
  writeFileSync(out, Buffer.from(shot.result.data, "base64")); console.log(out, clip ? clip.height : vh);
} finally { try { ws && ws.close(); } catch {} chrome.kill("SIGKILL"); }
