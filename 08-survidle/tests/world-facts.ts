/**
 * Facts about a generated world, found by the rule the test means rather than
 * written down as a cell number. A solved world is 4 million cells of real
 * terrain: the cell that happens to be a spruce stand or the far side of a
 * frozen lake moves whenever the generator does, and a test that names it by
 * number silently stops testing what it was written for. Each finder here
 * states its rule, searches for it, and throws with the rule's name when the
 * world holds nothing that answers - which is a finding about the world, not a
 * flaky test.
 *
 * Every finder is pure geometry over the solved arrays, so it costs a flood of
 * a region or two and never a route search.
 */
import { cellAt, fordAt, heightAt, neighbours, regionAt, regionOf, terrainOf, waterKindOf, type World } from "../src/world/gen";
import { passable } from "../src/world/route";
import type { Terrain } from "../src/sim/types";
import { TERRAIN_INDEX } from "../src/world/terrain";

const xOf = (world: World, cell: number) => cell % world.w;
const yOf = (world: World, cell: number) => Math.floor(cell / world.w);

/** Ground a walker crosses dry-shod: land, and a river at a ford. */
const dryShod = (world: World, cell: number) => passable(cellAt(world, cell).terrain, "none", fordAt(world, cell));

/** Region of a cell. */
export function regionOfCell(world: World, cell: number): number {
  return regionOf(world, xOf(world, cell), yOf(world, cell));
}

