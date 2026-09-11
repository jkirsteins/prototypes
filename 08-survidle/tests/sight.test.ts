import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import { calendar } from "../src/sim/calendar";
import { CLEAR_MOR_KM, extinctionComponents, MAX_OPTICAL_DEPTH } from "../src/sim/climate";
import { CELL_KM } from "../src/units";
import { isKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { campfireVisible, opticalCandidateRangeCells, opticalSampler, seeFrom, sightRangeCells, visibleCells } from "../src/sim/sight";
import { setSkillLevel } from "../src/sim/horizon";
import { placeAt } from "../src/sim/position";
import { current } from "../src/sim/record";
import type { GameState } from "../src/sim/types";
import { visibleWildlife } from "../src/sim/wildlife-agents";
import { cellAt, regionAt, type World } from "../src/world/gen";
import { FINE_CHUNK, newWorld } from "../src/world/cells";
import * as terrainFields from "../src/world/terrain";
import { fieldsAt, TERRAIN_INDEX } from "../src/world/terrain";
import { testAtmosphere } from "./weather-helpers";

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A meadow-or-bog cell in `region` with `n` more open cells running straight from it in some cardinal direction. */
function openRun(world: World, region: number, n: number): { vantage: number; end: number } {
  for (const idx of regionAt(world, region).cells) {
    const t = cellAt(world, idx).terrain;
    if (t !== "meadow" && t !== "bog") continue;
    const x = idx % world.w;
    const y = Math.floor(idx / world.w);
    for (const [dx, dy] of DIRS) {
      let end = -1;
      let ok = true;
      for (let i = 1; i <= n; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) { ok = false; break; }
        const nt = cellAt(world, ny * world.w + nx).terrain;
        if (nt === "spruce" || nt === "pine" || nt === "birch") { ok = false; break; }
        end = ny * world.w + nx;
      }
      if (ok) {
        const observer = Math.min(1, Math.max(0, fieldsAt(world.seed, x, y).e)) * 1200 + 1.7;
        let horizon = -Infinity;
        for (let i = 1; i <= n; i++) {
          const elevation = Math.min(1, Math.max(0, fieldsAt(world.seed, x + dx * i, y + dy * i).e)) * 1200;
          const slope = (elevation - observer) / i;
          if (i === n && slope < horizon) ok = false;
          horizon = Math.max(horizon, slope);
        }
      }
      if (ok) return { vantage: idx, end };
    }
  }
  throw new Error(`region ${region} has no ${n}-cell open run`);
}

/** A closed-spruce cell in `region`, and one of its passable neighbours. */
function spruceCell(world: World, region: number): number {
  const idx = regionAt(world, region).cells.find((c) => cellAt(world, c).terrain === "spruce");
  if (idx === undefined) throw new Error(`region ${region} has no spruce`);
  return idx;
}

// Seed 1's start region, at solar noon on landing day (1 April): bright enough that light never gates the range.
const NOON = calendar(300);

/** One public fine chunk isolates local optics from generated canopy. */
function openWorld(): { state: GameState; world: World; vantage: number } {
  const state = newGame(1).state;
  vi.spyOn(terrainFields, "fieldsAt").mockReturnValue({ e: 0.5, m: 0.3, sea: false, coast: 1 });
  const terrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK);
  terrain.fill(7); // TERRAINS[7] is meadow.
  const region = new Int32Array(FINE_CHUNK * FINE_CHUNK);
  const world = newWorld(1);
  world.fineChunks.set(0, { cx: 0, cy: 0, terrain, region,
    samples: terrain.length, parentSummaries: new Map() });
  const vantage = 16 * world.w + 16;
  state.player.x = 16.5;
  state.player.y = 16.5;
  state.player.region = 0;
  state.weather.ground[0] = { updatedHour: 0, snowCm: 0, surfaceWaterMm: 0,
    soilMoisture: 0.3, frost: 0, iceCm: 0, dryHours: 0, temperatureSum: 0, temperatureHours: 0 };
  return { state, world, vantage };
}

