/**
 * Survivor names: first and last names from Scandinavian and Baltic pools,
 * combined freely, so a Norwegian first name may carry a Latvian surname.
 * Plain ASCII spellings, since the UI and the epitaph are typed text.
 */
import type { Rng } from "../rng";

export const FIRST_NAMES = [
  // Norwegian, Swedish, Danish, Finnish
  "Eirik", "Sigrid", "Ingrid", "Bjorn", "Astrid", "Leif", "Solveig", "Torvald", "Ragnhild", "Halvard",
  "Gunnar", "Helga", "Sven", "Kari", "Olav", "Liv", "Arne", "Tove", "Aino", "Eero", "Kaisa", "Mikko",
  "Tuula", "Veikko", "Sanna", "Matti", "Ilkka", "Riikka", "Jorunn", "Sten",
  // Latvian, Lithuanian, Estonian
  "Janis", "Ilze", "Andris", "Liga", "Maris", "Dace", "Juris", "Inese", "Valdis", "Rasa",
  "Jonas", "Egle", "Vytas", "Ruta", "Kazys", "Aldona", "Mart", "Kadri", "Toomas", "Liis", "Priit", "Anu",
];

export const LAST_NAMES = [
  "Berg", "Dahl", "Haugen", "Lund", "Nygard", "Solberg", "Strand", "Vik", "Bakke", "Moen",
  "Lindqvist", "Nyman", "Sjoberg", "Holm", "Ek", "Aalto", "Koskinen", "Niemi", "Salo", "Virtanen",
  "Kalnins", "Berzins", "Ozols", "Liepa", "Krumins", "Balodis", "Zarins", "Vitols", "Eglitis", "Dzenis",
  "Kazlauskas", "Petrauskas", "Jankauskas", "Zukauskas", "Butkus", "Urbonas", "Tamm", "Saar", "Sepp", "Magi", "Kask", "Kukk",
];

export function nameTaken(name: { first: string; last: string }, taken: { first: string; last: string }[]): boolean {
  return taken.some((t) => t.first === name.first && t.last === name.last);
}

/** A name not used in this world yet. The pools are far larger than any lineage, so the loop is short. */
export function rollName(rng: Rng, taken: { first: string; last: string }[]): { first: string; last: string } {
  for (let i = 0; i < 100; i++) {
    const name = { first: FIRST_NAMES[rng.int(FIRST_NAMES.length)], last: LAST_NAMES[rng.int(LAST_NAMES.length)] };
    if (!nameTaken(name, taken)) return name;
  }
  return { first: FIRST_NAMES[rng.int(FIRST_NAMES.length)], last: `${LAST_NAMES[rng.int(LAST_NAMES.length)]} the younger` };
}

export function fmtName(name: { first: string; last: string }): string {
  return `${name.first} ${name.last}`;
}
