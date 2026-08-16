import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/iberia.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "alava", "algarve", "aragon", "asturias", "badajoz", "balearics",
  "barcelona", "bobastro", "castile", "cordoba", "elvira", "galicia",
  "leon", "lisbon", "merida", "pallars", "pamplona", "seville",
  "sobrarbe", "todmir", "toledo", "upper-march", "urgell", "valencia",
];

// Pinned to what the bake derives, so a neighbor cannot silently vanish or
// reappear unnoticed: DZ, TN and IT are the Maghreb coast the emirate looked
// across, and Sardinia, alongside FR (which now also carries Corsica) and MA.
// CH and DE close the northeast corner that used to fall past France's own
// polygon and show through as a phantom sea; both are measured against
// NEIGHBOR_CLIP_RING, same as the Baltic bake's tighter neighbour set.
const EXPECTED_NEIGHBOR_IDS = ["CH", "DE", "DZ", "FR", "IT", "MA", "TN"];

const EXPECTED_PEOPLE_IDS = [
  "arabs", "asturleonese", "basques", "berbers", "castilians",
  "catalans", "galicians", "muwallads",
];

const FACTION_TYPES = [
  "land", "island-lands", "united-lands", "principality",
  "chiefdom", "allied-lands",
];

// Names no map of 895 may carry: Nasrid, Habsburg and British foundations.
// A lowercase substring blocklist, so "El Escorial" falls to "escorial".
const POST_ERA_NAMES = ["alhambra", "escorial", "el escorial", "gibraltar"];

