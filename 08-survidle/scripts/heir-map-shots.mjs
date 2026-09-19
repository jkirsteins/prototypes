/**
 * Photographs the map an heir opens on, for the before-and-after of roadmap
 * Q's rulings 1 and 4.
 *
 * The browser runs the ordinary application. The only thing this harness puts
 * in front of it is a save - written by `scripts/heir-save.ts` on whichever
 * revision is being photographed, by landing a first survivor, living, dying
 * and running the real `beginAgain` and `land`. The page loads that save the
 * way it loads any other, and what it draws is whatever the renderer makes of
 * the knowledge the simulation actually left behind.
 *
 * It reports the ground counted in the board model beside each image, so the
 * pictures can be checked against a number rather than an impression.
 *
 *   node scripts/heir-map-shots.mjs <save.json> <out.png> [label] [zoomOutPresses]
 *
 * The zoom presses are the real map buttons, so a wider rung is reached the
 * way a player reaches it. A wide rung is what shows the ancestor's country
 * as well as the landing shore, which is the whole subject of the pair.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const [savePath, outPath, label = "shot", zoomOutText = "0"] = process.argv.slice(2);
const ZOOM_OUT = Number(zoomOutText);
if (!savePath || !outPath) throw new Error("usage: heir-map-shots.mjs <save.json> <out.png> [label]");

const URL_BASE = process.env.SHOTS_URL ?? "http://127.0.0.1:5173/prototypes/08/";
const PORT = Number(process.env.SHOTS_PORT ?? 9466);
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const VIEWPORT = { width: 1440, height: 900, deviceScale: 2 };
const SAVE_KEY = "survidle.save";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function assert(condition, message) { if (!condition) throw new Error(message); }

async function cdp(url, before) {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((open) => { ws.onopen = open; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) waiting.get(message.id)(message);
  };
  const send = (method, params = {}) => {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((reply) => waiting.set(callId, reply));
  };
  const evalJs = async (expression) => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result.result.value;
  };
  await send("Page.enable");
  // The save has to be in storage before the application's first line runs,
  // or it boots a new world and photographs that instead.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: before });
  await send("Page.navigate", { url });
  return { send, evalJs, ws, targetId: target.id };
}

async function waitFor(evalJs, expression, what, tries = 600, gap = 50) {
  for (let i = 0; i < tries; i++) {
    try { if (await evalJs(`Boolean(${expression})`)) return; } catch { /* the document is still coming up */ }
    await sleep(gap);
  }
  throw new Error(`${what} did not happen within ${Math.round((tries * gap) / 1000)} seconds`);
}

async function clickAct(evalJs, selector) {
  return evalJs(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control) return false;
    control.click();
    return true;
  })()`);
}

/** Close whatever the run has put up, the way a player closes it. */
async function dismissModals(evalJs) {
  const doors = ["[data-act=welcome-close]", "[data-act=opportunity-modal-ok]", "[data-act=goal-close]", "[data-act=recognition-close]"];
  for (let round = 0; round < doors.length + 2; round++) {
    let closed = false;
    for (const door of doors) if (await clickAct(evalJs, door)) closed = true;
    if (!closed) return;
    await sleep(80);
  }
}

async function main() {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  const save = readFileSync(savePath, "utf8");
  const seed = `localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(save)});`;

  const profile = mkdtempSync(resolve(tmpdir(), "survidle-heir-shots-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-sandbox",
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    "about:blank",
  ]);
  try {
    let chromeError;
    chrome.on("error", (error) => { chromeError = error; });
    for (let i = 0; i < 80; i++) {
      if (chromeError) throw chromeError;
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
    }
    if (chromeError) throw chromeError;

    const { send, evalJs, ws, targetId } = await cdp(URL_BASE, seed);
    await send("Emulation.setDeviceMetricsOverride", { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
    await send("Page.bringToFront");
    await waitFor(evalJs, "window.survidle && window.survidle.state", "the application");
    await dismissModals(evalJs);
    await waitFor(evalJs, "window.survidle.mapModel && window.survidle.mapModel.glyphs.length", "the board");
    for (let i = 0; i < ZOOM_OUT; i++) {
      assert(await clickAct(evalJs, "[data-act=zoom][data-dir=out]"), "no zoom-out button to press");
      await sleep(120);
    }
    await dismissModals(evalJs);

    // What the picture is of, counted rather than eyeballed. `cur` is ground
    // in sight now, `memory` ground walked this life, `dim` ground carried in
    // from the journal, `fog` ground nobody has been.
    const facts = await evalJs(`(() => {
      const state = window.survidle.state;
      const glyphs = window.survidle.mapModel.glyphs;
      const count = (cls) => glyphs.filter((g) => g.classes.includes(cls)).length;
      const rect = document.querySelector('#map').getBoundingClientRect();
      return {
        seed: state.seed,
        survivors: state.survivors.length,
        region: state.player.region,
        glyphs: glyphs.length,
        current: count('cur'),
        memory: count('memory'),
        inherited: count('dim'),
        fog: count('fog'),
        zoom: document.querySelector('.maptools span')?.textContent ?? '',
        box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    })()`);
    assert(facts.survivors >= 2, `the page opened on survivor ${facts.survivors}, not an heir - the save did not load`);
    assert(facts.glyphs > 0, "the map drew no ground");

    const clip = {
      x: Math.round(facts.box.x), y: Math.round(facts.box.y),
      width: Math.round(facts.box.width), height: Math.round(facts.box.height),
      scale: VIEWPORT.deviceScale,
    };
    const image = await send("Page.captureScreenshot", { format: "png", clip });
    writeFileSync(outPath, Buffer.from(image.result.data, "base64"));
    console.log(`${label.padEnd(8)} glyphs=${facts.glyphs} current=${facts.current} memory=${facts.memory} inherited=${facts.inherited} fog=${facts.fog} zoom="${facts.zoom}" -> ${outPath}`);
    writeFileSync(`${outPath}.json`, `${JSON.stringify(facts, null, 2)}\n`);
    ws.close();
    await fetch(`http://localhost:${PORT}/json/close/${targetId}`);
  } finally {
    chrome.kill();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
