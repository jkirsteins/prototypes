import "./style.css";
import { Rng } from "./rng";
import { mountControl } from "./audio/control";
import { createAudioEngine } from "./audio/engine";
import { SLOTS } from "./audio/manifest";
import { createScheduler } from "./audio/scheduler";
import { createBeacon, deathTransition, type Sink } from "./beacon/beacon";
import { BEACON } from "./beacon/config";
import { createDatadogSink } from "./beacon/datadog";
import { applyTesterLink, loadRecord, saveRecord } from "./beacon/storage";
import { addFirewood, drop, dropAll, eat, take } from "./sim/actions";
import { advance } from "./sim/advance";
import { calendar, dayNumber } from "./sim/calendar";
import { setCueSink } from "./sim/cues";
import { setWildlifeEventSink } from "./sim/wildlife-events";
import type { WildlifeStartleEvent } from "./sim/wildlife-encounter";
import { since } from "./sim/epitaph";
import { createForecaster, noteMonthRow } from "./sim/forecaster";
import { startIntent, type Where } from "./sim/intent";
import type { FoodId } from "./sim/items";
import { orderByHand, orderGate } from "./sim/ladder";
import { beginAgain, land, nextBoat, pickCandidate } from "./sim/landing";
import { isKnown } from "./sim/mapped";
import { frontierRoute } from "./sim/routing";
import { newWorld } from "./sim/newgame";
import { moveOrderByHand, pinOrderByHand, removeOrderByHand } from "./sim/orders";
import { abandon, feltTemperature } from "./sim/player";
import { campCellOf, cellOf } from "./sim/position";
import { current } from "./sim/record";
import { fillPopulations } from "./sim/regionstate";
import { awaySeconds, catchUp, clearSave, loadGame, saveGame } from "./sim/save";
import { clearShopping, trackShopping } from "./sim/shopping";
import { putOutTorch, startTask, stopTask } from "./sim/tasks";
import type { GameState, ItemId, TaskId } from "./sim/types";
import { insertWalkAtTop } from "./sim/walkorders";
import { drink, fillVessels } from "./sim/water";
import { ambientTemperature, localWeather } from "./sim/weather";
import { WEATHER_SHOTS, weatherShotFixture, type WeatherShotName } from "./sim/weather-scenarios";
import { GAME_MINUTES_PER_REAL_SECOND } from "./units";
import { updateBars, updateFills } from "./ui/bars";
import { mountBeaconPanel } from "./ui/beacon-panel";
import { buildHtml } from "./ui/build";
import { mountAwayDial, type AwayDial } from "./ui/dial";
import { doHtml, doPurposesHtml, KW_PREFIX } from "./ui/dopanel";
import { acknowledgeOpportunities, unpresentedOpportunityKeys } from "./sim/opportunities";
import { goalGuideHtml, goalIntroductionToOpen, goalMomentToOpen, goalNoticeToOpen, goalsHtml } from "./ui/goalpanel";
import { loadPanes, PANE_IDS, type PaneId, paneTabsHtml, savePanes, subtabsHtml, toSubtab } from "./ui/panes";
import type { SubtabId } from "./ui/purpose";
import { cellFromClient, levelAt, LEVELS, legendHtml, mapHtml, mapKey, mapViewportBounds, viewOrigin } from "./ui/map";
import { loadCloudShadows, saveCloudShadows } from "./ui/map-preferences";
import { mapInventoryHtml, tipHtml, tipKey } from "./ui/tip";
import {
  awayHtml, campHtml, cemeteryHtml, forecastHtml, gearHtml, inventoryHtml, journalHtml, landingHtml, logHtml,
  manualHtml, queueHtml, skillsHtml, placesHtml, statsHtml, taskHtml, tombstoneHtml, weatherHtml, weatherKey,
} from "./ui/panels";
import { conceptHtml, momentToOpen, welcomeHtml } from "./ui/teachpanel";
import { commitChoiceN, defaultChoiceFor, enqueueWildlifeStartle, newUiState, resetPanels, rowRequest, setPanel, setWhenField, WHEN_FIELDS, type RowChoice, type UiState, type WhenField } from "./ui/render";
import { advanceHurry, hurryClick, hurryKind, newHurry } from "./ui/hurry";
import { createPortraitMotion } from "./ui/portrait-motion";
import { updateSky } from "./ui/sky";
import { newSpeedHistory, updateSpeedHistory } from "./ui/speed-history";
import { shoppingHtml, shoppingQuery } from "./ui/shopping";
import { loadTravelDisplay, saveTravelDisplay } from "./ui/travel";
import { recognitionHtml } from "./ui/wildlife-panel";
import { generateWorld, regionAt, type World } from "./world/gen";

const params = new URLSearchParams(location.search);
// The face self-test page: a page of generated faces to judge, in place of the game.
if (params.has("faces")) location.replace(`${import.meta.env.BASE_URL}faces.html`);
/** Test aid: how many times faster than 60x the clock runs. Not a game feature. */
const speed = Math.max(0.1, Number(params.get("speed")) || 1);
const forcedSeed = params.get("seed");
/** Test aid beside seed: the day of year the run begins on, for a summer or autumn pass. Not a game feature. */
const forcedDay = params.get("day");
const requestedWeatherShot = params.get("weather-shot");
const weatherShotName = requestedWeatherShot && requestedWeatherShot in WEATHER_SHOTS
  ? requestedWeatherShot as WeatherShotName
  : null;
// Anything that is not a day of year is no day of year: a blank or misspelt
// ?day= leaves the run alone rather than opening it on 1 January in the snow.
const forcedDayN = forcedDay === null || forcedDay.trim() === "" ? Number.NaN : Number(forcedDay);
const startDoy = Number.isInteger(forcedDayN) && forcedDayN >= 0 && forcedDayN < 365 ? forcedDayN : undefined;

