/**
 * The game as played, in a real browser: land, click the board to walk, zoom,
 * let night fall - through real mouse events at real screen coordinates, with
 * every reading taken from the page the player sees and every image a
 * screenshot of it. No fixture worlds, no off-screen markup, no synthetic
 * `.click()` on a glyph: if it is not on the screen it is not checked here.
 *
 * Run `npm run dev` in one shell and `npm run e2e` in another. What it holds
 * the game to:
 *
 * - one click on known ground orders a walk, at the block rung and at 50 m;
 * - while walking at a block rung the board holds still: the view origin
 *   moves only by whole glyphs, and between such moves the glyphs' own
 *   reading changes only where the survivor's sight reaches something new;
 * - the survivor is drawn in the middle glyph throughout;
 * - the board canvas is painted, at every rung and at night;
 * - the page throws nothing.
 *
 * Screenshots land in docs/e2e/. CHROME_PATH names the browser; E2E_URL the
 * dev server.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.E2E_URL ?? "http://127.0.0.1:5173/prototypes/08/";
const PORT = Number(process.env.E2E_PORT ?? 9470);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/e2e");
const PROFILE = mkdtempSync(resolve(tmpdir(), "survidle-e2e-"));
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SEED = process.env.E2E_SEED ?? "42";
const DAY = process.env.E2E_DAY ?? "200";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };

async function cdp(url) {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) waiting.get(message.id)(message);
    else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? "exception");
    else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) => {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((r) => waiting.set(callId, r));
  };
  const evalJs = async (expression) => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result.result.value;
  };
  await send("Runtime.enable");
  return { send, evalJs, errors };
}

async function waitFor(evalJs, expression, what, tries = 480, gap = 250) {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`Boolean(${expression})`)) return;
    await sleep(gap);
  }
  throw new Error(`${what} did not happen`);
}

/** A real click: the pointer moves there, presses and releases. */
async function clickAt(send, x, y) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(30);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function clickSelector(send, evalJs, selector) {
  const box = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!box) throw new Error(`nothing on the page matches ${selector}`);
  await clickAt(send, box.x, box.y);
}

async function dismissModals(send, evalJs) {
  const doors = ["[data-act=welcome-close]", "[data-act=teach-close]", "[data-act=opportunity-modal-ok]", "[data-act=recognition-close]", "[data-act=goal-close]"];
  for (let round = 0; round < 8; round++) {
    let closed = false;
    for (const door of doors) {
      if (await evalJs(`Boolean(document.querySelector(${JSON.stringify(door)}))`)) {
        await clickSelector(send, evalJs, door);
        await sleep(150);
        closed = true;
      }
    }
    if (!closed) return;
  }
}

/** The board as the page holds it: the model the canvas drew, plus where the grid sits on screen. */
const READ_BOARD = `(() => {
  const m = window.survidle.mapModel;
  const grid = document.querySelector('#mapdyn .grid');
  const r = grid.getBoundingClientRect();
  const player = m.glyphs.findIndex((g) => g.classes.includes('mk-player'));
  const v = document.querySelector('#mapdyn .scroll-x').getBoundingClientRect();
  return {
    viewport: { x: v.left, y: v.top, w: v.width, h: v.height },
    x0: m.x0, y0: m.y0, z: m.z, cols: m.cols, rows: m.rows, px: m.px, line: m.line, night: m.night,
    grid: { x: r.left, y: r.top, w: r.width, h: r.height },
    player: player < 0 ? null : { gx: player % m.cols, gy: Math.floor(player / m.cols) },
    tokens: m.glyphs.map((g) => g.classes.join(' ') + g.glyph),
    cells: m.glyphs.map((g) => g.mapCell),
    route: window.survidle.state.route ? { target: window.survidle.state.route.target, ahead: window.survidle.state.route.path.length } : null,
    here: window.survidle.state.player.region,
  };
})()`;

