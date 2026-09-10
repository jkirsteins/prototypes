import type { Rng } from "../rng";
import { fmtDuration } from "../units";
import { regionPeek, type World } from "../world/gen";
import { LATTICE, LATTICE_W } from "../world/terrain";
import { calendar, START_MINUTE_OF_DAY, type Calendar } from "./calendar";
import { sampleAtmosphere } from "./climate";
import { hasQuirk } from "./fears";
import { survivedStorms } from "./record";
import { skillLevel } from "./skills";
import type { AtmosphereSample, GameState, IceMode, LocalGroundWeather, Season, Weather, WeatherWorld } from "./types";

export function newWeather(startDoy: number): WeatherWorld {
  return { version: 2, startDoy, ground: {}, elapsedMinutes: 0, precip: "none", clear: true, offset: 0, snowCm: 0, iceCm: 0,
    rolledDay: 0, nextStormId: 1, stormFreeSince: 0, storm: null, dryDays: 0, wetDay: false, dryWarned: false };
}

export function rebaseWeather(state: GameState): void { state.weather.elapsedMinutes += state.minute; }

/** Upgrades only persistent cover. Atmospheric observations are resampled on the next tick. */
export function migrateWeather(state: GameState): void {
  state.weather.nextStormId ??= (state.weather.storm?.id ?? 0) + 1;
  state.weather.stormFreeSince ??= 0;
  if (state.weather.version === 2) return;
  const old = state.weather;
  const weather = newWeather(state.startDoy);
  for (const id of Object.keys(state.regions)) weather.ground[Number(id)] = {
    updatedHour: Math.floor(state.minute / 60), snowCm: old.snowCm ?? 0, iceCm: old.iceCm ?? 0,
    dryHours: (old.dryDays ?? 0) * 24, surfaceWaterMm: old.wetDay ? 1 : 0,
    soilMoisture: old.wetDay ? 0.5 : 0.1, frost: 0, temperatureSum: 0, temperatureHours: 0,
  };
  state.weather = weather;
}

function groundPosition(region: number): { x: number; y: number } {
  return { x: (region % LATTICE_W + 0.5) * LATTICE, y: (Math.floor(region / LATTICE_W) + 0.5) * LATTICE };
}

function initialGround(state: GameState, world: World, region: number): LocalGroundWeather {
  const { x, y } = groundPosition(region);
  const temperature = sampleAtmosphere(state.weather, world, 0, x, y).temperatureC;
  // A seasonal seed at the run's origin, shared by early and late first visits.
  // Negative degree-days seed winter cover without replaying gameplay or drawing dice.
  return { updatedHour: 0, snowCm: Math.max(0, -temperature * 2), iceCm: Math.sqrt(7.2 * Math.max(0, -temperature) * 14),
    surfaceWaterMm: 0, soilMoisture: temperature > 0 ? 0.35 : 0.5, frost: temperature < 0 ? 0.5 : 0,
    dryHours: 0, temperatureSum: 0, temperatureHours: 0 };
}

interface GroundReadMemo {
  sampler: typeof sampleAtmosphere;
  world: World;
  seed: number;
  startDoy: number;
  values: Map<number, LocalGroundWeather>;
}

// Untouched neighbouring regions can be read many times by one daily ecology
// pass. Keep one shadow trajectory per absent region, bounded by the finite
// world-region count; persisted records below always remain authoritative.
const groundReadMemo = new WeakMap<GameState, GroundReadMemo>();

/** Read/catch up a copy. Never adds records or changes a stored ground value. */
export function groundAt(state: GameState, world: World, region: number): LocalGroundWeather {
  const hour = Math.floor((state.minute + state.weather.elapsedMinutes) / 60);
  const stored = state.weather.ground[region];
  let memo: GroundReadMemo | undefined;
  let shadow: LocalGroundWeather | undefined;
  if (!stored) {
    memo = groundReadMemo.get(state);
    if (!memo || memo.sampler !== sampleAtmosphere || memo.world !== world || memo.seed !== world.seed
      || memo.startDoy !== state.weather.startDoy) {
      memo = { sampler: sampleAtmosphere, world, seed: world.seed,
        startDoy: state.weather.startDoy, values: new Map() };
      groundReadMemo.set(state, memo);
    }
    shadow = memo.values.get(region);
    if (shadow?.updatedHour === hour) return { ...shadow };
  }
  // A state can be inspected at an earlier time after a later query. Recompute
  // that past view from the origin and keep the newer shadow for future reads.
  const fromShadow = !stored && shadow && shadow.updatedHour < hour;
  let ground = stored ?? (fromShadow ? { ...shadow } : initialGround(state, world, region));
  const { x, y } = groundPosition(region);
  while (ground.updatedHour < hour) {
    const air = sampleAtmosphere({ startDoy: state.weather.startDoy, snowCm: ground.snowCm }, world, (ground.updatedHour + 0.5) * 60, x, y);
    ground = integrateGroundHour(ground, air);
  }
  if (!stored && memo && (!shadow || ground.updatedHour >= shadow.updatedHour)) memo.values.set(region, { ...ground });
  return { ...ground };
}

