import type { Season } from "./types";

/** The run begins on 1 April at 08:00. Day-of-year is 0-based. */
export const START_DOY = 90;
export const START_MINUTE_OF_DAY = 8 * 60;

/** Days survived, 1-based, from the minute alone: the ledger's key, cheap enough to read every minute. */
export function dayNumber(minute: number): number {
  return Math.floor((minute + START_MINUTE_OF_DAY) / 1440) + 1;
}
export const LATITUDE_DEG = 62;
export const SYNODIC_DAYS = 29.530588;
/** Day index of a new moon, chosen so the run's first full moon is 3 April. */
const NEW_MOON_DAY = -12.4;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "April" for month 3. */
export function monthName(month: number): string {
  return MONTH_FULL[((month % 12) + 12) % 12];
}

/** 0 at new, 0.5 at full, in [0, 1). */
export function moonPhase(minute: number): number {
  const days = (minute + START_MINUTE_OF_DAY) / 1440;
  const p = ((days - NEW_MOON_DAY) / SYNODIC_DAYS) % 1;
  return p < 0 ? p + 1 : p;
}

/** Lit share of the disc, 0 at new to 1 at full. */
export function moonIllumination(minute: number): number {
  return (1 - Math.cos(2 * Math.PI * moonPhase(minute))) / 2;
}

export interface Calendar {
  /** Days survived, 1-based. */
  day: number;
  /** Absolute day index since the start, 0-based, counting from the day the run began. */
  dayIndex: number;
  /** Hour of day, fractional. */
  hour: number;
  dayOfYear: number;
  month: number;
  dayOfMonth: number;
  season: Season;
  daylightHours: number;
  sunrise: number;
  sunset: number;
  isNight: boolean;
  /** phase, 0 new to 0.5 full */
  moon: number;
  /** illumination 0..1 */
  moonLight: number;
}

export function calendar(minute: number): Calendar {
  const abs = minute + START_MINUTE_OF_DAY;
  const dayIndex = Math.floor(abs / 1440);
  const hour = (abs - dayIndex * 1440) / 60;
  const dayOfYear = (((START_DOY + dayIndex) % 365) + 365) % 365;
  let month = 0;
  let d = dayOfYear;
  while (d >= MONTH_DAYS[month]) {
    d -= MONTH_DAYS[month];
    month++;
  }
  const daylightHours = daylight(dayOfYear);
  const sunrise = 13 - daylightHours / 2;
  const sunset = 13 + daylightHours / 2;
  return {
    day: dayIndex + 1,
    dayIndex,
    hour,
    dayOfYear,
    month,
    dayOfMonth: d + 1,
    season: seasonOf(month),
    daylightHours,
    sunrise,
    sunset,
    isNight: hour < sunrise || hour >= sunset,
    moon: moonPhase(minute),
    moonLight: moonIllumination(minute),
  };
}

export function seasonOf(month: number): Season {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

/** Hours of daylight at LATITUDE_DEG from the standard sunrise equation. */
export function daylight(dayOfYear: number): number {
  const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365);
  const lat = (LATITUDE_DEG * Math.PI) / 180;
  const cosH = -Math.tan(lat) * Math.tan(decl);
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return (2 * Math.acos(cosH) * 180) / Math.PI / 15;
}

export function fmtClock(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtDate(cal: Calendar): string {
  return `${cal.dayOfMonth} ${MONTH_NAMES[cal.month]}`;
}

/** Minutes from `minute` until the next sunrise. */
export function minutesUntilDawn(minute: number): number {
  const cal = calendar(minute);
  const today = cal.sunrise * 60 - cal.hour * 60;
  if (today > 0) return today;
  const tomorrow = calendar(minute + 1440);
  return (24 - cal.hour) * 60 + tomorrow.sunrise * 60;
}
