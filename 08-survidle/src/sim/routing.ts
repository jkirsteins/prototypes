/**
 * The one door the sim layer routes through. `knownRoute` takes a bare
 * predicate rather than `state` because route.ts cannot import mapped.ts
 * without a cycle (world/gen imports route); this wrapper closes over
 * `state` once so every caller reads the way it did with `findRoute`.
 */
import type { World } from "../world/gen";
import { isKnown, knowledgeGen } from "./mapped";
import type { GameState, IceMode } from "./types";
import { knownRoute } from "../world/route";

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
