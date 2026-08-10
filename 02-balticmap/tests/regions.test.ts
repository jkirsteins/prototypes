import { statSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import {
  REGIONS, DEFAULT_REGION, activeRegion, setActiveRegion,
} from "../src/regions";
import { loadRegionPref, saveRegionPref, REGION_PREF_KEY, memoryStorage } from "../src/meta";
import { viewBoundsOf } from "../src/view";

afterEach(() => setActiveRegion(DEFAULT_REGION));

describe("region registry", () => {
  it("defaults to the baltic region", () => {
    expect(DEFAULT_REGION).toBe("baltic");
    expect(activeRegion().id).toBe("baltic");
    expect(activeRegion().map.regions.length).toBe(26);
  });

  it("every region is self-consistent", () => {
    for (const region of Object.values(REGIONS)) {
      expect(region.name.length).toBeGreaterThan(0);
      expect(region.era).toMatch(/c\. \d+/);
      expect(region.blurb.length).toBeGreaterThan(40);
      const factionIds = new Set(region.map.factions.map((f) => f.id));
      const peopleIds = new Set(region.map.peoples.map((p) => p.id));
      // Setup must never start near exhaustion, on any region's own map: a
      // pool holds at least twice as many names as its people has factions.
      const counts = new Map<string, number>();
      for (const f of region.map.factions) {
        counts.set(f.ethnicity, (counts.get(f.ethnicity) ?? 0) + 1);
      }
      // Ruler pools cover every people of the map.
      for (const p of peopleIds) {
        expect(region.rulerNames[p], `${region.id} pool for ${p}`).toBeDefined();
        expect(region.rulerNames[p].length).toBeGreaterThanOrEqual(10);
      }
      for (const [ethnicity, count] of counts) {
        expect(
          region.rulerNames[ethnicity].length,
          `${region.id} pool for ${ethnicity}`,
        ).toBeGreaterThanOrEqual(count * 2);
      }
      // Passive placements name real factions.
      for (const id of Object.keys(region.terrainEligibility)) {
        expect(factionIds.has(id), `${region.id} terrain on ${id}`).toBe(true);
      }
      for (const id of region.bureaucracyLands) {
        expect(factionIds.has(id), `${region.id} burden on ${id}`).toBe(true);
      }
      expect(region.bureaucracyLands.length).toBe(3);

      // Every region is reachable at both ends of the zoom.
      const b = viewBoundsOf(region.map, 1440, 749);
      expect(b.home.x <= 0 && b.home.y <= 0, `${region.id} opens whole`).toBe(true);
      expect(b.home.x + b.home.w >= region.map.width).toBe(true);
      expect(b.home.y + b.home.h >= region.map.height).toBe(true);
      // The default view is the whole canvas plus a ring of surrounding
      // ground (DEFAULT_RING), not just the canvas exactly fit - a ring of
      // zero would still satisfy the containment checks above, so this pins
      // the ring itself: real margin on every side, both axes.
      expect(b.home.x, `${region.id} ring on the west`).toBeLessThan(0);
      expect(b.home.y, `${region.id} ring on the north`).toBeLessThan(0);
      expect(b.home.x + b.home.w, `${region.id} ring on the east`)
        .toBeGreaterThan(region.map.width);
      expect(b.home.y + b.home.h, `${region.id} ring on the south`)
        .toBeGreaterThan(region.map.height);
      const oldWidest = Math.max(region.map.width, region.map.height / (749 / 1440)) / 1.3;
      expect(b.maxW / oldWidest, `${region.id} zooms out 2x`).toBeGreaterThanOrEqual(2);

      // The map never goes wordless at the floor.
      const group = region.map.labels.filter((l) => l.kind === "group");
      expect(group.length, `${region.id} group labels`).toBeGreaterThanOrEqual(2);

      // Every label sits on painted ground.
      const m = region.map.margin;
      expect(m).toBe(2000);
      for (const l of region.map.labels) {
        expect(l.x).toBeGreaterThanOrEqual(-m);
        expect(l.x).toBeLessThanOrEqual(region.map.width + m);
        expect(l.y).toBeGreaterThanOrEqual(-m);
        expect(l.y).toBeLessThanOrEqual(region.map.height + m);
      }
      // A settlement outside the canvas is a site nobody can reach.
      for (const s of region.map.settlements) {
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(region.map.width);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(region.map.height);
      }
    }
  });

  it("no region's map data creeps past the bundle budget", () => {
    for (const file of ["baltic", "iberia"]) {
      const bytes = statSync(`src/data/${file}.json`).size;
      expect(bytes, `${file}.json is ${(bytes / 1e6).toFixed(2)} MB`)
        .toBeLessThan(2.5e6);
    }
  });

  it("setActiveRegion switches what activeRegion answers", () => {
    setActiveRegion("iberia");
    expect(activeRegion().id).toBe("iberia");
    expect(activeRegion().map.regions.length).toBe(24);
  });
});

describe("region preference", () => {
  it("round-trips and defaults", () => {
    const storage = memoryStorage();
    expect(loadRegionPref(storage)).toBe("baltic");
    saveRegionPref(storage, "baltic");
    expect(loadRegionPref(storage)).toBe("baltic");
  });

  it("falls back to the default on an unknown stored value", () => {
    const storage = memoryStorage();
    storage.setItem(REGION_PREF_KEY, "atlantis");
    expect(loadRegionPref(storage)).toBe("baltic");
  });
});
