import type { Rng } from "../rng";

const PREFIXES = [
  "Kald", "Gran", "Myr", "Bjørk", "Stein", "Ulv", "Elg", "Hare", "Furu",
  "Storm", "Is", "Dyp", "Lang", "Sval", "Rein", "Ravn", "Hvit", "Gammel",
  "Orre", "Tjuv", "Bratt", "Aur", "Skjær", "Nord",
];

const WATER = ["vik", "tjern", "vatn", "nes", "sund"];
const ROCK = ["fjell", "heia", "åsen", "nuten"];
const BOG = ["myra", "mosen"];
const FOREST = ["skog", "mo", "lia", "dalen", "holt"];

export interface NameTerrain { water: number; rock: number; bog: number; forest: number }

/**
 * A Norwegian name whose ending says what the region mostly is.
 *
 * The letters are the real ones. A plain "a" where an "å" belongs is not a
 * near miss, it is a different sound: a native speaker read "Bjorklia"
 * aloud and it was wrong. There was no non-ASCII anywhere in src.
 */
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
