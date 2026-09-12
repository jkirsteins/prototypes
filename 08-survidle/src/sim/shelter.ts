/**
 * What a place gives against the weather, on one scale. Found cover, cover
 * worked on, a shelter half built and a cabin all answer in the same terms,
 * so every reader asks one question: how much is over this survivor.
 */
import { CELL_KM, clamp } from "../units";
import { cellAt, heightAt, terrainOf, type World } from "../world/gen";
import { CANOPY_HEIGHT_M } from "../world/terrain";
import type { GameState, Protection, Site, Terrain } from "./types";
import { atmosphereAt } from "./weather";

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
  rock: 2, spruce: 2, pine: 1, birch: 1, meadow: 0, bog: 0, fell: 0, water: 0, river: 0,
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

/** Raises found cover by one, never beyond this terrain's workable ceiling. */
export function improveCover(site: Site, maximum: Protection = 3): Protection {
  site.cover = Math.min(maximum, site.cover + 1) as Protection;
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

/**
 * Use the strongest shelter present; equal cover lets the survivor get low.
 * Lean-tos and temporary bough-and-deadfall builds have a frame, cabins
 * stand tall, and earth or snow shelters sit low. Racks and other equipment
 * are not shelter. Found scrapes, caves and canopy cover keep a low profile.
 */
export function profileOf(site: Site | null): "low" | "high" {
  const protection = protectionOf(site);
  if (!site || protection === 0) return "low";
  const low = Math.max(site.cover, site.structures.turfHut ? 3 : site.structures.snowShelter ? 2 : 0);
  return low >= protection ? "low" : "high";
}

/**
 * How far upwind ground can still matter: five steps is 1.5 km along a cardinal
 * wind and 2.1 km along a diagonal one, by which distance a barrier would have
 * to stand 150 m or 212 m above the cell to shelter it.
 */
const LEE_REACH_CELLS = 5;
/**
 * A barrier shelters the ground within about ten of its own heights downwind;
 * shelterbelt measurements halve the wind out to ten to fifteen heights. So a
 * barrier standing a tenth as high as it is distant is full shelter, and the
 * half score the gale rule asks for falls at a twentieth, a ratio of 0.05.
 */
const LEE_FULL_RATIO = 0.1;
/** One cell toward where the wind comes from: 0 is north, they run clockwise, and the map's north is negative y. */
export const UPWIND_STEP: readonly (readonly [number, number])[] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
const EIGHT_WINDS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function eighthOf(windBearingDeg: number): number {
  return ((Math.round(windBearingDeg / 45) % 8) + 8) % 8;
}

/** The wind's compass letters, for lines that have to say which way it blows from. */
export function windName(windBearingDeg: number): string {
  return EIGHT_WINDS[eighthOf(windBearingDeg)];
}

export interface Lee {
  /** Full shelter at 1, nothing at 0. */
  score: number;
  /** What does the blocking: the slope, the wood on it, the canopy overhead, or nothing. */
  by: "slope" | "wood" | "canopy" | "none";
  /** The raw ratio of barrier height over barrier distance. */
  blocking: number;
}

/**
 * How much of the wind the upwind ground and its wood take out before it
 * reaches this cell: the tallest thing standing upwind, measured above this
 * cell and against how far off it is. Valleys, gullies, the downwind side of a
 * ridge, banks and terraces all shelter this way while draining normally, and
 * a wood upwind works as any other barrier does. A sample is measured at the
 * distance it really stands at, so a diagonal step counts as 424 m. Rock and
 * fell are exposed by nature, and water, a river included, is never a refuge.
 * Spruce is the world's closed canopy: under it the wind is already gone.
 */
export function leeScore(world: World, cell: number, windBearingDeg: number): Lee {
  const { x, y, terrain } = cellAt(world, cell);
  if (terrain === "rock" || terrain === "fell" || terrain === "water" || terrain === "river") {
    return { score: 0, by: "none", blocking: 0 };
  }
  if (terrain === "spruce") return { score: 1, by: "canopy", blocking: LEE_FULL_RATIO };
  const [dx, dy] = UPWIND_STEP[eighthOf(windBearingDeg)];
  const here = heightAt(world, x, y);
  let blocking = 0;
  let bare = 0;
  for (let d = 1; d <= LEE_REACH_CELLS; d++) {
    const sx = x + dx * d;
    const sy = y + dy * d;
    if (sx < 0 || sy < 0 || sx >= world.w || sy >= world.h) break;
    // True distance, so a diagonal step is the 424 m it really is, not 300.
    const distanceM = d * CELL_KM * 1000 * Math.hypot(dx, dy);
    const ground = heightAt(world, sx, sy) - here;
    const ratio = (ground + (CANOPY_HEIGHT_M[terrainOf(world, sx, sy)] ?? 0)) / distanceM;
    if (ratio > blocking) {
      blocking = ratio;
      bare = ground / distanceM;
    }
  }
  const score = clamp(blocking / LEE_FULL_RATIO, 0, 1);
  return { score, by: score === 0 ? "none" : bare >= blocking ? "slope" : "wood", blocking };
}

/** Lee enough for the gale rule: half shelter, a blocking ratio of 0.05. */
export function isLee(world: World, cell: number, windBearingDeg: number): boolean {
  return leeScore(world, cell, windBearingDeg).score >= 0.5;
}

/** Design scale for gale wind, not extra roofing or a change to the site. */
export function galeProtection(state: GameState, world: World, cell: number, site: Site | null): Protection {
  const lee = isLee(world, cell, atmosphereAt(state, world, cell).windBearingDeg);
  return clamp(protectionOf(site) + (lee ? 1 : 0) - (profileOf(site) === "high" ? 1 : 0), 0, 3) as Protection;
}
