/**
 * Sleep, as the two processes a body runs on: a homeostatic pressure that
 * builds with every waking minute and is paid off only by sleeping, and a
 * circadian wave on the clock that says when that pressure is felt. Their
 * difference is sleepiness, and the bedtime, the wake, the length of a
 * night and the afternoon doze all fall out of it. Nothing here is a clock
 * rule: no bedtime, no cap, no dawn floor.
 *
 * The functions are pure but for the two that read the player's reserve.
 */
import { clamp } from "../units";
import type { Calendar } from "./calendar";
import { hasQuirk } from "./fears";
import type { GameState } from "./types";
import { stormNow } from "./weather";

/**
 * Hours the waking pressure takes to close its gap to the ceiling, and the
 * hours sleep takes to close its gap to zero: process S of the three-process
 * model of alertness (Akerstedt and Folkard), whose rise is 18.2 h and whose
 * fall is 4.2 h. Sleep pays four times as fast as waking builds, which is
 * why eight hours down pay for sixteen hours up and not the reverse.
 */
export const DEBT_RISE_HOURS = 18.2;
export const DEBT_FALL_HOURS = 4.2;

/**
 * The circadian process: a 24 hour wave peaking in the late afternoon and at
 * its lowest a few hours before dawn. Its peak is the same model's 16.8 h and
 * its amplitude that model's 2.5 units of a twelve-unit alertness range, as a
 * share of this codebase's 0..100 reserves.
 */
export const CIRCADIAN_PEAK_HOUR = 16.8;
export const CIRCADIAN_AMPLITUDE = 20;

/**
 * The twelve-hour ultradian wave riding on it, whose troughs are the
 * post-lunch dip and the small hours. Half a unit of the same twelve, and
 * phased so the dip sits at 14:30, an hour and a half past this clock's noon
 * of 13:00.
 */
export const ULTRADIAN_AMPLITUDE = 4;
export const ULTRADIAN_TROUGH_HOUR = 14.5;

/** Sleepiness at or above this and the body lies down. */
export const SLEEP_ONSET = 60;
/**
 * Sleepiness at or under this and a sleeping body wakes. The gap between the
 * two lines is hysteresis: without it a body would lie down at the first dip
 * of the evening and be up again at the first stir of the night.
 */
export const WAKE_AT = 25;

/**
 * Fatigue at which a body has done its day's work: the level a ten-hour day
 * ended on when the day was a count of hours. It is what the task drain is
 * scaled to, so the working day is this number and the person's own hours.
 */
export const SPENT_AT = 30;
/**
 * Fatigue at which an evening by the fire has done its job: about four hours
 * of rest above the spent line, which is the evening the fire actually
 * passes. A spent rest and a collapse both hold until here.
 */
export const RESTED_AT = 55;

/**
 * Sleepiness at which the body reads as visibly sleepy: ten points under the
 * onset line, so a player gets the yawn before the body lies down and has a
 * chance to do something about the evening.
 */
export const SLEEPY_AT = 50;

/** Ten minutes: the step the sleep task's length is searched in, fine enough that a wake lands within a rounded quarter hour. */
const WAKE_PROBE_STEP = 10;
/** No sleep task runs shorter than an hour or longer than fourteen: below the hour nothing is recovered, above it nobody lies still. */
export const SLEEP_MIN_MINUTES = 60;
export const SLEEP_MAX_MINUTES = 14 * 60;

/**
 * One step of the homeostatic process. Awake the debt closes its gap to 100,
 * asleep it closes its gap to 0; `halfRate` doubles the time asleep takes,
 * which is what a light sleeper gets out of a storm night.
 */
export function debtStep(debt: number, asleep: boolean, dt: number, halfRate = false): number {
  if (asleep) {
    const hours = DEBT_FALL_HOURS * (halfRate ? 2 : 1);
    return clamp(debt - (debt * dt) / (hours * 60), 0, 100);
  }
  return clamp(debt + ((100 - debt) * dt) / (DEBT_RISE_HOURS * 60), 0, 100);
}

/** The 24 hour wave alone. The hour need not be inside a day: both waves are periodic in it. */
export function circadian(hour: number): number {
  return CIRCADIAN_AMPLITUDE * Math.cos((2 * Math.PI * (hour - CIRCADIAN_PEAK_HOUR)) / 24);
}

/** The twelve-hour wave alone, negative at its troughs so the dip reads below the circadian line. */
export function ultradian(hour: number): number {
  return -ULTRADIAN_AMPLITUDE * Math.cos((4 * Math.PI * (hour - ULTRADIAN_TROUGH_HOUR)) / 24);
}

/**
 * How awake the clock alone says this body is. The phase is the clock's and
 * not the sun's: a rhythm is set by the year's light over weeks and holds
 * through a polar winter, so December's late dawn does not move the wake.
 */
export function alertness(hour: number): number {
  return circadian(hour) + ultradian(hour);
}

/** The one number the runner reads: pressure less the clock's alertness. */
export function sleepiness(debt: number, hour: number): number {
  return debt - alertness(hour);
}

/**
 * Minutes of sleep from now until the wake line, by stepping the two
 * processes forward. Bounded below at an hour and above at fourteen.
 */
export function minutesToWake(debt: number, hour: number, halfRate = false): number {
  let d = debt;
  for (let m = WAKE_PROBE_STEP; m <= SLEEP_MAX_MINUTES; m += WAKE_PROBE_STEP) {
    d = debtStep(d, true, WAKE_PROBE_STEP, halfRate);
    if (m >= SLEEP_MIN_MINUTES && sleepiness(d, hour + m / 60) <= WAKE_AT) return m;
  }
  return SLEEP_MAX_MINUTES;
}

/** A light sleeper on a storm night clears debt at half the rate: the quirk's rule, on the process that now carries it. */
export function debtFallHalved(state: GameState): boolean {
  return hasQuirk(state, "sleepsLight") && stormNow(state.weather, state.minute);
}

/** How long a sleep started now would run: the model's minutes to the wake line for this body. */
export function sleepMinutes(state: GameState, cal: Calendar): number {
  return minutesToWake(state.player.sleepDebt, cal.hour, debtFallHalved(state));
}
