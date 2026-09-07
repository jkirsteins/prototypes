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
import { since } from "./sim/epitaph";
import { createForecaster, noteMonthRow } from "./sim/forecaster";
import { startIntent, type Where } from "./sim/intent";
import type { FoodId } from "./sim/items";
import { orderByHand, orderGate } from "./sim/ladder";
import { beginAgain, land, nextBoat, pickCandidate } from "./sim/landing";
import { openManualOnFirstLanding } from "./sim/manual";
import { newWorld } from "./sim/newgame";
import { moveOrderByHand, removeOrderByHand } from "./sim/orders";
import { abandon, feltTemperature } from "./sim/player";
import { cellOf } from "./sim/position";
import { current } from "./sim/record";
import { fillPopulations } from "./sim/regionstate";
import { awaySeconds, catchUp, clearSave, loadGame, saveGame } from "./sim/save";
import { startTask, stopTask } from "./sim/tasks";
import type { GameState, ItemId, TaskId } from "./sim/types";
import { drink, fillVessels } from "./sim/water";
import { ambientTemperature } from "./sim/weather";
import { GAME_MINUTES_PER_REAL_SECOND } from "./units";
import { updateBars, updateFills, updateHurryBar } from "./ui/bars";
import { mountBeaconPanel } from "./ui/beacon-panel";
import { buildHtml } from "./ui/build";
import { mountAwayDial, type AwayDial } from "./ui/dial";
import { doHtml, KW_PREFIX, loadFolds, saveFold } from "./ui/dopanel";
import { goalDoneHtml, goalMomentToOpen, goalsHtml, updateGoalBars } from "./ui/goalpanel";
import { LEVELS, legendHtml, mapHtml, mapKey } from "./ui/map";
import {
  awayHtml, cemeteryHtml, clockHtml, forecastHtml, gearHtml, inventoryHtml, journalHtml, landingHtml, logHtml,
  manualHtml, regionHtml, skillsHtml, statsHtml, taskHtml, tombstoneHtml,
} from "./ui/panels";
import { conceptHtml, momentToOpen, welcomeHtml } from "./ui/teachpanel";
import { commitChoiceN, defaultChoiceFor, newUiState, resetPanels, rowRequest, setPanel, setWhenField, WHEN_FIELDS, type RowChoice, type WhenField } from "./ui/render";
import { hurryClick, hurryFrame, hurryKind, newHurry } from "./ui/hurry";
import { updateSky } from "./ui/sky";
import { generateWorld, regionAt, type World } from "./world/gen";

const params = new URLSearchParams(location.search);
// The face self-test page: a page of generated faces to judge, in place of the game.
if (params.has("faces")) location.replace(`${import.meta.env.BASE_URL}faces.html`);
/** Test aid: how many times faster than 60x the clock runs. Not a game feature. */
const speed = Math.max(0.1, Number(params.get("speed")) || 1);
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

// Assigned by boot()/fresh() before anything reads it; the assertion is for TS,
// which cannot see the assignment through the function call.
let state!: GameState;
let world!: World;
const ui = newUiState();
let awayInfo: { seconds: number; capped: boolean } | null = null;
const audio = createAudioEngine(SLOTS);
const sounds = createScheduler(audio);
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
  ui.confirmAbandon = false;
  ui.confirmCamp = false;
  ui.folds = loadFolds(localStorage);
  resetPanels();
  resetForecastAt();
  saveGame(state);
  awayDial?.refresh();
}

function boot() {
  ui.folds = loadFolds(localStorage);
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
      ui.awayFromDay = calendar(state.minute, state.startDoy).day;
      ui.away = catchUp(state, world, elapsed, speed);
      ui.hurry = newHurry();
      setCueSink((c) => sounds.cue(c));
      awayInfo = { seconds: Math.min(elapsed, awaySeconds(state)), capped: elapsed > awaySeconds(state) };
      saveGame(state);
    }
  } else {
    fresh(forcedSeed ? Number(forcedSeed) >>> 0 : undefined, startDoy);
  }
}

