import { describe, it, expect } from "vitest";
import {
  LAYOUT, blockWidthFor, laneWidths, layoutLanes,
} from "../src/arrow-scene";
import type { Crossing } from "../src/borders";

/** A border running up the y axis at x=0, with "across" pointing at +x. */
const FLAT: Crossing = {
  at: { x: 0, y: 0 },
  tangent: { x: 0, y: 1 },
  normal: { x: 1, y: 0 },
  span: 200,
  sea: false,
  gap: 0,
};

describe("blockWidthFor", () => {
  it("takes its share of the border", () => {
    expect(blockWidthFor(100)).toBeCloseTo(55, 6);
  });

  it("caps a wide border and floors a tiny one", () => {
    expect(blockWidthFor(1000)).toBe(LAYOUT.blockMax);
    expect(blockWidthFor(4)).toBe(LAYOUT.blockMin);
  });
});

describe("laneWidths", () => {
  it("gives one arrow the whole block whatever its strength", () => {
    expect(laneWidths([1], 90)).toEqual([90]);
    expect(laneWidths([7], 90)).toEqual([90]);
  });

  it("splits by strength share", () => {
    const [a, b] = laneWidths([2, 1], 90);
    expect(a).toBeCloseTo(60, 6);
    expect(b).toBeCloseTo(30, 6);
  });

  it("raises a lane to the floor and shrinks the others to pay for it", () => {
    const widths = laneWidths([9, 1], 60);
    expect(widths[1]).toBeCloseTo(LAYOUT.laneMin, 6);
    expect(widths[0] + widths[1]).toBeCloseTo(60, 6);
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  it("shares evenly when even the floor will not fit", () => {
    const widths = laneWidths([1, 1, 1, 1, 1, 1], 30);
    expect(widths.every((w) => Math.abs(w - 5) < 1e-6)).toBe(true);
  });

  it("never returns a negative width", () => {
    for (const w of laneWidths([50, 1, 1, 1], 30)) expect(w).toBeGreaterThan(0);
  });
});

describe("layoutLanes", () => {
  it("packs lanes edge to edge, centred on the crossing", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
    ]);
    const total = blockWidthFor(FLAT.span);
    expect(lanes[0].width + lanes[1].width).toBeCloseTo(total, 6);
    // Centres are symmetric about the crossing point on the tangent axis.
    expect(lanes[0].ay + lanes[1].ay).toBeCloseTo(0, 6);
  });

  it("runs a forward lane along the normal and a backward one against it", () => {
    const [fwd, back] = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: false },
    ]);
    expect(fwd.bx).toBeGreaterThan(fwd.ax);
    expect(back.bx).toBeLessThan(back.ax);
  });

  it("starts inside the origin and ends inside the target", () => {
    const [lane] = layoutLanes(FLAT, [{ strength: 1, forward: true }]);
    expect(lane.ax).toBeCloseTo(-LAYOUT.tailDepth, 6);
    expect(lane.bx).toBeCloseTo(LAYOUT.headDepth, 6);
  });

  it("spans the water on a sea crossing instead of standing in it", () => {
    const strait: Crossing = { ...FLAT, sea: true, gap: 100 };
    const [lane] = layoutLanes(strait, [{ strength: 1, forward: true }]);
    expect(lane.bx - lane.ax).toBeCloseTo(100 + LAYOUT.seaClearance * 2, 6);
  });

  it("keeps the caller's order", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 3, forward: true }, { strength: 1, forward: false },
      { strength: 2, forward: true },
    ]);
    expect(lanes.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(lanes[0].width).toBeGreaterThan(lanes[2].width);
  });
});
