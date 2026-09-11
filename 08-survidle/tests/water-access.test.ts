import { describe, expect, it } from "vitest";
import { watersideCell } from "../src/sim/position";
import { seepGround } from "../src/sim/seep";
import { FLAG_STREAM } from "../src/world/solve";
import { flatWorld, paintWorld } from "./world-fixture";

describe("water beside", () => {
  it("counts a stream on the cell, a river beside it and a lake beside it, and tells them apart", () => {
    const world = flatWorld({ w: 10, h: 10, terrain: "birch" });
    const c = 5 * 10 + 5;
    expect(watersideCell(world, c, "any")).toBe(false);
    world.solved.flags[c] |= FLAG_STREAM;
    expect(watersideCell(world, c, "any")).toBe(true);
    expect(watersideCell(world, c, "stream")).toBe(true);
    expect(watersideCell(world, c, "lake")).toBe(false);
    paintWorld(world, [c + 1], "river");
    expect(watersideCell(world, c, "river")).toBe(true);
    paintWorld(world, [c - 1], "water");
    expect(watersideCell(world, c, "lake")).toBe(true);
  });

  it("counts a river beside as fishing water and a stream on the cell as not", () => {
    const world = flatWorld({ w: 10, h: 10, terrain: "birch" });
    const c = 5 * 10 + 5;
    world.solved.flags[c] |= FLAG_STREAM;
    // A brook is drinking water: waterside for any purpose, no water to fish in.
    expect(watersideCell(world, c, "any")).toBe(true);
    expect(watersideCell(world, c, "fishing")).toBe(false);
    paintWorld(world, [c + 1], "river");
    expect(watersideCell(world, c, "fishing")).toBe(true);
  });

  it("refuses a seep on a stream cell, as on any shore", () => {
    const world = flatWorld({ w: 10, h: 10, terrain: "spruce" });
    const c = 5 * 10 + 5;
    expect(seepGround(world, c)).toBe("damp");
    world.solved.flags[c] |= FLAG_STREAM;
    expect(seepGround(world, c)).toBeNull();
  });
});
