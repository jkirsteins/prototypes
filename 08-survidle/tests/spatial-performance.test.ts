/**
 * The performance envelope of the authoritative fine world, as work counts.
 *
 * Section 15 of the authoritative-close-zoom spec asks for gates a fast host
 * cannot hide: no whole-world FINE array, no whole-world fine scan, no
 * unchanged frame
 * rebuilding terrain, no unknown ground generated to draw fog, and repeated
 * scheduler route checks reusing the topology they already paid for. Every
 * assertion below is therefore an exact count of retained or repeated work,
 * read from `worldCacheStats`. Wall time is asserted only where the spec
 * states a ceiling, and then broadly, because it is the one number that
 * differs between a laptop and CI.
 *
 * The solve's seven 300 m arrays are the named exception to "no whole-world
 * array": they are the world's authoritative height and water, solved once
 * behind a progress bar and cached by seed, and no gate here asks them to be
 * smaller or faster. Everything counted below is fine work over them.
 *
 * The fresh-world two second ceiling itself is asserted in start.test.ts,
 * measured from solved arrays in hand to a started run, and is not repeated
 * here.
 */
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { mapRegion, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { patchOf } from "../src/sim/position";
import { addOrder, runOrders } from "../src/sim/orders";
import { serialize } from "../src/sim/save";
import { clearObstacleReadCount, obstacleReadCount, sightReachCells, visibleCells } from "../src/sim/sight";
import { LEVELS, mapHtml } from "../src/ui/map";
import { newUiState, type UiState } from "../src/ui/render";
import { worldCacheStats } from "../src/world/aggregate";
import { knownRoute } from "../src/world/route";
import { patchId } from "../src/world/spatial";
import type { GameState } from "../src/sim/types";
import type { World } from "../src/world/cells";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

const CAL = calendar(10);

/** Game days the extended headless run covers. */
const RUN_DAYS = 20;

function open(zoom: number): UiState {
  return { ...newUiState(), zoom, welcome: false };
}

function render(world: World, state: GameState, zoom: number): void {
  document.body.innerHTML = `<div id="map">${mapHtml(world, state, open(zoom), CAL)}</div>`;
}

/**
 * A survivor with a camp, a mapped region around it and one queued job at a
 * reachable spot away from camp, so judging the list has a route to check.
 * Berries are that job: the nearest patch of them is a few hundred metres
 * off, where felling or water is answered at the camp cell itself and would
 * make a routing gate measure nothing.
 */
function schedulerRouteScene(seed: number) {
  testAtmosphere();
  const { state, world } = newGame(seed);
  siteCamp(state, world);
  mapRegion(state, world, state.player.region);
  addOrder(state, world, { task: "berries", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  return { state, world, cal: calendar(state.minute, state.startDoy), rng: new Rng(7) };
}

describe("the lazy fine lattice", () => {
  it("does not allocate the whole fine world during boot or whole-map render", () => {
    const { state, world } = newGame(21);
    mapHtml(world, state, { ...newUiState(), zoom: LEVELS.length - 1 }, calendar(0));
    const stats = worldCacheStats(world);
    expect(stats.fineChunks).toBeLessThan(96);
    expect(stats.generatedPatches).toBeLessThan(96 * 96 * 96);
  });

  it("bounds every cache it keeps", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    mapRegion(state, world, state.player.region);
    for (let zoom = 0; zoom < LEVELS.length; zoom++) render(world, state, zoom);
    const stats = worldCacheStats(world);
    expect(stats.fineChunks).toBeLessThanOrEqual(stats.fineChunkLimit);
    expect(stats.topologies).toBeLessThanOrEqual(stats.topologyLimit);
    expect(stats.overlays).toBeLessThanOrEqual(stats.overlayLimit);
    expect(stats.routes).toBeLessThanOrEqual(stats.routeLimit);
  });

  it("redraws an unchanged rung without building terrain or summaries again", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    mapRegion(state, world, state.player.region);
    for (let zoom = 0; zoom < LEVELS.length; zoom++) {
      render(world, state, zoom);
      const cold = worldCacheStats(world);
      render(world, state, zoom);
      render(world, state, zoom);
      const cached = worldCacheStats(world);
      expect(cached.fineChunkBuilds - cold.fineChunkBuilds).toBe(0);
      expect(cached.parentSummaryBuilds - cold.parentSummaryBuilds).toBe(0);
    }
  });

  it("draws fog over unknown ground without generating a patch of it", () => {
    const { state, world } = newGame(21);
    // Ground nobody has seen, far from the landing, at the widest block rung
    // and the one below it: fog is the answer and fog has no terrain.
    render(world, state, 4);
    const before = worldCacheStats(world);
    render(world, state, 4);
    render(world, state, 3);
    render(world, state, 3);
    const after = worldCacheStats(world);
    expect(after.generatedPatches).toBe(before.generatedPatches);
    expect(after.fineChunkBuilds).toBe(before.fineChunkBuilds);
  });
});

describe("routing work", () => {
  it("walks 50 metres without building a second parent's topology", () => {
    const { state, world } = schedulerRouteScene(21);
    const from = patchOf(state, world);
    // A neighbour patch inside the same parent: one topology, no portals.
    const to = from + 1;
    markKnown(state, to);
    const before = worldCacheStats(world);
    expect(knownRoute(world, from, to, () => true, "perf-50m")).not.toBeNull();
    const after = worldCacheStats(world);
    expect(after.topologyBuilds - before.topologyBuilds).toBeLessThanOrEqual(2);
    expect(after.routeBuilds - before.routeBuilds).toBe(1);
  });

  it("answers a repeated 20 km route from the route cache", () => {
    const { state, world } = schedulerRouteScene(21);
    const from = patchOf(state, world);
    const to = from + 400;
    const cold = worldCacheStats(world);
    const first = knownRoute(world, from, to, () => true, "perf-20km");
    const warm = worldCacheStats(world);
    expect(first).not.toBeNull();
    expect(warm.routeBuilds - cold.routeBuilds).toBe(1);
    // One search, and a bounded one. The hierarchical router opens a parent's
    // topology at a time inside its margin box; 400 patches of easting measured
    // 2,216 of them. The ceiling is generous on purpose - the number moves with
    // the ground a seed puts in the way - but it is a ceiling, so a search that
    // started walking the whole lattice could not hide behind a fast host.
    expect(warm.topologyBuilds - cold.topologyBuilds).toBeLessThan(5000);
    for (let i = 0; i < 20; i++) expect(knownRoute(world, from, to, () => true, "perf-20km")).toEqual(first);
    const after = worldCacheStats(world);
    expect(after.routeBuilds).toBe(warm.routeBuilds);
    expect(after.topologyBuilds).toBe(warm.topologyBuilds);
  });

  it("reuses parent topology across repeated scheduler routes", () => {
    const scene = schedulerRouteScene(21);
    const before = worldCacheStats(scene.world);
    runOrders(scene.state, scene.world, scene.cal, scene.rng);
    const cold = worldCacheStats(scene.world);
    // The first judgement of the list does route to the work, or this gate
    // would pass on a scheduler that never looked.
    expect(cold.routeBuilds).toBeGreaterThan(before.routeBuilds);
    for (let i = 0; i < 20; i++) runOrders(scene.state, scene.world, scene.cal, scene.rng);
    const after = worldCacheStats(scene.world);
    expect(after.topologyBuilds).toBe(cold.topologyBuilds);
    expect(after.routeBuilds).toBe(cold.routeBuilds);
  });
});

describe("an extended headless run", () => {
  it("keeps every cache inside its cap and stops paying for ground it has walked", () => {
    const scene = schedulerRouteScene(21);
    const { state, world } = scene;
    const days: { routes: number; chunks: number; summaries: number; topologies: number }[] = [];
    for (let day = 0; day < RUN_DAYS; day++) {
      const before = worldCacheStats(world);
      for (let hour = 0; hour < 24; hour++) advance(state, world, 60);
      const stats = worldCacheStats(world);
      days.push({
        routes: stats.routeBuilds - before.routeBuilds,
        chunks: stats.fineChunkBuilds - before.fineChunkBuilds,
        summaries: stats.parentSummaryBuilds - before.parentSummaryBuilds,
        topologies: stats.topologyBuilds - before.topologyBuilds,
      });
      // Every cap, every day: a run that leaks is a run whose caches grow past
      // the sizes they declare, and that shows the day it starts.
      expect(stats.fineChunks).toBeLessThanOrEqual(stats.fineChunkLimit);
      expect(stats.topologies).toBeLessThanOrEqual(stats.topologyLimit);
      expect(stats.overlays).toBeLessThanOrEqual(stats.overlayLimit);
      expect(stats.routes).toBeLessThanOrEqual(stats.routeLimit);
    }
    // The first day pays for the ground the survivor works in: chunks built,
    // parents summarised, the parent topology around camp flooded. Every day
    // after is the same ground, so none of that is paid twice however long the
    // run goes on.
    expect(days[0].routes).toBeGreaterThan(0);
    for (const day of days.slice(1)) {
      expect(day.chunks).toBe(0);
      expect(day.summaries).toBe(0);
      expect(day.topologies).toBe(0);
    }
    // Routing does go on, because the survivor keeps being sent somewhere, but
    // its cost is a day's work rather than the run's length: no later day may
    // cost more than twice the first ordinary day.
    const ordinary = days[1].routes;
    for (const day of days.slice(1)) expect(day.routes).toBeLessThanOrEqual(ordinary * 2);
    // Wall time is vitest's own per-test figure rather than an assertion here:
    // the run's length is a host reading and the counts above are not.
  });
});

describe("visibility work", () => {
  it("reads each obstruction once per viewshed and nothing on a repeat", () => {
    const { state, world } = schedulerRouteScene(21);
    // A vantage the survivor's own sight has not already answered, so this
    // measures one cold viewshed rather than the cache it left behind.
    const cell = patchOf(state, world) + 30;
    clearObstacleReadCount();
    const close = visibleCells(state, world, CAL, cell);
    expect(close.size).toBeGreaterThan(0);
    expect(obstacleReadCount()).toBeGreaterThan(0);
    clearObstacleReadCount();
    visibleCells(state, world, CAL, cell);
    expect(obstacleReadCount()).toBe(0);
  });

  it("keeps a long view inside the reach it claims", () => {
    const { state, world } = schedulerRouteScene(21);
    // Three kilometres north of the camp, so this is a cold long view rather
    // than the one the survivor's own eyes already paid for.
    const cell = patchOf(state, world) - 60 * world.w;
    const reach = sightReachCells(state, world, CAL, cell);
    clearObstacleReadCount();
    visibleCells(state, world, CAL, cell);
    // Every obstruction read is a patch inside the square the reach spans,
    // read once: a view cannot walk off its own reach, and no ray re-reads
    // ground another ray has already crossed.
    const reads = obstacleReadCount();
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual((2 * reach + 1) ** 2);
    expect(worldCacheStats(world).fineChunks).toBeLessThanOrEqual(worldCacheStats(world).fineChunkLimit);
  });
});

describe("the save after broad mapping", () => {
  it("stays proportional to the ground the survivor knows", () => {
    const { state, world } = schedulerRouteScene(21);
    const ordinary = serialize(state).length;
    for (let y = 0; y < 216; y++) {
      for (let x = 0; x < 216; x++) markKnown(state, patchId(3300 + x, 1000 + y));
    }
    const broad = serialize(state).length;
    // 46,656 further patches of knowledge. Compact knowledge means the save
    // grows by far less than a byte a patch, and the world itself contributes
    // nothing: terrain is a function of the seed.
    expect(broad).toBeGreaterThan(ordinary);
    expect(broad - ordinary).toBeLessThan(216 * 216);
    expect(worldCacheStats(world).fineChunks).toBeLessThanOrEqual(worldCacheStats(world).fineChunkLimit);
  });
});