// The tester link marks the device once and leaves the address; ?seed= and the rest stay.
let beaconRec = loadRecord(localStorage);
{
  const link = applyTesterLink(beaconRec, params);
  if (link.stripped) {
    beaconRec = link.rec;
    saveRecord(localStorage, beaconRec);
    params.delete("tester");
    const q = params.toString();
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
  }
}
const beaconConfigured = Boolean(BEACON.applicationId && BEACON.clientToken);
const makeSink = () => createDatadogSink(BEACON, { id: beaconRec.id, name: beaconRec.name ?? beaconRec.id }, { tester: beaconRec.tester, cohort: beaconRec.cohort }, () => beacon.record().on);
let sinkMade = beaconConfigured && beaconRec.on;
let sink: Sink | null = sinkMade ? makeSink() : null;
const beacon = createBeacon(localStorage, sink, beaconRec);
let wasDead = false;

// Assigned by boot()/fresh() before anything reads it; the assertion is for TS,
// which cannot see the assignment through the function call.
let state!: GameState;
let world!: World;
// Development fixtures hold their clock outside GameState and restore the run.
let startleRestore: (() => void) | null = null;
let startleStep: (() => void) | null = null;
function persistGame(): void {
  if (!(import.meta.env.DEV && startleRestore)) saveGame(state);
}
const ui = newUiState();
ui.travelDisplay = loadTravelDisplay(localStorage);
ui.cloudShadows = loadCloudShadows(localStorage);
const SPECIFIC_KEY = "survidle.specific";
try {
  const saved = JSON.parse(localStorage.getItem(SPECIFIC_KEY) ?? "{}") as Partial<UiState["specific"]>;
  ui.specific = { trees: saved.trees === true, fish: saved.fish === true, regions: saved.regions === true };
} catch {
  // A malformed UI preference is only a closed chooser.
}
let awayInfo: { seconds: number; capped: boolean } | null = null;
const audio = createAudioEngine(SLOTS);
const sounds = createScheduler(audio);
function onWildlifeStartle(event: WildlifeStartleEvent): void {
  if (document.visibilityState !== "visible") return;
  if (!enqueueWildlifeStartle(ui, event, performance.now())) return;
  sounds.wildlifeStartle(event, state.weather.snowCm >= 5);
}
const portraitMotion = createPortraitMotion();
// Read by fresh() below (called from boot(), before the forecaster exists) and by
// requestForecast() (defined after boot(), once world is real) - declared here so
// neither reads it before it is initialized.
let forecastAt = { minute: -Infinity, day: -1, region: -1, real: -Infinity };
/** Every life-restart site calls this so the next frame requests by invariant, not by the side effect of state.minute happening to have moved. */
function resetForecastAt(): void {
  forecastAt = { minute: -Infinity, day: -1, region: -1, real: -Infinity };
}
// Assigned once mountAwayDial() runs, below; fresh() runs once before that during
// boot(), when there is nothing yet to refresh.
let awayDial: AwayDial | null = null;

function fresh(seed = (Math.random() * 0xffffffff) >>> 0, startDoy?: number, boat = 0) {
  const g = newWorld(seed, boat, startDoy);
  state = g.state;
  world = g.world;
  wasDead = false;
  ui.selected = null;
  ui.away = null;
  ui.hurry = newHurry();
  ui.speedHistory = newSpeedHistory();
  ui.wildlifeStartles = [];
  ui.wildlifeStartleIds.clear();
  ui.confirmAbandon = false;
  ui.panes = loadPanes(localStorage);
  ui.confirmCamp = false;
  resetPanels();
  resetForecastAt();
  persistGame();
  awayDial?.refresh();
}

function boot() {
  ui.panes = loadPanes(localStorage);
  const saved = forcedSeed || startDoy !== undefined ? null : loadGame();
  if (saved) {
    state = saved.state;
    // Set before the catch-up below runs, so a death the catch-up itself deals
    // is not already read as "seen": the first frame must still emit died for it.
    wasDead = Boolean(saved.state.dead);
    world = generateWorld(state.seed);
    fillPopulations(state, world);
    const elapsed = Math.max(0, (Date.now() - saved.savedAt) / 1000);
    if (elapsed > 30 && !state.dead && !state.landing) {
      setCueSink(null);
      setWildlifeEventSink(null);
      ui.awayFromDay = calendar(state.minute, state.startDoy).day;
      ui.away = catchUp(state, world, elapsed, speed);
      ui.hurry = newHurry();
      setCueSink((c) => sounds.cue(c));
      setWildlifeEventSink(onWildlifeStartle);
      awayInfo = { seconds: Math.min(elapsed, awaySeconds(state)), capped: elapsed > awaySeconds(state) };
      persistGame();
    }
  } else {
    fresh(forcedSeed ? Number(forcedSeed) >>> 0 : undefined, startDoy);
  }
}

