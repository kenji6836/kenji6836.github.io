// usage: node render-video.mjs <html> <outdir> [fps=30] [duration=15] [--frames 15,90,210] [--from I] [--to J] [--wait MS]
//   Deterministic frame capture: launches headless Chrome once (same CDP pattern as cdp-shot.mjs), emulates 1080×1920 @ DPR 1,
//   loads the page (file:// or http), then for each frame i calls window.__seek(i/fps) and saves Page.captureScreenshot → outdir/frame_%04d.png.
//   The page must define window.__seek(t) (Promise) and window.__duration. --frames renders only the listed indices (test shots);
//   --from/--to render an inclusive index range (split long runs).
import { spawn } from "node:child_process"; import { writeFileSync, mkdirSync } from "node:fs"; import { pathToFileURL } from "node:url"; import { resolve } from "node:path";
const args = process.argv.slice(2); const pos = []; const opt = {};
for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) { opt[args[i].slice(2)] = args[i + 1]; i++; } else pos.push(args[i]); }
const [html, outdir = "frames", fpsArg = "30", durArg = "15"] = pos;
if (!html) { console.error("usage: node render-video.mjs <html> <outdir> [fps] [duration] [--frames i,j,k] [--from I] [--to J]"); process.exit(1); }
const fps = +fpsArg, duration = +durArg, W = 1080, H = 1920, wait = +(opt.wait || 1500);
const url = /^https?:|^file:/.test(html) ? html : pathToFileURL(resolve(html)).href;
mkdirSync(outdir, { recursive: true });
const total = Math.round(fps * duration);
let frames = [...Array(total).keys()];
if (opt.frames) frames = opt.frames.split(",").map(Number);
else { const a = opt.from != null ? +opt.from : 0, b = opt.to != null ? +opt.to : total - 1; frames = frames.filter((i) => i >= a && i <= b); }
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, "--user-data-dir=/tmp/cdp-prof-" + port, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws; const t0 = Date.now();
try {
  let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(250); }
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url }); await sleep(wait);
  const rdy = await send("Runtime.evaluate", { expression: "(async()=>{await (window.__ready||0); if(document.fonts) await document.fonts.ready; return {dur:window.__duration, anims:document.getAnimations().length, seek:typeof window.__seek}})()", awaitPromise: true, returnByValue: true });
  const info = rdy.result?.result?.value; console.log("page ready:", JSON.stringify(info));
  if (!info || info.seek !== "function") throw new Error("window.__seek not defined");
  const clip = { x: 0, y: 0, width: W, height: H, scale: 1 };
  let n = 0;
  for (const i of frames) {
    const t = i / fps;
    const r = await send("Runtime.evaluate", { expression: `window.__seek(${t})`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error("seek failed at " + t + ": " + JSON.stringify(r.result.exceptionDetails));
    const shot = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false, fromSurface: true });
    if (!shot.result?.data) throw new Error("captureScreenshot failed at frame " + i + ": " + JSON.stringify(shot.error || shot));
    writeFileSync(`${outdir}/frame_${String(i).padStart(4, "0")}.png`, Buffer.from(shot.result.data, "base64"));
    n++; if (n % 30 === 0 || n === frames.length) console.log(`${n}/${frames.length} frames (last i=${i}, t=${t.toFixed(3)}s) ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  console.log("done", n, "frames →", outdir);
} finally { try { ws && ws.close(); } catch {} chrome.kill("SIGKILL"); }
