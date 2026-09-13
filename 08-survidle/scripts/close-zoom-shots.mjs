/**
 * Capture the two closest map rungs for the before-and-after comparison in
 * docs/close-zoom-simulation-shots. The browser runs the ordinary application:
 * this harness opens a seeded run, lands through the real candidate and landing
 * controls, dismisses the real overlays, presses the real zoom buttons, and
 * photographs the map panel. It reads state, terrain, weather, visibility,
 * markup and CSS; it assigns none of them, so an image is whatever the
 * generator, simulation and renderer actually produced.
 *
 * The scene is fixed by URL alone - seed 21, start day 90, game minute 10 -
 * and the application has no idea a screenshot is being taken.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.SHOTS_URL ?? "http://127.0.0.1:5173/prototypes/08/";
const PORT = Number(process.env.SHOTS_PORT ?? 9455);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../docs/close-zoom-simulation-shots");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SEED = 21;
const START_DAY = 90;
const MINUTE = 10;
/** More presses than the ladder has rungs, so a stuck button fails rather than loops. */
const LADDER_PRESSES = 10;
const VIEWPORT = { width: 1440, height: 900, deviceScale: 2 };
/** Each capture is a rung reached by pressing the real zoom-in button until its label appears. */
const CAPTURES = [
  { key: "after100m", file: "after-100m.png", label: "100 m per glyph" },
  { key: "after50m", file: "after-50m.png", label: "50 m per glyph" },
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cdp(url) {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
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
  return { send, evalJs, ws, targetId: target.id };
}

/** Wait for the page to report something true, checked in the page itself. */
async function waitFor(evalJs, expression, what, tries = 400, gap = 50) {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`Boolean(${expression})`)) return;
    await sleep(gap);
  }
  throw new Error(`${what} did not happen within ${Math.round((tries * gap) / 1000)} seconds`);
}