let lastTipKey = "";
let lastMapKey = "";
let lastWeatherKey = "";
function render(nowMs = performance.now()) {
  if (ui.wildlifeStartles.length) document.getElementById("mapdyn")!.style.setProperty("--wildlife-now", `${nowMs}ms`);
  // Arriving where you were looking ends the looking.
  if (ui.selected === state.player.region) ui.selected = null;
  const cal = calendar(state.minute, state.startDoy);
  if (weatherShotName) {
    setPanel("mapdyn", mapHtml(world, state, ui, cal));
    document.getElementById("overlay")!.hidden = true;
    return;
  }
  const ambient = ambientTemperature(cal, localWeather(state, world));
  setPanel("stats", statsHtml(state, world, cal, ambient, ui));
  setPanel("camp", campHtml(state, world, cal));
  setPanel("maptravel", placesHtml(state, world, cal, ui.travelDisplay));
  setPanel("mapinventory", mapInventoryHtml(state, world, cal, ui.hover));
  setPanel("gear", gearHtml(state, world, cal, feltTemperature(state, world, ambient)));
  setPanel("skills", skillsHtml(state));
  setPanel("goals", goalsHtml(state, world, cal));
  setPanel("shopping", shoppingHtml(state, world, cal));
  const wxKey = weatherKey(state, world, cal, ui.hurry.rate);
  if (wxKey !== lastWeatherKey) {
    lastWeatherKey = wxKey;
    setPanel("weather", weatherHtml(state, world, cal, ambient, ui.hurry.rate));
  }
  // A zoom changes the grid's dimensions. Measure again after that morph so
  // edge effects use the new visible intersection before the browser paints.
  for (let pass = 0; pass < 2; pass++) {
    if (ui.wildlifeStartles.length) {
      const grid = document.querySelector<HTMLElement>("#mapdyn .grid");
      const viewport = document.querySelector<HTMLElement>("#mapdyn .scroll-x");
      ui.mapViewport = grid && viewport ? mapViewportBounds(grid.getBoundingClientRect(), viewport.getBoundingClientRect()) : null;
    }
    const key = mapKey(state, world, ui, cal, nowMs);
    if (key === lastMapKey) break;
    lastMapKey = key;
    setPanel("mapdyn", mapHtml(world, state, ui, cal, nowMs));
    if (!ui.wildlifeStartles.length) break;
  }
  setPanel("task", taskHtml(state, world, cal, ui.hurry));
  setPanel("orders", queueHtml(state, world, cal));
  setPanel("forecast", forecastHtml(forecaster.view(), state));
  setPanel("panetabs", paneTabsHtml(ui.panes));
  setPanel("dosubs", ui.filter.trim() ? "" : subtabsHtml(ui.panes));
  // Shown and hidden, never rendered on demand: a pane built when it is
  // asked for is a pane whose scroll position starts again every time.
  for (const id of PANE_IDS) {
    const el = document.getElementById(`pane-${id}`);
    if (el) el.hidden = id !== ui.panes.pane;
  }
  // The tooltip is shown and hidden, never created and destroyed: a box
  // rebuilt under the pointer flickers, and one detached under it never
  // gets the leave that would have closed it. Its text is guarded by its
  // own key so a pointer crossing one cell redraws it once.
  const tip = document.getElementById("maptip")!;
  tip.hidden = ui.hover === null;
  if (ui.hover !== null) {
    const tk = tipKey(state, world, cal, ui.hover);
    if (tk !== lastTipKey) {
      lastTipKey = tk;
      setPanel("maptip", tipHtml(state, world, cal, ui.hover, ui.travelDisplay));
    }
  }
  setPanel("dopurposes", doPurposesHtml(state, world, ui));
  setPanel("doitems", doHtml(state, world, cal, ui));
  setPanel("inventory", inventoryHtml(state, world, cal, ui.travelDisplay));
  setPanel("log", logHtml(state));
  setPanel("journal", journalHtml(state, cal, ui));
  updateBars(state, world);
  updateFills(state);
  updateSky(state, cal, ambient);

  // The settings panel is static markup with its own listeners (the slider must
  // not be redrawn mid-drag), so it is shown and hidden rather than rewritten.
  document.getElementById("settings")!.hidden = !ui.settings;
  const travelSelect = document.querySelector<HTMLSelectElement>("[data-display=travel]");
  if (travelSelect && travelSelect.value !== ui.travelDisplay) travelSelect.value = ui.travelDisplay;
  const cloudShadows = document.querySelector<HTMLInputElement>("[data-display=cloud-shadows]");
  if (cloudShadows && cloudShadows.checked !== ui.cloudShadows) cloudShadows.checked = ui.cloudShadows;

  const overlay = document.getElementById("overlay")!;
  if (ui.manual) {
    setPanel("overlay", manualHtml());
    overlay.hidden = false;
  } else if (ui.cemetery) {
    setPanel("overlay", cemeteryHtml(state, ui));
    overlay.hidden = false;
  } else if (ui.away) {
    setPanel("overlay", awayHtml(ui.away, awayInfo?.seconds ?? 0, awayInfo?.capped ?? false, since(current(state), ui.awayFromDay, current(state).name.first), current(state).person, current(state).name.first));
    overlay.hidden = false;
  } else if (state.landing) {
    setPanel("overlay", landingHtml(state, world));
    overlay.hidden = false;
  } else if (state.dead) {
    setPanel("overlay", tombstoneHtml(state, world, ui));
    overlay.hidden = false;
  } else if (ui.welcome) {
    setPanel("overlay", welcomeHtml(state, cal));
    overlay.hidden = false;
  } else if (ui.teach) {
    setPanel("overlay", conceptHtml(state, world, cal, ui.teach));
    overlay.hidden = false;
  } else if (ui.goalGuide) {
    setPanel("overlay", goalGuideHtml(state, world, cal, ui.goalGuide.ids, ui.goalGuide.done, ui.goalGuide.automatic, ui.goalGuide.notices));
    overlay.hidden = false;
  } else if (ui.recognition !== null) {
    setPanel("overlay", recognitionHtml(state, ui.recognition));
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
  }
}

