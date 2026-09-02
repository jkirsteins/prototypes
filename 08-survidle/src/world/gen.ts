import { Rng, derive } from "../rng";
import { CELL_KM, PATH_FACTOR } from "../units";
import { SPECIES, type Species, type SpotId, type Terrain } from "../sim/types";
import { regionName } from "./names";
import { fbm } from "./noise";
import { findRoute, passable, routeKm } from "./route";

export const MAP_W = 72;
export const MAP_H = 36;
const SEA_ROWS = 3;

export interface Cell { x: number; y: number; e: number; m: number; terrain: Terrain; region: number }

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

export interface World {
  seed: number;
  w: number;
  h: number;
  cells: Cell[];
  regions: RegionDef[];
  start: number;
}

export const TERRAINS: Terrain[] = ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow"];

function terrainOf(e: number, m: number, y: number): Terrain {
  if (y < SEA_ROWS || e < 0.31) return "water";
  if (e > 0.84) return "fell";
  if (e > 0.76) return "rock";
  if (m > 0.62 && e < 0.5) return "bog";
  if (m > 0.52) return "spruce";
  if (m > 0.4) return "pine";
  if (e < 0.5) return "birch";
  return "meadow";
}

export function generateWorld(seed: number): World {
  const rng = new Rng(derive(seed, 1));
  const cells: Cell[] = [];
  const eSeed = derive(seed, 2);
  const mSeed = derive(seed, 3);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let e = fbm(x / 11, y / 9, eSeed);
      // The sea lies to the north: pull the top rows down into water.
      e -= 0.35 * Math.max(0, (7 - y) / 7);
      // Contrast, so lakes and fells both happen.
      e = 0.52 + (e - 0.5) * 1.4;
      const m = fbm(x / 10 + 37, y / 9 + 11, mSeed);
      cells.push({ x, y, e, m, terrain: terrainOf(e, m, y), region: -1 });
    }
  }

  // Region seeds on a jittered lattice, nudged off water.
  const cols = 6;
  const rows = 3;
  const seeds: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let x = Math.round(((c + 0.5) / cols) * MAP_W + (rng.next() - 0.5) * (MAP_W / cols) * 0.8);
      let y = Math.round(((r + 0.5) / rows) * MAP_H + (rng.next() - 0.5) * (MAP_H / rows) * 0.8);
      x = Math.min(MAP_W - 1, Math.max(0, x));
      y = Math.min(MAP_H - 1, Math.max(SEA_ROWS, y));
      const land = nearestLand(cells, x, y);
      seeds.push(land);
    }
  }

  for (const cell of cells) {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < seeds.length; i++) {
      const dx = cell.x - seeds[i].x;
      const dy = (cell.y - seeds[i].y) * 1.15;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cell.region = best;
  }

  const taken = new Set<string>();
  const regions: RegionDef[] = seeds.map((_, id) => {
    const mine = cells.filter((c) => c.region === id);
    const count: Record<Terrain, number> = { water: 0, fell: 0, rock: 0, bog: 0, spruce: 0, pine: 0, birch: 0, meadow: 0 };
    let sx = 0;
    let sy = 0;
    for (const c of mine) {
      count[c.terrain]++;
      sx += c.x;
      sy += c.y;
    }
    const n = Math.max(1, mine.length);
    const frac = { ...count } as Record<Terrain, number>;
    for (const t of TERRAINS) frac[t] = count[t] / n;
    const forest = frac.spruce + frac.pine + frac.birch;
    const rock = frac.rock + frac.fell;
    const area = mine.length * CELL_KM * CELL_KM;
    const landCells = mine.length - count.water;
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
    const campCell = nearestCell(mine, cx, cy, (c) => passable(c.terrain));
    return {
      id,
      name: "",
      cells: mine.map((c) => c.y * MAP_W + c.x),
      landCells,
      cx,
      cy,
      area,
      frac,
      forest,
      rock,
      wood0: Math.round(forest * mine.length * 60),
      capacity,
      neighbours: [],
      spots: [],
      campCell,
    };
  });

  for (const r of regions) {
    r.name = regionName(rng, { water: r.frac.water, rock: r.rock, bog: r.frac.bog, forest: r.forest }, taken);
  }

  // Spots need routes, and routes need the whole map, so they come last.
  const world: World = { seed, w: MAP_W, h: MAP_H, cells, regions, start: 0 };
  for (const r of regions) r.spots = placeSpots(world, r);

  // Neighbours share a 4-connected edge.
  const adj = regions.map(() => new Set<number>());
  for (const c of cells) {
    if (c.x + 1 < MAP_W) link(adj, c.region, cells[c.y * MAP_W + c.x + 1].region);
    if (c.y + 1 < MAP_H) link(adj, c.region, cells[(c.y + 1) * MAP_W + c.x].region);
  }
  for (const r of regions) {
    r.neighbours = [...adj[r.id]]
      .sort((a, b) => a - b)
      .map((id) => {
        const o = regions[id];
        const km = Math.hypot(r.cx - o.cx, r.cy - o.cy) * CELL_KM * PATH_FACTOR;
        return { id, km: Math.round(km * 10) / 10 };
      });
  }

  // Start in the most central forested region.
  let start = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (const r of regions) {
    if (r.forest < 0.4 || r.landCells < 20) continue;
    const d = Math.hypot(r.cx - MAP_W / 2, r.cy - MAP_H / 2);
    if (d < bestD) {
      bestD = d;
      start = r.id;
    }
  }
  if (bestD === Number.POSITIVE_INFINITY) {
    start = regions.reduce((a, b) => (b.forest > a.forest ? b : a)).id;
  }

  world.start = start;
  return world;
}

