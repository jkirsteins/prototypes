import { describe, expect, it } from "vitest";
import { findRoute } from "../src/world/route";
import { FLAG_FORD } from "../src/world/solve";
import { flatWorld, paintWorld } from "./world-fixture";

/** A river down column 6, forded on cell 9 * 12 + 6 when asked. A fresh world per
 * case, not a mutation after a query: fords are fixed at generation, so a route
 * cache may remember a refusal. */
function riverWorld(withFord: boolean) {
  const world = flatWorld({ w: 12, h: 12, terrain: "pine" });
  paintWorld(world, Array.from({ length: 12 }, (_, y) => y * 12 + 6), "river");
  if (withFord) world.solved.flags[9 * 12 + 6] |= FLAG_FORD;
  return world;
}

describe("rivers on a route", () => {
  it("refuses a river without a ford and crosses at the ford", () => {
    const from = 5 * 12 + 1;
    const to = 5 * 12 + 10;
    expect(findRoute(riverWorld(false), from, to)).toBeNull();
    const route = findRoute(riverWorld(true), from, to);
    expect(route).not.toBeNull();
    expect(route).toContain(9 * 12 + 6);
  });
});
