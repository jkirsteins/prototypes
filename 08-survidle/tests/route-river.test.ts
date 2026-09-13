/**
 * A river is a carved channel one 50 m patch wide, and a ford is a flag on the
 * 300 m parent it runs through. A route may cross it there and nowhere else.
 */
import { describe, expect, it } from "vitest";
import { FINE_CHUNK, newWorld, type World } from "../src/world/cells";
import { CHANNEL_RIVER } from "../src/world/refine";
import { findRoute } from "../src/world/route";
import { FINE_PER_PARENT, patchId, patchXY } from "../src/world/spatial";
import { FLAG_FORD, KIND } from "../src/world/solve";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { fineFixture } from "./fine-fixture";

/** Routes are cached per world object, so a second reading of the same ground needs a second world. */
function sameGroundAgain(world: World): World {
  const next = newWorld(world.seed, world.solved);
  for (const [key, chunk] of world.fineChunks) next.fineChunks.set(key, chunk);
  return next;
}

/** A river straight down patch column 48, with dry pine on both banks. */
function riverChunk() {
  const f = fineFixture({ terrain: "pine" });
  for (let y = 0; y < FINE_CHUNK; y++) {
    const i = y * FINE_CHUNK + 48;
    f.terrain[i] = TERRAIN_INDEX.river;
    f.kind[i] = KIND.river;
    f.channel[i] = CHANNEL_RIVER;
  }
  return f;
}

describe("rivers on a route", () => {
  it("refuses a river without a ford and crosses at the ford", () => {
    const f = riverChunk();
    const from = patchId(40, 32);
    const to = patchId(56, 32);
    expect(findRoute(f.world, from, to)).toBeNull();
    // The ford is the parent's flag: patches x 48..53, y 30..35 are its ground.
    f.world.solved.flags[5 * f.world.solved.w + 8] |= FLAG_FORD;
    const route = findRoute(sameGroundAgain(f.world), from, to);
    expect(route).not.toBeNull();
    const crossing = route!.map(patchXY).filter((p) => p.x === 48);
    expect(crossing.length).toBeGreaterThan(0);
    for (const p of crossing) expect(Math.floor(p.y / FINE_PER_PARENT)).toBe(5);
  });
});
