/** Stable imports backed exclusively by the authoritative fine fields. */
import type { Terrain } from "../sim/types";
import { fieldsAtMetric, regionAtPatch, terrainAtPatch } from "./fine-terrain";
import { PATCH_M, patchId, WORLD_FINE_H, WORLD_FINE_W } from "./spatial";

export const WORLD_W = WORLD_FINE_W;
export const WORLD_H = WORLD_FINE_H;
/** 4.2 km between region seeds, expressed in 50 m patches. */
export const LATTICE = 84;
export const LATTICE_W = Math.ceil(WORLD_W / LATTICE);
export const LATTICE_H = Math.ceil(WORLD_H / LATTICE);

/**
 * Representative mature canopy tops above the generated ground surface, metres.
 *
 * One table: what a ray reads as an obstruction and what a parent summary
 * bounds as its tallest obstruction have to be the same number, or a bound
 * stops bounding the thing it summarises.
 */
export const CANOPY_HEIGHT_M: Partial<Record<Terrain, number>> = { spruce: 22, pine: 17, birch: 14 };

export const TERRAINS: Terrain[] = ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow"];
export const TERRAIN_INDEX: Record<Terrain, number> = { water: 0, fell: 1, rock: 2, bog: 3, spruce: 4, pine: 5, birch: 6, meadow: 7 };

/** Compatibility for field consumers awaiting metric conversion. Coordinates
 * are fine patches; normalized elevation retains their 1,200 m scale. */
export function fieldsAt(seed: number, x: number, y: number): { e: number; m: number; sea: boolean; coast: number } {
  const fields = fieldsAtMetric(seed, { xM: (x + 0.5) * PATCH_M, yM: (y + 0.5) * PATCH_M });
  return { e: fields.elevationM / 1200, m: fields.moisture, sea: fields.sea, coast: fields.coast };
}

export function terrainAt(seed: number, x: number, y: number): Terrain {
  return terrainAtPatch(seed, patchId(x, y));
}

export function regionOfCell(seed: number, x: number, y: number): number {
  return regionAtPatch(seed, patchId(x, y));
}
