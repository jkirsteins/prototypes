/**
 * Seasonal stocks a region holds without anyone tending them: the spring
 * nests, set two ways - on their own day-of-year roll for a region already
 * being simulated, and again here the instant a region's state first comes
 * into being, so a region first touched mid-window reads no differently
 * from one that has been rolling since the season opened - and the roots of
 * its shore, bog and meadow ground, which need no seeding at all, a cell
 * nobody has dug being full by the fact that it has no entry.
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
 * The root ground has the same reason to live here rather than in camp.ts,
 * which reads more naturally: camp.ts already imports regionState from
 * regionstate.ts, and position.ts's watersideCell imports regionstate.ts
 * too (for enterRegion), so either camp.ts or position.ts importing this
 * module back would close a cycle. rootStockFor is exported here and
 * re-exported from camp.ts, the way dailyCamp's own callers reach it.
 */
import { resourcePotentialAt } from "../world/aggregate";
import { PATCH_M, patchId, patchXY } from "../world/spatial";
import { cellAt, neighbours, regionAt, type World } from "../world/gen";
import { passable } from "../world/route";
import { calendar } from "./calendar";
import {
  EGG_FROM_DOY, EGG_TO_DOY, MEADOW_ROOT_KG_PER_M2, RHIZOME_KG_PER_M2, ROOT_GROWTH_FROM_DOY, ROOT_GROWTH_TO_DOY,
  ROOT_HARVEST_FRACTION, ROOT_POOR_SHARE, ROOT_REGROWTH_SHARE, STAND_SHARE_BOG, STAND_SHARE_MEADOW, STAND_SHARE_SHORE,
} from "./items";
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
 * The trace inventory.ts keeps a residue at, repeated rather than imported:
 * this module is a leaf both regionstate.ts and camp.ts can import, and
 * inventory.ts reaches position.ts and back to regionstate.ts. A cell within
 * this of full is full.
 */
const TRACE_KG = 1e-9;

/**
 * A cell with water at its edge, walkable ground itself. Duplicates
 * position.ts's watersideCell rather than importing it - that import is the
 * cycle the module comment above explains - so a change to what counts as
 * waterside there must be carried here too.
 */
function watersideHere(world: World, idx: number): boolean {
  return passable(cellAt(world, idx).terrain) && neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water");
}

/**
 * Kilos of rhizome a patch holds when nothing has been dug from it: the
 * stand's share of the patch's own ground, at its density, times the share
 * a digging stick lifts. Ground that is both waterside and wet is the wet
 * patch it is, fringe and all, so it takes the larger figure rather than
 * the sum. Zero on ground no root stand grows on.
 */
export function rootCellFullKg(world: World, idx: number): number {
  const t = cellAt(world, idx).terrain;
  const area = resourcePotentialAt(world, idx).areaKm2 * 1e6;
  let kg = 0;
  if (watersideHere(world, idx)) kg = Math.max(kg, area * STAND_SHARE_SHORE * RHIZOME_KG_PER_M2);
  if (t === "bog") kg = Math.max(kg, area * STAND_SHARE_BOG * RHIZOME_KG_PER_M2);
  if (t === "meadow") kg = Math.max(kg, area * STAND_SHARE_MEADOW * MEADOW_ROOT_KG_PER_M2);
  return kg * ROOT_HARVEST_FRACTION;
}

/** Kilos the region's root ground holds untouched: what its cells add up to, the figure the ground itself supports. */
export function rootStockFor(world: World, region: number): number {
  let kg = 0;
  for (const c of regionAt(world, region).cells) kg += rootCellFullKg(world, c);
  return kg;
}

/** Kilos in this cell now: what has been dug from it, or its full figure when nothing has. */
export function rootCellKg(st: RegionState, world: World, idx: number): number {
  return st.rootCells[idx] ?? rootCellFullKg(world, idx);
}

/** Kilos left in the region's root ground, cell by cell. */
export function rootKgLeft(st: RegionState, world: World, region: number): number {
  let kg = 0;
  for (const c of regionAt(world, region).cells) kg += rootCellKg(st, world, c);
  return kg;
}

/** Writes a cell's kilos, dropping the entry when the cell is back at full: an absent cell is a full one. */
export function setRootCellKg(st: RegionState, world: World, idx: number, kg: number): void {
  const full = rootCellFullKg(world, idx);
  if (kg >= full - TRACE_KG) delete st.rootCells[idx];
  else st.rootCells[idx] = Math.max(0, kg);
}

/**
 * How fast a patch gives up its roots: full rate until it is dug below
 * ROOT_POOR_SHARE of what it holds, and from there down in proportion, so a
 * patch at a quarter of full digs at half rate.
 */
export function rootDigFactor(cur: number, full: number): number {
  if (full <= 0) return 0;
  return Math.min(1, cur / (full * ROOT_POOR_SHARE));
}

