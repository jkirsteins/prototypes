/**
 * What a place gives against the weather, on one scale. Found cover, cover
 * worked on, a shelter half built and a cabin all answer in the same terms,
 * so every reader asks one question: how much is over this survivor.
 */
import { cellAt, type World } from "../world/gen";
import type { Protection, Site, Terrain } from "./types";

export const PROTECTION_WORDS: Record<Protection, string> = {
  0: "open ground",
  1: "windbreak",
  2: "weatherproof",
  3: "liveable",
};

/**
 * What each ground can offer someone looking for cover. FM 21-76's own list
 * of natural shelter - caves and rocky crevices, small depressions, large
 * rocks on the leeward side of a hill, large trees with low-hanging limbs,
 * fallen trees with thick branches - read onto the terrain this world has.
 * Open ground offers nothing, and no amount of skill conjures an overhang
 * on a meadow.
 */
export const COVER_CEILING: Record<Terrain, Protection> = {
  rock: 2, spruce: 2, pine: 1, birch: 1, meadow: 0, bog: 0, fell: 0, water: 0,
};

export function coverCeiling(world: World, cell: number): Protection {
  return COVER_CEILING[cellAt(world, cell).terrain];
}

/** What this searcher notices, bounded by what the ground can actually hold. */
export function findCover(world: World, cell: number, naturalShelterLevel: number): Protection {
  const ceiling = coverCeiling(world, cell);
  if (ceiling === 0) return 0;
  return naturalShelterLevel >= 5 ? ceiling : 1;
}

/** The level the structures standing on a cell come to. */
export function protectionOf(site: Site | null): Protection {
  if (!site) return 0;
  const s = site.structures;
  if (s.cabin || s.turfHut) return 3;
  if (s.leanTo || s.snowShelter || site.cover >= 2) return 2;
  return site.cover;
}
