/**
 * The region lattice: which named place a 50 m patch belongs to. Regions are
 * a jittered lattice of seed points at 4.2 km and a patch belongs to the
 * nearest of them, so a patch and its parent cell are in the same place and a
 * region is the size of a day's ground whatever the terrain does.
 *
 * The ground itself is no longer here. It was a noise field of coast, ridge,
 * elevation, lake, moisture, exposure and drainage sampled per patch; the
 * world is solved at 300 m now (solve.ts) and refined at 50 m (refine.ts),
 * and what the ground is comes from the classifier over that refinement
 * (fine-class.ts). So the determinism rule of the solve holds here too:
 * addition, subtraction, multiplication, division, comparison, square root
 * and the integer-hash noise, and nothing else.
 */
import { PATCH_M, type MetricPoint, type PatchId, patchCenter, WORLD_FINE_H, WORLD_FINE_W } from "./spatial";

/** The lattice is drawn across the whole fine world, so both extents follow its constants. */
const WORLD_W_M = WORLD_FINE_W * PATCH_M;
const WORLD_H_M = WORLD_FINE_H * PATCH_M;
const REGION_LATTICE_M = 4_200;
const REGION_LATTICE_W = Math.ceil(WORLD_W_M / REGION_LATTICE_M);
const REGION_LATTICE_H = Math.ceil(WORLD_H_M / REGION_LATTICE_M);

function hash2(seed: number, a: number, b: number): number {
  let hash = Math.imul(a + 1, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_296;
}

function latticeSeed(seed: number, lx: number, ly: number): MetricPoint {
  const xJitter = hash2(seed, lx, ly) - 0.5;
  const yJitter = hash2(seed, ly * 7_919, lx * 104_729) - 0.5;
  return {
    xM: Math.min(WORLD_W_M - 1, Math.max(0, (lx + 0.5) * REGION_LATTICE_M + xJitter * 0.8 * REGION_LATTICE_M)),
    yM: Math.min(WORLD_H_M - 1, Math.max(0, (ly + 0.5) * REGION_LATTICE_M + yJitter * 0.8 * REGION_LATTICE_M)),
  };
}

export function regionAtPatch(seed: number, patch: PatchId): number {
  const point = patchCenter(patch);
  const lx0 = Math.floor(point.xM / REGION_LATTICE_M);
  const ly0 = Math.floor(point.yM / REGION_LATTICE_M);
  let region = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let ly = ly0 - 1; ly <= ly0 + 1; ly++) {
    if (ly < 0 || ly >= REGION_LATTICE_H) continue;
    for (let lx = lx0 - 1; lx <= lx0 + 1; lx++) {
      if (lx < 0 || lx >= REGION_LATTICE_W) continue;
      const candidate = latticeSeed(seed, lx, ly);
      const dx = point.xM - candidate.xM;
      const dy = point.yM - candidate.yM;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        region = ly * REGION_LATTICE_W + lx;
      }
    }
  }
  return region;
}
