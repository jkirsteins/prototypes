import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.OPPORTUNITY_UX_URL ?? "http://127.0.0.1:5173/prototypes/08/?seed=30";
const PORT = Number(process.env.OPPORTUNITY_UX_PORT ?? 9446);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/opportunity-ux-shots");
const PROFILE = resolve(tmpdir(), `survidle-opportunity-ux-${PORT}`);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

// Species the run has not perceived. None of their names or keys may appear in
// the catalog while their rows are undiscovered.
const UNSEEN = ["reindeer", "elk", "wolverine", "bear"];

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
    const overlayMarkup = () => evaluate("document.querySelector('#overlay')?.outerHTML ?? ''");
    const panelMarkup = () => evaluate("document.querySelector('#opportunities')?.outerHTML ?? ''");
    const stateValue = (expression) => evaluate(`(() => { const s = window.survidle.state; return ${expression}; })()`);
    // The one development seam: a perception or deed handed to the same
    // production recorder the simulation uses.
    const fire = (event) => evaluate(`window.survidle.opportunityEvent(${JSON.stringify(event)})`);
    const finishPresentations = async () => {
      for (let attempt = 0; attempt < 60; attempt++) {
        await click('#overlay [data-act="opportunity-modal-ok"]');
        await sleep(100);
        if (await evaluate("window.survidle.state.opportunities.notices.length === 0 && !document.querySelector('#overlay:not([hidden]) .opportunity-modal')")) return;
      }
      throw new Error("opportunity presentations did not finish");
    };
    // A control that jumps under the pointer between clicks is the scrolling
    // trap the catalog replaced, so its position is measured, not eyeballed.
    const controlBoxes = () => evaluate(`JSON.stringify([...document.querySelectorAll('#overlay .opportunity-categories button, #overlay .opportunity-pages button, #overlay .opportunity-pages span')].map((node) => {
      const rect = node.getBoundingClientRect();
      return [node.dataset.act ?? "label", node.dataset.category ?? "", Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)];
    }))`);

    await sleep(1800);
    assert(await click('#overlay [data-act="pick-candidate"]'), "candidate control missing");
    assert(await click('#overlay [data-act="land"]'), "land control missing");
    await waitFor(`Boolean(document.querySelector('#overlay [data-act="welcome-close"]'))`, "welcome did not open");
    await click('#overlay [data-act="welcome-close"]');

    // Step 5.1 and 5.2: the authored first opportunity arrives, and the
    // permanent panel carries exactly one leaf.
    await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('New opportunity: Choose where to live')`, "first opportunity did not open");
    assert(await evaluate(`document.querySelector('#overlay .opportunity-modal h1')?.textContent === 'Opportunities'`), "opportunity modal has no global heading");
    assert(await layoutOk(), "desktop first-opportunity layout overflows");
    await finishPresentations();
    await waitFor(`document.querySelector('#opportunities h2')?.textContent === 'Opportunities'`, "current opportunities heading missing");
    assert(await stateValue(`s.opportunities.current === 'site'`), "the authored first opportunity is not current");
    assert(await evaluate(`document.querySelectorAll('#opportunities [data-act="opportunity-detail"]').length === 1`), "panel does not show exactly one leaf");
    assert((await panelMarkup()).includes("Choose where to live"), "panel does not name the current leaf");
    assert(!await evaluate(`Boolean(document.querySelector('#opportunities .bar, #opportunities .opportunity-next, #opportunities .opportunity-value'))`), "pinned opportunity retained progress chrome");
    await shot("current-desktop");

    // Step 5.3: the catalog is a reference, not a moment. The clock keeps
    // running behind it.
    assert(await click('#opportunities [data-act="opportunity-open"]'), "catalog entry missing");
    await waitFor(`Boolean(document.querySelector('#overlay .opportunity-catalog'))`, "catalog did not open");
    const minuteBefore = await stateValue("s.minute");
    await sleep(2500);
    const minuteAfter = await stateValue("s.minute");
    assert(minuteAfter > minuteBefore, `catalog stopped the clock (${minuteBefore} -> ${minuteAfter})`);
    assert(await evaluate(`Boolean(document.querySelector('#overlay .opportunity-catalog'))`), "catalog closed itself while the clock ran");

    // Step 5.4: category and page controls hold their places across clicks.
    assert(await click('#overlay [data-act="opportunity-category"][data-category="wildlife"]'), "wildlife category missing");
    await waitFor(`document.querySelector('#overlay [data-act="opportunity-category"][data-category="wildlife"]')?.getAttribute('aria-pressed') === 'true'`, "wildlife category did not select");
    const boxesAtRest = await controlBoxes();
    assert(await click("#opportunity-next"), "next page control missing");
    assert(await controlBoxes() === boxesAtRest, "paging moved the catalog controls");
    assert(await click('#overlay [data-act="opportunity-category"][data-category="survival"]'), "survival category missing");
    assert(await controlBoxes() === boxesAtRest, "changing category moved the catalog controls");
    assert(await click('#overlay [data-act="opportunity-category"][data-category="wildlife"]'), "wildlife category missing on return");
    assert(await layoutOk(), "desktop catalog layout overflows");
    await shot("catalog-desktop");

    // Step 5.5: an unperceived animal leaks neither its name nor its key,
    // in text or in any attribute.
    const unknownMarkup = await overlayMarkup();
    assert(unknownMarkup.includes("Undiscovered opportunity"), "catalog shows no unknown rows");
    for (const species of ["deer", ...UNSEEN]) {
      assert(!new RegExp(species, "i").test(unknownMarkup), `unknown wildlife row leaked ${species}`);
    }
    assert(!/track:|hunt:|dress:|recover:/.test(unknownMarkup), "unknown wildlife row leaked an internal key");
    assert(await click('#overlay [data-act="opportunity-close"]'), "catalog close missing");

    // Step 6: one complete wildlife chain, driven by perceptions and deeds.
    await fire({ kind: "speciesSeen", species: "deer" });
    await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('Track roe deer')`, "track discovery did not open");
    assert(await evaluate(`document.querySelectorAll('#overlay .opportunity-discovery').length === 1`), "track discovery was not a single discovery");
    assert(await layoutOk(), "desktop discovery modal overflows");
    await shot("discovery-modal");
    assert(await click('#overlay [data-act="opportunity-modal-ok"]'), "discovery OK missing");
    await finishPresentations();
    assert(await evaluate(`document.activeElement === document.querySelector('#opportunities [data-act="opportunity-open"]')`), "dismissal did not return focus to the catalog opener");

    // Step 5.6: a discovered, incomplete leaf becomes current from the catalog.
    assert(await click('#opportunities [data-act="opportunity-open"]'), "catalog entry missing after discovery");
    await waitFor(`Boolean(document.querySelector('#overlay .opportunity-catalog'))`, "catalog did not reopen");
    assert(await evaluate(`document.querySelector('#overlay [data-act="opportunity-category"][data-category="survival"]')?.getAttribute('aria-pressed') === 'true'`), "the catalog did not open on the current leaf's category");
    assert(await click('#overlay [data-act="opportunity-category"][data-category="wildlife"]'), "wildlife category missing after discovery");
    assert(await click('#overlay [data-act="opportunity-detail"][data-opportunity="track:deer"]'), "track detail missing");
    assert((await overlayText()).includes("Not done"), "incomplete detail does not read as not done");
    assert(await click('#overlay [data-act="opportunity-current"][data-opportunity="track:deer"]'), "set-as-current missing");
    assert(await stateValue(`s.opportunities.current === 'track:deer'`), "current did not move to the tracking leaf");
    assert(await click('#overlay [data-act="opportunity-back"]'), "back control missing");
    assert(await click('#overlay [data-act="opportunity-close"]'), "catalog close missing after switching current");
    assert((await panelMarkup()).includes("Track roe deer"), "panel does not follow the new current leaf");

    // Step 5.7: an unpinned discovered leaf still earns credit. The camp and
    // water deeds run while the tracking leaf is the pinned one.
    await fire({ kind: "task", id: "makeCamp" });
    await finishPresentations();
    await fire({ kind: "drank" });
    await finishPresentations();
    assert(await stateValue(`s.opportunities.discoveredAt.firewood !== undefined`), "the firewood leaf was never discovered");
    assert(await stateValue(`s.opportunities.current === 'track:deer'`), "an unpinned completion stole the current leaf");
    const woodBefore = await stateValue("s.opportunities.stepProgress.firewood?.wood ?? 0");
    await fire({ kind: "gathered", item: "firewood", kg: 2 });
    const woodAfter = await stateValue("s.opportunities.stepProgress.firewood?.wood ?? 0");
    assert(woodAfter === woodBefore + 2, `unpinned leaf took no credit (${woodBefore} -> ${woodAfter})`);
    assert(await stateValue(`s.opportunities.current === 'track:deer'`), "crediting an unpinned leaf moved the current leaf");
    await finishPresentations();

    // Step 6 continued: matching sign completes the tracking leaf and offers
    // the hunt in one batch, and a repeated sighting says nothing twice.
    await fire({ kind: "signFound", species: "deer" });
    await waitFor(`document.querySelector('#overlay .opportunity-modal')?.textContent.includes('Hunt roe deer')`, "hunt discovery did not open");
    const chain = await overlayText();
    assert(await evaluate(`document.querySelectorAll('#overlay .opportunity-modal').length === 1`), "the chain opened more than one modal");
    assert(chain.includes("Completed: Track roe deer"), "the completion was not reported with the discovery");
    assert(chain.includes("New opportunity: Hunt roe deer"), "the hunt was not offered as new");
    assert(!chain.includes("Group completed"), "a group completed while unknown children remain");
    assert(await click('#overlay [data-act="opportunity-modal-ok"]'), "chain OK missing");
    await finishPresentations();
    await fire({ kind: "speciesSeen", species: "deer" });
    await sleep(400);
    assert(await stateValue("s.opportunities.notices.length === 0"), "a repeated sighting queued a second notice");
    assert(!await evaluate(`Boolean(document.querySelector('#overlay:not([hidden]) .opportunity-modal'))`), "a repeated sighting reopened the modal");

    // Step 5.8: a completed leaf stays inspectable and offers no way to pin it.
    assert(await click('#opportunities [data-act="opportunity-open"]'), "catalog entry missing before inspecting a completed leaf");
    await waitFor(`Boolean(document.querySelector('#overlay .opportunity-catalog'))`, "catalog did not open for the completed leaf");
    assert(await click('#overlay [data-act="opportunity-category"][data-category="wildlife"]'), "wildlife category missing");
    assert(await click('#overlay [data-act="opportunity-detail"][data-opportunity="track:deer"]'), "completed leaf is not inspectable");
    const completedDetail = await overlayText();
    assert(completedDetail.includes("Done"), "completed detail does not read as done");
    assert(completedDetail.includes("Find fresh roe deer sign"), "completed detail hides its checklist");
    assert(!await evaluate(`Boolean(document.querySelector('#overlay [data-act="opportunity-current"]'))`), "a completed leaf offers to become current");
    assert(await click('#overlay [data-act="opportunity-back"]'), "back control missing after a completed detail");

    // A detail opened wide and left at a narrow breakpoint still returns to
    // the page that holds its row.
    assert(await click('#overlay [data-act="opportunity-detail"][data-opportunity="hunt:deer"]'), "hunt detail missing");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(200);
    assert(await click('#overlay [data-act="opportunity-back"]'), "back control missing at the narrow breakpoint");
    assert(await evaluate(`document.activeElement?.dataset.opportunity === 'hunt:deer'`), "Back lost the row after a breakpoint change");
    assert(await layoutOk(), "mobile catalog layout overflows");
    await shot("catalog-mobile");
    assert(await click('#overlay [data-act="opportunity-close"]'), "catalog close missing on mobile");
    await send("Emulation.clearDeviceMetricsOverride");
    await sleep(200);

    // Step 5.9: the chain's last leaf leaves no current opportunity, and the
    // panel still holds the way in.
    for (const event of [{ kind: "animalKilled", species: "deer" }, { kind: "carcassDressed", species: "deer", carcassId: 1 }, { kind: "carcassRecovered", species: "deer", carcassId: 1 }]) {
      await fire(event);
      await finishPresentations();
    }
    assert(await stateValue("s.opportunities.current === null"), "the finished chain left a current leaf");
    assert((await panelMarkup()).includes("No current opportunity"), "the panel does not report an empty current slot");
    assert(await click('#opportunities [data-act="opportunity-open"]'), "no-current state lost the catalog entry point");
    await waitFor(`Boolean(document.querySelector('#overlay .opportunity-catalog'))`, "catalog did not open from the no-current panel");
    assert(await click('#overlay [data-act="opportunity-close"]'), "catalog close missing in the no-current state");

    // Nothing the run perceived leaked a species it never met.
    const finalMarkup = (await panelMarkup()) + (await overlayMarkup());
    for (const species of UNSEEN) {
      assert(!new RegExp(species, "i").test(finalMarkup), `an unmet species leaked: ${species}`);
    }

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
