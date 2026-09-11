import { describe, expect, it } from "vitest";
import { FINE_CHUNK, newWorld } from "../src/world/cells";
import { fineRouteCacheStats } from "../src/world/fine-route";
import { findRoute, knownRoute, remainingWalkMinutes, routeKm, routeMinutes, type RouteConditions } from "../src/world/route";
import { patchId } from "../src/world/spatial";
import { TERRAIN_INDEX } from "../src/world/terrain";

// Public fine chunk data keeps these geometry/cache tests independent of seed geography.
function fixture() {
  const world = newWorld(21);
  const terrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK).fill(TERRAIN_INDEX.pine);
  const region = new Int32Array(FINE_CHUNK * FINE_CHUNK);
  world.fineChunks.set(0, { cx: 0, cy: 0, terrain, region, samples: terrain.length, parentSummaries: new Map() });
  const conditions: RouteConditions = {
    key: "fixture",
    iceAt: () => "none",
    blockedAt: cell => cell % world.w >= 6 || Math.floor(cell / world.w) >= 6,
  };
  return { world, terrain, conditions };
}

describe("fine route facade", () => {
  it("preserves endpoint conventions and sums physical diagonal and orthogonal edges", () => {
    const { world, conditions } = fixture();
    const from = patchId(1, 1);
    const diagonal = patchId(2, 2);
    const to = patchId(3, 2);
    expect(findRoute(world, from, from)).toEqual([]);
    expect(findRoute(world, from, diagonal, conditions)).toEqual([diagonal]);
    expect(routeKm([diagonal, to], from)).toBeCloseTo(0.05 * Math.SQRT2 + 0.05, 12);
    expect(routeKm([diagonal], from)).toBeCloseTo(0.05 * Math.SQRT2, 12);
    expect(routeKm([], from)).toBe(0);
    expect(routeMinutes(world, [diagonal, to], from, 3, conditions)).toBeCloseTo(Math.SQRT2 + 1, 10);
    expect(fineRouteCacheStats(world).localTrees).toBeGreaterThan(0);
    const route = findRoute(world, from, diagonal, conditions)!;
    route.shift();
    expect(findRoute(world, from, diagonal, conditions)).toEqual([diagonal]);
  });

  it("changes cached traversal with ice, blocked ground and fell avoidance", () => {
    const { world, terrain, conditions } = fixture();
    const from = patchId(1, 1);
    const to = patchId(2, 1);
    terrain[FINE_CHUNK + 2] = TERRAIN_INDEX.water;
    expect(findRoute(world, from, to, conditions)).toBeNull();
    expect(findRoute(world, from, to, { ...conditions, key: "frozen", iceAt: () => "safe" })).toEqual([to]);
    expect(findRoute(world, from, to, { ...conditions, key: "blocked", iceAt: () => "safe", blockedAt: cell => cell === to })).toBeNull();
    terrain[FINE_CHUNK + 2] = TERRAIN_INDEX.fell;
    const fell = { ...conditions, key: "fell" };
    expect(findRoute(world, from, to, fell)).toEqual([to]);
    expect(findRoute(world, from, to, fell, true)).toBeNull();
  });

  it("keeps local condition generations distinct from uniform ice names", () => {
    const { world } = fixture();
    const from = patchId(1, 1);
    const to = patchId(2, 1);
    expect(findRoute(world, from, to, "none")).toEqual([to]);
    expect(findRoute(world, from, to, { key: "none", iceAt: () => "none", blockedAt: cell => cell === to })).toBeNull();
  });
});

describe("knownRoute", () => {
  it("shares equivalent knowledge overlays across already-known starts", () => {
    const { world, conditions } = fixture();
    const to = patchId(3, 3);
    expect(knownRoute(world, patchId(1, 1), to, () => true, 10, conditions)).not.toBeNull();
    const before = fineRouteCacheStats(world).overlays;
    expect(knownRoute(world, patchId(2, 1), to, () => true, 10, conditions)).not.toBeNull();
    expect(fineRouteCacheStats(world).overlays).toBe(before);
  });

  it("takes the mapped detour and never cuts an unknown diagonal corner", () => {
    const { world, conditions } = fixture();
    const from = patchId(0, 0);
    const to = patchId(4, 0);
    const cells = new Set<number>([to]);
    for (let y = 1; y <= 3; y++) { cells.add(patchId(0, y)); cells.add(patchId(4, y)); }
    for (let x = 0; x <= 4; x++) cells.add(patchId(x, 3));
    const detour = knownRoute(world, from, to, cell => cells.has(cell), 1, conditions)!;
    expect(detour).not.toBeNull();
    expect(detour.length).toBe(10);
    expect(detour.every(cell => cells.has(cell))).toBe(true);
    expect(knownRoute(world, from, patchId(2, 2), cell => cells.has(cell), 1, conditions)).toBeNull();
    for (let x = 0; x <= 4; x++) cells.add(patchId(x, 0));
    const shorter = knownRoute(world, from, to, cell => cells.has(cell), 2, conditions)!;
    expect(shorter.length).toBe(4);
  });
});

describe("remaining walking time", () => {
  it("counts fine-patch minute steps without moving the route", () => {
    const { world } = fixture();
    const position = { x: 1.5, y: 1.5 };
    const path = [patchId(2, 1), patchId(3, 1)];
    expect(remainingWalkMinutes(world, position, path, 3, "none")).toBe(2);
    expect(position).toEqual({ x: 1.5, y: 1.5 });
    expect(path).toEqual([patchId(2, 1), patchId(3, 1)]);
  });

  it.each(["safe", "thin"] as const)("uses the %s ice route's walking speed", ice => {
    const { world, terrain } = fixture();
    terrain.fill(TERRAIN_INDEX.water);
    // 50 m at 3 km/h * 0.8 takes 1.25 minutes, completing in the second minute.
    expect(remainingWalkMinutes(world, { x: 1.5, y: 1.5 }, [patchId(2, 1)], 3, ice)).toBe(2);
    expect(remainingWalkMinutes(world, { x: 1.5, y: 1.5 }, [patchId(2, 1)], 3, "none")).toBe(Infinity);
  });
});
