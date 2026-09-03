import type { Rng } from "../rng";
import type { IceMode } from "../world/route";
import type { Calendar } from "./calendar";
import type { Season, Weather } from "./types";

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

/** Ice above this bears a walker's weight without risk. */
export const ICE_SAFE_CM = 15;
/** Ice above this bears a walker's weight, but each crossed cell risks a fall. */
export const ICE_THIN_CM = 5;

export function iceMode(w: Weather): IceMode {
  if (w.iceCm >= ICE_SAFE_CM) return "safe";
  if (w.iceCm >= ICE_THIN_CM) return "thin";
  return "none";
}

/** Yesterday's mean sets today's ice: half a centimetre per freezing degree, two per thawing one. */
function stepIce(w: Weather, cal: Calendar): void {
  const mean = seasonalMean(cal.dayOfYear) + w.offset;
  if (mean < 0) w.iceCm += 0.5 * -mean;
  else w.iceCm = Math.max(0, w.iceCm - 2 * mean);
}

export interface WeatherEvents { coldSnap: boolean; precipStarted: boolean; precipStopped: boolean }

/** Advances precipitation and snow by dt minutes. dt is at most one minute. */
export function stepWeather(w: Weather, cal: Calendar, rng: Rng, dt: number): WeatherEvents {
  const ev: WeatherEvents = { coldSnap: false, precipStarted: false, precipStopped: false };
  if (cal.dayIndex > w.rolledDay && cal.hour >= cal.sunrise) {
    stepIce(w, cal);
    w.rolledDay = cal.dayIndex;
    // Winter anomalies lean cold: clear, still nights under a high sink far below the mean.
    w.offset = rng.gauss() * 4 - (cal.season === "winter" ? 3 : 0);
    w.clear = rng.chance(0.6);
    if (cal.season === "winter" && w.offset < -8) ev.coldSnap = true;
  }
  const ambient = ambientTemperature(cal, w);
  if (w.precip === "none") {
    if (rng.chance((START_PER_HOUR[cal.season] / 60) * dt)) {
      w.precip = rng.chance(0.3) ? "heavy" : "light";
      ev.precipStarted = true;
    }
  } else if (rng.chance((STOP_PER_HOUR / 60) * dt)) {
    w.precip = "none";
    ev.precipStopped = true;
  }
  if (w.precip !== "none" && ambient <= 0) {
    w.snowCm += (w.precip === "heavy" ? 1 / 20 : 1 / 40) * dt;
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
