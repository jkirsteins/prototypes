import type { Rng } from "../rng";
import { fmtDuration } from "../units";
import { calendar, type Calendar } from "./calendar";
import { hasQuirk } from "./fears";
import { survivedStorms } from "./record";
import { skillLevel } from "./skills";
import type { GameState, IceMode, Season, Weather } from "./types";

export type StormKind = "rain" | "snow" | "gale";

export interface ForecastKnowledge {
  stage: 0 | 1 | 2 | 3;
  coming: boolean;
  arrivalMinute: number | null;
  kind: StormKind | null;
  severity: "heavy" | null;
  durationMinutes: number | null;
}

export const NO_FORECAST_KNOWLEDGE: ForecastKnowledge = {
  stage: 0,
  coming: false,
  arrivalMinute: null,
  kind: null,
  severity: null,
  durationMinutes: null,
};

/** Precipitation at onset uses the same freezing threshold as fire burn. */
export function precipitationStormKind(w: Weather, cal: Calendar): "rain" | "snow" {
  return ambientTemperature(cal, { ...w, precip: "heavy" }) <= 0 ? "snow" : "rain";
}

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
 * Snow on the ground. Fresh snow lays a quarter of the fall: 0.375 cm an
 * hour in light snow, 0.75 in heavy. The pack settles five percent of its
 * depth at each day roll. Melting above 2 C stays at 2 cm an hour. Fall and
 * settle together aim at a 62 N inland January of 40 to 60 cm.
 *
 * The current reading: January runs 25, 29 and 46 cm on the year probe's
 * three seeds and 32, 28, 31 and 31 on the winter gate's four - one of the
 * seven in the band, mean about 32, under it. The constant stays at 0.05
 * rather than chasing the band, because across this branch's other
 * changes the depth moved with the runner and the reference list, not with
 * the settle rate.
 */
export const SNOW_CM_PER_MINUTE = { light: 1 / 160, heavy: 1 / 80 } as const;
export const SNOW_SETTLE_PER_DAY = 0.05;

/** Daily chance of a storm rolling in, by season. */
const STORM_CHANCE: Record<Season, number> = { spring: 0.04, summer: 0.02, autumn: 0.04, winter: 0.08 };

export interface StormConstraints {
  minLead?: number;
  maxLead?: number;
  maxDuration?: number;
  kinds?: readonly StormKind[];
}

/** One storm factory for both ordinary dawn weather and constrained teaching weather. */
export function createStorm(
  w: Weather,
  cal: Calendar,
  rng: Rng,
  minute: number,
  source: "natural" | "synthetic",
  constraints: StormConstraints = {},
): NonNullable<Weather["storm"]> | null {
  const minLead = Math.max(60, Math.ceil(constraints.minLead ?? 60));
  const maxLead = Math.floor(constraints.maxLead ?? Math.max(180, minLead));
  const startDoy = cal.dayOfYear - cal.dayIndex;
  const allowed = constraints.kinds;
  const leads: number[] = [];
  for (let lead = minLead; lead <= maxLead; lead++) {
    const precip = precipitationStormKind(w, calendar(minute + lead, startDoy));
    if (!allowed || allowed.includes("gale") || allowed.includes(precip)) leads.push(lead);
  }
  if (leads.length === 0) return null;
  const lead = constraints.minLead === undefined && constraints.maxLead === undefined
    ? 60 + rng.int(121)
    : leads[rng.int(leads.length)];
  const from = minute + lead;
  const precip = precipitationStormKind(w, calendar(from, startDoy));
  const maxDuration = Math.min(1080, Math.floor(constraints.maxDuration ?? 1080));
  let roll: number;
  if (!allowed && constraints.maxDuration === undefined) {
    roll = rng.int(721 * 5);
  } else {
    const rolls: number[] = [];
    for (let candidate = 0; candidate < 721 * 5; candidate++) {
      const duration = 360 + Math.floor(candidate / 5);
      const kind = candidate % 5 === 0 ? "gale" : precip;
      if (duration <= maxDuration && (!allowed || allowed.includes(kind))) rolls.push(candidate);
    }
    if (rolls.length === 0) return null;
    roll = rolls[rng.int(rolls.length)];
  }
  const kind: StormKind = roll % 5 === 0 ? "gale" : precip;
  const storm = {
    id: w.nextStormId++,
    source,
    kind,
    from,
    until: from + 360 + Math.floor(roll / 5),
    warned: false,
  };
  w.storm = storm;
  return storm;
}

/** True while a storm is blowing at this minute. */
export function stormNow(w: Weather, minute: number): boolean {
  return w.storm !== null && minute >= w.storm.from && minute < w.storm.until;
}

