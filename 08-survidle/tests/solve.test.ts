import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coastKmOfCell } from "../src/world/classify";
import { DIST8, NO_FLOW, receiverOf } from "../src/world/hydro";
import { FLAG_FORD, FLAG_STREAM, KIND, RIVER_M3S, solveWorld, STREAM_M3S } from "../src/world/solve";
import { latitudeAt, TERRAIN_INDEX, treelineM } from "../src/world/terrain";

const W = 120, H = 160;

function hash(a: ArrayLike<number>): number {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ Math.round(a[i] * 1000), 16777619);
  return h >>> 0;
}

describe("the solved miniature world", () => {
  const s = solveWorld(42, W, H);
  const n = W * H;

  it("solves the same seed to the same arrays", () => {
    const again = solveWorld(42, W, H);
    for (const key of ["height", "flowDir", "discharge", "kind", "flags", "terrain", "moisture"] as const) {
      expect(hash(again[key]), key).toBe(hash(s[key]));
    }
    expect(hash(solveWorld(43, W, H).height)).not.toBe(hash(s.height));
  });

  it("classes water by kind: sea and lake are water, rivers are river", () => {
    for (let i = 0; i < n; i++) {
      if (s.kind[i] === KIND.sea || s.kind[i] === KIND.lake) expect(s.terrain[i]).toBe(TERRAIN_INDEX.water);
      if (s.kind[i] === KIND.river) expect(s.terrain[i]).toBe(TERRAIN_INDEX.river);
      if (s.terrain[i] === TERRAIN_INDEX.river) expect(s.discharge[i]).toBeGreaterThanOrEqual(RIVER_M3S);
    }
  });

  it("flags streams by discharge and fords by gradient, on land only", () => {
    for (let i = 0; i < n; i++) {
      const stream = (s.flags[i] & FLAG_STREAM) !== 0;
      const ford = (s.flags[i] & FLAG_FORD) !== 0;
      if (stream) { expect(s.kind[i]).toBe(KIND.land); expect(s.discharge[i]).toBeGreaterThanOrEqual(STREAM_M3S); }
      if (ford) {
        expect(s.kind[i]).toBe(KIND.river);
        expect(s.flowDir[i]).not.toBe(NO_FLOW);
        const r = receiverOf(i, s.flowDir[i], W);
        expect(s.height[i] - s.height[r]).toBeGreaterThan(0);
      }
      if (s.kind[i] === KIND.land && s.discharge[i] >= STREAM_M3S) expect(stream).toBe(true);
    }
  });

  it("continues every river downstream to a lake, the sea or the edge", () => {
    for (let i = 0; i < n; i++) {
      if (s.kind[i] !== KIND.river || s.flowDir[i] === NO_FLOW) continue;
      const r = receiverOf(i, s.flowDir[i], W);
      expect([KIND.river, KIND.lake, KIND.sea]).toContain(s.kind[r]);
    }
  });

  it("puts fell only above the treeline of its row and coast, and no spruce on the coast or above 66 N", () => {
    for (let i = 0; i < n; i++) {
      const x = i % W, y = (i - x) / W;
      const lat = latitudeAt(y + 0.5, H);
      const coast = coastKmOfCell(x, y, W, H);
      const t = s.terrain[i];
      if (t === TERRAIN_INDEX.fell) expect(s.height[i]).toBeGreaterThan(treelineM(lat, coast) - 1);
      if (t === TERRAIN_INDEX.spruce) { expect(coast).toBeGreaterThan(30); expect(lat).toBeLessThan(66); }
    }
  });

  it("keeps bog on flat ground and stores a moisture in 0..255", () => {
    for (let i = 0; i < n; i++) {
      expect(s.moisture[i]).toBeGreaterThanOrEqual(0);
      expect(s.moisture[i]).toBeLessThanOrEqual(255);
      if (s.terrain[i] !== TERRAIN_INDEX.bog || s.flowDir[i] === NO_FLOW) continue;
      const r = receiverOf(i, s.flowDir[i], W);
      // A diagonal receiver is sqrt(2) cells away; divide by the real run, the same distance classify uses for its own slope.
      expect((s.height[i] - s.height[r]) / (DIST8[s.flowDir[i]] * 300)).toBeLessThan(0.02 + 0.004);
    }
  });

  it("has every terrain class somewhere in the miniature", () => {
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) seen.add(s.terrain[i]);
    for (const t of ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow"] as const) expect(seen.has(TERRAIN_INDEX[t]), t).toBe(true);
  });
});

describe("the solve's arithmetic", () => {
  it("uses no function whose last bit differs between engines", () => {
    for (const file of ["src/world/solve.ts", "src/world/classify.ts", "src/world/erode.ts", "src/world/hydro.ts", "src/world/heap.ts", "src/world/terrain.ts", "src/world/noise.ts"]) {
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, file).not.toMatch(/Math\.(exp|pow|sin|cos|tan|log|atan2|atan|asin|acos|cbrt|hypot|expm1|log1p|log2|log10)\b/);
      expect(src, file).not.toMatch(/\*\*/);
    }
  });
});
