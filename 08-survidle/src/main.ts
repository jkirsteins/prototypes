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
import { drop, dropAll, take } from "./sim/actions";
import { advance } from "./sim/advance";
import { calendar, dayNumber } from "./sim/calendar";
import { setCueSink } from "./sim/cues";
import { setWildlifeEventSink } from "./sim/wildlife-events";
import type { WildlifeStartleEvent } from "./sim/wildlife-encounter";
import { since } from "./sim/epitaph";
import { createForecaster, noteMonthRow } from "./sim/forecaster";
import { log } from "./sim/log";
import { startIntent, type Where } from "./sim/intent";
import { orderByHand, orderGate } from "./sim/ladder";
import { beginAgain, land, nextBoat, pickCandidate } from "./sim/landing";
import { isKnown, knowledgeGen, markKnown } from "./sim/mapped";
import { patchId, patchXY } from "./world/spatial";
import { frontierRoute } from "./sim/routing";
import { newWorld } from "./sim/newgame";
import { moveOrderByHand, pinOrderByHand, removeOrderByHand } from "./sim/orders";
import { abandon, feltTemperature } from "./sim/player";
import { campCellOf, cellOf, placeAtPatch } from "./sim/position";
import { current } from "./sim/record";
import { fillPopulations } from "./sim/regionstate";
import { awaySeconds, catchUp, clearSave, knowLoadedGround, loadGame, SAVE_KEY, saveGame } from "./sim/save";
import { recordOpportunityEvent } from "./sim/opportunities";
import { canPersist, inspectSave } from "./sim/world-version";
import { clearShopping, trackShopping } from "./sim/shopping";
import { putOutTorch, startTask, stopTask } from "./sim/tasks";
import type { GameState, ItemId, OpportunityEvent, OpportunityKey, StockGroupId, TaskId } from "./sim/types";
import { insertWalkAtTop } from "./sim/walkorders";
import { ambientTemperature, localWeather } from "./sim/weather";
import { GAME_MINUTES_PER_REAL_SECOND } from "./units";
import { updateBars, updateFills } from "./ui/bars";
import { mountBeaconPanel } from "./ui/beacon-panel";
import { buildHtml } from "./ui/build";
import { mountAwayDial, type AwayDial } from "./ui/dial";
import { chipsHtml, doHtml, doPurposesHtml, KW_PREFIX, purposeCounts, subtabCounts } from "./ui/dopanel";
import { catalogPage, opportunityCatalogAction, opportunityCatalogHtml, opportunityCatalogKeyboard } from "./ui/opportunity-catalog";
import { opportunityPanelHtml } from "./ui/opportunity-panel";
import { nextOpportunityPresentation, opportunityModalAction, opportunityModalHtml, opportunityModalKeyboard } from "./ui/opportunity-modal";
import { loadPanes, PANE_IDS, type PaneId, paneTabsHtml, savePanes, subtabsHtml, toSubtab } from "./ui/panes";
import { paneForOpportunity, PURPOSES } from "./ui/purpose";

/**
 * Move off a pane that has nothing in it, once, at startup.
 *
 * A pane is remembered across reloads, and rows are now revealed a rung at
 * a time - so a save from a later run, or from before this gate existed,
 * can name a purpose that holds nothing today. The player then opens the
 * game onto a blank panel, which reads as something they broke.
 *
 * Only ever fires when the pane is empty, so it can take nothing away, and
 * only while the player has not chosen for themselves this session: after
 * that, an empty pane is somewhere they asked to be and they are left in it.
 */
let panesSettled = false;
function settlePanes(): void {
  if (panesSettled || ui.filter.trim()) return;
  panesSettled = true;
  const counts = purposeCounts(state, world, ui);
  if ((counts[ui.panes.purpose] ?? 0) > 0) return;
  const filled = PURPOSES[ui.panes.subtab].find((q) => (counts[q] ?? 0) > 0);
  if (filled) {
    ui.panes = { ...ui.panes, purpose: filled };
  } else {
    const where = currentOpportunityPane(state);
    if (where) ui.panes = { ...ui.panes, pane: "do", subtab: where.subtab, purpose: where.purpose };
  }
  savePanes(localStorage, ui.panes);
}