/** Steps from `from` to every cell reachable inside `within` while stepping only where `walkable` says. */
function flood(world: World, from: number, within: (cell: number) => boolean, walkable: (cell: number) => boolean): Map<number, number> {
  const seen = new Map<number, number>([[from, 0]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const steps = seen.get(queue[head]) as number;
    for (const n of neighbours(world, queue[head])) {
      if (seen.has(n) || !within(n) || !walkable(n)) continue;
      seen.set(n, steps + 1);
      queue.push(n);
    }
  }
  return seen;
}

export interface IceCrossing {
  /** The neighbouring region whose water the walk crosses. */
  region: number;
  /** Water out from the bank: walkable while it bears a walker, gone the moment it thaws. */
  target: number;
}

/**
 * Water in a neighbouring region, several steps from the start over the ice. A
 * lake or the sea, whichever the neighbour holds: a landing shore's own water is
 * the sea, and sea ice carries a walker on the same rule. The flood stays inside
 * the home and neighbouring regions, which is the ground the caller maps, so a
 * route to the target cannot go round outside them either; the cell it settles
 * on is the farthest water it reaches, so the walk is a crossing and not a step
 * off the bank.
 */
export function iceCrossing(world: World, home: number, from: number): IceCrossing {
  const water = (cell: number) => waterKindOf(world, cell) !== null;
  const steppable = (cell: number) => dryShod(world, cell) || waterKindOf(world, cell) !== null;
  for (const { id } of regionAt(world, home).neighbours) {
    if (id === home) continue;
    const inEither = (cell: number) => {
      const r = regionOfCell(world, cell);
      return r === home || r === id;
    };
    const reached = flood(world, from, inEither, steppable);
    let best = -1;
    let far = 1;
    for (const [cell, steps] of reached) {
      if (steps > far && water(cell) && regionOfCell(world, cell) === id) { best = cell; far = steps; }
    }
    if (best >= 0) return { region: id, target: best };
  }
  throw new Error(`no region beside ${home} holds water the start can reach over ice`);
}

/**
 * Ground in a neighbouring region that the ice is the way to: cut off dry-shod,
 * or far enough round that walking over the water is the shorter trip. Land
 * rather than water, for the cases that need somewhere to stand - a camp, a
 * named place - on the far side. The walk over the ice is slower per cell than
 * walking on ground, so the cell it settles on is the one whose way round is
 * longest against its way over.
 */
export function iceShortcut(world: World, home: number, from: number): IceCrossing {
  const land = (cell: number) => dryShod(world, cell);
  const water = (cell: number) => waterKindOf(world, cell) !== null;
  // Boxes rather than regions: a route may leave the two regions, and the wider
  // box covers the route search's own box around a candidate, so a dry way round
  // has room to show itself.
  const box = (radius: number) => (cell: number) =>
    Math.abs(xOf(world, cell) - xOf(world, from)) <= radius && Math.abs(yOf(world, cell) - yOf(world, from)) <= radius;
  // The way round may cross the home region's own water, since a caller that
  // wants a thin-ice offer puts safe ice at home and thin ice in the region
  // across; what must be long or missing is the way that avoids the far water.
  const homeWater = (cell: number) => water(cell) && regionOfCell(world, cell) === home;
  const dryFoot = flood(world, from, box(90), (cell) => land(cell) || homeWater(cell));
  const overIce = flood(world, from, box(45), (cell) => land(cell) || water(cell));
  const beside = new Set(regionAt(world, home).neighbours.map((n) => n.id));
  let best = -1;
  let bestGain = 2;
  for (const [cell, steps] of overIce) {
    if (!land(cell) || steps < 2) continue;
    const id = regionOfCell(world, cell);
    if (id === home || !beside.has(id)) continue;
    const gain = (dryFoot.get(cell) ?? Infinity) / steps;
    if (gain > bestGain) { best = cell; bestGain = gain; }
  }
  if (best < 0) throw new Error(`no region beside ${home} holds land the ice is the shorter way to`);
  return { region: regionOfCell(world, best), target: best };
}

/**
 * A neighbouring region the survivor can walk to without leaving the two
 * regions: a coast puts water and the far side of a fjord among a region's
 * neighbours, and mapping those two regions opens no way across them.
 */
export function walkableNeighbour(world: World, home: number): number {
  const land = (cell: number) => dryShod(world, cell);
  const from = regionAt(world, home).campCell;
  for (const { id } of regionAt(world, home).neighbours) {
    if (id === home) continue;
    const inEither = (cell: number) => {
      const r = regionOfCell(world, cell);
      return r === home || r === id;
    };
    if (flood(world, from, inEither, land).has(regionAt(world, id).campCell)) return id;
  }
  throw new Error(`no region beside ${home} is walkable from its camp without leaving the two`);
}

/**
 * A block of ground `w` by `h` cells near `cell`, as the offset function a test
 * can lay a corridor out on: `(0, 0)` is one corner and the block runs whichever
 * way from it the ground allows. `ok` says what the block is made of, walkable
 * ground by default. Which way the ground runs, and how far from the landing a
 * block of it lies, is the world's business and not the test's subject; the
 * search widens until it finds one so that a shore landing, where the sea takes
 * up half the neighbourhood, still has somewhere to lay the corridor.
 */
export function openBlock(
  world: World, cell: number, w: number, h: number,
  ok: (c: number) => boolean = (c) => passable(cellAt(world, c).terrain),
): (dx: number, dy: number) => number {
  const cx = xOf(world, cell);
  const cy = yOf(world, cell);
  const fits = (x0: number, y0: number, sx: number, sy: number) => {
    const at = (dx: number, dy: number) => (y0 + sy * dy) * world.w + (x0 + sx * dx);
    if (x0 + sx * (w - 1) < 0 || x0 + sx * (w - 1) >= world.w) return null;
    if (y0 + sy * (h - 1) < 0 || y0 + sy * (h - 1) >= world.h) return null;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (!ok(at(dx, dy))) return null;
    return at;
  };
  for (let r = 0; r <= 60; r += 3) {
    for (let oy = -r; oy <= r; oy += 3) {
      for (let ox = -r; ox <= r; ox += 3) {
        if (r > 0 && Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
        const x0 = cx + ox;
        const y0 = cy + oy;
        if (x0 < 0 || x0 >= world.w || y0 < 0 || y0 >= world.h) continue;
        for (const sx of [1, -1]) for (const sy of [1, -1]) {
          const at = fits(x0, y0, sx, sy);
          if (at) return at;
        }
      }
    }
  }
  throw new Error(`no ${w} by ${h} block near cell ${cell} is made of the ground asked for`);
}

/**
 * The nearest land cell to `from` with water of one kind beside it, searched in
 * widening rings over the grid rather than region by region: a coastal landing's
 * own neighbourhood can be two thirds sea and hold no lake at all, and building
 * a thousand regions to find that out is not the cheap way to ask.
 */
export function watersideNear(world: World, from: number, kind: "lake" | "sea" | "river", accept: (cell: number) => boolean = () => true): number {
  const cx = xOf(world, from);
  const cy = yOf(world, from);
  const beside = (cell: number) => neighbours(world, cell).some((n) => waterKindOf(world, n) === kind);
  for (let r = 1; r < 400; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) continue;
        const cell = y * world.w + x;
        if (dryShod(world, cell) && beside(cell) && accept(cell)) return cell;
      }
    }
  }
  throw new Error(`no land beside a ${kind} within 400 cells of ${from}`);
}

/**
 * A cell of one terrain in a region, or in the nearest region that has any.
 * Regions are about 4 km across, so a terrain a region lacks is ordinary and
 * the test means "somewhere the survivor can reach", not "here".
 */
export function terrainCellNear(world: World, home: number, terrain: Terrain): { region: number; cell: number } {
  for (const id of regionsOutward(world, home, 400)) {
    const cell = regionAt(world, id).cells.find((c) => terrainOf(world, xOf(world, c), yOf(world, c)) === terrain);
    if (cell !== undefined) return { region: id, cell };
  }
  throw new Error(`no region within reach of ${home} holds ${terrain}`);
}

