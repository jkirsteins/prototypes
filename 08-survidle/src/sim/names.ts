/**
 * Survivor names, grouped by the language they come from. A name is drawn
 * as a whole: a culture first, then a first name and a surname from that
 * culture's own pools, so nobody is ever a Finnish first name on a
 * Norwegian farm surname. First names are drawn for the person's sex; a
 * Latvian or Lithuanian surname carries the form that language gives a
 * woman, and every other surname is one form for anyone. Names retain the
 * letters used by their language even though the UI and epitaph are typed text.
 */
import type { Rng } from "../rng";

export type Sex = "f" | "m";

/** One form for anyone, or the man's and the woman's form where the language inflects a surname. */
export type Surname = string | { m: string; f: string };

export type CultureId = "norwegian" | "swedish" | "danish" | "finnish" | "latvian" | "lithuanian" | "estonian";

export interface Culture {
  id: CultureId;
  women: string[];
  men: string[];
  surnames: Surname[];
}

export const CULTURES: Culture[] = [
  {
    id: "norwegian",
    women: ["Sigrid", "Ingrid", "Astrid", "Solveig", "Ragnhild", "Kari", "Liv", "Jorunn", "Turid", "Bergljot"],
    men: ["Eirik", "Bj\u00f8rn", "Leif", "Torvald", "Halvard", "Olav", "Arne", "Trygve", "Harald", "Sindre"],
    surnames: ["Berg", "Dahl", "Haugen", "Lund", "Nyg\u00e5rd", "Solberg", "Strand", "Vik", "Bakke", "Moen", "Fjeld", "Ness"],
  },
  {
    id: "swedish",
    women: ["Elsa", "Karin", "Maja", "Britta", "Kerstin", "Gunilla", "Ylva", "Annika", "Ingegerd", "Sigrun"],
    men: ["Sven", "Gustav", "Nils", "Anders", "Lars", "Torsten", "Folke", "Hakan", "Stellan", "Sten"],
    surnames: ["Lindqvist", "Nyman", "Sjoberg", "Holm", "Ek", "Bergstrom", "Lindgren", "Almqvist", "Hedlund", "Sandell", "Ahlgren", "Ostberg"],
  },
  {
    id: "danish",
    women: ["Bodil", "Inge", "Mette", "Gudrun", "Karen", "Birthe", "Tove", "Helle", "Asta", "Sofie"],
    men: ["Knud", "Soren", "Jorgen", "Niels", "Frode", "Mogens", "Aksel", "Ejnar", "Poul", "Troels"],
    surnames: ["Kjeldsen", "Vestergaard", "Norgaard", "Mikkelsen", "Damgaard", "Skov", "Bjerre", "Holst", "Toft", "Kragh"],
  },
  {
    id: "finnish",
    women: ["Aino", "Kaisa", "Tuula", "Sanna", "Riikka", "Marjatta", "Helmi", "Sirkka", "Anneli", "Terttu"],
    men: ["Eero", "Mikko", "Matti", "Ilkka", "Veikko", "Tapio", "Jorma", "Pekka", "Reino", "Kalervo"],
    surnames: ["Aalto", "Koskinen", "Niemi", "Salo", "Virtanen", "Lahtinen", "Jarvinen", "Makela", "Rantanen", "Heikkila", "Karjalainen", "Nurmi"],
  },
  {
    id: "latvian",
    women: ["Ilze", "Liga", "Dace", "Inese", "Ruta", "Baiba", "Zane", "Iveta", "Gunta", "Sarmite"],
    men: ["Janis", "Andris", "Maris", "Juris", "Valdis", "Aivars", "Uldis", "Gatis", "Imants", "Karlis"],
    surnames: [
      { m: "Kalnins", f: "Kalnina" }, { m: "Berzins", f: "Berzina" }, { m: "Ozols", f: "Ozola" }, { m: "Krumins", f: "Krumina" },
      { m: "Balodis", f: "Balode" }, { m: "Zarins", f: "Zarina" }, { m: "Vitols", f: "Vitola" }, { m: "Eglitis", f: "Eglite" },
      { m: "Dzenis", f: "Dzene" }, { m: "Lacis", f: "Lace" }, { m: "Skujins", f: "Skujina" },
      // Latvian surnames that are already a feminine noun take no second form.
      "Liepa", "Priede",
    ],
  },
  {
    id: "lithuanian",
    women: ["Rasa", "Egle", "Aldona", "Gintare", "Ausra", "Dalia", "Jurate", "Vaida", "Milda", "Danute"],
    men: ["Jonas", "Vytas", "Kazys", "Algirdas", "Mindaugas", "Darius", "Rimas", "Saulius", "Gediminas", "Antanas"],
    surnames: [
      { m: "Kazlauskas", f: "Kazlauskaite" }, { m: "Petrauskas", f: "Petrauskaite" }, { m: "Jankauskas", f: "Jankauskaite" },
      { m: "Zukauskas", f: "Zukauskaite" }, { m: "Butkus", f: "Butkute" }, { m: "Urbonas", f: "Urbonaite" },
      { m: "Stankus", f: "Stankute" }, { m: "Vaitkus", f: "Vaitkute" }, { m: "Paulauskas", f: "Paulauskaite" }, { m: "Navickas", f: "Navickaite" },
    ],
  },
  {
    id: "estonian",
    women: ["Kadri", "Liis", "Anu", "Maarja", "Tiiu", "Kersti", "Ene", "Piret", "Vaike", "Reet"],
    men: ["Mart", "Toomas", "Priit", "Jaan", "Ants", "Rein", "Kalev", "Urmas", "Tarmo", "Aivo"],
    surnames: ["Tamm", "Saar", "Sepp", "Magi", "Kask", "Kukk", "Ilves", "Rebane", "Koppel", "Parn", "Lepik", "Oja"],
  },
];

