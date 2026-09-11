import type { Terrain } from "../src/sim/types";
import { newWorld, type World } from "../src/world/cells";
import { KIND, type SolvedWorld } from "../src/world/solve";
import { TERRAIN_INDEX } from "../src/world/terrain";

/** A hand-made world of one terrain at one height, for consumer tests that must not depend on the generator. */
export function flatWorld(opts: { w: number; h: number; terrain: Terrain; heightM?: number; seed?: number }): World {
  const n = opts.w * opts.h;
  const water = opts.terrain === "water";
  const solved: SolvedWorld = {
    w: opts.w, h: opts.h,
    height: new Int16Array(n).fill(opts.heightM ?? (water ? 0 : 50)),
    flowDir: new Uint8Array(n).fill(255),
    discharge: new Float32Array(n),
    kind: new Uint8Array(n).fill(water ? KIND.lake : KIND.land),
    flags: new Uint8Array(n),
    terrain: new Uint8Array(n).fill(TERRAIN_INDEX[opts.terrain]),
    moisture: new Uint8Array(n).fill(128),
  };
  const world = newWorld(opts.seed ?? 1, solved);
  world.start = 0;
  world.startCell = 0;
  world.startRing = 0;
  return world;
}

/** Paint cells of a fixture world with a terrain and, optionally, a height; water cells become lake, river cells river. */
export function paintWorld(world: World, cells: Iterable<number>, terrain: Terrain, heightM?: number): void {
  for (const c of cells) {
    world.solved.terrain[c] = TERRAIN_INDEX[terrain];
    world.solved.kind[c] = terrain === "water" ? KIND.lake : terrain === "river" ? KIND.river : KIND.land;
    if (heightM !== undefined) world.solved.height[c] = heightM;
  }
}
