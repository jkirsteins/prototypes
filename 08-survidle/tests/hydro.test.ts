import { describe, expect, it } from "vitest";
import { MinHeap } from "../src/world/heap";
import { accumulate, connectedSea, DX8, DY8, flowDirections, lakeComponents, NO_FLOW, priorityFlood, receiverOf } from "../src/world/hydro";

function grid(w: number, h: number, f: (x: number, y: number) => number): Float32Array {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y);
  return a;
}

describe("min heap", () => {
  it("pops in key order and never exceeds capacity", () => {
    const heap = new MinHeap(8);
    const keys = [5, 1, 4, 2, 8, 0, 3, 7];
    keys.forEach((k, i) => { heap.push(i, k); });
    const out: number[] = [];
    while (heap.size > 0) out.push(keys[heap.pop()]);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 7, 8]);
  });
});

describe("priority flood", () => {
  // A 7 by 7 bowl with the sea on the west column.
  const w = 7, h = 7;
  const height = grid(w, h, (x, y) => (x === 0 ? -5 : 100 - 10 * Math.min(x, w - 1 - x, y, h - 1 - y)));
  const sea = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) sea[y * w] = 1;

  it("fills the bowl to its spill height and leaves rising ground alone", () => {
    const filled = priorityFlood(height, w, h, sea);
    const centre = 3 * w + 3;
    // The bowl floor is 70; its rim is the ring at 90 (x = 1 or 5). The spill is the lowest rim cell, 90, plus epsilons.
    expect(filled[centre]).toBeGreaterThanOrEqual(90);
    expect(filled[centre]).toBeLessThan(90.1);
    expect(filled[1 * w + 1]).toBe(90);
    expect(filled[0]).toBe(-5);
  });

  it("gives every non-sea cell a receiver after the flood", () => {
    const filled = priorityFlood(height, w, h, sea);
    const dir = flowDirections(filled, w, h, sea);
    for (let i = 0; i < w * h; i++) {
      if (sea[i]) expect(dir[i]).toBe(NO_FLOW);
      else {
        expect(dir[i]).toBeLessThan(8);
        const r = receiverOf(i, dir[i], w);
        expect(filled[r]).toBeLessThan(filled[i]);
      }
    }
  });

  it("accumulates every cell into the sea in topological order", () => {
    const filled = priorityFlood(height, w, h, sea);
    const dir = flowDirections(filled, w, h, sea);
    const { count, order } = accumulate(dir, w, h, null);
    let intoSea = 0;
    for (let i = 0; i < w * h; i++) if (sea[i]) intoSea += count[i] - 1;
    expect(intoSea).toBe(w * h - h);
    // A cell comes after everything that drains into it.
    const position = new Int32Array(w * h);
    order.forEach((c, k) => { position[c] = k; });
    for (let i = 0; i < w * h; i++) if (dir[i] !== NO_FLOW) expect(position[receiverOf(i, dir[i], w)]).toBeGreaterThan(position[i]);
  });

  it("weights accumulation by the cells' own contributions", () => {
    const filled = priorityFlood(height, w, h, sea);
    const dir = flowDirections(filled, w, h, sea);
    const weight = new Float32Array(w * h).fill(2);
    const { flow, count } = accumulate(dir, w, h, weight);
    for (let i = 0; i < w * h; i++) expect(flow[i]).toBeCloseTo(2 * count[i], 4);
  });
});

describe("lakes and the sea", () => {
  it("marks a deep depression as a lake at its spill height and raises a shallow one to ground", () => {
    const w = 9, h = 5;
    const height = grid(w, h, (x, y) => {
      if (x === 0) return -1;
      if (x === 3 && y === 2) return 40; // a 20 m deep hole in ground at 60
      if (x === 6 && y === 2) return 59; // a 1 m dip
      return 60;
    });
    const sea = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) sea[y * w] = 1;
    const filled = priorityFlood(height, w, h, sea);
    const lake = lakeComponents(height, filled, w, h, sea, 2);
    expect(lake[2 * w + 3]).toBe(1);
    expect(height[2 * w + 3]).toBeCloseTo(60, 1);
    expect(lake[2 * w + 6]).toBe(0);
    expect(height[2 * w + 6]).toBeCloseTo(60, 1);
    expect(lake[2 * w + 4]).toBe(0);
  });

  it("counts as sea only what is connected to an edge below sea level", () => {
    const w = 6, h = 3;
    const height = grid(w, h, (x, y) => (x === 0 ? -3 : x === 1 ? -1 : x === 4 && y === 1 ? -20 : 10));
    const sea = connectedSea(height, w, h);
    expect(sea[1 * w + 0]).toBe(1);
    expect(sea[1 * w + 1]).toBe(1);
    expect(sea[1 * w + 4]).toBe(0);
    expect(sea[1 * w + 2]).toBe(0);
  });
});

describe("neighbour tables", () => {
  it("lists eight neighbours starting east and going clockwise", () => {
    expect([...DX8]).toEqual([1, 1, 0, -1, -1, -1, 0, 1]);
    expect([...DY8]).toEqual([0, 1, 1, 1, 0, -1, -1, -1]);
  });
});
