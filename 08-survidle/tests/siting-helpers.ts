import { newGame } from "../src/sim/newgame";
import { cellOf, placeAtPatch, watersideCell } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import type { GameState, Terrain } from "../src/sim/types";
import { FINE_CHUNK } from "../src/world/cells";
import { cellAt, neighbours, regionAt, type RegionDef, type World } from "../src/world/gen";
import { findRoute, passable } from "../src/world/route";
import { fineNeighbours, patchId, patchXY } from "../src/world/spatial";
import { TERRAIN_INDEX } from "../src/world/terrain";

/**
 * Writes one 50 m patch of an already-generated world. Terrain a seed happens
 * to place is no basis for a fixture at this scale, so a test that needs a
 * particular piece of ground under a particular patch states it outright.
 * The patch's chunk must already exist, which reading any of its cells does.
 */
export function paintPatch(world: World, cell: number, terrain: Terrain, region?: number): number {
  const { x, y } = cellAt(world, cell);
  const chunksW = Math.ceil(world.w / FINE_CHUNK);
  const chunk = world.fineChunks.get(Math.floor(y / FINE_CHUNK) * chunksW + Math.floor(x / FINE_CHUNK));
  if (!chunk) throw new Error(`patch ${cell} has no generated chunk`);
  const i = (y % FINE_CHUNK) * FINE_CHUNK + (x % FINE_CHUNK);
  chunk.terrain[i] = TERRAIN_INDEX[terrain];
  if (region !== undefined) chunk.region[i] = region;
  return cell;
}

/**
 * A cell next to `from`, passable land, in the same region as `from` - so a test can move the
 * player or the camp off a starting cell without landing in water or a neighbouring region.
 * Shared by the siting tests (Task 1's camp reads, Task 2's make-camp task).
 */
export function neighbourLandCell(world: World, from: number): number {
  const region = cellAt(world, from).region;
  const n = neighbours(world, from).find((c) => cellAt(world, c).region === region && passable(cellAt(world, c).terrain));
  if (n === undefined) throw new Error(`cell ${from} has no passable neighbour in its own region`);
  return n;
}

/**
 * The camp a test needs before it can address one, sited the way a survivor
 * would have: on the region's own generated cell, which the world offers as
 * the likeliest ground for one. A fresh region has no camp, so any test whose
 * subject is camp work makes one first; a test whose subject is the absence of
 * a camp must not call this.
 */
export function siteCamp(state: GameState, world: World, region = state.player.region): number {
  const cell = requireCamp(regionAt(world, region));
  regionState(state, world, region).campCell = cell;
  return cell;
}

/** Fixtures that need land must fail clearly if their chosen region is all water. */
export function requireCamp(region: RegionDef): number {
  if (region.campCell === null) throw new Error(`region ${region.id} has no passable camp`);
  return region.campCell;
}

/** The three terrains that stand timber: what "in the forest" means to the stock rules. */
const TIMBER: Terrain[] = ["spruce", "pine", "birch"];

/**
 * A run whose survivor stands in timber: the nearest forest patch of the
 * starting region that a route actually reaches, walked to rather than
 * painted, so the ground under the test is ground the world generated.
 * Which of the three conifers or birches it is belongs to the seed - a
 * landing region may hold birch and no spruce - and the stock rules a caller
 * tests read the patch's own potential either way.
 */
export function forestGame(seed: number): { state: GameState; world: World } {
  const { state, world } = newGame(seed);
  const from = cellOf(state, world);
  const origin = cellAt(world, from);
  const forest = regionAt(world, state.player.region).cells
    .filter((cell) => TIMBER.includes(cellAt(world, cell).terrain))
    .map((cell) => {
      const c = cellAt(world, cell);
      return { cell, distance: (c.x - origin.x) ** 2 + (c.y - origin.y) ** 2 };
    })
    .sort((a, b) => a.distance - b.distance || a.cell - b.cell);
  for (const { cell } of forest.slice(0, 24)) {
    if (cell === from || findRoute(world, from, cell)) {
      placeAtPatch(state, world, cell);
      return { state, world };
    }
  }
  throw new Error(`seed ${seed} starts nowhere near reachable forest`);
}

/** The first passable neighbour of a patch: the ground one step off, 50 m away. */
export function passableNeighbor(world: World, patch: number): number {
  const n = fineNeighbours(world, patch).find((f) => passable(cellAt(world, f.patch).terrain));
  if (!n) throw new Error(`patch ${patch} has no passable neighbour`);
  return n.patch;
}

/**
 * Two patches 50 m apart with no water beside either: the ground on which a
 * dug seep is the only water there is. Open water beside a patch answers any
 * question about water with "as much as you like", and a shore camp's own
 * neighbours are waterside too, so a case about what one patch holds has to be
 * asked where the ground is dry. Found by ringing out from `from` rather than
 * named, because which ground is dry belongs to the seed.
 */
export function dryPair(world: World, from: number): { here: number; there: number } {
  const dry = (patch: number) => passable(cellAt(world, patch).terrain) && !watersideCell(world, patch);
  const origin = patchXY(from);
  for (let ring = 0; ring <= 60; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      const edge = Math.abs(dy) === ring;
      for (let dx = -ring; dx <= ring; dx += edge || ring === 0 ? 1 : 2 * ring) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const here = patchId(x, y);
        if (!dry(here)) continue;
        const there = fineNeighbours(world, here).find((f) => dry(f.patch));
        if (there) return { here, there: there.patch };
      }
    }
  }
  throw new Error(`no dry pair of patches within reach of ${from}`);
}
