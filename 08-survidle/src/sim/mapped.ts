/**
 * What ground the survivor can walk. Region fog says which places have a
 * name; this says which patches have been walked, seen close enough to
 * read, or mapped. A route may only cross what is in here.
 *
 * The storage is fineknowledge.ts; this is the state-shaped face of it,
 * and the one place the route cache's generation stamp moves.
 */
import { regionAt, type World } from "../world/gen";
import { calendar } from "./calendar";
import { coarseAt, type CoarseLevel, inheritKnowledge, type KnowledgeLevel, knowledgeAt, markCoarse, markSeen, markVisited } from "./fineknowledge";
import { discoverAvailableOpportunities } from "./opportunity-catalog";
import type { GameState } from "./types";

// A cache stamp for knownRoute, not game state: it never goes into the save.
let generation = 1;
let coarseGeneration = 1;

export function knowledgeGen(): number {
  return generation;
}

/**
 * The far country's own stamp, for the map. It is deliberately not the route
 * cache's: coarse ground is nothing a route may cross, and a look from a fell
 * marks thousands of parents at once, so moving the route stamp for it would
 * throw away every known route to redraw a distant hillside.
 */
export function coarseKnowledgeGen(): number {
  return coarseGeneration;
}

export function isKnown(state: GameState, cell: number): boolean {
  return knowledgeAt(state.knowledge, cell) !== "unknown";
}

export function markKnown(state: GameState, cell: number): void {
  if (markSeen(state.knowledge, cell)) generation++;
}

/**
 * Ground read from far off: the 300 m parent as a whole, or only the 900 m
 * aggregate it belongs to. See markCoarseSeen in sight.ts for which a look
 * earns at what distance.
 */
export function markCoarseKnown(state: GameState, cell: number, level: Exclude<CoarseLevel, "unknown">): void {
  if (markCoarse(state.knowledge, cell, level)) coarseGeneration++;
}

/** Whether the country this patch is in has been read from a distance, at either grain. */
export function coarseKnown(state: GameState, cell: number): boolean {
  return coarseAt(state.knowledge, cell) !== "unknown";
}

/**
 * One reading of a patch across both grains, for the map: what the survivor
 * knows of this ground, and at what resolution they know it. The fine level
 * wins wherever there is one - having seen the patches is a stronger claim
 * than having seen the hillside they sit on.
 */
export type MapKnowledge = KnowledgeLevel | "farParent" | "farAggregate";

/**
 * `fine` defaults to a fresh read, but the map draws thousands of these a
 * frame and almost always already holds the fine level from its own
 * per-glyph knowledge tally - passing it in skips a second read of the same
 * bit for the same patch.
 */
export function knowledgeAtLevel(state: GameState, cell: number, fine: KnowledgeLevel = knowledgeAt(state.knowledge, cell)): MapKnowledge {
  if (fine !== "unknown") return fine;
  const coarse = coarseAt(state.knowledge, cell);
  return coarse === "parent" ? "farParent" : coarse === "aggregate" ? "farAggregate" : "unknown";
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
  inheritKnowledge(state.knowledge);
  generation++;
}
