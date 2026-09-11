import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import { calendar } from "../src/sim/calendar";
import { bestHuntCell, carcassMinutes, createCarcass, disturbHuntingGround, huntAbsenceEvidenceNeeded, huntEstimate, huntPressureFactor, huntSignOdds, huntSpeciesWeights, knownHuntSpecies, noteFailedHunt, noteHuntSign, processCarcass, stepCarcasses } from "../src/sim/hunting";
import { addItem, herePile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot, straightKm, watersideCell } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { setSkillLevel } from "../src/sim/horizon";
import { check, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { huntedLand, SPECIES_DEFS } from "../src/sim/species";
import { cellAt, hasSpot, regionAt, spotOf } from "../src/world/gen";
import { regionNear, terrainCellNear, watersideNear } from "./world-facts";
import { siteCamp } from "./siting-helpers";
import { isWorkIntent } from "../src/sim/types";
import { mapRegion } from "../src/sim/mapped";
import { Rng } from "../src/rng";
import { activateWildlife, wildlifeMembers } from "../src/sim/wildlife-agents";
import { ensureGround, ICE_THIN_CM } from "../src/sim/weather";
import { testAtmosphere } from "./weather-helpers";

afterEach(() => vi.restoreAllMocks());

const cal = calendar(0);

/**
 * A region near the landing with both a heath and a forest spot. A hunting case
 * that compares two named grounds needs a region that has both, and a coastal
 * landing region need not: which region that is belongs to the world.
 */
function huntGround(world: ReturnType<typeof newGame>["world"]): number {
  return regionNear(world, world.start, (id) => hasSpot(regionAt(world, id), "heath") && hasSpot(regionAt(world, id), "forest"));
}

function armedGame() {
  const g = newGame(1);
  siteCamp(g.state, g.world);
  g.state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false });
  addItem(g.state.player.pack, "arrow", 10);
  return g;
}

