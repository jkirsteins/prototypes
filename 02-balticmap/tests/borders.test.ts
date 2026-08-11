import { describe, it, expect } from "vitest";
import { ringsOf, sharedVertices, crossingBetween, pointInRings } from "../src/borders";

describe("ringsOf", () => {
  it("reads one subpath as one ring", () => {
    const rings = ringsOf("M10,20L30,40L50,20");
    expect(rings).toEqual([[
      { x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 20 },
    ]]);
  });

  it("splits a multi-subpath region into a ring each", () => {
    const rings = ringsOf("M0,0L10,0L10,10M100,100L110,100L110,110");
    expect(rings).toHaveLength(2);
    expect(rings[1][0]).toEqual({ x: 100, y: 100 });
  });

  it("drops a subpath too short to be a ring", () => {
    expect(ringsOf("M0,0L1,1M5,5L6,6L7,7")).toHaveLength(1);
  });

  it("reads negative and decimal coordinates", () => {
    expect(ringsOf("M-1.5,2.25L3,4L5,6")[0][0]).toEqual({ x: -1.5, y: 2.25 });
  });
});

describe("sharedVertices", () => {
  it("finds the vertices two rings hold in common", () => {
    const a = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]];
    const b = [[{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 10 }]];
    expect(sharedVertices(a, b)).toEqual([{ x: 10, y: 0 }, { x: 10, y: 10 }]);
  });

  it("is empty for two rings that touch nowhere", () => {
    const a = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]];
    const b = [[{ x: 50, y: 50 }, { x: 51, y: 50 }, { x: 51, y: 51 }]];
    expect(sharedVertices(a, b)).toEqual([]);
  });

  it("matches across subpaths, not just the first ring", () => {
    const a = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
               [{ x: 90, y: 90 }, { x: 91, y: 90 }, { x: 91, y: 91 }]];
    const b = [[{ x: 91, y: 90 }, { x: 95, y: 90 }, { x: 95, y: 95 }]];
    expect(sharedVertices(a, b)).toEqual([{ x: 91, y: 90 }]);
  });
});

/** Two unit squares side by side, sharing the x=10 edge. */
const LEFT = [[
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 },
]];
const RIGHT = [[
  { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 20 },
]];

describe("pointInRings", () => {
  it("is true inside and false outside", () => {
    expect(pointInRings({ x: 5, y: 10 }, LEFT)).toBe(true);
    expect(pointInRings({ x: 15, y: 10 }, LEFT)).toBe(false);
  });
});

describe("crossingBetween", () => {
  it("puts the crossing on a real border vertex", () => {
    const c = crossingBetween(LEFT, RIGHT);
    expect(c.at.x).toBe(10);
    expect([0, 20]).toContain(c.at.y);
  });

  it("runs the tangent along the border", () => {
    const c = crossingBetween(LEFT, RIGHT);
    expect(Math.abs(c.tangent.x)).toBeCloseTo(0, 6);
    expect(Math.abs(c.tangent.y)).toBeCloseTo(1, 6);
  });

  it("points the normal from the first land into the second", () => {
    const c = crossingBetween(LEFT, RIGHT);
    expect(c.normal.x).toBeCloseTo(1, 6);
    expect(c.normal.y).toBeCloseTo(0, 6);
  });

  it("flips the normal when the lands are given the other way round", () => {
    const c = crossingBetween(RIGHT, LEFT);
    expect(c.normal.x).toBeCloseTo(-1, 6);
  });

  it("measures the span as the border's extent", () => {
    expect(crossingBetween(LEFT, RIGHT).span).toBeCloseTo(20, 6);
  });

  it("crosses the water where two lands share no vertex", () => {
    const far = [[
      { x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 40, y: 20 },
    ]];
    const c = crossingBetween(LEFT, far);
    expect(c.sea).toBe(true);
    expect(c.gap).toBeCloseTo(30, 6);
    expect(c.at.x).toBeCloseTo(25, 6);
    expect(c.normal.x).toBeCloseTo(1, 6);
  });

  it("touches at a corner with a single shared vertex", () => {
    const corner = [[
      { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 30 }, { x: 10, y: 30 },
    ]];
    const c = crossingBetween(LEFT, corner);
    expect(c.sea).toBe(false);
    expect(c.span).toBeCloseTo(0, 6);
    expect(Math.hypot(c.normal.x, c.normal.y)).toBeCloseTo(1, 6);
    expect(c.gap).toBe(0);
  });

  it("points the single-vertex normal from the first land toward the second", () => {
    const corner = [[
      { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 30 }, { x: 10, y: 30 },
    ]];
    const c = crossingBetween(LEFT, corner);
    expect(c.normal.x).toBeGreaterThan(0);
    expect(c.normal.y).toBeGreaterThan(0);
  });

  it("flips the single-vertex normal when the lands are given the other way round", () => {
    const corner = [[
      { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 30 }, { x: 10, y: 30 },
    ]];
    const c1 = crossingBetween(LEFT, corner);
    const c2 = crossingBetween(corner, LEFT);
    expect(c2.normal.x).toBeCloseTo(-c1.normal.x, 6);
    expect(c2.normal.y).toBeCloseTo(-c1.normal.y, 6);
  });
});

