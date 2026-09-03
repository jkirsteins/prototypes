import { GAME_MINUTES_PER_REAL_SECOND } from "../units";
import type { World } from "../world/gen";
import { advance } from "./advance";
import { TOOLS } from "./items";
import { newSkills } from "./skills";
import type { GameState, LogEntry } from "./types";

export const SAVE_KEY = "survidle.save";
/** Away longer than this is simulated as this. */
export const MAX_OFFLINE_SECONDS = 24 * 3600;

export interface SaveFile { version: 3; savedAt: number; state: GameState }

export function serialize(state: GameState, now = Date.now()): string {
  const file: SaveFile = { version: 3, savedAt: now, state };
  return JSON.stringify(file);
}

export function deserialize(text: string): SaveFile | null {
  try {
    const file = JSON.parse(text) as SaveFile;
    if (file?.version !== 3 || !file.state || typeof file.savedAt !== "number") return null;
    fillDefaults(file.state);
    return file;
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
  state.skills ??= newSkills();
  state.intent ??= null;
  if (state.intent) {
    state.intent.orderId ??= null;
    state.intent.windDown ??= false;
  }
  // Hauling was a stored plan once; an intent restarts from anywhere, so a saved plan is simply forgotten.
  delete (state as unknown as Record<string, unknown>).plan;
  const p = state.player;
  p.torch ??= { lit: false, minutes: 0 };
  p.water ??= 2.5;
  p.autoDrink ??= true;
  p.frostbite ??= { feet: 0, hands: 0 };
  p.toes ??= false;
  p.fingers ??= false;
  for (const g of p.clothing) g.wet ??= 0;
  for (const t of p.tools) {
    if (TOOLS[t.id].litres === undefined) continue;
    t.litres ??= 0;
    t.frozen ??= false;
  }
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
  }
}

export function saveGame(state: GameState, storage: Storage = localStorage, now = Date.now()): void {
  if (state.dead) {
    storage.removeItem(SAVE_KEY);
    return;
  }
  storage.setItem(SAVE_KEY, serialize(state, now));
}

export function loadGame(storage: Storage = localStorage): SaveFile | null {
  const text = storage.getItem(SAVE_KEY);
  return text ? deserialize(text) : null;
}

export function clearSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}

/**
 * Simulates the time the tab was closed and returns what happened meanwhile.
 * Runs one-minute steps, the same steps the foreground loop takes.
 */
export function catchUp(state: GameState, world: World, realSecondsElapsed: number, speed = 1): LogEntry[] {
  const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, realSecondsElapsed));
  const minutes = seconds * GAME_MINUTES_PER_REAL_SECOND * speed;
  const before = state.log.length;
  const firstMinute = state.minute;
  advance(state, world, minutes);
  return state.log.slice(before).filter((e) => e.minute > firstMinute);
}
