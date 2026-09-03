/**
 * Region state comes into being the first time a region matters: when the
 * player enters it, when an animal migrates into it, when it is looked at.
 * Untouched regions sit at their starting populations, so nothing is lost
 * by not simulating them.
 */
import { regionAt, type World } from "../world/gen";
import { log } from "./log";
import { type GameState, type RegionState, SPECIES, type Species } from "./types";

export function newRegionState(world: World, id: number): RegionState {
  const r = regionAt(world, id);
  const pop = {} as Record<Species, number>;
  for (const s of SPECIES) pop[s] = r.capacity[s] * 0.7;
  return {
    wood: r.wood0,
    pop,
    campCell: r.campCell,
    structures: { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0, boughBed: false, hearth: false },
    boughBedAge: 0,
    build: {},
    fire: { lit: false, fuelKg: 0, wetKg: 0, indoors: false, unattended: 0 },
    rack: { kg: 0, dried: 0 },
    snareCatch: { count: 0, age: 0 },
    smoke: 0,
    logsWet: 1440,
    orders: [],
    nextOrderId: 1,
  };
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

export function discovery(state: GameState, id: number): 0 | 1 | 2 {
  return (state.discovered[id] ?? 0) as 0 | 1 | 2;
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
  if (before !== VISITED && state.minute > 0) log(state, `New ground: ${r.name}.`, "good");
}
