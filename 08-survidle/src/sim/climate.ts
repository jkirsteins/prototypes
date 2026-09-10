/** Deterministic moving air. No random stream, world chunks or ground records are changed here. */
import { derive } from "../rng";
import { CELL_KM } from "../units";
import type { World } from "../world/cells";
import { fieldsAt } from "../world/terrain";
import { START_MINUTE_OF_DAY } from "./calendar";
import type { AtmosphereSample } from "./types";

export type { AtmosphereSample } from "./types";

export interface ClimateState {
  startDoy: number;
  /** Local snow cover, supplied by the ground consumer. Omitted means bare ground. */
  snowCm?: number;
}

export const CONTRAST_LIMIT = 0.05;
export const MAX_OPTICAL_DEPTH = -Math.log(CONTRAST_LIMIT);
export const CLEAR_MOR_KM = 50;
const CLEAR_EXTINCTION = MAX_OPTICAL_DEPTH / CLEAR_MOR_KM;
const BROAD_LATTICE_KM = 12;
const DETAIL_LATTICE_KM = 1.2;
const RAIN_MOR = [[0.5, 20], [2.5, 8], [7.5, 3], [25, 0.8]] as const;
const SNOW_MOR = [[0.4, 5], [1, 1.2], [2.5, 0.4]] as const;

const clamp = (n: number, low = 0, high = 1): number => Math.max(low, Math.min(high, n));
function ramp(low: number, high: number, n: number): number {
  const t = clamp((n - low) / (high - low));
  return t * t * (3 - 2 * t);
}

/** Excess over clear air: independent obscurants never count the baseline twice. */
function rateExtinction(rate: number, table: readonly (readonly [number, number])[]): number {
  if (rate <= 0) return 0;
  const [firstRate, firstMor] = table[0];
  if (rate < firstRate) return (MAX_OPTICAL_DEPTH / firstMor - CLEAR_EXTINCTION) * rate / firstRate;
  for (let i = 1; i < table.length; i++) {
    const [r0, m0] = table[i - 1];
    const [r1, m1] = table[i];
    if (rate <= r1) {
      const t = Math.log(rate / r0) / Math.log(r1 / r0);
      return MAX_OPTICAL_DEPTH / (m0 * (m1 / m0) ** t) - CLEAR_EXTINCTION;
    }
  }
  return MAX_OPTICAL_DEPTH / table[table.length - 1][1] - CLEAR_EXTINCTION;
}

/** A short onset ramp avoids a discontinuity from absent to visible fog/drift. */
function densityExtinction(density: number, onsetMor: number, denseMor: number): number {
  const d = clamp(density);
  const mor = onsetMor * (denseMor / onsetMor) ** d;
  return ramp(0, 0.05, d) * (MAX_OPTICAL_DEPTH / mor - CLEAR_EXTINCTION);
}

export interface Obscurants {
  rainMmPerHour?: number;
  snowCmPerHour?: number;
  fog?: number;
  blowingSnow?: number;
}

/** Smooth phase change over +1 C to -1 C; labels describe the majority phase only. */
export function precipitationPhase(precipMmPerHour: number, temperatureC: number) {
  const rate = Math.max(0, precipMmPerHour);
  const frozenFraction = ramp(1, -1, temperatureC);
  const precip: AtmosphereSample["precip"] = rate === 0 ? "none" : frozenFraction >= 0.5 ? "snow" : "rain";
  return {
    frozenFraction,
    rainMmPerHour: rate * (1 - frozenFraction),
    // A 10:1 fresh-snow ratio: 1 mm frozen liquid equivalent becomes 1 cm snow.
    snowCmPerHour: rate * frozenFraction,
    precip,
  };
}

/** All returned coefficients, including total, are in inverse kilometres. */
export function extinctionComponents(obscurants: Obscurants) {
  const clear = CLEAR_EXTINCTION;
  const rain = rateExtinction(obscurants.rainMmPerHour ?? 0, RAIN_MOR);
  const snow = rateExtinction(obscurants.snowCmPerHour ?? 0, SNOW_MOR);
  const fog = densityExtinction(obscurants.fog ?? 0, 10, 0.2);
  const blowingSnow = densityExtinction(obscurants.blowingSnow ?? 0, 12, 0.3);
  return { clear, rain, snow, fog, blowingSnow, total: clear + rain + snow + fog + blowingSnow };
}

export function meteorologicalRangeKm(extinctionPerKm: number): number {
  return extinctionPerKm > 0 ? MAX_OPTICAL_DEPTH / extinctionPerKm : Number.POSITIVE_INFINITY;
}

/**
 * Lattice nodes sample three seeded long waves, rather than independent cell
 * rolls. The dominant wavelength is five lattice spacings: 60 km broad,
 * 6 km subordinate. Other waves are longer (7 and 11 spacings), never finer.
 * Linear reconstruction on the nominal 12/1.2 km lattice preserves continuity
 * and gives the shortest wave five samples. No fine octave is added.
 */
