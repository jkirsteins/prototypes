/**
 * Region state comes into being the first time a region matters: when the
 * player enters it, when an animal migrates into it, when it is looked at.
 * Untouched regions sit at their starting populations, so nothing is lost
 * by not simulating them.
 */
import { regionAt, speciesHere, type World } from "../world/gen";
import { log } from "./log";
import { record } from "./record";
import type { GameState, RegionState, Species } from "./types";

/** Starting numbers: seven tenths of what the land can hold. */
export function startingPop(world: World, id: number): Partial<Record<Species, number>> {
  const r = regionAt(world, id);
  const pop: Partial<Record<Species, number>> = {};
  for (const s of speciesHere(r)) pop[s] = r.capacity[s]! * 0.7;
  return pop;
}

export function newRegionState(world: World, id: number): RegionState {
  const r = regionAt(world, id);
  return {
    wood: r.wood0,
    pop: startingPop(world, id),
    campCell: r.campCell,
    structures: { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0, boughBed: false, hearth: false, turfHut: false, waterStore: false },
    racks: 0,
    boughBedAge: 0,
    structureAge: {},
    build: {},
    fire: { lit: false, fuelKg: 0, wetKg: 0, indoors: false, unattended: 0 },
    rack: { kg: 0, dried: 0 },
    snareCatch: { count: 0, age: 0 },
    smoke: 0,
    logsWet: 1440,
    orders: [],
    nextOrderId: 1,
    iceHole: null,
    trap: null,
  };
}

/**
 * A region saved before a species existed has no number for it. Fill every
 * touched region's missing species at their starting numbers, and drop
 * numbers for species the catalogue no longer has. Called once after a
 * load, with the world in hand, which fillDefaults does not have.
 */
export function fillPopulations(state: GameState, world: World): void {
  for (const [key, st] of Object.entries(state.regions)) {
    const start = startingPop(world, Number(key));
    for (const k of Object.keys(st.pop)) if (!(k in start)) delete st.pop[k as Species];
    for (const s of Object.keys(start) as Species[]) st.pop[s] ??= start[s];
  }
}

export function regionState(state: GameState, world: World, id: number): RegionState {
  let st = state.regions[id];
  if (!st) {
    st = newRegionState(world, id);
    state.regions[id] = st;
  }
  return st;
}

/** Ids of every region with state, the ones the daily simulation runs over. */
export function touchedRegions(state: GameState): number[] {
  return Object.keys(state.regions).map(Number);
}

export const SEEN = 1;
export const VISITED = 2;
export const DIM = 3;

export function discovery(state: GameState, id: number): 0 | 1 | 2 | 3 {
  return state.discovered[id] ?? 0;
}

/** Entering a region discovers it and shows its neighbours from a distance. */
export function enterRegion(state: GameState, world: World, id: number): void {
  const before = discovery(state, id);
  state.discovered[id] = VISITED;
  regionState(state, world, id);
  const r = regionAt(world, id);
  for (const nb of r.neighbours) {
    if (!state.discovered[nb.id]) state.discovered[nb.id] = SEEN;
  }
  // A landing happens at minute 0, so this also keeps a heir's arrival out of the record, the same as the log line.
  if (before !== VISITED && state.minute > 0) {
    log(state, before === DIM ? `Known ground: ${r.name}, from the journal.` : `New ground: ${r.name}.`, "good");
    record(state, { kind: "entered", region: r.name });
  }
}
