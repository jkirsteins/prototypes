import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { dailyAnimals, densityLabel, popOf, seasonalCapacity } from "../src/sim/animals";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { isVoiceOnly, SPECIES_DEFS, SPECIES_IDS, type Species } from "../src/sim/species";
import { fillPopulations, regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { generateWorld, regionAt, type World } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { ICE_THIN_CM } from "../src/sim/weather";
import type { GameState } from "../src/sim/types";

describe("animals", () => {
  it("labels density in words", () => {
    expect(densityLabel(0)).toBe("none");
    expect(densityLabel(0.1)).toBe("tracks");
    expect(densityLabel(0.3)).toBe("few");
    expect(densityLabel(0.5)).toBe("some");
    expect(densityLabel(0.9)).toBe("many");
  });

  it("conserves land animals under migration and grows toward capacity in summer", () => {
    const { state, world } = newGame(5);
    const rng = new Rng(1);
    const total = (s: Species) => Object.values(state.regions).reduce((a, r) => a + popOf(r, s), 0);
    // Touch the neighbours so there is somewhere to migrate to.
    for (const nb of regionAt(world, state.player.region).neighbours) regionState(state, world, nb.id);
    const before = total("hare");
    const beforeDeer = total("deer");
    // Skip growth by doing one day in November.
    dailyAnimals(state, world, calendar(1440 * 220), rng);
    expect(total("hare")).toBeCloseTo(before, 6);
    expect(total("deer")).toBeCloseTo(beforeDeer, 6);
    // A summer day grows.
    const summerBefore = total("hare");
    dailyAnimals(state, world, calendar(1440 * 90), rng);
    expect(total("hare")).toBeGreaterThan(summerBefore);
  });

  it("never exceeds capacity by much and thins deer in winter", () => {
    const { state, world } = newGame(5);
    const rng = new Rng(2);
    for (let d = 0; d < 120; d++) dailyAnimals(state, world, calendar(1440 * d), rng);
    for (const id of Object.keys(state.regions).map(Number)) {
      const r = regionAt(world, id);
      for (const s of SPECIES_IDS) expect(popOf(regionState(state, world, id), s)).toBeLessThanOrEqual((r.capacity[s] ?? 0) * 1.05 + 1);
    }
    const sumDeer = () => Object.values(state.regions).reduce((a, r) => a + popOf(r, "deer"), 0);
    const deerBefore = sumDeer();
    for (let d = 260; d < 300; d++) dailyAnimals(state, world, calendar(1440 * d), rng);
    expect(sumDeer()).toBeLessThan(deerBefore);
  });

  it("a save written before the catalogue keeps the species it still has and gains the rest", () => {
    const { state } = newGame(4);
    const id = state.player.region;
    const raw = JSON.parse(serialize(state, 1));
    raw.state.regions[id].pop = { hare: 5, grouse: 7, deer: 3, elk: 1, fish: 9 };
    const loaded = deserialize(JSON.stringify(raw))!.state;
    const world = generateWorld(loaded.seed);
    fillPopulations(loaded, world);
    const pop = loaded.regions[id].pop as Record<string, number>;
    expect(pop.hare).toBe(5);
    // Species the catalogue no longer has go; the ones it gained start where a fresh region would.
    expect(pop.grouse).toBeUndefined();
    expect(pop.fish).toBeUndefined();
    expect(pop.perch).toBeCloseTo(regionAt(world, id).capacity.perch! * 0.7, 9);
  });
});

/** A touched region holding the species, from the player's region outward across the lattice. */
function regionWith(state: GameState, world: World, s: Species): number {
  for (let id = 0; id < LATTICE_W * LATTICE_H; id++) {
    if (regionAt(world, id).capacity[s]) {
      regionState(state, world, id);
      return id;
    }
  }
  throw new Error(`no region with ${s}`);
}

describe("seasons", () => {
  it("migrants are away in January and here in June; lake birds leave when the ice comes", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "mallard");
    const k = regionAt(world, id).capacity.mallard!;
    expect(seasonalCapacity(world, id, "mallard", calendar(1440 * 275))).toBe(0);   // early January
    expect(seasonalCapacity(world, id, "mallard", calendar(1440 * 70))).toBe(k);    // June
    expect(seasonalCapacity(world, id, "mallard", calendar(1440 * 70), ICE_THIN_CM)).toBe(0);
    expect(seasonalCapacity(world, id, "loon", calendar(1440 * 70), ICE_THIN_CM)).toBe(0);
    const perchId = regionWith(state, world, "perch");
    expect(seasonalCapacity(world, perchId, "perch", calendar(1440 * 70), 30)).toBe(regionAt(world, perchId).capacity.perch);
  });

  it("a migrant flock arrives over ten days and is gone a month after it leaves", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "mallard");
    const st = regionState(state, world, id);
    const k = regionAt(world, id).capacity.mallard!;
    st.pop.mallard = 0;
    const rng = new Rng(3);
    for (let d = 0; d < 10; d++) dailyAnimals(state, world, calendar(1440 * (30 + d)), rng);   // May
    expect(popOf(st, "mallard")).toBeGreaterThan(k * 0.5);
    for (let d = 0; d < 30; d++) dailyAnimals(state, world, calendar(1440 * (200 + d)), rng);  // mid October on
    expect(popOf(st, "mallard")).toBeLessThan(k * 0.1);
  });

  it("voice-only species sit at capacity and residents thin in winter by their factor", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "raven");
    const st = regionState(state, world, id);
    st.pop.raven = 0;
    dailyAnimals(state, world, calendar(1440 * 70), new Rng(1));
    expect(popOf(st, "raven")).toBe(regionAt(world, id).capacity.raven);
    const deerId = regionWith(state, world, "deer");
    expect(seasonalCapacity(world, deerId, "deer", calendar(1440 * 275))).toBeCloseTo(regionAt(world, deerId).capacity.deer! * 0.6, 9);
    expect(seasonalCapacity(world, deerId, "deer", calendar(1440 * 70))).toBe(regionAt(world, deerId).capacity.deer);
  });

  it("mammals migrate, birds and fish do not, and nothing enters a region without the species", () => {
    const { state, world } = newGame(5);
    for (const nb of regionAt(world, state.player.region).neighbours) regionState(state, world, nb.id);
    const rng = new Rng(4);
    const before: Record<number, Partial<Record<Species, number>>> = {};
    for (const [id, st] of Object.entries(state.regions)) before[Number(id)] = { ...st.pop };
    dailyAnimals(state, world, calendar(1440 * 220), rng);   // November: no growth
    for (const [key, st] of Object.entries(state.regions)) {
      const id = Number(key);
      for (const s of Object.keys(st.pop) as Species[]) {
        expect(regionAt(world, id).capacity[s], `${s} in ${id} without capacity`).toBeGreaterThan(0);
        // Voice-only species sit at capacity every day regardless of growth, so they are their own case (see the test above); this checks the rest.
        if (SPECIES_DEFS[s].kind !== "mammal" && SPECIES_DEFS[s].season.kind === "resident" && !isVoiceOnly(s)) expect(st.pop[s]).toBeCloseTo(before[id][s]!, 9);
      }
    }
  });
});
