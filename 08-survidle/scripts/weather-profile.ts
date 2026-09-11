/**
 * Deterministic workload calibration for the spatial weather system.
 * Timings describe this host and are deliberately not test thresholds.
 */
import { performance } from "node:perf_hooks";
import { calendar } from "../src/sim/calendar";
import { sampleAtmosphere } from "../src/sim/climate";
import { setSkillLevel } from "../src/sim/horizon";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { opticalCandidateRangeCells, visibleCells, sightRangeCells } from "../src/sim/sight";
import { atmosphereAt, ensureGround } from "../src/sim/weather";
import { current } from "../src/sim/record";
import { mapHtml } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { heightAt, terrainPeek, WORLD_H, WORLD_W, type World } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";

export const WEATHER_PROFILE_DEFAULTS = {
  atmosphereSamples: 10_000,
  mapGlyphs: 54 * 48,
  groundRegions: 100,
} as const;

export interface WeatherProfileOptions {
  atmosphereSamples?: number;
  mapGlyphs?: number;
  groundRegions?: number;
  /** Keeps unit tests quick. The command-line profile always uses the full fell search. */
  quick?: boolean;
}

export interface WeatherWorkload {
  name: string;
  operations: number;
  checksum: string;
  ms: number;
}

export interface WeatherProfile {
  seed: number;
  workloads: WeatherWorkload[];
}

function measured(name: string, operations: number, work: () => string): WeatherWorkload {
  const started = performance.now();
  const checksum = work();
  return { name, operations, checksum, ms: performance.now() - started };
}

function sampleCoordinates(world: World, count: number, visit: (x: number, y: number, i: number) => void): void {
  for (let i = 0; i < count; i++) {
    const x = (world.start * 37 + i * 97) % world.w;
    const y = (world.start * 53 + i * 193) % world.h;
    visit(x, y, i);
  }
}

function atmosphereChecksum(world: World, count: number, minute: number): string {
  let sum = 0;
  sampleCoordinates(world, count, (x, y, i) => {
    const a = sampleAtmosphere({ startDoy: 90, snowCm: i % 7 }, world, minute, x, y);
    sum += a.temperatureC + a.pressureHpa / 100 + a.cloud * 3 + a.precipMmPerHour * 5
      + a.windKmh / 10 + a.fog * 7 + a.extinctionPerKm;
  });
  return sum.toFixed(6);
}

/** Exact number of non-origin integer cell centres visited by visibleCells at a radius. */
export function latticeCandidateCount(radius: number): number {
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if ((dx !== 0 || dy !== 0) && Math.hypot(dx, dy) <= radius) count++;
    }
  }
  return count;
}

function highestFell(world: World): number {
  let best = world.start;
  let bestScore = -1;
  for (let y = 180; y < WORLD_H - 180; y += 12) {
    for (let x = 180; x < WORLD_W - 180; x += 12) {
      const terrain = terrainPeek(world, x, y);
      if (terrain !== "fell" && terrain !== "rock") continue;
      const e = heightAt(world, x, y);
      let open = 0;
      for (let dy = -60; dy <= 60; dy += 6) for (let dx = -60; dx <= 60; dx += 6) {
        const nearby = terrainPeek(world, x + dx, y + dy);
        if (nearby !== "spruce" && nearby !== "pine" && nearby !== "birch") open++;
      }
      const score = open + e;
      if (score > bestScore) {
        best = y * world.w + x;
        bestScore = score;
      }
    }
  }
  return best;
}

function groundRegionIds(count: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = (17 + i * 31) % LATTICE_W;
    const y = (11 + i * 47) % LATTICE_H;
    ids.push(y * LATTICE_W + x);
  }
  return [...new Set(ids)].slice(0, count);
}

function clearestDaylightMinute(world: World, cell: number): number {
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  let best = 4 * 60;
  let extinction = Number.POSITIVE_INFINITY;
  for (let day = 0; day < 14; day++) for (let hour = 8; hour <= 18; hour++) {
    const minute = day * 1440 + (hour - 8) * 60;
    const beta = sampleAtmosphere({ startDoy: 90, snowCm: 0 }, world, minute, x, y).extinctionPerKm;
    if (beta < extinction) { best = minute; extinction = beta; }
  }
  return best;
}

