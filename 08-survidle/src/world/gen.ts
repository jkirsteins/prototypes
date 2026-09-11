/**
 * Regions, computed the first time one is asked for. A region is the set of
 * cells nearest one lattice seed; its stats, name, camp and spots come from
 * scanning its own cells, never the whole world.
 */
import { Rng, derive } from "../rng";
import { SPECIES_IDS } from "../sim/species";
import type { Habitat, Species, SpotId, Terrain } from "../sim/types";
import { parentSummary, type ResourcePotential, resourcePotentialAt } from "./aggregate";
import { type Cell, cellAt, cellIdx, neighbours, newWorld, regionPeek, terrainOf, type World } from "./cells";
import { FINE_PER_PARENT, PATCH_KM, type PatchId } from "./spatial";
import { regionName } from "./names";
import { findRoute, passable, routeKm } from "./route";
import { fieldsAt, LATTICE, LATTICE_H, LATTICE_W, regionOfCell, TERRAINS, terrainAt, WORLD_H, WORLD_W } from "./terrain";
import { wildlifeCapacity } from "./wildlife";

export { cellAt, cellIdx, neighbours, regionOf, regionPeek, terrainOf, terrainPeek, waterKindOf, type Cell, type World } from "./cells";
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
  /**
   * Trees worth felling on uncut ground: every patch's own stand added up.
   * What a region still holds is this less what its worked patches have given
   * up (stocks.ts woodLeft); no task ever reads either, only its own patch.
   */
  wood0: number;
  /** Shares of the region's cells that are lake water and sea water; together they are frac.water. */
  lake: number;
  sea: number;
  /** Animals the region can hold, by species; a species not here never lives here. */
  capacity: Partial<Record<Species, number>>;
  neighbours: { id: number; km: number }[];
  spots: Spot[];
  /** A passable shore or centroid patch; no camp exists in an all-water region. */
  campCell: PatchId | null;
}

