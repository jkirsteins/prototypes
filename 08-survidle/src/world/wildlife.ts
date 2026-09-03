/**
 * Capacity per species for a region: area times habitat, times where the
 * species' range happens to reach. The range is a slow noise per species,
 * so a species has country it lives in and country it does not, a few
 * regions wide, and is densest in the heart of its range.
 */
import { derive } from "../rng";
import { type Habitat, type Species, SPECIES_DEFS, SPECIES_IDS } from "../sim/species";
import { fbm } from "./noise";

/** Cells per noise unit: about 25 km, so ranges are patches several regions wide. */
const RANGE_CELLS = 84;
/** fbm clusters around a half; this stretches it so a range of r covers about r of the map. Pinned by tests/wildlife.test.ts. */
const RANGE_SPREAD = 2.0;
/** Below this many animals a region has none of the species at all. */
const MIN_CAPACITY = 0.5;
/**
 * Share of the region a species' ground must cover before it lives there.
 * It is the share below which placeSpots gives the region no spot on that
 * ground either, so two pine cells on a bare fell would otherwise put an
 * animal on the card that there is nowhere to go and hunt.
 */
const MIN_GROUND = 0.02;

export function rangeNoise(seed: number, index: number, cx: number, cy: number): number {
  const u = fbm(cx / RANGE_CELLS, cy / RANGE_CELLS, derive(seed, 2000 + index), 2);
  return Math.min(1, Math.max(0, 0.5 + (u - 0.5) * RANGE_SPREAD));
}

export function wildlifeCapacity(seed: number, area: number, shares: Record<Habitat, number>, cx: number, cy: number): Partial<Record<Species, number>> {
  const out: Partial<Record<Species, number>> = {};
  SPECIES_IDS.forEach((s, i) => {
    const def = SPECIES_DEFS[s];
    let raw = 0;
    let ground = 0;
    for (const [h, per] of Object.entries(def.habitat) as [Habitat, number][]) {
      raw += shares[h] * per;
      ground += shares[h];
    }
    if (ground <= MIN_GROUND) return;
    raw *= area;
    if (def.needs) raw *= Math.min(1, 4 * def.needs.reduce((a, h) => a + shares[h], 0));
    if (raw < MIN_CAPACITY) return;
    const u = rangeNoise(seed, i, cx, cy);
    if (u < 1 - def.range) return;
    const heart = (u - (1 - def.range)) / def.range;
    out[s] = raw * (0.5 + heart);
  });
  return out;
}