export function profileWeather(seed = 17, options: WeatherProfileOptions = {}): WeatherProfile {
  const atmosphereSamples = options.atmosphereSamples ?? WEATHER_PROFILE_DEFAULTS.atmosphereSamples;
  const mapGlyphs = options.mapGlyphs ?? WEATHER_PROFILE_DEFAULTS.mapGlyphs;
  const groundRegions = options.groundRegions ?? WEATHER_PROFILE_DEFAULTS.groundRegions;
  const base = newGame(seed);
  const workloads: WeatherWorkload[] = [];

  workloads.push(measured("atmosphere samples", atmosphereSamples, () =>
    atmosphereChecksum(base.world, atmosphereSamples, 18 * 60)));

  const currentCell = Math.floor(base.state.player.y) * base.world.w + Math.floor(base.state.player.x);
  workloads.push(measured("memoized current atmosphere", atmosphereSamples, () => {
    let sum = 0;
    for (let i = 0; i < atmosphereSamples; i++) sum += atmosphereAt(base.state, base.world, currentCell, 0).temperatureC;
    return sum.toFixed(6);
  }));

  const sightCell = options.quick ? Math.floor(base.state.player.y) * base.world.w + Math.floor(base.state.player.x) : highestFell(base.world);
  if (!options.quick) {
    current(base.state).person.axes.eyes = 2;
    setSkillLevel(base.state, "wayfinding", 20);
    base.state.minute = clearestDaylightMinute(base.world, sightCell);
    placeAt(base.state, base.world, sightCell);
  }
  const sightCalendar = calendar(base.state.minute, base.state.startDoy);
  const reach = sightRangeCells(base.state, base.world, sightCalendar, sightCell);
  const opticalReach = opticalCandidateRangeCells(reach);
  const circleCells = latticeCandidateCount(opticalReach);
  workloads.push(measured("maximum-range open fell sight", circleCells, () => {
    const visible = visibleCells(base.state, base.world, sightCalendar, sightCell);
    let digest = 0;
    for (const cell of visible) digest = (digest + cell) % 1_000_000_007;
    return `${reach}:${visible.size}:${digest}`;
  }));

  workloads.push(measured("map-sized atmosphere", mapGlyphs, () =>
    atmosphereChecksum(base.world, mapGlyphs, 12 * 60)));

  const ground = newGame(seed);
  ground.state.minute = 24 * 60;
  const regionIds = groundRegionIds(groundRegions);
  workloads.push(measured("active ground regions", regionIds.length, () => {
    let sum = 0;
    for (const region of regionIds) {
      const g = ensureGround(ground.state, ground.world, region);
      sum += g.snowCm + g.surfaceWaterMm + g.soilMoisture + g.frost + g.iceCm + g.dryHours;
    }
    return sum.toFixed(6);
  }));

  const map = newGame(seed);
  map.state.minute = 24 * 60 - 1;
  const ui = newUiState();
  workloads.push(measured("late-day map render", WEATHER_PROFILE_DEFAULTS.mapGlyphs, () => {
    const html = mapHtml(map.world, map.state, ui, calendar(map.state.minute, map.state.startDoy));
    const glyphs = html.match(/class="c(?: |")/g)?.length ?? 0;
    const weatherLayers = html.match(/class="cell-weather"/g)?.length ?? 0;
    return `${glyphs}:${weatherLayers}:${html.length}`;
  }));

  return { seed, workloads };
}

function printProfile(profile: WeatherProfile): void {
  console.log(`weather profile seed ${profile.seed}`);
  console.log("workload                       operations      ms  checksum");
  for (const workload of profile.workloads) {
    console.log(`${workload.name.padEnd(30)} ${String(workload.operations).padStart(10)} ${workload.ms.toFixed(2).padStart(8)}  ${workload.checksum}`);
  }
  console.log("timings are observations, not pass/fail thresholds");
}

export function shouldPrintWeatherProfile(env: Record<string, string | undefined>): boolean {
  return env.VITEST === undefined;
}

if (shouldPrintWeatherProfile(process.env)) printProfile(profileWeather(Number(process.argv[2]) || 17));
