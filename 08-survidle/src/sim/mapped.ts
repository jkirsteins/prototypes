/**
 * What ground the survivor can walk. Region fog says which places have a
 * name; this says which patches have been walked, seen close enough to
 * read, or mapped. A route may only cross what is in here.
 *
 * The storage is fineknowledge.ts; this is the state-shaped face of it,
 * and the one place the route cache's generation stamp moves.
 */
import { cellAt, regionAt, type World } from "../world/gen";
import { calendar } from "./calendar";
import { coarseAt, type CoarseLevel, forgetKnowledge, type KnowledgeLevel, knowledgeAt, markCoarse, markSeen, markVisited, setKnowledge } from "./fineknowledge";
import { discoverAvailableOpportunities } from "./opportunity-catalog";
import type { GameState } from "./types";

// A cache stamp for knownRoute, not game state: it never goes into the save.
let generation = 1;
let coarseGeneration = 1;
let forgetting = 1;

export function knowledgeGen(): number {
  return generation;
}

/**
 * How many times knowledge has been taken away rather than added, in this
 * process. Every other write to the lattice raises a patch, so a reader may
 * cache "this ground is known" and trust it for ever; `forgetGround` is the
 * one writer that lowers one, and this is what tells such a cache its
 * answer has expired. `map.ts`'s `parentKnownCache` is the reason it exists.
 */
export function forgetGen(): number {
  return forgetting;
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

/**
 * Whether the lineage left anything standing in a region: a camp sited, a
 * structure raised, a trap line set. Read off `state.regions`, which outlives
 * the survivor who wrote it - the world is kept, only the person is not.
 */
function lineageStands(state: GameState, region: number): boolean {
  const st = state.regions[region];
  if (!st) return false;
  if (st.campCell !== null || st.snares > 0 || st.trap !== null) return true;
  return Object.values(st.sites).some((site) => Object.values(site.structures).some(Boolean) || site.racks > 0);
}

/**
 * The moment the old camp comes into view, the country it stands in is the
 * heir's again - and so is every other country the lineage left something
 * standing in. Not the ancestor's exact footsteps: a region entire, at
 * `inherited`, which is what a journal and a skyline between them can
 * honestly hand back. Ground the ancestors only walked stays unknown until
 * this survivor walks it.
 *
 * Seeing the camp is the trigger and the only one: sighting it is what turns
 * a direction on a note into a place, and everything the lineage built reads
 * off the same moment because the journal is one document, not one per
 * valley.
 */
export function recoverLineageGround(state: GameState, world: World, visible: ReadonlySet<number>): void {
  const oldCamp = state.survivors[state.survivors.length - 1]?.oldCamp;
  if (oldCamp === null || oldCamp === undefined || !visible.has(oldCamp)) return;
  inheritRegion(state, world, cellAt(world, oldCamp).region);
  for (const key of Object.keys(state.regions)) {
    const id = Number(key);
    if (lineageStands(state, id)) inheritRegion(state, world, id);
  }
}

export function knownShare(state: GameState, world: World, region: number): number {
  const cells = regionAt(world, region).cells;
  if (!cells.length) return 1;
  let n = 0;
  for (const c of cells) if (isKnown(state, c)) n++;
  return n / cells.length;
}

/**
 * A death takes the ground with it: the heir starts on a blank world and
 * earns it again. See `forgetKnowledge` (fineknowledge.ts) for why the far
 * country goes too.
 */
export function forgetGround(state: GameState): void {
  forgetKnowledge(state.knowledge);
  generation++;
  coarseGeneration++;
  forgetting++;
}

/**
 * A region handed back whole from the journal rather than walked: the old
 * camp's country the moment its camp is seen, and any country the lineage
 * left something standing in. Its patches read `inherited` - drawn faint,
 * crossable by a route, and raised to `seen` or `visited` the moment this
 * survivor's own eye or boot reaches them.
 */
export function inheritRegion(state: GameState, world: World, region: number): void {
  let changed = false;
  for (const c of regionAt(world, region).cells) {
    if (knowledgeAt(state.knowledge, c) === "unknown" && setKnowledge(state.knowledge, c, "inherited")) changed = true;
  }
  if (changed) generation++;
}
