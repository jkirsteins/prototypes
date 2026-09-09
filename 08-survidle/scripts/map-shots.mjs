/**
 * Draws the map in every visual condition it has and saves a PNG of each, so a
 * change to the ground's colours can be looked at rather than argued about.
 *
 * These are not tests. Nothing here passes or fails; the output is a folder of
 * images to compare against the last set by eye. What IS a test lives in
 * tests/layout.test.ts, which holds the contracts these pictures illustrate:
 * that the season reaches the grid, that snow beats the season, that the tone
 * steps lose to snow.
 *
 *     npm run shots            # writes docs/map-shots/
 *     npm run shots -- --keep  # leaves the browser open to poke at
 *
 * It needs a dev server on 127.0.0.1:5173 (npm run dev) and Chrome installed.
 * It drives its own headless Chrome on a debug port rather than the browser
 * you are using, so it cannot disturb a session you have open.
 *
 * How the conditions are set matters for reading the output. Season, ground
 * snow and night belong to the grid; falling rain and snow and the light level
 * belong to its viewport. This script pins each one on the same element as the
 * game instead of playing until the calendar reaches it. Each image is a true
 * picture of the stylesheet under that condition, and NOT evidence that the
 * condition is reached correctly - that part is what the layout tests hold.
 * The firelight shot is the same bargain: its rings are placed by hand.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.SHOTS_URL ?? "http://127.0.0.1:5173/prototypes/08/?seed=17";
const PORT = Number(process.env.SHOTS_PORT ?? 9444);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/map-shots");
/** Chrome's own profile, kept out of the folder the pictures are read from. */
const PROFILE = resolve(tmpdir(), `survidle-map-shots-${PORT}`);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const KEEP = process.argv.includes("--keep");

/**
 * Every condition the map draws in: grid classes, viewport weather class, and
 * its note. A new one belongs here and nowhere else: one row writes one PNG.
 */
const CONDITIONS = [
  ["spring", "season-spring", "", "the growing season: the ground's own colours"],
  ["summer", "season-summer", "", "as spring; nothing in the stylesheet separates them yet"],
  ["autumn", "season-autumn", "", "birch gold, the meadow and the bog gone over"],
  ["winter-bare", "season-winter", "", "a winter with no snow down: bare birch, dead grass"],
  ["winter-snow", "season-winter snow", "", "snow on the ground: evergreens hold their green, the birch does not"],
  ["winter-deep", "season-winter snow snow-deep", "", "past DEEP_SNOW_CM: more snow than tree to see"],
  ["night", "season-autumn night", "", "the sheet down: you, camp, the fire and the walk line stay up"],
  ["night-fire", "season-autumn night +fire", "", "firelight over the ground, rings placed by hand"],
  ["rain", "season-autumn", "rain", "falling weather over the ground"],
  ["snowing", "season-winter snow", "snowing", "falling weather over the ground"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp() {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(URL_BASE)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) waiting.get(m.id)(m);
  };
  const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((r) => waiting.set(i, r));
  };
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  return { send, evalJs, ws };
}