let lastReal = performance.now();
let lastSave = performance.now();
function frame(now: number) {
  const dtSec = Math.max(0, (now - lastReal) / 1000);
  lastReal = now;
  if (import.meta.env.DEV && startleRestore) {
    render(now);
    requestAnimationFrame(frame);
    return;
  }
  if (!weatherShotName && !state.dead && !state.landing && !ui.away && !ui.teach && !ui.welcome && !ui.goalGuide && ui.recognition === null) {
    if (dtSec > 30) {
      // The tab was in the background: catch up the same way a reload does.
      setCueSink(null);
      setWildlifeEventSink(null);
      ui.wildlifeStartles = [];
      ui.awayFromDay = calendar(state.minute, state.startDoy).day;
      ui.away = catchUp(state, world, dtSec, speed);
      ui.hurry = newHurry();
      setCueSink((c) => sounds.cue(c));
      setWildlifeEventSink(onWildlifeStartle);
      awayInfo = { seconds: Math.min(dtSec, awaySeconds(state)), capped: dtSec > awaySeconds(state) };
    } else {
      // The hurry: extra minutes for work chosen by hand, on top of the frame's own. The speed test aid does not scale it.
      const extra = advanceHurry(ui.hurry, state, world, dtSec);
      advance(state, world, dtSec * GAME_MINUTES_PER_REAL_SECOND * speed + extra, { wildlife: "detailed", live: document.visibilityState === "visible" });
    }
    if ((state.minute - forecastAt.minute >= 60 && now - forecastAt.real >= 2000) || dayNumber(state.minute) !== forecastAt.day || state.player.region !== forecastAt.region) requestForecast();
  } else if (ui.away || ui.teach || ui.welcome || ui.goalGuide || ui.recognition !== null) {
    // An open moment holds the game still. Without the bump, a modal left open
    // past thirty seconds trips the catch-up branch above, and the player
    // dismisses it into an away report they never earned.
    lastReal = now;
  }
  if (!weatherShotName) {
    // One moment at a time, and never over an overlay that outranks it. A rung
    // crossed inside an offline catch-up waits behind that catch-up's own away
    // report; momentToOpen owns the whole rule.
    if (momentToOpen(state, ui)) ui.teach = state.teachQueue.shift()!;
    // The queue itself stays put until the overlay is dismissed: it is what
    // makes the congratulation survive a reload. goalMomentToOpen already
    // refuses to reopen while goal guidance is set, so leaving it be here does
    // not requeue the overlay every frame.
    const reached = goalMomentToOpen(state, ui);
    if (reached) ui.goalGuide = { ids: unpresentedOpportunityKeys(state, calendar(state.minute, state.startDoy)), done: reached, automatic: true };
    const introduced = goalIntroductionToOpen(state, calendar(state.minute, state.startDoy), ui);
    if (introduced) ui.goalGuide = { ids: introduced, done: [], automatic: true };
    const notices = goalNoticeToOpen(state, ui);
    if (notices) ui.goalGuide = { ids: [], done: [], notices, automatic: true };
    if (!ui.away && !state.landing && !state.dead && !ui.welcome && !ui.teach && !ui.goalGuide && ui.recognition === null) {
      ui.recognition = state.wildlife.recognitionQueue[0] ?? null;
    }
  }
  if (deathTransition(wasDead, Boolean(state.dead))) beacon.died(state, Date.now());
  wasDead = Boolean(state.dead);
  beacon.tick(state, document.visibilityState === "visible", !state.dead && !state.landing && !ui.away, now);
  render(now);
  updateSpeedHistory(document, ui.speedHistory, now, GAME_MINUTES_PER_REAL_SECOND * ui.hurry.rate);
  portraitMotion.frame(document, now, document.visibilityState === "visible" && !state.dead && !state.landing && !ui.away);
  const cal = calendar(state.minute, state.startDoy);
  sounds.frame(state, world, cal, ambientTemperature(cal, localWeather(state, world)), now, !state.dead && !state.landing && !ui.away && document.visibilityState !== "hidden");
  if (now - lastSave > 5000) {
    lastSave = now;
    persistGame();
  }
  requestAnimationFrame(frame);
}

/**
 * Keeps the clicked thing where the hand left it. The order list lives in
 * #task at the top of the right-hand column and the Do list in #actions
 * further down the same scrolling .col, so giving an order grows a panel
 * above the one being clicked and every row under it slides - the list moved
 * under the pointer on nine separate occasions in the playtest, and the click
 * that follows lands on whatever took the row's place.
 *
 * The real answer is to stop stacking them, which is a layout change and not
 * this. So: measure where the clicked element sits before the render and
 * after it, and give the scroll back the difference. Nothing to restore when
 * the element is gone from the page (a confirm that replaced its own row) or
 * when it was never inside a scrolling column.
 */
function anchorScroll(target: HTMLElement): () => void {
  const col = target.closest<HTMLElement>(".col");
  if (!col) return () => {};
  const before = target.getBoundingClientRect().top;
  return () => {
    if (!target.isConnected) return;
    const after = target.getBoundingClientRect().top;
    if (after !== before) col.scrollTop += after - before;
  };
}

