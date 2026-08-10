import { describe, it, expect, afterEach } from "vitest";
import {
  REGIONS, DEFAULT_REGION, activeRegion, setActiveRegion,
} from "../src/regions";
import { loadRegionPref, saveRegionPref, REGION_PREF_KEY, memoryStorage } from "../src/meta";

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
      // Ruler pools cover every people of the map.
      for (const p of peopleIds) {
        expect(region.rulerNames[p], `${region.id} pool for ${p}`).toBeDefined();
        expect(region.rulerNames[p].length).toBeGreaterThanOrEqual(10);
      }
      // Passive placements name real factions.
      for (const id of Object.keys(region.terrainEligibility)) {
        expect(factionIds.has(id), `${region.id} terrain on ${id}`).toBe(true);
      }
      for (const id of region.bureaucracyLands) {
        expect(factionIds.has(id), `${region.id} burden on ${id}`).toBe(true);
      }
      expect(region.bureaucracyLands.length).toBe(3);
    }
  });

  it("setActiveRegion switches what activeRegion answers", () => {
    setActiveRegion("baltic");
    expect(activeRegion().id).toBe("baltic");
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
