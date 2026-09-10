import { describe, expect, it } from "vitest";
import { coarseSize, coarseSurface, erode, ERODE_ITERATIONS, upsample } from "../src/world/erode";
import { accumulate, flowDirections, priorityFlood } from "../src/world/hydro";

// A miniature of the whole geography: 120 by 160 cells is 30 by 40 coarse cells.
const W = 120, H = 160;

function drainageDensity(height: Float32Array, cw: number, ch: number, sea: Uint8Array): number {
  const filled = priorityFlood(height, cw, ch, sea);
  const dir = flowDirections(filled, cw, ch, sea);
  const { count } = accumulate(dir, cw, ch, null);
  let channels = 0, land = 0;
  for (let i = 0; i < cw * ch; i++) if (!sea[i]) { land++; if (count[i] >= 8) channels++; }
  return channels / land;
}

describe("coarse surface", () => {
  const { cw, ch } = coarseSize(W, H);
  const c = coarseSurface(42, cw, ch);

  it("is finite, has sea on the west and land inland, and lifts only the land", () => {
    for (let i = 0; i < cw * ch; i++) expect(Number.isFinite(c.height[i])).toBe(true);
    expect(c.sea[ch * cw / 2 | 0]).toBe(1); // first column, middle row
    expect(c.sea[(ch / 8 | 0) * cw + cw - 2]).toBe(0); // row at v = 0.125 is 66.25 N, north of the Bothnian bay
    for (let i = 0; i < cw * ch; i++) if (c.sea[i]) expect(c.uplift[i]).toBe(0);
    let lifted = 0;
    for (let i = 0; i < cw * ch; i++) if (c.uplift[i] > 0) lifted++;
    expect(lifted).toBeGreaterThan(cw * ch * 0.3);
  });
});

describe("erosion", () => {
  const { cw, ch } = coarseSize(W, H);

  it("keeps heights finite, holds the crest, and cuts a denser channel network", () => {
    const c = coarseSurface(42, cw, ch);
    const before = new Float32Array(c.height);
    const densityBefore = drainageDensity(before, cw, ch, c.sea);
    let maxBefore = -Infinity;
    for (let i = 0; i < cw * ch; i++) if (before[i] > maxBefore) maxBefore = before[i];
    erode(c.height, cw, ch, c.uplift, c.sea, ERODE_ITERATIONS);
    let maxAfter = -Infinity;
    let sum = 0, sumBefore = 0, land = 0;
    for (let i = 0; i < cw * ch; i++) {
      expect(Number.isFinite(c.height[i])).toBe(true);
      if (c.sea[i]) { expect(c.height[i]).toBe(before[i]); continue; }
      land++;
      sum += c.height[i];
      sumBefore += before[i];
      if (c.height[i] > maxAfter) maxAfter = c.height[i];
    }
    expect(maxAfter).toBeGreaterThan(maxBefore * 0.7);
    expect(maxAfter).toBeLessThan(maxBefore * 1.3);
    // Erosion removes more than uplift adds: the mean land height falls.
    expect(sum / land).toBeLessThan(sumBefore / land);
    expect(drainageDensity(c.height, cw, ch, c.sea)).toBeGreaterThan(densityBefore);
  });

  it("is deterministic", () => {
    const a = coarseSurface(7, cw, ch);
    const b = coarseSurface(7, cw, ch);
    erode(a.height, cw, ch, a.uplift, a.sea, 5);
    erode(b.height, cw, ch, b.uplift, b.sea, 5);
    expect([...a.height]).toEqual([...b.height]);
  });
});

describe("upsample", () => {
  it("interpolates the coarse surface and adds more detail on steep ground than on flat", () => {
    const { cw, ch } = coarseSize(W, H);
    const c = coarseSurface(42, cw, ch);
    const fine = upsample(c.height, cw, ch, W, H, 42);
    expect(fine.length).toBe(W * H);
    // A fine cell lies within 120 m of the coarse cell under it plus the detail band.
    for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
      const coarse = c.height[Math.min(ch - 1, (y / 4) | 0) * cw + Math.min(cw - 1, (x / 4) | 0)];
      expect(Math.abs(fine[y * W + x] - coarse)).toBeLessThan(400);
    }
    // Roughness: mean absolute difference to the east neighbour, on the shelf (flat) versus the coastal flank (steep).
    const rough = (x0: number, x1: number) => {
      let s = 0, n = 0;
      for (let y = 10; y < H - 10; y++) for (let x = x0; x < x1; x++) { s += Math.abs(fine[y * W + x + 1] - fine[y * W + x]); n++; }
      return s / n;
    };
    expect(rough(2, 6)).toBeLessThan(rough(20, 30));
  });
});
