import { describe, expect, it } from "vitest";
import { hasLineOfSight, prominenceM } from "../src/sim/sight";
import { flatWorld, paintWorld } from "./world-fixture";

describe("sight in metres", () => {
  it("sees across water: a sea cell is no obstacle", () => {
    const world = flatWorld({ w: 40, h: 5, terrain: "meadow", heightM: 5 });
    const row = 2 * 40;
    paintWorld(world, Array.from({ length: 20 }, (_, i) => row + 10 + i), "water", 0);
    world.solved.kind.fill(1, row + 10, row + 30); // sea
    expect(hasLineOfSight(world, row + 2, row + 36)).toBe(true);
  });

  it("is blocked by a ridge between two valley floors", () => {
    const world = flatWorld({ w: 40, h: 5, terrain: "meadow", heightM: 100 });
    const row = 2 * 40;
    paintWorld(world, [row + 20], "rock", 400);
    expect(hasLineOfSight(world, row + 2, row + 38)).toBe(false);
    expect(hasLineOfSight(world, row + 2, row + 19)).toBe(true);
  });

  it("reads prominence above the lowest ground within 20 km, not altitude", () => {
    const plateau = flatWorld({ w: 200, h: 200, terrain: "meadow", heightM: 300 });
    expect(prominenceM(plateau, 100, 100)).toBe(0);
    const fjord = flatWorld({ w: 200, h: 200, terrain: "meadow", heightM: 300 });
    for (let y = 0; y < 200; y++) for (let x = 0; x < 20; x++) fjord.solved.height[y * 200 + x] = 0;
    expect(prominenceM(fjord, 40, 100)).toBe(300);
    expect(prominenceM(fjord, 150, 100)).toBe(0);
  });
});