/**
 * Regions from `home` outward, nearest first: `home`, then its neighbours, then
 * theirs. What a test wants of a region - spruce to stand under, water with a
 * canopy behind it - a region of 4 km may simply not hold, and the survivor's
 * neighbourhood is several regions wide.
 */
export function regionsOutward(world: World, home: number, limit = 120): number[] {
  const seen = new Set<number>([home]);
  const queue = [home];
  for (let head = 0; head < queue.length && queue.length < limit; head++) {
    for (const n of regionAt(world, queue[head]).neighbours) if (!seen.has(n.id)) { seen.add(n.id); queue.push(n.id); }
  }
  return queue;
}

/**
 * A cell of one terrain near `home` that is lower in metres than all four of
 * its cardinal neighbours, or, with `dip` false, one that is not. A dip is what
 * the shelter rules call lee ground, so which cells are dips and which are not
 * is a fact tests about lee have to find rather than name.
 */
export function dipCellNear(world: World, home: number, terrain: Terrain, dip = true): number {
  for (const id of regionsOutward(world, home, 400)) {
    for (const cell of regionAt(world, id).cells) {
      if (terrainOf(world, xOf(world, cell), yOf(world, cell)) !== terrain) continue;
      const around = neighbours(world, cell);
      if (around.length !== 4) continue;
      const h = heightAt(world, xOf(world, cell), yOf(world, cell));
      const lower = around.every((other) => heightAt(world, xOf(world, other), yOf(world, other)) > h);
      if (lower === dip) return cell;
    }
  }
  // A drainage solve fills interior pits so water can run to the sea, which
  // leaves a dip on land rare: about two in a thousand cells on seed 17, and
  // none in the several hundred regions around a southern landing. The rule is
  // still the rule, so the search widens to the whole world rather than the case
  // going untested.
  return dipCellAnywhere(world, terrain, dip);
}

const dipsByWorld = new WeakMap<World, Map<string, number>>();

/** The first cell of each terrain that is, and is not, a local dip: one pass over the solved arrays, remembered per world. */
function dipCellAnywhere(world: World, terrain: Terrain, dip: boolean): number {
  let found = dipsByWorld.get(world);
  if (!found) {
    found = new Map<string, number>();
    const { height, terrain: kinds } = world.solved;
    for (let y = 1; y < world.h - 1; y++) {
      for (let x = 1; x < world.w - 1; x++) {
        const i = y * world.w + x;
        const h = height[i];
        const isDip = height[i - 1] > h && height[i + 1] > h && height[i - world.w] > h && height[i + world.w] > h;
        const key = `${kinds[i]}:${isDip}`;
        if (!found.has(key)) found.set(key, i);
      }
    }
    dipsByWorld.set(world, found);
  }
  const cell = found.get(`${TERRAIN_INDEX[terrain]}:${dip}`);
  if (cell === undefined) throw new Error(`this world holds no ${terrain} that ${dip ? "is" : "is not"} a local dip`);
  return cell;
}

/**
 * Cells in a straight cardinal line whose terrains read as `pattern`, all inside
 * one region near `home`. One region, because a camp belongs to the region state
 * the walker is in; near `home`, because a shore region of 4 km need not hold
 * every terrain a case is about.
 */
export function terrainRunNear(world: World, home: number, pattern: Terrain[]): number[] {
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const id of regionsOutward(world, home, 400)) {
    for (const start of regionAt(world, id).cells) {
      const x = xOf(world, start);
      const y = yOf(world, start);
      for (const [dx, dy] of dirs) {
        const run: number[] = [];
        for (let i = 0; i < pattern.length; i++) {
          const nx = x + dx * i;
          const ny = y + dy * i;
          if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) break;
          if (terrainOf(world, nx, ny) !== pattern[i]) break;
          const cell = ny * world.w + nx;
          if (regionOfCell(world, cell) !== id) break;
          run.push(cell);
        }
        if (run.length === pattern.length) return run;
      }
    }
  }
  throw new Error(`no region near ${home} holds a straight ${pattern.join(", ")} run`);
}

/** The nearest region to `home`, itself included, that satisfies a rule. */
export function regionNear(world: World, home: number, wants: (id: number) => boolean): number {
  for (const id of regionsOutward(world, home, 600)) if (wants(id)) return id;
  throw new Error(`no region within reach of ${home} answers the rule`);
}

/** Whether a cell touches the sea: what "beside the sea" means for a landing shore. */
export function besideSea(world: World, cell: number): boolean {
  return neighbours(world, cell).some((n) => waterKindOf(world, n) === "sea");
}