function onClick(ev: Event) {
  const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target) return;
  const act = target.dataset.act;
  const restoreScroll = anchorScroll(target);
  const cal = calendar(state.minute, state.startDoy);
  const rng = new Rng(state.rng);
  switch (act) {
    case "task": {
      const id = target.dataset.id as TaskId;
      if (id === "walk") {
        const arg = target.dataset.arg ?? "";
        const cell = arg.startsWith("cell:")
          ? Number(arg.slice(5))
          : regionAt(world, state.player.region).spots.find((spot) => `spot:${spot.id}` === arg)?.cell;
        if (cell !== undefined && Number.isFinite(cell)) {
          const walk = insertWalkAtTop(state, world, cell);
          startIntent(state, world, cal, rng, walk.req, walk.id);
        }
      } else if (id === "haul") {
        // Carrying a pile home is work like any other, so it goes on the list
        // as the row the click makes it: without one, the body could take the
        // minute from it and nothing would bring it back.
        orderByHand(state, world, cal, rng, { task: id, until: { kind: "once" }, deliver: "camp", where: { cell: cellOf(state, world) } }, "job");
      } else if (id === "night") {
        // A night out is the body's own sleep under a name, and the body's row
        // serves it where it stands. It never becomes a row of its own.
        startIntent(state, world, cal, rng, { task: id, until: { kind: "once" }, deliver: "camp", where: { cell: cellOf(state, world) } });
      } else {
        startTask(state, world, cal, id, target.dataset.arg || undefined, target.dataset.repeat === "1", rng);
      }
      break;
    }
    case "stop":
      stopTask(state, world);
      break;
    case "torch-out":
      putOutTorch(state);
      break;
    case "pane":
      ui.panes = { ...ui.panes, pane: target.dataset.pane as PaneId };
      savePanes(localStorage, ui.panes);
      break;
    case "subtab":
      ui.panes = toSubtab(ui.panes, target.dataset.subtab as SubtabId);
      savePanes(localStorage, ui.panes);
      break;
    case "purpose":
      ui.panes = { ...ui.panes, purpose: target.dataset.purpose as string };
      savePanes(localStorage, ui.panes);
      break;
    case "specific": {
      const kind = target.dataset.specific as keyof UiState["specific"];
      if (kind === "trees" || kind === "fish" || kind === "regions") {
        ui.specific[kind] = !ui.specific[kind];
        localStorage.setItem(SPECIFIC_KEY, JSON.stringify(ui.specific));
      }
      break;
    }
    case "zoom":
      zoomBy(target.dataset.dir === "in" ? -1 : 1);
      break;
    case "select": {
      const r = Number(target.dataset.r);
      ui.selected = r === state.player.region ? null : r;
      break;
    }
    case "eat":
      eat(state, world, target.dataset.food as FoodId, rng);
      break;
    case "feed":
      addFirewood(state, world, 36);
      break;
    case "drink":
      drink(state, world);
      break;
    case "fill":
      fillVessels(state, world);
      break;
    case "take":
    case "drop": {
      const item = target.dataset.item as ItemId;
      const n = target.dataset.n === "all" ? Number.POSITIVE_INFINITY : Number(target.dataset.n);
      if (act === "take") take(state, world, item, n);
      else drop(state, world, item, n);
      break;
    }
    case "drop-all":
      dropAll(state, world);
      break;
    case "abandon":
      ui.confirmAbandon = true;
      break;
    case "abandon-no":
      ui.confirmAbandon = false;
      break;
    case "abandon-yes":
      abandon(state, regionAt(world, state.player.region).name);
      ui.confirmAbandon = false;
      break;
    case "begin-again":
      beginAgain(state, world);
      resetForecastAt();
      break;
    case "pick-candidate":
      pickCandidate(state, Number(target.dataset.index) as 0 | 1 | 2);
      break;
    case "next-boat":
      // The first boat has no world to run yet: it is rebuilt a week later from the same seed.
      if (state.landing && state.landing.oldCamp === null) fresh(state.seed, startDoy, state.landing.boat + 1);
      else nextBoat(state, world);
      resetForecastAt();
      break;
    case "land": {
      const wasLanding = state.landing !== null;
      const heir = state.survivors.length >= 1 && state.landing?.oldCamp !== null;
      land(state, world);
      // land() no-ops without a landing or a name; only a real heir's landing is a begin-again.
      if (wasLanding && heir && state.landing === null) beacon.beganAgain(state, Date.now());
      // Every landing gets its welcome, fresh survivor or heir. The first
      // goal follows it; the manual remains available on demand.
      if (wasLanding && state.landing === null) ui.welcome = true;
      ui.confirmAbandon = false;
      resetForecastAt();
      break;
    }
    case "cemetery":
      ui.cemetery = true;
      ui.confirmLeave = false;
      break;
    case "cemetery-open":
      ui.cemetery = true;
      ui.cemeteryOpen = Number(target.dataset.index);
      break;
    case "cemetery-close":
      ui.cemetery = false;
      ui.cemeteryOpen = null;
      ui.confirmLeave = false;
      break;
    case "settings-open":
      ui.settings = true;
      break;
    case "settings-close":
      ui.settings = false;
      break;
    case "reset-world":
      if (!window.confirm("Reset all world data? This cannot be undone.")) break;
      clearSave();
      fresh();
      ui.settings = false;
      lastReal = performance.now();
      render();
      return;
    case "manual-open":
      ui.manual = true;
      break;
    case "manual-close":
      ui.manual = false;
      break;
    case "welcome-close":
      ui.welcome = false;
      lastReal = performance.now();
      break;
    case "teach-close":
      ui.teach = null;
      // The same bump the away report's dismiss does: the minutes the moment
      // was open were paused, not spent away.
      lastReal = performance.now();
      break;
    case "goal-close":
      if (ui.goalGuide?.automatic) acknowledgeOpportunities(state, ui.goalGuide.ids, ui.goalGuide.done, ui.goalGuide.notices);
      ui.goalGuide = null;
      // The same bump the rung moment's dismiss does: the minutes the
      // screen was open were paused, not spent away.
      lastReal = performance.now();
      break;
    case "shopping-track": {
      const id = target.dataset.id;
      if (id === "craft" || id === "build") trackShopping(state, id, target.dataset.arg ?? "");
      break;
    }
    case "shopping-clear":
      clearShopping(state);
      break;
    case "shopping-find": {
      const item = target.dataset.item as ItemId;
      ui.filter = shoppingQuery(item);
      ui.panes = { ...ui.panes, pane: "do" };
      savePanes(localStorage, ui.panes);
      const box = document.querySelector<HTMLInputElement>("[data-do=filter]");
      if (box) box.value = ui.filter;
      break;
    }
    case "goal-open": {
      const id = target.dataset.goal;
      if (id) ui.goalGuide = { ids: [id as import("./sim/types").OpportunityKey], done: [], automatic: false };
      break;
    }
    case "recognition-close":
      if (ui.recognition !== null && state.wildlife.recognitionQueue[0] === ui.recognition) state.wildlife.recognitionQueue.shift();
      ui.recognition = null;
      lastReal = performance.now();
      break;
    case "leave-world":
      ui.confirmLeave = true;
      break;
    case "leave-world-no":
      ui.confirmLeave = false;
      break;
    case "leave-world-yes":
      ui.cemetery = false;
      ui.confirmLeave = false;
      clearSave();
      fresh();
      break;
    case "dismiss":
      ui.away = null;
      lastReal = performance.now();
      break;
    case "intent":
    case "camp-yes": {
      const id = target.dataset.id as TaskId;
      // Moving a camp asks first: the row swaps to its question, and only the
      // yes acts. A first siting moves nothing and leaves nothing, so it acts on
      // the click, as every other row does.
      if (id === "makeCamp" && act === "intent" && campCellOf(state, world) !== null) {
        ui.confirmCamp = true;
        break;
      }
      ui.confirmCamp = false;
      const { req, kind } = rowRequest(defaultChoiceFor(id), id, target.dataset.arg || undefined);
      // The site is where the click happened, not wherever the runner is standing when
      // the order finally starts; RowChoice has no cell of its own to carry that.
      if (req.task === "makeCamp") req.where = { cell: cellOf(state, world) };
      // The row is greyed with no button when the gate is shut; this is the belt to that brace.
      if (orderGate(state, req, kind).ok) orderByHand(state, world, cal, rng, req, kind);
      break;
    }
    case "camp-no":
      ui.confirmCamp = false;
      break;
    case "kw": {
      // A concept tag asks for its own rows exactly, not for the letters of its
      // name: see conceptAsked in dopanel.ts. The box is static markup outside
      // every panel, so its value is written here rather than rendered.
      ui.filter = `${KW_PREFIX}${target.dataset.kw ?? ""}`;
      const box = document.querySelector<HTMLInputElement>("[data-do=filter]");
      if (box) box.value = ui.filter;
      break;
    }
    case "row-more": {
      const id = target.dataset.id as TaskId;
      const arg = target.dataset.arg ?? "";
      if (ui.open && ui.open.id === id && ui.open.arg === arg) ui.open = null;
      else {
        ui.open = { id, arg };
        ui.choice = defaultChoiceFor(id);
      }
      break;
    }
    case "row-kind": {
      const id = target.dataset.id as TaskId;
      const arg = target.dataset.arg || undefined;
      if (!target.classList.contains("off")) {
        ui.choice.until = target.dataset.until as RowChoice["until"];
        const { req, kind } = rowRequest(ui.choice, id, arg);
        if (orderGate(state, req, kind).ok) orderByHand(state, world, cal, rng, req, kind);
        ui.open = null;
      }
      break;
    }
    case "row-deliver":
      ui.choice.deliver = ui.choice.deliver === "camp" ? "leave" : "camp";
      break;
    case "hurry":
      hurryClick(ui.hurry, hurryKind(state), state.intent?.orderId ?? null);
      break;
    case "finish": {
      const id = target.dataset.id as TaskId;
      const arg = target.dataset.arg || undefined;
      // Located work names its cell; carried work has none, so it resolves through
      // "nearest" - camp for camp-bound work, wherever the player stands for craft.
      const where: Where = target.dataset.cell !== undefined ? { cell: Number(target.dataset.cell) } : "nearest";
      orderByHand(state, world, cal, rng, { task: id, arg, until: { kind: "once" }, deliver: "leave", where }, "job");
      break;
    }
    case "order-up":
      moveOrderByHand(state, world, cal, rng, Number(target.dataset.id), -1);
      break;
    case "order-down":
      moveOrderByHand(state, world, cal, rng, Number(target.dataset.id), 1);
      break;
    case "order-remove":
      removeOrderByHand(state, world, cal, rng, Number(target.dataset.id));
      break;
    case "order-pin":
      pinOrderByHand(state, world, cal, rng, Number(target.dataset.id));
      break;
  }
  state.rng = rng.s;
  // After the rng write-back, so the request the click triggers reads the committed rng.
  if (FORECAST_ACTS.includes(target.dataset.act!)) requestForecast();
  persistGame();
  render();
  restoreScroll();
}