/** Simulation path: materialize and persist completed hours for this region. */
export function ensureGround(state: GameState, world: World, region: number): LocalGroundWeather {
  const stored = state.weather.ground[region];
  if (stored && stored.updatedHour === Math.floor((state.minute + state.weather.elapsedMinutes) / 60)) return stored;
  const ground = groundAt(state, world, region);
  state.weather.ground[region] = ground;
  return ground;
}

export interface LocalConditions extends AtmosphereSample { ground: LocalGroundWeather }

interface AtmosphereMemo {
  sampler: typeof sampleAtmosphere;
  world: World;
  seed: number;
  minute: number;
  startDoy: number;
  values: Map<number, { snowCm: number; value: AtmosphereSample }[]>;
}

// Current-coordinate atmosphere is requested repeatedly within one simulation
// minute. Keep only that minute's coordinates per live state so saves remain
// unchanged and historical ground replay and sight sampling stay exact.
const atmosphereMemo = new WeakMap<GameState, AtmosphereMemo>();

/** Coordinate atmosphere using an already resolved amount of local snow cover. */
export function atmosphereAt(state: GameState, world: World, cell: number, snowCm = 0): AtmosphereSample {
  const minute = state.minute + state.weather.elapsedMinutes;
  const startDoy = state.weather.startDoy;
  let memo = atmosphereMemo.get(state);
  if (!memo || memo.sampler !== sampleAtmosphere || memo.world !== world || memo.seed !== world.seed
    || memo.minute !== minute || memo.startDoy !== startDoy) {
    memo = { sampler: sampleAtmosphere, world, seed: world.seed, minute, startDoy, values: new Map() };
    atmosphereMemo.set(state, memo);
  }
  const entries = memo.values.get(cell);
  const cached = entries?.find((entry) => Object.is(entry.snowCm, snowCm));
  if (cached) return { ...cached.value };
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const value = sampleAtmosphere({ startDoy, snowCm }, world, minute, x, y);
  const entry = { snowCm, value: { ...value } };
  if (entries) entries.push(entry);
  else memo.values.set(cell, [entry]);
  return value;
}

/** Coordinate atmosphere at a future life-clock minute, including the world's inherited elapsed time. */
export function atmosphereAtMinute(state: GameState, world: World, cell: number, minute: number, snowCm = 0): AtmosphereSample {
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  return sampleAtmosphere(
    { startDoy: state.weather.startDoy, snowCm },
    world,
    minute + state.weather.elapsedMinutes,
    x,
    y,
  );
}

/** Compose coordinate atmosphere with ground a caller has already caught up. */
export function conditionsWithGround(state: GameState, world: World, cell: number, ground: LocalGroundWeather): LocalConditions {
  return { ...atmosphereAt(state, world, cell, ground.snowCm), ground };
}

/**
 * Current cell-coordinate atmosphere plus stationary region cover; safe for
 * rendering. Calendar is the caller's state-derived view, not a time override:
 * both ground and atmosphere use state.minute plus the weather rebase offset.
 */
export function conditionsAt(state: GameState, world: World, _cal: Calendar, cell: number): LocalConditions {
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const ground = groundAt(state, world, regionPeek(world, x, y));
  return conditionsWithGround(state, world, cell, ground);
}

/** Current-cell adapter for old Weather-shaped calculations. Never drives atmosphere or ground updates. */
export function localWeather(state: GameState, world: World, cell = Math.floor(state.player.y) * world.w + Math.floor(state.player.x)): Weather & { temperatureC: number; dryHours: number } {
  const a = conditionsAt(state, world, calendar(state.minute, state.startDoy), cell);
  const scheduled = state.weather.storm;
  const scheduledKind = scheduled && state.minute >= scheduled.from && state.minute < scheduled.until ? scheduled.kind : null;
  const storm = localStorm(a) ? {
    id: scheduled?.id ?? 0, source: scheduled?.source ?? "natural" as const,
    kind: scheduledKind ?? (a.precip === "snow" ? "snow" as const : "gale" as const),
    from: state.minute, until: state.minute + 1, warned: true,
  } : null;
  return { precip: a.precipMmPerHour < 0.2 ? "none" : a.precipMmPerHour >= 7.5 ? "heavy" : "light",
    clear: a.cloud < 0.5, offset: 0, snowCm: a.ground.snowCm, iceCm: a.ground.iceCm,
    dryDays: a.ground.dryHours / 24, dryHours: a.ground.dryHours, wetDay: a.precipMmPerHour >= 0.2,
    dryWarned: false, rolledDay: 0, nextStormId: state.weather.nextStormId, stormFreeSince: state.weather.stormFreeSince, storm,
    temperatureC: a.temperatureC };
}

