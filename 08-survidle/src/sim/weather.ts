import type { Rng } from "../rng";
import type { Calendar } from "./calendar";
import type { IceMode, Season, Weather } from "./types";

/** Mean temperature over the year at 62 N inland: +15 in mid-July, -9 in mid-January, about 0 on 1 April. */
export function seasonalMean(dayOfYear: number): number {
  return 3 + 12 * Math.cos((2 * Math.PI * (dayOfYear - 200)) / 365);
}

export function ambientTemperature(cal: Calendar, w: Weather): number {
  const amp = w.precip !== "none" ? 1.5 : w.clear ? 4 : 2.5;
  const diurnal = amp * Math.cos((2 * Math.PI * (cal.hour - 15)) / 24);
  const precip = w.precip !== "none" ? -2 : 0;
  return seasonalMean(cal.dayOfYear) + diurnal + w.offset + precip;
}

const START_PER_HOUR: Record<Season, number> = { spring: 0.04, summer: 0.03, autumn: 0.04, winter: 0.05 };
const STOP_PER_HOUR = 0.25;
export const DEEP_SNOW_CM = 30;

/**
 * Snow on the ground. Fresh snow lays 0.375 cm an hour in light snow and
 * 0.75 in heavy, a quarter of the old rates, and the pack settles five
 * percent of its depth at each day roll; together they hold a 62 N inland
 * January at 40 to 60 cm where it read 79 to 271 (the year loop's first
 * flag). Melting above 2 C stays at 2 cm an hour.
 *
 * The settle constant was walked from 0.02 in steps of 0.005 against
 * `npm run year -- 17 19 42 79`. At 0.02 the pack never stopped growing
 * (1 Jan 47/63 cm on seeds 42/79, 1 Feb 97/108). At 0.05, 1 January reads
 * seed 17 at 28 cm, seed 42 at 42, seed 79 at 42 (seed 19 always dies in
 * May, before any snow); 1 February reads seed 42 at 43 and seed 79 at 45
 * (seed 17 freezes on day 300, before its February line). That is not the
 * brief's literal stop condition (all four seeds in 40 to 60): seed 17's
 * January reading sits under the band. Nearby steps did not fix it -
 * 0.04, 0.045 and 0.06 each pulled a different seed further out instead of
 * narrowing the spread, so this is not a monotonic function of the
 * constant across this seed set. The other four readings are 42 to 45 and
 * the five-reading mean is 40, and the controller's dispatch note allowed
 * a seed or two outside the band when the mean is inside, so the constant
 * stayed at 0.05 rather than chasing seed 17 alone.
 */
export const SNOW_CM_PER_MINUTE = { light: 1 / 160, heavy: 1 / 80 } as const;
export const SNOW_SETTLE_PER_DAY = 0.05;

/** Daily chance of a storm rolling in, by season. */
const STORM_CHANCE: Record<Season, number> = { spring: 0.04, summer: 0.02, autumn: 0.04, winter: 0.08 };

/** True while a storm is blowing at this minute. */
export function stormNow(w: Weather, minute: number): boolean {
  return w.storm !== null && minute >= w.storm.from && minute < w.storm.until;
}

/** True in the hour before a storm starts, for the one warning. */
export function stormComing(w: Weather, minute: number): boolean {
  return w.storm !== null && minute >= w.storm.from - 60 && minute < w.storm.from;
}

/** Ice above this bears a walker's weight without risk. */
export const ICE_SAFE_CM = 15;
/** Ice above this bears a walker's weight, but each crossed cell risks a fall. */
export const ICE_THIN_CM = 5;

export function iceMode(w: Weather): IceMode {
  if (w.iceCm >= ICE_SAFE_CM) return "safe";
  if (w.iceCm >= ICE_THIN_CM) return "thin";
  return "none";
}

/** The ice a plain walk (never asking for the thin-ice shortcut) may cross: safe ice, or none. */
export function walkableIce(w: Weather): IceMode {
  return iceMode(w) === "safe" ? "safe" : "none";
}

