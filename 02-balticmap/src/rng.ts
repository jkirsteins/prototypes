import type { Rng } from "./cards";

/** Linear congruential rng; same generator the tests use, so a seed here
 *  means the same stream everywhere.
 *
 *  Its own module rather than a `sim.ts` export because the app now needs it
 *  too, for `?seed=` boot params. `sim.ts` is the balance harness, and its
 *  module-level `factionAdjacencyOf(data)` / `siteCapsOf(data)` calls are
 *  exactly the kind a bundler's purity analysis cannot reliably drop - an
 *  import edge from the app to the harness would ship whatever anyone later
 *  adds at its top level. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
