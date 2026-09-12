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
import { cellAt, fordAt, hasSpot, heightAt, neighbours, regionAt, regionOf, solvedTerrainAt, streamAt, terrainOf, waterKindOf, type World } from "../src/world/gen";
import { FINE_PER_PARENT } from "../src/world/spatial";
import { CANOPY_HEIGHT_M } from "../src/world/terrain";
import { UPWIND_STEP } from "../src/sim/shelter";
import { passable } from "../src/world/route";
import type { SpotId, Terrain } from "../src/sim/types";

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
 * A cell of one terrain near `home` with ground or wood upwind high enough to
 * block the wind, or, with `blocked` false, one with nothing upwind at all.
 * The shelter rule calls the first lee, so which cells are sheltered under a
 * given wind is a fact tests about lee have to find rather than name. The
 * search is geometry only and ignores which terrains the rule refuses lee to,
 * so a rock or a fell standing behind a ridge can be found and asked about.
 */
export function leeCellNear(world: World, home: number, terrain: Terrain, windBearingDeg: number, blocked = true): number {
  // Five steps upwind, the reach the shelter rule uses, each measured at the
  // true distance it stands at rather than at a flat 300 m. A step is a 300 m
  // cell, which is FINE_PER_PARENT patches, and the ground upwind is the
  // solved ground the heights belong to.
  const eighth = ((Math.round(windBearingDeg / 45) % 8) + 8) % 8;
  const [dx, dy] = UPWIND_STEP[eighth];
  for (const id of regionsOutward(world, home, 400)) {
    for (const cell of regionAt(world, id).cells) {
      const x = xOf(world, cell);
      const y = yOf(world, cell);
      if (terrainOf(world, x, y) !== terrain) continue;
      const h = heightAt(world, x, y);
      let over = 0;
      let samples = 0;
      for (let d = 1; d <= 5; d++) {
        const sx = x + dx * d * FINE_PER_PARENT;
        const sy = y + dy * d * FINE_PER_PARENT;
        if (sx < 0 || sy < 0 || sx >= world.w || sy >= world.h) break;
        samples++;
        const top = heightAt(world, sx, sy) + (CANOPY_HEIGHT_M[solvedTerrainAt(world, sx, sy)] ?? 0) - h;
        over = Math.max(over, top / (d * 300 * Math.hypot(dx, dy)));
      }
      if (samples < 5) continue;
      // Half shelter is a ratio of 0.05; clear of it either way, never on the line.
      if (blocked ? over > 0.06 : over < 0.04) return cell;
    }
  }
  // Fell is the ground above the treeline, so it sits on the tops and has
  // nothing upwind of it for several hundred regions around a southern
  // landing. The rule is still the rule, so the search widens to the whole
  // world rather than the case going untested.
  return leeCellAnywhere(world, terrain, dx, dy, blocked);
}

