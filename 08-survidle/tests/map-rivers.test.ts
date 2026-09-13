import { describe, expect, it } from "vitest";
import type { Terrain } from "../src/sim/types";
import { dominantByPriority } from "../src/ui/map";
import { emptyTerrainCounts } from "../src/world/aggregate";

function counts(entries: Partial<Record<Terrain, number>>): Record<Terrain, number> {
  return { ...emptyTerrainCounts(), ...entries };
}

describe("a one-patch river is drawn at every rung", () => {
  it("promotes a block with any river patch in it to river", () => {
    expect(dominantByPriority(counts({ pine: 35, river: 1 }))).toBe("river");
    expect(dominantByPriority(counts({ meadow: 30, bog: 5, river: 1 }))).toBe("river");
  });

  it("keeps a water-majority block reading as water even with a river patch in it", () => {
    expect(dominantByPriority(counts({ water: 30, river: 6 }))).toBe("water");
  });

  it("leaves a block with no river patch alone", () => {
    expect(dominantByPriority(counts({ pine: 20, spruce: 16 }))).toBe("pine");
  });
});
