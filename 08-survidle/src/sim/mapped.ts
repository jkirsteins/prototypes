/**
 * What ground the survivor can walk. Region fog says which places have a
 * name; this says which cells have been walked, seen close enough to
 * read, or mapped. A route may only cross what is in here.
 */
import { regionAt, type World } from "../world/gen";
import { calendar } from "./calendar";
import { discoverAvailableOpportunities } from "./opportunity-catalog";
import type { GameState } from "./types";

// A cache stamp for knownRoute, not game state: it never goes into the save.
let generation = 1;

export function knowledgeGen(): number {
  return generation;
}

export function isKnown(state: GameState, cell: number): boolean {
  return state.mapped[cell] !== undefined;
}

export function markKnown(state: GameState, cell: number): void {
  if (state.mapped[cell] === 1) return;
  state.mapped[cell] = 1;
  generation++;
}

/** `announce` is false where the ground is handed over at a run's own start rather than mapped during one. */
export function mapRegion(state: GameState, world: World, region: number, announce = true): void {
  for (const c of regionAt(world, region).cells) markKnown(state, c);
  discoverAvailableOpportunities(state, world, calendar(state.minute, state.startDoy), announce);
}

export function knownShare(state: GameState, world: World, region: number): number {
  const cells = regionAt(world, region).cells;
  if (!cells.length) return 1;
  let n = 0;
  for (const c of cells) if (isKnown(state, c)) n++;
  return n / cells.length;
}

/** The journal: what a dead survivor knew, the heir has read rather than walked. */
export function dimAll(state: GameState): void {
  for (const k of Object.keys(state.mapped)) state.mapped[Number(k)] = 3;
  generation++;
}
