/**
 * Capture deterministic weather states selected by URL. The browser renders
 * normal GameState, WeatherWorld, mapHtml and visibleCells output. This harness
 * never assigns a weather class, CSS variable, glyph, or visibility result.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.SHOTS_URL ?? "http://127.0.0.1:5173/prototypes/08/";
const PORT = Number(process.env.SHOTS_PORT ?? 9444);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/map-shots");
const PROFILE = mkdtempSync(resolve(tmpdir(), "survidle-map-shots-"));
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const KEEP = process.argv.includes("--keep");
const SCENARIOS = ["clear", "sunny-clouds", "approaching-rain", "local-rain", "persisted-snow", "frozen-water", "valley-fog", "windward-lee", "obscured"];
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function cdp(url) {
  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen) => { ws.onopen = resolveOpen; });
  let id = 0;
  const waiting = new Map();
  const events = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) waiting.get(message.id)(message);
    else if (message.method) events.push(message);
  };
  const send = (method, params = {}) => {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolveCall) => waiting.set(callId, resolveCall));
  };
  const evalJs = async (expression) => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result.result.value;
  };
  const nextEvent = async (method) => {
    for (let i = 0; i < 200; i++) {
      const index = events.findIndex((event) => event.method === method);
      if (index >= 0) return events.splice(index, 1)[0];
      await sleep(25);
    }
    throw new Error(`no ${method} event within 5 seconds`);
  };
  return { send, evalJs, nextEvent, ws, targetId: target.id };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForScenario(evalJs, name) {
  for (let i = 0; i < 480; i++) {
    const ready = await evalJs(`window.survidle?.weatherShot?.name === ${JSON.stringify(name)} && Boolean(document.querySelector('#mapdyn .grid'))`);
    if (ready) return;
    await sleep(250);
  }
  throw new Error(`${name} did not render within 120 seconds`);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--window-size=1400,900", "about:blank"]);
  let completed = false;
  try {
    let chromeError;
    chrome.on("error", (error) => { chromeError = error; });
    for (let i = 0; i < 60; i++) {
      if (chromeError) throw chromeError;
      try { await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
    }
    if (chromeError) throw chromeError;
    const results = [];
    for (const name of SCENARIOS) {
    const { send, evalJs, nextEvent, ws, targetId } = await cdp(`${URL_BASE}?weather-shot=${encodeURIComponent(name)}`);
    await send("Page.bringToFront");
    await waitForScenario(evalJs, name);
    await sleep(500);
    const facts = await evalJs(`(() => {
      const cells = [...document.querySelectorAll('#mapdyn .c')];
      const weatherValues = new Set(cells.map((cell) => cell.style.getPropertyValue('--wx-fog') + ':' + cell.style.getPropertyValue('--wx-fall')));
      const fogCells = cells.filter((cell) => cell.classList.contains('wx-fog'));
      const cloudyCells = cells.filter((cell) => cell.classList.contains('wx-cloud'));
      const glyphWeatherCells = cells.filter((cell) => cell.classList.contains('wx-glyph'));
      const safeIceCells = cells.filter((cell) => cell.matches('.t-water.ice-safe:not(.mk)'));
      const waterTerrain = cells.filter((cell) => cell.matches('.t-water:not(.mk)')).map((cell) => cell.querySelector('.terrain-visual')?.textContent ?? '');
      const snowyMeadowTerrain = cells.filter((cell) => cell.matches('.ground-snow.t-meadow:not(.mk)')).map((cell) => cell.querySelector('.terrain-visual')?.textContent ?? '');
      const ordinaryCells = cells.filter((cell) => !cell.matches('.bl, .br, .bt, .bb'));
      const cloudShadowAlphas = [...document.querySelectorAll('#mapdyn .cloud-shadow')].map((shadow) => {
        const color = getComputedStyle(shadow).backgroundColor;
        const channels = color.match(/[0-9.]+/g) ?? [];
        return channels.length === 4 ? Number(channels[3]) : 1;
      });
      const cloudShadowColors = [...new Set([...document.querySelectorAll('#mapdyn .cloud-shadow')]
        .map((shadow) => getComputedStyle(shadow).backgroundColor))];
      const visibilityFootprint = cells
        .filter((cell) => cell.dataset.mapCell && !cell.matches('.fog, .void, .dim, .memory'))
        .map((cell) => cell.dataset.mapCell)
        .sort((a, b) => Number(a) - Number(b))
        .join(',');
      return {
        name: window.survidle.weatherShot.name,
        minute: window.survidle.state.minute,
        visible: window.survidle.weatherShot.visibleCells,
        visibilityFootprint,
        unknown: cells.filter((cell) => cell.classList.contains('fog')).length,
        unknownWithTerrain: cells.filter((cell) => cell.classList.contains('fog') && [...cell.classList].some((value) => value.startsWith('t-'))).length,
        rain: cells.filter((cell) => cell.classList.contains('wx-rain')).length,
        snow: cells.filter((cell) => cell.classList.contains('wx-snowing')).length,
        fog: cells.filter((cell) => cell.classList.contains('wx-fog')).length,
        groundSnow: cells.filter((cell) => cell.classList.contains('ground-snow')).length,
        safeIce: safeIceCells.length,
        safeIceBackgrounds: [...new Set(safeIceCells.map((cell) => getComputedStyle(cell).backgroundColor))],
        waterConditionGlyphs: waterTerrain.filter((glyphs) => glyphs.includes('=')).length,
        snowConditionGlyphs: snowyMeadowTerrain.filter((glyphs) => glyphs.includes('*')).length,
        safeIceTerrainGlyphs: safeIceCells.filter((cell) => /[~-]/.test(cell.querySelector('.terrain-visual')?.textContent ?? '')).length,
        weatherValues: weatherValues.size,
        fogFields: document.querySelectorAll('#mapdyn .fog-field').length,
        fogGlyphCells: fogCells.filter((cell) => cell.querySelectorAll('.fog-ripple').length === 4).length,
        fogGrayWashes: fogCells.filter((cell) => /(^|, )linear-gradient/.test(getComputedStyle(cell.querySelector('.cell-weather')).backgroundImage)).length,
        fogWeatherBorders: fogCells.filter((cell) => getComputedStyle(cell.querySelector('.cell-weather')).borderStyle !== 'none').length,
        fogCompositingLeaks: fogCells.filter((cell) => {
          const style = getComputedStyle(cell);
          return style.filter !== 'none' || style.opacity !== '1';
        }).length,
        explorationFeathers: cells.filter((cell) => cell.classList.contains('fog-edge')).length,
        weatherGlyphOverlaps: glyphWeatherCells.filter((cell) => [...cell.querySelectorAll('.weather-ripple')]
          .filter((glyph) => getComputedStyle(glyph).display !== 'none' && Number(getComputedStyle(glyph).opacity) > 0.001).length > 1).length,
        weatherTerrainLeaks: glyphWeatherCells.filter((cell) => !cell.matches('.mk, .has-map-signal') &&
          getComputedStyle(cell.querySelector('.terrain-visual')).visibility !== 'hidden').length,
        weatherGradientCells: glyphWeatherCells.filter((cell) => getComputedStyle(cell.querySelector('.cell-weather')).backgroundImage !== 'none').length,
        cloudMode: document.querySelector('#mapdyn .grid').classList.contains('cloud-shadows') ? 'shadows' : 'glyphs',
        cloudy: cloudyCells.length,
        cloudShadowCells: cloudyCells.filter((cell) => cell.querySelector('.cloud-shadow')).length,
        cloudGlyphCells: cloudyCells.filter((cell) => cell.querySelectorAll('.cloud-ripple').length === 4).length,
        hiddenLiveWeather: cells.filter((cell) => cell.classList.contains('wx-local') && cell.matches('.fog, .memory, .dim')).length,
        ordinaryCellBorders: ordinaryCells.filter((cell) => {
          const style = getComputedStyle(cell);
          return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some((width) => width !== '0px');
        }).length,
        maxCloudShadowAlpha: Math.max(0, ...cloudShadowAlphas),
        cloudShadowColors,
        overlayHidden: document.querySelector('#overlay').hidden,
        box: (() => { const r = document.querySelector('#mapdyn .scroll-x').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })(),
      };
    })()`);
    assert(facts.name === name, `${name}: browser did not load requested simulated scenario`);
    assert(facts.overlayHidden, `${name}: an overlay covered the simulation-backed map`);
    assert(facts.unknown > 0 && facts.unknownWithTerrain === 0, `${name}: unknown terrain was revealed`);
    assert(facts.hiddenLiveWeather === 0, `${name}: live weather appeared outside known currently visible ground`);
    assert(facts.explorationFeathers === 0, `${name}: exploration edge retained a soft feather layer`);
    assert(facts.weatherGlyphOverlaps === 0, `${name}: more than one atmospheric ASCII state was visible in a cell`);
    assert(facts.weatherTerrainLeaks === 0, `${name}: atmospheric and terrain glyphs were stacked in a cell`);
    assert(facts.weatherGradientCells === 0, `${name}: weather retained a non-ASCII gradient texture`);
    if (facts.fog > 0) {
      assert(facts.fogFields === 0, `${name}: fog escaped into a map-level display layer`);
      assert(facts.fogGlyphCells === facts.fog, `${name}: fog cell omitted its ASCII animation states`);
      assert(facts.fogGrayWashes === 0, `${name}: fog cell retained a rectangular gray wash`);
      assert(facts.fogWeatherBorders === 0, `${name}: atmospheric fog drew a cell border`);
      assert(facts.fogCompositingLeaks === 0, `${name}: discovery shading leaked onto cell-owned weather`);
    }
    assert(facts.cloudMode === "shadows", `${name}: cloud shadows were not enabled by default`);
    assert(facts.cloudGlyphCells === 0, `${name}: default cloud mode also drew cloud glyphs`);
    assert(facts.ordinaryCellBorders === 0, `${name}: ordinary map cells retained distinct borders`);
    assert(facts.waterConditionGlyphs === 0, `${name}: water terrain was replaced by an ice condition glyph`);
    assert(facts.snowConditionGlyphs === 0, `${name}: meadow terrain was replaced by a snow condition glyph`);
    assert(facts.maxCloudShadowAlpha <= 0.14, `${name}: cloud shadow exceeded the 14 percent ceiling (${facts.maxCloudShadowAlpha}; ${facts.cloudShadowColors.join(', ')})`);
    if (name === "approaching-rain" || name === "windward-lee") {
      assert(facts.weatherValues > 1, `${name}: local weather did not vary across the view`);
    }
    if (name.includes("rain")) assert(facts.rain > 0, `${name}: simulation produced no rain cells`);
    if (name === "persisted-snow") assert(facts.groundSnow > 0, `${name}: simulation produced no retained ground snow`);
    if (name === "frozen-water") {
      assert(facts.safeIce > 20, `${name}: simulation produced only ${facts.safeIce} safe ice cells`);
      assert(facts.safeIceTerrainGlyphs === facts.safeIce, `${name}: safe ice did not retain water terrain glyphs`);
      assert(facts.safeIceBackgrounds.length === 1 && facts.safeIceBackgrounds[0] === "rgb(36, 55, 70)",
        `${name}: safe ice did not replace liquid depth colors (${facts.safeIceBackgrounds.join(', ')})`);
    }
    if (name === "valley-fog" || name === "obscured") assert(facts.fog > 0, `${name}: simulation produced no fog cells`);
    const image = await send("Page.captureScreenshot", { format: "png", clip: { ...facts.box, scale: 2 } });
    const imageBytes = Buffer.from(image.result.data, "base64");
    writeFileSync(`${OUT}/${name}.png`, imageBytes);
    if (name === "clear") {
      const zoomLabels = [];
      for (const direction of ["in", "in", "out", "out", "out", "out", "out"]) {
        const zoomAudit = await evalJs(`(() => {
          document.querySelector('[data-act=zoom][data-dir=${direction}]').click();
          const cells = [...document.querySelectorAll('#mapdyn .c:not(.bl):not(.br):not(.bt):not(.bb)')];
          return {
            label: document.querySelector('.maptools span').textContent,
            hiddenLiveWeather: cells.filter((cell) => cell.classList.contains('wx-local') && cell.matches('.fog, .memory, .dim')).length,
            bordered: cells.filter((cell) => {
              const style = getComputedStyle(cell);
              return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some((width) => width !== '0px');
            }).length,
          };
        })()`);
        assert(zoomAudit.bordered === 0, `clear: ${zoomAudit.label} retained ordinary cell borders`);
        assert(zoomAudit.hiddenLiveWeather === 0, `clear: ${zoomAudit.label} exposed live weather outside the viewshed`);
        zoomLabels.push(zoomAudit.label);
      }
      assert(new Set(zoomLabels).size === 6, `clear: browser border audit covered only ${new Set(zoomLabels).size} zoom levels`);
      await evalJs("document.querySelector('[data-act=zoom][data-dir=in]').click(); document.querySelector('[data-act=zoom][data-dir=in]').click(); document.querySelector('[data-act=zoom][data-dir=in]').click()");
    }
    if (name === "sunny-clouds") {
      assert(facts.rain === 0 && facts.snow === 0 && facts.fog === 0, "sunny-clouds: dry reference contained precipitation or fog");
      assert(facts.cloudy > 0 && facts.cloudShadowCells === facts.cloudy, "sunny-clouds: broken clouds did not cast cell-owned shadows");
      const shadowSignature = await evalJs(`[...document.querySelectorAll('#mapdyn .c.wx-cloud')]
        .map((cell) => cell.dataset.mapCell + ':' + cell.style.getPropertyValue('--wx-shadow'))
        .join('|')`);
      const frameA = await send("Page.captureScreenshot", { format: "png", clip: { ...facts.box, scale: 2 } });
      writeFileSync(`${OUT}/sunny-cloud-shadows-a.png`, Buffer.from(frameA.result.data, "base64"));
      await evalJs("window.survidle.advance(60); new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))");
      const movedMinute = await evalJs("window.survidle.state.minute");
      const movedSignature = await evalJs(`[...document.querySelectorAll('#mapdyn .c.wx-cloud')]
        .map((cell) => cell.dataset.mapCell + ':' + cell.style.getPropertyValue('--wx-shadow'))
        .join('|')`);
      assert(movedMinute === facts.minute + 60, "sunny-clouds: normal simulation advance did not move by 60 game minutes");
      assert(movedSignature !== shadowSignature, "sunny-clouds: cloud shadow field did not move with simulation time");
      const frameB = await send("Page.captureScreenshot", { format: "png", clip: { ...facts.box, scale: 2 } });
      writeFileSync(`${OUT}/sunny-cloud-shadows-b.png`, Buffer.from(frameB.result.data, "base64"));
    }
    if (name === "approaching-rain") {
      assert(facts.cloudy > 0 && facts.cloudShadowCells === facts.cloudy, "approaching-rain: clouds did not cast cell-owned shadows");
      const shadowImage = await send("Page.captureScreenshot", { format: "png", clip: { ...facts.box, scale: 2 } });
      writeFileSync(`${OUT}/cloud-shadows.png`, Buffer.from(shadowImage.result.data, "base64"));
      await evalJs(`(() => {
        const checkbox = document.querySelector('[data-display=cloud-shadows]');
        checkbox.click();
      })()`);
      await evalJs("new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))");
      const flavorFacts = await evalJs(`(() => {
        const grid = document.querySelector('#mapdyn .grid');
        const clouds = [...grid.querySelectorAll('.c.wx-cloud')];
        return {
          mode: grid.classList.contains('cloud-glyphs') ? 'glyphs' : 'shadows',
          shadows: grid.querySelectorAll('.cloud-shadow').length,
          glyphCells: clouds.filter((cell) => cell.querySelectorAll('.cloud-ripple').length === 4).length,
          eligible: clouds.filter((cell) => !cell.matches('.wx-fog, .wx-rain, .wx-snowing')).length,
          stored: localStorage.getItem('survidle.map.cloud-shadows'),
          minute: window.survidle.state.minute,
          visible: window.survidle.weatherShot.visibleCells,
          visibilityFootprint: [...grid.querySelectorAll('.c')]
            .filter((cell) => cell.dataset.mapCell && !cell.matches('.fog, .void, .dim, .memory'))
            .map((cell) => cell.dataset.mapCell)
            .sort((a, b) => Number(a) - Number(b))
            .join(','),
        };
      })()`);
      assert(flavorFacts.mode === "glyphs", "approaching-rain: settings toggle did not select ASCII cloud flavor");
      assert(flavorFacts.shadows === 0, "approaching-rain: cloud shadows remained in ASCII flavor mode");
      assert(flavorFacts.eligible > 0 && flavorFacts.glyphCells === flavorFacts.eligible, "approaching-rain: eligible cloud cells omitted ASCII animation states");
      assert(flavorFacts.stored === "false", "approaching-rain: cloud display preference was not persisted");
      assert(flavorFacts.minute === facts.minute, "approaching-rain: cloud setting changed simulation time");
      assert(flavorFacts.visible === facts.visible, "approaching-rain: cloud setting changed visibility");
      assert(flavorFacts.visibilityFootprint === facts.visibilityFootprint, "approaching-rain: cloud setting changed the live visibility footprint");
      const flavorImage = await send("Page.captureScreenshot", { format: "png", clip: { ...facts.box, scale: 2 } });
      writeFileSync(`${OUT}/cloud-glyphs.png`, Buffer.from(flavorImage.result.data, "base64"));
      await evalJs("document.querySelector('[data-display=cloud-shadows]').click()");
      await evalJs("new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))");
      assert(await evalJs("document.querySelector('#mapdyn .grid').classList.contains('cloud-shadows')"), "approaching-rain: could not restore default cloud shadows");
    }
    if (name === "valley-fog") {
      const rippleStyles = `(() => [...document.querySelectorAll('.fog-ripple')].slice(0, 32).map((ripple) => { const style = getComputedStyle(ripple); return style.opacity + ':' + style.transform; }).join('|'))()`;
      const before = await evalJs(rippleStyles);
      const unchanged = { minute: await evalJs("window.survidle.state.minute"), footprint: facts.visibilityFootprint };
      await send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
      const frameA = await nextEvent("Page.screencastFrame");
      await send("Page.screencastFrameAck", { sessionId: frameA.params.sessionId });
      const frameABytes = Buffer.from(frameA.params.data, "base64");
      writeFileSync(`${OUT}/fog-frame-a.png`, frameABytes);
      await sleep(3200);
      await evalJs("new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))");
      const after = await evalJs(rippleStyles);
      const frameB = await nextEvent("Page.screencastFrame");
      await send("Page.screencastFrameAck", { sessionId: frameB.params.sessionId });
      await send("Page.stopScreencast");
      const frameBBytes = Buffer.from(frameB.params.data, "base64");
      writeFileSync(`${OUT}/fog-frame-b.png`, frameBBytes);
      assert(await evalJs("window.survidle.state.minute") === unchanged.minute, "fog animation changed simulation time");
      const animatedFootprint = await evalJs(`[...document.querySelectorAll('#mapdyn .c')]
        .filter((cell) => cell.dataset.mapCell && !cell.matches('.fog, .void, .dim, .memory'))
        .map((cell) => cell.dataset.mapCell)
        .sort((a, b) => Number(a) - Number(b))
        .join(',')`);
      assert(animatedFootprint === unchanged.footprint, "fog animation changed the live visibility footprint");
      assert(before !== after, "fog ripple computed style did not animate");
      assert(!frameABytes.equals(frameBBytes), `fog animation frames were byte-identical (${before} -> ${after})`);
    }
      results.push(facts);
      console.log(`${name.padEnd(18)} visible=${facts.visible} rain=${facts.rain} snow=${facts.snow} fog=${facts.fog} ground-snow=${facts.groundSnow} safe-ice=${facts.safeIce}`);
      ws.close();
      await fetch(`http://localhost:${PORT}/json/close/${targetId}`);
    }
    const clear = results.find((result) => result.name === "clear");
    const obscured = results.find((result) => result.name === "obscured");
    assert(clear.visible > obscured.visible, "actual dense-band visibleCells footprint was not smaller than same-location clear air");
    writeFileSync(`${OUT}/README.md`, [
      "# Simulation-backed local weather references", "",
      "Regenerate with `npm run dev` in one shell and `npm run shots` in another.",
      "Every image is normal simulation and rendering output selected by the deterministic scenario catalog in `src/sim/weather-scenarios.ts`.",
      "The harness does not assign weather classes, variables, glyphs, or visibility.", "",
      ...results.map((result) => `- **${result.name}** - ${result.visible} cells in the actual current-visibility footprint.\n\n  ![${result.name}](${result.name}.png)`), "",
      "The two fog frames hold the same simulation minute and visibility while one deterministic ASCII state hard-switches to the next.", "",
      "![fog frame A](fog-frame-a.png)", "", "![fog frame B](fog-frame-b.png)", "",
      "The same approaching-rain simulation is also captured in both persisted display modes. Cloud shadows are the default; ASCII cloud flavor is the optional setting.", "",
      "![cloud shadows](cloud-shadows.png)", "", "![ASCII cloud flavor](cloud-glyphs.png)", "",
      "The sunny pair advances the normal simulation by 60 game minutes between frames. The changing cell-owned shadow field comes from the moving simulated cloud field, not screenshot styling.", "",
      "![sunny cloud shadows A](sunny-cloud-shadows-a.png)", "", "![sunny cloud shadows B](sunny-cloud-shadows-b.png)", "",
    ].join("\n"));
    completed = true;
    if (KEEP) console.log(`browser left on port ${PORT}`);
  } finally {
    if (!KEEP || !completed) {
      if (chrome.exitCode === null && chrome.signalCode === null) {
        const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
        chrome.kill();
        await exited;
      }
      rmSync(PROFILE, { recursive: true, force: true });
    }
  }
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
