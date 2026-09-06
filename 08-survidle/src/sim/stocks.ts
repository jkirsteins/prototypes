/**
 * Seasonal stocks a region holds without anyone tending them: the spring
 * nests today, the root cellar's wild stock (Task 7) beside it later, same
 * seed-and-clear shape.
 *
 * Kept out of both regionstate.ts and camp.ts on purpose. camp.ts already
 * imports regionState from regionstate.ts, and regionstate.ts is where a
 * region's state first comes into being (regionState() is the only place
 * newRegionState() is called), so it is the one place that can seed a
 * stock the moment a region is first touched - a region entered mid-season
 * (a neighbour first seen in June, say) still needs its nests as though
 * the 1 May roll had already run, and dailyCamp only rolls regions already
 * touched. That means regionstate.ts must import this module's seeding
 * function; for that import to stay a straight line rather than a cycle,
 * this module reads a region's own population directly off the RegionState
 * it is handed rather than going back through regionState() (regionstate.ts)
 * or popOf() (animals.ts, which itself imports regionstate.ts) to get one.
 */
import { regionAt, type World } from "../world/gen";
import { calendar } from "./calendar";
import { EGG_FROM_DOY, EGG_TO_DOY } from "./items";
import type { Species } from "./species";
import type { GameState, RegionState } from "./types";

/** The birds whose nests the spring gives: waterfowl at the shore, grouse on the heath. */
export const NESTING: Species[] = ["mallard", "eider", "willowGrouse", "blackGrouse", "ptarmigan", "capercaillie", "hazelGrouse"];

/** Clutches a region holds on 1 May: a clutch for every four nesting birds about. */
export function nestsFor(world: World, st: RegionState, region: number): number {
  const r = regionAt(world, region);
  let n = 0;
  for (const s of NESTING) if (r.capacity[s]) n += (st.pop[s] ?? 0) / 4;
  return n;
}

/**
 * Seeds a region's seasonal stocks as though every roll up to today had
 * already run, for a region whose state is first created after the roll's
 * day rather than on it. Called once, from regionState() itself, the
 * instant a region's state comes into being: dailyCamp's own roll only
 * ever touches regions already in state.regions, so a region that begins
 * existing mid-window would otherwise read as though its nests were never
 * laid. Task 7's root stock joins here, beside the nests line.
 */
export function seedSeasonalStocks(state: GameState, world: World, st: RegionState, id: number): void {
  const doy = calendar(state.minute, state.startDoy).dayOfYear;
  if (doy >= EGG_FROM_DOY && doy <= EGG_TO_DOY) st.nests = nestsFor(world, st, id);
}