/** Observations last until sunrise, including the hours across midnight. */
function skyReadDayAt(state: GameState, minute: number): number {
  const cal = calendar(minute, state.startDoy);
  return cal.dayIndex - (cal.hour < cal.sunrise ? 1 : 0);
}

export function skyReadDay(state: GameState): number {
  return skyReadDayAt(state, state.minute);
}

/** Practice, lived weather and deliberate observation all buy time to prepare. */
function warningMinutesAt(state: GameState, minute: number): number {
  return 60 + 5 * (skillLevel(state, "weatherSense") - 1)
    + 10 * Math.min(6, survivedStorms(state))
    + (hasQuirk(state, "weatherEye") ? 30 : 0)
    + (state.player.skyReadDay === skyReadDayAt(state, minute) ? 30 : 0);
}

export function warningMinutes(state: GameState): number {
  return warningMinutesAt(state, state.minute);
}

export function forecastStage(state: GameState): 1 | 2 | 3 {
  const minutes = warningMinutes(state);
  return minutes >= 180 ? 3 : minutes >= 120 ? 2 : 1;
}

/** Facts this survivor can currently know about this particular future storm. */
export function forecastKnowledge(
  state: GameState,
  storm: NonNullable<Weather["storm"]>,
  minute = state.minute,
): ForecastKnowledge {
  const warning = warningMinutesAt(state, minute);
  const stage = warning >= 180 ? 3 : warning >= 120 ? 2 : 1;
  if (minute >= storm.from && minute < storm.until) {
    const activeStage = Math.max(2, stage) as 2 | 3;
    return {
      stage: activeStage,
      coming: false,
      arrivalMinute: storm.from,
      kind: storm.kind,
      severity: "heavy",
      durationMinutes: activeStage === 3 ? storm.until - storm.from : null,
    };
  }
  if (minute < storm.from - warning || minute > storm.from) return { ...NO_FORECAST_KNOWLEDGE };
  return {
    stage,
    coming: true,
    arrivalMinute: stage >= 2 ? storm.from : null,
    kind: stage >= 2 ? storm.kind : null,
    severity: stage >= 2 ? "heavy" : null,
    durationMinutes: stage >= 3 ? storm.until - storm.from : null,
  };
}

export function sameForecastKnowledge(a: ForecastKnowledge, b: ForecastKnowledge): boolean {
  return a.stage === b.stage && a.coming === b.coming && a.arrivalMinute === b.arrivalMinute
    && a.kind === b.kind && a.severity === b.severity && a.durationMinutes === b.durationMinutes;
}

/** A lesson is earned only when an observation turns an unknown fact into a known one. */
export function gainedForecastFact(before: ForecastKnowledge, after: ForecastKnowledge): boolean {
  return (!before.coming && after.coming)
    || (before.arrivalMinute === null && after.arrivalMinute !== null)
    || (before.kind === null && after.kind !== null)
    || (before.severity === null && after.severity !== null)
    || (before.durationMinutes === null && after.durationMinutes !== null);
}

/** True when this survivor can read a storm that has not started yet. */
export function stormComing(state: GameState): boolean {
  const storm = state.weather.storm;
  return storm !== null && state.minute >= storm.from - warningMinutes(state) && state.minute < storm.from;
}

/** Only known forecast facts, shared by observations, warnings and the weather wall. */
export function forecastText(state: GameState): string {
  const storm = state.weather.storm;
  const blowing = stormNow(state.weather, state.minute);
  if (!storm) return "";
  if (!blowing && !stormComing(state)) {
    const opportunity = state.goals.opportunity;
    return opportunity?.goal === "readWeather" && opportunity.status === "announced"
      && opportunity.stormId === storm.id && state.minute < storm.from
      ? "conditions are changing"
      : "";
  }
  const stage = blowing ? forecastStage(state) : forecastKnowledge(state, storm).stage;
  if (stage === 1) return blowing ? "storm" : "a storm is coming";
  const arrival = blowing ? "" : ` in ${fmtDuration(storm.from - state.minute)}`;
  const duration = stage === 3
    ? blowing ? `, ${fmtDuration(storm.until - state.minute)} left` : `, lasting ${fmtDuration(storm.until - storm.from)}`
    : "";
  return `heavy ${storm.kind} storm${arrival}${duration}`;
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
 * Advances precipitation and snow by dt minutes. Production calls arrive from
 * advance's fixed one-minute tick, subdivided only at an exact storm onset;
 * direct unit callers may use any dt up to one.
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
      createStorm(w, cal, rng, minute, "natural");
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
    w.stormFreeSince = minute;
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