function zoomBy(delta: number) {
  ui.zoom = Math.max(0, Math.min(LEVELS.length - 1, ui.zoom + delta));
}

boot();
const weatherShot = weatherShotName ? weatherShotFixture(weatherShotName) : null;
if (weatherShot) {
  state = weatherShot.state;
  world = weatherShot.world;
  ui.zoom = weatherShot.definition.zoom;
  ui.welcome = false;
  ui.teach = null;
  ui.goalGuide = null;
}
beacon.opened(state);
// Built once world is real; the worker keeps its own copy keyed by seed, so a
// later fresh() with a new world does not leave it stale.
const forecaster = createForecaster(
  world,
  typeof Worker === "undefined" ? undefined : new Worker(new URL("./sim/forecast.worker.ts", import.meta.url), { type: "module" }),
);
forecaster.onRow = (row) => { noteMonthRow(state, row); };
/** The actions that change what the forecast reads: orders, needs, camp state. */
const FORECAST_ACTS = [
  "task", "stop", "intent", "row-kind", "finish", "order-up", "order-down", "order-remove", "order-pin", "dismiss",
  "eat", "feed", "drink", "fill", "take", "drop", "drop-all",
];
/** A request when nothing overlays the game: the list, the day, the dial, the region and the hour each call this; the frame calls it on a cadence. */
function requestForecast(): void {
  if (state.dead || state.landing || ui.away) return;
  forecaster.request(state);
  forecastAt = { minute: state.minute, day: dayNumber(state.minute), region: state.player.region, real: performance.now() };
}
setCueSink((c) => sounds.cue(c));
setWildlifeEventSink(onWildlifeStartle);
// Registered before mountControl's own capture listeners, so unlock() always
// runs before the control's show() on the same click or keydown - otherwise
// the note reads stale for one extra interaction.
document.addEventListener("click", () => audio.unlock(), { capture: true });
document.addEventListener("keydown", () => audio.unlock(), { capture: true });
// The build's own name, written once: it cannot change while the page is open.
setPanel("build", buildHtml());
mountControl(document.getElementById("sound")!, audio);
awayDial = mountAwayDial(document.getElementById("forecastbox")!, () => state.awayHours, (h) => { state.awayHours = h; requestForecast(); });
mountBeaconPanel(document.getElementById("beacon")!, beacon, beaconConfigured, () => state, (on) => {
  if (on && beaconConfigured && !sinkMade) {
    sink = makeSink();
    beacon.setSink(sink);
    sinkMade = true;
  }
  // Off cannot wait for the next event: the vendor session ends now, not on its next send.
  if (!on) sink?.stop?.();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") audio.suspend();
  else audio.resume();
});
document.addEventListener("click", onClick);
document.addEventListener("keydown", (ev) => {
  if (ev.key === "+" || ev.key === "=") zoomBy(-1);
  else if (ev.key === "-" || ev.key === "_") zoomBy(1);
  else return;
  render();
});
/** The order condition an element writes, or undefined: the open row's when block is written through it from both listeners below. */
function whenFieldOf(el: Element): WhenField | undefined {
  return WHEN_FIELDS.find((f) => el.hasAttribute(`data-row-${f}`));
}
/** What a condition field says, as setWhenField reads it: a checkbox's own value is "on" whether it is ticked or not, so its state is the value. */
function whenFieldValue(el: HTMLInputElement): string {
  return el.type === "checkbox" ? (el.checked ? "spend" : "") : el.value;
}
// Committed on every keystroke so the field is never a stroke behind; no render()
// here, since setPanel already refuses to redraw the panel while this field has
// focus (a redraw between keystrokes is what used to eat the field's focus).
document.addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  const when = whenFieldOf(el);
  if (el.matches("[data-row-n]")) {
    commitChoiceN(ui, el.value);
  } else if (when) {
    setWhenField(ui.choice.when, when, whenFieldValue(el));
  } else if (el.matches("[data-name]") && state.landing) {
    const t = el.value.trim().slice(0, 40);
    const i = t.indexOf(" ");
    state.landing.name = i < 0
      ? { first: t || state.landing.name.first, last: state.landing.name.last }
      : { first: t.slice(0, i), last: t.slice(i + 1).trim() };
  } else if (el.matches("[data-do=filter]")) {
    // No render here on purpose. The frame loop redraws everything anyway, so
    // the list follows the keystroke within one frame; rendering from the
    // keystroke as well doubles a frame's work on the one input a player
    // holds down a key in.
    ui.filter = el.value;
  }
});
document.addEventListener("change", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.matches("[data-display=travel]")) {
    const value = el.value;
    if (value === "distance" || value === "time" || value === "both") {
      ui.travelDisplay = value;
      saveTravelDisplay(value, localStorage);
      lastTipKey = "";
      render();
    }
    return;
  }
  if (el.matches("[data-display=cloud-shadows]")) {
    ui.cloudShadows = el.checked;
    saveCloudShadows(ui.cloudShadows, localStorage);
    render();
    return;
  }
  if (el.matches("[data-act=row-where]")) {
    ui.choice.where = el.value as RowChoice["where"];
    render();
    return;
  }
  const when = whenFieldOf(el);
  if (when) {
    setWhenField(ui.choice.when, when, whenFieldValue(el));
    render();
    return;
  }
  if (!el.matches("[data-row-n]")) return;
  commitChoiceN(ui, el.value);
  // A blank field commits to 1 already; force the box to show it, since a
  // render that produces the same html as before is one setPanel skips.
  el.value = String(ui.choice.n);
  render();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistGame();
});
window.addEventListener("pagehide", persistGame);
// The terrain letters never change, so the legend is set once rather than rebuilt with the map.
document.querySelector<HTMLElement>("#map .legend")!.innerHTML = legendHtml();

