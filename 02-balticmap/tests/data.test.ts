import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "aukstaitija", "dainava", "jarvamaa", "jersika", "kursa",
  "laanemaa-saaremaa", "livzeme", "pilsotas", "ravala", "suduva",
  "talava", "ugandi-sakala", "virumaa", "zemaitija", "zemgale-selija",
];

const EXPECTED_PEOPLE_IDS = [
  "aukstaitians", "curonians", "estonians", "latgalians", "livs",
  "samogitians", "selonians", "semigallians", "yotvingians",
];

describe("map.json (anno 1184)", () => {
  it("has canvas bounds, year, and attribution", () => {
    expect(data.width).toBe(1000);
    expect(data.height).toBe(1400);
    expect(data.year).toBe(1184);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries",
    );
  });

  it("contains exactly the 15 lands, sorted by id", () => {
    expect(data.regions.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it("has exactly 9 peoples with names and hex colors", () => {
    expect(data.peoples.map((p) => p.id).sort()).toEqual(EXPECTED_PEOPLE_IDS);
    for (const p of data.peoples) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("every region resolves peoples, has flavor, places, and path data", () => {
    const peopleIds = new Set(data.peoples.map((p) => p.id));
    for (const r of data.regions) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.peoples.length).toBeGreaterThan(0);
      for (const pid of r.peoples) expect(peopleIds.has(pid)).toBe(true);
      expect(r.flavor.length).toBeGreaterThan(20);
      expect(r.places.length).toBeGreaterThan(0);
      expect(r.path.startsWith("M")).toBe(true);
    }
  });

  it("uses compound names and diacritics where the spec requires", () => {
    const byId = new Map(data.regions.map((r) => [r.id, r.name]));
    expect(byId.get("laanemaa-saaremaa")).toBe("Läänemaa-Saaremaa");
    expect(byId.get("ugandi-sakala")).toBe("Ugandi-Sakala");
    expect(byId.get("zemgale-selija")).toBe("Zemgale-Sēlija");
    expect(byId.get("talava")).toBe("Tālava");
    expect(byId.get("zemaitija")).toBe("Žemaitija");
    expect(byId.get("suduva")).toBe("Sūduva");
    expect(byId.get("jersika")).toBe("Jersika");
    expect(byId.get("livzeme")).toBe("Līvzeme");
  });

  it("zemgale-selija carries both Semigallians and Selonians", () => {
    const z = data.regions.find((r) => r.id === "zemgale-selija")!;
    expect(z.peoples).toEqual(["semigallians", "selonians"]);
  });

  it("has neighbor geometry and the full label set inside bounds", () => {
    expect(data.neighbors.length).toBeGreaterThanOrEqual(3);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    const byKind = (k: string) =>
      data.labels.filter((l) => l.kind === k).map((l) => l.text);
    expect(byKind("people").sort()).toEqual([
      "AUKŠTAITIANS", "CURONIANS", "ESTONIANS", "LATGALIANS", "LIVS",
      "SAMOGITIANS", "SEMIGALLIANS", "YOTVINGIANS",
    ]);
    expect(byKind("people-minor")).toEqual(["SELONIANS"]);
    expect(byKind("title")).toEqual(["Anno Domini 1184"]);
    expect(byKind("subtitle")).toEqual(["the lands of the eastern Baltic"]);
    expect(byKind("neighbor").length).toBeGreaterThanOrEqual(2);
    for (const l of data.labels) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(1000);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(1400);
    }
  });
});
