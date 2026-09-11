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
const NATURAL_URL = new URL("?seed=19", URL_BASE).href;
const NATURAL_CALM_URL = new URL("?seed=3", URL_BASE).href;
const NATURAL_HEARD_URL = new URL("?seed=9&day=328", URL_BASE).href;
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

async function dismissOpportunities(evalJs) {
  await waitFor(async () => Boolean(await evalJs("document.querySelector('#overlay:not([hidden]) [data-act=opportunity-modal-ok]')")), "initial opportunities");
  await waitFor(async () => {
    await evalJs("document.querySelector('#overlay:not([hidden]) [data-act=opportunity-modal-ok]')?.click()");
    return await evalJs("window.survidle.state.opportunities.notices.length === 0 && !document.querySelector('#overlay:not([hidden]) .opportunity-modal')");
  }, "all initial opportunity batches");
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
      cues: cues.map((cue) => ({ cls: cue.className, key: cue.dataset.startle, start: cue.style.getPropertyValue('--wildlife-start'), style: cue.getAttribute('style'), animation: getComputedStyle(cue).animationName, rect: rect(cue), owner: cue.closest('.c')?.dataset.mapCell ?? null })),
      recoil: document.querySelectorAll('.mk-animal.wildlife-recoil').length,
      animalRect: document.querySelector('.mk-animal.wildlife-recoil') ? rect(document.querySelector('.mk-animal.wildlife-recoil')) : null,
      recoilAnimation: getComputedStyle(document.querySelector('.mk-animal.wildlife-recoil') ?? document.body).animationName,
      animal: document.querySelectorAll('#mapdyn .mk-animal').length,
      identityLeak: /data-wildlife-id|wildlife-(?:0|1|2|3|4|5)/.test(document.querySelector('#mapdyn').innerHTML),
      logCount: log.length,
      logText: log.at(-1)?.text ?? '',
      minute: window.survidle.state.minute + window.survidle.state.advanceCarry,
      escaped: window.survidle.state.wildlife.subjects.find((subject) => subject.id === 1)?.active?.escapeEpisode ?? 0,
      edge: document.querySelectorAll('.wildlife-startle.edge').length,
      zoom: document.querySelector('#mapdyn .maptools .dim')?.textContent ?? '',
      intersection,
      active: { cell, terrain, region, playerRegion: window.survidle.state.player.region },
      position: active?.position ?? null,
      travel: active?.travel ?? null,
      escapeRemainingM: active?.escapeRemainingM ?? null,
      audio: window.__startleAudioProbe?.starts.filter((start) => start.file?.includes('/audio/startle_')) ?? [],
    });
  })()`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSeenAnchor(snapshot) {
  const cue = snapshot.cues[0]?.rect;
  const animal = snapshot.animalRect;
  assert(cue && animal, "seen fixture is missing its cue or animal glyph");
  // The animal can still be shaking by up to 2px during the recoil.
  assert(Math.abs((cue.left + cue.right) / 2 - (animal.left + animal.right) / 2) <= 3,
    "seen cue is not horizontally anchored to its rendered animal");
  assert(cue.bottom <= animal.top + 1, "seen cue overlaps its animal instead of sitting above it");
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
    assertSeenAnchor(visible);
    assert(visible.logCount === 1 && visible.logText === "A wild reindeer herd startles and bounds through the pine.", `visible fixture log mismatch: ${JSON.stringify({ count: visible.logCount, text: visible.logText })}`);
    assert(visible.audio.some((start) => start.file.includes("startle_contact_")) && visible.audio.some((start) => /startle_hoof_(light|heavy)_forest_/.test(start.file)), "visible fixture did not schedule contact and forest departure audio");
    await saveMap(send, evalJs, "visible");

    await evalJs("document.querySelector('[data-act=zoom][data-dir=out]').click()");
    await sleep(90);
    const zoomed = JSON.parse(await snapshot(evalJs));
    assert(zoomed.zoom !== visible.zoom, "zoom control did not change map scale");
    assert(zoomed.cues.length === 1 && zoomed.cues[0].key === visible.cues[0].key && zoomed.cues[0].start === visible.cues[0].start, "zoom replaced the active cue key or start timestamp");
    assert(zoomed.cues[0].rect.left !== visible.cues[0].rect.left || zoomed.cues[0].rect.top !== visible.cues[0].rect.top, "zoom did not reproject the cue source");
    await evalJs("window.survidle.startleStep()");
    await sleep(90);
    const twice = JSON.parse(await snapshot(evalJs));
    assert(twice.cues.length === 1 && twice.cues[0].key === visible.cues[0].key && twice.cues[0].start === visible.cues[0].start && twice.logCount === 1 && twice.escaped === 1, "a second step replayed the cue, log, or escape episode");

    for (const zoom of [1, 0]) {
      await setupAndStep(evalJs, SCENARIOS.visible);
      await evalJs(`(() => { for (let i = 2; i > ${zoom}; i--) document.querySelector('[data-act=zoom][data-dir=in]').click(); })()`);
      await sleep(90);
      assertSeenAnchor(JSON.parse(await snapshot(evalJs)));
    }

    // Continuous travel is simulation state, not a cosmetic slot animation.
    // The same grid-level glyph survives exact movement and a cell crossing.
    await setupAndStep(evalJs, SCENARIOS.visible);
    const motionStart = JSON.parse(await snapshot(evalJs));
    assert(motionStart.travel?.destination, "startled animal has no scheduled first segment");
    const motionTrace = [{ minute: motionStart.minute, position: motionStart.position, escapeRemainingM: motionStart.escapeRemainingM }];
    await evalJs(`document.querySelector('[data-wildlife-id="1"]').__wildlifeMotionProbe = true; window.survidle.startleAdvance(0.25)`);
    await sleep(60);
    const motionMid = JSON.parse(await snapshot(evalJs));
    motionTrace.push({ minute: motionMid.minute, position: motionMid.position, escapeRemainingM: motionMid.escapeRemainingM });
    const movedM = Math.hypot(motionMid.position.xM - motionStart.position.xM, motionMid.position.yM - motionStart.position.yM);
    assert(movedM > 100 && movedM < 120, `quarter-minute reindeer escape moved ${movedM.toFixed(2)} m instead of gait-scaled distance`);
    assert(Math.abs((motionStart.escapeRemainingM - motionMid.escapeRemainingM) - movedM) < 0.01, "escape budget did not match distance actually travelled");
    assert(await evalJs(`document.querySelector('[data-wildlife-id="1"]')?.__wildlifeMotionProbe === true`), "exact movement replaced the animal DOM node");
    await saveMap(send, evalJs, "visible-mid-travel");

    // Trace fixed simulation-motion samples until the animal crosses a cell.
    // A sample can turn at a waypoint, so the spent escape budget is the exact
    // gait-distance assertion while the endpoint chord is only an upper bound.
    const speedMPerMinute = 28 * 1000 / 60;
    for (let i = 0; i < 40; i++) {
      if (JSON.parse(await snapshot(evalJs)).active.cell !== motionStart.active.cell) break;
      await evalJs("window.survidle.startleAdvance(0.05)");
      const sample = JSON.parse(await snapshot(evalJs));
      motionTrace.push({ minute: sample.minute, position: sample.position, escapeRemainingM: sample.escapeRemainingM });
    }
    await sleep(60);
    const crossed = JSON.parse(await snapshot(evalJs));
    for (let i = 1; i < motionTrace.length; i++) {
      const previous = motionTrace[i - 1];
      const current = motionTrace[i];
      const stepM = Math.hypot(current.position.xM - previous.position.xM, current.position.yM - previous.position.yM);
      const elapsed = current.minute - previous.minute;
      const spentM = previous.escapeRemainingM - current.escapeRemainingM;
      const expectedM = Math.min(previous.escapeRemainingM, speedMPerMinute * elapsed);
      assert(Math.abs(spentM - expectedM) < 0.01, `motion sample ${i} did not spend its gait-scaled escape budget`);
      assert(stepM > 0 && stepM <= spentM + 0.01, `motion sample ${i} did not advance along its scheduled route`);
    }
    assert(crossed.active.cell !== motionStart.active.cell, "continuous escape did not cross an adjacent cell boundary");
    assert(await evalJs(`document.querySelector('[data-wildlife-id="1"]')?.__wildlifeMotionProbe === true`), "cell crossing replaced the animal DOM node");
    await saveMap(send, evalJs, "visible-cell-crossing");

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

    // A separate pass uses only the shipped landing flow and a natural seed.
    await evalJs("localStorage.removeItem('survidle.save'); localStorage.removeItem('survidle.audio')");
    await send("Page.navigate", { url: NATURAL_URL });
    await sleep(500);
    await waitFor(async () => Boolean(await evalJs("document.querySelector('[data-act=land]')")), "seed 19 landing screen");
    await evalJs("document.querySelector('[data-act=land]').click()");
    await waitFor(async () => Boolean(await evalJs("document.querySelector('[data-act=welcome-close]')")), "seed 19 welcome");
    await evalJs("document.querySelector('[data-act=welcome-close]').click()");
    await dismissOpportunities(evalJs);
    await waitFor(async () => Boolean(await evalJs("document.querySelector('#mapdyn [data-wildlife-id]')")), "seed 19 natural deer");
    const naturalInitial = JSON.parse(await evalJs(`(() => { const animal = document.querySelector('#mapdyn [data-wildlife-id]'); const r = animal.getBoundingClientRect(); return JSON.stringify({ id: Number(animal.dataset.wildlifeId), x: r.left + r.width / 2, y: r.top + r.height / 2, cell: Number(animal.dataset.mapCell), minute: window.survidle.state.minute }); })()`));
    await saveMap(send, evalJs, "natural-seed-19-initial");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: naturalInitial.x, y: naturalInitial.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: naturalInitial.x, y: naturalInitial.y, button: "left", clickCount: 1 });
    await waitFor(async () => await evalJs("window.survidle.state.task?.id === 'walk'"), "seed 19 walk order");
    await waitFor(async () => await evalJs(`window.survidle.state.wildlife.subjects.find(s => s.id === ${naturalInitial.id})?.active?.escapeEpisode > 0 && Boolean(document.querySelector('.wildlife-startle'))`), "seed 19 natural startle", 15000);
    const natural = JSON.parse(await snapshot(evalJs));
    assert(natural.logCount > 0 && /startles|crashes away/.test(natural.logText), "seed 19 natural approach had no legible departure log");
    await saveMap(send, evalJs, "natural-seed-19-startle");

    // Seed 9 on 25 November is naturally dark enough that nearby wildlife can
    // be heard without being rendered. The day query is the existing start-day
    // test aid; generation, landing, walking, detection, and presentation are
    // otherwise the normal game flow.
    await evalJs("localStorage.removeItem('survidle.save'); localStorage.removeItem('survidle.audio')");
    await send("Page.navigate", { url: NATURAL_HEARD_URL });
    await sleep(500);
    await waitFor(async () => Boolean(await evalJs("document.querySelector('[data-act=land]')")), "seed 9 landing screen");
    await evalJs("document.querySelector('[data-act=land]').click()");
    await waitFor(async () => Boolean(await evalJs("document.querySelector('[data-act=welcome-close]')")), "seed 9 welcome");
    await evalJs("document.querySelector('[data-act=welcome-close]').click()");
    await dismissOpportunities(evalJs);
    await waitFor(async () => Boolean(await evalJs("document.querySelector('#mapdyn .mk-player')")), "seed 9 map");
    await waitFor(async () => Number(await evalJs("window.survidle.state.minute")) >= 1, "seed 9 08:01 approach time");
    assert(Number(await evalJs("document.querySelectorAll('#mapdyn .mk-animal').length")) === 0, "seed 9 exposed an animal before the heard-only walk");
    const heardTarget = JSON.parse(await evalJs(`(() => {
      const player = document.querySelector('#mapdyn .mk-player');
      const targetCell = Number(player.dataset.mapCell) + 1;
      const target = document.querySelector('#mapdyn [data-map-cell="' + targetCell + '"]');
      const r = target.getBoundingClientRect();
      return JSON.stringify({ cell: targetCell, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: heardTarget.x, y: heardTarget.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: heardTarget.x, y: heardTarget.y, button: "left", clickCount: 1 });
    await waitFor(async () => await evalJs("window.survidle.state.task?.id === 'walk'"), "seed 9 walk order");
    await waitFor(async () => Boolean(await evalJs("document.querySelector('.wildlife-startle.heard')")), "seed 9 natural heard-only startle", 15000);
    const naturalHeard = JSON.parse(await snapshot(evalJs));
    assert(naturalHeard.cues.length === 1 && naturalHeard.cues[0].cls.includes("heard") && naturalHeard.animal === 0 && !naturalHeard.identityLeak,
      "seed 9 natural heard-only event disclosed an animal or missed its cue");
    assert(naturalHeard.logText === "Hooves crash away through the pine to the east.", "seed 9 natural heard-only log changed");
    await saveMap(send, evalJs, "natural-seed-9-heard");

    // Seed 3 supplies the other side of the natural behavior: a visible deer
    // completes ordinary travel while the survivor stands still, without a
    // fixture, alarm, startle cue, or departure log.
    await evalJs("localStorage.removeItem('survidle.save'); localStorage.removeItem('survidle.audio')");
    await send("Page.navigate", { url: NATURAL_CALM_URL });
    await sleep(500);
    await waitFor(async () => Boolean(await evalJs("document.querySelector('[data-act=land]')")), "seed 3 landing screen");
    await evalJs("document.querySelector('[data-act=land]').click()");
    await waitFor(async () => Boolean(await evalJs("document.querySelector('[data-act=welcome-close]')")), "seed 3 welcome");
    await evalJs("document.querySelector('[data-act=welcome-close]').click()");
    await dismissOpportunities(evalJs);
    await evalJs("document.querySelector('[data-act=zoom][data-dir=in]').click(); document.querySelector('[data-act=zoom][data-dir=in]').click()");
    await waitFor(async () => Boolean(await evalJs("document.querySelector('#mapdyn [data-wildlife-id=\"1\"]')")), "seed 3 natural deer");
    const calmInitial = JSON.parse(await evalJs(`(() => {
      const animal = window.__naturalCalmAnimal = document.querySelector('#mapdyn [data-wildlife-id="1"]');
      const active = window.survidle.state.wildlife.subjects.find(s => s.id === 1).active;
      const r = animal.getBoundingClientRect();
      return JSON.stringify({ minute: window.survidle.state.minute, cell: active.cell, position: active.position,
        destination: active.travel.destination, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));
    await saveMap(send, evalJs, "natural-seed-3-travel-start");
    const calmTrace = [calmInitial];
    await waitFor(async () => {
      const sample = JSON.parse(await evalJs(`(() => {
        const animal = document.querySelector('#mapdyn [data-wildlife-id="1"]');
        const subject = window.survidle.state.wildlife.subjects.find(s => s.id === 1);
        const active = subject.active;
        const r = animal?.getBoundingClientRect();
        return JSON.stringify({ minute: window.survidle.state.minute, cell: active.cell, position: active.position,
          destination: active.travel?.destination ?? null, x: r ? r.left + r.width / 2 : null, y: r ? r.top + r.height / 2 : null,
          sameNode: animal === window.__naturalCalmAnimal, alarm: active.alarm, episode: active.escapeEpisode,
          startleLogs: window.survidle.state.log.filter(entry => /startles|crashes away/.test(entry.text)).length,
          cues: document.querySelectorAll('.wildlife-startle').length });
      })()`));
      calmTrace.push(sample);
      return sample.destination === null || sample.destination.xM !== calmInitial.destination.xM || sample.destination.yM !== calmInitial.destination.yM;
    }, "seed 3 ordinary deer to finish its first segment", 25000);
    const calm = calmTrace.at(-1);
    assert(calm.cell !== calmInitial.cell, "seed 3 ordinary deer did not cross into its destination cell");
    assert(calm.sameNode && calm.alarm === 0 && calm.episode === 0 && calm.startleLogs === 0 && calm.cues === 0,
      "seed 3 ordinary travel changed identity or produced a startle");
    let calmProgress = -1;
    const calmVector = { x: calmInitial.destination.xM - calmInitial.position.xM, y: calmInitial.destination.yM - calmInitial.position.yM };
    const calmLength = Math.hypot(calmVector.x, calmVector.y);
    for (const sample of calmTrace.slice(1).filter(sample => sample.destination?.xM === calmInitial.destination.xM && sample.destination?.yM === calmInitial.destination.yM)) {
      const offset = { x: sample.position.xM - calmInitial.position.xM, y: sample.position.yM - calmInitial.position.yM };
      const progress = (offset.x * calmVector.x + offset.y * calmVector.y) / calmLength;
      assert(progress > calmProgress, "seed 3 ordinary movement was not monotonic toward its waypoint");
      calmProgress = progress;
    }
    await saveMap(send, evalJs, "natural-seed-3-travel-end");
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
      "- [mid-travel](visible-mid-travel.png) and [cell crossing](visible-cell-crossing.png): exact simulated movement with one stable animal node.",
      "- [natural seed 19](natural-seed-19-startle.png): an unmodified landing and ordinary map click, with no fixture command.",
      "- [natural seed 9 on 25 November](natural-seed-9-heard.png): a normal eastward walk produces a heard-only departure with no animal glyph.",
      "- [natural seed 3 start](natural-seed-3-travel-start.png) and [arrival](natural-seed-3-travel-end.png): visible ordinary deer travel with no player action or startle.",
      "",
      "The script drives all six fixture scenarios plus the natural seeds. It asserts visible and heard-only disclosure, same-area non-detection, bog and snow audio slot selection, blocked-edge passability, cue timestamp/key survival, a time-stamped gait-budget trace through a cell crossing, animal-node identity across that crossing, clipped edge bounds, reduced-motion fade, muted simulation equivalence, normal landing and map-click flow, and a console free of exceptions. Browser automation cannot objectively evaluate the subjective recognisability or quality of the rendered sound.",
      "",
    ].join("\n"));
    console.log(JSON.stringify({ visible, heard, sameArea, bog, snow, blockedEdge, edge, reduced, muted, motionTrace, naturalInitial, natural, naturalHeard, calmInitial, calm, calmTraceSamples: calmTrace.length, consoleErrors }, null, 2));
    ws.close();
  } finally {
    if (chrome.exitCode === null) {
      chrome.kill("SIGKILL");
      await new Promise((resolveExit) => chrome.once("exit", resolveExit));
    }
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