type Pick = (c: Cell) => boolean;
const IS_FOREST: Pick = (c) => c.terrain === "spruce" || c.terrain === "pine" || c.terrain === "birch";
const IS_ROCK: Pick = (c) => c.terrain === "rock" || c.terrain === "fell";
const IS_HEATH: Pick = (c) => c.terrain === "bog" || c.terrain === "meadow";
/** Fishing happens from land beside water. */
const isShore = (world: World) => (c: Cell) =>
  passable(c.terrain) && neighbours(world, c.y * world.w + c.x).some((n) => world.cells[n].terrain === "water");

/**
 * Camp sits at the centroid. Each other spot is the matching cell in the
 * region whose walk from camp is nearest a target length that grows as the
 * terrain gets rarer: the forest is close in a forest region, the outcrop
 * far when rock is scarce.
 */
function placeSpots(world: World, r: RegionDef): Spot[] {
  const spots: Spot[] = [{ id: "camp", km: 0, cell: r.campCell }];
  const wants: { id: SpotId; pick: Pick; km: number; share: number }[] = [
    { id: "forest", pick: IS_FOREST, km: 0.3 + 0.9 * (1 - r.forest), share: r.forest },
    { id: "outcrop", pick: IS_ROCK, km: 0.4 + 1.2 * (1 - r.rock), share: r.rock },
    { id: "shore", pick: isShore(world), km: 0.3 + 1.0 * (1 - r.frac.water), share: r.frac.water },
    { id: "heath", pick: IS_HEATH, km: 0.3 + 1.0 * (1 - r.frac.bog - r.frac.meadow), share: r.frac.bog + r.frac.meadow },
  ];
  for (const want of wants) {
    if (want.share <= 0.02) continue;
    let best: { cell: number; km: number } | null = null;
    for (const idx of r.cells) {
      const c = world.cells[idx];
      if (!want.pick(c) || idx === r.campCell) continue;
      // Straight-line first to keep the candidate set small, then the real route.
      const straight = Math.hypot(c.x - world.cells[r.campCell].x, c.y - world.cells[r.campCell].y) * CELL_KM;
      if (Math.abs(straight - want.km) > 0.6 && best) continue;
      const route = findRoute(world, r.campCell, idx);
      if (!route) continue;
      const km = routeKm(route);
      if (!best || Math.abs(km - want.km) < Math.abs(best.km - want.km)) best = { cell: idx, km };
    }
    if (best) spots.push({ id: want.id, km: round1(best.km), cell: best.cell });
  }
  return spots;
}

export function neighbours(world: World, idx: number): number[] {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  const out: number[] = [];
  if (x > 0) out.push(idx - 1);
  if (x < world.w - 1) out.push(idx + 1);
  if (y > 0) out.push(idx - world.w);
  if (y < world.h - 1) out.push(idx + world.w);
  return out;
}

function nearestCell(mine: Cell[], cx: number, cy: number, ok: Pick): number {
  let best = mine[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of mine) {
    if (!ok(c)) continue;
    const d = (c.x - cx) ** 2 + (c.y - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.y * MAP_W + best.x;
}

function link(adj: Set<number>[], a: number, b: number) {
  if (a === b) return;
  adj[a].add(b);
  adj[b].add(a);
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

function nearestLand(cells: Cell[], x: number, y: number): { x: number; y: number } {
  if (cells[y * MAP_W + x].terrain !== "water") return { x, y };
  for (let r = 1; r < MAP_W; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (cells[ny * MAP_W + nx].terrain !== "water") return { x: nx, y: ny };
      }
    }
  }
  return { x, y };
}

export function spotOf(region: RegionDef, spot: SpotId): Spot | undefined {
  return region.spots.find((s) => s.id === spot);
}

export function hasSpot(region: RegionDef, spot: SpotId): boolean {
  return region.spots.some((s) => s.id === spot);
}
