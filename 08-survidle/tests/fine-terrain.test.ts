import { describe, expect, it } from "vitest";
import { fieldsAtPatch, terrainAtPatch } from "../src/world/fine-terrain";
import { PATCH_M, patchId } from "../src/world/spatial";

function runs<T>(values: T[]): number {
  return values.reduce((count, value, index) => count + Number(index === 0 || value !== values[index - 1]), 0);
}

describe("fine terrain", () => {
  it("is deterministic and changes smoothly over neighboring 50 m patches", () => {
    const a = fieldsAtPatch(21, patchId(6411, 1875));
    const b = fieldsAtPatch(21, patchId(6412, 1875));
    expect(fieldsAtPatch(21, patchId(6411, 1875))).toEqual(a);
    expect(Math.abs(a.elevationM - b.elevationM)).toBeLessThan(180);
  });

  it("produces compatible mixed terrain inside at least one 6 by 6 area", () => {
    let found = false;
    for (let py = 250; py < 340 && !found; py++) {
      for (let px = 1020; px < 1110 && !found; px++) {
        const kinds = new Set<string>();
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
          kinds.add(terrainAtPatch(21, patchId(px * 6 + x, py * 6 + y)));
        }
        found = kinds.size > 1;
      }
    }
    expect(found).toBe(true);
  });

  it("keeps coast, ridges, and terrain runs at kilometre-scale wavelengths", () => {
    const patches = Array.from({ length: 30_000 / PATCH_M }, (_, index) => patchId(4_400 + index, 4_200));
    const fields = patches.map((patch) => fieldsAtPatch(21, patch));
    const terrain = patches.map((patch) => terrainAtPatch(21, patch));
    const seaTransitions = fields.reduce((count, field, index) => count + Number(index > 0 && field.sea !== fields[index - 1].sea), 0);
    const ridgePeaks = fields
      .map((field, index) => ({ elevationM: field.elevationM, index }))
      .filter(({ elevationM }, index, values) => index > 0 && index < values.length - 1
        && elevationM > 700 && elevationM > values[index - 1].elevationM && elevationM >= values[index + 1].elevationM);
    const ridgePeakIntervalM = ridgePeaks.length < 2
      ? 30_000
      : (ridgePeaks.at(-1)!.index - ridgePeaks[0].index) * PATCH_M / (ridgePeaks.length - 1);

    expect(seaTransitions).toBeLessThan(16);
    expect(ridgePeakIntervalM).toBeGreaterThanOrEqual(100);
    expect(ridgePeakIntervalM).toBeLessThanOrEqual(6_000);
    expect(runs(terrain)).toBeGreaterThanOrEqual(3);
    expect(runs(terrain)).toBeLessThan(180);
  });
});
