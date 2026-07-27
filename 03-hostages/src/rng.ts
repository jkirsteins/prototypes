import type { RngState } from "./types";

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** mulberry32. Mutates rng.seed. */
function nextFloat(rng: RngState): number {
  rng.seed = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: RngState, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(nextFloat(rng) * maxExclusive);
}

export function shuffle<T>(rng: RngState, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = nextInt(rng, i + 1);
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}