/**
 * Yesterday's mean sets today's ice, by Stefan's law: thickness squared
 * grows by 7.2 per freezing degree-day, so it thickens fast when thin and
 * slowly when thick (a real ice sheet, not a linear one). Melting stays
 * linear: two centimetres off per thawing degree.
 */
function stepIce(w: Weather, cal: Calendar): void {
  const mean = seasonalMean(cal.dayOfYear) + w.offset;
  if (mean < 0) w.iceCm = Math.sqrt(w.iceCm * w.iceCm + 7.2 * -mean);
  else w.iceCm = Math.max(0, w.iceCm - 2 * mean);
}

export interface WeatherEvents { coldSnap: boolean; precipStarted: boolean; precipStopped: boolean }

/**
 * Advances precipitation and snow by dt minutes. dt is at most one minute.
 * `minute` defaults from `cal` for callers that have not adopted it.
 */
export function stepWeather(w: Weather, cal: Calendar, rng: Rng, dt: number, minute = cal.dayIndex * 1440 + cal.hour * 60): WeatherEvents {
  const ev: WeatherEvents = { coldSnap: false, precipStarted: false, precipStopped: false };
  if (cal.dayIndex > w.rolledDay && cal.hour >= cal.sunrise) {
    stepIce(w, cal);
    w.snowCm *= 1 - SNOW_SETTLE_PER_DAY;
    w.rolledDay = cal.dayIndex;
    // Winter anomalies lean cold: clear, still nights under a high sink far below the mean.
    w.offset = rng.gauss() * 4 - (cal.season === "winter" ? 3 : 0);
    w.clear = rng.chance(0.6);
    if (cal.season === "winter" && w.offset < -8) ev.coldSnap = true;
    // A day with rain resets the drought count and its warning; a dry one runs it up.
    if (w.wetDay) {
      w.dryDays = 0;
      w.dryWarned = false;
    } else {
      w.dryDays += 1;
    }
    // A storm running across the roll counts today as wet from the moment it rolls,
    // not just from whatever transition into rain happens to land on this same minute.
    w.wetDay = w.precip !== "none";
    if (!w.storm && rng.chance(STORM_CHANCE[cal.season])) {
      const from = minute + 60 + rng.int(121);
      w.storm = { from, until: from + 360 + rng.int(721), warned: false };
    }
  }
  const ambient = ambientTemperature(cal, w);
  if (stormNow(w, minute)) {
    if (w.precip !== "heavy") {
      w.precip = "heavy";
      ev.precipStarted = true;
      w.wetDay = true;
    }
  } else if (w.storm && minute >= w.storm.until) {
    w.storm = null;
    if (w.precip !== "none") {
      w.precip = "none";
      ev.precipStopped = true;
    }
  } else if (w.precip === "none") {
    if (rng.chance((START_PER_HOUR[cal.season] / 60) * dt)) {
      w.precip = rng.chance(0.3) ? "heavy" : "light";
      ev.precipStarted = true;
      w.wetDay = true;
    }
  } else if (rng.chance((STOP_PER_HOUR / 60) * dt)) {
    w.precip = "none";
    ev.precipStopped = true;
  }
  if (w.precip !== "none" && ambient <= 0) {
    w.snowCm += (w.precip === "heavy" ? SNOW_CM_PER_MINUTE.heavy : SNOW_CM_PER_MINUTE.light) * dt;
  } else if (ambient > 2 && w.snowCm > 0) {
    w.snowCm = Math.max(0, w.snowCm - dt / 30);
  }
  return ev;
}

export function isSnowing(w: Weather, ambient: number): boolean {
  return w.precip !== "none" && ambient <= 0;
}

export function weatherLabel(w: Weather, ambient: number): string {
  if (w.precip === "none") return w.clear ? "clear" : "overcast";
  const kind = ambient <= 0 ? "snow" : "rain";
  return w.precip === "heavy" ? `heavy ${kind}` : `light ${kind}`;
}
