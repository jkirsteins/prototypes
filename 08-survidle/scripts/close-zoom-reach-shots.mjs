/**
 * Photograph seed 42's named river reach at the three closest rungs, for the
 * browser pass in docs/close-zoom-simulation-shots. The run is the ordinary
 * application: the landing is played through the real controls and the rungs
 * are reached with the real zoom button.
 *
 * The one thing this harness assigns is where the survivor stands. Seed 42 has
 * no river within 150 km of its landing (2026-09-11 terrain hydrology report),
 * so the reach can only be seen by putting somebody on it - the same placement
 * that report's river shots used. Everything after that is the game's: the
 * survivor's own sight marks the ground, and the map draws what the chunks say.
 *
 * The last capture is the same rung after a page reload, and the two files are
 * compared byte for byte: a chunk that refined differently the second time
 * would show up here as a different photograph of the same minute.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.SHOTS_URL ?? "http://127.0.0.1:5173/prototypes/08/";
const PORT = Number(process.env.SHOTS_PORT ?? 9458);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../docs/close-zoom-simulation-shots");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SEED = 42;
const START_DAY = 90;
/** The bank patch beside the ford's channel, in the fine lattice: two patches west of the water. */
const STAND = { x: 4233, y: 12969 };
const WORLD_FINE_W = 10800;
const STAND_PATCH = STAND.y * WORLD_FINE_W + STAND.x;
/** Patches revealed around the survivor, so the reach is ground rather than fog: 40 patches is 2 km. */
const REVEAL = 40;
const LADDER_PRESSES = 10;
const VIEWPORT = { width: 1440, height: 900, deviceScale: 2 };
const CAPTURES = [
  { key: "reach50m", file: "reach-50m.png", label: "50 m per glyph" },
  { key: "reach100m", file: "reach-100m.png", label: "100 m per glyph" },
  { key: "reach300m", file: "reach-300m.png", label: "300 m per glyph" },
];
const RELOAD = { key: "reach50mReload", file: "reach-50m-reload.png", label: "50 m per glyph" };

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

async function waitFor(evalJs, expression, what, tries = 600, gap = 100) {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`Boolean(${expression})`)) return;
    await sleep(gap);
  }
  throw new Error(`${what} did not happen within ${Math.round((tries * gap) / 1000)} seconds`);
}

async function clickAct(evalJs, selector) {
  const clicked = await evalJs(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control) return false;
    control.click();
    return true;
  })()`);
  assert(clicked, `no ${selector} control to press`);
}

/** Close whatever the run has put up - welcome, field note, goal card - the way a player closes it. */
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
 * Put the survivor on the reach and let them have read the ground around it.
 * Both go through the application's own development doors: the placement is
 * the sim's `placeAtPatch`, region change and viewshed included, and the
 * reveal is the same mark the sight pass makes. A survivor who walked here
 * would know this much; nobody can walk 150 km for a photograph.
 */
async function standOnTheReach(evalJs) {
  const placed = await evalJs(`(() => {
    if (!window.survidle.placeAtPatch || !window.survidle.reveal) return false;
    window.survidle.placeAtPatch(${STAND_PATCH});
    window.survidle.reveal(${STAND_PATCH}, ${REVEAL});
    return true;
  })()`);
  assert(placed, "the development placement doors are missing: this needs the dev server, not a production build");
}

async function zoomTo(evalJs, wanted) {
  for (let i = 0; i < LADDER_PRESSES; i++) {
    const label = await evalJs("document.querySelector('.maptools span').textContent");
    if (label.startsWith(wanted)) return label;
    await clickAct(evalJs, "[data-act=zoom][data-dir=in]");
  }
  throw new Error(`the zoom ladder never reached ${wanted}`);
}

async function capture(evalJs, send, shot) {
  const zoomLabel = await zoomTo(evalJs, shot.label);
  await dismissModals(evalJs);
  const facts = await evalJs(`(() => {
    const state = window.survidle.state;
    const rect = document.querySelector('#map').getBoundingClientRect();
    const count = (selector) => document.querySelectorAll(selector).length;
    return {
      seed: state.seed,
      minute: Math.floor(state.minute),
      startDoy: state.startDoy,
      player: { xM: state.player.xM, yM: state.player.yM, region: state.player.region },
      zoom: document.querySelector('.maptools span').textContent,
      renderedCells: count('#map .c'),
      riverGlyphs: count('#map .c.t-river'),
      waterGlyphs: count('#map .c.t-water'),
      fogGlyphs: count('#map .c.unknown'),
      cosmeticDetails: count('#map .micro-ground'),
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  })()`);
  assert(facts.seed === SEED, `the run opened on seed ${facts.seed} rather than ${SEED}`);
  assert(facts.zoom === zoomLabel && facts.zoom.startsWith(shot.label), `the map drew ${facts.zoom} rather than ${shot.label}`);
  assert(facts.renderedCells > 0, "the map drew no ground");
  const clip = {
    x: Math.round(facts.box.x), y: Math.round(facts.box.y),
    width: Math.round(facts.box.width), height: Math.round(facts.box.height),
    scale: VIEWPORT.deviceScale,
  };
  const image = await send("Page.captureScreenshot", { format: "png", clip });
  writeFileSync(`${OUT}/${shot.file}`, Buffer.from(image.result.data, "base64"));
  return facts;
}

async function openRun() {
  const session = await cdp(`${URL_BASE}?seed=${SEED}&day=${START_DAY}`);
  await session.send("Emulation.setDeviceMetricsOverride", { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
  await session.send("Page.bringToFront");
  await land(session.evalJs);
  await standOnTheReach(session.evalJs);
  return session;
}

async function closeRun(session) {
  session.ws.close();
  await fetch(`http://localhost:${PORT}/json/close/${session.targetId}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = process.env.SHOTS_PROFILE ?? mkdtempSync(resolve(tmpdir(), "survidle-reach-shots-"));
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, "about:blank",
  ]);
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
    }
    const facts = {};
    for (const shot of CAPTURES) {
      // A page of its own per rung, so no photograph inherits another's zoom.
      const session = await openRun();
      facts[shot.key] = await capture(session.evalJs, session.send, shot);
      const f = facts[shot.key];
      console.log(`${shot.key.padEnd(12)} ${f.zoom} cells=${f.renderedCells} river=${f.riverGlyphs} water=${f.waterGlyphs} fog=${f.fogGlyphs} region=${f.player.region}`);
      await closeRun(session);
    }
    const again = await openRun();
    facts[RELOAD.key] = await capture(again.evalJs, again.send, RELOAD);
    await closeRun(again);
    const first = readFileSync(`${OUT}/${CAPTURES[0].file}`);
    const second = readFileSync(`${OUT}/${RELOAD.file}`);
    const identical = first.equals(second);
    console.log(`reload: ${identical ? "byte-identical" : `DIFFERENT (${first.length} vs ${second.length} bytes)`}`);
    writeFileSync(`${OUT}/reach-scene.json`, `${JSON.stringify({
      capturedAt: new Date().toISOString(), viewport: VIEWPORT, stand: { ...STAND, patch: STAND_PATCH, revealPatches: REVEAL }, reloadIdentical: identical, facts,
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
