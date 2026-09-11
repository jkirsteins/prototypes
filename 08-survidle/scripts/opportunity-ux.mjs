import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.OPPORTUNITY_UX_URL ?? "http://127.0.0.1:5173/prototypes/08/?seed=3";
const PORT = Number(process.env.OPPORTUNITY_UX_PORT ?? 9446);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/opportunity-ux-shots");
const PROFILE = resolve(tmpdir(), `survidle-opportunity-ux-${PORT}`);
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
      const box = document.querySelector('#overlay .opportunity-modal, #overlay .box');
      if (!box) return false;
      const rect = box.getBoundingClientRect();
      const overlay = document.querySelector('#overlay');
      // #overlay is fixed with inset: 0, so its own rect always equals the
      // viewport regardless of content. The real overflow signal is whether
      // the overlay's scrollable content exceeds its own box (it now scrolls
      // vertically for a tall modal/catalog) and whether the box itself sits
      // fully inside the viewport at rest.
      return document.documentElement.scrollWidth <= innerWidth + 1 && rect.left >= 0 && rect.right <= innerWidth && overlay.scrollHeight <= overlay.clientHeight + 1 && rect.top >= 0 && rect.bottom <= innerHeight;
    })()`);
    const overlayText = () => evaluate("document.querySelector('#overlay')?.textContent ?? ''");
    const finishPresentations = async () => {
      for (let attempt = 0; attempt < 60; attempt++) {
        await click('#overlay [data-act="opportunity-modal-ok"]');
        await sleep(100);
        if (await evaluate("window.survidle.state.opportunities.notices.length === 0 && !document.querySelector('#overlay:not([hidden]) .opportunity-modal')")) return;
      }
      throw new Error("opportunity presentations did not finish");
    };
    // Use the production event seam for the completion transition. Later
    // screenshots arrange authored prerequisites, then use normal discovery.
    const moduleUrl = new URL("src/sim/opportunities.ts", BASE).href;
    const inOpportunities = (body) => evaluate(`(async () => {
      const api = await import(${JSON.stringify(moduleUrl)});
      const s = window.survidle.state;
      ${body}
      window.survidle.advance(0);
    })()`);

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
    await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('New opportunity: Choose where to live')`, "first opportunity did not open");
    assert(await evaluate(`document.querySelector('#overlay .opportunity-modal h1')?.textContent === 'Opportunities'`), "opportunity modal has no global heading");
    assert(!(await overlayText()).includes("Build > Site"), "opportunity modal prescribes a UI path");
    assert(await layoutOk(), "desktop first-opportunity layout overflows");
    await shot("first-opportunity-desktop");

    await finishPresentations();
    await waitFor(`document.querySelector('#opportunities h2')?.textContent === 'Opportunities'`, "current opportunities heading missing");
    assert(!await evaluate(`Boolean(document.querySelector('#opportunities .bar, #opportunities .opportunity-next, #opportunities .opportunity-value'))`), "pinned opportunity retained progress chrome");
    await inOpportunities(`api.recordOpportunityEvent(s, { kind: 'task', id: 'makeCamp' }, window.survidle.world);`);
    await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('Completed: Choose where to live')`, "completion did not open");
    const water = await overlayText();
    assert(water.includes("New opportunity: Drink water"), "water opportunity was not labeled as new");
    assert(water.includes("Below 1 litre, the survivor drinks automatically from water at hand."), "water auto-drink rule missing");
    assert(water.includes("Self-care handles it through the activity queue."), "water queue rule missing");
    assert(await layoutOk(), "desktop water transition overflows");
    await shot("water-transition-desktop");

    await finishPresentations();
    await inOpportunities(`
      for (const id of ['site', 'drink', 'firewood', 'fire', 'bed', 'roof', 'keptNight', 'forageMeal', 'cook']) {
        s.opportunities.discoveredAt[id] = s.minute;
        s.opportunities.completedAt[id] = s.minute;
      }
      api.refreshOpportunities(s);
    `);
    await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('New opportunity: Find useful cover')`, "shelter lesson did not open");
    const shelter = await overlayText();
    assert(shelter.includes("Natural cover can break the wind before a built shelter is ready."), "natural-cover guidance missing");
    assert(shelter.includes("Find useful cover"), "natural-cover step missing");
    assert(await layoutOk(), "desktop shelter-opportunity layout overflows");
    await shot("shelter-opportunity-desktop");

    await finishPresentations();
    await inOpportunities(`
      for (const id of ['findUsefulCover', 'makeUsefulShelter', 'testShelter', 'readWeather', 'prepareWeather', 'surviveForecast', 'remoteRefuge', 'fieldFire', 'fieldMeal', 'remoteStorm']) {
        s.opportunities.discoveredAt[id] = s.minute;
        s.opportunities.completedAt[id] = s.minute;
      }
      api.refreshOpportunities(s);
    `);
    await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('New opportunity: Hunt, cook, and eat meat')`, "food-method opportunities did not open");
    const food = await overlayText();
    assert(food.includes("Make a bow"), "hunt equipment step missing");
    assert(food.includes("Make arrows"), "hunt ammunition step missing");
    assert(food.includes("Find fresh animal sign"), "hunt tracking step missing");
    assert(food.includes("Bring meat back to camp"), "hunt recovery step missing");
    assert(food.includes("Eat cooked meat"), "hunt final eating step missing");
    assert(await layoutOk(), "desktop food-opportunity layout overflows");
    await shot("food-opportunities-desktop");

    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert(await layoutOk(), "mobile food-opportunity layout overflows");
    await shot("food-opportunities-mobile");
    await finishPresentations();
    assert(await click('#opportunities [data-act="opportunity-open"]'), "catalog entry missing");
    await waitFor(`Boolean(document.querySelector('#overlay .opportunity-catalog'))`, "catalog did not open");
    assert(await layoutOk(), "mobile catalog layout overflows");
    await shot("catalog-mobile");
    assert(await click('#overlay [data-act="opportunity-close"]'), "catalog close missing");

    ws.close();
    console.log(`Opportunity UX verified in headless Chrome. Screenshots: ${OUT}`);
  } finally {
    chrome.kill();
  }
}

main().then(
  () => process.exit(0),
  (error) => { console.error(error); process.exit(1); },
);
