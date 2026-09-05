/**
 * The game's facts the beacon sends, read from the state and the life
 * record: nothing here is a simulation change, and nothing here names
 * the vendor. Every action carries the common facts; the specific ones
 * add what their bar needs and no more.
 */
import { calendar } from "../sim/calendar";
import { current } from "../sim/record";
import type { DeathCause, GameState } from "../sim/types";

/** What the device remembers beside the save, outside the world so a new seed keeps it. */
export interface BeaconRecord {
  id: string;
  on: boolean;
  tester: boolean;
  cohort: string | null;
  /** Wall-clock milliseconds of the last death seen, for the time it took to begin again. */
  diedAt: number | null;
  /** Visible minutes in one life, and which world and life that count belongs to. */
  attention: { seed: number; survivor: number; minutes: number };
}

export interface Common { seed: number; survivor: number; day: number; tester: boolean; cohort: string | null }

export function common(state: GameState, rec: BeaconRecord): Common {
  return { seed: state.seed, survivor: current(state).index, day: calendar(state.minute, state.startDoy).day, tester: rec.tester, cohort: rec.cohort };
}

/** The last month number the forecast wrote into this life, or null before the first. */
export function monthNumber(state: GameState): number | null {
  const f = current(state).forecast;
  for (let i = f.length - 1; i >= 0; i--) if (f[i] !== null) return f[i];
  return null;
}

export function openedFacts(state: GameState, rec: BeaconRecord): Common & { month: number | null } {
  return { ...common(state, rec), month: monthNumber(state) };
}

export function diedFacts(state: GameState, rec: BeaconRecord): Common & { cause: DeathCause; daysSurvived: number; attentionMin: number } {
  const c = common(state, rec);
  const died = current(state).died;
  const cause = died?.cause ?? state.dead?.cause ?? "gaveUp";
  const daysSurvived = died?.day ?? c.day;
  const attentionMin = rec.attention.seed === c.seed && rec.attention.survivor === c.survivor ? rec.attention.minutes : 0;
  return { ...c, cause, daysSurvived, attentionMin };
}

export function beganAgainFacts(state: GameState, rec: BeaconRecord, now: number): Common & { sinceDeathSec: number | null } {
  return { ...common(state, rec), sinceDeathSec: rec.diedAt === null ? null : Math.round((now - rec.diedAt) / 1000) };
}
