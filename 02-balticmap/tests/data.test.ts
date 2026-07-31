import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "dainava", "eastern-aukstaitija", "galinda", "harjumaa", "jarvamaa",
  "jersika", "kursa", "laanemaa", "lietuva", "livzeme", "nadrawa",
  "notanga", "pamede", "pilsotas", "ravala", "saaremaa", "sakala",
  "selija", "semba", "suduva", "talava", "ugandi", "virumaa", "warmi",
  "zemaitija", "zemgale",
];

// Pinned to what the bake derives, so a neighbor cannot silently vanish the
// way SE and DK once did. DK is gone (off-canvas even on the wider frame);
// SE joined when the frame moved west and Gotland came into view.
const EXPECTED_NEIGHBOR_IDS = ["BY", "FI", "PL", "RU", "SE"];

const EXPECTED_PEOPLE_IDS = [
  "aukstaitians", "curonians", "estonians", "latgalians", "livs",
  "prussians", "samogitians", "selonians", "semigallians", "yotvingians",
];

const FACTION_TYPES = [
  "land", "island-lands", "united-lands", "principality",
  "chiefdom", "allied-lands",
];

describe("map.json (anno 1100)", () => {
  it("has canvas bounds, year, and attribution", () => {
    expect(data.width).toBe(1000);
    expect(data.height).toBe(1400);
    expect(data.margin).toBe(1200);
    expect(data.year).toBe(1100);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries; " +
        "Poland and Kaliningrad: geoBoundaries / OpenStreetMap contributors (ODbL); " +
        "rivers: Natural Earth",
    );
  });

  it("contains exactly the 26 lands, sorted by id", () => {
    expect(data.regions.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it("has exactly 10 peoples with names and hex colors", () => {
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

  it("has 26 factions in 1:1 correspondence with regions", () => {
    expect(data.factions.length).toBe(26);
    const factionIds = data.factions.map((f) => f.id);
    expect(new Set(factionIds).size).toBe(26);
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
    expect(colors.size).toBe(26);
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
      name: "Curonians", type: "united-lands",
      ethnicity: "curonians",
    });
    expect(region("lietuva")).toMatchObject({
      faction: "lietuva", population: 60000, cohesion: "medium",
    });
    expect(faction("lietuva").type).toBe("allied-lands");
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
    expect(faction("osilians")).toMatchObject({ type: "island-lands" });
    expect(region("saaremaa")).toMatchObject({ cohesion: "high" });
  });

  it("populations are 5k multiples totalling 820k", () => {
    let total = 0;
    for (const r of data.regions) {
      expect(Number.isInteger(r.population)).toBe(true);
      expect(r.population).toBeGreaterThan(0);
      expect(r.population % 5000).toBe(0);
      expect(["low", "medium", "high"]).toContain(r.cohesion);
      total += r.population;
    }
    expect(total).toBe(820000);
  });

  it("ravala holds the northwest coast and harjumaa is contiguous", () => {
    const region = (id: string) => data.regions.find((r) => r.id === id)!;
    expect(region("ravala").population).toBe(15000);
    expect(region("harjumaa").population).toBe(15000);
    const rings = region("harjumaa").path.split("M").filter(Boolean);
    const sorted = [...rings].sort((a, b) => b.length - a.length);
    for (const ring of sorted.slice(1)) {
      expect(ring.length).toBeLessThan(300);
    }
  });

  it("has the main rivers as path data", () => {
    const ids = data.rivers.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(ids.length).toBeLessThanOrEqual(13);
    expect(ids).toContain("daugava");
    expect(ids).toContain("nemunas");
    expect(ids).toContain("vistula");
    for (const r of data.rivers) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.major).toBe("boolean");
      expect(r.path.startsWith("M")).toBe(true);
    }
    const major = data.rivers.filter((r) => r.major).map((r) => r.id);
    expect(major.sort()).toEqual(["daugava", "nemunas", "vistula"]);
  });

  it("has neighbor geometry and the full label set inside bounds", () => {
    expect(data.neighbors.map((n) => n.id)).toEqual(EXPECTED_NEIGHBOR_IDS);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    const byKind = (k: string) =>
      data.labels.filter((l) => l.kind === k).map((l) => l.text);
    expect(byKind("river").sort()).toEqual(["Daugava", "Gauja", "Nemunas", "Venta"]);
    expect(byKind("people").sort()).toEqual([
      "AUKŠTAITIANS", "CURONIANS", "ESTONIANS", "LATGALIANS", "LIVS",
      "PRUSSIANS", "SAMOGITIANS", "SELONIANS", "SEMIGALLIANS", "YOTVINGIANS",
    ]);
    expect(byKind("people-minor")).toEqual([]);
    expect(byKind("title")).toEqual([]);
    expect(byKind("subtitle")).toEqual([]);
    expect(byKind("neighbor").length).toBeGreaterThanOrEqual(2);
    for (const l of data.labels) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(1000);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(1400);
    }
  });

  it("has 51 authored settlements, exactly one unlocked per land", () => {
    expect(data.settlements.length).toBe(51);
    const ids = data.settlements.map((s) => s.id);
    expect(new Set(ids).size).toBe(51);
    expect(ids).toEqual([...ids].sort());
    const landIds = new Set(data.regions.map((r) => r.id));
    const unlockedPerLand = new Map<string, number>();
    for (const s of data.settlements) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(20);
      expect(landIds.has(s.land)).toBe(true);
      expect(typeof s.unlocked).toBe("boolean");
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1000);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(1400);
      // Riga does not exist in 1100, and neither do the crusader foundations
      // or the modern names that a hand-typed place list invites. Twangste is
      // fine and deliberate: it is the Prussian site Konigsberg was later
      // built on, not the later town.
      for (const later of [
        "riga", "rīga", "konigsberg", "königsberg", "kaliningrad", "vilnius",
        "tallinn", "reval", "memel", "klaipėda", "marienburg", "malbork",
        "dorpat", "mitau", "goldingen",
      ]) {
        expect(s.name.toLowerCase()).not.toContain(later);
      }
      if (s.unlocked) {
        unlockedPerLand.set(s.land, (unlockedPerLand.get(s.land) ?? 0) + 1);
      }
    }
    expect(data.settlements.filter((s) => s.unlocked).length).toBe(26);
    for (const r of data.regions) {
      expect(unlockedPerLand.get(r.id)).toBe(1);
    }
    // Every land has exactly one locked next site for Found a settlement,
    // except Pilsotas: at 10,000 people it supports a single slot, so it has
    // no room for one (which is also why Apuole is gone).
    const locked = data.settlements.filter((s) => !s.unlocked);
    expect(locked.length).toBe(25);
    expect(new Set(locked.map((s) => s.land)).size).toBe(25);
    expect(locked.some((s) => s.land === "pilsotas")).toBe(false);
  });

  // The map once shipped 21 nameless dots - one per land with a spare slot,
  // generated by grid search and drawn with no label, so founding a settlement
  // put a hole on the map and a tooltip that began on its second line. Every
  // site is now a place with a name, and this is what says so.
  it("names every settlement - no site on the map is a nameless dot", () => {
    const placesOf = new Map(data.regions.map((r) => [r.id, r.places]));
    for (const s of data.settlements) {
      expect(s.name.trim()).not.toBe("");
      // The generated ids all ended in -growth. Locking the shape out keeps
      // the generator from creeping back in under a passing name check.
      expect(s.id).not.toMatch(/-growth$/);
      // The land's place list may name rivers and districts that are not
      // settlements, but it may not omit a settlement drawn inside that land.
      expect(placesOf.get(s.land)).toContain(s.name);
    }
    expect(new Set(data.settlements.map((s) => s.name)).size).toBe(51);
  });

  // Mirrors the pipeline's own guard on the baked output, with the geometry
  // map-render.ts draws: dots at r=3.5, labels centred at y + (labelDy ?? -7)
  // in 12px type. Runs over all 51 because any locked site can be revealed
  // mid-game, and a collision nobody sees until they play the card is still a
  // collision.
  it("keeps every settlement dot and label clear of every other", () => {
    const CHAR_W = 7.2, PAD = 2;
    const box = (s: (typeof data.settlements)[number]) => {
      const w = s.name.length * CHAR_W;
      const y = s.y + (s.labelDy ?? -7);
      return { x0: s.x - w / 2, x1: s.x + w / 2, y0: y - 9, y1: y + 3 };
    };
    for (let i = 0; i < data.settlements.length; i++) {
      for (let j = i + 1; j < data.settlements.length; j++) {
        const a = data.settlements[i], b = data.settlements[j];
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (gap < 7) {
          throw new Error(
            `${a.id} and ${b.id} are ${gap.toFixed(1)} px apart - their dots ` +
              `merge into one blob`,
          );
        }
        const [ba, bb] = [box(a), box(b)];
        const overlaps =
          ba.x0 - PAD < bb.x1 && bb.x0 - PAD < ba.x1 &&
          ba.y0 - PAD < bb.y1 && bb.y0 - PAD < ba.y1;
        if (overlaps) {
          throw new Error(`labels ${a.name} and ${b.name} overlap`);
        }
      }
    }
  });

  it("gives every land with a spare slot exactly one locked next site", () => {
    for (const r of data.regions) {
      const locked = data.settlements.filter(
        (s) => s.land === r.id && !s.unlocked,
      );
      expect(locked.length).toBe(r.maxSettlements > 1 ? 1 : 0);
    }
  });

  it("maxSettlements follows the population formula and bounds authored counts", () => {
    const authoredPerLand = new Map<string, number>();
    for (const s of data.settlements) {
      authoredPerLand.set(s.land, (authoredPerLand.get(s.land) ?? 0) + 1);
    }
    for (const r of data.regions) {
      const expected = Math.min(10, Math.max(1, Math.round(r.population / 10000)));
      expect(r.maxSettlements).toBe(expected);
      expect(authoredPerLand.get(r.id) ?? 0).toBeGreaterThanOrEqual(1);
      expect(authoredPerLand.get(r.id) ?? 0).toBeLessThanOrEqual(r.maxSettlements);
    }
    const region = (id: string) => data.regions.find((r) => r.id === id)!;
    expect(region("ravala").maxSettlements).toBe(2);
    expect(region("harjumaa").maxSettlements).toBe(2);
    expect(region("kursa").maxSettlements).toBe(5);
    expect(region("zemaitija").maxSettlements).toBe(7);
    expect(region("eastern-aukstaitija").maxSettlements).toBe(9);
  });

  it("adjacency is symmetric, non-self, sorted, and never empty", () => {
    const byId = new Map(data.regions.map((r) => [r.id, r]));
    for (const r of data.regions) {
      expect(r.adjacent.length).toBeGreaterThan(0);
      expect(r.adjacent).toEqual([...r.adjacent].sort());
      expect(new Set(r.adjacent).size).toBe(r.adjacent.length);
      for (const a of r.adjacent) {
        expect(a).not.toBe(r.id);
        expect(byId.has(a)).toBe(true);
        expect(byId.get(a)!.adjacent).toContain(r.id);
      }
    }
  });

  it("saaremaa connects by sea to laanemaa and kursa", () => {
    const saaremaa = data.regions.find((r) => r.id === "saaremaa")!;
    expect(saaremaa.adjacent).toContain("laanemaa");
    expect(saaremaa.adjacent).toContain("kursa");
  });

  it("known land borders are present", () => {
    const adj = (id: string) =>
      data.regions.find((r) => r.id === id)!.adjacent;
    expect(adj("harjumaa")).toContain("ravala");
    expect(adj("zemgale")).toContain("zemaitija");
    expect(adj("dainava")).toContain("suduva");
  });

  it("known non-adjacent pairs stay non-adjacent", () => {
    // Guards the point-sharing fallback: these pairs are geographically far
    // apart and must never be linked, even if a future cache refresh
    // perturbs vertex data enough to trip a coincidental shared point.
    const adj = (id: string) =>
      data.regions.find((r) => r.id === id)!.adjacent;
    const NON_ADJACENT_PAIRS: [string, string][] = [
      ["ravala", "dainava"],
      ["saaremaa", "lietuva"],
      ["virumaa", "zemgale"],
      ["harjumaa", "suduva"],
      ["kursa", "ugandi"],
      ["pilsotas", "virumaa"],
    ];
    for (const [a, b] of NON_ADJACENT_PAIRS) {
      expect(adj(a)).not.toContain(b);
      expect(adj(b)).not.toContain(a);
    }
  });
});