/** Where the Do pane should stand for whatever the game is currently asking for. */
function currentOpportunityPane(state: GameState): { subtab: SubtabId; purpose: string } | null {
  const key = state.opportunities.current;
  return key ? paneForOpportunity(key) : null;
}
import type { SubtabId } from "./ui/purpose";
import { effectsSnapshot, LEVELS, legendHtml, mapAggregateAtPoint, mapBoardHtml, mapKey, mapModelSnapshot, type MapTarget, mapTargetAtClient, mapViewportBounds, setBoardLight, setPointedGlyph, type TargetResolution, updateEffects } from "./ui/map";
import { drawBoard, releaseBoard } from "./ui/mapcanvas";
import { loadCloudShadows, saveCloudShadows } from "./ui/map-preferences";
import { loadRateDisplay, saveRateDisplay, type RateDisplay } from "./ui/rate";
import { stockPanelHtml, stocksHtml } from "./ui/stocks";
import { mapInventoryHtml, tipHtml, tipKey } from "./ui/tip";
import {
  awayHtml, campHtml, cemeteryHtml, forecastHtml, gearHtml, inventoryHtml, journalHtml, landingHtml, logHtml,
  manualHtml, oldWorldHtml, queueHtml, skillsHtml, placesHtml, statsHtml, taskHtml, tombstoneHtml, weatherHtml, weatherKey,
} from "./ui/panels";
import { conceptHtml, momentToOpen, welcomeHtml } from "./ui/teachpanel";
import { commitChoiceN, defaultChoiceFor, enqueueWildlifeStartle, heldQuery, newUiState, resetPanels, rowRequest, setPanel, setWhenField, simulationPaused, WHEN_FIELDS, type RowChoice, type UiState, type WhenField } from "./ui/render";
import { advanceHurry, hurryClick, hurryKind, newHurry } from "./ui/hurry";
import { createPortraitMotion } from "./ui/portrait-motion";
import { updateSky } from "./ui/sky";
import { newSpeedHistory, updateSpeedHistory } from "./ui/speed-history";
import { shoppingHtml, shoppingQuery } from "./ui/shopping";
import { loadTravelDisplay, saveTravelDisplay } from "./ui/travel";
import { hideLoading, showLoading } from "./ui/loading";
import { recognitionHtml } from "./ui/wildlife-panel";
import { type WorldCacheStats, worldCacheStats } from "./world/aggregate";
import { releaseViewsheds } from "./sim/sight";
import { bindGround, FINE_CHUNK_HIDDEN_LIMIT, trimFineChunks } from "./world/cells";
import { regionAt, type World } from "./world/gen";
import { loadWorld } from "./world/worldloader";

const params = new URLSearchParams(location.search);
// The face self-test page: a page of generated faces to judge, in place of the game.
if (params.has("faces")) location.replace(`${import.meta.env.BASE_URL}faces.html`);
/** Test aid: how many times faster than 60x the clock runs. Not a game feature. */
const speed = Math.max(0.1, Number(params.get("speed")) || 1);
/** Test aid: how many times faster the light on open water ripples; 2 halves all three wave periods. Not a game feature. */
const shimmerSpeed = Number(params.get("shimmer"));
if (Number.isFinite(shimmerSpeed) && shimmerSpeed > 0) document.documentElement.style.setProperty("--water-shimmer-speed", String(shimmerSpeed));
const forcedSeed = params.get("seed");
/** Test aid beside seed: the day of year the run begins on, for a summer or autumn pass. Not a game feature. */
const forcedDay = params.get("day");
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
/** Set when boot() finds a save from before the fine lattice; cleared the moment fresh() builds a real world. */
let oldWorldSave = false;

// Assigned by boot()/fresh() before anything reads it; the assertion is for TS,
// which cannot see the assignment through the function call.
let state!: GameState;
let world!: World;
// Development fixtures hold their clock outside GameState and restore the run.
let startleRestore: (() => void) | null = null;
let startleStep: (() => void) | null = null;
function persistGame(): void {
  if (!canPersist(oldWorldSave)) return;
  if (!(import.meta.env.DEV && startleRestore)) saveGame(state);
}
const ui = newUiState();
ui.travelDisplay = loadTravelDisplay(localStorage);
ui.cloudShadows = loadCloudShadows(localStorage);
ui.rateDisplay = loadRateDisplay(localStorage);
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
// Assigned once the forecaster exists, below; fresh() runs once before that
// during boot(), when there is no forecast waiting on a world.
let tellForecaster: ((w: World) => void) | null = null;

// A world is being made. The run underneath stands still while it is: the
// frame does nothing, and a second click cannot start a second solve.
let solving = false;
let startupReady = false;

/**
 * A new run: the world is solved behind the bar first, so nothing starts on a
 * world that is not there yet.
 *
 * `persist` is false only for the world boot() builds under an old-world
 * message: that world exists so the page has something to render behind the
 * overlay, and saving it here would silently overwrite the very save the
 * message is about, before the player has chosen to discard it.
 */
async function fresh(seed = (Math.random() * 0xffffffff) >>> 0, startDoy?: number, boat = 0, persist = true): Promise<void> {
  if (solving) return;
  solving = true;
  showLoading("Loading...", 0);
  // The finally is what makes the flag and the bar safe to hold: a solve that
  // throws would otherwise leave the frame standing still with every later
  // click a no-op, behind a full-page overlay that never comes down.
  try {
    const loaded = await loadWorld(seed, showLoading);
    const g = newWorld(seed, boat, startDoy, loaded);
    state = g.state;
    world = g.world;
  } catch (err) {
    showLoading(`the world could not be made: ${err instanceof Error ? err.message : String(err)}`, 0);
    throw err;
  } finally {
    solving = false;
  }
  wasDead = false;
  ui.selected = null;
  ui.away = null;
  ui.hurry = newHurry();
  ui.speedHistory = newSpeedHistory();
  ui.wildlifeStartles = [];
  ui.wildlifeStartleIds.clear();
  ui.confirmAbandon = false;
  // A fresh world stands where its opportunity is, not on a constant: on a
  // landing that is "Make camp here", and Gather > Woodcutting holds nothing.
  ui.panes = loadPanes(localStorage, currentOpportunityPane(state));
  ui.confirmCamp = false;
  resetPanels();
  resetForecastAt();
  // Only a persisted fresh world is a real commit away from old-world: the
  // one boot() builds to render behind the message (persist: false) must
  // leave the flag - and the save on disk it is warning about - alone.
  if (persist) {
    oldWorldSave = false;
    persistGame();
  }
  awayDial?.refresh();
  tellForecaster?.(world);
  if (startupReady) {
    render();
    updateEffects();
    hideLoading();
  }
}

