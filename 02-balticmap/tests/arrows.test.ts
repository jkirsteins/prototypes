import { describe, expect, it } from "vitest";
import { clashFraction, insetSegment, pointAlong, spearPolygon } from "../src/arrows";

/** "x,y x,y ..." back into numbers, so a test can talk about the shape rather
 *  than about string formatting. */
const pointsOf = (s: string): [number, number][] =>
  s.split(" ").filter(Boolean).map((p) => {
    const [x, y] = p.split(",").map(Number);
    return [x, y];
  });

describe("spearPolygon", () => {
  it("is a seven-point polygon with its tip exactly on the target", () => {
    const pts = pointsOf(spearPolygon(0, 0, 100, 0));
    expect(pts).toHaveLength(7);
    expect(pts[3]).toEqual([100, 0]);
  });

  it("is symmetric about its own axis", () => {
    const pts = pointsOf(spearPolygon(0, 0, 100, 0));
    // Walking out from the tip, point i mirrors point 6-i across y = 0.
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[6 - i];
      expect(bx).toBeCloseTo(ax, 6);
      expect(by).toBeCloseTo(-ay, 6);
    }
  });

  it("is widest at the base and narrowest at the waist behind the head", () => {
    const pts = pointsOf(spearPolygon(0, 0, 100, 0));
    const [base, waist, barb] = [pts[0][1], pts[1][1], pts[2][1]];
    expect(Math.abs(waist)).toBeLessThan(Math.abs(base));
    expect(Math.abs(barb)).toBeGreaterThan(Math.abs(base));
  });

  it("rotates with the axis rather than staying axis-aligned", () => {
    const pts = pointsOf(spearPolygon(0, 0, 0, 100));
    expect(pts[3]).toEqual([0, 100]);
    // The base spreads along x now that the shaft runs along y.
    expect(Math.abs(pts[0][0])).toBeGreaterThan(0);
    expect(pts[0][1]).toBeCloseTo(0, 6);
  });

  it("shrinks the head rather than overrunning the base on a short arrow", () => {
    const pts = pointsOf(spearPolygon(0, 0, 6, 0));
    expect(pts[3]).toEqual([6, 0]);
    // The waist must still sit between the base and the tip.
    expect(pts[1][0]).toBeGreaterThan(0);
    expect(pts[1][0]).toBeLessThan(6);
  });

  it("draws nothing for a zero-length axis", () => {
    expect(spearPolygon(40, 40, 40, 40)).toBe("");
  });
});

describe("insetSegment", () => {
  it("pulls both ends in along the axis", () => {
    const s = insetSegment(0, 0, 100, 0, 10, 20);
    expect(s).toEqual({ ax: 10, ay: 0, bx: 80, by: 0 });
  });

  it("collapses to the midpoint rather than inverting when the insets overrun", () => {
    const s = insetSegment(0, 0, 10, 0, 40, 40);
    expect(s.ax).toBeCloseTo(5, 6);
    expect(s.bx).toBeCloseTo(5, 6);
  });

  it("leaves a zero-length axis alone", () => {
    expect(insetSegment(7, 7, 7, 7, 5, 5)).toEqual({ ax: 7, ay: 7, bx: 7, by: 7 });
  });
});

describe("clashFraction", () => {
  it("meets in the middle when the two sides are even", () => {
    expect(clashFraction(5, 5)).toBeCloseTo(0.5, 6);
    expect(clashFraction(0, 0)).toBeCloseTo(0.5, 6);
  });

  it("pushes the meeting point toward the weaker side", () => {
    expect(clashFraction(9, 1)).toBeGreaterThan(0.5);
    expect(clashFraction(1, 9)).toBeLessThan(0.5);
  });

  it("stops short of either end so a label always has room", () => {
    expect(clashFraction(100, 0)).toBeLessThan(1);
    expect(clashFraction(0, 100)).toBeGreaterThan(0);
  });
});

describe("pointAlong", () => {
  it("reads a fraction of the way from one end to the other", () => {
    expect(pointAlong(0, 0, 100, 50, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(0, 0, 100, 50, 1)).toEqual({ x: 100, y: 50 });
    expect(pointAlong(0, 0, 100, 50, 0.5)).toEqual({ x: 50, y: 25 });
  });
});
