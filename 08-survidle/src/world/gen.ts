/**
 * Regions, computed the first time one is asked for. A region is the set of
 * cells nearest one lattice seed; its stats, name, camp and spots come from
 * scanning its own cells, never the whole world.
 */
import { Rng, derive } from "../rng";
import { SPECIES, type Species, type SpotId, type Terrain } from "../sim/types";
import { CELL_KM } from "../units";
import { type Cell, cellAt, cellIdx, neighbours, newWorld, regionOf, terrainOf, type World } from "./cells";
import { regionName } from "./names";
import { findRoute, passable, routeKm } from "./route";
import { LATTICE, LATTICE_H, LATTICE_W, TERRAINS, WORLD_H, WORLD_W } from "./terrain";

export { cellAt, cellIdx, neighbours, regionOf, regionPeek, terrainOf, terrainPeek, type Cell, type World } from "./cells";
export { TERRAINS, WORLD_H, WORLD_W } from "./terrain";

/** A named place to walk to: its cell and the route length from camp. */
export interface Spot { id: SpotId; km: number; cell: number }

export interface RegionDef {
  id: number;
  name: string;
  cells: number[];
  landCells: number;
  cx: number;
  cy: number;
  /** km2 */
  area: number;
  frac: Record<Terrain, number>;
  /** spruce + pine + birch */
  forest: number;
  /** rock + fell */
  rock: number;
  /** Trees worth felling when the run begins. */
  wood0: number;
  capacity: Record<Species, number>;
  neighbours: { id: number; km: number }[];
  spots: Spot[];
  /** The land cell nearest the centroid: camp. */
  campCell: number;
}

/** A world is cheap to make; regions and chunks come as they are touched. */
export function generateWorld(seed: number): World {
  const world = newWorld(seed);
  world.start = findStart(world);
  return world;
}

export function regionAt(world: World, id: number): RegionDef {
  let r = world.regions.get(id);
  if (!r) {
    r = buildRegion(world, id);
    world.regions.set(id, r);
  }
  return r;
}

export function latticeOf(id: number): { lx: number; ly: number } {
  return { lx: id % LATTICE_W, ly: Math.floor(id / LATTICE_W) };
}

function buildRegion(world: World, id: number): RegionDef {
  const { lx, ly } = latticeOf(id);
  const x0 = Math.max(0, (lx - 1) * LATTICE);
  const y0 = Math.max(0, (ly - 1) * LATTICE);
  const x1 = Math.min(WORLD_W - 1, (lx + 2) * LATTICE);
  const y1 = Math.min(WORLD_H - 1, (ly + 2) * LATTICE);
  const cells: number[] = [];
  const count: Record<Terrain, number> = { water: 0, fell: 0, rock: 0, bog: 0, spruce: 0, pine: 0, birch: 0, meadow: 0 };
  let sx = 0;
  let sy = 0;
  const nb = new Set<number>();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (regionOf(world, x, y) !== id) continue;
      cells.push(cellIdx(world, x, y));
      count[terrainOf(world, x, y)]++;
      sx += x;
      sy += y;
      // Neighbouring regions share a 4-connected edge.
      if (x > 0) nb.add(regionOf(world, x - 1, y));
      if (x < WORLD_W - 1) nb.add(regionOf(world, x + 1, y));
      if (y > 0) nb.add(regionOf(world, x, y - 1));
      if (y < WORLD_H - 1) nb.add(regionOf(world, x, y + 1));
    }
  }
  nb.delete(id);
  nb.delete(-1);
  const n = Math.max(1, cells.length);
  const frac = { ...count } as Record<Terrain, number>;
  for (const t of TERRAINS) frac[t] = count[t] / n;
  const forest = frac.spruce + frac.pine + frac.birch;
  const rock = frac.rock + frac.fell;
  const area = cells.length * CELL_KM * CELL_KM;
  const landCells = cells.length - count.water;
  const capacity: Record<Species, number> = {
    hare: area * (4 + 16 * (frac.meadow + frac.birch)),
    grouse: area * (8 + 20 * (frac.pine + frac.spruce)),
    deer: area * 5 * forest,
    elk: area * (0.3 + 0.8 * (frac.spruce + frac.bog)),
    fish: area * 60 * frac.water,
  };
  for (const s of SPECIES) if (capacity[s] < 0.5) capacity[s] = 0;
  const cx = sx / n;
  const cy = sy / n;
  const campCell = nearestCell(world, cells, cx, cy, (c) => passable(c.terrain)) ?? cells[0];
  const rng = new Rng(derive(world.seed, 1000 + id));
  const r: RegionDef = {
    id,
    name: regionName(rng, { water: frac.water, rock, bog: frac.bog, forest }, new Set()),
    cells,
    landCells,
    cx,
    cy,
    area,
    frac,
    forest,
    rock,
    wood0: Math.round(forest * cells.length * 60),
    capacity,
    neighbours: [...nb]
      .sort((a, b) => a - b)
      .map((o) => {
        const { lx: ox, ly: oy } = latticeOf(o);
        // Straight seed-to-seed distance for the migration weights and the card; travel uses routes.
        const km = Math.hypot((lx - ox) * LATTICE, (ly - oy) * LATTICE) * CELL_KM * 1.25;
        return { id: o, km: Math.round(km * 10) / 10 };
      }),
    spots: [],
    campCell,
  };
  r.spots = placeSpots(world, r);
  return r;
}

