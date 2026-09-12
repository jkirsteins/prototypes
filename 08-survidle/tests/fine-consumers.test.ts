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
import { fieldTransport } from "../src/sim/climate";
import { patchGroundModifiers } from "../src/sim/weather";
import { DIST8, DX8, DY8, NO_FLOW } from "../src/world/hydro";
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

describe("weather reads the ground the chunk measured", () => {
  it("strips snow off a windward face, keeps it on a lee one, and ponds rain on wet ground", () => {
    const f = fixture();
    const fine = f.world.fineChunks.get(0)!.fine;
    const wind = fieldTransport(f.world.seed);
    // Which way the ground must fall to face the wind, and which to hide from it.
    let windward = 0;
    let lee = 0;
    for (let d = 0; d < 8; d++) {
      const into = -(DX8[d] * wind.xKmh + DY8[d] * wind.yKmh) / DIST8[d];
      if (into > -(DX8[windward] * wind.xKmh + DY8[windward] * wind.yKmh) / DIST8[windward]) windward = d;
      if (into < -(DX8[lee] * wind.xKmh + DY8[lee] * wind.yKmh) / DIST8[lee]) lee = d;
    }
    const steep = 255;
    fine.slope[at(10, 10)] = steep;
    fine.aspect[at(10, 10)] = windward;
    fine.slope[at(20, 20)] = steep;
    fine.aspect[at(20, 20)] = lee;
    const bare = patchGroundModifiers(f.world, patchId(10, 10)).snow;
    const sheltered = patchGroundModifiers(f.world, patchId(20, 20)).snow;
    expect(bare).toBeLessThan(sheltered);
    // Flat ground with no aspect scours nothing, which is what the whole world
    // read while exposure was a placeholder.
    fine.slope[at(30, 30)] = 0;
    fine.aspect[at(30, 30)] = NO_FLOW;
    fine.wetness[at(30, 30)] = 128;
    // Pine holds a quarter of a snowfall off the ground and the wind takes nothing.
    expect(patchGroundModifiers(f.world, patchId(30, 30)).snow).toBeCloseTo(0.75, 5);

    fine.wetness[at(40, 40)] = 255;
    fine.wetness[at(50, 40)] = 0;
    expect(patchGroundModifiers(f.world, patchId(40, 40)).water).toBeGreaterThan(1);
    expect(patchGroundModifiers(f.world, patchId(50, 40)).water).toBeLessThan(1);
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
