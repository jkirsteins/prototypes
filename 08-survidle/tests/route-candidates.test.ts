import { describe, expect, it } from "vitest";
import * as routing from "../src/world/fine-route";
import { patchId } from "../src/world/spatial";

function fixture(w: number, h: number, open: Set<number>) {
  const grid: routing.FineGrid = { w, h, terrainAt: patch => open.has(patch) ? "pine" : "water" };
  const profile: routing.TraversalProfile = { key: "fixture", speedAt: patch => open.has(patch) ? 1 : 0, elevationAt: () => 0, maxSpeed: 1 };
  return { grid, profile };
}

describe("candidate reachability rejection", () => {
  it("does not join diagonal parent corners through blocked side patches", () => {
    const from = patchId(5, 5);
    const to = patchId(6, 6);
    const { grid, profile } = fixture(12, 12, new Set([from, to]));
    expect(routing.filterReachableFineCandidates(grid, from, [to], profile).candidates).toEqual([]);
    expect(routing.findHierarchicalRoute(grid, from, to, profile)).toBeNull();
  });

  it.each([false, true])("matches individual routes across narrow parent crossings (open=%s)", crossing => {
    const open = new Set<number>();
    for (let y = 0; y < 6; y++) for (let x = 0; x < 18; x++) {
      if (x !== 6 || (crossing && y === 3)) open.add(patchId(x, y));
    }
    const { grid, profile } = fixture(18, 6, open);
    const from = patchId(1, 1);
    const candidates = [patchId(4, 2), patchId(8, 1), patchId(17, 5)];
    const filtered = routing.filterReachableFineCandidates(grid, from, candidates, profile);
    const exact = candidates.filter(to => routing.findHierarchicalRoute(grid, from, to, profile) !== null);
    expect(filtered.candidates).toEqual(exact);
    expect(filtered.complete).toBe(true);
    expect(filtered.parents).toBeLessThanOrEqual(3);
    expect(routing.filterReachableFineCandidates(grid, from, candidates, profile)).toEqual(filtered);
  });

  it("retains uncertain candidates when the explicit parent-work cap is reached", () => {
    const open = new Set<number>();
    for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) open.add(patchId(x, y));
    const { grid, profile } = fixture(18, 18, open);
    const candidates = [patchId(17, 17)];
    expect(routing.filterReachableFineCandidates(grid, patchId(0, 0), candidates, profile, 1)).toEqual({ candidates, parents: 1, complete: false });
  });

  it("leaves final rejection to the individual route when the union permits a longer detour", () => {
    const open = new Set<number>();
    for (let y = 250; y <= 500; y++) { open.add(patchId(250, y)); open.add(patchId(252, y)); }
    open.add(patchId(251, 500));
    const { grid, profile } = fixture(540, 600, open);
    const from = patchId(250, 250);
    const to = patchId(252, 250);
    const candidates = [to, patchId(250, 500)];
    expect(routing.filterReachableFineCandidates(grid, from, candidates, profile).candidates).toEqual(candidates);
    expect(routing.findHierarchicalRoute(grid, from, to, profile)).toBeNull();
  });

  it("does not visit the gaps outside the union of individual 40-parent boxes", () => {
    const open = new Set<number>();
    for (let x = 0; x <= 300; x++) { open.add(patchId(x, 300)); open.add(patchId(x, 0)); }
    for (let y = 0; y <= 300; y++) open.add(patchId(0, y));
    const { grid, profile } = fixture(600, 600, open);
    const from = patchId(300, 300);
    const candidates = [patchId(0, 300), patchId(300, 0)];
    const result = routing.filterReachableFineCandidates(grid, from, candidates, profile);
    expect(result.candidates).toEqual([candidates[0]]);
    expect(routing.findHierarchicalRoute(grid, from, candidates[1], profile)).toBeNull();
    expect(result.parents).toBeLessThan(110);
  });
});
