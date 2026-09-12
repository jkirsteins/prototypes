/**
 * One 96 by 96 fine chunk over a hand-made solved world, resident before a case
 * runs and painted by hand. What a patch is - its ground, its height, its water
 * and its channel - is the chunk's, so a case about a consumer of the refined
 * chunk never depends on where the generator put a river or a hill.
 */
import type { Terrain } from "../src/sim/types";
import { FINE_CHUNK, type World } from "../src/world/cells";
import { refineChunk } from "../src/world/refine";
import { KIND } from "../src/world/solve";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { flatWorld } from "./world-fixture";

export interface FineFixture {
  world: World;
  /** The chunk's own arrays, painted by the case. */
  terrain: Uint8Array;
  height: Float32Array;
  kind: Uint8Array;
  channel: Uint8Array;
  /** The chunk-local index of a patch, which is its patch id inside the first chunk. */
  at: (x: number, y: number) => number;
}

export function fineFixture(opts: { terrain: Terrain; seed?: number; heightM?: number } = { terrain: "pine" }): FineFixture {
  const seed = opts.seed ?? 21;
  const heightM = opts.heightM ?? 50;
  // flatWorld's own world, so the fixture keeps its start region: a case that
  // opens a run on this ground needs somewhere for the run to begin.
  const world = flatWorld({ w: 16, h: 16, terrain: opts.terrain, heightM, seed });
  const fine = refineChunk(seed, world.solved, 0, 0);
  fine.height.fill(heightM);
  fine.surface.fill(heightM);
  fine.kind.fill(KIND.land);
  fine.channel.fill(0);
  const terrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK).fill(TERRAIN_INDEX[opts.terrain]);
  fine.terrain = terrain;
  world.fineChunks.set(0, {
    cx: 0, cy: 0, fine, terrain, region: new Int32Array(FINE_CHUNK * FINE_CHUNK),
    samples: terrain.length, parentSummaries: new Map(),
  });
  return { world, terrain, height: fine.height, kind: fine.kind, channel: fine.channel, at: (x, y) => y * FINE_CHUNK + x };
}
