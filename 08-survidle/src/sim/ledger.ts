/**
 * The kcal ledger (calibration pass spec, section 1): one record per game
 * day of what the body made, ate and burned, and how it spent its hours.
 * Every kcal the game moves passes through three seams - the food effects
 * for yield, eat() for intake, stepPlayer for burn - and each seam calls
 * one credit here. Nothing else writes to state.ledger. The report reads
 * the week before a checkpoint against the roadmap's tables, and the
 * survivor loop's epitaph and away report read the same records later.
 */
import { dayNumber } from "./calendar";
import type { GameState } from "./types";

export type YieldSource = "fish" | "snare" | "hunt" | "berries" | "kit";
export const YIELD_SOURCES: YieldSource[] = ["fish", "snare", "hunt", "berries", "kit"];

export interface BurnBuckets { base: number; activity: number; walk: number; cold: number; sick: number }

export interface DayLedger {
  /** Days survived, 1-based. */
  day: number;
  /** Gross kcal of the edible form each source produced. */
  yield: Record<YieldSource, number>;
  /** kcal eat() credited. */
  eaten: number;
  burn: BurnBuckets;
  sleepMin: number;
  /** Minutes awake on a task other than rest, wait or camping for the night. */
  workMin: number;
}

/** Per-day averages over the records found, and how many there were. */
export interface WeekAverage {
  days: number;
  yield: Record<YieldSource, number>;
  eaten: number;
  burn: BurnBuckets;
  sleepMin: number;
  workMin: number;
}

export function emptyYield(): Record<YieldSource, number> {
  return { fish: 0, snare: 0, hunt: 0, berries: 0, kit: 0 };
}

export function emptyBurn(): BurnBuckets {
  return { base: 0, activity: 0, walk: 0, cold: 0, sick: 0 };
}

function newDay(day: number): DayLedger {
  return { day, yield: emptyYield(), eaten: 0, burn: emptyBurn(), sleepMin: 0, workMin: 0 };
}

/** Today's record, pushed fresh the first time the day is read. */
export function today(state: GameState): DayLedger {
  const day = dayNumber(state.minute);
  const last = state.ledger[state.ledger.length - 1];
  if (last && last.day === day) return last;
  const d = newDay(day);
  state.ledger.push(d);
  return d;
}

export function creditYield(state: GameState, source: YieldSource, kcal: number): void {
  today(state).yield[source] += kcal;
}

export function creditEaten(state: GameState, kcal: number): void {
  today(state).eaten += kcal;
}

export function creditBurn(state: GameState, burn: BurnBuckets): void {
  const b = today(state).burn;
  b.base += burn.base;
  b.activity += burn.activity;
  b.walk += burn.walk;
  b.cold += burn.cold;
  b.sick += burn.sick;
}

export function creditTime(state: GameState, kind: "sleep" | "work" | "idle", minutes: number): void {
  const d = today(state);
  if (kind === "sleep") d.sleepMin += minutes;
  else if (kind === "work") d.workMin += minutes;
}

/** The seven records before `day` (days day-7 to day-1), averaged per day; zeros when there are none. */
export function weekBefore(ledger: DayLedger[], day: number): WeekAverage {
  const rows = ledger.filter((d) => d.day >= day - 7 && d.day < day);
  const n = rows.length;
  const sum: WeekAverage = { days: n, yield: emptyYield(), eaten: 0, burn: emptyBurn(), sleepMin: 0, workMin: 0 };
  if (n === 0) return sum;
  // Sum first and divide once at the end: dividing per row and accumulating
  // the fractions drifts off exact values (50/7 seven times over is not 50).
  for (const r of rows) {
    for (const s of YIELD_SOURCES) sum.yield[s] += r.yield[s];
    sum.eaten += r.eaten;
    for (const k of Object.keys(sum.burn) as (keyof BurnBuckets)[]) sum.burn[k] += r.burn[k];
    sum.sleepMin += r.sleepMin;
    sum.workMin += r.workMin;
  }
  for (const s of YIELD_SOURCES) sum.yield[s] /= n;
  sum.eaten /= n;
  for (const k of Object.keys(sum.burn) as (keyof BurnBuckets)[]) sum.burn[k] /= n;
  sum.sleepMin /= n;
  sum.workMin /= n;
  return sum;
}
