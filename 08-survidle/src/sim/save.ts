import { GAME_MINUTES_PER_REAL_SECOND } from "../units";
import { regionAt, type World } from "../world/gen";
import { advance } from "./advance";
import { WORK_HOURS_DEFAULT } from "./body";
import { calendar, START_DOY } from "./calendar";
import { addItem } from "./inventory";
import { TOOLS } from "./items";
import { ordersHere, orderSentence } from "./orders";
import { FAT_FULL } from "./player";
import { newRecord } from "./record";
import { regionState } from "./regionstate";
import { newSkills } from "./skills";
import type { GameState, Inventory, LogEntry, TaskId } from "./types";

export const SAVE_KEY = "survidle.save";
/** Away longer than this is simulated as this. */
export const MAX_OFFLINE_SECONDS = 24 * 3600;

export interface SaveFile { version: 5; savedAt: number; state: GameState }

export function serialize(state: GameState, now = Date.now()): string {
  const file: SaveFile = { version: 5, savedAt: now, state };
  return JSON.stringify(file);
}

export function deserialize(text: string): SaveFile | null {
  try {
    const file = JSON.parse(text) as { version: number; savedAt: number; state: GameState };
    if ((file?.version !== 3 && file?.version !== 4 && file?.version !== 5) || !file.state || typeof file.savedAt !== "number") return null;
    fillDefaults(file.state);
    return file as unknown as SaveFile;
  } catch {
    return null;
  }
}

/**
 * Fields added since a save was written get their starting values, so a
 * run in progress survives a new structure the same way it survives a new
 * region: by not having it yet.
 */
function fillDefaults(state: GameState): void {
  state.startDoy ??= START_DOY;
  state.skills ??= newSkills();
  state.intent ??= null;
  state.ledger ??= [];
  state.year ??= 1;
  state.landing ??= null;
  state.spine ??= { fired: {}, announced: {} };
  // A save from before the world was the thing saved: its survivor becomes the first of the world, recorded from now.
  // Task 2 replaces this
  state.survivors ??= [newRecord(1, { first: "First", last: "Survivor" }, { year: 1, doy: state.startDoy }, 0)];
  for (const st of Object.values(state.regions)) st.structureAge ??= {};
  if (state.intent) {
    state.intent.orderId ??= null;
    state.intent.windDown ??= false;
  }
  // Hauling was a stored plan once; an intent restarts from anywhere, so a saved plan is simply forgotten.
  delete (state as unknown as Record<string, unknown>).plan;
  // The one-species fish and the one grouse became a roster: a fish task with no
  // species fishes for anything, and the old grouse is the willow grouse.
  const renameArg = (t: { id: TaskId; arg?: string } | null | undefined) => {
    if (!t) return;
    if (t.id === "fish" && !t.arg) t.arg = "any";
    if (t.id === "hunt" && t.arg === "grouse") t.arg = "willowGrouse";
  };
  renameArg(state.task);
  if (state.intent && state.intent.task === "fish" && !state.intent.arg) state.intent.arg = "any";
  if (state.intent && state.intent.task === "hunt" && state.intent.arg === "grouse") state.intent.arg = "willowGrouse";
  // A paused entry's dictionary key is built from its own arg (tasks.ts pauseKey: "id:arg@cell"
  // for located work, "id:arg" for carried work, cell -1). Renaming .arg without moving the
  // entry to the recomputed key would strand it under the old key, unresumable and undeletable.
  for (const [key, p] of Object.entries(state.paused)) {
    renameArg(p);
    const newKey = p.cell === -1 ? `${p.id}:${p.arg ?? ""}` : `${p.id}:${p.arg ?? ""}@${p.cell}`;
    if (newKey !== key) {
      delete state.paused[key];
      state.paused[newKey] = p;
    }
  }
  // An order's click carries the same task/arg shape under different field names.
  for (const st of Object.values(state.regions)) {
    for (const o of st.orders ?? []) {
      if (o.req.task === "fish" && !o.req.arg) o.req.arg = "any";
      if (o.req.task === "hunt" && o.req.arg === "grouse") o.req.arg = "willowGrouse";
    }
  }
  const p = state.player;
  p.torch ??= { lit: false, minutes: 0 };
  p.fat ??= FAT_FULL;
  p.water ??= 2.5;
  p.autoDrink ??= true;
  p.frostbite ??= { feet: 0, hands: 0 };
  p.toes ??= false;
  p.fingers ??= false;
  p.berriesToday ??= { day: 0, kg: 0 };
  p.workHours ??= WORK_HOURS_DEFAULT;
  for (const g of p.clothing) g.wet ??= 0;
  for (const t of p.tools) {
    if (TOOLS[t.id].litres === undefined) continue;
    t.litres ??= 0;
    t.frozen ??= false;
  }
  // Berries joined the perishables, so a save that holds them as a plain count
  // holds kilos that weigh but that qty, listItems and eating never see. Moving
  // them into one fresh stack is what addItem would have done with the pick.
  const stackBerries = (inv: Inventory): void => {
    inv.stacks ??= {};
    const kg = inv.items.berries ?? 0;
    if (kg > 0) addItem(inv, "berries", kg);
    delete inv.items.berries;
  };
  stackBerries(p.pack);
  for (const inv of Object.values(state.piles)) stackBerries(inv);
  const w = state.weather;
  w.storm ??= null;
  w.dryDays ??= 0;
  w.wetDay ??= false;
  w.dryWarned ??= false;
  w.iceCm ??= 0;
  if (state.route) {
    state.route.ice ??= "none";
    // Old saves predate lastLand; the route's own path (or its target, if already there) is the closest thing to it.
    state.route.lastLand ??= state.route.path[0] ?? state.route.target;
  }
  for (const st of Object.values(state.regions)) {
    st.structures.boughBed ??= false;
    st.structures.hearth ??= false;
    st.boughBedAge ??= 0;
    st.fire.wetKg ??= 0;
    st.fire.indoors ??= false;
    st.fire.unattended ??= 0;
    st.smoke ??= 0;
    st.logsWet ??= 1440;
    st.orders ??= [];
    st.nextOrderId ??= 1;
    st.iceHole ??= null;
  }
}

