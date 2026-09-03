/**
 * Fire against the weather: wood that is wet will not warm you, rain that
 * will not let you light and eats what you lit. Every rule here is a number
 * the fire step in camp.ts, the light task and the felt temperature read.
 */
import type { World } from "../world/gen";
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
 * Wet firewood drying: a lit fire or a roof dries 2 kg an hour, shared by the
 * camp's own pile and the pack of whoever is standing there so a fire does
 * not somehow dry two stacks of wood at once. Away from any warmth a stack
 * still gets some sun and wind in dry weather, at 0.5 kg an hour, on its own.
 * None of it dries in the rain.
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
    if (warm) {
      const invs = [campPile, atThisCamp ? p.pack : undefined].filter((x): x is Inventory => x !== undefined);
      dryBudget(invs, 2, dt);
    }
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
