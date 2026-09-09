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
 * Design values inside sourced field ranges, not measured build times:
 * a natural lean-to gives windbreak and roof in under an hour; a debris
 * hut takes about 1.5 hours to half a day, usually two to four hours.
 * The top joins the permanent lean-to's labour cost but stays temporary.
 */
export const EMERGENCY_MINUTES: Record<1 | 2 | 3, number> = { 1: 30, 2: 90, 3: 240 };

/** Protection already earned by effective work, even with the task unfinished. */
export function builtProtection(minutes: number): Protection {
  if (minutes >= EMERGENCY_MINUTES[3]) return 3;
  if (minutes >= EMERGENCY_MINUTES[2]) return 2;
  return minutes >= EMERGENCY_MINUTES[1] ? 1 : 0;
}

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

/** Effective work minutes to raise found cover by one protection level. */
export function improveCoverMinutes(cover: Protection): number | null {
  if (cover === 1) return 30;
  if (cover === 2) return 75;
  return null;
}

/** Raises found cover by one, never beyond the protection scale. */
export function improveCover(site: Site): Protection {
  site.cover = Math.min(3, site.cover + 1) as Protection;
  site.coverAge = 0;
  return site.cover;
}

/** The level the structures standing on a cell come to. */
export function protectionOf(site: Site | null): Protection {
  if (!site) return 0;
  const s = site.structures;
  const structure: Protection = s.cabin || s.turfHut ? 3 : s.leanTo || s.snowShelter ? 2 : 0;
  return Math.max(structure, site.cover, builtProtection(site.emergencyMinutes)) as Protection;
}
