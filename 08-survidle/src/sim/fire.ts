/**
 * Fire against the weather: wood that is wet will not warm you, rain that
 * will not let you light and eats what you lit. Every rule here is a number
 * the fire step in camp.ts, the light task and the felt temperature read.
 */
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { addItem, qty, removeItem } from "./inventory";
import { cellOf } from "./position";
import { regionState, touchedRegions } from "./regionstate";
import type { GameState, Inventory, RegionState, Weather } from "./types";

export const WET_AFTER_RAIN_MINUTES = 6 * 60;
const BURN_KG_PER_HOUR = 3;

export function fuelTotal(fire: RegionState["fire"]): number {
  return fire.fuelKg + fire.wetKg;
}

/** More wet than dry on the fire: it smokes and gives half the heat. */
export function smoky(fire: RegionState["fire"]): boolean {
  return fire.wetKg > fire.fuelKg / 2;
}

/** The fire's felt-temperature bonus for someone at camp: 15 at a camp task, 7 otherwise, halved when smoky. */
export function fireWarmth(fire: RegionState["fire"], campTask: boolean): number {
  if (!fire.lit) return 0;
  const full = campTask ? 15 : 7;
  return smoky(fire) ? full / 2 : full;
}

export const SPREAD_FUEL_KG = 12;
export const SPREAD_UNATTENDED_MINUTES = 120;
export const DRY_DAYS = 3;
export const SPREAD_PER_HOUR = 0.02;

/** Fire season, when the ground can dry out enough to carry a fire off camp. */
export function fireSeason(cal: Calendar): boolean {
  return cal.season === "summer" || cal.month === 8;
}

/** Tinder-dry ground: fire season, and no rain for DRY_DAYS days running. */
export function groundDry(w: Weather, cal: Calendar): boolean {
  return fireSeason(cal) && w.dryDays >= DRY_DAYS;
}

/** True when the fire at this camp warms the people at it: any fire outdoors, indoors only with a hearth or lit indoors. */
export function fireWarms(st: RegionState): boolean {
  if (!st.fire.lit) return false;
  if (!st.structures.cabin) return true;
  return st.structures.hearth || st.fire.indoors;
}

export const SMOKE_COUGH = 40;
export const SMOKE_DEADLY = 60;
export const SMOKE_RISE_PER_HOUR = 20;
export const SMOKE_FALL_PER_HOUR = 30;
export const SMOKE_DRAIN_PER_HOUR = 25;

/** Smoke in a closed cabin: rises with an indoor fire and no hearth while someone is there to fill the room for, clears otherwise. */
export function stepSmoke(st: RegionState, atCamp: boolean, dt: number): void {
  const filling = st.fire.lit && st.fire.indoors && !st.structures.hearth && atCamp;
  if (filling) {
    const rate = smoky(st.fire) ? SMOKE_RISE_PER_HOUR * 1.5 : SMOKE_RISE_PER_HOUR;
    st.smoke = Math.min(100, st.smoke + (rate / 60) * dt);
  } else {
    st.smoke = Math.max(0, st.smoke - (SMOKE_FALL_PER_HOUR / 60) * dt);
  }
}

/** Fuel the fire eats per hour in this weather; a roof over the pit keeps the rain off. */
export function burnPerHour(w: Weather, ambient: number, roofOverPit: boolean): number {
  if (w.precip === "none" || roofOverPit) return BURN_KG_PER_HOUR;
  const snowing = ambient <= 0;
  if (w.precip === "heavy" && !snowing) return 6;
  return 4.5;
}

/** What rain does to lighting: longer, chancy, or not at all. */
export function lightingInRain(w: Weather, ambient: number, roofOverPit: boolean): { minutes: number; failChance: number; blocked: string | null } {
  if (w.precip === "none" || roofOverPit) return { minutes: 10, failChance: 0, blocked: null };
  const snowing = ambient <= 0;
  if (w.precip === "heavy" && !snowing) return { minutes: 20, failChance: 1 / 3, blocked: "too wet to light" };
  return { minutes: 20, failChance: 1 / 3, blocked: null };
}

/** True when a log split here and now comes out wet: rain, or rain within six hours. */
export function splitIsWet(state: GameState, world: World): boolean {
  if (state.weather.precip !== "none") return true;
  return regionState(state, world, state.player.region).logsWet < WET_AFTER_RAIN_MINUTES;
}

/** Dries up to `perHour * dt / 60` kg total, drawn from whichever of `invs` has wet stock first. */
function dryBudget(invs: Inventory[], perHour: number, dt: number): void {
  let budget = (perHour / 60) * dt;
  for (const inv of invs) {
    if (budget <= 1e-9) break;
    const wet = qty(inv, "wetFirewood");
    if (wet <= 1e-9) continue;
    const moved = removeItem(inv, "wetFirewood", Math.min(wet, budget));
    addItem(inv, "firewood", moved);
    budget -= moved;
  }
}

/**
 * Wet firewood drying: a fire or a roof dries 2 kg an hour in total, shared
 * by the camp's own pile and the pack of whoever is standing there, so a
 * fire does not somehow dry two stacks of wood at once. An unsheltered camp
 * is still the open, and dries the same combined way at 0.5. Every other
 * pile, and the pack away from any camp, dries at 0.5 on its own. None of it
 * dries in the rain.
 */
export function dryWood(state: GameState, world: World, dt: number): void {
  const w = state.weather;
  if (w.precip !== "none") return;
  const p = state.player;
  const here = cellOf(state, world);
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    const warm = st.fire.lit || st.structures.leanTo || st.structures.cabin;
    const campPile = state.piles[st.campCell];
    const atThisCamp = id === p.region && here === st.campCell;
    const invs = [campPile, atThisCamp ? p.pack : undefined].filter((x): x is Inventory => x !== undefined);
    dryBudget(invs, warm ? 2 : 0.5, dt);
  }
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv) continue;
    const isCampPile = touchedRegions(state).some((id) => state.regions[id].campCell === cell);
    if (!isCampPile) dryBudget([inv], 0.5, dt);
  }
  // Away from every camp, the pack dries in the open like any other stack.
  const st = regionState(state, world, p.region);
  if (here !== st.campCell) dryBudget([p.pack], 0.5, dt);
}