async function boot() {
  ui.panes = loadPanes(localStorage);
  const savedText = forcedSeed || startDoy !== undefined ? null : localStorage.getItem(SAVE_KEY);
  if (savedText && inspectSave(savedText) === "old-world") {
    oldWorldSave = true;
    await fresh(forcedSeed ? Number(forcedSeed) >>> 0 : undefined, startDoy, 0, false);
    return;
  }
  let refusal = "";
  const saved = forcedSeed || startDoy !== undefined ? null : loadGame(localStorage, (reason) => { refusal = reason; });
  if (saved) {
    state = saved.state;
    // Set before the catch-up below runs, so a death the catch-up itself deals
    // is not already read as "seen": the first frame must still emit died for it.
    wasDead = Boolean(saved.state.dead);
    solving = true;
    try {
      world = await loadWorld(state.seed, showLoading);
    } finally {
      solving = false;
    }
    // Before anything reads terrain: the loaded run's clearings are part of it.
    bindGround(world, state);
    fillPopulations(state, world);
    knowLoadedGround(state, world);
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
    await fresh(forcedSeed ? Number(forcedSeed) >>> 0 : undefined, startDoy);
    // A save this build cannot read is not silently dropped: the new run says why it is new.
    if (refusal) log(state, refusal);
  }
}

let lastTipKey = "";
/**
 * The block the pointer last resolved through, so the tooltip can say what
 * else the glyph holds. Hover set from a Do row names a patch and no block,
 * and clears this with it.
 */
let hoverTarget: MapTarget | null = null;
let lastMapKey = "";
let lastWeatherKey = "";
/**
 * The three separate claims on the stocks strip's open group. `ui.stockOpen`
 * (what the panels actually read) is derived from these by `syncStockOpen`
 * rather than written by a handler directly, because a mouse leaving a
 * hovered button must not close a group a tab still holds focus on, and a
 * tap toggling its own claim must not be undone by a browser that also
 * hands the tapped button native keyboard focus. A tap outranks focus,
 * which outranks a bare hover.
 */
let stockTap: StockGroupId | null = null;
let stockFocus: StockGroupId | null = null;
let stockHover: StockGroupId | null = null;
/**
 * Shows or hides an element only when that changes it. `hidden` set to the
 * value it already holds still records a mutation and invalidates style,
 * and this runs for every pane on every render.
 */
function setHidden(el: HTMLElement | null, hidden: boolean) {
  if (el && el.hidden !== hidden) el.hidden = hidden;
}
/**
 * The map's tooltip, on its own so a pointer event can draw it at once
 * instead of waiting up to a render interval. Its text is guarded by its
 * own key so a pointer crossing one cell redraws it once.
 */
/**
 * Paints the board from the model the last build produced. The map's key is
 * the picture's identity: a call with the same key draws nothing, so this
 * is safe to call after every panel morph and costs a string compare on a
 * still minute.
 */
function paintBoard(key: string): void {
  const model = mapModelSnapshot();
  if (model) drawBoard(model, key);
}

function renderTip(cal = calendar(state.minute, state.startDoy)) {
  const tip = document.getElementById("maptip")!;
  setHidden(tip, ui.hover === null);
  if (ui.hover !== null) {
    const tk = tipKey(state, world, cal, ui.hover, hoverTarget);
    if (tk !== lastTipKey) {
      lastTipKey = tk;
      setPanel("maptip", tipHtml(state, world, cal, ui.hover, ui.travelDisplay, hoverTarget));
    }
  }
}
/**
 * The opened stock group, on its own so a hover or a tap can draw it at
 * once instead of waiting up to a render interval. `setPanel` itself skips
 * the write when the group's own reading has not moved, so drawing it
 * unconditionally here costs nothing on a still frame.
 */
function renderStockPanel(cal = calendar(state.minute, state.startDoy)) {
  const panel = document.getElementById("stockpanel")!;
  setHidden(panel, ui.stockOpen === null);
  if (ui.stockOpen !== null) setPanel("stockpanel", stockPanelHtml(state, world, cal, ui, ui.stockOpen));
}
/** Recomputes `ui.stockOpen` from the tap, focus and hover claims and draws it. */
function syncStockOpen() {
  ui.stockOpen = stockTap ?? stockFocus ?? stockHover;
  renderStockPanel();
}
// Match the existing layout breakpoint; content height never changes page size.
function opportunityPageSize(): number { return window.matchMedia("(max-width: 700px)").matches ? 6 : 8; }
let opportunityOpener: HTMLElement | null = null;