function leeCellAnywhere(world: World, terrain: Terrain, dx: number, dy: number, blocked: boolean): number {
  // A cell at a time over the whole world: the fine ground of 144 million
  // patches would be generated to answer this, and what the search wants is
  // the solved ground the heights come from.
  const reach = 5 * FINE_PER_PARENT;
  for (let y = reach; y < world.h - reach; y += FINE_PER_PARENT) {
    for (let x = reach; x < world.w - reach; x += FINE_PER_PARENT) {
      if (solvedTerrainAt(world, x, y) !== terrain) continue;
      const h = heightAt(world, x, y);
      let over = 0;
      for (let d = 1; d <= 5; d++) {
        const sx = x + dx * d * FINE_PER_PARENT;
        const sy = y + dy * d * FINE_PER_PARENT;
        const top = heightAt(world, sx, sy) + (CANOPY_HEIGHT_M[solvedTerrainAt(world, sx, sy)] ?? 0) - h;
        over = Math.max(over, top / (d * 300 * Math.hypot(dx, dy)));
      }
      if (blocked ? over > 0.06 : over < 0.04) return y * world.w + x;
    }
  }
  throw new Error(`this world holds no ${terrain} that is ${blocked ? "" : "un"}blocked upwind`);
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

/**
 * A region near `home` that holds a lake of its own and, on the same region, a
 * land cell whose water is salt and only salt. Both halves matter to a case
 * about the water a survivor stands beside: the lake gives the region's lake
 * fish the habitat share they need to be counted at all - `wildlifeCapacity`
 * wants a habitat over 2 percent of the region - while the cell the survivor
 * stands on touches the sea and no lake, so what bites there is the sea's.
 * `accept` is the caller's own further test on the pairing, since what lives in
 * a region is species knowledge and not geometry.
 */
export function seaShoreBesideLake(
  world: World, home: number,
  accept: (region: number, cell: number) => boolean = () => true,
): { region: number; cell: number } {
  for (const id of lakeRegionsOutward(world, home)) {
    for (const cell of regionAt(world, id).cells) {
      if (!passable(cellAt(world, cell).terrain)) continue;
      if (!besideSea(world, cell)) continue;
      if (neighbours(world, cell).some((n) => waterKindOf(world, n) === "lake")) continue;
      if (accept(id, cell)) return { region: id, cell };
    }
  }
  throw new Error(`no region within reach of ${home} holds a lake and a salt-only shore cell`);
}

/**
 * The nearest region to `home` holding a lake, with a land cell on its lake
 * shore. `accept` is the caller's own further test on the region, for the cases
 * that want what lives in the lake as well as the water.
 */
export function lakeShoreNear(
  world: World, home: number,
  accept: (region: number) => boolean = () => true,
): { region: number; cell: number } {
  for (const id of lakeRegionsOutward(world, home)) {
    if (!accept(id)) continue;
    const cell = regionAt(world, id).cells.find((c) =>
      passable(cellAt(world, c).terrain) && neighbours(world, c).some((n) => waterKindOf(world, n) === "lake"));
    if (cell !== undefined) return { region: id, cell };
  }
  throw new Error(`no region within reach of ${home} holds a lake shore`);
}

/**
 * Regions holding lake water, nearest first, found by ringing over the grid for
 * the water rather than over regions. A lake is uncommon within reach of an
 * outer-coast landing, and building a region for every square of the search is
 * hundreds of floods to find that out; this builds only the regions a lake cell
 * actually lands in.
 */
function* lakeRegionsOutward(world: World, home: number): Generator<number> {
  const from = regionAt(world, home).campCell as number;
  const cx = xOf(world, from);
  const cy = yOf(world, from);
  const tried = new Set<number>();
  for (let r = 1; r < 1200; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) continue;
        if (waterKindOf(world, y * world.w + x) !== "lake") continue;
        const id = regionOf(world, x, y);
        if (tried.has(id)) continue;
        tried.add(id);
        yield id;
      }
    }
  }
}

/**
 * A region near `home` that borders water but was never given a shore spot, and
 * a forest cell in it away from the water to stand in. `placeSpots` names a
 * shore only where water is more than 2 percent of the region, so a region under
 * that floor still has water on its edge and nothing named to walk to: the case
 * where thirst has to find the water itself.
 */
export function unnamedShoreRegion(world: World, home: number): { region: number; dryForest: number } {
  const wet = (cell: number) => streamAt(world, cell) || neighbours(world, cell).some((n) => waterKindOf(world, n) !== null);
  for (const id of regionsOutward(world, home, 600)) {
    const region = regionAt(world, id);
    if (hasSpot(region, "shore")) continue;
    if (!region.cells.some((c) => passable(cellAt(world, c).terrain) && wet(c))) continue;
    const dryForest = region.cells.find((c) => FOREST.includes(cellAt(world, c).terrain) && !wet(c));
    if (dryForest !== undefined) return { region: id, dryForest };
  }
  throw new Error(`no region within reach of ${home} borders water with no shore spot named`);
}

const FOREST: Terrain[] = ["spruce", "pine", "birch"];

/**
 * A region near `home` whose own camp cell is open ground with forest a short
 * walk off, and that cell. A felling order given at a camp already standing in
 * forest is worked where the survivor stands, so every reading of the walk out,
 * the tree set aside and the walk home has nothing to read; the case wants a
 * camp you leave to fell. `withinCells` is how far the forest may be, in cells
 * of `CELL_KM`, and `fromCells` how near it may be, for a case that needs the
 * round trip to cost something; the nearest region answering is returned.
 */
export function openCampWithForestNear(world: World, home: number, withinCells = 2, fromCells = 1): { region: number; camp: number; forestCells: number } {
  const terrainAt = (cell: number) => terrainOf(world, xOf(world, cell), yOf(world, cell));
  const forestRing = (cell: number): number => {
    for (let r = 1; r <= withinCells; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = xOf(world, cell) + dx;
          const y = yOf(world, cell) + dy;
          if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
          if (FOREST.includes(terrainOf(world, x, y))) return r;
        }
      }
    }
    return -1;
  };
  for (const id of regionsOutward(world, home, 600)) {
    const camp = regionAt(world, id).campCell;
    const terrain = terrainAt(camp);
    if (!passable(terrain) || FOREST.includes(terrain)) continue;
    const forestCells = forestRing(camp);
    // The nearest forest is what the work walks to, so a camp with forest
    // nearer than asked for is not the ground the caller wants.
    if (forestCells >= fromCells) return { region: id, camp, forestCells };
  }
  throw new Error(`no region within reach of ${home} has an open camp with forest within ${withinCells} cells`);
}