// The map's tooltip. pointermove covers mouse, pen and a touch drag with one
// listener; a tap fires it too, which is what gives a touch device the
// tooltip at all. The cell is read from the pointer's position rather than
// from any glyph, so nothing on the board has to carry state that could go
// stale under it.
{
  const board = document.getElementById("mapdyn")!;
  let pointerType = "mouse";
  let touchCell: number | null = null;
  let targetGlyph: HTMLElement | null = null;
  const clearTarget = () => {
    targetGlyph?.classList.remove("target");
    targetGlyph = null;
  };
  const showTarget = (cell: number) => {
    clearTarget();
    const l = levelAt(ui.zoom);
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    const x = cell % world.w;
    const y = Math.floor(cell / world.w);
    const gx = Math.floor((x - x0) / l.cells);
    const gy = Math.floor((y - y0) / l.cells);
    if (gx < 0 || gy < 0 || gx >= l.w || gy >= l.h) return;
    const glyph = document.querySelector<HTMLElement>("#mapdyn .grid")?.children.item(gy * l.w + gx);
    if (!(glyph instanceof HTMLElement) || !glyph.classList.contains("c")) return;
    glyph.classList.add("target");
    targetGlyph = glyph;
  };
  const cellUnder = (ev: { clientX: number; clientY: number }): number | null => {
    const grid = board.querySelector<HTMLElement>(".grid");
    return grid ? cellFromClient(world, state, ui, ev.clientX, ev.clientY, grid.getBoundingClientRect()) : null;
  };
  board.addEventListener("pointermove", (ev) => {
    ui.hover = cellUnder(ev);
  });
  board.addEventListener("pointerdown", (ev) => {
    pointerType = ev.pointerType;
  });
  board.addEventListener("click", (ev) => {
    // Touch keeps its first tap for inspecting the cell. A mouse click on
    // known ground in this region is an explicit destination in its own
    // right, whether or not generation happened to name that cell a place.
    const cell = cellUnder(ev);
    if (cell === null || cell === cellOf(state, world)) return;
    if (pointerType === "touch" && touchCell !== cell) {
      touchCell = cell;
      ui.hover = cell;
      render();
      return;
    }
    const cal = calendar(state.minute, state.startDoy);
    const frontier = !isKnown(state, cell)
      ? frontierRoute(state, world, cellOf(state, world), cell, "none")
      : null;
    if (!isKnown(state, cell) && !frontier) return;
    ev.stopPropagation();
    const rng = new Rng(state.rng);
    const walk = insertWalkAtTop(state, world, cell);
    startIntent(state, world, cal, rng, walk.req, walk.id);
    state.rng = rng.s;
    persistGame();
    render();
  });
  board.addEventListener("pointerleave", (ev) => {
    if (ev.pointerType !== "touch") ui.hover = null;
  });
  board.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ui.hover = null;
      board.querySelector<HTMLElement>(".grid")?.focus();
      render();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const move = moves[ev.key];
    if (!move) return;
    const grid = board.querySelector<HTMLElement>(".grid");
    if (!grid) return;
    const active = document.activeElement instanceof HTMLElement && document.activeElement.matches(".c")
      ? document.activeElement
      : grid.querySelector<HTMLElement>(".mk-player") ?? grid.querySelector<HTMLElement>("[data-map-cell]");
    if (!active) return;
    const x = Number(active.dataset.mapX) + move[0];
    const y = Number(active.dataset.mapY) + move[1];
    const next = grid.querySelector<HTMLElement>(`[data-map-x="${x}"][data-map-y="${y}"][data-map-cell]`);
    if (!next) return;
    ev.preventDefault();
    next.focus();
    ui.hover = Number(next.dataset.mapCell);
    render();
  });

  // A row that names somewhere to go points at it while the pointer is on
  // it: the map marks the cell and the box reads it out, which is the whole
  // of "where would this take me" without a click or a guess.
  const map = document.getElementById("map")!;
  map.addEventListener("pointerover", (ev) => {
    const row = (ev.target as HTMLElement | null)?.closest?.("[data-at]") as HTMLElement | null;
    if (!row) return;
    const cell = Number(row.dataset.at);
    if (Number.isFinite(cell)) {
      ui.hover = cell;
      showTarget(cell);
    }
  });
  map.addEventListener("pointerout", (ev) => {
    const from = (ev.target as HTMLElement | null)?.closest?.("[data-at]");
    const to = (ev.relatedTarget as HTMLElement | null)?.closest?.("[data-at]");
    if (from && !to && ev.pointerType !== "touch") {
      ui.hover = null;
      clearTarget();
    }
  });
}
render();
portraitMotion.frame(document, performance.now(), document.visibilityState === "visible" && !state.dead && !state.landing && !ui.away);
requestAnimationFrame(frame);

