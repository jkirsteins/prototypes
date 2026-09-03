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
import { startIntent, type Where } from "./sim/intent";
import type { FoodId } from "./sim/items";
import { newGame } from "./sim/newgame";
import { addOrder, moveOrder, removeOrder } from "./sim/orders";
import { feltTemperature } from "./sim/player";
import { cellOf } from "./sim/position";
import { fillPopulations } from "./sim/regionstate";
import { catchUp, clearSave, loadGame, MAX_OFFLINE_SECONDS, saveGame } from "./sim/save";
import { startTask, stopTask, type TaskGroup } from "./sim/tasks";
import type { GameState, ItemId, OrderKind, TaskId, UntilChoice } from "./sim/types";
import { drink, fillVessels } from "./sim/water";
import { ambientTemperature } from "./sim/weather";
import { GAME_MINUTES_PER_REAL_SECOND } from "./units";
import { updateBars } from "./ui/bars";
import { mapHtml, mapKey, ZOOMS } from "./ui/map";
import {
  awayHtml, clockHtml, deathHtml, doHtml, gearHtml, inventoryHtml, logHtml,
  regionHtml, skillsHtml, statsHtml, taskHtml,
} from "./ui/panels";
import { commitStripN, newUiState, resetPanels, setPanel, type UiState } from "./ui/render";
import { updateSky } from "./ui/sky";
import { generateWorld, type World } from "./world/gen";

const params = new URLSearchParams(location.search);
/** Test aid: how many times faster than 60x the clock runs. Not a game feature. */
const speed = Math.max(0.1, Number(params.get("speed")) || 1);
const forcedSeed = params.get("seed");

let state: GameState;
let world: World;
const ui = newUiState();
let awayInfo: { seconds: number; capped: boolean } | null = null;
const audio = createAudioEngine(SLOTS);
const sounds = createScheduler(audio);

function fresh(seed = (Math.random() * 0xffffffff) >>> 0) {
  const g = newGame(seed);
  state = g.state;
  world = g.world;
  ui.selected = null;
  ui.away = null;
  ui.confirmAbandon = false;
  resetPanels();
  saveGame(state);
}

function boot() {
  const saved = forcedSeed ? null : loadGame();
  if (saved) {
    state = saved.state;
    world = generateWorld(state.seed);
    fillPopulations(state, world);
    const elapsed = Math.max(0, (Date.now() - saved.savedAt) / 1000);
    if (elapsed > 30 && !state.dead) {
      setCueSink(null);
      ui.away = catchUp(state, world, elapsed, speed);
      setCueSink((c) => sounds.cue(c));
      awayInfo = { seconds: Math.min(elapsed, MAX_OFFLINE_SECONDS), capped: elapsed > MAX_OFFLINE_SECONDS };
      saveGame(state);
    }
  } else {
    fresh(forcedSeed ? Number(forcedSeed) >>> 0 : undefined);
  }
}

let lastMapKey = "";
function render() {
  // Arriving where you were looking ends the looking.
  if (ui.selected === state.player.region) ui.selected = null;
  const cal = calendar(state.minute);
  const ambient = ambientTemperature(cal, state.weather);
  setPanel("stats", statsHtml(state, world, cal, ambient, ui));
  setPanel("gear", gearHtml(state, feltTemperature(state, world, ambient)));
  setPanel("skills", skillsHtml(state));
  setPanel("clock", clockHtml(state, cal, ambient));
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
  updateBars(state, world);
  updateSky(state, cal, ambient);

  const overlay = document.getElementById("overlay")!;
  if (state.dead) {
    setPanel("overlay", deathHtml(state, world, cal));
    overlay.hidden = false;
  } else if (ui.away) {
    setPanel("overlay", awayHtml(ui.away, awayInfo?.seconds ?? 0, awayInfo?.capped ?? false));
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
  if (!state.dead && !ui.away) {
    if (dtSec > 30) {
      // The tab was in the background: catch up the same way a reload does.
      setCueSink(null);
      ui.away = catchUp(state, world, dtSec, speed);
      setCueSink((c) => sounds.cue(c));
      awayInfo = { seconds: Math.min(dtSec, MAX_OFFLINE_SECONDS), capped: dtSec > MAX_OFFLINE_SECONDS };
    } else {
      advance(state, world, dtSec * GAME_MINUTES_PER_REAL_SECOND * speed);
    }
  } else if (ui.away) {
    lastReal = now;
  }
  render();
  const cal = calendar(state.minute);
  sounds.frame(state, world, cal, ambientTemperature(cal, state.weather), now, !state.dead && !ui.away && document.visibilityState !== "hidden");
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
  const cal = calendar(state.minute);
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
      clearSave();
      fresh();
      break;
    case "restart":
      clearSave();
      fresh();
      break;
    case "dismiss":
      ui.away = null;
      lastReal = performance.now();
      break;
    case "intent": {
      const kind: OrderKind = ui.until === "keep" ? "keep" : ui.until === "forever" ? "grind" : "job";
      const until: UntilChoice = ui.until === "times" ? { kind: "times", n: ui.n }
        : ui.until === "campHas" || ui.until === "keep" ? { kind: "campHas", qty: ui.n }
        : ui.until === "forever" ? { kind: "forever" }
        : { kind: "once" };
      addOrder(state, world, { task: target.dataset.id as TaskId, arg: target.dataset.arg || undefined, until, deliver: ui.deliver, where: ui.where }, kind);
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
    case "finish": {
      const id = target.dataset.id as TaskId;
      const arg = target.dataset.arg || undefined;
      // Located work names its cell; carried work has none, so it resolves through
      // "nearest" - camp for camp-bound work, wherever the player stands for craft.
      const where: Where = target.dataset.cell !== undefined ? { cell: Number(target.dataset.cell) } : "nearest";
      addOrder(state, world, { task: id, arg, until: { kind: "once" }, deliver: "leave", where }, "job");
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
  if (!el.matches("[data-strip-n]")) return;
  commitStripN(ui, el.value);
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