/**
 * The nearest region to `home` that was given every one of these named spots.
 * `placeSpots` names a spot only where the region holds enough of its ground,
 * so a case that needs two spots to play against each other - work sent to one
 * that does not suit it, a hunt choosing between them - must find a region that
 * has both rather than assume the landing does.
 */
export function regionWithSpots(world: World, home: number, spots: SpotId[]): number {
  return regionNear(world, home, (id) => spots.every((spot) => hasSpot(regionAt(world, id), spot)));
}

/**
 * The kind of forest nearest `home`, as the terrain name. Which conifer or
 * broadleaf grows within reach of a landing is the map's business, so a case
 * about naming a tree kind asks for the one that is actually there.
 */
export function forestKindNear(world: World, home: number): Terrain {
  for (const id of regionsOutward(world, home, 400)) {
    const cell = regionAt(world, id).cells.find((c) => FOREST.includes(cellAt(world, c).terrain));
    if (cell !== undefined) return cellAt(world, cell).terrain;
  }
  throw new Error(`no region within reach of ${home} holds forest`);
}

/**
 * A forest cell near `home` with no water and no stream beside it. Work done
 * there is done out of arm's reach of a drink, which is what a case about
 * thirst taking the minute needs: a mouthful taken where the survivor stands
 * costs the work nothing and the body never has to ask for his feet.
 */
export function dryForestNear(world: World, home: number): { region: number; cell: number } {
  const wet = (cell: number) => streamAt(world, cell) || neighbours(world, cell).some((n) => streamAt(world, n) || waterKindOf(world, n) !== null);
  for (const id of regionsOutward(world, home, 400)) {
    const cell = regionAt(world, id).cells.find((c) => FOREST.includes(cellAt(world, c).terrain) && !wet(c));
    if (cell !== undefined) return { region: id, cell };
  }
  throw new Error(`no region within reach of ${home} holds forest away from water`);
}

/**
 * Two neighbouring forest cells in one region near `home`: somewhere to put a
 * camp under the canopy and a cell beside it to stand on. Which forest it is -
 * spruce, pine or birch - is the region's business; what a case about walking
 * home to cover needs is cover on both cells and one step between them.
 */
export function forestPairNear(world: World, home: number): { region: number; camp: number; beside: number } {
  for (const id of regionsOutward(world, home, 400)) {
    for (const cell of regionAt(world, id).cells) {
      if (!FOREST.includes(cellAt(world, cell).terrain)) continue;
      const beside = neighbours(world, cell).find((n) => regionOfCell(world, n) === id && FOREST.includes(cellAt(world, n).terrain));
      if (beside !== undefined) return { region: id, camp: cell, beside };
    }
  }
  throw new Error(`no region within reach of ${home} holds two forest cells side by side`);
}

/**
 * A region near `home` whose camp stands on the water and whose named forest
 * spot stands off it. Both halves are what a case about walking for water
 * needs: work sent to the forest happens away from any water, so thirst has
 * somewhere to walk to, and the camp is on the water, so freezing the shore
 * shuts the near supply and the fallback behind it can be read. `accept` is the
 * caller's own further rule on the region, for a case that needs other spots on
 * it too.
 */
export function shoreCampWithDryForest(world: World, home: number, accept: (region: number) => boolean = () => true): number {
  // A stream is drinking water like any other, so a forest spot on a brook is
  // not dry ground for this.
  const wet = (cell: number) => streamAt(world, cell) || neighbours(world, cell).some((n) => streamAt(world, n) || waterKindOf(world, n) !== null);
  return regionNear(world, home, (id) => {
    const region = regionAt(world, id);
    if (!wet(region.campCell) || !accept(id)) return false;
    const forest = region.spots.find((s) => s.id === "forest");
    return forest !== undefined && !wet(forest.cell);
  });
}

/**
 * A region near `home` whose own camp cell is forest standing on the water, and
 * that cell. The pairing is what a case about the last water fallback needs:
 * felling happens at camp, so no walk separates the work from the fire, and the
 * water under foot is the camp's own, so icing it over leaves nothing to walk to
 * and melting snow is all that is left.
 */
export function forestCampOnWater(world: World, home: number): number {
  const id = regionNear(world, home, (r) => {
    const camp = regionAt(world, r).campCell;
    return FOREST.includes(cellAt(world, camp).terrain) && neighbours(world, camp).some((n) => waterKindOf(world, n) !== null);
  });
  return regionAt(world, id).campCell;
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
