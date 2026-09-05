import type { Rng } from "../rng";

const PREFIXES = [
  "Kald", "Gran", "Myr", "Bjork", "Sten", "Ulv", "Elg", "Hare", "Furu",
  "Storm", "Is", "Dyp", "Lang", "Sval", "Rein", "Ravn", "Hvit", "Gammel",
  "Orre", "Tjuv", "Bratt", "Aur", "Skjer", "Nord",
];

const WATER = ["vik", "tjern", "vatn", "nes", "sund"];
const ROCK = ["fjell", "heia", "asen", "nuten"];
const BOG = ["myra", "mosen"];
const FOREST = ["skog", "mo", "lia", "dalen", "holt"];

export interface NameTerrain { water: number; rock: number; bog: number; forest: number }

/** A Nordic-sounding name whose ending says what the region mostly is. */
export function regionName(rng: Rng, t: NameTerrain, taken: Set<string>): string {
  const pool =
    t.water > 0.3 ? WATER : t.rock > 0.25 ? ROCK : t.bog > 0.3 ? BOG : FOREST;
  for (let tries = 0; tries < 50; tries++) {
    const name = rng.pick(PREFIXES) + rng.pick(pool);
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  const fallback = `${rng.pick(PREFIXES)}${rng.pick(FOREST)} ${taken.size + 1}`;
  taken.add(fallback);
  return fallback;
}