// For poking at the run from the console and for browser checks.
declare global {
  interface Window { survidle: {
    get state(): GameState; get world(): World; advance(minutes: number): void; speed: number;
    weatherShot: null | { name: WeatherShotName; visibleCells: number };
    startleSetup?(scenario: import("../scripts/startle-seeds").StartleScenario): Promise<void>;
    startleStep?(): void;
    startleAdvance?(minutes: number): void;
    startleEnd?(): void;
  } }
}
window.survidle = {
  get state() { return state; },
  get world() { return world; },
  advance(minutes: number) { advance(state, world, minutes); render(); },
  speed,
  weatherShot: weatherShot ? { name: weatherShotName!, visibleCells: weatherShot.visible.size } : null,
};
if (import.meta.env.DEV) {
  window.survidle.startleSetup = async (scenario) => {
    const harness = await import("../scripts/startle-seeds");
    const scene = harness.prepareStartleScenario(scenario);
    startleRestore?.();
    const previous = { state, world, ui: { ...ui } };
    startleRestore = () => {
      state = previous.state;
      world = previous.world;
      Object.assign(ui, previous.ui);
      startleRestore = null;
      startleStep = null;
      lastReal = performance.now();
      lastSave = lastReal;
      resetPanels();
      resetForecastAt();
      render();
    };
    state = scene.state;
    world = scene.world;
    Object.assign(ui, newUiState(), { zoom: 0, welcome: false });
    resetPanels();
    startleStep = () => { harness.stepStartleScenario(scene, scenario, true); render(); };
    render();
  };
  window.survidle.startleStep = () => startleStep?.();
  window.survidle.startleAdvance = (minutes) => {
    advance(state, world, minutes, { wildlife: "detailed", live: false });
    render();
  };
  window.survidle.startleEnd = () => startleRestore?.();
}
