/**
 * Survivor names: first names and surnames from Scandinavian and Baltic
 * pools, combined freely, so a Norwegian first name may carry a Latvian
 * surname. First names are drawn for the person's sex; a Latvian or
 * Lithuanian surname carries the form that language gives a woman, and
 * every other surname is one form for anyone. Plain ASCII spellings,
 * since the UI and the epitaph are typed text.
 */
import type { Rng } from "../rng";

export type Sex = "f" | "m";

export const WOMEN = [
  // Norwegian, Swedish, Danish, Finnish
  "Sigrid", "Ingrid", "Astrid", "Solveig", "Ragnhild", "Helga", "Kari", "Liv", "Tove", "Aino", "Kaisa", "Tuula", "Sanna", "Riikka", "Jorunn",
  // Latvian, Lithuanian, Estonian
  "Ilze", "Liga", "Dace", "Inese", "Rasa", "Egle", "Ruta", "Aldona", "Kadri", "Liis", "Anu",
];

export const MEN = [
  // Norwegian, Swedish, Danish, Finnish
  "Eirik", "Bjorn", "Leif", "Torvald", "Halvard", "Gunnar", "Sven", "Olav", "Arne", "Eero", "Mikko", "Matti", "Ilkka", "Sten",
  // Latvian, Lithuanian, Estonian
  "Janis", "Andris", "Maris", "Juris", "Valdis", "Jonas", "Vytas", "Kazys", "Mart", "Toomas", "Priit",
];

export const FIRST_NAMES = [...WOMEN, ...MEN];

/** One form for anyone, or the man's and the woman's form where the language inflects a surname. */
export type Surname = string | { m: string; f: string };

export const LAST_NAMES: Surname[] = [
  "Berg", "Dahl", "Haugen", "Lund", "Nygard", "Solberg", "Strand", "Vik", "Bakke", "Moen",
  "Lindqvist", "Nyman", "Sjoberg", "Holm", "Ek", "Aalto", "Koskinen", "Niemi", "Salo", "Virtanen",
  { m: "Kalnins", f: "Kalnina" }, { m: "Berzins", f: "Berzina" }, { m: "Ozols", f: "Ozola" }, "Liepa", { m: "Krumins", f: "Krumina" },
  { m: "Balodis", f: "Balode" }, { m: "Zarins", f: "Zarina" }, { m: "Vitols", f: "Vitola" }, { m: "Eglitis", f: "Eglite" }, { m: "Dzenis", f: "Dzene" },
  { m: "Kazlauskas", f: "Kazlauskaite" }, { m: "Petrauskas", f: "Petrauskaite" }, { m: "Jankauskas", f: "Jankauskaite" }, { m: "Zukauskas", f: "Zukauskaite" },
  { m: "Butkus", f: "Butkute" }, { m: "Urbonas", f: "Urbonaite" }, "Tamm", "Saar", "Sepp", "Magi", "Kask", "Kukk",
];

export function surnameFor(s: Surname, sex: Sex): string {
  return typeof s === "string" ? s : s[sex];
}

/** Which list a first name is in, or null for a name the player typed. */
export function sexOfName(first: string): Sex | null {
  if (WOMEN.includes(first)) return "f";
  if (MEN.includes(first)) return "m";
  return null;
}

export function nameTaken(name: { first: string; last: string }, taken: { first: string; last: string }[]): boolean {
  return taken.some((t) => t.first === name.first && t.last === name.last);
}

/** A name for this sex not used in this world yet. The pools are far larger than any lineage, so the loop is short. */
export function rollName(rng: Rng, sex: Sex, taken: { first: string; last: string }[]): { first: string; last: string } {
  const firsts = sex === "f" ? WOMEN : MEN;
  for (let i = 0; i < 100; i++) {
    const name = { first: firsts[rng.int(firsts.length)], last: surnameFor(LAST_NAMES[rng.int(LAST_NAMES.length)], sex) };
    if (!nameTaken(name, taken)) return name;
  }
  return { first: firsts[rng.int(firsts.length)], last: `${surnameFor(LAST_NAMES[rng.int(LAST_NAMES.length)], sex)} the younger` };
}

export function fmtName(name: { first: string; last: string }): string {
  return `${name.first} ${name.last}`;
}
