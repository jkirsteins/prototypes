import { describe, expect, it } from "vitest";
import { buildParentTopology, type FineGrid, fineRouteCacheStats, fineRouteDistanceM, findDirectFineRoute, findHierarchicalRoute, type TraversalProfile } from "../src/world/fine-route";
import { patchId, patchXY, WORLD_FINE_H, WORLD_FINE_W } from "../src/world/spatial";

function asciiFixture(rows: string[]): FineGrid & { id: typeof patchId } {
  return {
    w: rows[0].length, h: rows.length, id: patchId,
    terrainAt: patch => {
      const { x, y } = patchXY(patch);
      return rows[y][x] === "#" ? "water" : "meadow";
    },
  };
}

function traversalFor(grid: FineGrid): TraversalProfile {
  return { key: "walking", maxSpeed: 1, speedAt: patch => grid.terrainAt(patch) === "water" ? 0 : 1, elevationAt: () => 0 };
}

describe("exact fine routing", () => {
  it("charges physical diagonal distance", () => {
    const grid = asciiFixture(["...", "...", "..."]);
    const route = findDirectFineRoute(grid, grid.id(0, 0), grid.id(2, 2), traversalFor(grid));
    expect(route?.distanceM).toBeCloseTo(100 * Math.SQRT2, 6);
  });

  it("forbids diagonal corner cutting", () => {
    const grid = asciiFixture([".#", "#."]);
    expect(findDirectFineRoute(grid, grid.id(0, 0), grid.id(1, 1), traversalFor(grid))).toBeNull();
  });

  it("does not cross a parent split by impassable water", () => {
    const grid = asciiFixture(["..#...", "..#...", "..#...", "..#...", "..#...", "..#..."]);
    const topology = buildParentTopology(grid, 0, 0, traversalFor(grid));
    expect(topology.components.size).toBe(2);
    expect(topology.connected(grid.id(0, 2), grid.id(5, 2))).toBe(false);
  });

  it("preserves the only ford across a parent boundary", () => {
    const grid = asciiFixture([".....##.....", ".....##.....", "............", ".....##.....", ".....##.....", ".....##....."]);
    const profile = traversalFor(grid);
    const route = findHierarchicalRoute(grid, grid.id(2, 0), grid.id(9, 0), profile);
    expect(route?.patches).toContain(grid.id(5, 2));
    expect(route?.patches).toContain(grid.id(6, 2));
    expect(route?.cost).toBeCloseTo(findDirectFineRoute(grid, grid.id(2, 0), grid.id(9, 0), profile)!.cost, 6);
  });

  it("forbids diagonal corner cutting between four parents", () => {
    const rows = Array.from({ length: 12 }, () => "############");
    rows[5] = "#####.######";
    rows[6] = "######.#####";
    const grid = asciiFixture(rows);
    expect(findHierarchicalRoute(grid, grid.id(5, 5), grid.id(6, 6), traversalFor(grid))).toBeNull();
  });

  it("charges directional normalized slope costs and includes both endpoints", () => {
    const grid = asciiFixture([".."]);
    const from = grid.id(0, 0);
    const to = grid.id(1, 0);
    const profile = { ...traversalFor(grid), elevationAt: (patch: number) => patch === from ? 0 : -2.5 };
    const downhill = findHierarchicalRoute(grid, from, to, profile)!;
    const uphill = findHierarchicalRoute(grid, to, from, profile)!;
    expect(downhill.patches).toEqual([from, to]);
    expect(downhill.cost).toBeCloseTo(50 * Math.exp(-0.175), 6);
    expect(uphill.cost).toBeCloseTo(50 * Math.exp(0.175), 6);
    expect(fineRouteDistanceM(downhill.patches)).toBe(50);
    expect(findHierarchicalRoute(grid, from, from, profile)).toEqual({ patches: [from], distanceM: 0, cost: 0 });
  });

  it("reuses topology for cost changes and rebuilds connectivity for passability changes", () => {
    const grid = asciiFixture(["......", "......", "......", "......", "......", "......"]);
    const profile = traversalFor(grid);
    const faster = { ...profile, key: "faster", maxSpeed: 2, speedAt: () => 2 };
    const topology = buildParentTopology(grid, 0, 0, profile);
    expect(topology.portals).toHaveLength(20);
    expect(buildParentTopology(grid, 0, 0, faster)).toBe(topology);
    const from = grid.id(0, 2);
    const to = grid.id(5, 2);
    expect(findHierarchicalRoute(grid, from, to, profile)?.cost).toBe(250);
    expect(findHierarchicalRoute(grid, from, to, faster)?.cost).toBe(125);
    const blocked = { ...profile, speedAt: (patch: number) => patchXY(patch).x === 3 ? 0 : 1 };
    expect(buildParentTopology(grid, 0, 0, blocked).connected(from, to)).toBe(false);
    expect(findHierarchicalRoute(grid, from, to, blocked)).toBeNull();
  });

  it("revalidates a diagonal boundary guard after passability changes", () => {
    const grid = asciiFixture(Array.from({ length: 12 }, () => "............"));
    const from = grid.id(5, 5);
    const to = grid.id(6, 6);
    const profile = traversalFor(grid);
    expect(findHierarchicalRoute(grid, from, to, profile)?.distanceM).toBeCloseTo(50 * Math.SQRT2, 6);
    const blocked = { ...profile, speedAt: (patch: number) => patch === grid.id(6, 5) ? 0 : 1 };
    expect(findHierarchicalRoute(grid, from, to, blocked)?.distanceM).toBe(100);
  });

  it("rejects a global direct search before sampling the grid", () => {
    const grid: FineGrid = { w: WORLD_FINE_W, h: WORLD_FINE_H, terrainAt: () => { throw new Error("must not sample"); } };
    expect(() => findDirectFineRoute(grid, patchId(0, 0), patchId(1, 0), traversalFor(grid))).toThrow(RangeError);
  });

  it("does not leave the 40-parent search margin to use a remote ford", () => {
    const grid: FineGrid = { w: 12, h: 252, terrainAt: patch => {
      const { x, y } = patchXY(patch);
      return x === 5 && y !== 246 ? "water" : "meadow";
    } };
    const profile = traversalFor(grid);
    const from = patchId(1, 0);
    const to = patchId(8, 0);
    expect(findDirectFineRoute(grid, from, to, profile)).not.toBeNull();
    expect(findHierarchicalRoute(grid, from, to, profile)).toBeNull();
  });

  it("uses the declared speed bound to avoid exploring distant parents", () => {
    const run = (maxSpeed?: number) => {
      const grid = asciiFixture(Array.from({ length: 120 }, () => ".".repeat(120)));
      let reads = 0;
      const profile: TraversalProfile = { key: "flat", maxSpeed, speedAt: () => { reads++; return 1; }, elevationAt: () => 0 };
      const route = findHierarchicalRoute(grid, grid.id(1, 1), grid.id(115, 1), profile);
      expect(route?.distanceM).toBe(5700);
      return reads;
    };
    expect(run(1)).toBeLessThan(run() * 0.75);
  });

  it("bounds retained topology and directed overlays without changing routes after eviction", () => {
    const grid = asciiFixture(Array.from({ length: 246 }, () => ".".repeat(600)));
    const profile = traversalFor(grid);
    const first = buildParentTopology(grid, 0, 0, profile);
    const limits = fineRouteCacheStats(grid);
    for (let i = 1; i <= limits.topologyLimit; i++) buildParentTopology(grid, i % 100, Math.floor(i / 100), profile);
    expect(fineRouteCacheStats(grid).topologies).toBe(limits.topologyLimit);
    expect(buildParentTopology(grid, 0, 0, profile)).not.toBe(first);
    const from = grid.id(1, 1);
    const to = grid.id(2, 1);
    for (let i = 0; i <= limits.overlayLimit; i++) {
      expect(findHierarchicalRoute(grid, from, to, { ...profile, key: `version-${i}` })?.cost).toBe(50);
    }
    expect(fineRouteCacheStats(grid).overlays).toBe(limits.overlayLimit);
    const route = findHierarchicalRoute(grid, from, to, { ...profile, key: "version-0" })!;
    route.patches.length = 0;
    expect(findHierarchicalRoute(grid, from, to, { ...profile, key: "version-0" })?.patches).toEqual([from, to]);
  });

  it("agrees with the direct oracle over 200 seeded 18 by 18 fixtures", () => {
    let seed = 0x5eeda11;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let sample = 0; sample < 200; sample++) {
      const grid = asciiFixture(Array.from({ length: 18 }, () => Array.from({ length: 18 }, () => random() < 0.26 ? "#" : ".").join("")));
      const from = grid.id(Math.floor(random() * 18), Math.floor(random() * 18));
      const to = grid.id(Math.floor(random() * 18), Math.floor(random() * 18));
      const profile = traversalFor(grid);
      const direct = findDirectFineRoute(grid, from, to, profile);
      const hierarchical = findHierarchicalRoute(grid, from, to, profile);
      expect(hierarchical === null, `fixture ${sample}`).toBe(direct === null);
      if (!direct || !hierarchical) continue;
      expect(hierarchical.distanceM, `fixture ${sample}`).toBeCloseTo(direct.distanceM, 6);
      expect(hierarchical.cost, `fixture ${sample}`).toBeCloseTo(direct.cost, 6);
      for (const patch of hierarchical.patches) expect(grid.terrainAt(patch)).not.toBe("water");
      for (let i = 1; i < hierarchical.patches.length; i++) {
        const a = patchXY(hierarchical.patches[i - 1]);
        const b = patchXY(hierarchical.patches[i]);
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
        if (a.x !== b.x && a.y !== b.y) {
          expect(grid.terrainAt(grid.id(a.x, b.y))).not.toBe("water");
          expect(grid.terrainAt(grid.id(b.x, a.y))).not.toBe("water");
        }
      }
      const weighted: TraversalProfile = {
        key: "weighted", maxSpeed: 2,
        speedAt: patch => grid.terrainAt(patch) === "water" ? 0 : 0.5 + ((patch * 31 + sample) % 7) / 4,
        elevationAt: patch => (patch * 17 + sample) % 71,
      };
      const weightedDirect = findDirectFineRoute(grid, from, to, weighted)!;
      const weightedHierarchical = findHierarchicalRoute(grid, from, to, weighted)!;
      expect(weightedHierarchical.cost, `weighted fixture ${sample}`).toBeCloseTo(weightedDirect.cost, 6);
    }
  });
});