describe("iberia.json (anno 895)", () => {
  it("has canvas bounds, year, and attribution", () => {
    expect(data.width).toBe(1400);
    expect(data.height).toBe(1150);
    expect(data.margin).toBe(2000);
    expect(data.year).toBe(895);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries; " +
        "rivers: Natural Earth",
    );
  });

  it("contains exactly the 24 lands, sorted by id", () => {
    expect(data.regions.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it("has exactly 8 peoples with names and hex colors", () => {
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

  it("has 24 factions in 1:1 correspondence with regions", () => {
    expect(data.factions.length).toBe(24);
    const factionIds = data.factions.map((f) => f.id);
    expect(new Set(factionIds).size).toBe(24);
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
    expect(colors.size).toBe(24);
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
    expect(region("cordoba").faction).toBe("umayyads");
    expect(faction("umayyads")).toMatchObject({
      name: "Umayyads", type: "principality", ethnicity: "arabs",
    });
    expect(faction("umayyads").placeName).toBeUndefined();
    expect(faction("asturians").type).toBe("principality");
    expect(faction("pamplonese").type).toBe("principality");
    expect(faction("barcelonans").type).toBe("united-lands");
    expect(faction("banu-qasi").type).toBe("united-lands");
    expect(faction("sevillans").type).toBe("united-lands");
    expect(faction("hafsunids").type).toBe("chiefdom");
    expect(faction("balearians").type).toBe("island-lands");
    expect(region("aragon").peoples[0]).toBe("catalans");
    expect(region("balearics").peoples[0]).toBe("berbers");
    expect(region("upper-march").faction).toBe("banu-qasi");
    expect(region("badajoz").faction).toBe("banu-marwan");
  });

  it("populations are positive 5k multiples within 10k..90k", () => {
    for (const r of data.regions) {
      expect(Number.isInteger(r.population)).toBe(true);
      expect(r.population % 5000).toBe(0);
      expect(r.population).toBeGreaterThanOrEqual(10000);
      expect(r.population).toBeLessThanOrEqual(90000);
      expect(["low", "medium", "high"]).toContain(r.cohesion);
    }
  });

  it("cordoba, seville and toledo are the three largest by population", () => {
    const sorted = [...data.regions].sort((a, b) => b.population - a.population);
    expect(sorted.slice(0, 3).map((r) => r.id).sort()).toEqual(
      ["cordoba", "seville", "toledo"],
    );
    // A strict gap to fourth place, so bureaucracyLands is unambiguous.
    expect(sorted[2].population).toBeGreaterThan(sorted[3].population);
  });

  it("maxSettlements follows the population formula", () => {
    for (const r of data.regions) {
      const expected = Math.min(10, Math.max(2, Math.round(r.population / 10000)));
      expect(r.maxSettlements).toBe(expected);
    }
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

  it("balearics connects by sea to valencia and todmir", () => {
    const balearics = data.regions.find((r) => r.id === "balearics")!;
    expect(balearics.adjacent).toContain("valencia");
    expect(balearics.adjacent).toContain("todmir");
  });

  it("known land borders are present", () => {
    const adj = (id: string) =>
      data.regions.find((r) => r.id === id)!.adjacent;
    expect(adj("asturias")).toContain("galicia");
    expect(adj("cordoba")).toContain("seville");
    expect(adj("aragon")).toContain("sobrarbe");
    expect(adj("urgell")).toContain("pallars");
    expect(adj("leon")).toContain("castile");
  });

  it("known non-adjacent pairs stay non-adjacent", () => {
    const adj = (id: string) =>
      data.regions.find((r) => r.id === id)!.adjacent;
    const NON_ADJACENT_PAIRS: [string, string][] = [
      ["galicia", "seville"],
      ["asturias", "cordoba"],
      ["pamplona", "elvira"],
      ["barcelona", "lisbon"],
      ["algarve", "pallars"],
    ];
    for (const [a, b] of NON_ADJACENT_PAIRS) {
      expect(adj(a)).not.toContain(b);
      expect(adj(b)).not.toContain(a);
    }
  });

  it("has the six rivers with douro, ebro and guadalquivir major", () => {
    const ids = data.rivers.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain("douro");
    expect(ids).toContain("ebro");
    expect(ids).toContain("guadalquivir");
    for (const r of data.rivers) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.major).toBe("boolean");
      expect(r.path.startsWith("M")).toBe(true);
    }
    const major = data.rivers.filter((r) => r.major).map((r) => r.id);
    expect(major.sort()).toEqual(["douro", "ebro", "guadalquivir"]);
  });

  it("has neighbor geometry and the full label set inside bounds", () => {
    expect(data.neighbors.map((n) => n.id)).toEqual(EXPECTED_NEIGHBOR_IDS);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    const byKind = (k: string) =>
      data.labels.filter((l) => l.kind === k).map((l) => l.text);
    expect(byKind("river").sort()).toEqual(["Douro", "Ebro", "Guadalquivir"]);
    expect(byKind("people").sort()).toEqual([
      "ARABS", "ASTURLEONESE", "BASQUES", "BERBERS", "CASTILIANS",
      "CATALANS", "GALICIANS", "MUWALLADS",
    ]);
    expect(byKind("neighbor").sort()).toEqual(["FRANCIA", "MAGHREB"]);
    // Labels take the painted rect, not the canvas: a `group` label naming
    // Francia or the Maghreb sits out in the surrounding geography by
    // design, and the painted rect (canvas plus margin) is what a pan can
    // ever reach.
    for (const l of data.labels) {
      expect(l.x).toBeGreaterThan(-data.margin);
      expect(l.x).toBeLessThan(data.width + data.margin);
      expect(l.y).toBeGreaterThan(-data.margin);
      expect(l.y).toBeLessThan(data.height + data.margin);
    }
  });

  it("names the ground beyond the lands, for the zoomed-out view", () => {
    const group = data.labels.filter((l) => l.kind === "group").map((l) => l.text);
    expect(group).toContain("THE CHRISTIAN NORTH");
    expect(group).toContain("AL-ANDALUS");
    expect(group).toContain("FRANCIA");
    expect(group).toContain("THE MAGHREB");
  });

  it("carries the surrounding countries, not only the bordering ones", () => {
    const ids = data.neighbors.map((n) => n.id);
    for (const id of ["FR", "MA", "DZ", "TN", "IT"]) {
      expect(ids, `neighbor ${id}`).toContain(id);
    }
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
  });

  it("has settlements: one unlocked per land, locked fill the slots", () => {
    const ids = data.settlements.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    const landIds = new Set(data.regions.map((r) => r.id));
    for (const s of data.settlements) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(20);
      expect(landIds.has(s.land)).toBe(true);
      expect(typeof s.unlocked).toBe("boolean");
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1400);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(1150);
      for (const later of POST_ERA_NAMES) {
        expect(s.name.toLowerCase()).not.toContain(later);
      }
    }
    expect(data.settlements.filter((s) => s.unlocked).length).toBe(24);
    for (const r of data.regions) {
      const mine = data.settlements.filter((s) => s.land === r.id);
      const locked = mine.filter((s) => !s.unlocked);
      expect(mine.filter((s) => s.unlocked).length, `unlocked in ${r.id}`).toBe(1);
      expect(mine.length, `authored in ${r.id}`).toBe(r.maxSettlements);
      expect(locked.length, `buildable in ${r.id}`).toBe(r.maxSettlements - 1);
      expect(locked.length, `${r.id} must be buildable`).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(data.settlements.map((s) => s.name)).size).toBe(
      data.settlements.length,
    );
  });

  it("names every settlement in its land's places", () => {
    const placesOf = new Map(data.regions.map((r) => [r.id, r.places]));
    for (const s of data.settlements) {
      expect(s.name.trim()).not.toBe("");
      expect(placesOf.get(s.land)).toContain(s.name);
    }
  });

  // Mirrors the pipeline's own guard on the baked output, with the geometry
  // map-render.ts draws: dots at r=3.5, labels centred at y + (labelDy ?? -7)
  // in 12px type. Runs over locked sites too: any of them can be revealed
  // mid-game by Found a settlement.
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
});
