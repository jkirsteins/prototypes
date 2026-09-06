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
 *
 * rootStockFor has the same reason to live here rather than in camp.ts,
 * which reads more naturally: camp.ts already imports regionState from
 * regionstate.ts, and position.ts's watersideCell imports regionstate.ts
 * too (for enterRegion), so either camp.ts or position.ts importing this
 * module back would close a cycle. rootStockFor is exported here and
 * re-exported from camp.ts, the way dailyCamp's own callers reach it.
 */
import { cellAt, neighbours, regionAt, type World } from "../world/gen";
import { calendar } from "./calendar";
import { EGG_FROM_DOY, EGG_TO_DOY, ROOT_STOCK_KG_PER_CELL } from "./items";
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

/** Ground roots grow in: the shore, the bog, the meadow. */
function rootGround(world: World, idx: number): boolean {
  const t = cellAt(world, idx).terrain;
  return t === "bog" || t === "meadow" || neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water");
}

/**
 * Kilos a region's shore, bog and meadow cells hold together, ROOT_STOCK_KG_PER_CELL
 * apiece: what 1 April sets and nothing regrows before the next one.
 */
export function rootStockFor(world: World, region: number): number {
  const r = regionAt(world, region);
  return r.cells.filter((c) => rootGround(world, c)).length * ROOT_STOCK_KG_PER_CELL;
}

/**
 * Seeds a region's seasonal stocks as though every roll up to today had
 * already run, for a region whose state is first created after the roll's
 * day rather than on it. Called once, from regionState() itself, the
 * instant a region's state comes into being: dailyCamp's own roll only
 * ever touches regions already in state.regions, so a region that begins
 * existing mid-window would otherwise read as though its nests were never
 * laid. The root stock is always full on first touch: unlike the nests it
 * has no window to fall outside of, only a yearly 1 April reset, and a
 * region nobody has dug in yet has nothing dug out of it.
 */
export function seedSeasonalStocks(state: GameState, world: World, st: RegionState, id: number): void {
  const doy = calendar(state.minute, state.startDoy).dayOfYear;
  if (doy >= EGG_FROM_DOY && doy <= EGG_TO_DOY) st.nests = nestsFor(world, st, id);
  st.roots = rootStockFor(world, id);
}
