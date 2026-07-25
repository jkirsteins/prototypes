import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "EE001", "EE004", "EE006", "EE007", "EE008",
  "LT001", "LT002", "LT003", "LT004", "LT005",
  "LT006", "LT007", "LT008", "LT009", "LT00A",
  "LV003", "LV005", "LV006", "LV007", "LV008", "LV009",
];

describe("map.json", () => {
  it("has canvas bounds and attribution", () => {
    expect(data.width).toBe(1000);
    expect(data.height).toBe(1400);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries",
    );
  });

  it("contains exactly the 21 NUTS-3 regions, sorted by id", () => {
    expect(data.regions.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it("every region has a name, a country matching its id, and path data", () => {
    for (const r of data.regions) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.country).toBe(r.id.slice(0, 2));
      expect(r.path.startsWith("M")).toBe(true);
    }
  });

  it("has neighbor geometry and three country labels inside bounds", () => {
    expect(data.neighbors.length).toBeGreaterThanOrEqual(4);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    expect(data.labels.map((l) => l.text).sort()).toEqual([
      "ESTONIA", "LATVIA", "LITHUANIA",
    ]);
    for (const l of data.labels) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(1000);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(1400);
    }
  });
});
