/**
 * Fire against the weather: wood that is wet will not warm you, rain that
 * will not let you light and eats what you lit. Every rule here is a number
 * the fire step in camp.ts, the light task and the felt temperature read.
 */
import { cellAt, type World } from "../world/gen";
import type { Presence } from "./advance";
import type { Calendar } from "./calendar";
import { addItem, pile, qty, removeItem } from "./inventory";
import { regionState, touchedRegions } from "./regionstate";
import type { GameState, Inventory, RegionState, Weather } from "./types";

export const WET_AFTER_RAIN_MINUTES = 6 * 60;

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

export const BANKED_KG = 6;

/** Lets a lit fire down to a few kilos before you leave it; the surplus goes back on the pile. */
export function bankFire(state: GameState, world: World, region: number): number {
  const st = regionState(state, world, region);
  if (!st.fire.lit) return 0;
  const total = fuelTotal(st.fire);
  if (total <= BANKED_KG) return 0;
  const surplus = total - BANKED_KG;
  const wetShare = st.fire.wetKg / total;
  const wet = surplus * wetShare;
  const dry = surplus - wet;
  st.fire.wetKg -= wet;
  st.fire.fuelKg -= dry;
  const to = pile(state, st.campCell);
  if (dry > 1e-9) addItem(to, "firewood", dry);
  if (wet > 1e-9) addItem(to, "wetFirewood", wet);
  return surplus;
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

/** True when the camp has a roof over it: a lean-to, a turf hut, or a cabin. */
export function roofed(st: RegionState): boolean {
  return st.structures.leanTo || st.structures.cabin || st.structures.turfHut;
}

export const SMOKE_COUGH = 40;
export const SMOKE_DEADLY = 60;
export const SMOKE_RISE_PER_HOUR = 20;
export const SMOKE_FALL_PER_HOUR = 30;
export const SMOKE_DRAIN_PER_HOUR = 25;

/** Smoke in a closed cabin: rises with an indoor fire and no hearth while someone is there to fill the room for, clears otherwise. */
export function stepSmoke(st: RegionState, atCamp: boolean, dt: number): void {
  // The hut has a smoke hole; a camp with one and no cabin never fills. A
  // hut beside a cabin is not the walled shelter the smoke hole was built
  // into, so the cabin's own smoke rule still applies.
  const filling = st.fire.lit && st.fire.indoors && !st.structures.hearth && atCamp && !(st.structures.turfHut && !st.structures.cabin);
  if (filling) {
    const rate = smoky(st.fire) ? SMOKE_RISE_PER_HOUR * 1.5 : SMOKE_RISE_PER_HOUR;
    st.smoke = Math.min(100, st.smoke + (rate / 60) * dt);
  } else {
    st.smoke = Math.max(0, st.smoke - (SMOKE_FALL_PER_HOUR / 60) * dt);
  }
}

/**
 * Fuel a fire eats an hour by where it burns. An open fire kept going is 2
 * to 4 kg an hour; a hearth inside a turf hut kept through a winter night
 * is 15 to 30 kg a day, and Nordic households with a stove burned 4 to 8
 * tonnes a year, so 1.2 and 0.8. The hut and cabin rates apply only to a
 * fire lit indoors; a fire at the pit outside a hut is an open fire.
 */
export const SHELTER_BURN_KG_PER_HOUR = { open: 3, turfHut: 1.2, cabin: 0.8 } as const;

/** Fuel the fire eats per hour in this weather and this shelter; a roof over the pit keeps the rain off. */
export function burnPerHour(w: Weather, ambient: number, st: RegionState): number {
  if (st.fire.indoors) {
    if (st.structures.cabin && st.structures.hearth) return SHELTER_BURN_KG_PER_HOUR.cabin;
    if (st.structures.turfHut) return SHELTER_BURN_KG_PER_HOUR.turfHut;
  }
  if (w.precip === "none" || roofed(st)) return SHELTER_BURN_KG_PER_HOUR.open;
  const snowing = ambient <= 0;
  if (w.precip === "heavy" && !snowing) return 6;
  return 4.5;
}

/** What rain does to lighting: longer, chancy, or not at all. */
export function lightingInRain(w: Weather, ambient: number, roofOverPit: boolean, steady = false): { minutes: number; failChance: number; blocked: string | null } {
  if (w.precip === "none" || roofOverPit) return { minutes: 10, failChance: 0, blocked: null };
  const snowing = ambient <= 0;
  // Steady by the fire: the twenty minutes stay, the one-in-three fail does not.
  const failChance = steady ? 0 : 1 / 3;
  if (w.precip === "heavy" && !snowing) return { minutes: 20, failChance, blocked: "too wet to light" };
  return { minutes: 20, failChance, blocked: null };
}

/** True when a log split here and now comes out wet: rain, or rain within six hours. */
export function splitIsWet(state: GameState, world: World): boolean {
  if (state.weather.precip !== "none") return true;
  return regionState(state, world, state.player.region).logsWet < WET_AFTER_RAIN_MINUTES;
}

/**
 * True when `at` is the camp cell of its own region, with a lean-to or
 * cabin built: the roof keeps the rain off the block, so a split there is
 * never wet. Takes the cell being judged rather than reading the player's
 * own position, since checkFresh judges a task at a cell the player has
 * not necessarily walked to yet.
 */
export function splitSheltered(state: GameState, world: World, at: number): boolean {
  const st = regionState(state, world, cellAt(world, at).region);
  return at === st.campCell && roofed(st);
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
 * Wet firewood drying: a lit fire or a cabin dries 2 kg an hour in total,
 * shared by the camp's own pile and the pack of whoever is standing there,
 * whatever the weather - the heat, or the roof, keeps the rain out of it.
 * A lean-to alone is not that complete a shelter: 2 kg an hour in dry
 * weather, none in rain. Every other pile, and the pack away from any camp,
 * dries at 0.5 an hour in dry weather, none in rain.
 */
export function dryWood(state: GameState, dt: number, who: Presence | null): void {
  const w = state.weather;
  const dry = w.precip === "none";
  for (const id of touchedRegions(state)) {
    const st = state.regions[id];
    const sheltered = st.fire.lit || st.structures.cabin || st.structures.turfHut;
    const perHour = sheltered ? 2 : st.structures.leanTo ? (dry ? 2 : 0) : dry ? 0.5 : 0;
    if (perHour <= 0) continue;
    const campPile = state.piles[st.campCell];
    const atThisCamp = who !== null && id === who.region && who.atCamp;
    const invs = [campPile, atThisCamp ? state.player.pack : undefined].filter((x): x is Inventory => x !== undefined);
    dryBudget(invs, perHour, dt);
  }
  if (!dry) return;
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv) continue;
    const isCampPile = touchedRegions(state).some((id) => state.regions[id].campCell === cell);
    if (!isCampPile) dryBudget([inv], 0.5, dt);
  }
  // Away from every camp, the pack dries in the open like any other stack; nobody carries one with nobody home.
  if (who && !who.atCamp) dryBudget([state.player.pack], 0.5, dt);
}