function render(nowMs = performance.now()) {
  // Arriving where you were looking ends the looking.
  if (ui.selected === state.player.region) ui.selected = null;
  const cal = calendar(state.minute, state.startDoy);
  const ambient = ambientTemperature(cal, localWeather(state, world));
  setPanel("stocks", stocksHtml(state, world, cal, ui));
  renderStockPanel(cal);
  setPanel("stats", statsHtml(state, world, cal, ambient, ui));
  setPanel("camp", campHtml(state, world, cal, ui.rateDisplay));
  setPanel("maptravel", placesHtml(state, world, cal, ui.travelDisplay));
  setPanel("mapinventory", mapInventoryHtml(state, world, cal, ui.hover));
  setPanel("gear", gearHtml(state, world, cal, feltTemperature(state, world, ambient)));
  setPanel("skills", skillsHtml(state));
  setPanel("opportunities", opportunityPanelHtml(state));
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
    setPanel("mapdyn", mapBoardHtml(world, state, ui, cal, nowMs));
    paintBoard(key);
    if (!ui.wildlifeStartles.length) break;
  }
  setPanel("task", taskHtml(state, world, cal, ui.hurry));
  setPanel("orders", queueHtml(state, world, cal));
  setPanel("forecast", forecastHtml(forecaster.view(), state));
  setPanel("panetabs", paneTabsHtml(ui.panes));
  settlePanes();
  setPanel("dosubs", ui.filter.trim() ? "" : subtabsHtml(ui.panes, subtabCounts(state, world, ui)));
  setPanel("dochips", chipsHtml(state, world, ui));
  // Shown and hidden, never rendered on demand: a pane built when it is
  // asked for is a pane whose scroll position starts again every time.
  for (const id of PANE_IDS) setHidden(document.getElementById(`pane-${id}`), id !== ui.panes.pane);
  // The tooltip is shown and hidden, never created and destroyed: a box
  // rebuilt under the pointer flickers, and one detached under it never
  // gets the leave that would have closed it. Its text is guarded by its
  // own key so a pointer crossing one cell redraws it once.
  renderTip(cal);
  setPanel("dopurposes", doPurposesHtml(state, world, ui));
  setPanel("doitems", doHtml(state, world, cal, ui));
  setPanel("inventory", inventoryHtml(state, world, cal, ui.travelDisplay));
  setPanel("log", logHtml(state));
  setPanel("journal", journalHtml(state, cal, ui));
  updateBars(state, world, document, { hurry: ui.hurry, speed });
  updateFills(state);
  setBoardLight(updateSky(state, cal, ambient));

  // The settings panel is static markup with its own listeners (the slider must
  // not be redrawn mid-drag), so it is shown and hidden rather than rewritten.
  setHidden(document.getElementById("settings"), !ui.settings);
  const travelSelect = heldQuery<HTMLSelectElement>(document, "[data-display=travel]");
  if (travelSelect && travelSelect.value !== ui.travelDisplay) travelSelect.value = ui.travelDisplay;
  const cloudShadows = document.querySelector<HTMLInputElement>("[data-display=cloud-shadows]");
  if (cloudShadows && cloudShadows.checked !== ui.cloudShadows) cloudShadows.checked = ui.cloudShadows;
  const rates = document.querySelector<HTMLSelectElement>("[data-display=rates]");
  if (rates && rates.value !== ui.rateDisplay) rates.value = ui.rateDisplay;

  const overlay = document.getElementById("overlay")!;
  if (!oldWorldSave && !ui.opportunityPresentation) ui.opportunityPresentation = nextOpportunityPresentation(state, ui);
  if (oldWorldSave) {
    setPanel("overlay", oldWorldHtml());
    overlay.hidden = false;
  } else if (ui.manual) {
    setPanel("overlay", manualHtml());
    setHidden(overlay, false);
  } else if (ui.cemetery) {
    setPanel("overlay", cemeteryHtml(state, ui));
    setHidden(overlay, false);
  } else if (ui.away) {
    setPanel("overlay", awayHtml(ui.away, awayInfo?.seconds ?? 0, awayInfo?.capped ?? false, since(current(state), ui.awayFromDay, current(state).name.first), current(state).person, current(state).name.first));
    setHidden(overlay, false);
  } else if (state.landing) {
    setPanel("overlay", landingHtml(state, world));
    setHidden(overlay, false);
  } else if (state.dead) {
    setPanel("overlay", tombstoneHtml(state, world, ui));
    setHidden(overlay, false);
  } else if (ui.welcome) {
    setPanel("overlay", welcomeHtml(state, cal));
    setHidden(overlay, false);
  } else if (ui.teach) {
    setPanel("overlay", conceptHtml(state, world, cal, ui.teach));
    setHidden(overlay, false);
  } else if (ui.recognition !== null) {
    setPanel("overlay", recognitionHtml(state, ui.recognition));
    setHidden(overlay, false);
  } else if (ui.opportunityPresentation) {
    const newBatch = overlay.querySelector<HTMLElement>(".opportunity-modal")?.dataset.notice !== ui.opportunityPresentation.id;
    setPanel("overlay", opportunityModalHtml(state, ui.opportunityPresentation));
    setHidden(overlay, false);
    if (newBatch || !overlay.contains(document.activeElement)) {
      // Start long batches at their heading, not at an OK below the fold.
      overlay.scrollTop = 0;
      overlay.querySelector<HTMLElement>("#opportunity-modal-heading")?.focus({ preventScroll: true });
    }
  } else if (ui.opportunityCatalog.open) {
    ui.opportunityCatalog.page = catalogPage(state, ui.opportunityCatalog.category, ui.opportunityCatalog.page, opportunityPageSize()).page;
    setPanel("overlay", opportunityCatalogHtml(state, ui.opportunityCatalog, opportunityPageSize()));
    setHidden(overlay, false);
    if (!overlay.contains(document.activeElement)) overlay.querySelector<HTMLButtonElement>('[data-act="opportunity-close"]')?.focus();
  } else {
    setHidden(overlay, true);
  }
}