/** Scrolls the map's horizontal box so the survivor's glyph sits centred, after a rebuild moves it. */
function scrollMapToSurvivor() {
  const wrap = document.querySelector<HTMLElement>("#mapdyn .scroll-x");
  const you = wrap?.querySelector<HTMLElement>("[data-you]");
  if (!wrap || !you) return;
  wrap.scrollLeft = you.offsetLeft + you.offsetWidth / 2 - wrap.clientWidth / 2;
}

let lastMapKey = "";
function render() {
  // Arriving where you were looking ends the looking.
  if (ui.selected === state.player.region) ui.selected = null;
  const cal = calendar(state.minute, state.startDoy);
  const ambient = ambientTemperature(cal, state.weather);
  setPanel("stats", statsHtml(state, world, cal, ambient, ui));
  setPanel("gear", gearHtml(state, feltTemperature(state, world, ambient)));
  setPanel("skills", skillsHtml(state));
  setPanel("goals", goalsHtml(state, cal));
  setPanel("clock", clockHtml(state, world, cal, ambient, ui.hurry.rate));
  const key = mapKey(state, world, ui, cal);
  if (key !== lastMapKey) {
    lastMapKey = key;
    if (setPanel("mapdyn", mapHtml(world, state, ui, cal))) scrollMapToSurvivor();
  }
  setPanel("region", regionHtml(state, world, cal, ui));
  setPanel("task", taskHtml(state, world, cal));
  setPanel("forecast", forecastHtml(forecaster.view(), state));
  setPanel("dorows", doHtml(state, world, cal, ui, ui.folds));
  setPanel("inventory", inventoryHtml(state, world, cal));
  setPanel("log", logHtml(state));
  setPanel("journal", journalHtml(state, cal, ui));
  updateBars(state, world);
  updateFills(state);
  updateGoalBars(state, cal);
  updateHurryBar(ui.hurry);
  updateSky(state, cal, ambient);

  // The settings panel is static markup with its own listeners (the slider must
  // not be redrawn mid-drag), so it is shown and hidden rather than rewritten.
  document.getElementById("settings")!.hidden = !ui.settings;

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
  } else if (ui.goalsDone) {
    setPanel("overlay", goalDoneHtml(state, cal, ui.goalsDone));
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
  if (!state.dead && !state.landing && !ui.away && !ui.teach && !ui.welcome && !ui.goalsDone) {
    if (dtSec > 30) {
      // The tab was in the background: catch up the same way a reload does.
      setCueSink(null);
      ui.awayFromDay = calendar(state.minute, state.startDoy).day;
      ui.away = catchUp(state, world, dtSec, speed);
      ui.hurry = newHurry();
      setCueSink((c) => sounds.cue(c));
      awayInfo = { seconds: Math.min(dtSec, awaySeconds(state)), capped: dtSec > awaySeconds(state) };
    } else {
      // The hurry: extra minutes for work chosen by hand, on top of the frame's own. The speed test aid does not scale it.
      const extra = hurryFrame(ui.hurry, hurryKind(state), state.intent?.orderId ?? null, dtSec);
      advance(state, world, dtSec * GAME_MINUTES_PER_REAL_SECOND * speed + extra);
    }
    if ((state.minute - forecastAt.minute >= 60 && now - forecastAt.real >= 2000) || dayNumber(state.minute) !== forecastAt.day || state.player.region !== forecastAt.region) requestForecast();
  } else if (ui.away || ui.teach || ui.welcome || ui.goalsDone) {
    // An open moment holds the game still. Without the bump, a modal left open
    // past thirty seconds trips the catch-up branch above, and the player
    // dismisses it into an away report they never earned.
    lastReal = now;
  }
  // One moment at a time, and never over an overlay that outranks it. A rung
  // crossed inside an offline catch-up waits behind that catch-up's own away
  // report; momentToOpen owns the whole rule.
  if (momentToOpen(state, ui)) ui.teach = state.teachQueue.shift()!;
  const reached = goalMomentToOpen(state, ui);
  if (reached) {
    ui.goalsDone = reached;
    state.goals.queue = [];
  }
  if (deathTransition(wasDead, Boolean(state.dead))) beacon.died(state, Date.now());
  wasDead = Boolean(state.dead);
  beacon.tick(state, document.visibilityState === "visible", !state.dead && !state.landing && !ui.away, now);
  render();
  const cal = calendar(state.minute, state.startDoy);
  sounds.frame(state, world, cal, ambientTemperature(cal, state.weather), now, !state.dead && !state.landing && !ui.away && document.visibilityState !== "hidden");
  if (now - lastSave > 5000) {
    lastSave = now;
    saveGame(state);
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
      if (id === "haul" || id === "night") {
        startIntent(state, world, cal, rng, { task: id, until: { kind: "once" }, deliver: "camp", where: { cell: cellOf(state, world) } });
      } else {
        startTask(state, world, cal, id, target.dataset.arg || undefined, target.dataset.repeat === "1", rng);
      }
      break;
    }
    case "stop":
      stopTask(state, world);
      break;
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
    case "toggle-eat":
      state.player.autoEat = !state.player.autoEat;
      break;
    case "toggle-feed":
      state.player.autoFeed = !state.player.autoFeed;
      break;
    case "toggle-drink":
      state.player.autoDrink = !state.player.autoDrink;
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
      if (wasLanding && state.landing === null && openManualOnFirstLanding(state, heir)) ui.manual = true;
      // Every landing gets its welcome, fresh survivor or heir. On a world's
      // first the manual leads and this waits behind it in the chain.
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
      ui.goalsDone = null;
      // The same bump the rung moment's dismiss does: the minutes the
      // screen was open were paused, not spent away.
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
      // Binding a camp asks first: the row swaps to its question, and only the
      // yes acts. Every other row acts on the click, as it always has.
      if (id === "makeCamp" && act === "intent") {
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
    case "fold": {
      const group = target.dataset.group ?? "";
      const open = !(ui.folds[group] ?? true);
      ui.folds[group] = open;
      saveFold(localStorage, group, open);
      break;
    }
    case "more": {
      const group = target.dataset.group ?? "";
      if (ui.moreOpen.includes(group)) ui.moreOpen = ui.moreOpen.filter((g) => g !== group);
      else ui.moreOpen.push(group);
      break;
    }
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
  }
  state.rng = rng.s;
  // After the rng write-back, so the request the click triggers reads the committed rng.
  if (FORECAST_ACTS.includes(target.dataset.act!)) requestForecast();
  saveGame(state);
  render();
  restoreScroll();
}

