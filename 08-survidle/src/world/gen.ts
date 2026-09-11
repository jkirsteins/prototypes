/**
 * Regions, computed the first time one is asked for. A region is the set of
 * cells nearest one lattice seed; its stats, name, camp and spots come from
 * scanning its own cells, never the whole world.
 */
import { Rng, derive } from "../rng";
import { SPECIES_IDS } from "../sim/species";
import type { Habitat, Species, SpotId, Terrain } from "../sim/types";
import { CELL_KM } from "../units";
import { type Cell, cellAt, cellIdx, neighbours, newWorld, regionOf, streamAt, terrainOf, waterKindOf, type World } from "./cells";
import { regionName } from "./names";
import { findRoute, passable, routeKm } from "./route";
import { KIND, type SolvedWorld } from "./solve";
import { rememberSolved, solvedFor } from "./solvecache";
import { coastLineU, LATTICE, LATTICE_H, LATTICE_W, TERRAINS, WORLD_H, WORLD_W } from "./terrain";
import { wildlifeCapacity } from "./wildlife";

export { cellAt, cellIdx, dischargeAt, fordAt, heightAt, latitudeOfRow, moistureAt, neighbours, regionOf, regionPeek, streamAt, terrainOf, terrainPeek, waterKindOf, type Cell, type World } from "./cells";
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
  /** Shares of the region's cells that are lake water and sea water; together they are frac.water. */
  lake: number;
  sea: number;
  /** Animals the region can hold, by species; a species not here never lives here. */
  capacity: Partial<Record<Species, number>>;
  neighbours: { id: number; km: number }[];
  spots: Spot[];
  /** The land cell nearest the centroid: camp. */
  campCell: number;
}

/** The solve is the dear part; regions and chunks come as they are touched. */
export function generateWorld(seed: number, solved?: SolvedWorld): World {
  const world = newWorld(seed, solved ?? solvedFor(seed, WORLD_W, WORLD_H));
  if (solved) rememberSolved(solved, seed);
  const s = findStart(world);
  world.start = s.id;
  world.startCell = s.cell;
  world.startRing = s.ring;
  const region = regionAt(world, s.id);
  if (region.campCell !== s.cell) {
    region.campCell = s.cell;
    region.spots = placeSpots(world, region);
  }
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

/** Land beside water for camp siting: a stream counts, same as any water neighbour, since a camp on a brook is still a camp by water. */
const campWaterside = (world: World) => (c: Cell) => {
  const idx = c.y * world.w + c.x;
  return passable(c.terrain) && (streamAt(world, idx) || neighbours(world, idx).some((n) => waterKindOf(world, n) !== null));
};

/** Fishing happens from land beside a lake, sea or river; a stream is too thin to fish and is drinking water only. */
const fishingShore = (world: World) => (c: Cell) =>
  passable(c.terrain) && neighbours(world, c.y * world.w + c.x).some((n) => waterKindOf(world, n) !== null);

function buildRegion(world: World, id: number): RegionDef {
  const { lx, ly } = latticeOf(id);
  const x0 = Math.max(0, (lx - 1) * LATTICE);
  const y0 = Math.max(0, (ly - 1) * LATTICE);
  const x1 = Math.min(WORLD_W - 1, (lx + 2) * LATTICE);
  const y1 = Math.min(WORLD_H - 1, (ly + 2) * LATTICE);
  const cells: number[] = [];
  const count: Record<Terrain, number> = { water: 0, fell: 0, rock: 0, bog: 0, spruce: 0, pine: 0, birch: 0, meadow: 0, river: 0 };
  let sx = 0;
  let sy = 0;
  let seaCells = 0;
  let lakeCells = 0;
  const nb = new Set<number>();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (regionOf(world, x, y) !== id) continue;
      cells.push(cellIdx(world, x, y));
      count[terrainOf(world, x, y)]++;
      if (terrainOf(world, x, y) === "water") {
        if (world.solved.kind[cellIdx(world, x, y)] === KIND.sea) seaCells++;
        else lakeCells++;
      }
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
  const landCells = cells.length - count.water - count.river;
  const lake = lakeCells / n;
  const sea = seaCells / n;
  const shares: Record<Habitat, number> = {
    fell: frac.fell, rock: frac.rock, bog: frac.bog, spruce: frac.spruce, pine: frac.pine, birch: frac.birch, meadow: frac.meadow, river: frac.river, lake, sea,
  };
  const cx = sx / n;
  const cy = sy / n;
  const capacity = wildlifeCapacity(world.seed, area, shares, cx, cy);
  // Camp is the shore cell nearest the centroid: a survivor camps by the water,
  // and the centroid is only where the region's middle happens to be. A region
  // with no shore keeps the centroid camp.
  const campCell = nearestCell(world, cells, cx, cy, campWaterside(world))
    ?? nearestCell(world, cells, cx, cy, (c) => passable(c.terrain))
    ?? cells[0];
  const rng = new Rng(derive(world.seed, 1000 + id));
  const r: RegionDef = {
    id,
    name: regionName(rng, { water: frac.water + frac.river, rock, bog: frac.bog, forest }, new Set()),
    cells,
    landCells,
    cx,
    cy,
    area,
    frac,
    lake,
    sea,
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

/**
 * Camp sits on the shore nearest the centroid. Each other spot is the matching cell in the
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
    // The camp stands on the shore, so the shore spot is the next shore cell along: the
    // fishing place a minute away, never the camp's own cell.
    { id: "shore", pick: fishingShore(world), km: 0, share: r.frac.water },
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

/** Rows the first boat may land in: the southern 15 percent of the world. */
const START_SOUTH_SHARE = 0.85;
/** A shore is sheltered when at least this many of sixteen 5 km rays from its sea cell meet land. */
const SHELTER_RAYS = 10;
const SHELTER_REACH_CELLS = Math.round(5 / CELL_KM);
/** Forest within this many cells of the landing, and its share. */
const START_FOREST_CELLS = 10;
const START_FOREST_SHARE = 0.4;
const START_MAX_RING = 60;

const RAY_DX = [1, 0.924, 0.707, 0.383, 0, -0.383, -0.707, -0.924, -1, -0.924, -0.707, -0.383, 0, 0.383, 0.707, 0.924];
const RAY_DY = [0, 0.383, 0.707, 0.924, 1, 0.924, 0.707, 0.383, 0, -0.383, -0.707, -0.924, -1, -0.924, -0.707, -0.383];

/** A land cell beside the sea whose sea neighbour sees land on most sides: a sound or a fjord, not the open coast. */
export function isShelteredShore(world: World, cell: number): boolean {
  const c = cellAt(world, cell);
  if (!passable(c.terrain)) return false;
  const seaCell = neighbours(world, cell).find((n) => waterKindOf(world, n) === "sea");
  if (seaCell === undefined) return false;
  const sx = seaCell % world.w;
  const sy = Math.floor(seaCell / world.w);
  let hits = 0;
  for (let r = 0; r < 16; r++) {
    for (let d = 1; d <= SHELTER_REACH_CELLS; d++) {
      const x = Math.round(sx + RAY_DX[r] * d);
      const y = Math.round(sy + RAY_DY[r] * d);
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) { hits++; break; }
      if (waterKindOf(world, y * world.w + x) !== "sea") { hits++; break; }
    }
  }
  return hits >= SHELTER_RAYS;
}

/** Share of forest among the cells within a square radius of the cell. */
export function forestShareWithin(world: World, cell: number, radius: number): number {
  const cx = cell % world.w;
  const cy = Math.floor(cell / world.w);
  let forest = 0;
  let n = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      n++;
      const t = terrainOf(world, x, y);
      if (t === "spruce" || t === "pine" || t === "birch") forest++;
    }
  }
  return n ? forest / n : 0;
}