/** How much of the map canvas is painted anything but the board's own dark: a picture, or a blank. */
const READ_PAINT = `(() => {
  const c = document.querySelector('#effects');
  if (!c || !c.width) return { painted: 0, of: 0 };
  const ctx = c.getContext('2d');
  const step = Math.max(1, Math.floor(c.width / 200));
  let painted = 0, of = 0;
  for (let y = 0; y < c.height; y += step) {
    const row = ctx.getImageData(0, y, c.width, 1).data;
    // The grid's own background is #05070c, which sums to 24; anything a glyph paints is brighter than that.
    for (let x = 0; x < c.width; x += step) { of++; if (row[x * 4] + row[x * 4 + 1] + row[x * 4 + 2] > 30) painted++; }
  }
  return { painted, of };
})()`;

function mapShot(send, board) {
  return send("Page.captureScreenshot", { format: "png", clip: { x: board.grid.x - 8, y: board.grid.y - 8, width: board.grid.w + 16, height: board.grid.h + 16, scale: 2 } });
}

async function saveShot(send, board, name) {
  const image = await mapShot(send, board);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(image.result.data, "base64"));
}

/**
 * The survivor's glyph, on screen, sits in the middle third of the panel
 * that shows the board - whatever the panel's height clips off the board.
 * A survivor drawn at the panel's bottom edge, or under it, is a survivor
 * the player cannot see walking.
 */
function checkVisibleMiddle(board, label) {
  if (!board.player) return;
  const py = board.grid.y + (board.player.gy + 0.5) * board.line;
  const px = board.grid.x + (board.player.gx + 0.5) * board.px;
  const { viewport } = board;
  const inMiddle = py > viewport.y + viewport.h / 3 && py < viewport.y + viewport.h * 2 / 3 && px > viewport.x + viewport.w / 3 && px < viewport.x + viewport.w * 2 / 3;
  check(inMiddle, `${label}: the survivor is drawn at ${Math.round(px - viewport.x)},${Math.round(py - viewport.y)} in a ${Math.round(viewport.w)}x${Math.round(viewport.h)} panel, not in its middle third`);
}

/**
 * A glyph of known, dry ground a few glyphs from the survivor, in their own
 * region, as a screen point to click. Several are returned nearest first,
 * since a block of known ground can still hold no route the sim will take.
 */