/**
 * The day's regrowth on every cell that has been dug. A season puts back
 * ROOT_REGROWTH_SHARE of what a cell is short, spread over the growing
 * window; the share is the season's and not the day's, so the daily fraction
 * is the one that compounds to it over the window's days, and a cell keeps
 * whatever deficit it still has each morning. Between years the rule runs
 * again, so ground left alone climbs back towards full.
 */
export function growRoots(st: RegionState, world: World, doy: number): void {
  if (doy < ROOT_GROWTH_FROM_DOY || doy > ROOT_GROWTH_TO_DOY) return;
  const days = ROOT_GROWTH_TO_DOY - ROOT_GROWTH_FROM_DOY + 1;
  const daily = 1 - (1 - ROOT_REGROWTH_SHARE) ** (1 / days);
  for (const key of Object.keys(st.rootCells)) {
    const idx = Number(key);
    const full = rootCellFullKg(world, idx);
    const cur = st.rootCells[idx]!;
    setRootCellKg(st, world, idx, cur + (full - cur) * daily);
  }
}

/**
 * Seeds a region's seasonal stocks as though every roll up to today had
 * already run, for a region whose state is first created after the roll's
 * day rather than on it. Called once, from regionState() itself, the
 * instant a region's state comes into being: dailyCamp's own roll only
 * ever touches regions already in state.regions, so a region that begins
 * existing mid-window would otherwise read as though its nests were never
 * laid. Outside the window there are no clutches to seed and the figure is
 * plainly none, the same as the roll on the day after the window sets it.
 */
export function seedSeasonalStocks(state: GameState, world: World, st: RegionState, id: number): void {
  const doy = calendar(state.minute, state.startDoy).dayOfYear;
  st.nests = doy >= EGG_FROM_DOY && doy <= EGG_TO_DOY ? nestsFor(world, st, id) : 0;
}

/**
 * Trees worth felling on a patch nobody has cut: what its own 0.0025 km2
 * of ground grows, and nothing of its neighbours'. Open ground grows none.
 */
export function woodPatchFull(world: World, idx: number): number {
  return resourcePotentialAt(world, idx).trees;
}

/** Trees standing on this patch now: what has been taken from it, or its full figure when nothing has. */
export function woodPatchLeft(st: RegionState, world: World, idx: number): number {
  return st.woodCells[idx] ?? woodPatchFull(world, idx);
}

/** Writes a patch's standing trees, dropping the entry when the patch is back at full: an absent patch is an uncut one. */
export function setWoodPatchLeft(st: RegionState, world: World, idx: number, trees: number): void {
  const full = woodPatchFull(world, idx);
  if (trees >= full - TRACE_KG) delete st.woodCells[idx];
  else st.woodCells[idx] = Math.max(0, trees);
}

/** Takes trees off one patch and no other: felling, dead wood and bark all draw on the ground they stand on. */
export function takeWood(st: RegionState, world: World, idx: number, trees: number): void {
  setWoodPatchLeft(st, world, idx, woodPatchLeft(st, world, idx) - trees);
}

/**
 * Trees left across a whole region: its uncut total less what has been taken
 * off the patches somebody has worked, so the sum costs the worked patches
 * rather than the region. A reference figure, never a gate on one patch's work.
 */
export function woodLeft(st: RegionState, world: World, region: number): number {
  let taken = 0;
  for (const key of Object.keys(st.woodCells)) {
    const idx = Number(key);
    taken += woodPatchFull(world, idx) - st.woodCells[idx]!;
  }
  return Math.max(0, regionAt(world, region).wood0 - taken);
}

/**
 * The day's growth on every patch that has been cut. A patch puts back its
 * own ground's share of a year over a year, so what regrows follows the
 * stand rather than the region, and a patch left alone climbs back to full.
 */
export function growWood(st: RegionState, world: World): void {
  for (const key of Object.keys(st.woodCells)) {
    const idx = Number(key);
    setWoodPatchLeft(st, world, idx, st.woodCells[idx]! + resourcePotentialAt(world, idx).treesPerYear / 365);
  }
}

/**
 * How far a fire that walks off camp reaches before it runs out of ground
 * it can cross: the near forest, not the region's.
 */
export const FIRE_SPREAD_REACH_M = 300;

/**
 * Burns up to `trees` worth of standing timber off the ground around a
 * patch, nearest first, taking each patch down to bare before moving out.
 * Nothing beyond the reach burns, however much of the budget is left.
 */
export function burnWoodAround(st: RegionState, world: World, centre: number, trees: number): void {
  const reach = Math.floor(FIRE_SPREAD_REACH_M / PATCH_M);
  const origin = patchXY(centre);
  const near: { idx: number; distance: number }[] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      near.push({ idx: patchId(x, y), distance: dx * dx + dy * dy });
    }
  }
  near.sort((a, b) => a.distance - b.distance || a.idx - b.idx);
  let budget = trees;
  for (const { idx } of near) {
    if (budget <= TRACE_KG) return;
    const standing = woodPatchLeft(st, world, idx);
    if (standing <= TRACE_KG) continue;
    const burnt = Math.min(standing, budget);
    setWoodPatchLeft(st, world, idx, standing - burnt);
    budget -= burnt;
  }
}