export function saveGame(state: GameState, storage: Storage = localStorage, now = Date.now()): void {
  storage.setItem(SAVE_KEY, serialize(state, now));
}

export function loadGame(storage: Storage = localStorage): SaveFile | null {
  const text = storage.getItem(SAVE_KEY);
  return text ? deserialize(text) : null;
}

export function clearSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}

export interface AwayOrder {
  label: string;
  task: TaskId;
  /** Completions and minutes since the player left. */
  done: number;
  minutes: number;
  /** Why it is blocked now, or "". */
  skipped: string;
  /** Finished and dropped off the list while away. */
  gone: boolean;
}

export interface AwaySummary {
  entries: LogEntry[];
  /** One per order of the camp the player left, in rank order. */
  orders: AwayOrder[];
  /** The region the player is in now, when it is not the one they left. */
  movedTo: string | null;
}

/**
 * Simulates the time the tab was closed and returns what happened meanwhile:
 * the log, and each order's share of it. Runs one-minute steps, the same
 * steps the foreground loop takes.
 */
export function catchUp(state: GameState, world: World, realSecondsElapsed: number, speed = 1): AwaySummary {
  const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, realSecondsElapsed));
  const minutes = seconds * GAME_MINUTES_PER_REAL_SECOND * speed;
  const before = state.log.length;
  const firstMinute = state.minute;
  const region = state.player.region;
  const cal = calendar(state.minute, state.startDoy);
  // The whole order is copied: a job that finishes while away is removed with
  // its counters, and its "until" is what says how many completions that took.
  const snap = ordersHere(state, world).map((o) => ({ ...o, label: orderSentence(state, world, cal, o) }));
  advance(state, world, minutes);
  const after = regionState(state, world, region).orders;
  const orders = snap.map((s) => {
    const o = after.find((x) => x.id === s.id);
    const u = s.req.until;
    const finished = u.kind === "times" ? u.n : 1;
    return {
      label: s.label,
      task: s.req.task,
      done: o ? o.done - s.done : Math.max(0, finished - s.done),
      minutes: (o?.minutes ?? s.minutes) - s.minutes,
      skipped: o?.skipped ?? "",
      gone: !o,
    };
  });
  return {
    entries: state.log.slice(before).filter((e) => e.minute > firstMinute),
    orders,
    movedTo: state.player.region === region ? null : regionAt(world, state.player.region).name,
  };
}
