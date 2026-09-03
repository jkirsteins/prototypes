/**
 * Clothing that gets wet garment by garment. Rain finds the outer layer
 * first; a soaked coat is half a coat. A fire or a roof keeps you from
 * getting wetter; only rain in the open, with neither, wets you.
 */
import { clamp } from "../units";
import { CLOTHING } from "./items";
import { SNOW_DAMP_MAX } from "./player";
import type { ClothingSlot, GameState, Garment } from "./types";

export const OUTER: ReadonlySet<ClothingSlot> = new Set<ClothingSlot>(["coat", "hat", "boots", "mittens"]);

export interface Exposure {
  raining: boolean;
  heavy: boolean;
  snowing: boolean;
  roof: boolean;
  cabin: boolean;
  fireAtCamp: boolean;
  bedded: boolean;
  storm: boolean;
}

export function garmentWet(g: Garment): number {
  return g.wet ?? 0;
}

/** Share of insulation a garment keeps at its wetness: wool half at soaked, hide a third. */
export function wetFactor(g: Garment): number {
  const def = CLOTHING[g.id];
  if (def.slot === "blanket") return 1;
  const loss = def.material === "wool" ? 0.5 : 0.67;
  return 1 - loss * (garmentWet(g) / 100);
}

/** Wetting rate per minute for the outer layer out in the weather; zero by the fire, under a roof, in a cabin, or when dry. */
function wetRate(x: Exposure): number {
  if (x.fireAtCamp || x.roof || x.cabin || !x.raining) return 0;
  let r = x.heavy ? 2 : 1;
  if (x.snowing) r *= 0.25;
  if (x.storm) r *= 2;
  return r;
}

/**
 * Drying rate per minute: the fire dries fastest whatever the weather, a
 * cabin dries slowly whatever the weather, a lean-to only in dry weather,
 * and the open only in dry weather too.
 */
function dryRate(x: Exposure): number {
  return x.fireAtCamp ? 20 / 60 : x.cabin ? 5 / 60 : x.roof ? (x.raining ? 0 : 5 / 60) : x.raining ? 0 : 5 / 60;
}

/** Wets or dries every garment for dt minutes. */
export function stepGarments(state: GameState, x: Exposure, dt: number): void {
  const wet = wetRate(x);
  const dry = dryRate(x);
  for (const g of state.player.clothing) {
    const slot = CLOTHING[g.id].slot;
    if (slot === "blanket" && !x.bedded) continue;
    if (wet > 0) {
      const share = OUTER.has(slot) ? 1 : 0.5;
      const cap = x.snowing ? SNOW_DAMP_MAX : 100;
      g.wet = clamp(garmentWet(g) + wet * share * dt, 0, Math.max(garmentWet(g), cap));
    } else {
      g.wet = clamp(garmentWet(g) - dry * dt, 0, 100);
    }
  }
}

/** How much of the rain reaches the skin: the mean soaking of coat and trousers. */
export function skinExposure(state: GameState): number {
  const layers = state.player.clothing.filter((g) => {
    const s = CLOTHING[g.id].slot;
    return s === "coat" || s === "trousers";
  });
  if (!layers.length) return 1;
  return layers.reduce((a, g) => a + garmentWet(g) / 100, 0) / layers.length;
}