describe("hunting knowledge", () => {
  it("requires current evidence before a named hunt can start", () => {
    const { state, world } = armedGame();
    const cell = spotOf(regionAt(world, huntGround(world)), "heath")!.cell;
    placeAt(state, world, cell);
    expect(check(state, world, cal, "hunt", "hare")).toMatchObject({ ok: false, why: "no fresh sign" });
    noteHuntSign(state, cell, "hare");
    expect(check(state, world, cal, "hunt", "hare").ok).toBe(true);
    state.minute += 14 * 1440;
    expect(check(state, world, calendar(state.minute), "hunt", "hare")).toMatchObject({ ok: false, why: "no fresh sign" });
  });

  it("keeps a beginner on the nearest plausible ground but lets an expert choose the better return", () => {
    const { state, world } = armedGame();
    const r = regionAt(world, huntGround(world));
    const heath = spotOf(r, "heath")!.cell;
    const forest = spotOf(r, "forest")!.cell;
    placeAt(state, world, heath);

    setSkillLevel(state, "hunting", 1);
    expect(bestHuntCell(state, world, cal)).toBe(heath);

    setSkillLevel(state, "hunting", 20);
    expect(huntEstimate(state, world, cal, forest).kgPerHour).toBeGreaterThan(huntEstimate(state, world, cal, heath).kgPerHour);
    expect(cellAt(world, bestHuntCell(state, world, cal)).terrain).toMatch(/spruce|pine|birch/);
  });

  it("never chooses terrain the survivor has not mapped", () => {
    const { state, world } = armedGame();
    const heath = spotOf(regionAt(world, huntGround(world)), "heath")!.cell;
    placeAt(state, world, heath);
    state.mapped = { [heath]: 1 };
    setSkillLevel(state, "hunting", 20);
    expect(bestHuntCell(state, world, cal)).toBe(heath);
  });

  it("does not use the hidden live population to estimate hunting ground", () => {
    const { state, world } = armedGame();
    const r = regionAt(world, state.player.region);
    const forest = spotOf(r, "forest")!.cell;
    setSkillLevel(state, "hunting", 20);
    const before = huntEstimate(state, world, cal, forest);
    const st = regionState(state, world, state.player.region);
    for (const species of huntedLand()) st.pop[species] = 0;
    expect(huntEstimate(state, world, cal, forest)).toEqual(before);
  });

  it("does not use the hidden regional roster to estimate or choose hunting ground", () => {
    const known = armedGame();
    const changed = armedGame();
    setSkillLevel(known.state, "hunting", 20);
    setSkillLevel(changed.state, "hunting", 20);
    const region = regionAt(changed.world, changed.state.player.region);
    for (const species of huntedLand()) region.capacity[species] = species === "hare" ? 999999 : 0;

    expect(bestHuntCell(changed.state, changed.world, cal)).toBe(bestHuntCell(known.state, known.world, cal));
    const cell = bestHuntCell(known.state, known.world, cal);
    expect(huntSpeciesWeights(changed.state, changed.world, cal, cell)).toEqual(huntSpeciesWeights(known.state, known.world, cal, cell));
  });

  it("keeps plausible hunting ground available when the hidden population is empty", () => {
    const { state, world } = armedGame();
    const cell = bestHuntCell(state, world, cal);
    const st = regionState(state, world, state.player.region);
    for (const species of huntedLand()) st.pop[species] = 0;
    expect(huntEstimate(state, world, cal, cell).species.length).toBeGreaterThan(0);
    expect(bestHuntCell(state, world, cal)).toBe(cell);
  });

  it("learns negative evidence without learning the hidden population", () => {
    const { state, world } = armedGame();
    const cell = bestHuntCell(state, world, cal);
    const before = huntEstimate(state, world, cal, cell).kgPerHour;
    // The best prey on this ground: the estimate is a weighted mean, so failing
    // to find a species worth less than the mean would raise it.
    const prey = huntSpeciesWeights(state, world, cal, cell).reduce((a, b) => a.value >= b.value ? a : b).species;
    noteFailedHunt(state, cell, prey);
    noteFailedHunt(state, cell, prey);
    expect(huntEstimate(state, world, cal, cell).kgPerHour).toBeLessThan(before);

    const st = regionState(state, world, state.player.region);
    st.pop[prey] = 0;
    expect(huntEstimate(state, world, cal, cell).kgPerHour).toBeLessThan(before);
  });

  it("rules out prey after repeated region-wide failures until evidence changes", () => {
    const { state, world } = armedGame();
    const region = regionAt(world, state.player.region);
    const forests = region.cells.filter((cell) => /spruce|pine|birch/.test(cellAt(world, cell).terrain));
    expect(huntSpeciesWeights(state, world, cal, forests[0]).some((row) => row.species === "bear")).toBe(true);

    for (const cell of forests.slice(0, 3)) noteFailedHunt(state, cell, "bear");
    expect(huntSpeciesWeights(state, world, cal, forests[0]).some((row) => row.species === "bear")).toBe(true);

    setSkillLevel(state, "hunting", 20);
    expect(huntSpeciesWeights(state, world, cal, forests[0]).some((row) => row.species === "bear")).toBe(false);

    noteHuntSign(state, forests[1], "bear");
    expect(huntSpeciesWeights(state, world, cal, forests[0]).some((row) => row.species === "bear")).toBe(true);
  });

  it("scales the evidence threshold continuously with hunting skill", () => {
    const { state } = armedGame();
    setSkillLevel(state, "hunting", 1);
    expect(huntAbsenceEvidenceNeeded(state)).toBe(7);
    setSkillLevel(state, "hunting", 10);
    expect(huntAbsenceEvidenceNeeded(state)).toBeCloseTo(5.105263, 5);
    setSkillLevel(state, "hunting", 20);
    expect(huntAbsenceEvidenceNeeded(state)).toBe(3);
  });

  it("lets old negative evidence fade instead of expiring at a hard instant", () => {
    const { state, world } = armedGame();
    setSkillLevel(state, "hunting", 20);
    const forest = spotOf(regionAt(world, state.player.region), "forest")!.cell;
    for (let i = 0; i < 3; i++) noteFailedHunt(state, forest, "bear");
    expect(huntSpeciesWeights(state, world, cal, forest).some((row) => row.species === "bear")).toBe(false);

    state.minute += 50 * 1440;
    expect(huntSpeciesWeights(state, world, calendar(state.minute, state.startDoy), forest).some((row) => row.species === "bear")).toBe(true);
    expect(state.player.huntSigns[forest].failures?.bear?.count).toBe(3);
  });

  it("lets an expert range onto mapped neighboring ground after local failures", () => {
    const { state, world } = armedGame();
    setSkillLevel(state, "hunting", 20);
    const local = regionAt(world, state.player.region);
    for (const neighbour of local.neighbours) mapRegion(state, world, neighbour.id);
    for (const cell of local.cells) {
      for (const species of huntedLand()) {
        noteFailedHunt(state, cell, species);
        noteFailedHunt(state, cell, species);
        noteFailedHunt(state, cell, species);
      }
    }
    expect(cellAt(world, bestHuntCell(state, world, cal)).region).not.toBe(state.player.region);
  });

  it("lets an expert compare mapped neighboring ground after sustained local pressure", () => {
    const { state, world } = armedGame();
    setSkillLevel(state, "hunting", 20);
    const local = regionAt(world, state.player.region);
    for (const neighbour of local.neighbours) mapRegion(state, world, neighbour.id);
    for (const cell of local.cells) state.huntPressure[cell] = 1;

    expect(cellAt(world, bestHuntCell(state, world, cal)).region).not.toBe(state.player.region);
  });

  it("keeps recent signs as personal knowledge and lets them expire", () => {
    const { state, world } = armedGame();
    const here = cellOf(state, world);
    const before = huntEstimate(state, world, cal, here).confidence;
    expect(noteHuntSign(state, here, "hare")).toBe(true);
    expect(noteHuntSign(state, here, "hare")).toBe(false);
    expect(state.player.huntSigns[here]).toEqual({ species: { hare: 0 } });
    expect(huntEstimate(state, world, cal, here).confidence).toBeGreaterThan(before);
    state.minute = 15 * 24 * 60;
    expect(huntEstimate(state, world, calendar(state.minute), here).confidence).toBe(before);
  });

  it("offers specific prey only after fresh local sign and forgets it when the sign expires", () => {
    const { state, world } = armedGame();
    const here = cellOf(state, world);
    expect(knownHuntSpecies(state, world)).toEqual([]);
    noteHuntSign(state, here, "hare");
    expect(knownHuntSpecies(state, world)).toEqual(["hare"]);
    state.minute = 15 * 24 * 60;
    expect(knownHuntSpecies(state, world)).toEqual([]);
  });

  it("does not refresh old species when new sign is found on the same cell", () => {
    const { state, world } = armedGame();
    const here = cellOf(state, world);
    noteHuntSign(state, here, "hare");
    state.minute = 13 * 24 * 60;
    noteHuntSign(state, here, "deer");
    state.minute = 15 * 24 * 60;
    expect(knownHuntSpecies(state, world)).toEqual(["deer"]);
  });

  it("lets hunting skill improve sign reading without making empty ground speak", () => {
    const { state } = armedGame();
    setSkillLevel(state, "hunting", 1);
    const novice = huntSignOdds(state, 0.5);
    setSkillLevel(state, "hunting", 20);
    expect(huntSignOdds(state, 0.5)).toBeGreaterThan(novice);
    expect(huntSignOdds(state, 0)).toBe(0);
  });

  it("shifts target choice from common prey toward usable return as hunting skill rises", () => {
    const { state, world } = armedGame();
    const forest = spotOf(regionAt(world, state.player.region), "forest")!.cell;
    const meanMeat = () => {
      const rows = huntSpeciesWeights(state, world, cal, forest);
      const total = rows.reduce((sum, row) => sum + row.weight, 0);
      return rows.reduce((sum, row) => sum + row.weight * (SPECIES_DEFS[row.species].yields?.meatKg ?? 0), 0) / total;
    };
    setSkillLevel(state, "hunting", 1);
    const novice = meanMeat();
    setSkillLevel(state, "hunting", 20);
    expect(meanMeat()).toBeGreaterThan(novice * 2);
  });

  it("includes outcrop game in generic hunting estimates", () => {
    const { state, world } = (() => {
      const g = newGame(17);
      siteCamp(g.state, g.world);
      return g;
    })();
    setSkillLevel(state, "hunting", 20);
    const rock = terrainCellNear(world, state.player.region, "rock").cell;
    expect(huntSpeciesWeights(state, world, cal, rock).some((row) => row.species === "reindeer")).toBe(true);
  });

  it("does not use hidden candidate-cell ice until the hunter reaches that ground", () => {
    const { state, world } = armedGame();
    // A lake shore outside the region the hunter stands in: the nearest one may
    // be a long way from a coastal landing, and how far is the world's business.
    const shore = watersideNear(world, cellOf(state, world), "lake", (cell) => cellAt(world, cell).region !== state.player.region);
    expect(watersideCell(world, shore, "lake")).toBe(true);
    const candidateRegion = cellAt(world, shore).region;

    ensureGround(state, world, state.player.region).iceCm = ICE_THIN_CM;
    ensureGround(state, world, candidateRegion).iceCm = 0;
    state.weather.iceCm = ICE_THIN_CM;
    expect(huntSpeciesWeights(state, world, cal, shore).some((row) => row.species === "mallard")).toBe(false);

    placeAt(state, world, shore);
    expect(huntSpeciesWeights(state, world, cal, shore).some((row) => row.species === "mallard")).toBe(true);
  });
});

