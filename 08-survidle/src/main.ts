import "./style.css";
import { Rng } from "./rng";
import { mountControl } from "./audio/control";
import { createAudioEngine } from "./audio/engine";
import { SLOTS } from "./audio/manifest";
import { createScheduler } from "./audio/scheduler";
import { addFirewood, drop, dropAll, eat, take } from "./sim/actions";
import { advance } from "./sim/advance";
import { calendar } from "./sim/calendar";
import { setCueSink } from "./sim/cues";
import { since } from "./sim/epitaph";
import { startIntent, type Where } from "./sim/intent";
import type { FoodId } from "./sim/items";
import { giveOrder, orderGate } from "./sim/ladder";
import { beginAgain, land, rerollName } from "./sim/landing";
import { newGame } from "./sim/newgame";
import { moveOrder, removeOrder } from "./sim/orders";
import { abandon, feltTemperature } from "./sim/player";
import { cellOf } from "./sim/position";
import { current } from "./sim/record";
import { fillPopulations } from "./sim/regionstate";
import { catchUp, clearSave, loadGame, MAX_OFFLINE_SECONDS, saveGame } from "./sim/save";
import { startTask, stopTask, type TaskGroup } from "./sim/tasks";
import type { GameState, ItemId, TaskId } from "./sim/types";
import { drink, fillVessels } from "./sim/water";
import { ambientTemperature } from "./sim/weather";
import { GAME_MINUTES_PER_REAL_SECOND } from "./units";
import { updateBars, updateHurryBar } from "./ui/bars";
import { mapHtml, mapKey, ZOOMS } from "./ui/map";
import {
  awayHtml, cemeteryHtml, clockHtml, doHtml, gearHtml, inventoryHtml, journalHtml, landingHtml, logHtml,
  regionHtml, skillsHtml, statsHtml, taskHtml, tombstoneHtml,
} from "./ui/panels";
import { commitStripN, newUiState, resetPanels, setPanel, stripRequest, type UiState } from "./ui/render";
import { hurryClick, hurryFrame, hurryKind, newHurry } from "./ui/hurry";
import { updateSky } from "./ui/sky";
import { generateWorld, regionAt, type World } from "./world/gen";

const params = new URLSearchParams(location.search);
/** Test aid: how many times faster than 60x the clock runs. Not a game feature. */
const speed = Math.max(0.1, Number(params.get("speed")) || 1);
const forcedSeed = params.get("seed");
/** Test aid beside seed: the day of year the run begins on, for a summer or autumn pass. Not a game feature. */
const forcedDay = params.get("day");
// Anything that is not a day of year is no day of year: a blank or misspelt
// ?day= leaves the run alone rather than opening it on 1 January in the snow.
const forcedDayN = forcedDay === null || forcedDay.trim() === "" ? Number.NaN : Number(forcedDay);
const startDoy = Number.isInteger(forcedDayN) && forcedDayN >= 0 && forcedDayN < 365 ? forcedDayN : undefined;

let state: GameState;
let world: World;
const ui = newUiState();
let awayInfo: { seconds: number; capped: boolean } | null = null;
const audio = createAudioEngine(SLOTS);
const sounds = createScheduler(audio);

function fresh(seed = (Math.random() * 0xffffffff) >>> 0, startDoy?: number) {
  const g = newGame(seed, startDoy);
  state = g.state;
  world = g.world;
  ui.selected = null;
  ui.away = null;
  ui.hurry = newHurry();
  ui.confirmAbandon = false;
  resetPanels();
  saveGame(state);
}