let lastReal = performance.now();
let lastSave = performance.now();
/** How often the panels are rendered from state: ten times a second, a tenth of the display rate and six times a game minute. */
const RENDER_INTERVAL_MS = 100;
let lastRender = -Infinity;
function frame(now: number) {
  if (solving) {
    // The clock moves on while a world is solved; the run does not, so the
    // wait cannot be read later as time the survivor lived through.
    lastReal = now;
    requestAnimationFrame(frame);
    return;
  }
  const dtSec = Math.max(0, (now - lastReal) / 1000);
  lastReal = now;
  if (import.meta.env.DEV && startleRestore) {
    render(now);
    requestAnimationFrame(frame);
    return;
  }
  if (!simulationPaused(state, ui)) {
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
  } else if (ui.away || ui.teach || ui.welcome || ui.opportunityPresentation || ui.recognition !== null) {
    // An open moment holds the game still. Without the bump, a modal left open
    // past thirty seconds trips the catch-up branch above, and the player
    // dismisses it into an away report they never earned.
    lastReal = now;
  }
  // One moment at a time, and never over an overlay that outranks it. A rung
  // crossed inside an offline catch-up waits behind that catch-up's own away
  // report; momentToOpen owns the whole rule.
  if (momentToOpen(state, ui)) ui.teach = state.teachQueue.shift()!;
  // Wildlife recognition waits behind an already open opportunity presentation.
  if (!ui.away && !state.landing && !state.dead && !ui.welcome && !ui.teach && !ui.opportunityPresentation && ui.recognition === null) {
    ui.recognition = state.wildlife.recognitionQueue[0] ?? null;
  }
  if (deathTransition(wasDead, Boolean(state.dead))) beacon.died(state, Date.now());
  wasDead = Boolean(state.dead);
  beacon.tick(state, document.visibilityState === "visible", !state.dead && !state.landing && !ui.away, now);
  // State is rendered on its own clock. Nothing a panel shows moves faster
  // than a game minute, so drawing every panel on every display frame paid
  // a style pass and a layout sixty times a second for markup that had not
  // changed. Motion that has to be smooth - water, fog, rain, the startle,
  // the portrait - is CSS on the compositor or a per-frame write above,
  // not a render. Input still renders at once through its own handlers.
  if (now - lastRender >= RENDER_INTERVAL_MS) {
    lastRender = now;
    render(now);
    updateSpeedHistory(document, ui.speedHistory, now, GAME_MINUTES_PER_REAL_SECOND * ui.hurry.rate);
  }
  // The map is the one thing drawn on every display frame: the water, the
  // weather, the firelight and the cues move against the wall clock, and a
  // shimmer redrawn ten times a second reads as a flicker or as nothing. A
  // draw is under a millisecond (effectsBench), which sixty times a second
  // is what the panels' render tick used to cost every hundred.
  updateEffects();
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
  if (document.documentElement.dataset.loading === "true") return;
  const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target) return;
  const act = target.dataset.act;
  const previousDetail = ui.opportunityCatalog.detail;
  // Only a control outside the overlay can be returned to: the overlay keeps
  // its markup while hidden, so a modal's own OK button stays connected and
  // would swallow the focus the dismissal is meant to hand back.
  if (act?.startsWith("opportunity-") && !ui.opportunityCatalog.open && !target.closest("#overlay")) opportunityOpener = target;
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
    case "subtab": {
      const subtab = target.dataset.subtab as SubtabId;
      ui.panes = toSubtab(ui.panes, subtab);
      // Its first purpose that holds something, not simply its first: with
      // rows revealed a rung at a time, Camp's first purpose is Fire and the
      // row the player came for is under Rest. Landing on the empty one
      // reads as a subtab with nothing in it.
      const counts = purposeCounts(state, world, ui);
      if ((counts[ui.panes.purpose] ?? 0) === 0) {
        const filled = PURPOSES[subtab].find((q) => (counts[q] ?? 0) > 0);
        if (filled) ui.panes = { ...ui.panes, purpose: filled };
      }
      savePanes(localStorage, ui.panes);
      break;
    }
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
      if (state.landing && state.landing.oldCamp === null) void fresh(state.seed, startDoy, state.landing.boat + 1);
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
      // opportunity follows it; the manual remains available on demand.
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
      void fresh();
      ui.settings = false;
      lastReal = performance.now();
      render();
      return;
    // The old-world message is its own confirmation - it already named the
    // incompatible save - so this skips reset-world's generic confirm()
    // rather than asking the same question twice.
    case "old-world-new":
      clearSave();
      fresh();
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
    // The card is a door, not a label. It used to open the catalogue and
    // leave the player to find Build > Site themselves, which is the sixth
    // subtab of six and the reason day one read as a dead end.
    case "opportunity-goto": {
      const key = target.dataset.opportunity as OpportunityKey | undefined;
      const where = key ? paneForOpportunity(key) : null;
      if (where) {
        ui.panes = { ...ui.panes, pane: "do", subtab: where.subtab, purpose: where.purpose };
        ui.filter = "";
        savePanes(localStorage, ui.panes);
      } else if (key) {
        // Nothing in REVEAL asks for this one, so fall back to what the card
        // did before rather than swallowing the click.
        opportunityCatalogAction(state, ui, "opportunity-detail", key, opportunityPageSize());
      }
      break;
    }
    case "opportunity-open":
    case "opportunity-close":
    case "opportunity-category":
    case "opportunity-page":
    case "opportunity-detail":
    case "opportunity-back":
    case "opportunity-current":
      opportunityCatalogAction(state, ui, act, target.dataset.opportunity ?? target.dataset.category ?? target.dataset.page ?? "", opportunityPageSize());
      break;
    case "opportunity-set-current":
    case "opportunity-modal-ok":
      if (opportunityModalAction(state, ui, act, target.dataset.notice ?? "", target.dataset.opportunity as OpportunityKey | undefined ?? null)) {
        lastReal = performance.now();
      }
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
      void fresh();
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
    case "kw":
    // A chip above the strip and a tag on a row ask the same question; the
    // chip is that question put where someone who cannot find the row can
    // still reach it.
    case "do-chip": {
      // A concept tag asks for its own rows exactly, not for the letters of its
      // name: see conceptAsked in dopanel.ts. The box is static markup outside
      // every panel, so its value is written here rather than rendered.
      const concept = act === "do-chip" ? target.dataset.concept : target.dataset.kw;
      const asked = `${KW_PREFIX}${concept ?? ""}`;
      // Clicking the chip that is already on puts it back, so a chip is a
      // toggle rather than a thing you can only turn on.
      ui.filter = ui.filter === asked ? "" : asked;
      const box = document.querySelector<HTMLInputElement>("[data-do=filter]");
      if (box) box.value = ui.filter;
      break;
    }
    /**
     * Back to what the game is asking for.
     *
     * Filter text, a chip, a subtab and a purpose are four pieces of state
     * with no single way out of them: a player who had typed something and
     * wandered two subtabs away had no way back but to undo each step.
     */
    case "do-clear": {
      ui.filter = "";
      const box = document.querySelector<HTMLInputElement>("[data-do=filter]");
      if (box) box.value = "";
      const where = currentOpportunityPane(state);
      if (where) ui.panes = { ...ui.panes, pane: "do", subtab: where.subtab, purpose: where.purpose };
      savePanes(localStorage, ui.panes);
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
  if ((act === "opportunity-close" || act === "opportunity-modal-ok" || act === "opportunity-set-current") && !ui.opportunityPresentation) {
    const opener = opportunityOpener?.isConnected ? opportunityOpener : document.querySelector<HTMLElement>('#opportunities [data-act="opportunity-open"]');
    opener?.focus();
  } else if (act === "opportunity-detail" || act === "opportunity-current") {
    document.querySelector<HTMLButtonElement>('#overlay [data-act="opportunity-back"]')?.focus();
  } else if (act === "opportunity-back") {
    [...document.querySelectorAll<HTMLButtonElement>('#overlay [data-act="opportunity-detail"]')].find((button) => button.dataset.opportunity === previousDetail)?.focus();
  }
  restoreScroll();
}

