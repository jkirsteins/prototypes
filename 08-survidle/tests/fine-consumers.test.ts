/**
 * The consumers that read the refined chunk rather than the parent: what each
 * one reads now, one case per reader. The fixture is a single chunk over a
 * hand-made solved world, painted by hand, so no case depends on where the
 * generator put a river or a hill.
 */
import { describe, expect, it } from "vitest";
import { FINE_CHUNK, fineHeightAt, fineWaterAt, newWorld, waterBesideAt, type World } from "../src/world/cells";
import { findRoute } from "../src/world/route";
import { CHANNEL_RIVER, CHANNEL_STREAM, refineChunk } from "../src/world/refine";
import { FINE_PER_PARENT, patchId, patchXY } from "../src/world/spatial";
import { FLAG_FORD, KIND } from "../src/world/solve";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { flatWorld } from "./world-fixture";

interface Fixture {
  world: World;
  /** The chunk's own arrays, painted by the case. */
  terrain: Uint8Array;
  height: Float32Array;
  kind: Uint8Array;
  channel: Uint8Array;
}

/** One 96 by 96 chunk over 16 by 16 flat parents, resident before any case runs. */
function fixture(seed = 21): Fixture {
  const world = newWorld(seed, flatWorld({ w: 16, h: 16, terrain: "pine", seed }).solved);
  const fine = refineChunk(seed, world.solved, 0, 0);
  fine.height.fill(50);
  fine.kind.fill(KIND.land);
  fine.channel.fill(0);
  const terrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK).fill(TERRAIN_INDEX.pine);
  fine.terrain = terrain;
  world.fineChunks.set(0, {
    cx: 0, cy: 0, fine, terrain, region: new Int32Array(FINE_CHUNK * FINE_CHUNK), samples: terrain.length, parentSummaries: new Map(),
  });
  return { world, terrain, height: fine.height, kind: fine.kind, channel: fine.channel };
}

const at = (x: number, y: number) => y * FINE_CHUNK + x;

describe("route reads the fine height", () => {
  it("walks round a bank the parent height cannot see", () => {
    const { world, height } = fixture();
    const from = patchId(10, 10);
    const to = patchId(14, 10);
    const straight = findRoute(world, from, to)!;
    expect(straight.map((p) => patchXY(p).y).every((y) => y === 10)).toBe(true);
    // A bank of 40 m across the straight way, two patches deep: nothing in the
    // parent's solved height says it is there.
    for (let y = 6; y <= 10; y++) for (let x = 12; x <= 13; x++) height[at(x, y)] = 90;
    const round = findRoute(newWorldWithSameChunk(world), from, to)!;
    expect(Math.max(...round.map((p) => patchXY(p).y))).toBeGreaterThan(10);
  });
});

/** Routes are cached per world object, so a second reading of the same ground needs a second world. */
function newWorldWithSameChunk(world: World): World {
  const next = newWorld(world.seed, world.solved);
  for (const [key, chunk] of world.fineChunks) next.fineChunks.set(key, chunk);
  return next;
}

describe("routing across water", () => {
  /** A river down the middle of the chunk, one patch wide, with dry banks. */
  function river(f: Fixture): void {
    for (let y = 0; y < FINE_CHUNK; y++) {
      f.terrain[at(48, y)] = TERRAIN_INDEX.river;
      f.kind[at(48, y)] = KIND.river;
      f.channel[at(48, y)] = CHANNEL_RIVER;
    }
  }

  it("crosses a river only on a ford parent's channel, and the banks stay ordinary ground", () => {
    const f = fixture();
    river(f);
    const from = patchId(46, 32);
    const to = patchId(50, 32);
    expect(findRoute(f.world, from, to)).toBeNull();
    // The bank beside the channel is ground: walking along it costs nothing special.
    expect(findRoute(f.world, patchId(46, 20), patchId(46, 40))).not.toBeNull();
    // The ford is a parent flag: the parent holding patches x 48..53, y 30..35.
    f.world.solved.flags[5 * f.world.solved.w + 8] |= FLAG_FORD;
    const crossed = findRoute(newWorldWithSameChunk(f.world), from, to)!;
    expect(crossed).not.toBeNull();
    const crossing = crossed.map(patchXY).filter((p) => p.x === 48);
    expect(crossing.length).toBeGreaterThan(0);
    // Every crossing patch is inside the ford parent and nowhere else.
    for (const p of crossing) expect(Math.floor(p.y / FINE_PER_PARENT)).toBe(5);
  });

  it("counts a channel patch as water at the patch and its bank as water beside", () => {
    const f = fixture();
    river(f);
    expect(fineWaterAt(f.world, patchId(48, 10))).toBe("river");
    expect(fineWaterAt(f.world, patchId(47, 10))).toBeNull();
    expect(waterBesideAt(f.world, patchId(48, 10))).toBe(true);
    expect(waterBesideAt(f.world, patchId(47, 10))).toBe(true);
    expect(waterBesideAt(f.world, patchId(45, 10))).toBe(false);
    // A stream is drinking water at the patch, and never a place to fish.
    f.channel[at(20, 20)] = CHANNEL_STREAM;
    expect(fineWaterAt(f.world, patchId(20, 20))).toBe("stream");
    expect(waterBesideAt(f.world, patchId(20, 20), "stream")).toBe(true);
    expect(waterBesideAt(f.world, patchId(20, 20), "fishing")).toBe(false);
    expect(waterBesideAt(f.world, patchId(48, 20), "fishing")).toBe(true);
  });
});

describe("the fine height under the optics", () => {
  it("reads the patch, not its parent", () => {
    const f = fixture();
    f.height[at(3, 4)] = 123;
    expect(fineHeightAt(f.world, patchId(3, 4))).toBe(123);
    expect(fineHeightAt(f.world, patchId(4, 4))).toBe(50);
  });
});