function at(world: World, vantage: number, dx: number, dy: number): number {
  return vantage + dy * world.w + dx;
}

function setUniformExtinction(extinctionPerKm: number): void {
  const air = testAtmosphere({ extinctionPerKm });
  vi.mocked(climate.sampleAtmosphere).mockImplementation(() => ({ ...air, extinctionPerKm }));
}

afterEach(() => vi.restoreAllMocks());

/**
 * Forgets everything the landing revealed. seeFrom runs at every step of the
 * walk ashore, so on a fresh game the ground around the start is already known
 * and a test asking what one look from one cell reveals would be reading the
 * landing's work instead of its own.
 */
function forget(state: { mapped: Record<number, number> }): void {
  state.mapped = {};
}

describe("sight", () => {
  it("keeps every whole-cell target inside the 50 km clear-air MOR", () => {
    const candidates = opticalCandidateRangeCells(1000);
    expect(candidates).toBe(Math.ceil(CLEAR_MOR_KM / CELL_KM));
    expect((candidates - 1) * CELL_KM).toBeLessThan(CLEAR_MOR_KM);
    expect(candidates * CELL_KM).toBeGreaterThan(CLEAR_MOR_KM);
  });

  it("caps reported elevation at the model's 1200 m fell spine", () => {
    const { state, world, vantage } = openWorld();
    world.fineChunks.get(0)!.terrain.fill(TERRAIN_INDEX.fell);
    vi.mocked(terrainFields.fieldsAt).mockReturnValue({ e: 1.2, m: 0.3, sea: false, coast: 1 });
    testAtmosphere({ cloud: 0, precipMmPerHour: 0, extinctionPerKm: 0.06 });
    current(state).person.axes.eyes = 2;
    setSkillLevel(state, "wayfinding", 20);
    expect(sightRangeCells(state, world, NOON, vantage)).toBeLessThanOrEqual(927);
  });

  it("uses one physical radius in cardinal and diagonal directions", () => {
    const { state, world, vantage } = openWorld();
    testAtmosphere({ extinctionPerKm: 0.06 });

    const visible = visibleCells(state, world, NOON, vantage);

    expect(visible.has(at(world, vantage, 15, 0))).toBe(true);
    expect(visible.has(at(world, vantage, 9, 12))).toBe(true);
    expect(visible.has(at(world, vantage, 15, 15))).toBe(false);
  });

  it("stops at the meteorological optical range in uniform air", () => {
    const { state, world, vantage } = openWorld();
    testAtmosphere({ extinctionPerKm: MAX_OPTICAL_DEPTH / 1.2 });

    const visible = visibleCells(state, world, NOON, vantage);

    expect(visible.has(at(world, vantage, 4, 0))).toBe(true);
    expect(visible.has(at(world, vantage, 5, 0))).toBe(false);
  });

  it("lets a luminous campfire ray use its own contrast threshold", () => {
    const { state, world, vantage } = openWorld();
    const fire = at(world, vantage, 10, 0);
    setUniformExtinction(0.06);

    expect(campfireVisible(state, world, vantage, fire)).toBe(true);
  });

  it("hides a campfire behind dense weather even when terrain is clear", () => {
    const { state, world, vantage } = openWorld();
    const fire = at(world, vantage, 10, 0);
    setUniformExtinction(MAX_OPTICAL_DEPTH / 0.2);

    expect(campfireVisible(state, world, vantage, fire)).toBe(false);
  });

  it("attenuates a ray through a local obscuring band", () => {
    const { state, world, vantage } = openWorld();
    const clear = testAtmosphere({ extinctionPerKm: 0.06 });
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x) => ({
      ...clear,
      extinctionPerKm: x === 17 ? MAX_OPTICAL_DEPTH / 0.3 : 0.06,
    }));

    const visible = visibleCells(state, world, NOON, vantage);

    expect(visible.has(at(world, vantage, 1, 0))).toBe(true);
    expect(visible.has(at(world, vantage, 2, 0))).toBe(false);
  });

  it("does not recover contrast after a ray leaves an obscuring band", () => {
    const { state, world, vantage } = openWorld();
    const clear = testAtmosphere({ extinctionPerKm: 0.06 });
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x) => ({
      ...clear,
      extinctionPerKm: x === 17 ? MAX_OPTICAL_DEPTH / 0.3 : 0.06,
    }));

    const visible = visibleCells(state, world, NOON, vantage);

    expect(visible.has(at(world, vantage, 6, 0))).toBe(false);
  });

  it("adds independent obscurants along the same ray", () => {
    const { state, world, vantage } = openWorld();
    const rain = extinctionComponents({ rainMmPerHour: 0.5 }).total;
    const fog = extinctionComponents({ fog: 0.3 }).total;
    const combined = extinctionComponents({ rainMmPerHour: 0.5, fog: 0.3 }).total;
    setUniformExtinction(rain);
    expect(visibleCells(state, world, NOON, vantage).has(at(world, vantage, 10, 0))).toBe(true);
    setUniformExtinction(fog);
    expect(visibleCells(state, world, NOON, vantage).has(at(world, vantage, 10, 0))).toBe(true);
    setUniformExtinction(combined);
    expect(visibleCells(state, world, NOON, vantage).has(at(world, vantage, 10, 0))).toBe(false);
  });

  it("keeps mapped ground remembered when current weather hides it", () => {
    const { state, world, vantage } = openWorld();
    const far = at(world, vantage, 8, 0);
    testAtmosphere({ extinctionPerKm: 0.06 });
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, far)).toBe(true);

    setUniformExtinction(MAX_OPTICAL_DEPTH / 0.6);
    expect(visibleCells(state, world, NOON, vantage).has(far)).toBe(false);
    expect(isKnown(state, far)).toBe(true);
  });

  it("uses current visibility rather than mapped memory for wildlife", () => {
    const { state, world, vantage } = openWorld();
    const far = at(world, vantage, 8, 0);
    state.wildlife.activeRegion = 0;
    state.wildlife.subjects = [{
      id: 1, species: "deer", form: "herd", region: 0,
      cohorts: [{ sex: "f", bornYear: 1, count: 2 }], condition: 70,
      reproductive: "none", dependentUntilYear: 0, name: null, nameKind: "field",
      colour: 0, lastKnownDay: -1, denCell: null,
      active: {
        cell: far,
        position: { xM: (far % world.w + 0.5) * CELL_KM * 1000, yM: (Math.floor(far / world.w) + 0.5) * CELL_KM * 1000 },
        travel: null, hunger: 0, thirst: 0, rest: 0, alarm: 0, intent: "rest", target: null, route: [],
        escapeRemainingM: 0, escapeStartedMinute: null, lastDetectionMinute: null, escapeEpisode: 0,
      },
    }];
    setUniformExtinction(0.06);
    seeFrom(state, world, NOON, vantage);
    expect(visibleWildlife(state, world, NOON).map((subject) => subject.id)).toEqual([1]);

    setUniformExtinction(MAX_OPTICAL_DEPTH / 0.6);
    expect(visibleWildlife(state, world, NOON)).toEqual([]);
    expect(isKnown(state, far)).toBe(true);
  });

  it("samples each surrounding cell centre at most once within one visibility pass", () => {
    const { state, world, vantage } = openWorld();
    setUniformExtinction(0.06);

    visibleCells(state, world, NOON, vantage);

    // The ray fan crosses thousands of segments, but interpolated extinction
    // needs no more than the bounded local 32x32 centres plus local light.
    expect(vi.mocked(climate.sampleAtmosphere).mock.calls.length).toBeLessThanOrEqual(32 * 32 + 1);
  });

  it("interpolates continuously across cell boundaries independent of query order", () => {
    const { state, world } = openWorld();
    const clear = testAtmosphere();
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x) => ({
      ...clear,
      extinctionPerKm: x <= 16 ? 0.1 : 1.1,
    }));
    const forward = opticalSampler(state, world);
    const left = forward.extinction(16.499, 16);
    const right = forward.extinction(16.501, 16);
    const reverse = opticalSampler(state, world);
    expect(reverse.extinction(16.501, 16)).toBeCloseTo(right, 12);
    expect(reverse.extinction(16.499, 16)).toBeCloseTo(left, 12);
    expect(right - left).toBeCloseTo(0.002, 6);
    expect(forward.extinction(-1e-9, 16)).toBe(Number.POSITIVE_INFINITY);
    expect(forward.extinction(world.w - 1 + 1e-9, 16)).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps symmetric rays equal through smoothly varying air", () => {
    const { state, world, vantage } = openWorld();
    const clear = testAtmosphere();
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x, y) => ({
      ...clear,
      extinctionPerKm: 0.1 + 0.2 * Math.hypot(x - 16, y - 16),
    }));

    const visible = visibleCells(state, world, NOON, vantage);
    const cardinal = (distance: number) => [[distance, 0], [-distance, 0], [0, distance], [0, -distance]]
      .map(([dx, dy]) => visible.has(at(world, vantage, dx, dy)));

    expect(cardinal(9)).toEqual([true, true, true, true]);
    expect(cardinal(10)).toEqual([false, false, false, false]);
  });

  it("never sees beyond its Euclidean range at the square corners", () => {
    const { state, world } = newGame(1);
    const vantage = regionAt(world, state.player.region).cells.find((cell) => {
      const t = cellAt(world, cell).terrain;
      return t === "meadow" || t === "bog" || t === "fell" || t === "rock";
    });
    expect(vantage).toBeDefined();
    const range = sightRangeCells(state, world, NOON, vantage!);
    const vx = vantage! % world.w;
    const vy = Math.floor(vantage! / world.w);
    const farthest = Math.max(...[...visibleCells(state, world, NOON, vantage!)]
      .map((cell) => Math.hypot(cell % world.w - vx, Math.floor(cell / world.w) - vy)));
    expect(farthest).toBeLessThanOrEqual(range);
  });

  it("shows an open ridge but hides lower ground behind it", () => {
    const { state, world } = newGame(1);
    testAtmosphere({ cloud: 0, precipMmPerHour: 0, extinctionPerKm: 0.06 });
    let scenario: { vantage: number; ridge: number; behind: number } | null = null;
    const forest = new Set(["spruce", "pine", "birch"]);
    for (const vantage of regionAt(world, state.player.region).cells) {
      if (forest.has(cellAt(world, vantage).terrain)) continue;
      const vx = vantage % world.w;
      const vy = Math.floor(vantage / world.w);
      const observer = Math.min(1, Math.max(0, fieldsAt(world.seed, vx, vy).e)) * 1200 + 1.7;
      const range = Math.min(12, sightRangeCells(state, world, NOON, vantage));
      for (const [dx, dy] of DIRS) {
        let highestSlope = -Infinity;
        let ridge = -1;
        for (let distance = 1; distance <= range; distance++) {
          const x = vx + dx * distance;
          const y = vy + dy * distance;
          const cell = y * world.w + x;
          if (x < 0 || y < 0 || x >= world.w || y >= world.h || forest.has(cellAt(world, cell).terrain)) break;
          const elevation = Math.min(1, Math.max(0, fieldsAt(world.seed, x, y).e)) * 1200;
          const slope = (elevation - observer) / distance;
          if (slope > highestSlope + 8) {
            highestSlope = slope;
            ridge = cell;
          } else if (ridge >= 0 && highestSlope > slope + 15) {
            scenario = { vantage, ridge, behind: cell };
            break;
          }
        }
        if (scenario) break;
      }
      if (scenario) break;
    }
    expect(scenario).not.toBeNull();
    const visible = visibleCells(state, world, NOON, scenario!.vantage);
    expect(visible.has(scenario!.ridge)).toBe(true);
    expect(visible.has(scenario!.behind)).toBe(false);
  });

  it("reads far over open ground and no further than the next cell through closed spruce", () => {
    const { state, world } = newGame(1);
    testAtmosphere({ extinctionPerKm: 0.06 });
    const region = state.player.region;
    const { vantage, end } = openRun(world, region, 10);
    forget(state);
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, end)).toBe(true);

    const { state: state2, world: world2 } = newGame(1);
    const spruce = spruceCell(world2, state2.player.region);
    const sx = spruce % world2.w;
    const sy = Math.floor(spruce / world2.w);
    const neighbour = (sx > 0 ? sy * world2.w + (sx - 1) : sy * world2.w + (sx + 1));
    forget(state2);
    seeFrom(state2, world2, NOON, spruce);
    expect(isKnown(state2, spruce)).toBe(true);
    // The ring you stand in: a cell is 300 m and a survivor walks across it, so
    // the ground a few strides away is known even under a canopy that shows
    // nothing at any distance.
    expect(isKnown(state2, neighbour)).toBe(true);
    // And no further. The canopy still takes everything past the neighbour.
    const beyond = sx > 0 ? sy * world2.w + (sx - 2) : sy * world2.w + (sx + 2);
    expect(isKnown(state2, beyond)).toBe(false);
  });

  it("takes the ring away again once the light is under what walking wants", () => {
    const { state, world } = newGame(1);
    const spruce = spruceCell(world, state.player.region);
    const sx = spruce % world.w;
    const sy = Math.floor(spruce / world.w);
    const neighbour = sx > 0 ? sy * world.w + (sx - 1) : sy * world.w + (sx + 1);
    state.weather.clear = false;
    const night = { ...NOON, hour: 2, dayOfYear: 334, month: 11, isNight: true, moon: 0, moonLight: 0 };
    forget(state);
    seeFrom(state, world, night, spruce);
    expect(isKnown(state, spruce)).toBe(true);
    expect(isKnown(state, neighbour)).toBe(false);
  });

  it("maps nothing at night", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const { vantage, end } = openRun(world, region, 10);
    state.weather.clear = false;
    // 2 a.m. in December, moon new: astronomical night with cloud over what little
    // starlight there is, so illuminance floors at the dark reference and the light
    // factor is exactly 0.
    const night = { ...NOON, hour: 2, dayOfYear: 334, month: 11, isNight: true, moon: 0, moonLight: 0 };
    forget(state);
    seeFrom(state, world, night, vantage);
    expect(isKnown(state, vantage)).toBe(true);
    expect(isKnown(state, end)).toBe(false);
  });

  it("a torch lights nearby ground but does not turn night into distant terrain sight", () => {
    const { state, world } = newGame(1);
    const { vantage, end } = openRun(world, state.player.region, 10);
    placeAt(state, world, vantage);
    state.player.torch = { lit: true, minutes: 60 };
    state.weather.clear = false;
    const night = { ...NOON, hour: 2, dayOfYear: 334, month: 11, isNight: true, moon: 0, moonLight: 0 };
    const visible = visibleCells(state, world, night, vantage);
    expect(visible.has(vantage)).toBe(true);
    expect(visible.has(end)).toBe(false);
  });

  it("stops at the first blocking canopy", () => {
    const { state, world, vantage } = openWorld();
    // Immutable-terrain viewsheds are seed-keyed; this is a different fixture.
    world.seed = 2;
    const water = at(world, vantage, 1, 0);
    const spruce = at(world, vantage, 2, 0);
    const behind = at(world, vantage, 3, 0);
    const terrain = world.fineChunks.get(0)!.terrain;
    terrain[16 * FINE_CHUNK + 17] = TERRAIN_INDEX.water;
    terrain[16 * FINE_CHUNK + 18] = TERRAIN_INDEX.spruce;
    forget(state);
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, water)).toBe(true);
    expect(isKnown(state, spruce)).toBe(true);
    expect(isKnown(state, behind)).toBe(false);
  });
});