function zoomBy(delta: number) {
  ui.zoom = Math.max(0, Math.min(LEVELS.length - 1, ui.zoom + delta));
}

try {
  await boot();
} catch (err) {
  // The bar is the whole of the UI until the world exists, so a solve that
  // fails says so there rather than leaving a blank overlay and a dead module.
  // Nothing below can run without a world, so the failure still ends the load.
  showLoading(`the world could not be made: ${err instanceof Error ? err.message : String(err)}`, 0);
  throw err;
}
beacon.opened(state);
// Built once world is real; the worker keeps its own copy keyed by seed, so a
// later fresh() with a new world does not leave it stale.
const forecaster = createForecaster(
  world,
  typeof Worker === "undefined" ? undefined : new Worker(new URL("./sim/forecast.worker.ts", import.meta.url), { type: "module" }),
);
forecaster.onRow = (row) => { noteMonthRow(state, row); };
// The worker builds its world from these arrays instead of solving the seed itself.
forecaster.setWorld(world);
tellForecaster = (w) => forecaster.setWorld(w);
/** The actions that change what the forecast reads: orders, needs, camp state. */
const FORECAST_ACTS = [
  "task", "stop", "intent", "row-kind", "finish", "order-up", "order-down", "order-remove", "order-pin", "dismiss",
  "take", "drop", "drop-all",
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
  if (document.documentElement.dataset.loading === "true") return;
  const presentation = document.querySelector<HTMLElement>('#overlay:not([hidden]) .opportunity-modal');
  if (presentation) {
    opportunityModalKeyboard(presentation, ev);
    return;
  }
  const catalog = document.querySelector<HTMLElement>('#overlay:not([hidden]) .opportunity-catalog');
  if (catalog) {
    opportunityCatalogKeyboard(catalog, ev);
    return;
  }
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
  if (el.matches("[data-display=rates]")) {
    ui.rateDisplay = el.value as RateDisplay;
    saveRateDisplay(ui.rateDisplay, localStorage);
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
  if (document.visibilityState !== "hidden") return;
  persistGame();
  // A tab in the background is a tab a browser may reclaim, and Safari says
  // so out loud: "This web page was reloaded because it was using
  // significant memory." Everything released here is rebuilt from the seed
  // or redrawn on the next frame, so the cost of coming back is a moment of
  // work and the cost of staying away is most of the footprint.
  releaseViewsheds();
  trimFineChunks(world, FINE_CHUNK_HIDDEN_LIMIT);
  releaseBoard();
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
  // A row that names somewhere to go points at it while the pointer is on
  // it. The mark is the effects layer's, drawn from the patch each frame,
  // rather than a class on a cell: there are no cells to put one on.
  const clearTarget = () => setPointedGlyph(null);
  const showTarget = (cell: number) => setPointedGlyph(cell);
  const targetUnder = (ev: { clientX: number; clientY: number }, resolution: TargetResolution) => {
    const grid = board.querySelector<HTMLElement>(".grid");
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    return mapTargetAtClient(world, state, ui, ev.clientX, ev.clientY, rect, calendar(state.minute, state.startDoy), resolution);
  };
  // A pointer crossing the board fires per pixel and a block is the same
  // block for a glyph's width of them, so the work is done once per block
  // entered. Knowledge moves what a block resolves to, so its stamp is part
  // of what "the same block" means.
  let hoverBlock = "";
  board.addEventListener("pointermove", (ev) => {
    const grid = board.querySelector<HTMLElement>(".grid");
    const rect = grid?.getBoundingClientRect();
    const box = rect ? mapAggregateAtPoint(world, state, ui, ev.clientX - rect.left, ev.clientY - rect.top) : null;
    const block = box ? `${box.x0}:${box.y0}:${box.size}:${knowledgeGen()}` : "";
    if (block === hoverBlock && hoverTarget) return;
    hoverBlock = block;
    hoverTarget = targetUnder(ev, "geometric");
    ui.hover = hoverTarget?.patch ?? null;
    renderTip();
  });
  board.addEventListener("pointerdown", (ev) => {
    pointerType = ev.pointerType;
  });
  board.addEventListener("click", (ev) => {
    // The zoom controls sit inside the map panel, over the board. A click
    // on one of them is the button's, never the ground's under it: read as
    // ground it ordered a walk there and swallowed the zoom.
    if ((ev.target as HTMLElement | null)?.closest?.(".maptools")) return;
    // Touch keeps its first tap for inspecting the ground. A mouse click on
    // known ground in this region is an explicit destination in its own
    // right, whether or not generation happened to name that patch a place.
    //
    // A glyph at the block rungs stands for up to a few thousand patches,
    // and the exact patch a click resolves to is already on show before the
    // click: the pointer over the glyph marks it and the tooltip reads it
    // out. So one click walks at every rung. It used to take two at the
    // block rungs - the first to disclose the patch, the second to order
    // the walk - and the second was a click on something already disclosed.
    const target = targetUnder(ev, "routed");
    const cell = target?.patch ?? null;
    if (cell === null || cell === cellOf(state, world)) return;
    if (pointerType === "touch" && touchCell !== cell) {
      touchCell = cell;
      hoverTarget = target;
      ui.hover = cell;
      ui.destination = cell;
      render();
      return;
    }
    ui.destination = cell;
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
    if (ev.pointerType === "touch") return;
    hoverTarget = null;
    ui.hover = null;
    renderTip();
  });
  // Arrow-key inspection of cells went with the cells: the board is one
  // canvas now, and the plan for it gave up keyboard navigation of the map
  // (docs/roadmap-additions.md, "The architecture"). Escape still clears
  // the pointer's reading.
  board.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    hoverTarget = null;
    ui.hover = null;
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
      hoverTarget = null;
      ui.hover = cell;
      showTarget(cell);
      renderTip();
    }
  });
  map.addEventListener("pointerout", (ev) => {
    const from = (ev.target as HTMLElement | null)?.closest?.("[data-at]");
    const to = (ev.relatedTarget as HTMLElement | null)?.closest?.("[data-at]");
    if (from && !to && ev.pointerType !== "touch") {
      hoverTarget = null;
      ui.hover = null;
      clearTarget();
      renderTip();
    }
  });
}
// The opened stock group: a mouse hover or a keyboard focus shows it,
// leaving either restores whatever the other still claims rather than
// closing outright, and a click toggles its own claim so a phone can tap.
// One element in the markup, shown and hidden - the same pattern #maptip
// uses for the board.
{
  const stocks = document.getElementById("stocks")!;
  const stockBtn = (ev: Event) => (ev.target as HTMLElement | null)?.closest?.("[data-stock]") as HTMLElement | null;
  // Touch is excluded from both ends of hover, not just the leaving half
  // #map's own pointerout/pointerleave guard against (ev.pointerType ===
  // "touch"): there a stray touch only ever clears a hover nothing else
  // reads, but here a touch's synthetic pointerover would otherwise open a
  // group hover never lets go of again (its matching pointerout is the
  // very thing being excluded), standing in for the tap even after the tap
  // itself toggles off.
  stocks.addEventListener("pointerover", (ev) => {
    if (ev.pointerType === "touch") return;
    const btn = stockBtn(ev);
    if (!btn) return;
    stockHover = btn.dataset.stock as StockGroupId;
    syncStockOpen();
  });
  stocks.addEventListener("pointerout", (ev) => {
    if (ev.pointerType === "touch") return;
    const from = stockBtn(ev);
    const to = (ev.relatedTarget as HTMLElement | null)?.closest?.("[data-stock]");
    if (from && from !== to) {
      stockHover = null;
      syncStockOpen();
    }
  });
  stocks.addEventListener("focusin", (ev) => {
    const btn = stockBtn(ev);
    if (!btn) return;
    stockFocus = btn.dataset.stock as StockGroupId;
    syncStockOpen();
  });
  stocks.addEventListener("focusout", (ev) => {
    const to = (ev.relatedTarget as HTMLElement | null)?.closest?.("[data-stock]");
    if (!to) {
      stockFocus = null;
      syncStockOpen();
    }
  });
  stocks.addEventListener("click", (ev) => {
    const btn = stockBtn(ev);
    if (!btn) return;
    const id = btn.dataset.stock as StockGroupId;
    if (stockTap === id) {
      // Closing this tap's own claim. Many browsers also hand a clicked
      // button native keyboard focus, which would otherwise outrank hover
      // and leave the panel stuck open on a claim the tap itself never
      // made, so that claim is dropped with it. A live hover is left
      // alone: untouched, it is what keeps the panel open through a mouse
      // click on a button already being hovered.
      stockTap = null;
      if (stockFocus === id) stockFocus = null;
    } else {
      stockTap = id;
    }
    syncStockOpen();
  });
}
render();
updateEffects();
startupReady = true;
hideLoading();
portraitMotion.frame(document, performance.now(), document.visibilityState === "visible" && !state.dead && !state.landing && !ui.away);
requestAnimationFrame(frame);