/** Click a control the player would click, and say so if it is not there. */
async function clickAct(evalJs, selector) {
  const clicked = await evalJs(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control) return false;
    control.click();
    return true;
  })()`);
  assert(clicked, `no ${selector} control to press`);
}

/**
 * Close whatever the run has put up, the way a player closes it. A modal holds
 * the clock, so a capture that means to happen at a game minute has to get
 * through all of them - the welcome, the first opportunity's field note, the
 * goal card - and there is no guarantee about which a seed raises.
 */
async function dismissModals(evalJs) {
  const doors = ["[data-act=welcome-close]", "[data-act=opportunity-modal-ok]", "[data-act=goal-close]"];
  for (let round = 0; round < doors.length + 1; round++) {
    let closed = false;
    for (const door of doors) {
      if (await evalJs(`Boolean(document.querySelector(${JSON.stringify(door)}))`)) {
        await clickAct(evalJs, door);
        closed = true;
      }
    }
    if (!closed) return;
  }
}

async function land(evalJs) {
  await waitFor(evalJs, "window.survidle && document.querySelector('[data-act=pick-candidate]')", "the landing choice");
  await clickAct(evalJs, "[data-act=pick-candidate]");
  await clickAct(evalJs, "[data-act=land]");
  await waitFor(evalJs, "document.querySelector('[data-act=welcome-close]')", "the welcome");
  await dismissModals(evalJs);
}

/**
 * Press the real zoom-in button until the map says it is drawing the wanted
 * ground per glyph. The label is the renderer's own, so a changed ladder shows
 * up here as a failure rather than as a mislabelled image.
 */
async function zoomTo(evalJs, wanted) {
  for (let i = 0; i < LADDER_PRESSES; i++) {
    const label = await evalJs("document.querySelector('.maptools span').textContent");
    if (label.startsWith(wanted)) return label;
    await clickAct(evalJs, "[data-act=zoom][data-dir=in]");
  }
  throw new Error(`the zoom ladder never reached ${wanted}`);
}

/**
 * Let the run reach the game minute the comparison is fixed at, closing field
 * notes as they arrive. The notes pause the clock and a fresh landing raises
 * several, so waiting without answering them waits forever; answering them is
 * what a player does, and the clock only runs between them.
 */
async function runToMinute(evalJs, minute) {
  for (let i = 0; i < 1200; i++) {
    await dismissModals(evalJs);
    const now = await evalJs("Math.floor(window.survidle.state.minute)");
    if (now === minute) return;
    assert(now < minute, `the clock reached game minute ${now} before the capture could be taken at ${minute}`);
    await sleep(50);
  }
  throw new Error(`game minute ${minute} did not arrive`);
}

async function capture(evalJs, send, shot) {
  await land(evalJs);
  // The overlays hold the clock, so the rung is chosen before any game time
  // runs and the capture happens inside game minute 10 itself.
  const zoomLabel = await zoomTo(evalJs, shot.label);
  await dismissModals(evalJs);
  await runToMinute(evalJs, MINUTE);
  const facts = await evalJs(`(() => {
    const state = window.survidle.state;
    const cells = [...document.querySelectorAll('#map .c')];
    const rect = document.querySelector('#map').getBoundingClientRect();
    return {
      seed: state.seed,
      minute: Math.floor(state.minute),
      startDoy: state.startDoy,
      player: { xM: state.player.xM, yM: state.player.yM, region: state.player.region },
      zoom: document.querySelector('.maptools span').textContent,
      renderedCells: cells.length,
      cosmeticDetails: document.querySelectorAll('#map .micro-ground').length,
      playerMarks: document.querySelectorAll('#map .grid .mk-player').length,
      overlayHidden: document.querySelector('#overlay').hidden,
      cacheStats: window.survidle.cacheStats(),
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  })()`);
  assert(facts.seed === SEED, `the run opened on seed ${facts.seed} rather than ${SEED}`);
  assert(facts.startDoy === START_DAY, `the run opened on start day ${facts.startDoy} rather than ${START_DAY}`);
  assert(facts.minute === MINUTE, `the capture fell in game minute ${facts.minute} rather than ${MINUTE}`);
  assert(facts.overlayHidden, "an overlay covered the map");
  assert(facts.zoom === zoomLabel && facts.zoom.startsWith(shot.label), `the map drew ${facts.zoom} rather than ${shot.label}`);
  assert(facts.renderedCells > 0, "the map drew no ground");
  assert(facts.cosmeticDetails === 0, `the close rung drew ${facts.cosmeticDetails} cosmetic details`);
  assert(facts.playerMarks === 1, `the board showed ${facts.playerMarks} survivor marks`);
  const clip = {
    x: Math.round(facts.box.x),
    y: Math.round(facts.box.y),
    width: Math.round(facts.box.width),
    height: Math.round(facts.box.height),
    scale: VIEWPORT.deviceScale,
  };
  const image = await send("Page.captureScreenshot", { format: "png", clip });
  writeFileSync(`${OUT}/${shot.file}`, Buffer.from(image.result.data, "base64"));
  const after = await evalJs("Math.floor(window.survidle.state.minute)");
  assert(after === MINUTE, `the photograph crossed out of game minute ${MINUTE} into ${after}`);
  return facts;
}

function sourceCommit() {
  return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: HERE, encoding: "utf8" }).trim();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // A profile of one's own by default, so no run inherits another's state. A
  // named one is for the solve: the world is cached in that profile's
  // IndexedDB, and solving 4 million cells in a browser is minutes of work
  // that a capture should not pay twice.
  const profile = process.env.SHOTS_PROFILE ?? mkdtempSync(resolve(tmpdir(), "survidle-close-zoom-shots-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    "about:blank",
  ]);
  try {
    let chromeError;
    chrome.on("error", (error) => { chromeError = error; });
    for (let i = 0; i < 60; i++) {
      if (chromeError) throw chromeError;
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
    }
    if (chromeError) throw chromeError;
    const captures = {};
    for (const shot of CAPTURES) {
      // A page of its own per rung: each image comes from a landing played out
      // from the beginning rather than from the previous photograph's page.
      const { send, evalJs, ws, targetId } = await cdp(`${URL_BASE}?seed=${SEED}&day=${START_DAY}`);
      await send("Emulation.setDeviceMetricsOverride", { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
      await send("Page.bringToFront");
      captures[shot.key] = await capture(evalJs, send, shot);
      console.log(`${shot.key.padEnd(10)} ${captures[shot.key].zoom} cells=${captures[shot.key].renderedCells} cosmetic=${captures[shot.key].cosmeticDetails}`);
      ws.close();
      await fetch(`http://localhost:${PORT}/json/close/${targetId}`);
    }
    for (const shot of CAPTURES) {
      const box = captures[shot.key].box;
      const first = captures[CAPTURES[0].key].box;
      assert(box.width === first.width && box.height === first.height, `${shot.key} was photographed at a different size`);
    }
    writeFileSync(`${OUT}/after-scene.json`, `${JSON.stringify({
      capturedAt: new Date().toISOString(),
      sourceCommit: sourceCommit(),
      viewport: VIEWPORT,
      captures,
    }, null, 2)}\n`);
  } finally {
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise((done) => chrome.once("exit", done));
      chrome.kill();
      await exited;
    }
    if (!process.env.SHOTS_PROFILE) rmSync(profile, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