describe("carcass recovery", () => {
  it("keeps a kill on its cell until field work recovers it", () => {
    const { state, world } = armedGame();
    const carcass = createCarcass(state, world, "deer", { meatKg: 12, hideKg: 2, fatKg: 1, bone: 1, sinew: 1 });
    expect(qty(state.player.pack, "rawMeat") + qty(herePile(state, world), "rawMeat")).toBe(0);
    expect(state.carcasses).toContainEqual(carcass);

    const recovered = processCarcass(state, world, carcass.id);
    expect(recovered).not.toBeNull();
    expect(recovered).toMatchObject({ species: "deer", carcassId: carcass.id });
    expect(recovered!.meatKg).toBeGreaterThan(0);
    expect(recovered!.meatKg).toBeLessThan(12);
    expect(qty(state.player.pack, "rawMeat") + qty(herePile(state, world), "rawMeat")).toBeCloseTo(recovered!.meatKg);
    expect(state.carcasses).toHaveLength(0);
  });

  it("lets skill improve recovery without creating more than the carcass held", () => {
    const novice = armedGame();
    const expert = armedGame();
    setSkillLevel(novice.state, "hunting", 1);
    setSkillLevel(expert.state, "hunting", 20);
    const a = createCarcass(novice.state, novice.world, "deer", { meatKg: 12, hideKg: 2, fatKg: 1, bone: 1, sinew: 1 });
    const b = createCarcass(expert.state, expert.world, "deer", { meatKg: 12, hideKg: 2, fatKg: 1, bone: 1, sinew: 1 });
    const low = processCarcass(novice.state, novice.world, a.id)!;
    const high = processCarcass(expert.state, expert.world, b.id)!;
    expect(high.meatKg).toBeGreaterThan(low.meatKg);
    expect(high.meatKg).toBeLessThanOrEqual(12);
  });

  it("loses an old warm carcass to spoilage and scavengers", () => {
    const { state, world } = armedGame();
    const carcass = createCarcass(state, world, "deer", { meatKg: 12, hideKg: 2, fatKg: 1, bone: 1, sinew: 1 });
    testAtmosphere({ temperatureC: 12 });
    stepCarcasses(state, world, 18 * 60);
    const after = state.carcasses.find((x) => x.id === carcass.id)!;
    expect(after.yields.meatKg).toBeLessThan(12);
    stepCarcasses(state, world, 48 * 60);
    expect(state.carcasses).toHaveLength(0);
  });

  it("discards paused field work when its carcass is gone", () => {
    const { state, world } = armedGame();
    placeAtSpot(state, world, state.player.region, "forest");
    const carcass = createCarcass(state, world, "deer", { meatKg: 12 });
    state.task = {
      id: "hunt", arg: "deer", progress: 10, duration: carcassMinutes(carcass), repeat: false,
      huntPhase: "field", carcassId: carcass.id,
    };
    stopTask(state, world);
    expect(Object.keys(state.paused)).toHaveLength(1);
    testAtmosphere({ temperatureC: 12 });
    stepCarcasses(state, world, 48 * 60);
    expect(Object.keys(state.paused)).toHaveLength(0);
    noteHuntSign(state, cellOf(state, world), "deer");
    expect(startTask(state, world, cal, "hunt", "deer")).toBe(true);
    expect(state.task?.huntPhase).toBeUndefined();
    expect(state.task?.carcassId).toBeUndefined();
  });

  it("does not complete active field work after its carcass disappears", () => {
    const { state, world } = armedGame();
    placeAtSpot(state, world, state.player.region, "forest");
    state.intent = {
      mode: "hand", task: "hunt", arg: "deer", cell: cellOf(state, world), campCell: null,
      until: { kind: "once" }, deliver: "leave", done: 0, step: "", orderId: null, windDown: false,
    };
    state.task = { id: "hunt", arg: "deer", progress: 29, duration: 30, repeat: false, huntPhase: "field", carcassId: 999 };
    stepTask(state, world, cal, { chance: () => false } as never, 1);
    expect(state.task).toBeNull();
    expect(isWorkIntent(state.intent) ? state.intent.done : -1).toBe(0);
  });

  it("ages each exposed carcass in its own weather, not the survivor's weather", () => {
    const { state, world } = armedGame();
    const warmCell = cellOf(state, world);
    const coldCell = regionAt(world, state.player.region).cells.find((cell) => cell !== warmCell)!;
    const warm = createCarcass(state, world, "deer", { meatKg: 12 });
    placeAt(state, world, coldCell);
    const cold = createCarcass(state, world, "deer", { meatKg: 12 });
    const base = testAtmosphere();
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x, y) => ({
      ...base,
      temperatureC: y * world.w + x === warmCell ? 12 : -15,
    }));

    stepCarcasses(state, world, 18 * 60);

    expect(state.carcasses.find((carcass) => carcass.id === warm.id)?.warmAge).toBe(18 * 60);
    expect(state.carcasses.find((carcass) => carcass.id === cold.id)?.warmAge).toBe(0);
  });
});