// For poking at the run from the console and for browser checks.
declare global {
  interface Window { survidle: {
    get state(): GameState; get world(): World; advance(minutes: number): void; speed: number;
    cacheStats(): WorldCacheStats;
    get effects(): ReturnType<typeof import("./ui/map").effectsSnapshot>;
    get mapModel(): ReturnType<typeof import("./ui/map").mapModelSnapshot>;
    startleSetup?(scenario: import("../scripts/startle-seeds").StartleScenario): Promise<void>;
    startleStep?(): void;
    startleAdvance?(minutes: number): void;
    startleEnd?(): void;
    opportunityEvent?(event: OpportunityEvent): void;
    placeAtPatch?(patch: number): void;
    reveal?(patch: number, radiusPatches: number): void;
    effectsBench?(iterations?: number): { msPerDraw: number; water: number; shadow: number; glyph: number; iterations: number };
    /** What a click at a screen point would resolve to, for a browser check that clicked and saw no walk. */
    clickReading?(clientX: number, clientY: number): unknown;
  } }
}
window.survidle = {
  get state() { return state; },
  get world() { return world; },
  get effects() { return effectsSnapshot(); },
  get mapModel() { return mapModelSnapshot(); },
  advance(minutes: number) { advance(state, world, minutes); render(); },
  speed,
  // A reading of how much fine ground the run has had to build. It counts
  // caches; it never fills or clears one, so asking does not change the run.
  cacheStats() { return worldCacheStats(world); },
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
  // Browser checks need a real perception or deed without waiting for the
  // world to hand one over. It goes through the same seam the simulation
  // uses, so discovery, credit and the notice queue behave as they do in play.
  window.survidle.opportunityEvent = (event) => {
    recordOpportunityEvent(state, event, world);
    render();
  };
  // Standing somewhere the run has not walked to, and reading ground the
  // survivor has not seen: what a browser check of distant terrain needs. Both
  // go through the sim's own doors - the placement runs the ordinary region
  // change and viewshed, the reveal is the same mark the sight pass makes.
  window.survidle.placeAtPatch = (patch) => {
    placeAtPatch(state, world, patch);
    render();
  };
  // What a draw of the effects canvas costs, measured the only place it can
  // be: a real browser with a real 2d context. The redraw budget in the
  // shots harness reads this, and so does anyone optimising the draw - a
  // number from a profiler's flame graph moves with the profiler, this does
  // not. It draws the picture that is already on screen, over and over, so
  // it measures the draw and nothing around it.
  window.survidle.effectsBench = (iterations = 200) => {
    const model = effectsSnapshot();
    const runs = Math.max(1, Math.floor(iterations));
    for (let i = 0; i < 20; i++) updateEffects();
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) updateEffects();
    const msPerDraw = (performance.now() - t0) / runs;
    return {
      msPerDraw: Math.round(msPerDraw * 1000) / 1000,
      water: model?.water.length ?? 0, shadow: model?.shadow.length ?? 0, glyph: model?.glyph.length ?? 0,
      iterations: runs,
    };
  };
  window.survidle.clickReading = (clientX, clientY) => {
    const grid = document.querySelector<HTMLElement>("#mapdyn .grid");
    if (!grid) return { grid: null };
    const cal = calendar(state.minute, state.startDoy);
    const target = mapTargetAtClient(world, state, ui, clientX, clientY, grid.getBoundingClientRect(), cal, "routed");
    const here = cellOf(state, world);
    const cell = target?.patch ?? null;
    return {
      aggregate: target?.aggregate ?? null, patch: cell, here, known: cell === null ? null : isKnown(state, cell),
      frontier: cell !== null && !isKnown(state, cell) ? frontierRoute(state, world, here, cell, "none") !== null : null,
      route: state.route ? { target: state.route.target, ahead: state.route.path.length } : null,
      orders: state.regions[state.player.region]?.orders.map((o) => ("req" in o ? `${o.req.task}:${o.req.arg}` : o.kind)) ?? [],
    };
  };
  window.survidle.reveal = (patch, radiusPatches) => {
    const { x, y } = patchXY(patch);
    for (let dy = -radiusPatches; dy <= radiusPatches; dy++) {
      for (let dx = -radiusPatches; dx <= radiusPatches; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= world.w || y + dy >= world.h) continue;
        markKnown(state, patchId(x + dx, y + dy));
      }
    }
    render();
  };
}
