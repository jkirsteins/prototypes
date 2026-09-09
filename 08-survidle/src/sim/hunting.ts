import type { Calendar } from "./calendar";
import { absence } from "./animals";
import { body } from "./person";
import { hasTool, produce } from "./inventory";
import { goalDeed } from "./goals";
import { campCellOf, cellOf, forestCell, heathCell, kmBetween, rockCell, straightKm, watersideCell } from "./position";
import { skillLevel, oddsFactor } from "./skills";
import { huntedLand, SPECIES_DEFS, type Species } from "./species";
import type { Carcass, CarcassYields, GameState } from "./types";
import { cellAt, regionAt, type World } from "../world/gen";

export const HUNT_SIGN_DAYS = 14;

export interface HuntEstimate {
  kgPerHour: number;
  confidence: number;
  species: Species[];
}

export interface HuntSpeciesWeight {
  species: Species;
  encounter: number;
  value: number;
  weight: number;
}

const CARCASS_SCAVENGE_AFTER = 12 * 60;
const CARCASS_GONE_AFTER = 36 * 60;
const PRESSURE_DAYS = 7;
const PRESSURE_RADIUS_KM = 2;

export function createCarcass(state: GameState, world: World, species: Species, yields: CarcassYields): Carcass {
  const stored: CarcassYields = {
    meatKg: yields.meatKg,
    ...(yields.hideKg !== undefined ? { hideKg: yields.hideKg } : {}),
    ...(yields.furKg !== undefined ? { furKg: yields.furKg } : {}),
    ...(yields.fatKg !== undefined ? { fatKg: yields.fatKg } : {}),
    ...(yields.bone !== undefined ? { bone: yields.bone } : {}),
    ...(yields.sinew !== undefined ? { sinew: yields.sinew } : {}),
  };
  const carcass: Carcass = {
    id: state.nextCarcassId++, species, cell: cellOf(state, world), killedAt: state.minute,
    warmAge: 0, yields: stored,
  };
  state.carcasses.push(carcass);
  return carcass;
}

export function huntPressureFactor(state: GameState, world: World, cell: number): number {
  let local = 0;
  for (const [key, pressure] of Object.entries(state.huntPressure)) {
    const km = straightKm(world, Number(key), cell);
    if (km >= PRESSURE_RADIUS_KM) continue;
    local += pressure * (1 - km / PRESSURE_RADIUS_KM);
  }
  return 1 - 0.75 * Math.min(1, local);
}

export function disturbHuntingGround(state: GameState, _world: World, cell: number, killed: boolean): void {
  state.huntPressure[cell] = Math.min(1, (state.huntPressure[cell] ?? 0) + (killed ? 0.45 : 0.12));
}

/** Ages carcasses and lets disturbed ground become useful again. */
export function stepCarcasses(state: GameState, dt: number, ambient: number): void {
  const pressureDrop = dt / (PRESSURE_DAYS * 1440);
  for (const key of Object.keys(state.huntPressure)) {
    const cell = Number(key);
    const next = (state.huntPressure[cell] ?? 0) - pressureDrop;
    if (next <= 1e-9) delete state.huntPressure[cell];
    else state.huntPressure[cell] = next;
  }
  const decayRate = ambient < -10 ? 0 : ambient <= 0 ? 0.5 : 1;
  if (decayRate <= 0) return;
  for (const carcass of state.carcasses) {
    const before = carcass.warmAge;
    carcass.warmAge += dt * decayRate;
    const exposed = Math.max(0, carcass.warmAge - Math.max(before, CARCASS_SCAVENGE_AFTER));
    if (exposed <= 0) continue;
    const share = 0.98 ** (exposed / 60);
    carcass.yields.meatKg *= share;
    if (carcass.yields.fatKg) carcass.yields.fatKg *= share;
  }
  state.carcasses = state.carcasses.filter((carcass) => carcass.warmAge < CARCASS_GONE_AFTER && carcass.yields.meatKg > 0.05);
  const live = new Set(state.carcasses.map((carcass) => carcass.id));
  for (const [key, task] of Object.entries(state.paused)) {
    if (task.huntPhase === "field" && task.carcassId !== undefined && !live.has(task.carcassId)) delete state.paused[key];
  }
}

export function carcassMinutes(carcass: Carcass): number {
  return Math.max(30, Math.round(30 + carcass.yields.meatKg * 2));
}

