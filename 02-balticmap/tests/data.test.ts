import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "dainava", "eastern-aukstaitija", "harjumaa", "jarvamaa", "jersika",
  "kursa", "laanemaa", "lietuva", "livzeme", "pilsotas", "ravala",
  "saaremaa", "sakala", "selija", "suduva", "talava", "ugandi",
  "virumaa", "zemaitija", "zemgale",
];

const EXPECTED_PEOPLE_IDS = [
  "aukstaitians", "curonians", "estonians", "latgalians", "livs",
  "samogitians", "selonians", "semigallians", "yotvingians",
];

const FACTION_TYPES = [
  "county", "island-league", "regional-confederacy", "principality",
  "chiefdom", "land-coalition",
];

describe("map.json (anno 1100)", () => {
  it("has canvas bounds, year, and attribution", () => {
    expect(data.width).toBe(1000);
    expect(data.height).toBe(1400);
    expect(data.year).toBe(1100);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries",
    );
  });

  it("contains exactly the 20 lands, sorted by id", () => {
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

  it("uses native names with diacritics where the spec requires", () => {
    const byId = new Map(data.regions.map((r) => [r.id, r.name]));
    expect(byId.get("ravala")).toBe("Rävala");
    expect(byId.get("laanemaa")).toBe("Läänemaa");
    expect(byId.get("jarvamaa")).toBe("Järvamaa");
    expect(byId.get("selija")).toBe("Sēlija");
    expect(byId.get("talava")).toBe("Tālava");
    expect(byId.get("zemaitija")).toBe("Žemaitija");
    expect(byId.get("suduva")).toBe("Sūduva");
    expect(byId.get("livzeme")).toBe("Līvzeme");
    expect(byId.get("eastern-aukstaitija")).toBe("Eastern Aukštaitija");
  });

  it("has 20 factions in 1:1 correspondence with regions", () => {
    expect(data.factions.length).toBe(20);
    const factionIds = data.factions.map((f) => f.id);
    expect(new Set(factionIds).size).toBe(20);
    const used = data.regions.map((r) => r.faction).sort();
    expect(used).toEqual([...factionIds].sort());
  });

  it("faction ethnicity matches its region's primary people", () => {
    const byId = new Map(data.factions.map((f) => [f.id, f]));
    for (const r of data.regions) {
      const f = byId.get(r.faction)!;
      expect(f).toBeDefined();
      expect(f.ethnicity).toBe(r.peoples[0]);
    }
  });

  it("faction types are valid and colors are unique hex", () => {
    const colors = new Set<string>();
    for (const f of data.factions) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(FACTION_TYPES).toContain(f.type);
      expect(f.color).toMatch(/^#[0-9a-f]{6}$/);
      colors.add(f.color);
    }
    expect(colors.size).toBe(20);
  });

  it("single-faction ethnicities keep the people color exactly", () => {
    const peopleColor = new Map(data.peoples.map((p) => [p.id, p.color]));
    const byEthnicity = new Map<string, typeof data.factions>();
    for (const f of data.factions) {
      const arr = byEthnicity.get(f.ethnicity) ?? [];
      arr.push(f);
      byEthnicity.set(f.ethnicity, arr);
    }
    for (const [eth, factions] of byEthnicity) {
      if (factions.length === 1) {
        expect(factions[0].color).toBe(peopleColor.get(eth));
      }
    }
  });

  it("roster spot checks match the spec", () => {
    const region = (id: string) => data.regions.find((r) => r.id === id)!;
    const faction = (id: string) => data.factions.find((f) => f.id === id)!;
    expect(region("kursa")).toMatchObject({
      faction: "curonian-confederacy", population: 45000, cohesion: "high",
    });
    expect(faction("curonian-confederacy")).toMatchObject({
      name: "Curonian Confederacy", type: "regional-confederacy",
      ethnicity: "curonians",
    });
    expect(region("lietuva")).toMatchObject({
      faction: "lietuva", population: 60000, cohesion: "medium",
    });
    expect(faction("lietuva").type).toBe("land-coalition");
    expect(region("eastern-aukstaitija")).toMatchObject({
      faction: "eastern-aukstaitian-confederacy",
      population: 90000, cohesion: "low",
    });
    expect(region("selija")).toMatchObject({
      faction: "selonians", population: 15000, cohesion: "low",
    });
    expect(region("selija").peoples).toEqual(["selonians"]);
    expect(region("zemgale").peoples).toEqual(["semigallians"]);
    expect(region("talava").peoples).toEqual(["latgalians", "livs"]);
    expect(faction("osilians")).toMatchObject({ type: "island-league" });
    expect(region("saaremaa")).toMatchObject({ cohesion: "high" });
  });

  it("populations are 5k multiples totalling 650k", () => {
    let total = 0;
    for (const r of data.regions) {
      expect(Number.isInteger(r.population)).toBe(true);
      expect(r.population).toBeGreaterThan(0);
      expect(r.population % 5000).toBe(0);
      expect(["low", "medium", "high"]).toContain(r.cohesion);
      total += r.population;
    }
    expect(total).toBe(650000);
  });

  it("has neighbor geometry and the full label set inside bounds", () => {
    expect(data.neighbors.length).toBeGreaterThanOrEqual(3);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    const byKind = (k: string) =>
      data.labels.filter((l) => l.kind === k).map((l) => l.text);
    expect(byKind("people").sort()).toEqual([
      "AUKŠTAITIANS", "CURONIANS", "ESTONIANS", "LATGALIANS", "LIVS",
      "SAMOGITIANS", "SELONIANS", "SEMIGALLIANS", "YOTVINGIANS",
    ]);
    expect(byKind("people-minor")).toEqual([]);
    expect(byKind("title")).toEqual(["Anno Domini 1100"]);
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