type Pick = (c: Cell) => boolean;
const IS_FOREST: Pick = (c) => c.terrain === "spruce" || c.terrain === "pine" || c.terrain === "birch";
const IS_ROCK: Pick = (c) => c.terrain === "rock" || c.terrain === "fell";
const IS_HEATH: Pick = (c) => c.terrain === "bog" || c.terrain === "meadow";
/** Fishing happens from land beside water. */
const isShore = (world: World) => (c: Cell) =>
  passable(c.terrain) && neighbours(world, c.y * world.w + c.x).some((n) => terrainOf(world, n % world.w, Math.floor(n / world.w)) === "water");

/**
 * Camp sits at the centroid. Each other spot is the matching cell in the
 * region whose walk from camp is nearest a target length that grows as the
 * terrain gets rarer: the forest is close in a forest region, the outcrop
 * far when rock is scarce.
 */
function placeSpots(world: World, r: RegionDef): Spot[] {
  const spots: Spot[] = [{ id: "camp", km: 0, cell: r.campCell }];
  const camp = cellAt(world, r.campCell);
  if (!passable(camp.terrain)) return spots;
  const wants: { id: SpotId; pick: Pick; km: number; share: number }[] = [
    { id: "forest", pick: IS_FOREST, km: 0.3 + 0.9 * (1 - r.forest), share: r.forest },
    { id: "outcrop", pick: IS_ROCK, km: 0.4 + 1.2 * (1 - r.rock), share: r.rock },
    { id: "shore", pick: isShore(world), km: 0.3 + 1.0 * (1 - r.frac.water), share: r.frac.water },
    { id: "heath", pick: IS_HEATH, km: 0.3 + 1.0 * (1 - r.frac.bog - r.frac.meadow), share: r.frac.bog + r.frac.meadow },
  ];
  for (const want of wants) {
    if (want.share <= 0.02) continue;
    // Candidates by straight-line distance first, then the real route for the closest few.
    const candidates: { idx: number; off: number }[] = [];
    for (const idx of r.cells) {
      const c = cellAt(world, idx);
      if (!want.pick(c) || idx === r.campCell) continue;
      const straight = Math.hypot(c.x - camp.x, c.y - camp.y) * CELL_KM;
      candidates.push({ idx, off: Math.abs(straight - want.km) });
    }
    candidates.sort((a, b) => a.off - b.off);
    let best: { cell: number; km: number } | null = null;
    for (const cand of candidates.slice(0, 6)) {
      const route = findRoute(world, r.campCell, cand.idx);
      if (!route) continue;
      const km = routeKm(route);
      if (!best || Math.abs(km - want.km) < Math.abs(best.km - want.km)) best = { cell: cand.idx, km };
    }
    if (best) spots.push({ id: want.id, km: Math.round(best.km * 10) / 10, cell: best.cell });
  }
  return spots;
}

function nearestCell(world: World, cells: number[], cx: number, cy: number, ok: Pick): number | null {
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const idx of cells) {
    const c = cellAt(world, idx);
    if (!ok(c)) continue;
    const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  return best;
}

/**
 * The run starts inland, in the forested country south of the fells: the
 * first lattice cell spiralling out from that anchor whose region is mostly
 * forest with room to build.
 */
function findStart(world: World): number {
  const ax = Math.floor((0.58 * WORLD_W) / LATTICE);
  const ay = Math.floor((0.72 * WORLD_H) / LATTICE);
  for (let ring = 0; ring < 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const lx = ax + dx;
        const ly = ay + dy;
        if (lx < 0 || ly < 0 || lx >= LATTICE_W || ly >= LATTICE_H) continue;
        const id = ly * LATTICE_W + lx;
        const r = regionAt(world, id);
        if (r.forest >= 0.45 && r.landCells >= 120 && r.frac.water < 0.15 && r.spots.length >= 3) return id;
      }
    }
  }
  return ay * LATTICE_W + ax;
}

export function spotOf(region: RegionDef, spot: SpotId): Spot | undefined {
  return region.spots.find((s) => s.id === spot);
}

export function hasSpot(region: RegionDef, spot: SpotId): boolean {
  return region.spots.some((s) => s.id === spot);
}