interface FieldCache {
  seed: number;
  waves: Map<number, { phase: number; cos: number; sin: number }>;
  nodes: Map<number, Map<number, Map<number, number>>>;
  order: { salt: number; x: number; y: number }[];
  head: number;
  size: number;
}

/** A bounded, non-serialized cache. A WeakMap releases it with its world. */
export const MAX_ATMOSPHERE_FIELD_NODES = 4_096;
const fieldCaches = new WeakMap<World, FieldCache>();

function fieldCache(world: World): FieldCache {
  let cache = fieldCaches.get(world);
  if (!cache || cache.seed !== world.seed) {
    cache = { seed: world.seed, waves: new Map(), nodes: new Map(), order: [], head: 0, size: 0 };
    fieldCaches.set(world, cache);
  }
  return cache;
}

/** Diagnostics for the performance envelope; this does not populate the cache. */
export function cachedAtmosphereFieldNodes(world: World): number {
  return fieldCaches.get(world)?.size ?? 0;
}
export function cachedAtmosphereFieldWaves(world: World): number { return fieldCaches.get(world)?.waves.size ?? 0; }

function field(world: World, salt: number, xKm: number, yKm: number, spacingKm: number): number {
  const cache = fieldCache(world);
  let wave = cache.waves.get(salt);
  if (!wave) {
    const waveSeed = derive(world.seed, salt);
    const phase = waveSeed / 4294967296 * Math.PI * 2;
    const angle = derive(waveSeed, 1) / 4294967296 * Math.PI * 2;
    wave = { phase, cos: Math.cos(angle), sin: Math.sin(angle) };
    cache.waves.set(salt, wave);
  }
  let rows = cache.nodes.get(salt);
  if (!rows) {
    rows = new Map();
    cache.nodes.set(salt, rows);
  }
  const node = (x: number, y: number): number => {
    const cached = rows.get(x)?.get(y);
    if (cached !== undefined) return cached;
    const u = x * wave.cos + y * wave.sin;
    const v = -x * wave.sin + y * wave.cos;
    const value = 0.5 + 0.3 * Math.sin(u * Math.PI * 2 / 5 + wave.phase)
      + 0.125 * Math.sin(v * Math.PI * 2 / 7 + wave.phase * 1.7)
      + 0.075 * Math.sin((u + v) / Math.SQRT2 * Math.PI * 2 / 11 + wave.phase * 2.3);
    let row = rows.get(x);
    if (!row) {
      row = new Map();
      rows.set(x, row);
    }
    row.set(y, value);
    cache.order.push({ salt, x, y });
    cache.size++;
    if (cache.size > MAX_ATMOSPHERE_FIELD_NODES) {
      const oldest = cache.order[cache.head++];
      const oldRows = cache.nodes.get(oldest.salt)!;
      const oldRow = oldRows.get(oldest.x)!;
      oldRow.delete(oldest.y);
      if (oldRow.size === 0) oldRows.delete(oldest.x);
      cache.size--;
      if (cache.head >= MAX_ATMOSPHERE_FIELD_NODES * 2) {
        cache.order = cache.order.slice(cache.head);
        cache.head = 0;
      }
    }
    return value;
  };
  const x = xKm / spacingKm;
  const y = yKm / spacingKm;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const top = node(ix, iy) * (1 - fx) + node(ix + 1, iy) * fx;
  const bottom = node(ix, iy + 1) * (1 - fx) + node(ix + 1, iy + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Pure terrain response, with elevations in km and moisture in 0..1. */
export function terrainModifiers(elevationKm: number, upwindElevationKm: number, meanElevationKm: number, moisture: number) {
  // Lift across 6 km: cap the response so steep terrain cannot create a storm.
  const lift = clamp(elevationKm - upwindElevationKm, -0.6, 0.6);
  return {
    temperatureOffsetC: -6.5 * elevationKm,
    humidityOffset: lift * 0.16,
    precipMultiplier: Math.max(0.2, 1 + lift * 1.5),
    // Fog favours damp depressions; the broad humidity gate is applied later.
    fogPotential: clamp((meanElevationKm - elevationKm) * 4 + moisture * 0.3),
  };
}

function elevationKm(seed: number, x: number, y: number): number {
  const f = fieldsAt(seed, x, y);
  return f.sea ? 0 : Math.max(0, f.e) * 1.2;
}

/** Constant translation of the weather systems, separate from the local surface wind. */
export function fieldTransport(seed: number): { xKmh: number; yKmh: number } {
  const speed = 6 + derive(seed, 710) / 4294967296 * 40;
  const bearing = (230 + derive(seed, 711) / 4294967296 * 70) * Math.PI / 180;
  return { xKmh: -Math.sin(bearing) * speed, yKmh: Math.cos(bearing) * speed };
}

function localWind(world: World, airX: number, airY: number, prevailing: { xKmh: number; yKmh: number }) {
  // The 6 km centred stencil smooths the gradient across 12 km lattice edges.
  // Use sea-level pressure: terrain height must not masquerade as a pressure system.
  const pressureAt = (x: number, y: number) => field(world, 720, x, y, BROAD_LATTICE_KM) * 40;
  const gx = (pressureAt(airX + 6, airY) - pressureAt(airX - 6, airY)) / 12;
  const gy = (pressureAt(airX, airY + 6) - pressureAt(airX, airY - 6)) / 12;
  // Northern-hemisphere circulation with a smaller flow toward low pressure.
  // Gains convert hPa/km to km/h; smooth vector saturation bounds speed at 60.
  const rawX = prevailing.xKmh + 36 * gy - 8 * gx;
  const rawY = prevailing.yKmh - 36 * gx - 8 * gy;
  const scale = 60 / Math.hypot(60, rawX, rawY);
  const windXKmh = rawX * scale;
  const windYKmh = rawY * scale;
  const windKmh = Math.hypot(windXKmh, windYKmh);
  const windBearingDeg = (Math.atan2(-windXKmh, windYKmh) * 180 / Math.PI + 360) % 360;
  return { windXKmh, windYKmh, windKmh, windBearingDeg };
}

/** x/y are world cell coordinates (fractional midpoints allowed); minute is absolute run time. */
export function sampleAtmosphere(weather: ClimateState, world: World, minute: number, x: number, y: number): AtmosphereSample {
  const transport = fieldTransport(world.seed);
  const airX = x * CELL_KM - transport.xKmh * minute / 60;
  const airY = y * CELL_KM - transport.yKmh * minute / 60;
  const { windKmh, windBearingDeg, windXKmh, windYKmh } = localWind(world, airX, airY, transport);
  const pressure = field(world, 720, airX, airY, BROAD_LATTICE_KM);
  const humidity = field(world, 721, airX, airY, BROAD_LATTICE_KM);
  const anomaly = field(world, 722, airX, airY, BROAD_LATTICE_KM);
  const detail = field(world, 723, airX, airY, DETAIL_LATTICE_KM);
  const terrain = fieldsAt(world.seed, x, y);
  const height = terrain.sea ? 0 : Math.max(0, terrain.e) * 1.2;
  const dx = windKmh > 0 ? windXKmh / windKmh * 20 : 0;
  const dy = windKmh > 0 ? windYKmh / windKmh * 20 : 0;
  const upwind = elevationKm(world.seed, x - dx, y - dy);
  const downwind = elevationKm(world.seed, x + dx, y + dy);
  const modifiers = terrainModifiers(height, upwind, (upwind + downwind) / 2, terrain.m);
  const parentHumidity = clamp(0.45 + 0.55 * humidity + 0.15 * (0.5 - pressure));
  // Clouds begin at 55% humidity; substantial rain support needs 65% cloud.
  // Terrain and subordinate detail may shape rain inside this broad support only.
  const cloud = ramp(0.55, 0.85, parentHumidity);
  const support = ramp(0.65, 0.95, cloud);
  const relativeHumidity = clamp(parentHumidity + modifiers.humidityOffset);
  // The broad field locates the weather system; only the humid core of the
  // subordinate field precipitates. Letting its whole shoulder rain made a
  // coherent feature linger as near-continuous precipitation at one site.
  const precipMmPerHour = support * ramp(0.8, 0.98, detail) * 8 * modifiers.precipMultiplier;
  const day = weather.startDoy + (minute + START_MINUTE_OF_DAY) / 1440;
  const hour = (minute + START_MINUTE_OF_DAY) / 60;
  const seasonal = 3 + 12 * Math.cos(2 * Math.PI * (day - 200) / 365);
  const temperatureC = seasonal + (4 - 2.5 * cloud) * Math.cos(2 * Math.PI * (hour - 15) / 24)
    + (anomaly - 0.5) * 12 + modifiers.temperatureOffsetC;
  const { precip, rainMmPerHour, snowCmPerHour } = precipitationPhase(precipMmPerHour, temperatureC);
  const fog = ramp(0.72, 0.95, parentHumidity) * ramp(0.7, 0.96, relativeHumidity)
    * modifiers.fogPotential * (0.4 + 0.6 * detail);
  const blowingSnow = ramp(18, 55, windKmh) * ramp(0, 20, weather.snowCm ?? 0) * ramp(1, -8, temperatureC);
  const extinctionPerKm = extinctionComponents({ rainMmPerHour, snowCmPerHour, fog, blowingSnow }).total;
  return {
    temperatureC, pressureHpa: 1013 + (pressure - 0.5) * 40 - height * 110,
    relativeHumidity, cloud, precipMmPerHour, rainMmPerHour, precip, snowCmPerHour,
    windKmh, windBearingDeg, windXKmh, windYKmh, fog, blowingSnow, extinctionPerKm,
  };
}