function boot() {
  const saved = forcedSeed || startDoy !== undefined ? null : loadGame();
  if (saved) {
    state = saved.state;
    world = generateWorld(state.seed);
    fillPopulations(state, world);
    const elapsed = Math.max(0, (Date.now() - saved.savedAt) / 1000);
    if (elapsed > 30 && !state.dead && !state.landing) {
      setCueSink(null);
      ui.awayFromDay = calendar(state.minute, state.startDoy).day;
      ui.away = catchUp(state, world, elapsed, speed);
      ui.hurry = newHurry();
      setCueSink((c) => sounds.cue(c));
      awayInfo = { seconds: Math.min(elapsed, MAX_OFFLINE_SECONDS), capped: elapsed > MAX_OFFLINE_SECONDS };
      saveGame(state);
    }
  } else {
    fresh(forcedSeed ? Number(forcedSeed) >>> 0 : undefined, startDoy);
  }
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
  setPanel("clock", clockHtml(state, cal, ambient, ui.hurry.rate));
  const key = mapKey(state, world, ui, cal);
  if (key !== lastMapKey) {
    lastMapKey = key;
    setPanel("map", mapHtml(world, state, ui, cal));
  }
  setPanel("region", regionHtml(state, world, cal, ui));
  setPanel("task", taskHtml(state, world, cal));
  setPanel("actions", doHtml(state, world, cal, ui));
  setPanel("inventory", inventoryHtml(state, world));
  setPanel("log", logHtml(state));
  setPanel("journal", journalHtml(state, cal));
  updateBars(state, world);
  updateHurryBar(ui.hurry);
  updateSky(state, cal, ambient);

  const overlay = document.getElementById("overlay")!;
  if (ui.cemetery) {
    setPanel("overlay", cemeteryHtml(state, ui));
    overlay.hidden = false;
  } else if (ui.away) {
    setPanel("overlay", awayHtml(ui.away, awayInfo?.seconds ?? 0, awayInfo?.capped ?? false, since(current(state), ui.awayFromDay)));
    overlay.hidden = false;
  } else if (state.landing) {
    setPanel("overlay", landingHtml(state, world));
    overlay.hidden = false;
  } else if (state.dead) {
    setPanel("overlay", tombstoneHtml(state, world));
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
  if (!state.dead && !state.landing && !ui.away) {
    if (dtSec > 30) {
      // The tab was in the background: catch up the same way a reload does.
      setCueSink(null);
      ui.awayFromDay = calendar(state.minute, state.startDoy).day;
      ui.away = catchUp(state, world, dtSec, speed);
      ui.hurry = newHurry();
      setCueSink((c) => sounds.cue(c));
      awayInfo = { seconds: Math.min(dtSec, MAX_OFFLINE_SECONDS), capped: dtSec > MAX_OFFLINE_SECONDS };
    } else {
      // The hurry: extra minutes for work chosen by hand, on top of the frame's own. The speed test aid does not scale it.
      const extra = hurryFrame(ui.hurry, hurryKind(state), state.intent?.orderId ?? null, dtSec);
      advance(state, world, dtSec * GAME_MINUTES_PER_REAL_SECOND * speed + extra);
    }
  } else if (ui.away) {
    lastReal = now;
  }
  render();
  const cal = calendar(state.minute, state.startDoy);
  sounds.frame(state, world, cal, ambientTemperature(cal, state.weather), now, !state.dead && !state.landing && !ui.away && document.visibilityState !== "hidden");
  if (now - lastSave > 5000) {
    lastSave = now;
    saveGame(state);
  }
  requestAnimationFrame(frame);
}

function onClick(ev: Event) {
  const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target) return;
  const act = target.dataset.act;
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
    case "tab":
      ui.tab = target.dataset.tab as TaskGroup;
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
      break;
    case "reroll-name":
      rerollName(state);
      break;
    case "land":
      land(state, world);
      ui.confirmAbandon = false;
      break;
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
    case "intent": {
      const { req, kind } = stripRequest(ui, target.dataset.id as TaskId, target.dataset.arg || undefined);
      // The row is greyed with no button when the gate is shut; this is the belt to that brace.
      if (orderGate(state, req, kind).ok) giveOrder(state, world, req, kind);
      break;
    }
    case "strip": {
      const k = target.dataset.k as "until" | "deliver" | "where";
      const v = target.dataset.v as string;
      if (k === "until") ui.until = v as UiState["until"];
      else if (k === "deliver") ui.deliver = v as UiState["deliver"];
      else ui.where = v as UiState["where"];
      break;
    }
    case "advanced":
      ui.advanced = !ui.advanced;
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
      giveOrder(state, world, { task: id, arg, until: { kind: "once" }, deliver: "leave", where }, "job");
      break;
    }
    case "order-up":
      moveOrder(state, world, Number(target.dataset.id), -1);
      break;
    case "order-down":
      moveOrder(state, world, Number(target.dataset.id), 1);
      break;
    case "order-remove":
      removeOrder(state, world, Number(target.dataset.id));
      break;
  }
  state.rng = rng.s;
  saveGame(state);
  render();
}

function zoomBy(delta: number) {
  ui.zoom = Math.max(0, Math.min(ZOOMS.length - 1, ui.zoom + delta));
}

boot();
setCueSink((c) => sounds.cue(c));
// Registered before mountControl's own capture listeners, so unlock() always
// runs before the control's show() on the same click or keydown - otherwise
// the note reads stale for one extra interaction.
document.addEventListener("click", () => audio.unlock(), { capture: true });
document.addEventListener("keydown", () => audio.unlock(), { capture: true });
mountControl(document.getElementById("sound")!, audio);
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
// Committed on every keystroke so the field is never a stroke behind; no render()
// here, since setPanel already refuses to redraw the panel while this field has
// focus (a redraw between keystrokes is what used to eat the field's focus).
document.addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.matches("[data-strip-n]")) {
    commitStripN(ui, el.value);
  } else if (el.matches("[data-name]") && state.landing) {
    const t = el.value.trim().slice(0, 40);
    const i = t.indexOf(" ");
    state.landing.name = i < 0
      ? { first: t || state.landing.name.first, last: state.landing.name.last }
      : { first: t.slice(0, i), last: t.slice(i + 1).trim() };
  }
});
document.addEventListener("change", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (!el.matches("[data-strip-n]")) return;
  commitStripN(ui, el.value);
  // A blank field commits to 1 already; force the box to show it, since a
  // render that produces the same html as before is one setPanel skips.
  el.value = String(ui.n);
  render();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame(state);
});
window.addEventListener("pagehide", () => saveGame(state));
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
