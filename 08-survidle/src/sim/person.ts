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
import { BASE_KCAL_PER_HOUR, COMFORT_C, FAT_KCAL_PER_KG } from "./player";
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

/**
 * Median total mass at the typical reserve, in kilos, by sex. The male
 * figure is MEDIAN_MASS_KG, so a median man at his typical reserve weighs
 * what the burn equations have always been scaled against. The female figure
 * is a game parameter like FAT_SHARES below, not a measured population
 * median, settled by the same balance runs.
 */
const MEDIAN_TOTAL_KG: Record<Sex, number> = { m: MEDIAN_MASS_KG, f: 62 };

/**
 * The four levels the fat reserve is read against, as shares of total body
 * mass. Game parameters, not measured human constants: where a real body's
 * intervention points sit varies too much between individuals to assert, so
 * these are placed to give the play the design wants and are settled by the
 * balance runs. Ordered floor < lower < typical < upper.
 *
 * floor is essential fat, the reserve that is structure rather than fuel,
 * and the boundary a body dies at. lower is where starvation begins to
 * tell. typical is where a survivor lands and the middle of the range fat
 * drifts in. upper is where appetite starts to argue back - no ceiling
 * follows it.
 *
 * A woman's floor is a much larger share than a man's, which is the one
 * thing here taken from physiology as a shape rather than a value.
 */
const FAT_SHARES: Record<Sex, { floor: number; lower: number; typical: number; upper: number }> = {
  m: { floor: 0.04, lower: 0.1, typical: 0.16, upper: 0.22 },
  f: { floor: 0.11, lower: 0.15, typical: 0.24, upper: 0.33 },
};

export interface FatLandmarks {
  /** The essential-fat floor: the reserve that is structure rather than fuel, in kcal. */
  floor: number;
  /** The lower intervention point: the reserve below which the body begins to fail, in kcal. */
  lower: number;
  /** Where a survivor lands, in kcal. */
  typical: number;
  /** The upper point: the top of the zone a well-provisioned body settles in, in kcal. */
  upper: number;
}

/** Fat in kcal at a share of total mass, given lean mass: a share f of the total means f/(1-f) of the lean. */
function fatAt(leanKg: number, share: number): number {
  return leanKg * (share / (1 - share)) * FAT_KCAL_PER_KG;
}

/** The four levels this body's reserve is read against. */
export function fatLandmarks(p: Person): FatLandmarks {
  const lean = derived(p).leanKg;
  const s = FAT_SHARES[p.sex];
  return { floor: fatAt(lean, s.floor), lower: fatAt(lean, s.lower), typical: fatAt(lean, s.typical), upper: fatAt(lean, s.upper) };
}

export interface Derived {
  packComfortableKg: number;
  packHardKg: number;
  workHours: number;
  /** The activity and walk buckets above base, as a multiple. */
  workBurn: number;
  /** Total mass at this body's typical reserve, in kilos: leanKg plus the fat FAT_SHARES puts at typical. */
  massKg: number;
  /** Frame and muscle, in kilos, without the fat reserve. */
  leanKg: number;
  /** Base burn at this body's typical reserve, in kcal per hour: a reference value, read only by tests. stepPlayer's live base tracks the actual reserve through massFactor() instead. */
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
  // Build scales the sex's own median the way it has always scaled MEDIAN_MASS_KG,
  // so a median man is MEDIAN_MASS_KG exactly.
  const massKg = MEDIAN_TOTAL_KG[p.sex] * (1 + (6 / MEDIAN_MASS_KG) * b);
  const leanKg = massKg * (1 - FAT_SHARES[p.sex].typical);
  return {
    packComfortableKg: PACK_COMFORTABLE_KG + 2.5 * s,
    packHardKg: PACK_HARD_KG + 3.5 * s,
    workHours: WORK_HOURS_DEFAULT + s,
    workBurn: 1 + 0.05 * s,
    massKg,
    leanKg,
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

/** What the body weighs right now: its frame and muscle, plus the reserve it is carrying. */
export function bodyMassKg(state: GameState): number {
  return body(state).leanKg + state.player.fat / FAT_KCAL_PER_KG;
}

/**
 * Total mass against the reference body, the multiplier every mass-scaled
 * burn uses. Resting costs more for a heavier body, and so does work that
 * moves it.
 */
export function massFactor(state: GameState): number {
  return bodyMassKg(state) / MEDIAN_MASS_KG;
}

/** A big eater's pace on work, and its burn on everything. */
export const BIG_EATER_PACE = 0.9;
export const BIG_EATER_BURN = 1.1;

/**
 * A grade says the word first and the quantity behind it: "Strong and
 * tireless." is what a listener takes away, "carries 28 kg, 39 at a push"
 * is what a player plans a carry with. Strength drives both the pack and
 * the working day, so one row speaks for both.
 */
const STRENGTH_WORDS = ["Weak", "Slight", "Ordinary", "Strong", "Mighty"];
const WIND_WORDS = ["soon spent", "short-winded", "steady", "tireless", "unflagging"];
const BUILD_WORDS = ["Spare", "Lean", "Ordinary", "Solid", "Heavy"];
const HANDS_WORDS = ["Clumsy hands", "Unsure hands", "Ordinary hands", "Sure hands", "Steady hands"];
const EYES_WORDS = ["poor sight", "short sight", "ordinary sight", "sharp eyes", "an eagle's eye"];

function kg(x: number): string {
  return Number.isInteger(x) ? `${x} kg` : `${x.toFixed(1)} kg`;
}

/** A grade line: the words a listener repeats, and the quantities that back them. */
export interface GradeLine {
  word: string;
  evidence: string;
}

/**
 * The three grades of a card. The pack figures are the same two the Pack
 * panel names, in the same words, so the card and the header never disagree
 * about what this body can lift.
 */
export function grades(p: Person): GradeLine[] {
  const d = derived(p);
  const b = p.axes.build;
  return [
    {
      word: `${STRENGTH_WORDS[p.axes.strength + 2]} and ${WIND_WORDS[p.axes.strength + 2]}.`,
      evidence: `carries ${kg(d.packComfortableKg)}, ${kg(d.packHardKg)} at a push; works ${d.workHours} hours`,
    },
    {
      word: `${BUILD_WORDS[b + 2]}${b > 0 ? ", sleeps warm" : b < 0 ? ", sleeps cold" : ""}.`,
      evidence: `${kg(d.massKg)}`,
    },
    { word: `${HANDS_WORDS[p.axes.hands + 2]}, ${EYES_WORDS[p.axes.eyes + 2]}.`, evidence: "" },
  ];
}

/**
 * A quirk says what it gives; what it refuses is the fear, said once on the
 * card's Fears line rather than twice a line apart.
 */
const QUIRK_LINES: Record<QuirkId, string> = {
  coastBorn: "Coast-born. Reads any shore at a glance.",
  forestBorn: "Forest-born. Knows the forest's game two levels early.",
  sleepsLight: "Sleeps light. Wolves never reach the bed; a storm night is a long one, and the morning short.",
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
