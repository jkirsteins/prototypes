import { Rng, derive } from "../rng";
import { CELL_KM, PATH_FACTOR } from "../units";
import { SPECIES, type Species, type SpotId, type Terrain } from "../sim/types";
import { regionName } from "./names";
import { fbm } from "./noise";

export const MAP_W = 72;
export const MAP_H = 36;
const SEA_ROWS = 3;

export interface Cell { x: number; y: number; e: number; m: number; terrain: Terrain; region: number }

export interface Spot { id: SpotId; km: number }

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
    const spots: Spot[] = [{ id: "camp", km: 0 }];
    if (forest > 0.02) spots.push({ id: "forest", km: round1(0.3 + 0.9 * (1 - forest)) });
    if (rock > 0.02) spots.push({ id: "outcrop", km: round1(0.4 + 1.2 * (1 - rock)) });
    if (frac.water > 0.02) spots.push({ id: "shore", km: round1(0.3 + 1.0 * (1 - frac.water)) });
    if (frac.bog + frac.meadow > 0.02) spots.push({ id: "heath", km: round1(0.3 + 1.0 * (1 - frac.bog - frac.meadow)) });
    return {
      id,
      name: "",
      cells: mine.map((c) => c.y * MAP_W + c.x),
      landCells,
      cx: sx / n,
      cy: sy / n,
      area,
      frac,
      forest,
      rock,
      wood0: Math.round(forest * mine.length * 60),
      capacity,
      neighbours: [],
      spots,
    };
  });

  for (const r of regions) {
    r.name = regionName(rng, { water: r.frac.water, rock: r.rock, bog: r.frac.bog, forest: r.forest }, taken);
  }

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

  return { seed, w: MAP_W, h: MAP_H, cells, regions, start };
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

export function spotKm(region: RegionDef, spot: SpotId): number {
  return region.spots.find((s) => s.id === spot)?.km ?? 0;
}

export function hasSpot(region: RegionDef, spot: SpotId): boolean {
  return region.spots.some((s) => s.id === spot);
}
