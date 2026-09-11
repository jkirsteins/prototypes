import { describe, expect, it } from "vitest";
import { findRoute } from "../src/world/route";
import { FLAG_FORD } from "../src/world/solve";
import { flatWorld, paintWorld } from "./world-fixture";

describe("rivers on a route", () => {
  it("refuses a river without a ford and crosses at the ford", () => {
    const world = flatWorld({ w: 12, h: 12, terrain: "pine" });
    // A river down column 6.
    paintWorld(world, Array.from({ length: 12 }, (_, y) => y * 12 + 6), "river");
    const from = 5 * 12 + 1;
    const to = 5 * 12 + 10;
    expect(findRoute(world, from, to)).toBeNull();
    world.solved.flags[9 * 12 + 6] |= FLAG_FORD;
    const route = findRoute(world, from, to);
    expect(route).not.toBeNull();
    expect(route).toContain(9 * 12 + 6);
  });
});
