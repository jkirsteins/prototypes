/**
 * Water beside is read at the patch. A river and a stream are one patch wide,
 * so the water is where the channel runs: standing on it is standing at it, the
 * patch beside it has water beside it, and the ground a hundred metres off is
 * dry ground with no water at all.
 */
import { describe, expect, it } from "vitest";
import { watersideCell } from "../src/sim/position";
import { seepGround } from "../src/sim/seep";
import { KIND } from "../src/world/solve";
import { CHANNEL_RIVER, CHANNEL_STREAM } from "../src/world/refine";
import { patchId } from "../src/world/spatial";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { fineFixture } from "./fine-fixture";

describe("water beside", () => {
  it("counts a stream on the patch, a river beside it and a lake beside it, and tells them apart", () => {
    const f = fineFixture({ terrain: "birch" });
    const here = patchId(20, 20);
    expect(watersideCell(f.world, here, "any")).toBe(false);
    f.channel[f.at(20, 20)] = CHANNEL_STREAM;
    expect(watersideCell(f.world, here, "any")).toBe(true);
    expect(watersideCell(f.world, here, "stream")).toBe(true);
    expect(watersideCell(f.world, here, "lake")).toBe(false);
    f.channel[f.at(21, 20)] = CHANNEL_RIVER;
    f.terrain[f.at(21, 20)] = TERRAIN_INDEX.river;
    expect(watersideCell(f.world, here, "river")).toBe(true);
    f.kind[f.at(19, 20)] = KIND.lake;
    f.terrain[f.at(19, 20)] = TERRAIN_INDEX.water;
    expect(watersideCell(f.world, here, "lake")).toBe(true);
    // The dry ground two patches off has none of it.
    expect(watersideCell(f.world, patchId(23, 20), "any")).toBe(false);
  });

  it("counts a river beside as fishing water and a stream on the patch as not", () => {
    const f = fineFixture({ terrain: "birch" });
    const here = patchId(20, 20);
    f.channel[f.at(20, 20)] = CHANNEL_STREAM;
    // A brook is drinking water: waterside for any purpose, no water to fish in.
    expect(watersideCell(f.world, here, "any")).toBe(true);
    expect(watersideCell(f.world, here, "fishing")).toBe(false);
    f.channel[f.at(21, 20)] = CHANNEL_RIVER;
    f.terrain[f.at(21, 20)] = TERRAIN_INDEX.river;
    expect(watersideCell(f.world, here, "fishing")).toBe(true);
  });

  it("refuses a seep on a stream patch, as on any shore", () => {
    const f = fineFixture({ terrain: "spruce" });
    const here = patchId(20, 20);
    expect(seepGround(f.world, here)).toBe("damp");
    f.channel[f.at(20, 20)] = CHANNEL_STREAM;
    expect(seepGround(f.world, here)).toBeNull();
  });
});