import { REGIONS } from "../src/regions";

describe("every adjacency on every map", () => {
  for (const region of Object.values(REGIONS)) {
    const rings = new Map(region.map.regions.map((r) => [r.id, ringsOf(r.path)]));

    it(`${region.id}: crosses at a point on the border, aimed into the target`, () => {
      for (const r of region.map.regions) {
        for (const adjId of r.adjacent) {
          const a = rings.get(r.id);
          const b = rings.get(adjId);
          expect(a !== undefined, `${r.id} -> ${adjId}: source rings not found`).toBe(true);
          expect(b !== undefined, `${r.id} -> ${adjId}: target rings not found`).toBe(true);
          if (a === undefined || b === undefined) continue;
          const c = crossingBetween(a, b);
          const where = `${r.id} -> ${adjId}`;
          expect(Number.isFinite(c.at.x), where).toBe(true);
          expect(Number.isFinite(c.at.y), where).toBe(true);
          expect(Math.hypot(c.normal.x, c.normal.y), where).toBeCloseTo(1, 6);
          expect(Math.hypot(c.tangent.x, c.tangent.y), where).toBeCloseTo(1, 6);
          expect(Number.isFinite(c.span), where).toBe(true);
          expect(c.span, where).toBeGreaterThanOrEqual(0);
          if (!c.sea) {
            // The crossing must face the land it is aimed at. Assert the vote
            // cast by multiple probes: the normal direction must score higher
            // than its opposite. A tie means the normal was rotated onto the
            // tangent, which is precisely the bug this catches, so tie must
            // fail - use strictly greater than.
            const votes = (n: { x: number; y: number }): number => {
              let score = 0;
              for (const d of [6, 12, 24, 40]) {
                if (pointInRings({ x: c.at.x + n.x * d, y: c.at.y + n.y * d }, b)) score++;
                if (pointInRings({ x: c.at.x - n.x * d, y: c.at.y - n.y * d }, a)) score++;
              }
              return score;
            };
            const flipped = { x: -c.normal.x, y: -c.normal.y };
            expect(votes(c.normal), where).toBeGreaterThan(votes(flipped));
          }
        }
      }
    });

    it(`${region.id}: only sea neighbours fall back to a strait`, () => {
      const seas: string[] = [];
      for (const r of region.map.regions) {
        for (const adjId of r.adjacent) {
          const a = rings.get(r.id);
          const b = rings.get(adjId);
          expect(a !== undefined, `${r.id} -> ${adjId}: source rings not found`).toBe(true);
          expect(b !== undefined, `${r.id} -> ${adjId}: target rings not found`).toBe(true);
          if (a === undefined || b === undefined) continue;
          if (crossingBetween(a, b).sea) seas.push(`${r.id}|${adjId}`);
        }
      }
      // Four ORDERED pairs per map, which is two lands facing each other
      // across water in each direction: Saaremaa in the Baltic, the Balearics
      // in Iberia. A fifth would mean the map data lost its shared topology.
      expect(seas.length, seas.join(", ")).toBe(4);
    });
  }
});
