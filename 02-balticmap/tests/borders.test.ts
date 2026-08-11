import { describe, it, expect } from "vitest";
import { ringsOf, sharedVertices } from "../src/borders";

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
