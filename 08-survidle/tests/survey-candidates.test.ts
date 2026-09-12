import { newKnowledge } from "../src/sim/fineknowledge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { baseWalkSpeed } from "../src/sim/player";
import * as routing from "../src/sim/routing";
import * as sight from "../src/sim/sight";
import * as tasks from "../src/sim/tasks";
import { localWeather } from "../src/sim/weather";
import { FINE_CHUNK } from "../src/world/cells";
import * as cells from "../src/world/cells";
import { regionAt } from "../src/world/gen";
import * as fineTerrain from "../src/world/fine-terrain";
import { PATCH_M, patchId } from "../src/world/spatial";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { testAtmosphere } from "./weather-helpers";
import { solvedWorld } from "./world-fixture";
import { refineChunk } from "../src/world/refine";

afterEach(() => vi.restoreAllMocks());

function fixture(blocked: boolean) {
  const game = newGame(17);
  const region = { ...regionAt(game.world, game.state.player.region) };
  const world = solvedWorld(21);
  world.start = region.id;
  const terrain = new Uint8Array(FINE_CHUNK ** 2).fill(TERRAIN_INDEX.meadow);
  const ownership = new Int32Array(FINE_CHUNK ** 2).fill(-1);
  region.cells = [];
  for (let y = 12; y < 17; y++) for (let x = 12; x < 17; x++) {
    region.cells.push(patchId(x, y));
    ownership[y * FINE_CHUNK + x] = region.id;
    if (blocked && x === 15 && y !== 16) terrain[y * FINE_CHUNK + x] = TERRAIN_INDEX.water;
  }
  region.campCell = patchId(14, 14);
  region.spots = [];
  world.regions.set(region.id, region);
  world.fineChunks.set(0, { cx: 0, cy: 0, fine: refineChunk(world.seed, world.solved, 0, 0), terrain, region: ownership, samples: terrain.length, parentSummaries: new Map() });
  const state = game.state;
  state.player.xM = 14.5 * PATCH_M;
  state.player.yM = 14.5 * PATCH_M;
  state.knowledge = newKnowledge();
  const fields = fineTerrain.fieldsAtPatch(world.seed, region.campCell);
  vi.spyOn(fineTerrain, "fieldsAtPatch").mockReturnValue({ ...fields, elevationM: 0 });
  vi.spyOn(sight, "sightReachCells").mockImplementation((_state, _world, _cal, cell) => blocked && cell % world.w === 16 ? 5 : 2);
  testAtmosphere();
  return { state, world, region, cal: calendar(state.minute, state.startDoy) };
}

describe("bounded exact survey ranking", () => {
  it("keeps exact local water components separate across an external connection", () => {
    const { world, region } = fixture(false);
    const terrain = world.fineChunks.get(0)!.terrain;
    for (const [x, y] of [[12, 13], [12, 15], [11, 13], [11, 14], [11, 15]]) terrain[y * FINE_CHUNK + x] = TERRAIN_INDEX.water;
    const reads = vi.spyOn(cells, "cellAt");
    const systems = tasks.surveyWaters(world, region.id);
    expect(systems.map(system => system.key)).toEqual([patchId(12, 13), patchId(12, 15)]);
    expect(systems.every(system => system.shores.length > 0 && system.shores.every(cell => region.cells.includes(cell) && world.terrainAt(cell) !== "water"))).toBe(true);
    // The middle of the external connection cannot be reached without leaving
    // the requested region, even though the water pixels join outside it.
    expect(reads.mock.calls.some(args => args[1] === patchId(11, 14))).toBe(false);
    expect(reads.mock.calls.length).toBeLessThan(80);
    const count = reads.mock.calls.length;
    expect(tasks.surveyWaters(world, region.id)).toBe(systems);
    expect(reads.mock.calls.length).toBe(count);
    expect(world.fineChunkBuilds).toBe(0);
  });

  it.each([false, true])("matches exhaustive route scoring and tie order with obstacles=%s", blocked => {
    const { state, world, region, cal } = fixture(blocked);
    const here = cellOf(state, world);
    const speed = baseWalkSpeed(state, cal, localWeather(state, world));
    const exhaustive = region.cells.filter(cell => cell !== here && world.terrainAt(cell) !== "water").map(cell => {
      const path = routing.exploreRoute(state, world, here, cell, region.id);
      if (!path) return null;
      const minutes = routing.survivorRouteMinutes(state, world, path, speed);
      return { cell, path, score: sight.sightReachCells(state, world, cal, cell) ** 2 / minutes };
    }).filter(row => row !== null).sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.cell - b.cell);
    const routes = vi.spyOn(routing, "exploreRoute");
    const selected = tasks.pickVantage(state, world, cal, region.id, [here]);
    expect(selected?.cell).toBe(exhaustive[0].cell);
    expect(selected?.path).toEqual(exhaustive[0].path);
    expect(routes.mock.calls.length).toBeLessThan(region.cells.length / 2);
  });

  it("answers frontier legality after the first exact reachable route", () => {
    const { state, world, region, cal } = fixture(false);
    const routes = vi.spyOn(routing, "exploreRoute");
    const filters = vi.spyOn(routing, "exploreRouteCandidates");
    expect(tasks.check(state, world, cal, "explore", `region:${region.id}`).ok).toBe(true);
    expect(routes.mock.calls.length).toBe(1);
    expect(filters).not.toHaveBeenCalled();
  });

  it("rejects a disconnected frontier once without routing each candidate", () => {
    const { state, world, region, cal } = fixture(false);
    region.cells = region.cells.filter(cell => cell % world.w === 16);
    region.campCell = patchId(16, 14);
    const ownership = world.fineChunks.get(0)!.region;
    ownership.fill(-1);
    for (let y = 12; y < 17; y++) ownership[y * FINE_CHUNK + 16] = region.id;
    const routes = vi.spyOn(routing, "exploreRoute");
    expect(tasks.check(state, world, cal, "explore", `region:${region.id}`).why).toBe("no reachable frontier");
    expect(routes.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