describe("local hunting pressure", () => {
  it("makes a recently hunted cell worse and recovers with time", () => {
    const { state, world } = armedGame();
    const cell = cellOf(state, world);
    expect(huntPressureFactor(state, world, cell)).toBe(1);
    disturbHuntingGround(state, world, cell, false);
    const attempt = huntPressureFactor(state, world, cell);
    disturbHuntingGround(state, world, cell, true);
    expect(huntPressureFactor(state, world, cell)).toBeLessThan(attempt);
    testAtmosphere({ temperatureC: 5 });
    stepCarcasses(state, world, 7 * 24 * 60);
    expect(huntPressureFactor(state, world, cell)).toBeGreaterThan(attempt);
  });

  it("makes nearby ground worse without disturbing distant country", () => {
    const { state, world } = armedGame();
    const cell = cellOf(state, world);
    const nearby = cell + 1;
    const distant = regionAt(world, state.player.region).cells.find((candidate) => straightKm(world, cell, candidate) >= 4)!;
    disturbHuntingGround(state, world, cell, true);
    expect(huntPressureFactor(state, world, nearby)).toBeLessThan(1);
    expect(huntPressureFactor(state, world, distant)).toBe(1);
  });

  it("alerts represented wildlife on disturbed ground without changing population", () => {
    const { state, world } = armedGame();
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((candidate) => candidate.active);
    expect(subject).toBeDefined();
    const before = wildlifeMembers(subject!);
    disturbHuntingGround(state, world, subject!.active!.cell, false);
    expect(subject!.active).toMatchObject({ alarm: 100, intent: "flee" });
    expect(wildlifeMembers(subject!)).toBe(before);
  });
});
