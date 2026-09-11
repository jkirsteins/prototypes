import { newKnowledge } from "../src/sim/fineknowledge";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import { calendar } from "../src/sim/calendar";
import { CLEAR_MOR_KM, extinctionComponents, MAX_OPTICAL_DEPTH } from "../src/sim/climate";
import { isKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { campfireVisible, clearObstacleReadCount, obstacleReadCount, opticalCandidateRangeCells, opticalSampler, seeFrom, sightRangeCells, visibleCells } from "../src/sim/sight";
import { setSkillLevel } from "../src/sim/horizon";
import { placeAt } from "../src/sim/position";
import { PATCH_KM, PATCH_M } from "../src/world/spatial";
import { FINE_CHUNK as CHUNK_PATCHES } from "../src/world/cells";
import { current } from "../src/sim/record";
import type { GameState } from "../src/sim/types";
import { visibleWildlife } from "../src/sim/wildlife-agents";
import { cellAt, regionAt, type World } from "../src/world/gen";
import { FINE_CHUNK, newWorld } from "../src/world/cells";
import * as fineTerrain from "../src/world/fine-terrain";
import { fieldsAtPatch } from "../src/world/fine-terrain";
import { TERRAIN_INDEX } from "../src/world/terrain";
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
        const observer = fieldsAtPatch(world.seed, y * world.w + x).elevationM + 1.7;
        let horizon = -Infinity;
        for (let i = 1; i <= n; i++) {
          const elevation = fieldsAtPatch(world.seed, (y + dy * i) * world.w + x + dx * i).elevationM;
          const slope = (elevation - observer) / i;
          if (i === n && slope < horizon) ok = false;
          horizon = Math.max(horizon, slope);
        }
      }
      if (ok) return { vantage: idx, end };
    }
  }
  throw new Error(`region ${region} has no ${n}-patch open run`);
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
  // The physical field itself, so a ray, the parent summaries its bounds come
  // from and the generated terrain beyond the fixture chunk all agree.
  flatFields(600);
  const terrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK);
  terrain.fill(7); // TERRAINS[7] is meadow.
  const region = new Int32Array(FINE_CHUNK * FINE_CHUNK);
  const world = newWorld(1);
  world.fineChunks.set(0, { cx: 0, cy: 0, terrain, region,
    samples: terrain.length, parentSummaries: new Map() });
  // The middle of the chunk, so a ray has the same room in every direction.
  const vantage = 48 * world.w + 48;
  state.player.xM = 48.5 * PATCH_M;
  state.player.yM = 48.5 * PATCH_M;
  state.player.region = 0;
  state.weather.ground[0] = { updatedHour: 0, snowCm: 0, surfaceWaterMm: 0,
    soilMoisture: 0.3, frost: 0, iceCm: 0, dryHours: 0, temperatureSum: 0, temperatureHours: 0 };
  return { state, world, vantage };
}

/** One elevation over the whole world, at the physical field every consumer reads. */
function flatFields(elevationM: number): void {
  const fields = { elevationM, moisture: 0.3, exposure: 0.4, drainage: 0.5, sea: false, inlandWater: false, coast: 1 };
  // Both entry points: the ray reads patches and the parent summaries its
  // bounds come from read patches, while generated terrain reads metres.
  vi.spyOn(fineTerrain, "fieldsAtPatch").mockReturnValue(fields);
  vi.spyOn(fineTerrain, "fieldsAtMetric").mockReturnValue(fields);
}

function at(world: World, vantage: number, dx: number, dy: number): number {
  return vantage + dy * world.w + dx;
}

