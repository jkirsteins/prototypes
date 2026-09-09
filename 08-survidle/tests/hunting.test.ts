import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { bestHuntCell, createCarcass, disturbHuntingGround, huntEstimate, huntPressureFactor, huntSignOdds, huntSpeciesWeights, knownHuntSpecies, noteHuntSign, processCarcass, stepCarcasses } from "../src/sim/hunting";
import { addItem, herePile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, straightKm } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { setSkillLevel } from "../src/sim/horizon";
import { huntedLand, SPECIES_DEFS } from "../src/sim/species";
import { cellAt, regionAt, spotOf } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

const cal = calendar(0);

function armedGame() {
  const g = newGame(1);
  siteCamp(g.state, g.world);
  g.state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false });
  addItem(g.state.player.pack, "arrow", 10);
  return g;
}

describe("hunting knowledge", () => {
  it("keeps a beginner on the nearest plausible ground but lets an expert choose the better return", () => {
    const { state, world } = armedGame();
    const r = regionAt(world, state.player.region);
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
    const heath = spotOf(regionAt(world, state.player.region), "heath")!.cell;
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

  it("keeps recent signs as personal knowledge and lets them expire", () => {
    const { state, world } = armedGame();
    const here = cellOf(state, world);
    const before = huntEstimate(state, world, cal, here).confidence;
    expect(noteHuntSign(state, here, "hare")).toBe(true);
    expect(noteHuntSign(state, here, "hare")).toBe(false);
    expect(state.player.huntSigns[here]).toEqual({ minute: 0, species: ["hare"] });
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
    const rock = regionAt(world, state.player.region).cells.find((cell) => /rock|fell/.test(cellAt(world, cell).terrain))!;
    expect(huntSpeciesWeights(state, world, cal, rock).some((row) => row.species === "reindeer")).toBe(true);
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
    stepCarcasses(state, 18 * 60, 12);
    const after = state.carcasses.find((x) => x.id === carcass.id)!;
    expect(after.yields.meatKg).toBeLessThan(12);
    stepCarcasses(state, 48 * 60, 12);
    expect(state.carcasses).toHaveLength(0);
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
    stepCarcasses(state, 7 * 24 * 60, 5);
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
});
