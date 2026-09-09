import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.GOAL_UX_URL ?? "http://127.0.0.1:5173/prototypes/08/?seed=3";
const PORT = Number(process.env.GOAL_UX_PORT ?? 9446);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/goal-ux-shots");
const PROFILE = resolve(tmpdir(), `survidle-goal-ux-${PORT}`);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function connect() {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen) => { ws.onopen = resolveOpen; });
  let nextId = 0;
  const waiting = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) waiting.get(message.id)(message);
  };
  const send = (method, params = {}) => {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveMessage) => waiting.set(id, resolveMessage));
  };
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
    return response.result.result.value;
  };
  return { evaluate, send, ws };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--window-size=1440,900",
    "about:blank",
  ]);
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
  }
  const { evaluate, send, ws } = await connect();
  const click = (selector) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`);
  const waitFor = async (expression, message) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(message);
  };
  const shot = async (name) => {
    const response = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(response.result.data, "base64"));
  };
  const layoutOk = () => evaluate(`(() => {
    const modal = document.querySelector('#overlay .goal-modal');
    if (!modal) return false;
    const rect = modal.getBoundingClientRect();
    return document.documentElement.scrollWidth <= innerWidth + 1 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  })()`);

  await sleep(1800);
  assert(await click('#overlay [data-act="pick-candidate"]'), "candidate control missing");
  assert(await click('#overlay [data-act="land"]'), "land control missing");
  await waitFor(`Boolean(document.querySelector('#overlay [data-act="welcome-close"]'))`, "welcome did not open");
  assert(!await evaluate(`Boolean(document.querySelector('#overlay .manual'))`), "manual opened automatically");
  await click('#overlay [data-act="welcome-close"]');
  await waitFor(`document.querySelector('#overlay .goal-modal h1')?.textContent.includes('Choose where to live')`, "first goal did not open");
  assert(!await evaluate(`Boolean(document.querySelector('.map-inspect'))`), "duplicate map inspection surface exists");
  assert(await layoutOk(), "desktop first-goal layout overflows");
  await shot("first-goal-desktop");

  await click('#overlay [data-act="goal-close"]');
  const keyboard = await evaluate(`(() => {
    const grid = document.querySelector('#mapdyn .grid');
    if (!grid) return { ok: false, reason: 'no grid' };
    grid.focus();
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    return { ok: document.activeElement?.getAttribute('role') === 'gridcell', active: document.activeElement?.outerHTML };
  })()`);
  assert(keyboard.ok, `arrow keys do not focus a map cell: ${keyboard.active ?? keyboard.reason}`);
  await waitFor(`document.querySelector('#maptip')?.hidden === false`, "keyboard inspection did not open the map tooltip");
  await evaluate(`(() => {
    const s = window.survidle.state;
    const player = document.querySelector('#mapdyn .mk-player');
    const cell = Number(player?.dataset.mapCell);
    s.wildlife.activeRegion = s.player.region;
    s.wildlife.subjects.push({
      id: 99001, species: 'deer', form: 'herd', region: s.player.region,
      cohorts: [{ sex: 'f', bornYear: s.year - 1, count: 7 }],
      condition: 70, reproductive: 'none', dependentUntilYear: 0,
      name: null, nameKind: 'field', colour: 0, lastKnownDay: -1, denCell: null,
      active: { cell, hunger: 20, thirst: 20, rest: 20, alarm: 0, intent: 'wander', target: null, route: [] },
    });
    const rect = player.getBoundingClientRect();
    document.querySelector('#mapdyn').dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
  })()`);
  await waitFor(`document.querySelector('#maptip')?.textContent.includes('deer, 7, wander')`, "hover tooltip did not include visible animals");
  await evaluate(`window.survidle.state.wildlife.subjects = window.survidle.state.wildlife.subjects.filter((subject) => subject.id !== 99001)`);
  await evaluate(`(() => {
    const s = window.survidle.state;
    for (const id of ['site', 'drink', 'firewood', 'fire']) { s.goals.done[id] = true; s.goals.introduced[id] = true; }
    s.goals.queue = [];
  })()`);
  await waitFor(`document.querySelector('#overlay .goal-modal')?.textContent.includes('cold ground')`, "night goals did not open");
  assert(await layoutOk(), "desktop night-goal layout overflows");
  await shot("night-goals-desktop");

  await click('#overlay [data-act="goal-close"]');
  await evaluate(`(() => {
    const s = window.survidle.state;
    for (const id of ['site', 'drink', 'firewood', 'fire', 'bed', 'roof', 'cook', 'keptNight', 'firstOrder']) { s.goals.done[id] = true; s.goals.introduced[id] = true; }
    s.goals.queue = [];
  })()`);
  await waitFor(`document.querySelector('#overlay .goal-modal')?.textContent.includes('Keep water at camp')`, "monthly goals did not open");
  assert(await layoutOk(), "desktop monthly-goal layout overflows");
  await shot("monthly-prompt-desktop");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('#overlay [data-act="goal-close"]');
  await evaluate(`(() => {
    const s = window.survidle.state;
    for (const key of Object.keys(s.goals.done)) delete s.goals.done[key];
    for (const key of Object.keys(s.goals.introduced)) delete s.goals.introduced[key];
    s.goals.queue = [];
  })()`);
  await waitFor(`document.querySelector('#overlay .goal-modal h1')?.textContent.includes('Choose where to live')`, "mobile first goal did not open");
  assert(await layoutOk(), "mobile first-goal layout overflows");
  await shot("first-goal-mobile");

  ws.close();
  chrome.kill();
  console.log(`Goal UX, map keyboard inspection, and wildlife tooltip verified. Screenshots: ${OUT}`);
}

main().then(
  () => process.exit(0),
  (error) => { console.error(error); process.exit(1); },
);
