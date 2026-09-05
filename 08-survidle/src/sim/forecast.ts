/**
 * The risk forecast (roadmap item B): the game itself run forward from
 * the current state, several times with different dice, and the deaths
 * counted per horizon. Every run goes through advance with the orders,
 * the needs and the stocks exactly as the live game has them, so a
 * change to the runner changes the forecast by construction.
 */
import { derive } from "../rng";
import { GAME_MINUTES_PER_REAL_SECOND } from "../units";
import type { World } from "../world/gen";
import { advance } from "./advance";
import { dayNumber, minutesUntilDawn } from "./calendar";
import type { DeathCause, GameState } from "./types";

/** Runs per horizon: enough to say "7 of 10", few enough for a month row in a few seconds. */
export const FORECAST_RUNS = 10;

export type HorizonId = "away" | "tonight" | "week" | "month";
export interface Horizon { id: HorizonId; minutes: number }

export interface ForecastRow {
  id: HorizonId;
  runs: number;
  died: number;
  /** The commonest cause among the dead; a tie goes to the cause whose median death came soonest, then to CAUSES order. Null when none died. */
  cause: DeathCause | null;
  /** The median day of death among the dead, the forecast's own day being 1. Null when none died. */
  day: number | null;
}

/** The word the panel prints for a cause. */
export const CAUSE_WORD: Record<DeathCause, string> = {
  starved: "starved", froze: "cold", wolves: "wolves", sickness: "sickness", thirst: "thirst", smoke: "smoke", drowned: "drowned", gaveUp: "gave up",
};
const CAUSES = Object.keys(CAUSE_WORD) as DeathCause[];

/** The four horizons in order: the away dial, the next dawn, a week, a month. */
export function horizons(state: GameState): Horizon[] {
  return [
    { id: "away", minutes: state.awayHours * 3600 * GAME_MINUTES_PER_REAL_SECOND },
    { id: "tonight", minutes: minutesUntilDawn(state.minute, state.startDoy) },
    { id: "week", minutes: 7 * 1440 },
    { id: "month", minutes: 30 * 1440 },
  ];
}

function median(sorted: number[]): number {
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** One horizon, `runs` times, each run on a clone of the state with its own dice. */
export function forecastRow(state: GameState, world: World, horizon: Horizon, runs = FORECAST_RUNS): ForecastRow {
  const deaths: { cause: DeathCause; day: number }[] = [];
  for (let k = 0; k < runs; k++) {
    const s = structuredClone(state);
    s.rng = derive(state.rng, k);
    // A day at a time, so a run that dies stops costing.
    for (let left = horizon.minutes; left > 0 && !s.dead; left -= 1440) advance(s, world, Math.min(1440, left));
    if (s.dead) deaths.push({ cause: s.dead.cause, day: dayNumber(s.dead.minute) - dayNumber(state.minute) + 1 });
  }
  if (deaths.length === 0) return { id: horizon.id, runs, died: 0, cause: null, day: null };
  let best: { cause: DeathCause; n: number; day: number } | null = null;
  for (const c of CAUSES) {
    const days = deaths.filter((d) => d.cause === c).map((d) => d.day).sort((a, b) => a - b);
    if (days.length === 0) continue;
    const day = median(days);
    if (!best || days.length > best.n || (days.length === best.n && day < best.day)) best = { cause: c, n: days.length, day };
  }
  return { id: horizon.id, runs, died: deaths.length, cause: best!.cause, day: median(deaths.map((d) => d.day).sort((a, b) => a - b)) };
}

/** Every horizon in order. Synchronous; the worker calls forecastRow one horizon at a time instead. */
export function forecast(state: GameState, world: World, runs = FORECAST_RUNS): ForecastRow[] {
  return horizons(state).map((h) => forecastRow(state, world, h, runs));
}