/** Finishes the field work and turns only the recoverable share into goods. */
export function processCarcass(state: GameState, world: World, id: number): (CarcassYields & { meatDestination: "pack" | "pile" }) | null {
  const index = state.carcasses.findIndex((x) => x.id === id && x.cell === cellOf(state, world));
  if (index < 0) return null;
  const carcass = state.carcasses[index];
  const edge = hasTool(state.player, "knife") ? 0.05 : 0;
  const share = Math.min(0.95, 0.7 + 0.01 * (skillLevel(state, "hunting") - 1) + edge);
  const recovered: CarcassYields = {
    meatKg: carcass.yields.meatKg * share,
    ...(carcass.yields.hideKg ? { hideKg: carcass.yields.hideKg * share } : {}),
    ...(carcass.yields.furKg ? { furKg: carcass.yields.furKg * share } : {}),
    ...(carcass.yields.fatKg ? { fatKg: carcass.yields.fatKg * share } : {}),
    ...(carcass.yields.bone ? { bone: Math.max(1, Math.floor(carcass.yields.bone * share)) } : {}),
    ...(carcass.yields.sinew ? { sinew: Math.max(1, Math.floor(carcass.yields.sinew * share)) } : {}),
  };
  const meatDestination = produce(state, world, "rawMeat", recovered.meatKg);
  if (recovered.hideKg) produce(state, world, "hide", recovered.hideKg);
  if (recovered.furKg) produce(state, world, "fur", recovered.furKg);
  if (recovered.fatKg) produce(state, world, "rawFat", recovered.fatKg);
  if (recovered.bone) produce(state, world, "bone", recovered.bone);
  if (recovered.sinew) produce(state, world, "sinew", recovered.sinew);
  state.carcasses.splice(index, 1);
  return { ...recovered, meatDestination };
}

function suits(world: World, cell: number, species: Species): boolean {
  const spot = SPECIES_DEFS[species].hunt?.spot;
  if (spot === "forest") return forestCell(world, cell);
  if (spot === "outcrop") return rockCell(world, cell);
  if (spot === "heath") return heathCell(world, cell);
  if (spot === "shore") return watersideCell(world, cell);
  return false;
}

/** Personal evidence found by seeing or pursuing an animal at this cell. */
export function noteHuntSign(state: GameState, cell: number, species: Species): boolean {
  const previous = state.player.huntSigns[cell]?.species ?? {};
  const seenAt = previous[species];
  const discovered = seenAt === undefined || state.minute - seenAt >= HUNT_SIGN_DAYS * 1440;
  state.player.huntSigns[cell] = { species: { ...previous, [species]: state.minute } };
  if (discovered) goalDeed(state, { kind: "foundSign" });
  return discovered;
}

function recentSign(state: GameState, cell: number): Species[] {
  const sign = state.player.huntSigns[cell];
  if (!sign) return [];
  return huntedLand().filter((species) => {
    const seenAt = sign.species[species];
    return seenAt !== undefined && state.minute - seenAt < HUNT_SIGN_DAYS * 1440;
  });
}

export function hasRecentHuntSign(state: GameState, cell: number, species: Species): boolean {
  return recentSign(state, cell).includes(species);
}

function recoveryShare(state: GameState): number {
  return Math.min(0.95, 0.7 + 0.01 * (skillLevel(state, "hunting") - 1) + (hasTool(state.player, "knife") ? 0.05 : 0));
}

/** Species for which this survivor has fresh evidence in the current region. */
export function knownHuntSpecies(state: GameState, world: World, region = state.player.region): Species[] {
  const known = new Set<Species>();
  for (const [key, sign] of Object.entries(state.player.huntSigns)) {
    if (cellAt(world, Number(key)).region !== region) continue;
    for (const species of huntedLand()) {
      const seenAt = sign.species[species];
      if (seenAt !== undefined && state.minute - seenAt < HUNT_SIGN_DAYS * 1440) known.add(species);
    }
  }
  return huntedLand().filter((species) => known.has(species));
}

/** Chance that a pursuit teaches the hunter what left the sign. Empty ground never can. */
export function huntSignOdds(state: GameState, density: number): number {
  if (density <= 0) return 0;
  return Math.min(0.95, 0.15 + skillLevel(state, "hunting") * 0.03 + Math.min(0.4, density * 0.4));
}

/** General field knowledge, not knowledge of whether this region actually holds the species. */
function habitatPrior(world: World, cell: number, species: Species): number {
  const habitat = SPECIES_DEFS[species].habitat;
  const terrain = cellAt(world, cell).terrain;
  let prior = terrain === "water" ? 0 : (habitat[terrain] ?? 0);
  if (watersideCell(world, cell, "lake")) prior = Math.max(prior, habitat.lake ?? 0);
  if (watersideCell(world, cell, "sea")) prior = Math.max(prior, habitat.sea ?? 0);
  return prior;
}

