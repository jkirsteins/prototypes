/**
 * How much light there is to work by, in lux, at a cell. The night is a
 * light level rather than a wall: sun, moon, cloud, snow and flame add up
 * to one number, and the work that cares reads it as odds.
 *
 * Every figure here is a published illuminance or is derived from a
 * published luminous flux, and the derivation is in the comment. The two
 * flame figures are the soft ones and are flagged for the sources audit.
 */
import type { World } from "../world/gen";
import { type Calendar, calendar, LATITUDE_DEG } from "./calendar";
import { discovery, VISITED } from "./regionstate";
import { cellOf } from "./position";
import type { GameState, RegionState } from "./types";

/** An overcast, starless night: the darkest the outdoors gets, and the reference dark for the odds. */
export const DARK_LUX = 0.0001;
/** Starlight on a clear moonless night. */
export const STARLIGHT_LUX = 0.002;
/** A full moon at the zenith, clear sky. Published range 0.05-0.3. */
export const FULL_MOON_LUX = 0.25;
/**
 * A moderate camp fire, about 500 lm, taken as a point source: 500/4pi =
 * 40 cd, so 20 lux at the 1.4 m a person sits and works at. Flagged for
 * the sources audit; the flux is the number to argue with.
 */
export const CAMP_FIRE_LUX = 20;
/**
 * A pine or birch-bark brand, about 100 lm: 8 cd, so 10 lux at arm's
 * length. Flagged for the sources audit alongside the fire.
 */
export const TORCH_LUX = 10;
/** Overcast transmits this much of the clear-sky sun. Published range 0.1-0.25. */
const OVERCAST_SUN = 0.15;
/** Cloud is far crueller to the small lights: a moon or the stars behind it are all but gone. */
const OVERCAST_NIGHT = 0.03;
/** Fresh snow's albedo, against about 0.15 for the forest floor and the heath. */
const SNOW_ALBEDO = 0.8;
const GROUND_ALBEDO = 0.15;
/** Snow deep enough to cover the ground it is lying on. */
const SNOW_LIT_CM = 2;

/**
 * Clear-sky horizontal illuminance against the sun's altitude in degrees,
 * log-interpolated between published values. The bottom of the table is
 * the end of astronomical twilight, under which the sun contributes
 * nothing and the stars are all that is left.
 */
const SUN_LUX: [number, number][] = [
  [-18, 0.0001], [-12, 0.008], [-6, 3.4], [-3, 50], [0, 400],
  [5, 8_000], [10, 15_000], [30, 50_000], [60, 100_000],
];

/** The solar declination on a day of the year, in radians; the same one `daylight()` uses. */
function declination(dayOfYear: number): number {
  return ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365);
}

/** Altitude in degrees of a body at declination `decl` and hour angle `H`, both radians, seen from this latitude. */
function altitude(decl: number, H: number): number {
  const lat = (LATITUDE_DEG * Math.PI) / 180;
  const sinH = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  return (Math.asin(Math.max(-1, Math.min(1, sinH))) * 180) / Math.PI;
}

/** The sun's hour angle in radians: 15 degrees an hour from solar noon, which this calendar puts at 13:00. */
function sunHourAngle(hour: number): number {
  return ((hour - 13) * 15 * Math.PI) / 180;
}

/** How high the sun stands, in degrees; negative below the horizon. */
export function sunAltitudeOf(cal: Calendar): number {
  return altitude(declination(cal.dayOfYear), sunHourAngle(cal.hour));
}

export function sunAltitude(minute: number, startDoy?: number): number {
  return sunAltitudeOf(calendar(minute, startDoy));
}

/**
 * How high the moon stands, in degrees. To first order the moon is the sun
 * displaced around the ecliptic by its phase: a full moon is opposite the
 * sun, twelve hours away in hour angle with its declination negated, which
 * is why a full moon rides high on a December night at this latitude and
 * skims the horizon in June.
 */
export function moonAltitude(cal: Calendar, phase = cal.moon): number {
  const decl = declination(cal.dayOfYear) * Math.cos(2 * Math.PI * phase);
  return altitude(decl, sunHourAngle(cal.hour) - 2 * Math.PI * phase);
}

/** Log-interpolation through a table of (x, lux) points, flat past either end. */
function luxAt(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return 0;
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, l1] = table[i];
    if (x > x1) continue;
    const [x0, l0] = table[i - 1];
    const t = (x - x0) / (x1 - x0);
    return 10 ** (Math.log10(l0) + t * (Math.log10(l1) - Math.log10(l0)));
  }
  return last[1];
}

/**
 * The light falling out of the sky, before any flame: the sun through what
 * cloud there is, the moon at its phase and altitude, the stars, and all of
 * it half again over snow, which throws back most of what lands on it.
 */
export function skyLux(cal: Calendar, clear: boolean, snowCm: number): number {
  const sun = luxAt(SUN_LUX, sunAltitudeOf(cal)) * (clear ? 1 : OVERCAST_SUN);
  const moonUp = Math.max(0, Math.sin((moonAltitude(cal) * Math.PI) / 180));
  const night = (FULL_MOON_LUX * cal.moonLight * moonUp + STARLIGHT_LUX) * (clear ? 1 : OVERCAST_NIGHT);
  const albedo = snowCm >= SNOW_LIT_CM ? SNOW_ALBEDO : GROUND_ALBEDO;
  const lit = (sun + night) * ((1 + albedo) / (1 + GROUND_ALBEDO));
  return Math.max(DARK_LUX, lit);
}

/** Every visited region's camp, so a fire cannot light a cell without its marker on the map or the reverse. */
export function visitedCamps(state: GameState): { id: number; st: RegionState; cell: number }[] {
  const out: { id: number; st: RegionState; cell: number }[] = [];
  for (const [idText, st] of Object.entries(state.regions)) {
    const id = Number(idText);
    if (discovery(state, id) !== VISITED) continue;
    out.push({ id, st, cell: st.campCell });
  }
  return out;
}

/** The light to work by at a cell: the sky, plus a lit fire at its own camp and a lit torch wherever it is carried. */
export function illuminance(state: GameState, world: World, cal: Calendar, cell: number): number {
  let lux = skyLux(cal, state.weather.clear, state.weather.snowCm);
  for (const c of visitedCamps(state)) if (c.cell === cell && c.st.fire.lit) lux += CAMP_FIRE_LUX;
  if (state.player.torch.lit && cellOf(state, world) === cell) lux += TORCH_LUX;
  return lux;
}

/**
 * The chance an attempt at this work comes off under this light: the floor
 * in the pitch dark, full odds once there is as much light as the work
 * honestly needs, and log-linear between, because that is how a hundredfold
 * more light feels like one step brighter.
 */
export function workOdds(lux: number, needLux: number, darkOdds: number): number {
  const span = Math.log10(needLux) - Math.log10(DARK_LUX);
  const t = (Math.log10(Math.max(DARK_LUX, lux)) - Math.log10(DARK_LUX)) / span;
  return Math.min(1, darkOdds + (1 - darkOdds) * Math.max(0, Math.min(1, t)));
}

/** What a person would call this much light. The lux itself is never shown. */
export function lightWord(lux: number): string {
  if (lux >= 10_000) return "daylight";
  if (lux >= 1_000) return "overcast";
  if (lux >= 100) return "twilight";
  if (lux >= 5) return "firelit";
  if (lux >= 0.05) return "moonlit";
  if (lux >= 0.0005) return "starlit";
  return "pitch dark";
}
