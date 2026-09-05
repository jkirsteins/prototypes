/**
 * What the north yields (roadmap, "What the north yields: the calibration
 * tables"), as data: gross kcal a day for a lone person, order-of-magnitude
 * bands the reference report is measured against and the per-unit tests
 * pin the constants inside. Bands are steered by, not hit: the report
 * prints a verdict per row, and only the per-unit constants are tests.
 */
import type { YieldSource } from "./ledger";

export interface Band { lo: number; hi: number }
export const band = (lo: number, hi: number): Band => ({ lo, hi });

export type TableRow = "plants" | "fishing" | "passiveFishing" | "traps" | "hunting" | "largeGame" | "birds" | "total";
export type Tier = "beginner" | "experienced";

export interface YieldTable {
  name: string;
  /** A row the table does not give is null. */
  rows: Record<TableRow, Record<Tier, Band> | null>;
}

const row = (beginner: Band, experienced: Band): Record<Tier, Band> => ({ beginner, experienced });

/** April, inland boreal forest. "About 0" for large game is a band of nothing. */
export const APRIL: YieldTable = {
  name: "April",
  rows: {
    plants: row(band(0, 150), band(100, 400)),
    fishing: row(band(0, 400), band(300, 1200)),
    passiveFishing: row(band(0, 500), band(800, 2500)),
    traps: row(band(0, 150), band(200, 700)),
    hunting: row(band(0, 100), band(150, 600)),
    largeGame: row(band(0, 0), band(300, 1500)),
    birds: row(band(0, 100), band(50, 300)),
    total: row(band(200, 800), band(1500, 3500)),
  },
};

/** Late August, the same country. Its fishing row folds hook and net; the passive row is the trap's share of the water, split out so the trap is measured on its own. */
export const LATE_AUGUST: YieldTable = {
  name: "late August",
  rows: {
    plants: row(band(300, 800), band(600, 1200)),
    fishing: row(band(200, 700), band(700, 1500)),
    passiveFishing: row(band(100, 400), band(400, 1000)),
    traps: row(band(0, 200), band(200, 700)),
    hunting: null,
    largeGame: row(band(0, 0), band(300, 1500)),
    birds: null,
    total: row(band(700, 1500), band(2000, 4000)),
  },
};

/**
 * The day the year turns from the spring table to the late-summer one, and
 * the same line the gate is drawn on: a run starting on or after it is
 * measured at the first snow rather than on a target day.
 */
export const MIDSUMMER_DOY = 182;

/** The table a checkpoint is read against: April until midsummer, late August after. */
export function tableFor(dayOfYear: number): YieldTable {
  return dayOfYear < MIDSUMMER_DOY ? APRIL : LATE_AUGUST;
}

/** The window the berries ripen and run out, doy-of-year, used by the pick task and the season spine alike. */
export const BERRY_FROM_DOY = 195;
export const BERRY_TO_DOY = 288;

/** Which table rows a ledger source answers to. The kit answers to none. */
export const SOURCE_ROWS: Record<YieldSource, TableRow[]> = {
  fish: ["fishing"],
  trap: ["passiveFishing"],
  snare: ["traps"],
  hunt: ["hunting", "largeGame"],
  berries: ["plants"],
  kit: [],
};

/** The band a source is measured against in a table: its rows' bands summed, or null when the table has none of them. */
export function sourceBand(table: YieldTable, source: YieldSource, tier: Tier): Band | null {
  let lo = 0;
  let hi = 0;
  let found = false;
  for (const r of SOURCE_ROWS[source]) {
    const b = table.rows[r];
    if (!b) continue;
    found = true;
    lo += b[tier].lo;
    hi += b[tier].hi;
  }
  return found ? band(lo, hi) : null;
}

/**
 * A day's burn living outside in the cold, and its shares: the resting burn
 * of a fit 70 kg adult, cold thermogenesis in clothing, and the work that
 * takes the day into the band. work is the ledger's activity and walk together.
 */
export const BURN = {
  day: band(2500, 3500),
  base: band(1600, 1800),
  cold: band(100, 300),
  work: band(700, 1700),
};

/** A night's sleep for a working adult. */
export const SLEEP_HOURS = band(7, 9);

/** Bilberries and lingonberries, and a hand picker at a good patch. The ceiling is the gut's, spec 5.2. */
export const BERRY = {
  kcalPerKg: band(400, 600),
  pickKgPerHour: band(0.5, 1.5),
  /** Kilos a day eaten at full credit. */
  fullCreditKg: 2,
  /** Kilos a day past which the body will not eat another. */
  refuseKg: 4,
};

export function verdict(value: number, b: Band): "in band" | "under" | "over" {
  if (value < b.lo) return "under";
  if (value > b.hi) return "over";
  return "in band";
}
