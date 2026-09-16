/**
 * The far country: what a vantage opens past the patches the fine viewshed
 * enumerates, how coarsely it may be claimed, and what it costs. The fixture
 * is a solved world 120 km across with one parent raised, and the chunk under
 * the vantage is injected rather than generated, so the only chunk this file
 * ever wants is the one the survivor is standing in.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import { coarseAt, knowledgeCounts } from "../src/sim/fineknowledge";
import { coarseKnown, markCoarseKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";
import {
  aggregateTerrain, clearCoarseReadCount, COARSE_WORK_BUDGET, coarseReadCount, markCoarseSeen,
  SIGHT_HORIZON_M, sightReachCells, vantageRevealCells,
} from "../src/sim/sight";
import type { GameState } from "../src/sim/types";
import { FINE_CHUNK, terrainPeek } from "../src/world/cells";
import type { World } from "../src/world/gen";
import { refineChunk } from "../src/world/refine";
import { FINE_PER_PARENT, PATCH_M, WORLD_FINE_W } from "../src/world/spatial";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { board, boardText, glyphOfCell, type MapModel } from "./board";
import { newUiState } from "../src/ui/render";
import { testAtmosphere } from "./weather-helpers";
import { flatWorld } from "./world-fixture";

afterEach(() => vi.restoreAllMocks());

/** Solar noon on landing day: light never gates the range. */
const NOON = calendar(300);
/** Parents a side of the fixture's solve: 120 km, room for the whole horizon in one direction. */
const SOLVED = 400;
/** The parent the survivor stands on, a third of the way in. */
const VANTAGE_PARENT = 200;
const VANTAGE_PATCH_XY = VANTAGE_PARENT * FINE_PER_PARENT;
const CHUNKS_W = Math.ceil(WORLD_FINE_W / FINE_CHUNK);

interface Scene { state: GameState; world: World; vantage: number }

/**
 * A flat solved world with one parent raised under the survivor, and one
 * injected chunk of the terrain the case wants: the generator classifies its
 * own ground from slope and wetness, so a solved cell painted fell is not
 * fell once a patch of it is refined.
 */
function scene(prominenceM: number, terrain: "fell" | "meadow"): Scene {
  const state = newGame(1).state;
  const world = flatWorld({ w: SOLVED, h: SOLVED, terrain: "meadow", heightM: 0, seed: 1 });
  world.solved.height[VANTAGE_PARENT * SOLVED + VANTAGE_PARENT] = prominenceM;
  const cx = Math.floor(VANTAGE_PATCH_XY / FINE_CHUNK);
  const chunkTerrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK).fill(TERRAIN_INDEX[terrain]);
  world.fineChunks.set(cx * CHUNKS_W + cx, {
    cx, cy: cx, fine: refineChunk(1, world.solved, cx, cx),
    terrain: chunkTerrain, region: new Int32Array(FINE_CHUNK * FINE_CHUNK),
    samples: chunkTerrain.length, parentSummaries: new Map(),
  });
  const vantage = VANTAGE_PATCH_XY * world.w + VANTAGE_PATCH_XY;
  state.player.xM = (VANTAGE_PATCH_XY + 0.5) * PATCH_M;
  state.player.yM = (VANTAGE_PATCH_XY + 0.5) * PATCH_M;
  state.player.region = 0;
  state.weather.ground[0] = { updatedHour: 0, snowCm: 0, surfaceWaterMm: 0,
    soilMoisture: 0.3, frost: 0, iceCm: 0, dryHours: 0, temperatureSum: 0, temperatureHours: 0 };
  // A day clear enough that the air is not what stops the ray: the horizon
  // itself is what the case is about.
  testAtmosphere({ cloud: 0, precipMmPerHour: 0, extinctionPerKm: 0.01 });
  return { state, world, vantage };
}

/** The patch at the middle of the parent this many parents east of the vantage. */
function eastward(world: World, parents: number): number {
  return VANTAGE_PATCH_XY * world.w + (VANTAGE_PARENT + parents) * FINE_PER_PARENT;
}

