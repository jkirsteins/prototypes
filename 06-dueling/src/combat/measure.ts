import type { WeaponProfile, Zone } from "./types";

/** Measure in the doc's sense: what can you do from here, in how many actions. */
export function zoneFor(gap: number, w: WeaponProfile): Zone {
  if (gap <= w.reach) return "narrow";
  if (gap <= w.reach + w.stepDistance) return "wide";
  return "out";
}