function zoomBy(delta: number) {
  ui.zoom = Math.max(0, Math.min(LEVELS.length - 1, ui.zoom + delta));
}

boot();
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
  "task", "stop", "intent", "row-kind", "finish", "order-up", "order-down", "order-remove", "dismiss",
  "eat", "feed", "drink", "fill", "take", "drop", "drop-all", "toggle-eat", "toggle-feed", "toggle-drink",
];
/** A request when nothing overlays the game: the list, the day, the dial, the region and the hour each call this; the frame calls it on a cadence. */
function requestForecast(): void {
  if (state.dead || state.landing || ui.away) return;
  forecaster.request(state);
  forecastAt = { minute: state.minute, day: dayNumber(state.minute), region: state.player.region, real: performance.now() };
}
setCueSink((c) => sounds.cue(c));
// Registered before mountControl's own capture listeners, so unlock() always
// runs before the control's show() on the same click or keydown - otherwise
// the note reads stale for one extra interaction.
document.addEventListener("click", () => audio.unlock(), { capture: true });
document.addEventListener("keydown", () => audio.unlock(), { capture: true });
// The build's own name, written once: it cannot change while the page is open.
setPanel("build", buildHtml());
mountControl(document.getElementById("sound")!, audio);
awayDial = mountAwayDial(document.getElementById("away")!, () => state.awayHours, (h) => { state.awayHours = h; requestForecast(); });
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
  if (document.visibilityState === "hidden") saveGame(state);
});
window.addEventListener("pagehide", () => saveGame(state));
// The terrain letters never change, so the legend is set once rather than rebuilt with the map.
document.querySelector<HTMLElement>("#map .legend")!.innerHTML = legendHtml();
render();
requestAnimationFrame(frame);

// For poking at the run from the console and for browser checks.
declare global {
  interface Window { survidle: { get state(): GameState; get world(): World; advance(minutes: number): void; speed: number } }
}
window.survidle = {
  get state() { return state; },
  get world() { return world; },
  advance(minutes: number) { advance(state, world, minutes); render(); },
  speed,
};