/** A world is cheap to make; regions and chunks come as they are touched. */
export function generateWorld(seed: number): World {
  const world = newWorld(seed);
  const s = findStart(world);
  world.start = s.id;
  world.startRing = s.ring;
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

/** Fishing happens from land beside water. */
const isShore = (world: World) => (c: Cell) =>
  passable(c.terrain) && neighbours(world, c.y * world.w + c.x).some((n) => terrainOf(world, n % world.w, Math.floor(n / world.w)) === "water");

function buildRegion(world: World, id: number): RegionDef {
  const { lx, ly } = latticeOf(id);
  const x0 = Math.max(0, (lx - 1) * LATTICE);
  const y0 = Math.max(0, (ly - 1) * LATTICE);
  const x1 = Math.min(WORLD_W, (lx + 2) * LATTICE);
  const y1 = Math.min(WORLD_H, (ly + 2) * LATTICE);
  const cells: number[] = [];
  const count: Record<Terrain, number> = { water: 0, fell: 0, rock: 0, bog: 0, spruce: 0, pine: 0, birch: 0, meadow: 0 };
  let sx = 0;
  let sy = 0;
  let seaCells = 0;
  let lakeCells = 0;
  // Stocks are the patches' own, summed; nothing here divides a parent's total.
  const potential: ResourcePotential = { areaKm2: 0, trees: 0, treesPerYear: 0 };
  const addPotential = (p: ResourcePotential) => {
    potential.areaKm2 += p.areaKm2;
    potential.trees += p.trees;
    potential.treesPerYear += p.treesPerYear;
  };
  const nb = new Set<number>();
  for (let py = y0; py < y1; py += FINE_PER_PARENT) {
    for (let px = x0; px < x1; px += FINE_PER_PARENT) {
      // Membership is cheap and pure. An unrelated parent must not allocate
      // a terrain chunk just to discover that none of its patches belong here.
      let touches = false;
      for (let y = py; y < py + FINE_PER_PARENT && !touches; y++) {
        for (let x = px; x < px + FINE_PER_PARENT; x++) {
          if (regionPeek(world, x, y) === id) { touches = true; break; }
        }
      }
      if (!touches) continue;
      const summary = parentSummary(world, px / FINE_PER_PARENT, py / FINE_PER_PARENT);
      const members = summary.regionCounts.get(id) ?? 0;
      if (!members) continue;
      const whole = members === summary.samples;
      if (whole) {
        for (const terrain of TERRAINS) count[terrain] += summary.terrainCounts[terrain];
        addPotential(summary.resourcePotential);
      }
      for (let y = py; y < py + FINE_PER_PARENT; y++) for (let x = px; x < px + FINE_PER_PARENT; x++) {
        if (!whole && regionPeek(world, x, y) !== id) continue;
        const idx = cellIdx(world, x, y);
        cells.push(idx);
        const terrain = terrainOf(world, x, y);
        if (!whole) {
          count[terrain]++;
          addPotential(resourcePotentialAt(world, idx));
        }
        if (terrain === "water") {
          if (fieldsAt(world.seed, x, y).sea) seaCells++;
          else lakeCells++;
        }
        sx += x;
        sy += y;
        // Neighbouring regions share a 4-connected edge.
        if (x > 0) nb.add(regionPeek(world, x - 1, y));
        if (x < WORLD_W - 1) nb.add(regionPeek(world, x + 1, y));
        if (y > 0) nb.add(regionPeek(world, x, y - 1));
        if (y < WORLD_H - 1) nb.add(regionPeek(world, x, y + 1));
      }
    }
  }
  nb.delete(id);
  nb.delete(-1);
  const n = Math.max(1, cells.length);
  const frac = { ...count } as Record<Terrain, number>;
  for (const t of TERRAINS) frac[t] = count[t] / n;
  const forest = frac.spruce + frac.pine + frac.birch;
  const rock = frac.rock + frac.fell;
  cells.sort((a, b) => a - b);
  const area = cells.length * PATCH_KM * PATCH_KM;
  const landCells = cells.length - count.water;
  const lake = lakeCells / n;
  const sea = seaCells / n;
  const shares: Record<Habitat, number> = {
    fell: frac.fell, rock: frac.rock, bog: frac.bog, spruce: frac.spruce, pine: frac.pine, birch: frac.birch, meadow: frac.meadow, lake, sea,
  };
  const cx = sx / n;
  const cy = sy / n;
  const capacity = wildlifeCapacity(world.seed, area, shares, cx, cy);
  // Camp is the shore cell nearest the centroid: a survivor camps by the water,
  // and the centroid is only where the region's middle happens to be. A region
  // with no shore keeps the centroid camp.
  const campCell = nearestCell(world, cells, cx, cy, isShore(world))
    ?? nearestCell(world, cells, cx, cy, (c) => passable(c.terrain));
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
    lake,
    sea,
    forest,
    rock,
    wood0: Math.round(potential.trees),
    capacity,
    neighbours: [...nb]
      .sort((a, b) => a - b)
      .map((o) => {
        const { lx: ox, ly: oy } = latticeOf(o);
        // Straight seed-to-seed distance for the migration weights and the card; travel uses routes.
        const km = Math.hypot((lx - ox) * LATTICE, (ly - oy) * LATTICE) * PATCH_KM * 1.25;
        return { id: o, km: Math.round(km * 10) / 10 };
      }),
    spots: [],
    campCell,
  };
  let spots: Spot[] | undefined;
  Object.defineProperty(r, "spots", { enumerable: true, get: () => spots ??= placeSpots(world, r) });
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
  if (r.campCell === null) return [];
  const spots: Spot[] = [{ id: "camp", km: 0, cell: r.campCell }];
  const camp = cellAt(world, r.campCell);
  if (!passable(camp.terrain)) return spots;
  const wants: { id: SpotId; pick: Pick; km: number; share: number }[] = [
    { id: "forest", pick: IS_FOREST, km: 0.3 + 0.9 * (1 - r.forest), share: r.forest },
    { id: "outcrop", pick: IS_ROCK, km: 0.4 + 1.2 * (1 - r.rock), share: r.rock },
    // The camp stands on the shore, so the shore spot is the next shore cell along: the
    // fishing place a minute away, never the camp's own cell.
    { id: "shore", pick: isShore(world), km: 0, share: r.frac.water },
    { id: "heath", pick: IS_HEATH, km: 0.3 + 1.0 * (1 - r.frac.bog - r.frac.meadow), share: r.frac.bog + r.frac.meadow },
  ];
  for (const want of wants) {
    if (want.share <= 0.02) continue;
    // Candidates by straight-line distance first, then the real route for the closest few.
    const candidates: { idx: number; off: number }[] = [];
    for (const idx of r.cells) {
      const c = cellAt(world, idx);
      if (!want.pick(c) || idx === r.campCell) continue;
      const straight = Math.hypot(c.x - camp.x, c.y - camp.y) * PATCH_KM;
      candidates.push({ idx, off: Math.abs(straight - want.km) });
    }
    candidates.sort((a, b) => a.off - b.off);
    let best: { cell: number; km: number } | null = null;
    for (const cand of candidates.slice(0, 6)) {
      const route = findRoute(world, r.campCell, cand.idx);
      if (!route) continue;
      const km = routeKm(route, r.campCell);
      if (!best || Math.abs(km - want.km) < Math.abs(best.km - want.km)) best = { cell: cand.idx, km };
    }
    if (best) spots.push({ id: want.id, km: best.km, cell: best.cell });
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
 * Screen the bounded 3x3 lattice box with pure samples before allocating
 * exact region terrain. Ignore samples owned by neighboring regions: their
 * shores and outcrops otherwise cause many expensive false-positive builds.
 * The forest floor leaves room for sampling error; exact shares and reachable
 * named spots remain the final start gate.
 */
function looksLikeStart(seed: number, lx: number, ly: number): boolean {
  const x0 = Math.max(0, (lx - 1) * LATTICE);
  const y0 = Math.max(0, (ly - 1) * LATTICE);
  const x1 = Math.min(WORLD_W - 1, (lx + 2) * LATTICE);
  const y1 = Math.min(WORLD_H - 1, (ly + 2) * LATTICE);
  let forest = 0;
  let water = 0;
  let rock = 0;
  let members = 0;
  const g = 15;
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      const x = Math.min(WORLD_W - 1, Math.max(0, Math.round(x0 + ((i + 0.5) / g) * (x1 - x0))));
      const y = Math.min(WORLD_H - 1, Math.max(0, Math.round(y0 + ((j + 0.5) / g) * (y1 - y0))));
      // Only the prospective region's own ground predicts its start quality.
      if (regionOfCell(seed, x, y) !== ly * LATTICE_W + lx) continue;
      members++;
      const t = terrainAt(seed, x, y);
      if (t === "spruce" || t === "pine" || t === "birch") forest++;
      else if (t === "water") water++;
      else if (t === "rock" || t === "fell") rock++;
    }
  }
  return members > 0 && forest / members >= 0.4 && water >= 1 && rock >= 1 && water / members < 0.15;
}