function speciesValue(state: GameState, world: World, cell: number, species: Species, signed: boolean): number {
  const def = SPECIES_DEFS[species];
  const kg = (def.yields?.meatKg ?? 0) * recoveryShare(state);
  const odds = Math.min(0.95,
    def.hunt!.odds * oddsFactor(state, species) * (signed ? 1.5 : 1) * huntPressureFactor(state, world, cell));
  const initialKm = kmBetween(state, world, cellOf(state, world), cell, "none") ?? 0;
  const camp = campCellOf(state, world);
  const campKm = camp === null ? 0 : (kmBetween(state, world, cell, camp, "none") ?? 0);
  const loads = Math.max(1, Math.ceil(kg / body(state).packHardKg));
  const travelMinutes = ((initialKm + campKm * Math.max(1, loads * 2 - 1)) / 4) * 60;
  const fieldMinutes = carcassMinutes({ id: 0, species, cell, killedAt: 0, warmAge: 0, yields: { meatKg: kg } });
  return (odds * kg * 60) / Math.max(1, def.hunt!.minutes + odds * (fieldMinutes + travelMinutes));
}

/**
 * Publicly inferable prey at a cell. Novices follow common sign while skill
 * shifts the draw toward the best expected usable recovery per total hour.
 */
export function huntSpeciesWeights(state: GameState, world: World, cal: Calendar, cell: number): HuntSpeciesWeight[] {
  const signs = recentSign(state, cell);
  const rows = huntedLand()
    .filter((species) => !absence(SPECIES_DEFS[species], cal, state.weather.iceCm) && suits(world, cell, species) && habitatPrior(world, cell, species) > 0)
    .map((species) => ({
      species,
      encounter: habitatPrior(world, cell, species) * SPECIES_DEFS[species].hunt!.odds * (signs.includes(species) ? 1.5 : 1),
      value: speciesValue(state, world, cell, species, signs.includes(species)),
    }));
  const maxEncounter = Math.max(...rows.map((row) => row.encounter), 0.001);
  const maxValue = Math.max(...rows.map((row) => row.value), 0.001);
  const skill = Math.min(1, (skillLevel(state, "hunting") - 1) / 19);
  return rows.map((row) => ({
    ...row,
    weight: (row.encounter / maxEncounter) * (1 - skill) + (row.value / maxValue) * skill,
  }));
}

/**
 * A hunter's estimate, deliberately independent of the live population. The
 * mapped terrain, general habitat knowledge and fresh signs are public
 * evidence; exact density remains world truth used only when an attempt is
 * resolved.
 */
export function huntEstimate(state: GameState, world: World, cal: Calendar, cell: number): HuntEstimate {
  const signs = recentSign(state, cell);
  const weights = huntSpeciesWeights(state, world, cal, cell);
  const species = weights.map((row) => row.species);
  const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0);
  const kgPerHour = totalWeight <= 0 ? 0 : weights.reduce((sum, row) => sum + row.weight * row.value, 0) / totalWeight;
  const confidence = Math.min(1, 0.2 + (skillLevel(state, "hunting") - 1) / 30 + (signs.length ? 0.35 : 0));
  return { kgPerHour, confidence, species };
}

/**
 * What a generic hunt can infer. A beginner follows the shortest plausible
 * route. Practice gradually shifts the decision toward estimated usable meat
 * per total travel and hunting hour.
 */
export function bestHuntCell(state: GameState, world: World, cal: Calendar): number {
  const here = cellOf(state, world);
  const r = regionAt(world, state.player.region);
  const choices = r.cells
    .map((cell) => {
      const estimate = huntEstimate(state, world, cal, cell);
      if (!estimate.species.length) return null;
      const km = kmBetween(state, world, here, cell, "none");
      if (km === null) return null;
      return { cell, km, estimate };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!choices.length) return here;
  const skill = Math.min(1, (skillLevel(state, "hunting") - 1) / 19);
  const maxKm = Math.max(...choices.map((x) => x.km), 0.001);
  const maxValue = Math.max(...choices.map((x) => x.estimate.kgPerHour), 0.001);
  choices.sort((a, b) => {
    const proximityA = 1 - a.km / maxKm;
    const proximityB = 1 - b.km / maxKm;
    const valueA = (a.estimate.kgPerHour / maxValue) * a.estimate.confidence;
    const valueB = (b.estimate.kgPerHour / maxValue) * b.estimate.confidence;
    const scoreA = proximityA * (1 - skill) + valueA * skill;
    const scoreB = proximityB * (1 - skill) + valueB * skill;
    return scoreB - scoreA || a.km - b.km || a.cell - b.cell;
  });
  return choices[0].cell;
}