/** A fixture distance said in metres, in patches. Optics are physical, the lattice is not. */
function away(metres: number): number {
  return Math.round(metres / PATCH_M);
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
function forget(state: GameState): void {
  state.knowledge = newKnowledge();
}


/**
 * A scene drawn row by row, at the same public FineGrid contract as the
 * routing fixture: every patch is 50 m, coordinates are scene-local, and the
 * characters say what stands there.
 *
 *   `.` open ground at sea level      `@` the observer, on open ground
 *   `^` a rock band, ROCK_BAND_M up   `T` closed spruce, 22 m crowns
 *
 * Elevation and canopy are explicit so a test can say exactly what should
 * hide what, and both the ray and the parent summaries that accelerate it
 * read the same numbers.
 */
const ROCK_BAND_M = 3;
const SCENE_ORIGIN = 8;

interface FineSightScene {
  state: GameState;
  world: World;
  vantage: number;
  id(x: number, y: number): number;
}

function fineSightFixture(rows: string[]): FineSightScene {
  const state = newGame(1).state;
  const elevations = new Map<number, number>();
  const world = newWorld(1);
  const terrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK);
  terrain.fill(TERRAIN_INDEX.meadow);
  const region = new Int32Array(FINE_CHUNK * FINE_CHUNK);
  world.fineChunks.set(0, { cx: 0, cy: 0, terrain, region, samples: terrain.length, parentSummaries: new Map() });
  const id = (x: number, y: number) => (SCENE_ORIGIN + y) * world.w + SCENE_ORIGIN + x;
  let vantage = -1;
  rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      const px = SCENE_ORIGIN + x;
      const py = SCENE_ORIGIN + y;
      if (glyph === "^") {
        terrain[py * FINE_CHUNK + px] = TERRAIN_INDEX.rock;
        elevations.set(id(x, y), ROCK_BAND_M);
      }
      if (glyph === "T") terrain[py * FINE_CHUNK + px] = TERRAIN_INDEX.spruce;
      if (glyph === "@") vantage = id(x, y);
    });
  });
  if (vantage < 0) throw new Error("the scene has no observer");
  const fields = (patch: number) => ({
    elevationM: elevations.get(patch) ?? 0,
    moisture: 0.3, exposure: 0.4, drainage: 0.5, sea: false, inlandWater: false, coast: 1,
  });
  vi.spyOn(fineTerrain, "fieldsAtPatch").mockImplementation((_seed, patch) => fields(patch));
  vi.spyOn(fineTerrain, "fieldsAtMetric").mockImplementation((_seed, point) =>
    fields(Math.floor(point.yM / PATCH_M) * world.w + Math.floor(point.xM / PATCH_M)));
  state.player.xM = (vantage % world.w + 0.5) * PATCH_M;
  state.player.yM = (Math.floor(vantage / world.w) + 0.5) * PATCH_M;
  state.player.region = 0;
  state.weather.ground[0] = { updatedHour: 0, snowCm: 0, surfaceWaterMm: 0,
    soilMoisture: 0.3, frost: 0, iceCm: 0, dryHours: 0, temperatureSum: 0, temperatureHours: 0 };
  testAtmosphere({ extinctionPerKm: 0.06 });
  return { state, world, vantage, id };
}