export const WOMEN = CULTURES.flatMap((c) => c.women);
export const MEN = CULTURES.flatMap((c) => c.men);
export const FIRST_NAMES = [...WOMEN, ...MEN];
export const LAST_NAMES: Surname[] = CULTURES.flatMap((c) => c.surnames);

export function surnameFor(s: Surname, sex: Sex): string {
  return typeof s === "string" ? s : s[sex];
}

/** Which list a first name is in, or null for a name the player typed. */
export function sexOfName(first: string): Sex | null {
  if (WOMEN.includes(first)) return "f";
  if (MEN.includes(first)) return "m";
  return null;
}

/** The culture a first name belongs to, or null for a name the player typed. */
export function cultureOfFirst(first: string): CultureId | null {
  return CULTURES.find((c) => c.women.includes(first) || c.men.includes(first))?.id ?? null;
}

/** The culture a surname belongs to, in either of its forms, or null. */
export function cultureOfLast(last: string): CultureId | null {
  return CULTURES.find((c) => c.surnames.some((s) => surnameFor(s, "m") === last || surnameFor(s, "f") === last))?.id ?? null;
}

export function nameTaken(name: { first: string; last: string }, taken: { first: string; last: string }[]): boolean {
  return taken.some((t) => t.first === name.first && t.last === name.last);
}

/**
 * A name for this sex not used in this world yet: one culture per draw,
 * both halves from it. The pools are far larger than any lineage, so the
 * loop is short.
 */
export function rollName(rng: Rng, sex: Sex, taken: { first: string; last: string }[]): { first: string; last: string } {
  const draw = () => {
    const c = CULTURES[rng.int(CULTURES.length)];
    const firsts = sex === "f" ? c.women : c.men;
    return { first: firsts[rng.int(firsts.length)], last: surnameFor(c.surnames[rng.int(c.surnames.length)], sex) };
  };
  for (let i = 0; i < 100; i++) {
    const name = draw();
    if (!nameTaken(name, taken)) return name;
  }
  const last = draw();
  return { first: last.first, last: `${last.last} the younger` };
}

export function fmtName(name: { first: string; last: string }): string {
  return `${name.first} ${name.last}`;
}