describe("far country", () => {
  it("reads the country past the patches from a fell, without building a chunk", () => {
    const { state, world, vantage } = scene(1_000, "fell");
    // The vantage's own chunk is the fixture's; the far country must not ask
    // for another one, and this is the assertion that says so.
    sightReachCells(state, world, NOON, vantage);
    const builds = world.fineChunkBuilds;
    const known = knowledgeCounts(state.knowledge).known;
    clearCoarseReadCount();
    markCoarseSeen(state, world, NOON, vantage);

    expect(world.fineChunkBuilds).toBe(builds);
    const counts = knowledgeCounts(state.knowledge);
    expect(counts.coarseParent).toBeGreaterThan(0);
    expect(counts.coarseAggregate).toBeGreaterThan(0);
    // Reading the far country never claims a patch, so nothing a route may
    // cross has changed.
    expect(counts.known).toBe(known);
    // The fan is the whole cost, and it stays under the fine viewshed's own.
    expect(coarseReadCount()).toBeLessThan(COARSE_WORK_BUDGET);
  });

  it("claims parents near, aggregates far, and nothing past the horizon", () => {
    const { state, world, vantage } = scene(1_000, "fell");
    markCoarseSeen(state, world, NOON, vantage);
    const horizonParents = SIGHT_HORIZON_M / (FINE_PER_PARENT * PATCH_M);

    // Inside the fine viewshed the patches themselves are read: a coarse
    // claim there would say less than is already known.
    expect(coarseAt(state.knowledge, eastward(world, 8))).toBe("unknown");
    // Out to the fan's own radius a ray crosses every parent it passes.
    expect(coarseAt(state.knowledge, eastward(world, 40))).toBe("parent");
    // Past it the fan is wider than a parent and only the aggregate holds.
    expect(coarseAt(state.knowledge, eastward(world, 120))).toBe("aggregate");
    // And the air has taken the ground's contrast before the horizon is out.
    expect(coarseAt(state.knowledge, eastward(world, Math.ceil(horizonParents) + 4))).toBe("unknown");
  });

  it("opens no far country from a meadow", () => {
    const { state, world, vantage } = scene(0, "meadow");
    markCoarseSeen(state, world, NOON, vantage);
    const counts = knowledgeCounts(state.knowledge);
    expect(counts.coarseParent).toBe(0);
    expect(counts.coarseAggregate).toBe(0);
  });

  it("is worth walking to a fell for, at a coarse reading's own worth", () => {
    const fell = scene(1_000, "fell");
    const meadow = scene(0, "meadow");
    const fellReveal = vantageRevealCells(fell.state, fell.world, NOON, fell.vantage);
    const meadowReveal = vantageRevealCells(meadow.state, meadow.world, NOON, meadow.vantage);
    // Both fill the enumerated viewshed, so the patches alone cannot tell them
    // apart. What the fell is worth the walk for is the country beyond it,
    // counted at a thirty-sixth - and still several times the near ground.
    expect(fellReveal).toBeGreaterThan(meadowReveal);
    expect(fellReveal / meadowReveal).toBeGreaterThan(2);
  });

  it("draws far country as ground at the closest rung, and fog only where nothing is known", () => {
    const { state, world } = newGame(1);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    const classesOf = (b: MapModel, cell: number): string => {
      const g = glyphOfCell(b, cell);
      if (!g) throw new Error(`cell ${cell} is not on the board`);
      return g.classes.join(" ");
    };
    const before = board(world, state, ui, cal);
    const fogged = before.glyphs.filter((g) => g.classes[1] === "fog" && g.mapCell !== null).map((g) => g.mapCell!);
    const known = before.glyphs.filter((g) => g.classes[1]?.startsWith("t-") && g.mapCell !== null).map((g) => g.mapCell!);
    expect(fogged.length).toBeGreaterThan(0);
    expect(known.length).toBeGreaterThan(0);

    markCoarseKnown(state, fogged[0], "parent");
    const after = board(world, state, ui, cal);
    const far = classesOf(after, fogged[0]);
    // Ground, in its terrain's own colour, and told apart from both fog and
    // ground the survivor has actually read.
    expect(far).not.toContain("fog");
    expect(far).toContain("far");
    expect(far).toMatch(/t-[a-z]+/);
    expect(classesOf(after, known[0])).not.toContain("far");
    expect(boardText(after)).toContain("seen from afar");
  });

  it("carries the far country through a save, apart from the patches", () => {
    const { state, world } = newGame(1);
    const far = world.w * 400 + 400;
    markCoarseKnown(state, far, "parent");
    markCoarseKnown(state, far + world.w * 40, "aggregate");
    const before = knowledgeCounts(state.knowledge);
    expect(before.coarseParent).toBe(1);
    expect(before.coarseAggregate).toBe(1);

    const loaded = deserialize(serialize(state));
    if (!loaded || "refused" in loaded) throw new Error("the save was refused");
    expect(knowledgeCounts(loaded.state.knowledge)).toEqual(before);
    expect(coarseKnown(loaded.state, far)).toBe(true);
    expect(coarseAt(loaded.state.knowledge, far)).toBe("parent");
  });
});

describe("far country at its own grain", () => {
  it("draws a 900 m aggregate as one ground, and a parent as its own", () => {
    const { state, world } = newGame(1);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    const classesOf = (b: MapModel, cell: number): string => {
      const g = glyphOfCell(b, cell);
      if (!g) throw new Error(`cell ${cell} is not on the board`);
      return g.classes.join(" ");
    };
    const fogged = board(world, state, ui, cal).glyphs.filter((g) => g.classes[1] === "fog" && g.mapCell !== null).map((g) => g.mapCell!);
    // A parent whose own ground disagrees with its aggregate's, everywhere in
    // it: only there do the two grains draw a different glyph.
    const disagrees = (cell: number): boolean => {
      const x0 = (cell % world.w) - ((cell % world.w) % FINE_PER_PARENT);
      const y0 = Math.floor(cell / world.w) - (Math.floor(cell / world.w) % FINE_PER_PARENT);
      const far = aggregateTerrain(world, x0, y0);
      for (let y = y0; y < y0 + FINE_PER_PARENT; y++) {
        for (let x = x0; x < x0 + FINE_PER_PARENT; x++) if (terrainPeek(world, x, y) === far) return false;
      }
      return true;
    };
    const cell = fogged.find(disagrees);
    if (cell === undefined) throw new Error("no fogged parent disagrees with its aggregate");

    markCoarseKnown(state, cell, "aggregate");
    const coarse = classesOf(board(world, state, ui, cal), cell);
    markCoarseKnown(state, cell, "parent");
    const parent = classesOf(board(world, state, ui, cal), cell);

    expect(coarse).toContain("far");
    expect(parent).toContain("far");
    expect(coarse).toContain(`t-${aggregateTerrain(world, cell % world.w, Math.floor(cell / world.w))}`);
    expect(coarse).not.toBe(parent);
  });
});