const STARTS = new Map<number, { id: number; cell: number; ring: number }>();

/** The best landing in one lattice square: the sheltered shore with the most forest around it, or -1. */
function landingIn(world: World, lx: number, ly: number): number {
  const x0 = lx * LATTICE;
  const y0 = ly * LATTICE;
  let best = -1;
  let bestForest = 0;
  for (let y = y0; y < Math.min(world.h, y0 + LATTICE); y++) {
    if (y < world.h * START_SOUTH_SHARE) continue;
    for (let x = x0; x < Math.min(world.w, x0 + LATTICE); x++) {
      const cell = y * world.w + x;
      if (!isShelteredShore(world, cell)) continue;
      const forest = forestShareWithin(world, cell, START_FOREST_CELLS);
      if (forest < START_FOREST_SHARE || forest <= bestForest) continue;
      // The forest must exist in the region and be walkable from the shore.
      const r = regionAt(world, regionOf(world, x, y));
      const target = r.spots.find((s) => s.id === "forest");
      if (!target || findRoute(world, cell, target.cell) === null) continue;
      best = cell;
      bestForest = forest;
    }
  }
  return best;
}

/**
 * The first survivor comes by boat in April, so the landing is a
 * sheltered sea shore in the southern rows with forest around it, found
 * by spiralling out from the coast line 55 km north of the south edge.
 * Nothing about stone or a lake: some starts have none in a day's walk,
 * and the run is about finding it.
 */
function findStart(world: World): { id: number; cell: number; ring: number } {
  const cached = STARTS.get(world.seed);
  if (cached) return cached;
  const v = 0.92;
  const ax = Math.floor((coastLineU(v) * world.w) / LATTICE);
  const ay = Math.floor((v * world.h) / LATTICE);
  for (let ring = 0; ring < START_MAX_RING; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const lx = ax + dx;
        const ly = ay + dy;
        if (lx < 0 || ly < 0 || lx >= LATTICE_W || ly >= LATTICE_H) continue;
        const cell = landingIn(world, lx, ly);
        if (cell < 0) continue;
        const found = { id: regionOf(world, cell % world.w, Math.floor(cell / world.w)), cell, ring };
        STARTS.set(world.seed, found);
        return found;
      }
    }
  }
  const id = ay * LATTICE_W + ax;
  const fallback = { id, cell: regionAt(world, id).campCell, ring: START_MAX_RING };
  STARTS.set(world.seed, fallback);
  return fallback;
}

export function spotOf(region: RegionDef, spot: SpotId): Spot | undefined {
  return region.spots.find((s) => s.id === spot);
}

export function hasSpot(region: RegionDef, spot: SpotId): boolean {
  return region.spots.some((s) => s.id === spot);
}

/** The species with any capacity in a region, in catalogue order. */
export function speciesHere(r: RegionDef): Species[] {
  return SPECIES_IDS.filter((s) => (r.capacity[s] ?? 0) > 0);
}
