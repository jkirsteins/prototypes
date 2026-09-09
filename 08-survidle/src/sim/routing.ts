/**
 * The one door the sim layer routes through. `knownRoute` takes a bare
 * predicate rather than `state` because route.ts cannot import mapped.ts
 * without a cycle (world/gen imports route); this wrapper closes over
 * `state` once so every caller reads the way it did with `findRoute`.
 */
import { cellAt, neighbours, regionOf, type World } from "../world/gen";
import { isKnown, knowledgeGen } from "./mapped";
import type { GameState, IceMode } from "./types";
import { knownRoute, passable } from "../world/route";

/** A route the survivor could actually plan: it may not leave the ground they know. */
export function survivorRoute(
  state: GameState,
  world: World,
  from: number,
  to: number,
  ice: IceMode = "none",
  avoidFell = false,
): number[] | null {
  return knownRoute(world, from, to, (c) => isKnown(state, c), knowledgeGen(), ice, avoidFell);
}

/** A known route followed by exactly one passable unknown step. */
export function frontierRoute(
  state: GameState,
  world: World,
  from: number,
  to: number,
  ice: IceMode = "none",
  avoidFell = false,
): number[] | null {
  if (isKnown(state, to) || !passable(cellAt(world, to).terrain, ice)) return null;
  const edges = neighbours(world, to).filter((cell) => isKnown(state, cell));
  let best: number[] | null = null;
  for (const edge of edges) {
    const known = survivorRoute(state, world, from, edge, ice, avoidFell);
    if (!known) continue;
    const path = [...known, to];
    if (!best || path.length < best.length) best = path;
  }
  return best;
}

/**
 * A route while exploring `region`: known ground as always, plus the
 * region's own unmapped ground. Walking into the dark is what exploring
 * is - refusing it is what leaves two cells passing the survivor back and
 * forth forever, each one's only unseen neighbour a cell neither can ever
 * become known enough to route to. Ground outside the region being
 * explored still obeys the known-only rule.
 */
export function exploreRoute(
  state: GameState,
  world: World,
  from: number,
  to: number,
  region: number,
  ice: IceMode = "none",
  avoidFell = false,
): number[] | null {
  const known = (c: number) => isKnown(state, c) || regionOf(world, c % world.w, Math.floor(c / world.w)) === region;
  return knownRoute(world, from, to, known, `${knowledgeGen()}:x${region}`, ice, avoidFell);
}
