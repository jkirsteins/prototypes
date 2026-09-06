/**
 * The person: four grades and a quirk or two, rolled per candidate and kept
 * on the life record, so the cemetery keeps them. Every number the grades
 * set is a real quantity read through derived() at the seam that held the
 * constant before; the median person is today's survivor exactly, which is
 * what the reference player runs. Grades show as words, never as numbers.
 */
import { derive, Rng } from "../rng";
import { PACK_COMFORTABLE_KG, PACK_HARD_KG } from "../units";
import { WORK_HOURS_DEFAULT } from "./body";
import { rollName, type Sex } from "./names";
import { BASE_KCAL_PER_HOUR, COMFORT_C, FAT_FULL } from "./player";
import { current } from "./record";
import type { Candidate, GameState, Grade, Person, QuirkId } from "./types";

export { FELL_FEAR_LINE, fearsFell, hasQuirk, SHORE_FEAR_LINE, shunsShore } from "./fears";

export const QUIRKS: QuirkId[] = ["coastBorn", "forestBorn", "sleepsLight", "bigEater", "steadyByTheFire"];
/** The body the tables were written for. */
export const MEDIAN_MASS_KG = 72;

export function medianPerson(sex: Sex): Person {
  return { sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
}

/** Two three-sided dice minus four: shares of one, two, three, two, one in nine, the median commonest. */
function grade(rng: Rng): Grade {
  return (rng.int(3) + rng.int(3) - 2) as Grade;
}

/**
 * The three people on a boat, from a stream of their own so a roll never
 * moves the sim: sex, name, the four axes, the quirks, the face, in that
 * order. Coast-born and forest-born never share a person.
 */
export function rollCandidates(seed: number, index: number, boat: number, taken: { first: string; last: string }[]): Candidate[] {
  const rng = new Rng(derive(seed, 700 + index * 16 + boat));
  const out: Candidate[] = [];
  for (let i = 0; i < 3; i++) {
    const sex: Sex = rng.int(2) === 0 ? "f" : "m";
    const name = rollName(rng, sex, [...taken, ...out.map((c) => c.name)]);
    const axes = { strength: grade(rng), build: grade(rng), hands: grade(rng), eyes: grade(rng) };
    const n = rng.int(3) === 0 ? 2 : 1;
    const pool = [...QUIRKS];
    const quirks: QuirkId[] = [];
    for (let k = 0; k < n; k++) {
      const q = pool.splice(rng.int(pool.length), 1)[0];
      const clash = (q === "coastBorn" && quirks.includes("forestBorn")) || (q === "forestBorn" && quirks.includes("coastBorn"));
      if (!clash) quirks.push(q);
    }
    out.push({ name, person: { sex, axes, quirks, face: rng.int(2 ** 31) } });
  }
  return out;
}

export interface Derived {
  packComfortableKg: number;
  packHardKg: number;
  workHours: number;
  /** The activity and walk buckets above base, as a multiple. */
  workBurn: number;
  massKg: number;
  fatFull: number;
  /** The base bucket per hour. */
  baseBurn: number;
  comfortC: number;
  /** The chance a craft spoils, as a multiple of the level's. */
  spoilFactor: number;
  wearFactor: number;
  /** How far region discovery reaches on entry: 0 nothing beyond, 1 the neighbours, 2 their neighbours too. */
  sightReach: 0 | 1 | 2;
  /** Hunting odds by day, as a multiple. */
  dayOdds: number;
}

export function derived(p: Person): Derived {
  const { strength: s, build: b, hands: h, eyes: e } = p.axes;
  const massKg = MEDIAN_MASS_KG + 6 * b;
  return {
    packComfortableKg: PACK_COMFORTABLE_KG + 2.5 * s,
    packHardKg: PACK_HARD_KG + 3.5 * s,
    workHours: WORK_HOURS_DEFAULT + s,
    workBurn: 1 + 0.05 * s,
    massKg,
    fatFull: (FAT_FULL * massKg) / MEDIAN_MASS_KG,
    baseBurn: (BASE_KCAL_PER_HOUR * massKg) / MEDIAN_MASS_KG,
    comfortC: COMFORT_C - b,
    spoilFactor: 1 - 0.2 * h,
    wearFactor: 1 - 0.1 * h,
    sightReach: e <= -1 ? 0 : e >= 1 ? 2 : 1,
    dayOdds: 1 + 0.1 * e,
  };
}

export function personOf(state: GameState): Person {
  return current(state).person;
}

/** The living survivor's numbers. */
export function body(state: GameState): Derived {
  return derived(personOf(state));
}

/** A big eater's pace on work, and its burn on everything. */
export const BIG_EATER_PACE = 0.9;
export const BIG_EATER_BURN = 1.1;

const HOURS_WORDS = ["eight", "nine", "ten", "eleven", "twelve"];
const HANDS_WORDS = ["clumsy", "unsure hands", "ordinary hands", "sure hands", "steady hands"];
const EYES_WORDS = ["poor sight", "short sight", "ordinary sight", "sharp eyes", "eagle-eyed"];

function kg(x: number): string {
  return Number.isInteger(x) ? `${x} kg` : `${x.toFixed(1)} kg`;
}

/** The four grade lines of a card: quantities for strength and build, words for hands and eyes. */
export function gradeLines(p: Person): string[] {
  const d = derived(p);
  const b = p.axes.build;
  return [
    `carries ${kg(d.packComfortableKg)} all day, ${kg(d.packHardKg)} at a push; works ${HOURS_WORDS[p.axes.strength + 2]} hours`,
    `${d.massKg} kg${b > 0 ? ", sleeps warm" : b < 0 ? ", sleeps cold" : ""}`,
    HANDS_WORDS[p.axes.hands + 2],
    EYES_WORDS[p.axes.eyes + 2],
  ];
}

const QUIRK_LINES: Record<QuirkId, string> = {
  coastBorn: "Coast-born. Reads any shore at a glance; will not go up on the fell in cloud.",
  forestBorn: "Forest-born. Knows the forest's game two levels early; will not work the open shore in a storm.",
  sleepsLight: "Sleeps light. Wolves never reach the bed; a windy night is half a night's rest.",
  bigEater: "Big eater. Works a tenth faster and burns a tenth more.",
  steadyByTheFire: "Steady by the fire. Lights in rain without fail.",
};

const QUIRK_FEARS: Partial<Record<QuirkId, string>> = {
  coastBorn: "the fell in cloud",
  forestBorn: "the open shore in a storm",
};

export function quirkLine(q: QuirkId): string {
  return QUIRK_LINES[q];
}

export function quirkFear(q: QuirkId): string | null {
  return QUIRK_FEARS[q] ?? null;
}