const click = (evalJs, sel) =>
  evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'missing'; e.click(); return 'clicked'; })()`);

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--window-size=1400,900",
    "about:blank",
  ]);
  chrome.on("error", (e) => { throw e; });
  for (let i = 0; i < 60; i++) {
    try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
  }

  const { send, evalJs, ws } = await cdp();
  await sleep(2500);

  // Into a run: take the first candidate ashore, then clear whatever the
  // landing opens. The manual has to be named explicitly - a matcher loose
  // enough to catch the welcome's buttons will open it instead.
  await click(evalJs, '#overlay button[data-act="pick-candidate"]');
  await sleep(400);
  await click(evalJs, '#overlay [data-act="land"]');
  await sleep(1500);
  // The manual opens itself on a first run and the game re-opens it faster than
  // a click can close it here. These are pictures of the ground, so the overlay
  // is simply taken out of the way rather than played through - and the check
  // below still refuses to shoot if anything else is over the map.
  await click(evalJs, '[data-act="manual-close"]');
  await sleep(300);
  await evalJs(`(() => { const o = document.querySelector('#overlay'); if (o) o.style.display = 'none'; })()`);
  await sleep(200);
  const covered = await evalJs(`(() => { const m = document.querySelector('#mapdyn .scroll-x'); if (!m) return 'no map'; const r = m.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top && m.contains(top) ? 'clear' : 'covered by ' + (top ? top.className || top.tagName : '?'); })()`);
  if (covered !== "clear") throw new Error(`the map is ${covered}; a panel is over it and the shots would be of that`);

  // The map is rebuilt from the live calendar every frame, so a class set once
  // is gone by the next. Pin both surfaces and their light level instead, and
  // let the game keep running under them.
  await evalJs(`window.__pin = null; window.__weather = ''; window.__bright = null; (function loop() {
    const g = document.querySelector('.grid');
    const viewport = document.querySelector('.scroll-x');
    if (g && viewport && window.__pin) {
      g.className = 'grid ' + window.__pin;
      viewport.classList.toggle('rain', window.__weather === 'rain');
      viewport.classList.toggle('snowing', window.__weather === 'snowing');
      if (window.__bright === null) viewport.style.removeProperty('--bright');
      else viewport.style.setProperty('--bright', window.__bright);
    }
    requestAnimationFrame(loop);
  })();`);

  const box = JSON.parse(await evalJs(`(() => {
    const r = document.querySelector('#mapdyn .scroll-x').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(Math.min(440, r.width)), height: Math.round(Math.min(300, r.height)) });
  })()`));

  for (const [name, spec, weather, note] of CONDITIONS) {
    const fire = spec.includes("+fire");
    await evalJs(`window.__pin = ${JSON.stringify(spec.replace(" +fire", ""))};`);
    await evalJs(`window.__weather = ${JSON.stringify(weather)};`);
    // Night is a light level, so the shot has to set one: full dark for the
    // plain night, and the ember glow the firelight is meant to be read against.
    const night = spec.includes("night");
    await evalJs(`window.__bright = ${night ? (fire ? "'0.25'" : "'0.10'") : "null"};`);
    if (fire) {
      await evalJs(`(() => {
        const grid = document.querySelector('.grid');
        const cells = [...grid.children].filter((e) => e.classList.contains('c'));
        const cols = Number(getComputedStyle(grid).getPropertyValue('--cols'));
        const me = cells.findIndex((e) => e.classList.contains('mk-player'));
        const at = me - 2;
        cells[at]?.classList.add('mk', 'mk-fire', 'lit-0');
        for (const d of [-1, 1, -cols, cols, -cols - 1, cols + 1, -cols + 1, cols - 1]) cells[at + d]?.classList.add('lit-1');
        for (const d of [-2, 2, -2 * cols, 2 * cols, -2 * cols - 2, 2 * cols + 2]) cells[at + d]?.classList.add('lit-2');
        document.querySelector('.scroll-x').style.setProperty('--bright', '0.25');
      })()`);
    }
    await sleep(700);
    const r = await send("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 2 } });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, "base64"));
    console.log(`${name.padEnd(13)} ${note}`);
    if (fire) {
      // The hand-placed rings would ride along into every later shot.
      await evalJs(`(() => { for (const e of document.querySelectorAll('.lit-0, .lit-1, .lit-2')) e.classList.remove('lit-0', 'lit-1', 'lit-2', 'mk-fire'); })()`);
    }
  }

  // The index is written from the same table the shots are, so the list of
  // conditions and the pictures of them cannot drift apart.
  writeFileSync(
    `${OUT}/README.md`,
    [
      "# The map in every condition it draws in",
      "",
      "Regenerate with `npm run dev` in one shell and `npm run shots` in another.",
      "These are pictures to look at, not tests: nothing here passes or fails.",
      "The contracts they illustrate are held by `tests/layout.test.ts`.",
      "",
      "The conditions are set by writing the grid's classes directly rather than",
      "by playing until the calendar says December, so each image is a true",
      "picture of the stylesheet under that condition and not evidence that the",
      "condition is reached correctly. The firelight rings are placed by hand.",
      "",
      ...CONDITIONS.map(([name, spec, weather, note]) => `- **${name}** (\`${spec}${weather ? `; ${weather}` : ""}\`) - ${note}\n\n  ![${name}](${name}.png)`),
      "",
    ].join("\n"),
  );
  console.log(`\n${CONDITIONS.length} shots and a README in docs/map-shots/`);
  ws.close();
  if (!KEEP) {
    chrome.kill();
  } else {
    console.log(`browser left on port ${PORT}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);