// The search is the dear part of a world and a seed always gives the same answer.
const STARTS = new Map<number, { id: number; ring: number }>();

/**
 * The search anchor sits a little east of map centre, in forest country:
 * rock and water for an outcrop and a shore are usually within a few
 * rings of it. The search spirals out from the anchor for the first
 * lattice cell whose region is mostly forest, with a shore for water and
 * an outcrop for stone within it.
 */
function findStart(world: World): { id: number; ring: number } {
  const cached = STARTS.get(world.seed);
  if (cached) return cached;
  const ax = Math.floor((0.55 * WORLD_W) / LATTICE);
  const ay = Math.floor((0.5 * WORLD_H) / LATTICE);
  for (let ring = 0; ring < 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const lx = ax + dx;
        const ly = ay + dy;
        if (lx < 0 || ly < 0 || lx >= LATTICE_W || ly >= LATTICE_H) continue;
        if (!looksLikeStart(world.seed, lx, ly)) continue;
        const id = ly * LATTICE_W + lx;
        const r = regionAt(world, id);
        if (r.campCell !== null && r.forest >= 0.45 && r.landCells * PATCH_KM ** 2 >= 10.8 && r.frac.water < 0.15 && r.spots.length >= 3
          && hasSpot(r, "shore") && hasSpot(r, "outcrop")) {
          const found = { id, ring };
          STARTS.set(world.seed, found);
          return found;
        }
      }
    }
  }
  // No lattice cell passed the exact filter: take the nearest region that at least
  // has a shore, since a start with no water is not a start. The anchor itself only
  // if even that fails.
  for (let ring = 0; ring < 40; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const lx = ax + dx;
        const ly = ay + dy;
        if (lx < 0 || ly < 0 || lx >= LATTICE_W || ly >= LATTICE_H) continue;
        const id = ly * LATTICE_W + lx;
        const r = regionAt(world, id);
        if (r.campCell !== null && r.landCells * PATCH_KM ** 2 >= 10.8 && hasSpot(r, "shore")) {
          const found = { id, ring: 39 };
          STARTS.set(world.seed, found);
          return found;
        }
      }
    }
  }
  const fallback = { id: ay * LATTICE_W + ax, ring: 40 };
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
