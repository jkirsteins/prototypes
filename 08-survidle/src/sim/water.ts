/**
 * Water: a reserve in litres beside the kilocalories. You drink where the
 * water is, or from a vessel you filled there; a shore under ice gives
 * nothing, and snow is water only at a fire (tasks.ts, melt).
 */
import { PACK_COMFORTABLE_KG } from "../units";
import type { World } from "../world/gen";
import { carried } from "./inventory";
import { TOOLS } from "./items";
import { type Activity, activityOf } from "./player";
import { cellOf, watersideCell } from "./position";
import type { GameState, Player } from "./types";

export const WATER_FULL = 3.0;
export const THIRSTY_L = 1.0;
/** Ice this thick closes the shore. */
export const ICE_SHORE_CM = 2;
export const THIRST_DRAIN_PER_HOUR = 4;
/** Vessels freeze below this ambient when the body is still and no fire is by. */
export const FREEZE_C = -5;

const LOSS_PER_HOUR: Record<Activity, number> = { sleep: 0.1, rest: 0.1, light: 0.15, walk: 0.25, heavy: 0.35 };

export function waterLossPerHour(state: GameState, felt: number): number {
  const p = state.player;
  let a = activityOf(state.task);
  if (a === "walk" && carried(p) > PACK_COMFORTABLE_KG) a = "heavy";
  let l = LOSS_PER_HOUR[a];
  if (felt > 20 || felt < -10) l *= 1.3;
  if (p.sick > 0) l *= 1.2;
  return l;
}

/** Lowers the reserve for dt minutes and returns the health drain for the same minutes: nothing until it is empty. */
export function stepWater(state: GameState, felt: number, dt: number): number {
  const p = state.player;
  p.water = Math.max(0, p.water - (waterLossPerHour(state, felt) / 60) * dt);
  return p.water <= 0 ? (THIRST_DRAIN_PER_HOUR / 60) * dt : 0;
}

/** Open water under foot: a waterside cell with the shore not iced over. */
export function waterSource(state: GameState, world: World): boolean {
  return watersideCell(world, cellOf(state, world)) && state.weather.iceCm < ICE_SHORE_CM;
}

export function vesselLitres(p: Player): number {
  let l = 0;
  for (const t of p.tools) if (!t.frozen) l += t.litres ?? 0;
  return l;
}

/** Fills the body from a vessel first, then the source under foot. False when neither has water. */
export function drink(state: GameState, world: World): boolean {
  const p = state.player;
  let want = WATER_FULL - p.water;
  if (want <= 1e-9) return false;
  for (const t of p.tools) {
    if (want <= 1e-9) break;
    if (t.frozen || !(t.litres ?? 0)) continue;
    const take = Math.min(want, t.litres!);
    t.litres! -= take;
    want -= take;
  }
  if (want > 1e-9 && waterSource(state, world)) want = 0;
  if (want === WATER_FULL - p.water) return false;
  p.water = WATER_FULL - want;
  return true;
}

/** Fills every vessel at a source. Returns litres added. */
export function fillVessels(state: GameState, world: World): number {
  if (!waterSource(state, world)) return 0;
  let added = 0;
  for (const t of state.player.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds) continue;
    added += holds - (t.litres ?? 0);
    t.litres = holds;
    t.frozen = false;
  }
  return added;
}

/** Drinks at the thirsty line when a vessel or the shore allows, like auto-eat. */
export function autoDrink(state: GameState, world: World): void {
  const p = state.player;
  if (!p.autoDrink || p.water >= THIRSTY_L) return;
  drink(state, world);
}
