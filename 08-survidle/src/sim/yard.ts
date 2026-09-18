import { fireSiteMinutes } from "./fire";
import type { Site, StructureId, Terrain } from "./types";

/**
 * Ground each thing takes in the camp's yard. A bough bed is inside
 * something, snares are out on the heath, hanging meat is a use of the rack
 * rather than a thing on the ground, and a heap of timber waiting on a build
 * is not a kept store, so none of them is here.
 */
export const FOOTPRINT_M2: Partial<Record<StructureId, number>> = {
  firePit: 4, waterStore: 1, dryingRack: 4, leanTo: 6, vedbod: 6, snowShelter: 6, turfHut: 12, cabin: 25,
};

/** The patch a landing camp has: a fire site, a lean-to, a rack and a trough, with a little spare. */
export const YARD_START_M2 = 30;

/** The fire site's own square metres, the area its minutes buy. */
export const FIRE_SITE_M2 = 4;

export function yardUsed(site: Site): number {
  let m2 = 0;
  for (const id of Object.keys(FOOTPRINT_M2) as StructureId[]) {
    if (id === "vedbod") m2 += FOOTPRINT_M2.vedbod! * site.woodsheds;
    else if (id === "dryingRack") m2 += FOOTPRINT_M2.dryingRack! * site.racks;
    else if (site.structures[id as keyof Site["structures"]]) m2 += FOOTPRINT_M2[id]!;
  }
  return m2;
}

export function yardFree(site: Site): number {
  return Math.max(0, site.yardM2 - yardUsed(site));
}

/**
 * What an hour of clearing opens, read off the fire site rather than named
 * again here: the site is FIRE_SITE_M2 of ground, and fireSiteMinutes is
 * what this ground charges for it. Duff scraped back under spruce is half
 * the meadow's rate, peat a quarter of it, and deep snow the same as peat.
 */
export function clearM2PerHour(terrain: Terrain, snowCm: number): number {
  return (FIRE_SITE_M2 / fireSiteMinutes(terrain, snowCm)) * 60;
}
