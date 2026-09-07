/**
 * The teaching layer: what the game stops to explain, and when. The sim
 * names the moment and writes its words; whoever is listening draws it,
 * the same division src/sim/cues.ts keeps for sound. The queue itself
 * lives in skills.ts beside the unlock it is pushed from, which is what
 * keeps this file free to read skills.ts without a cycle.
 */
import type { GameState } from "./types";

/** A new survivor learns for themselves: a moment is about what this life can newly reach. */
export function resetTeaching(state: GameState): void {
  state.taught = {};
  state.teachQueue = [];
}