export function localStorm(a: AtmosphereSample): boolean { return a.precipMmPerHour >= 7.5 && a.windKmh >= 35; }

/** True only when coordinate-owned air supplies the named scheduled hazard. */
export function stormAirMatches(a: AtmosphereSample, kind: StormKind): boolean {
  return localStorm(a) && (kind === "gale" || a.precip === kind);
}

/** A forecast schedule may name a real feature, but it never makes that feature exist. */
export function scheduledStormMatches(
  state: GameState,
  world: World,
  cell: number,
  storm: NonNullable<Weather["storm"]>,
): boolean {
  const onset = atmosphereAtMinute(state, world, cell, storm.from);
  return stormAirMatches(onset, storm.kind);
}
export function snowAt(state: GameState, world: World, cell: number): number { return localWeather(state, world, cell).snowCm; }
export function iceAt(state: GameState, world: World, cell: number): number { return localWeather(state, world, cell).iceCm; }
export function precipitationAt(state: GameState, world: World, cell: number): number { return conditionsAt(state, world, calendar(state.minute, state.startDoy), cell).precipMmPerHour; }
export function dryGroundAt(state: GameState, world: World, cell: number, days: number): boolean { return localWeather(state, world, cell).dryHours >= days * 24; }

/** Advance a copy through one complete hour; hour zero starts at 08:00. */
export function integrateGroundHour(previous: LocalGroundWeather, air: AtmosphereSample): LocalGroundWeather {
  const g = { ...previous, updatedHour: previous.updatedHour + 1 };
  g.snowCm += air.snowCmPerHour;
  const melt = air.temperatureC > 2 ? Math.min(2, g.snowCm) : 0;
  g.snowCm -= melt;
  g.surfaceWaterMm += air.rainMmPerHour + melt;
  const infiltration = Math.min(g.surfaceWaterMm, 2 * (1 - g.soilMoisture));
  g.surfaceWaterMm -= infiltration;
  g.soilMoisture = Math.min(1, g.soilMoisture + infiltration / 50);
  const evaporation = 0.08 * (1 - air.relativeHumidity) * Math.max(0, air.temperatureC + 5) * (1 + air.windKmh / 20);
  const surfaceLoss = Math.min(g.surfaceWaterMm, evaporation);
  g.surfaceWaterMm -= surfaceLoss;
  g.soilMoisture = Math.max(0, g.soilMoisture - (evaporation - surfaceLoss) / 50);
  if (air.temperatureC < 0 && g.soilMoisture > 0.2) g.frost = Math.min(1, g.frost + Math.min(1, -air.temperatureC / 12) / 24);
  else if (air.temperatureC > 0) g.frost = Math.max(0, g.frost - air.temperatureC / 12);
  g.dryHours = air.precipMmPerHour >= 0.2 || g.soilMoisture > 0.2 ? 0 : g.dryHours + 1;
  g.temperatureSum += air.temperatureC;
  g.temperatureHours++;
  if ((g.updatedHour + START_MINUTE_OF_DAY / 60) % 24 === 0) {
    g.snowCm *= 1 - SNOW_SETTLE_PER_DAY;
    const mean = g.temperatureSum / g.temperatureHours;
    // A newly migrated partial day represents only its accumulated degree-hours.
    const days = g.temperatureHours / 24;
    g.iceCm = mean < 0 ? Math.sqrt(g.iceCm ** 2 + 7.2 * -mean * days) : Math.max(0, g.iceCm - 2 * mean * days);
    g.temperatureSum = 0;
    g.temperatureHours = 0;
  }
  return g;
}

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
  if ("temperatureC" in w) return w.temperatureC as number;
  const amp = w.precip !== "none" ? 1.5 : w.clear ? 4 : 2.5;
  const diurnal = amp * Math.cos((2 * Math.PI * (cal.hour - 15)) / 24);
  const precip = w.precip !== "none" ? -2 : 0;
  return seasonalMean(cal.dayOfYear) + diurnal + w.offset + precip;
}

export const DEEP_SNOW_CM = 30;
export const SNOW_SETTLE_PER_DAY = 0.05;
const START_PER_HOUR: Record<Season, number> = { spring: 0.04, summer: 0.03, autumn: 0.04, winter: 0.05 };
const STOP_PER_HOUR = 0.25;
export const SNOW_CM_PER_MINUTE = { light: 1 / 160, heavy: 1 / 80 } as const;

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

export function iceMode(w: Pick<Weather, "iceCm">): IceMode {
  if (w.iceCm >= ICE_SAFE_CM) return "safe";
  if (w.iceCm >= ICE_THIN_CM) return "thin";
  return "none";
}

/** The ice a plain walk (never asking for the thin-ice shortcut) may cross: safe ice, or none. */
export function walkableIce(w: Pick<Weather, "iceCm">): IceMode {
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