describe("sight", () => {
  it("enumerates one fine chunk of ground and never past the clear-air MOR", () => {
    // A fell vantage reaches thousands of patches; what is read patch by patch
    // is the chunk of ground the world holds at 50 m, well inside clear air's
    // own contrast limit.
    const candidates = opticalCandidateRangeCells(100_000);
    expect(candidates).toBe(CHUNK_PATCHES);
    expect(candidates * PATCH_KM).toBeLessThan(CLEAR_MOR_KM);
    expect(opticalCandidateRangeCells(away(600))).toBe(away(600));
  });

  it("reads the geometric horizon of the fell it stands on, and no further", () => {
    const { state, world, vantage } = openWorld();
    world.fineChunks.get(0)!.terrain.fill(TERRAIN_INDEX.fell);
    flatFields(1_200);
    testAtmosphere({ cloud: 0, precipMmPerHour: 0, extinctionPerKm: 0.06 });
    current(state).person.axes.eyes = 2;
    setSkillLevel(state, "wayfinding", 20);
    // The fell spine this world is drawn to rises to 1200 m: a geometric
    // horizon of 124 km, and no more however sharp the eye (1.5x) and however
    // practised the wayfinder (1.5x).
    const spineHorizonKm = 3.57 * Math.sqrt(1_200);
    const reachKm = sightRangeCells(state, world, NOON, vantage) * PATCH_KM;
    expect(reachKm).toBeGreaterThan(spineHorizonKm);
    expect(reachKm).toBeCloseTo(2.25 * spineHorizonKm, 0);
  });

  it("uses one physical radius in cardinal and diagonal directions", () => {
    const { state, world, vantage } = openWorld();
    testAtmosphere({ extinctionPerKm: 0.06 });

    const visible = visibleCells(state, world, NOON, vantage);
    // 3-4-5: the same 3.5 km from the vantage along an axis and on the
    // diagonal, and a square corner at 4.9 km that the eye's own 4.65 km
    // horizon does not reach.
    const r = away(3_500);
    expect(visible.has(at(world, vantage, r, 0))).toBe(true);
    expect(visible.has(at(world, vantage, r * 3 / 5, r * 4 / 5))).toBe(true);
    expect(visible.has(at(world, vantage, r, r))).toBe(false);
  });

  it("stops at the meteorological optical range in uniform air", () => {
    const { state, world, vantage } = openWorld();
    testAtmosphere({ extinctionPerKm: MAX_OPTICAL_DEPTH / 1.2 });

    const visible = visibleCells(state, world, NOON, vantage);

    // A 1.2 km meteorological range: ground just inside it, nothing past it.
    expect(visible.has(at(world, vantage, away(1_050), 0))).toBe(true);
    expect(visible.has(at(world, vantage, away(1_350), 0))).toBe(false);
  });

  it("lets a luminous campfire ray use its own contrast threshold", () => {
    const { state, world, vantage } = openWorld();
    const fire = at(world, vantage, away(3_000), 0);
    setUniformExtinction(0.06);

    expect(campfireVisible(state, world, vantage, fire)).toBe(true);
  });

  it("hides a campfire behind dense weather even when terrain is clear", () => {
    const { state, world, vantage } = openWorld();
    const fire = at(world, vantage, away(3_000), 0);
    setUniformExtinction(MAX_OPTICAL_DEPTH / 0.2);

    expect(campfireVisible(state, world, vantage, fire)).toBe(false);
  });

  it("attenuates a ray through a local obscuring band", () => {
    const { state, world, vantage } = openWorld();
    const clear = testAtmosphere({ extinctionPerKm: 0.06 });
    // A 300 m band of dense air one patch east of the vantage: the air is read
    // on its own 300 m grid, so the band is stated at that grain.
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x) => ({
      ...clear,
      extinctionPerKm: x >= 54 && x < 60 ? MAX_OPTICAL_DEPTH / 0.3 : 0.06,
    }));

    const visible = visibleCells(state, world, NOON, vantage);

    expect(visible.has(at(world, vantage, 1, 0))).toBe(true);
    expect(visible.has(at(world, vantage, away(700), 0))).toBe(false);
  });

  it("does not recover contrast after a ray leaves an obscuring band", () => {
    const { state, world, vantage } = openWorld();
    const clear = testAtmosphere({ extinctionPerKm: 0.06 });
    // A 300 m band of dense air one patch east of the vantage: the air is read
    // on its own 300 m grid, so the band is stated at that grain.
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x) => ({
      ...clear,
      extinctionPerKm: x >= 54 && x < 60 ? MAX_OPTICAL_DEPTH / 0.3 : 0.06,
    }));

    const visible = visibleCells(state, world, NOON, vantage);

    expect(visible.has(at(world, vantage, away(1_500), 0))).toBe(false);
  });

  it("adds independent obscurants along the same ray", () => {
    const { state, world, vantage } = openWorld();
    const rain = extinctionComponents({ rainMmPerHour: 0.5 }).total;
    const fog = extinctionComponents({ fog: 0.3 }).total;
    const combined = extinctionComponents({ rainMmPerHour: 0.5, fog: 0.3 }).total;
    const target = at(world, vantage, away(3_000), 0);
    setUniformExtinction(rain);
    expect(visibleCells(state, world, NOON, vantage).has(target)).toBe(true);
    setUniformExtinction(fog);
    expect(visibleCells(state, world, NOON, vantage).has(target)).toBe(true);
    setUniformExtinction(combined);
    expect(visibleCells(state, world, NOON, vantage).has(target)).toBe(false);
  });

  it("keeps mapped ground remembered when current weather hides it", () => {
    const { state, world, vantage } = openWorld();
    const far = at(world, vantage, away(2_400), 0);
    testAtmosphere({ extinctionPerKm: 0.06 });
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, far)).toBe(true);

    setUniformExtinction(MAX_OPTICAL_DEPTH / 0.6);
    expect(visibleCells(state, world, NOON, vantage).has(far)).toBe(false);
    expect(isKnown(state, far)).toBe(true);
  });

  it("uses current visibility rather than mapped memory for wildlife", () => {
    const { state, world, vantage } = openWorld();
    const far = at(world, vantage, away(2_400), 0);
    state.wildlife.activeRegion = 0;
    state.wildlife.subjects = [{
      id: 1, species: "deer", form: "herd", region: 0,
      cohorts: [{ sex: "f", bornYear: 1, count: 2 }], condition: 70,
      reproductive: "none", dependentUntilYear: 0, name: null, nameKind: "field",
      colour: 0, lastKnownDay: -1, denCell: null,
      active: {
        cell: far,
        position: { xM: (far % world.w + 0.5) * PATCH_M, yM: (Math.floor(far / world.w) + 0.5) * PATCH_M },
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
      extinctionPerKm: x <= 48 ? 0.1 : 1.1,
    }));
    const forward = opticalSampler(state, world);
    const left = forward.extinction(48.499, 48);
    const right = forward.extinction(48.501, 48);
    const reverse = opticalSampler(state, world);
    expect(reverse.extinction(48.501, 48)).toBeCloseTo(right, 12);
    expect(reverse.extinction(48.499, 48)).toBeCloseTo(left, 12);
    // The air is read every 300 m, so the same 0.002-patch step moves a sixth
    // as far between two samples as a patch-grained field would.
    expect(right - left).toBeCloseTo(0.002 / 6, 8);
    expect(forward.extinction(-1e-9, 48)).toBe(Number.POSITIVE_INFINITY);
    expect(forward.extinction(world.w - 1 + 1e-9, 48)).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps symmetric rays equal through smoothly varying air", () => {
    const { state, world, vantage } = openWorld();
    const clear = testAtmosphere();
    vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, _minute, x, y) => ({
      ...clear,
      extinctionPerKm: 0.1 + 0.2 * Math.hypot(x - 48, y - 48),
    }));

    const visible = visibleCells(state, world, NOON, vantage);
    const cardinal = (distance: number) => [[distance, 0], [-distance, 0], [0, distance], [0, -distance]]
      .map(([dx, dy]) => visible.has(at(world, vantage, dx, dy)));

    // Extinction climbs with distance from the vantage, so the ray runs out of
    // contrast at the same range whichever way it is cast.
    expect(cardinal(away(1_100))).toEqual([true, true, true, true]);
    expect(cardinal(away(1_300))).toEqual([false, false, false, false]);
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
      const observer = fieldsAtPatch(world.seed, vantage).elevationM + 1.7;
      const range = Math.min(12, sightRangeCells(state, world, NOON, vantage));
      for (const [dx, dy] of DIRS) {
        let highestSlope = -Infinity;
        let ridge = -1;
        for (let distance = 1; distance <= range; distance++) {
          const x = vx + dx * distance;
          const y = vy + dy * distance;
          const cell = y * world.w + x;
          if (x < 0 || y < 0 || x >= world.w || y >= world.h || forest.has(cellAt(world, cell).terrain)) break;
          const elevation = fieldsAtPatch(world.seed, cell).elevationM;
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


  it("blocks the lower ground behind a one-patch rock band", () => {
    const scene = fineSightFixture([".....", ".@^..", "....."]);
    const visible = visibleCells(scene.state, scene.world, NOON, scene.vantage);
    // A 3 m band 50 m away stands over a 1.7 m eye's line to the flat ground
    // beyond it, and the patch beside it is open.
    expect(visible.has(scene.id(2, 1))).toBe(true);
    expect(visible.has(scene.id(3, 1))).toBe(false);
    expect(visible.has(scene.id(3, 0))).toBe(true);
  });

  it("subdivides a parent whose bounds settle neither side of the ray", () => {
    // The band sits inside the fourth 300 m parent east of the observer, past
    // the close view, and that parent's own bounds say only that something in
    // there stands 3 m up: the patches before the band are open ground and the
    // ones behind it are hidden, which only an exact descent can tell apart.
    // The observer, 19 patches of open ground, the band at 1 km, and more open ground behind it.
    const eastward = `@${".".repeat(19)}^${".".repeat(5)}`;
    const scene = fineSightFixture([eastward, ".".repeat(eastward.length)]);
    const visible = visibleCells(scene.state, scene.world, NOON, scene.vantage);
    expect(visible.has(scene.id(19, 0))).toBe(true);
    expect(visible.has(scene.id(20, 0))).toBe(true);
    expect(visible.has(scene.id(21, 0))).toBe(false);
    expect(visible.has(scene.id(25, 0))).toBe(false);
    // The row beside it, in the same parents, keeps its open view.
    expect(visible.has(scene.id(25, 1))).toBe(true);
  });

  it("reads far fewer exact patches than a ray that descends everywhere", () => {
    const { state, world, vantage } = openWorld();
    testAtmosphere({ extinctionPerKm: 0.06 });
    clearObstacleReadCount();
    const visible = visibleCells(state, world, NOON, vantage);
    const reads = obstacleReadCount();
    // Every ray in the fan crosses about 93 patches; the summaries settle the
    // flat country beyond the close view without reading any of them.
    expect(visible.size).toBeGreaterThan(5_000);
    expect(reads).toBeLessThan(visible.size / 4);
  });

  it("reads far over open ground and no further than the next cell through closed spruce", () => {
    const { state, world } = newGame(1);
    testAtmosphere({ extinctionPerKm: 0.06 });
    const region = state.player.region;
    const { vantage, end } = openRun(world, region, away(3_000));
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
    const { vantage, end } = openRun(world, region, away(3_000));
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
    const { vantage, end } = openRun(world, state.player.region, away(3_000));
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
    terrain[48 * FINE_CHUNK + 49] = TERRAIN_INDEX.water;
    terrain[48 * FINE_CHUNK + 50] = TERRAIN_INDEX.spruce;
    forget(state);
    seeFrom(state, world, NOON, vantage);
    expect(isKnown(state, water)).toBe(true);
    expect(isKnown(state, spruce)).toBe(true);
    expect(isKnown(state, behind)).toBe(false);
  });
});
