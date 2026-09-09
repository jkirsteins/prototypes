/**
 * Captures the deterministic wildlife-startle fixtures through a real browser.
 *
 * Run `npm run dev -- --port 5188` first, then:
 *
 *     STARTLE_SHOTS_URL=http://127.0.0.1:5188/prototypes/08/ node scripts/startle-shots.mjs
 *
 * This is deliberately browser verification rather than a Vitest replacement.
 * It uses the development-only fixture harness, inspects the rendered DOM and
 * computed motion, saves three images, and fails if a tested UI contract does
 * not hold. Audio scheduling is covered by the focused test suite; a browser
 * cannot objectively establish that a sound is aesthetically recognisable.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.STARTLE_SHOTS_URL ?? "http://127.0.0.1:5188/prototypes/08/?seed=1";
const PORT = Number(process.env.STARTLE_SHOTS_PORT ?? 9446);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/startle-shots");
const PROFILE = resolve(tmpdir(), `survidle-startle-shots-${PORT}`);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SCENARIOS = {
  visible: { kind: "visible", seed: 1, subjectId: 1, startCell: 1280781, survivorCell: 1280781, x: 981.2855361919384, y: 711.6359490905888, approachX: 981.2355361919384, approachY: 711.6359490905888 },
  heard: { kind: "heard-only", seed: 7, subjectId: 1, startCell: 901197, survivorCell: 902997, x: 1197.217750588432, y: 501.23735705749135, approachX: 1197.217750588432, approachY: 501.18735705749134 },
  sameArea: { kind: "same-area-remain", seed: 1, subjectId: 1, startCell: 1280781, survivorCell: 1280781, x: 981.7355361919384, y: 711.6359490905888, approachX: 981.6855361919385, approachY: 711.6359490905888 },
  bog: { kind: "bog", seed: 74, subjectId: 1, startCell: 1257438, survivorCell: 1257438, x: 1038.6394973195158, y: 698.3909627243411, approachX: 1038.5894973195159, approachY: 698.3909627243411 },
  snow: { kind: "snow", seed: 1, subjectId: 1, startCell: 1280781, survivorCell: 1280781, x: 981.2855361919384, y: 711.6359490905888, approachX: 981.2355361919384, approachY: 711.6359490905888 },
  blockedEdge: { kind: "blocked-edge", seed: 1, subjectId: 1, startCell: 1280781, survivorCell: 1280781, x: 981.2855361919384, y: 711.6359490905888, approachX: 981.2355361919384, approachY: 711.6359490905888 },
};

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitFor(check, description, ms = 10000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function cdp() {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(URL_BASE)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen) => { ws.onopen = resolveOpen; });
  let id = 0;
  const waiting = new Map();
  const consoleErrors = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails.text ?? "runtime exception");
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "error").join(" "));
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  };
  const send = (method, params = {}) => {
    const messageId = ++id;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolveMessage) => waiting.set(messageId, resolveMessage));
  };
  const evalJs = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.result?.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails));
    return result.result.result.value;
  };
  return { send, evalJs, ws, consoleErrors };
}

async function saveMap(send, evalJs, name) {
  const clip = JSON.parse(await evalJs(`(() => { const r = document.querySelector('#mapdyn .scroll-x').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }); })()`));
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 2 } });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(shot.result.data, "base64"));
}

async function setupAndStep(evalJs, scenario) {
  await evalJs("window.__startleAudioProbe.starts.length = 0");
  await evalJs(`window.survidle.startleSetup(${JSON.stringify(scenario)})`);
  await evalJs("window.survidle.startleStep()");
  await sleep(240);
}

async function installAudioProbe(evalJs) {
  await evalJs(`(() => {
    const probe = window.__startleAudioProbe = { decoded: [], starts: [] };
    const bytesToFile = new WeakMap();
    const bufferToFile = new WeakMap();
    const fetch0 = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetch0(...args);
      const file = String(args[0]);
      if (!file.includes('/audio/startle_')) return response;
      const bytes0 = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        const bytes = await bytes0();
        bytesToFile.set(bytes, file);
        return bytes;
      };
      return response;
    };
    const decode0 = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function(bytes, ...rest) {
      const decoded = decode0.call(this, bytes, ...rest);
      const file = bytesToFile.get(bytes);
      if (!file) return decoded;
      return decoded.then((buffer) => { bufferToFile.set(buffer, file); probe.decoded.push(file); return buffer; });
    };
    const create0 = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function() {
      const context = this;
      const source = create0.call(context);
      const start0 = source.start;
      source.start = function(when = 0, ...rest) {
        probe.starts.push({ file: bufferToFile.get(source.buffer) ?? null, when, currentTime: context.currentTime });
        return start0.call(source, when, ...rest);
      };
      return source;
    };
  })()`);
  await evalJs("document.body.click()");
  await waitFor(async () => Number(await evalJs("window.__startleAudioProbe.decoded.length")) >= 16, "decoded startle audio assets");
}

async function snapshot(evalJs) {
  return evalJs(`(() => {
    const cues = [...document.querySelectorAll('.wildlife-startle')];
    const log = window.survidle.state.log;
    const rect = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const grid = document.querySelector('#mapdyn .grid');
    const viewport = document.querySelector('#mapdyn .scroll-x');
    const gr = grid.getBoundingClientRect();
    const vr = viewport.getBoundingClientRect();
    const intersection = { left: Math.max(gr.left, vr.left), top: Math.max(gr.top, vr.top), right: Math.min(gr.right, vr.right), bottom: Math.min(gr.bottom, vr.bottom) };
    const active = window.survidle.state.wildlife.subjects.find((subject) => subject.id === 1)?.active;
    const cell = active ? active.cell : null;
    const world = window.survidle.world;
    const x = cell === null ? -1 : cell % world.w;
    const y = cell === null ? -1 : Math.floor(cell / world.w);
    const chunk = cell === null ? null : world.chunks.get(Math.floor(y / 64) * 4096 + Math.floor(x / 64));
    const terrain = chunk ? ['water', 'fell', 'rock', 'bog', 'spruce', 'pine', 'birch', 'meadow'][chunk.terrain[(y % 64) * 64 + (x % 64)]] : null;
    const region = chunk ? chunk.region[(y % 64) * 64 + (x % 64)] : null;
    return JSON.stringify({
      cues: cues.map((cue) => ({ cls: cue.className, key: cue.dataset.startle, style: cue.getAttribute('style'), animation: getComputedStyle(cue).animationName, rect: rect(cue), owner: cue.closest('.c')?.dataset.mapCell ?? null })),
      recoil: document.querySelectorAll('.mk-animal.wildlife-recoil').length,
      recoilAnimation: getComputedStyle(document.querySelector('.mk-animal.wildlife-recoil') ?? document.body).animationName,
      animal: document.querySelectorAll('#mapdyn .mk-animal').length,
      identityLeak: /data-wildlife-id|wildlife-(?:0|1|2|3|4|5)/.test(document.querySelector('#mapdyn').innerHTML),
      logCount: log.length,
      logText: log.at(-1)?.text ?? '',
      minute: window.survidle.state.minute,
      escaped: window.survidle.state.wildlife.subjects.find((subject) => subject.id === 1)?.active?.escapeEpisode ?? 0,
      edge: document.querySelectorAll('.wildlife-startle.edge').length,
      zoom: document.querySelector('#mapdyn .maptools .dim')?.textContent ?? '',
      intersection,
      active: { cell, terrain, region, playerRegion: window.survidle.state.player.region },
      audio: window.__startleAudioProbe?.starts.filter((start) => start.file?.includes('/audio/startle_')) ?? [],
    });
  })()`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--window-size=1400,900", "about:blank"]);
  try {
    await waitFor(async () => {
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); return true; } catch { return false; }
    }, "Chrome debug port");
    const { send, evalJs, ws, consoleErrors } = await cdp();
    await send("Runtime.enable");
    await send("Page.enable");
    await waitFor(async () => await evalJs("Boolean(window.survidle?.startleSetup)"), "development fixture harness");
    await installAudioProbe(evalJs);

    await setupAndStep(evalJs, SCENARIOS.visible);
    const visible = JSON.parse(await snapshot(evalJs));
    assert(visible.cues.length === 1 && visible.cues[0].cls.includes("seen"), "visible fixture did not render exactly one seen cue");
    assert(visible.recoil === 1, "visible fixture did not recoil the animal glyph");
    assert(visible.logCount === 1 && visible.logText === "A herd of hoofed animals startles and bounds through the pine.", "visible fixture did not add its single expected log entry");
    assert(visible.audio.some((start) => start.file.includes("startle_contact_")) && visible.audio.some((start) => /startle_hoof_(light|heavy)_forest_/.test(start.file)), "visible fixture did not schedule contact and forest departure audio");
    await saveMap(send, evalJs, "visible");

    await evalJs("document.querySelector('[data-act=zoom][data-dir=out]').click()");
    await sleep(90);
    const zoomed = JSON.parse(await snapshot(evalJs));
    assert(zoomed.zoom !== visible.zoom, "zoom control did not change map scale");
    assert(zoomed.cues.length === 1 && zoomed.cues[0].key === visible.cues[0].key && zoomed.cues[0].style === visible.cues[0].style, "zoom replaced the active cue key or start timestamp");
    assert(zoomed.cues[0].rect.left !== visible.cues[0].rect.left || zoomed.cues[0].rect.top !== visible.cues[0].rect.top, "zoom did not reproject the cue source");
    await evalJs("window.survidle.startleStep()");
    await sleep(90);
    const twice = JSON.parse(await snapshot(evalJs));
    assert(twice.cues.length === 1 && twice.cues[0].key === visible.cues[0].key && twice.cues[0].style === visible.cues[0].style && twice.logCount === 1 && twice.escaped === 1, "a second step replayed the cue, log, or escape episode");

    await setupAndStep(evalJs, SCENARIOS.heard);
    const heard = JSON.parse(await snapshot(evalJs));
    assert(heard.cues.length === 1 && heard.cues[0].cls.includes("heard"), "heard-only fixture did not render exactly one heard cue");
    assert(heard.recoil === 0 && heard.animal === 0 && !heard.identityLeak, "heard-only fixture disclosed an animal glyph or identity");
    assert(heard.logCount === 1 && heard.logText === "Something crashes away through the spruce.", "heard-only fixture did not add its single non-identifying log entry");
    await saveMap(send, evalJs, "heard-only");

    await setupAndStep(evalJs, SCENARIOS.sameArea);
    const sameArea = JSON.parse(await snapshot(evalJs));
    assert(sameArea.cues.length === 0 && sameArea.logCount === 0 && sameArea.recoil === 0 && sameArea.escaped === 0 && sameArea.audio.length === 0, "same-area fixture emitted a cue, log, reaction, or audio");

    await setupAndStep(evalJs, SCENARIOS.bog);
    const bog = JSON.parse(await snapshot(evalJs));
    assert(bog.cues.length === 1 && bog.logCount === 1 && bog.escaped === 1, "bog fixture did not start one live escape");
    assert(bog.audio.some((start) => start.file.includes("startle_hoof_bog_")), "bog fixture did not select the bog departure slot");

    await setupAndStep(evalJs, SCENARIOS.snow);
    const snow = JSON.parse(await snapshot(evalJs));
    assert(snow.cues.length === 1 && snow.logCount === 1, "snow fixture did not start one live escape");
    assert(snow.audio.some((start) => start.file.includes("startle_hoof_snow_")), "snow fixture did not select the snow departure slot");

    await setupAndStep(evalJs, SCENARIOS.blockedEdge);
    const blockedEdge = JSON.parse(await snapshot(evalJs));
    assert(blockedEdge.cues.length === 1 && blockedEdge.logCount === 1 && blockedEdge.active.cell !== null && blockedEdge.active.terrain !== "water" && blockedEdge.active.region === blockedEdge.active.playerRegion, "blocked-edge fixture vanished or crossed into impassable/out-of-region ground");
    assert(blockedEdge.audio.some((start) => start.file.includes("startle_contact_")) && blockedEdge.audio.some((start) => start.file.includes("startle_hoof_")), "blocked-edge fixture did not schedule its live departure audio");

    // A real scroll clips the map while the active source remains in the logical
    // grid. The renderer reprojects it to an edge, not behind the viewport.
    await evalJs(`(() => { const style = document.createElement('style'); style.id = 'startle-clipped-viewport'; style.textContent = '#mapdyn .scroll-x { width: 300px !important; max-width: 300px !important; height: 160px !important; max-height: 160px !important; }'; document.head.append(style); window.survidle.advance(0); const v = document.querySelector('#mapdyn .scroll-x'); v.scrollLeft = 700; v.scrollTop = 400; window.survidle.advance(0); })()`);
    await sleep(120);
    const edge = JSON.parse(await snapshot(evalJs));
    assert(edge.cues.length === 1 && edge.edge === 1, "clipped viewport did not keep one edge cue inside the visible map");
    const edgeRect = edge.cues[0].rect;
    const clipped = edge.intersection;
    assert(edgeRect.left >= clipped.left && edgeRect.top >= clipped.top && edgeRect.right <= clipped.right && edgeRect.bottom <= clipped.bottom, "edge cue escaped the clipped viewport intersection");

    await evalJs(`(() => { document.getElementById('startle-clipped-viewport')?.remove(); window.survidle.advance(0); })()`);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await setupAndStep(evalJs, SCENARIOS.visible);
    const reduced = JSON.parse(await snapshot(evalJs));
    assert(reduced.cues.length === 1 && reduced.cues[0].animation === "wildlife-startle-fade" && reduced.recoilAnimation === "none", "reduced-motion fixture did not use fade without recoil motion");
    await saveMap(send, evalJs, "reduced-motion");

    // The fixture's simulation result is independent of muted playback. The
    // audio engine is configured before a reload so it reads the saved setting.
    await evalJs(`localStorage.setItem('survidle.audio', JSON.stringify({ volume: 0.7, muted: true, ambience: true })); location.reload();`);
    await waitFor(async () => await evalJs("Boolean(window.survidle?.startleSetup)"), "muted reload");
    await installAudioProbe(evalJs);
    await setupAndStep(evalJs, SCENARIOS.visible);
    const muted = JSON.parse(await snapshot(evalJs));
    assert(muted.logText === visible.logText && muted.escaped === visible.escaped, "muting changed the simulation result");

    // Current headless Chrome does not expose Emulation.setPageVisibilityState.
    // This per-document shim nevertheless fires the production listener and
    // makes its own `document.visibilityState` guard take the hidden branch.
    await evalJs(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));`);
    assert(await evalJs("document.visibilityState") === "hidden", "visibility shim did not enter the production hidden branch");
    await evalJs("window.survidle.startleEnd()");
    await setupAndStep(evalJs, SCENARIOS.visible);
    await evalJs(`delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));`);
    await sleep(120);
    const restored = JSON.parse(await snapshot(evalJs));
    assert(restored.logCount === 1 && restored.escaped === 1 && restored.cues.length === 0, "hidden startle changed simulation or replayed on visibility restore");
    assert(consoleErrors.length === 0, `browser console errors: ${consoleErrors.join(" | ")}`);
    writeFileSync(resolve(OUT, "README.md"), [
      "# Wildlife startle browser evidence",
      "",
      "Generated on 2026-09-09 with `scripts/startle-shots.mjs`, Vite's development-only seeded fixture harness, and headless Chrome.",
      "Each screenshot is captured about 240 ms into the 1200 ms effect.",
      "",
      "- [visible](visible.png): one seen marker and a recoiling animal glyph.",
      "- [heard-only](heard-only.png): one marker with no animal glyph or identity.",
      "- [reduced-motion](reduced-motion.png): the same cue under `prefers-reduced-motion: reduce`.",
      "",
      "The script drives all six seeded scenarios. It asserts visible and heard-only disclosure, same-area non-detection, bog and snow audio slot selection, blocked-edge passability, cue timestamp/key survival across zoom and a second step, clipped edge bounds, reduced-motion fade, muted simulation equivalence, visibility suppression, and a console free of exceptions. Browser automation cannot objectively evaluate the subjective recognisability or quality of the rendered sound.",
      "",
    ].join("\n"));
    console.log(JSON.stringify({ visible, heard, sameArea, bog, snow, blockedEdge, edge, reduced, muted, consoleErrors }, null, 2));
    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
