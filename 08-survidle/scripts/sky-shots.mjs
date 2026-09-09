/**
 * Draws the weather widget in every sky it has and saves a PNG of each, so a
 * change to the sky can be looked at rather than argued about - and, unlike
 * the map's shots, checked.
 *
 *     npm run sky            # writes docs/sky-shots/ and the index beside it
 *     npm run sky -- --check # compares against what is committed, and fails
 *     npm run sky -- --keep  # leaves the browser open to poke at
 *
 * It needs a dev server on 127.0.0.1:5173 (npm run dev) and Chrome installed.
 * It drives its own headless Chrome on a debug port rather than the browser
 * you are using, so it cannot disturb a session you have open.
 *
 * What makes --check worth having is that the pictures are reproducible.
 * The page is a pure function of its own table: every card builds a world
 * from one seed, moves the clock to a fixed hour and sets the weather, so
 * nothing here is rolled. The one thing that would move on its own is the
 * animation - drifting cloud, falling snow - and the run asks Chrome to
 * emulate prefers-reduced-motion, which the stylesheet answers by stopping
 * all of it. So a difference in the bytes is a difference somebody made.
 *
 * A difference is not a failure of taste, only a fact: --check tells you
 * WHICH skies changed. Whether the new one is better is yours to say, and
 * you say it by looking at the folder and committing the new pictures.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const pageUrl = new URL(process.env.SKY_URL ?? "http://127.0.0.1:5173/prototypes/08/sky.html");
pageUrl.searchParams.set("still", "1");
const URL_PAGE = pageUrl.toString();
const PORT = Number(process.env.SKY_PORT ?? 9445);
const OUT = resolve(HERE, "../docs/sky-shots");
const PROFILE = resolve(tmpdir(), `survidle-sky-shots-${PORT}`);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const KEEP = process.argv.includes("--keep");
const CHECK = process.argv.includes("--check");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

async function cdp() {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(URL_PAGE)}`, { method: "PUT" })).json();
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

async function main() {
  const before = new Map();
  if (CHECK) {
    if (!existsSync(OUT)) throw new Error(`nothing to check against: ${OUT} does not exist. Run "npm run sky" first and commit what it writes.`);
    for (const f of readdirSync(OUT).filter((f) => f.endsWith(".png"))) before.set(f.replace(/\.png$/, ""), digest(readFileSync(`${OUT}/${f}`)));
  } else {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
  }

  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--force-device-scale-factor=2",
    "--window-size=1400,1200",
    // Byte-for-byte the same picture twice. Without these the same sky came
    // back with a different hash about half the time: the GPU rasterises
    // gradients and subpixel text a little differently run to run, and a
    // check that cries wolf every other run is a check nobody reads.
    "--disable-gpu",
    "--disable-lcd-text",
    "--font-render-hinting=none",
    "--disable-partial-raster",
    "--disable-skia-runtime-opts",
    "--deterministic-mode",
    "about:blank",
  ]);
  chrome.on("error", (e) => { throw e; });
  for (let i = 0; i < 60; i++) {
    try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
  }

  const { send, evalJs, ws } = await cdp();
  // Still pictures of a moving thing: the stylesheet stops the drift and the
  // fall under reduced motion, so the same sky renders the same bytes.
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1200, deviceScaleFactor: 2, mobile: false });
  await sleep(2200);

  const ready = await evalJs(`document.body.getAttribute("data-ready")`);
  if (ready !== "1") throw new Error("the sky page never finished drawing; is the dev server up?");
  // Text drawn before its font arrives is text drawn twice, and the second
  // time is a different picture.
  await evalJs(`document.fonts ? document.fonts.ready.then(() => "ok") : "ok"`);
  // And motion stopped outright rather than asked to stop. The emulated
  // prefers-reduced-motion did not reach the falling snow - the five skies
  // with something coming out of them photographed differently every run -
  // so the run says so itself and leaves nothing to a media query.
  await evalJs(`(() => {
    const s = document.createElement("style");
    s.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }";
    document.head.appendChild(s);
    return "still";
  })()`);
  await sleep(500);

  const cases = await evalJs(`JSON.stringify([...document.querySelectorAll(".skycase")].map((f) => f.dataset.case))`);
  const names = JSON.parse(cases);
  if (!names.length) throw new Error("the sky page drew no cards");

  const changed = [];
  const added = [];
  for (const name of names) {
    // In the page's own coordinates, and captured beyond the viewport: the
    // first run of this scrolled each card into view and read its box before
    // the scroll had settled, so the same sky photographed differently every
    // time and --check called eight of twelve changed when nothing had.
    const box = JSON.parse(await evalJs(`(() => {
      const el = document.querySelector('#wx-${name}');
      const r = el.getBoundingClientRect();
      return JSON.stringify({
        x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY),
        width: Math.round(r.width), height: Math.round(r.height),
      });
    })()`));
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...box, scale: 2 } });
    const buf = Buffer.from(r.result.data, "base64");
    const now = digest(buf);
    if (CHECK) {
      const was = before.get(name);
      if (was === undefined) added.push(name);
      else if (was !== now) changed.push(name);
    } else {
      writeFileSync(`${OUT}/${name}.png`, buf);
    }
    console.log(`${name.padEnd(14)} ${now}${CHECK && before.get(name) === now ? "  same" : CHECK ? "  DIFFERENT" : ""}`);
  }

  const gone = CHECK ? [...before.keys()].filter((n) => !names.includes(n)) : [];

  if (!CHECK) {
    // The index is written from the page's own cards, so the list and the
    // pictures cannot drift apart.
    const notes = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll(".skycase")].map((f) => [f.dataset.case, f.querySelector("[data-sky-note]").textContent.trim()]))`));
    writeFileSync(`${OUT}/README.md`, [
      "# The skies the weather widget draws",
      "",
      "Written by `npm run sky`, from the table in `src/skygallery.ts`. Look at",
      "them; `npm run sky -- --check` says which ones a change has altered.",
      "",
      ...notes.map(([n, note]) => `- **${n}** - ${note}\n\n  ![${n}](${n}.png)\n`),
    ].join("\n"));
  }

  ws.close();
  if (!KEEP) chrome.kill();

  if (CHECK && (changed.length || added.length || gone.length)) {
    if (changed.length) console.log(`\n${changed.length} sky${changed.length === 1 ? "" : "s"} changed: ${changed.join(", ")}`);
    if (added.length) console.log(`${added.length} new: ${added.join(", ")}`);
    if (gone.length) console.log(`${gone.length} no longer drawn: ${gone.join(", ")}`);
    console.log("\nLook at them, and if they are right, run `npm run sky` and commit what it writes.");
    process.exit(1);
  }
  console.log(CHECK ? "\nevery sky is as committed." : `\n${names.length} skies written to docs/sky-shots/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
