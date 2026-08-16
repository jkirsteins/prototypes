import { statSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import {
  REGIONS, DEFAULT_REGION, activeRegion, setActiveRegion,
} from "../src/regions";
import { loadRegionPref, saveRegionPref, REGION_PREF_KEY, memoryStorage } from "../src/meta";
import { viewBoundsOf } from "../src/view";
import {
  chooseBuild, QUIET_LANDS, newGame, pickFaction, startGame, type GameState,
} from "../src/game";
import { fullRealmOf, isUnheld } from "../src/relations";
import {
  hasPassive, passivesOn, playsTurns, QUIET_PASSIVES,
} from "../src/passives";
import { hasRuler } from "../src/rulers";
import { seededRng } from "../src/sim";

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

      // The realms a region opens with. Every id names a real faction; no
      // land is held two ways at once; and no HOLDER is itself held - one
      // level only, because a seeded grand-vassal would make the realm root
      // ambiguous on a screen where nobody has taken anything yet.
      const realms = region.startingRealms;
      if (realms !== undefined) {
        const seen = new Set<string>();
        const tables: [string, Readonly<Record<string, string>>][] = [
          ["vassal", realms.vassals], ["incorporated", realms.incorporated],
        ];
        for (const [kind, table] of tables) {
          for (const [land, holder] of Object.entries(table)) {
            const where = `${region.id} ${kind} ${land}`;
            expect(factionIds.has(land), where).toBe(true);
            expect(factionIds.has(holder), `${where} -> ${holder}`).toBe(true);
            expect(land, `${where} holds itself`).not.toBe(holder);
            expect(seen.has(land), `${where} held twice`).toBe(false);
            seen.add(land);
          }
        }
        for (const holder of [
          ...Object.values(realms.vassals),
          ...Object.values(realms.incorporated),
        ]) {
          expect(
            seen.has(holder), `${region.id} holder ${holder} is itself held`,
          ).toBe(false);
        }
      }

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

/** A region may open with realms already standing. What a seeded land IS, is a
 *  land taken mid-game: an entry in one of the two stores and nothing else. So
 *  every assertion here is a consequence of that one fact rather than a rule of
 *  its own - which is what these lock in. */
describe("a region that opens with realms", () => {
  const dealIberia = (seed: number, pick: string): GameState => {
    setActiveRegion("iberia");
    const rng = seededRng(seed);
    const fresh = newGame(REGIONS.iberia.map.factions.map((f) => f.id));
    return pickFaction(chooseBuild(startGame(fresh), "warpath", rng), pick, rng);
  };
  const heldLands = (g: GameState): string[] =>
    g.factionIds.filter((f) => !isUnheld(f, g.overlords, g.incorporated));

  it("seeds Iberia's nine held lands and nothing else", () => {
    setActiveRegion("iberia");
    const g = newGame(REGIONS.iberia.map.factions.map((f) => f.id));
    expect([...g.overlords.entries()].sort()).toEqual([
      ["alavese", "asturians"],
      ["aragonese", "pamplonese"],
      ["castilians-of-burgos", "asturians"],
      ["elvirans", "umayyads"],
      ["galicians-of-iria", "asturians"],
      ["lisbonese", "banu-marwan"],
    ]);
    expect(g.incorporated).toEqual({
      "leonese": "asturians",
      "meridans": "banu-marwan",
      "urgellians": "barcelonans",
    });
    // Oviedo's four counties under one crown, which is the whole point of the
    // table - and `fullRealmOf` is what the win condition will count, so it
    // is what this asserts.
    expect(fullRealmOf("asturians", g.overlords, g.incorporated).size).toBe(5);
  });

  it("leaves a region that declares no realms untouched", () => {
    const g = newGame(REGIONS.baltic.map.factions.map((f) => f.id));
    expect(g.overlords.size).toBe(0);
    expect(g.incorporated).toEqual({});
  });

  it("gives a held land no quiet set, so it raids nobody", () => {
    const g = dealIberia(7, "toledans");
    for (const land of heldLands(g)) {
      for (const id of QUIET_PASSIVES) {
        expect(hasPassive(g.passives, land, id), `${land} ${id}`).toBe(false);
      }
    }
    // The free lands that keep to themselves are exactly the quiet draw: a
    // held land is not one of them, which is what the loop above asserts, and
    // every other free land now has a chief.
    const quiet = g.factionIds.filter((f) => !playsTurns(g.passives, f));
    expect(quiet).toHaveLength(QUIET_LANDS);
  });

  it("offers a seat to no land inside a realm", () => {
    // Who ACTS is `hasRuler`, not `playsTurns`: the quiet status is only one of
    // the three questions `takesNoTurn` asks, and a held land carries it no
    // more than a land taken mid-game does. The vacant chair is what stops it.
    //
    // Several seeds, because the acting draw is a shuffle: one seed passing
    // says nothing about whether the pool was filtered or merely lucky.
    for (const seed of [1, 2, 3, 7, 11]) {
      const g = dealIberia(seed, "toledans");
      const acting = g.factionIds.filter((f) => hasRuler(g.rulers, f));
      // Every free land less the quiet draw: a realm's members are not
      // seatable, so a region that opens with realms seats fewer than a bare
      // one of the same size.
      const free = g.factionIds.filter((f) => !heldLands(g).includes(f));
      expect(acting, `seed ${seed}`).toHaveLength(free.length - QUIET_LANDS);
      for (const land of acting) {
        expect(heldLands(g), `seat ${land} on seed ${seed}`).not.toContain(land);
      }
    }
  });

  it("refuses a pick on a land already sworn to a realm", () => {
    setActiveRegion("iberia");
    const ids = REGIONS.iberia.map.factions.map((f) => f.id);
    // A vassal and an annexation both. The annexation is the one that mattered
    // most: `endingFor` reads a human faction's own `incorporated` entry as
    // defeat, so a pick that landed would have ended the run on the click.
    for (const land of ["alavese", "leonese"]) {
      const rng = seededRng(3);
      const ready = chooseBuild(startGame(newGame(ids)), "warpath", rng);
      const g = pickFaction(ready, land, rng);
      expect(g.phase, land).toBe("pick-faction");
      expect(g.players, land).toHaveLength(0);
    }
    // A realm's root is still a perfectly good seat.
    const rng = seededRng(3);
    const ready = chooseBuild(startGame(newGame(ids)), "warpath", rng);
    expect(pickFaction(ready, "asturians", rng).phase).toBe("playing");
  });

  it("leaves a held land the ground it stands on", () => {
    // Terrain is `strippedOnCapture: false` - it describes the ground, not who
    // holds it - so a land inside a realm keeps whatever the roll gave it. The
    // ground is rolled at `chooseBuild`, before anyone has picked, and this
    // pins that the deal that follows adds nothing to a held land and takes
    // nothing off it. Alava (hill country) and Leon (a Douro river land) are
    // both eligible and both held, so the roll has something to survive.
    setActiveRegion("iberia");
    expect(REGIONS.iberia.terrainEligibility.alavese).toContain("hill-country");
    expect(REGIONS.iberia.terrainEligibility.leonese).toContain("river-trade");
    const ids = REGIONS.iberia.map.factions.map((f) => f.id);
    const rng = seededRng(7);
    const ground = chooseBuild(startGame(newGame(ids)), "warpath", rng);
    const g = pickFaction(ground, "toledans", rng);
    for (const land of heldLands(g)) {
      expect(passivesOn(g.passives, land), land)
        .toEqual(passivesOn(ground.passives, land));
    }
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
