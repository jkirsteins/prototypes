/**
 * What a place gives against the weather, on one scale. Found cover, cover
 * worked on, a shelter half built and a cabin all answer in the same terms,
 * so every reader asks one question: how much is over this survivor.
 */
import type { Site } from "./types";
import type { Protection } from "./types";

export const PROTECTION_WORDS: Record<Protection, string> = {
  0: "open ground",
  1: "windbreak",
  2: "weatherproof",
  3: "liveable",
};

/** The level the structures standing on a cell come to. */
export function protectionOf(site: Site | null): Protection {
  if (!site) return 0;
  const s = site.structures;
  if (s.cabin || s.turfHut) return 3;
  if (s.leanTo || s.snowShelter) return 2;
  return 0;
}
