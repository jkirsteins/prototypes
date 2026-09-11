/**
 * What ground the survivor can walk. Region fog says which places have a
 * name; this says which patches have been walked, seen close enough to
 * read, or mapped. A route may only cross what is in here.
 *
 * The storage is fineknowledge.ts; this is the state-shaped face of it,
 * and the one place the route cache's generation stamp moves.
 */
import { regionAt, type World } from "../world/gen";
import { inheritKnowledge, knowledgeAt, markSeen, markVisited } from "./fineknowledge";
import type { GameState } from "./types";

// A cache stamp for knownRoute, not game state: it never goes into the save.
let generation = 1;

export function knowledgeGen(): number {
  return generation;
}

export function isKnown(state: GameState, cell: number): boolean {
  return knowledgeAt(state.knowledge, cell) !== "unknown";
}

export function markKnown(state: GameState, cell: number): void {
  if (markSeen(state.knowledge, cell)) generation++;
}

/**
 * The patch under foot: standing on ground is a stronger claim than seeing
 * it. Raising seen to visited changes nothing a route may cross, so only
 * ground that was unknown moves the cache stamp - otherwise every minute of
 * every walk would throw the route cache away.
 */
export function markWalked(state: GameState, cell: number): void {
  const wasUnknown = knowledgeAt(state.knowledge, cell) === "unknown";
  if (markVisited(state.knowledge, cell) && wasUnknown) generation++;
}

export function mapRegion(state: GameState, world: World, region: number): void {
  for (const c of regionAt(world, region).cells) markKnown(state, c);
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
  inheritKnowledge(state.knowledge);
  generation++;
}
