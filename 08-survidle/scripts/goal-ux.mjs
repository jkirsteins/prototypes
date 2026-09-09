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
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
    }
    const { evaluate, send, ws } = await connect();
    const click = (selector) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`);
    const waitFor = async (expression, message) => {
      for (let attempt = 0; attempt < 60; attempt++) {
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
      const box = document.querySelector('#overlay .box');
      if (!box) return false;
      const rect = box.getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth + 1 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    })()`);
    const overlayText = () => evaluate("document.querySelector('#overlay')?.textContent ?? ''");

    await sleep(1800);
    assert(await click('#overlay [data-act="pick-candidate"]'), "candidate control missing");
    assert(await click('#overlay [data-act="land"]'), "land control missing");
    await waitFor(`Boolean(document.querySelector('#overlay [data-act="welcome-close"]'))`, "welcome did not open");
    const welcome = await overlayText();
    assert(welcome.includes("Starting skills"), "welcome has no Starting skills label");
    assert(welcome.includes("Tip"), "welcome has no Tip label");
    assert(!welcome.includes("You land knowing nothing"), "welcome retained the long introduction");
    assert(await layoutOk(), "desktop welcome overflows");
    await shot("welcome-desktop");

    await click('#overlay [data-act="welcome-close"]');
    await waitFor(`document.querySelector('#overlay .goal-modal')?.textContent.includes('New goal available: Choose where to live')`, "first goal did not open");
    assert(await evaluate(`document.querySelector('#overlay .goal-modal h1')?.textContent === 'Goals'`), "goal modal has no global heading");
    assert(!(await overlayText()).includes("Build > Site"), "goal modal prescribes a UI path");
    assert(await layoutOk(), "desktop first-goal layout overflows");
    await shot("first-goal-desktop");

    await click('#overlay [data-act="goal-close"]');
    await waitFor(`document.querySelector('#goals h2')?.textContent === 'Goals'`, "pinned goals heading missing");
    assert(!await evaluate(`Boolean(document.querySelector('#goals .bar, #goals .goal-next, #goals .goal-value'))`), "pinned goal retained progress chrome");
    await evaluate(`(() => {
      const s = window.survidle.state;
      s.goals.done.site = true;
      s.goals.queue = ['site'];
    })()`);
    await waitFor(`document.querySelector('#overlay .goal-modal')?.textContent.includes('Goal completed: Choose where to live')`, "completion did not open");
    const water = await overlayText();
    assert(water.includes("New goal available: Drink water"), "water goal was not labeled as new");
    assert(water.includes("Below 1 litre, the survivor drinks automatically from water at hand."), "water auto-drink rule missing");
    assert(water.includes("Self-care handles it through the activity queue."), "water queue rule missing");
    assert(await layoutOk(), "desktop water transition overflows");
    await shot("water-transition-desktop");

    await click('#overlay [data-act="goal-close"]');
    await evaluate(`(() => {
      const s = window.survidle.state;
      for (const id of ['site', 'drink', 'firewood', 'fire', 'bed', 'roof', 'keptNight', 'forageMeal', 'cook']) s.goals.done[id] = true;
      s.goals.queue = [];
    })()`);
    await waitFor(`document.querySelector('#overlay .goal-modal')?.textContent.includes('New goal available: Find useful cover')`, "shelter lesson did not open");
    const shelter = await overlayText();
    assert(shelter.includes("Natural cover can break the wind before a built shelter is ready."), "natural-cover guidance missing");
    assert(shelter.includes("Find useful cover"), "natural-cover step missing");
    assert(await layoutOk(), "desktop shelter-goal layout overflows");
    await shot("shelter-goal-desktop");

    await click('#overlay [data-act="goal-close"]');
    await evaluate(`(() => {
      const s = window.survidle.state;
      for (const id of ['findUsefulCover', 'makeUsefulShelter', 'testShelter']) s.goals.done[id] = true;
      for (const id of ['snareMeal', 'huntMeal', 'fishMeal']) delete s.goals.introduced[id];
      s.goals.queue = [];
    })()`);
    await waitFor(`document.querySelector('#overlay .goal-modal')?.textContent.includes('New goal available: Hunt, cook, and eat meat')`, "food-method goals did not open");
    const food = await overlayText();
    assert(food.includes("Make a bow"), "hunt equipment step missing");
    assert(food.includes("Make arrows"), "hunt ammunition step missing");
    assert(food.includes("Hunt an animal"), "hunt acquisition step missing");
    assert(food.includes("Eat cooked meat"), "hunt final eating step missing");
    assert(await layoutOk(), "desktop food-goal layout overflows");
    await shot("food-goals-desktop");

    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert(await layoutOk(), "mobile food-goal layout overflows");
    await shot("food-goals-mobile");

    ws.close();
    console.log(`Goal UX verified in headless Chrome. Screenshots: ${OUT}`);
  } finally {
    chrome.kill();
  }
}

main().then(
  () => process.exit(0),
  (error) => { console.error(error); process.exit(1); },
);
