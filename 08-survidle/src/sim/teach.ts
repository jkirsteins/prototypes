/**
 * The teaching layer: what the game stops to explain, and when. The sim
 * names the moment and writes its words; whoever is listening draws it,
 * the same division src/sim/cues.ts keeps for sound. The queue itself
 * lives in skills.ts beside the unlock it is pushed from, which is what
 * keeps this file free to read skills.ts without a cycle.
 */
import type { GameState, Rung } from "./types";

/** A new survivor learns for themselves: a moment is about what this life can newly reach. */
export function resetTeaching(state: GameState): void {
  state.taught = {};
  state.teachQueue = [];
}

/**
 * What each rung is, in the concept's own terms. Which skill opened it is
 * the log line's business (RUNG_LINE in skills.ts, written on every unlock
 * in every skill); these lines are shown once per survivor and have to
 * read the same whichever skill got there first, so no skill is named.
 */
export const CONCEPTS: Record<Rung, { title: string; lines: string[] }> = {
  job: {
    title: "Jobs",
    lines: [
      "Until now every piece of work was a click of yours: one job, done once, watched.",
      "A skill practised this far keeps count without you. Say how many, or say what camp should end up holding, and walk away.",
    ],
  },
  grind: {
    title: "Grinds",
    lines: [
      "A grind is work that never ends.",
      "It takes every hour the list leaves free and never drops off, so it is what you put underneath everything else: the wood that keeps coming in while the real jobs get done.",
    ],
  },
  keep: {
    title: "Keeps",
    lines: [
      "A keep watches a pile instead of counting the work.",
      "Name what camp should hold and it goes quiet once the pile is there, then starts again when it drops. It reads the stored forms too, so meat on the rack counts against meat kept.",
    ],
  },
  condition: {
    title: "Conditions",
    lines: [
      "An order can now say when, and not only what.",
      "A season it runs in, a stock line it waits behind, the level a keep restarts at, a count to make each day. Work that waits for its moment costs nothing while it waits.",
    ],
  },
  pace: {
    title: "Pace",
    lines: [
      "An order can now carry a date.",
      "A keep can be due by a month, held at its figure after it, or spent by the season's close. This is how a winter is stocked during the summer without you counting the days.",
    ],
  },
};