function walkTargets(board, minGlyphs, maxGlyphs) {
  const out = [];
  const { player } = board;
  for (let i = 0; i < board.tokens.length; i++) {
    const t = board.tokens[i];
    if (board.cells[i] === null) continue;
    if (/\b(fog|void|far|t-water|mk|dim)\b/.test(t) || !/\bcur\b/.test(t)) continue;
    const gx = i % board.cols;
    const gy = Math.floor(i / board.cols);
    const d = Math.hypot(gx - player.gx, gy - player.gy);
    if (d < minGlyphs || d > maxGlyphs) continue;
    const x = board.grid.x + (gx + 0.5) * board.px;
    const y = board.grid.y + (gy + 0.5) * board.line;
    // Only ground the player can see: a glyph the panel clips off is not there to click.
    const { viewport } = board;
    if (x < viewport.x + 2 || x > viewport.x + viewport.w - 2 || y < viewport.y + 2 || y > viewport.y + viewport.h - 2) continue;
    out.push({ gx, gy, d, x, y });
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Clicks known ground until a walk starts, counting the clicks it took. One is the answer. */
async function orderWalk(send, evalJs, label) {
  const board = await evalJs(READ_BOARD);
  check(board.player !== null, `${label}: the survivor is not drawn`);
  const targets = walkTargets(board, 3, 7);
  check(targets.length > 0, `${label}: no known ground within seven glyphs to walk to`);
  for (const [n, target] of targets.slice(0, 6).entries()) {
    await clickAt(send, target.x, target.y);
    await sleep(350);
    const after = await evalJs(READ_BOARD);
    if (after.route) {
      console.log(`${label}: walk ordered by one click on glyph ${target.gx},${target.gy} (candidate ${n + 1}); ${after.route.ahead} patches ahead`);
      return { board, target, tries: n + 1 };
    }
    const reading = await evalJs(`JSON.stringify(window.survidle.clickReading ? window.survidle.clickReading(${target.x}, ${target.y}) : null)`);
    console.log(`${label}: click on glyph ${target.gx},${target.gy} (${board.tokens[target.gy * board.cols + target.gx]}) started no walk; the page reads it as ${reading}`);
  }
  check(false, `${label}: six clicks on known ground and no walk started`);
  return null;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-sandbox", "--window-size=1440,900", "about:blank"]);
  try {
    let chromeError;
    chrome.on("error", (error) => { chromeError = error; });
    for (let i = 0; i < 80; i++) {
      if (chromeError) throw chromeError;
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
    }
    if (chromeError) throw chromeError;
    const { send, evalJs, errors } = await cdp("about:blank");
    await send("Page.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.startupCheck = { covered: 0, partial: 0 };
      function checkStartupFrame() {
        const app = document.getElementById('app');
        const loading = document.getElementById('loading');
        if (app && loading) {
          if (!loading.hidden) window.startupCheck.covered++;
          if (getComputedStyle(app).visibility === 'visible' &&
              (!document.getElementById('stocks')?.textContent.trim() ||
               !document.getElementById('stats')?.textContent.trim() ||
               !document.querySelector('#mapdyn .grid'))) window.startupCheck.partial++;
        }
        if (!window.survidle) requestAnimationFrame(checkStartupFrame);
      }
      requestAnimationFrame(checkStartupFrame);
    ` });
    await send("Page.navigate", { url: `${URL_BASE}?seed=${SEED}&day=${DAY}` });
    await send("Page.bringToFront");
    await waitFor(evalJs, "window.survidle && document.querySelector('[data-act=pick-candidate]')", "the landing");
    const startup = await evalJs("window.startupCheck");
    check(startup.covered > 0, "startup displayed a loading screen before the game was ready");
    check(startup.partial === 0, `startup exposed ${startup.partial} partially initialized frames`);
    await clickSelector(send, evalJs, "[data-act=pick-candidate]");
    await sleep(200);
    await clickSelector(send, evalJs, "[data-act=land]");
    await waitFor(evalJs, "document.querySelector('[data-act=welcome-close]')", "the welcome");
    await dismissModals(send, evalJs);
    await sleep(1500);
    await dismissModals(send, evalJs);

    // The board as it opens: the block rung, the survivor in the middle.
    let board = await evalJs(READ_BOARD);
    check(board.z > 1, `the map opens at a block rung, not ${board.z} patches per glyph`);
    check(board.player && Math.abs(board.player.gx - Math.floor(board.cols / 2)) <= 1 && Math.abs(board.player.gy - Math.floor(board.rows / 2)) <= 1, `the survivor opens in the middle glyph, not ${JSON.stringify(board.player)} of ${board.cols}x${board.rows}`);
    checkVisibleMiddle(board, "opening");
    let paint = await evalJs(READ_PAINT);
    check(paint.painted > paint.of * 0.2, `the board is painted at the block rung (${paint.painted} of ${paint.of} samples)`);
    await saveShot(send, board, `300m-opening`);
    console.log("300m effects draw:", await evalJs("window.survidle.effectsBench?.(200)"));

    // One click walks, and the board holds still while the survivor crosses a block.
    const walk = await orderWalk(send, evalJs, "300 m");
    if (walk) {
      const samples = [];
      for (let i = 0; i < 32; i++) {
        samples.push(await evalJs(READ_BOARD));
        if (i === 6 || i === 18) await saveShot(send, samples[i], `300m-walking-${i}`);
        await sleep(250);
      }
      const z = samples[0].z;
      let originMoves = 0;
      let churnMax = 0;
      const churns = [];
      const churnBy = new Map();
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        if (a.x0 !== b.x0 || a.y0 !== b.y0) {
          originMoves++;
          check((b.x0 - a.x0) % z === 0 && (b.y0 - a.y0) % z === 0, `300 m: the view origin moved ${b.x0 - a.x0},${b.y0 - a.y0}, not whole glyphs of ${z}`);
          continue;
        }
        let changed = 0;
        for (let g = 0; g < a.tokens.length; g++) {
          if (a.tokens[g] === b.tokens[g]) continue;
          changed++;
          const was = new Set(a.tokens[g].split(" "));
          const now = new Set(b.tokens[g].split(" "));
          for (const t of was) if (!now.has(t)) churnBy.set(`-${t}`, (churnBy.get(`-${t}`) ?? 0) + 1);
          for (const t of now) if (!was.has(t)) churnBy.set(`+${t}`, (churnBy.get(`+${t}`) ?? 0) + 1);
        }
        const churn = changed / a.tokens.length;
        churns.push(churn);
        churnMax = Math.max(churnMax, churn);
        check(b.player && Math.abs(b.player.gx - Math.floor(b.cols / 2)) <= 1 && Math.abs(b.player.gy - Math.floor(b.rows / 2)) <= 1, `300 m: the survivor left the middle glyph while walking: ${JSON.stringify(b.player)}`);
      }
      const walked = samples[samples.length - 1].route === null || samples[samples.length - 1].route.ahead < samples[0].route.ahead;
      check(walked, "300 m: the walk did not advance in eight seconds");
      // A step of sight reveals a few glyphs and crossing into another region
      // re-washes that region once; a board re-cut round the survivor changed
      // most glyphs at every step. So the measure is the ordinary step, not
      // the biggest one: the median step and how many steps are large.
      const sorted = [...churns].sort((p, q) => p - q);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const large = churns.filter((c) => c > 0.05).length;
      check(median <= 0.01, `300 m: between origin moves the board re-read a median ${(median * 100).toFixed(1)}% of its glyphs per step - it should hold still`);
      check(large <= 2, `300 m: ${large} of ${churns.length} steps re-read more than 5% of the board`);
      console.log(`300 m: ${samples.length} samples, origin moved ${originMoves} times, glyph churn between moves max ${(churnMax * 100).toFixed(2)}%, walk ahead ${samples[0].route?.ahead} -> ${samples[samples.length - 1].route?.ahead ?? "arrived"}`);
      console.log(`300 m: what changed between same-origin samples: ${[...churnBy.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12).map(([t, n]) => `${t} x${n}`).join(", ")}`);
    }

    // Closer: two clicks on the corner's plus, then the same one-click walk at 50 m.
    // The buttons sit over the board, and a click on one is never a walk order.
    const ordersBefore = await evalJs("JSON.stringify(window.survidle.state.regions[window.survidle.state.player.region]?.orders.map((o) => o.id))");
    const routeBefore = await evalJs("JSON.stringify(window.survidle.state.route?.target ?? null)");
    await clickSelector(send, evalJs, ".maptools [data-act=zoom][data-dir=in]");
    await sleep(300);
    await clickSelector(send, evalJs, ".maptools [data-act=zoom][data-dir=in]");
    await sleep(600);
    board = await evalJs(READ_BOARD);
    check(board.z === 1, `two zooms in reach 50 m per glyph, not ${board.z} patches`);
    check(await evalJs("JSON.stringify(window.survidle.state.regions[window.survidle.state.player.region]?.orders.map((o) => o.id))") === ordersBefore, "a click on the zoom button ordered a walk");
    check(await evalJs("JSON.stringify(window.survidle.state.route?.target ?? null)") === routeBefore, "a click on the zoom button changed the walk");
    paint = await evalJs(READ_PAINT);
    check(paint.painted > paint.of * 0.2, `the board is painted at 50 m (${paint.painted} of ${paint.of} samples)`);
    await saveShot(send, board, `50m`);
    const fine = await orderWalk(send, evalJs, "50 m");
    if (fine) {
      await sleep(2500);
      const later = await evalJs(READ_BOARD);
      await saveShot(send, later, `50m-walking`);
      check(later.player && Math.abs(later.player.gx - Math.floor(later.cols / 2)) <= 1, `50 m: the survivor left the middle glyph while walking: ${JSON.stringify(later.player)}`);
    }

    // A survey, and the page must keep answering while it runs. The Do
    // panel judges the survey row on every render tick, and a judgement that
    // routed to every shore of the region froze the page with the task's
    // countdown stuck the moment a survey was ordered.
    await evalJs("(() => { const b = [...document.querySelectorAll('button')].find((b) => /Explore|Survey/.test(b.textContent) && b.dataset.act); b?.click(); })()");
    await sleep(400);
    const surveyed = await evalJs("(() => { const b = [...document.querySelectorAll('#doitems button')].find((b) => b.dataset.id === 'explore'); if (!b) return null; b.click(); return b.dataset.arg ?? ''; })()");
    check(surveyed !== null, "the Do panel offers a survey to order");
    if (surveyed !== null) {
      const surveyStart = Date.now();
      let worstMs = 0;
      let stalled = false;
      while (Date.now() - surveyStart < 20000) {
        const t0 = Date.now();
        const answer = await Promise.race([evalJs("window.survidle.state.task?.id ?? null"), sleep(4000).then(() => "stall")]);
        if (answer === "stall") { stalled = true; break; }
        worstMs = Math.max(worstMs, Date.now() - t0);
        if (answer === null) break;
        await dismissModals(send, evalJs);
        await sleep(250);
      }
      check(!stalled, "surveying: the page stopped answering for four seconds");
      if (!stalled) console.log(`surveying: the page answered every probe over ${Math.round((Date.now() - surveyStart) / 1000)} s, the slowest in ${worstMs} ms`);
    }

    // The whole world, then night at the block rung.
    for (let i = 0; i < 5; i++) {
      const more = await evalJs(`Boolean(document.querySelector('.maptools [data-act=zoom][data-dir=out]:not([disabled])'))`);
      if (!more) break;
      await clickSelector(send, evalJs, ".maptools [data-act=zoom][data-dir=out]");
      await sleep(400);
    }
    board = await evalJs(READ_BOARD);
    paint = await evalJs(READ_PAINT);
    check(paint.painted > paint.of * 0.1, `the board is painted at the whole-world rung (${paint.painted} of ${paint.of} samples)`);
    await saveShot(send, board, `world`);
    for (let i = 0; i < 3; i++) {
      await clickSelector(send, evalJs, ".maptools [data-act=zoom][data-dir=in]");
      await sleep(300);
    }
    for (let hours = 0; hours < 24; hours++) {
      if ((await evalJs(READ_BOARD)).night) break;
      await evalJs("window.survidle.advance(60)");
      await sleep(120);
    }
    board = await evalJs(READ_BOARD);
    check(board.night, "a day of advancing reaches night");
    await sleep(600);
    paint = await evalJs(READ_PAINT);
    check(paint.painted > paint.of * 0.05, `the board is painted at night (${paint.painted} of ${paint.of} samples)`);
    await saveShot(send, board, `300m-night`);

    check(errors.length === 0, `the page threw: ${errors.slice(0, 3).join(" | ")}`);
    writeFileSync(`${OUT}/README.md`, [
      "# The game as played",
      "",
      `Real browser, real clicks, seed ${SEED} from day ${DAY}; regenerated by \`npm run e2e\` against \`npm run dev\`.`,
      "Every image is a screenshot of the page as the player sees it.",
      "",
      "![opening at 300 m](300m-opening.png)",
      "",
      "![walking at 300 m](300m-walking-6.png)",
      "",
      "![walking at 300 m, later](300m-walking-18.png)",
      "",
      "![50 m](50m.png)",
      "",
      "![walking at 50 m](50m-walking.png)",
      "",
      "![the whole world](world.png)",
      "",
      "![night at 300 m](300m-night.png)",
      "",
    ].join("\n"));
  } finally {
    const gone = new Promise((r) => chrome.once("exit", r));
    chrome.kill();
    await Promise.race([gone, sleep(3000)]);
    rmSync(PROFILE, { recursive: true, force: true, maxRetries: 3 });
  }
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("e2e: every check held");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
