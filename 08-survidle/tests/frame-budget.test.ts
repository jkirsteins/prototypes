/**
 * What one simulated minute is allowed to cost.
 *
 * The browser advances the world inside the frame loop, and while a
 * hand-chosen action runs the hurry carries up to PEAK minutes a second
 * instead of one. A minute is indivisible, so whatever a minute costs lands
 * inside a single frame: at 60 fps the frame has 16.7 ms, and a minute that
 * costs more than that drops one. Measured in a real browser, a running
 * action took the 95th-percentile frame from 17 ms to 50 ms.
 *
 * Time is not the assertion. This suite runs beside other suites on shared
 * machines, where a wall clock says more about the neighbours than about the
 * code - the full-solve budget in the slow suite reads 613 s on a loaded box
 * against a 20 s budget and means nothing by it. What is asserted is the
 * work: the sight rays cast, the routes searched and the ground built, per
 * simulated minute. Those are the same numbers on any machine, and they are
 * what the milliseconds are made of. The milliseconds are printed beside
 * them, for a person reading the run rather than for the gate.
 */
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { beginTask } from "../src/sim/tasks";
import { activateWildlife } from "../src/sim/wildlife-agents";
import { Rng } from "../src/rng";
import { cellOf } from "../src/sim/position";
import { cellAt, regionAt } from "../src/world/gen";
import { passable } from "../src/world/route";
import { clearObstacleReadCount, obstacleReadCount } from "../src/sim/sight";
import { worldCacheStats } from "../src/world/aggregate";
import { routeCacheStats } from "../src/world/route";

/**
 * The gates. They are set about half again above what was measured on this
 * branch, which is wide enough that nothing trips on noise and narrow enough
 * that a new ray cast per patch, or a route searched per minute, fails here
 * rather than in somebody's afternoon.
 */
const RAY_BUDGET_STILL = 50;
const RAY_BUDGET_WALKING = 750;
/**
 * A ceiling on the clock, wide enough to survive a loaded machine and narrow
 * enough to catch something that has become slow by an order rather than by
 * a little. The counts above are the real gate; this catches the change that
 * keeps the counts and does the work another way.
 */
const WALKED_MINUTE_MS_CEILING = 50;

interface Cost { rays: number; routes: number; chunks: number; ms: number }

/** The work one minute of the frame loop's own tick does, averaged over `minutes`. */
function costPerMinute(label: string, minutes: number, prepare?: (state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"]) => void): Cost {
  const { state, world } = newGame(42);
  activateWildlife(state, world, new Rng(1));
  prepare?.(state, world);
  // The first minutes build the ground the survivor stands on and light the
  // caches every later minute reads. What is measured is the steady state.
  advance(state, world, 10, { wildlife: "detailed", live: true });
  clearObstacleReadCount();
  const routesBefore = routeCacheStats(world).routeBuilds;
  const chunksBefore = worldCacheStats(world).fineChunkBuilds;
  const started = performance.now();
  for (let i = 0; i < minutes; i++) advance(state, world, 1, { wildlife: "detailed", live: true });
  const ms = (performance.now() - started) / minutes;
  const cost: Cost = {
    rays: obstacleReadCount() / minutes,
    routes: (routeCacheStats(world).routeBuilds - routesBefore) / minutes,
    chunks: (worldCacheStats(world).fineChunkBuilds - chunksBefore) / minutes,
    ms,
  };
  console.log(`${label}: ${cost.rays.toFixed(0)} rays, ${cost.routes.toFixed(2)} routes, ${cost.chunks.toFixed(2)} chunks, ${ms.toFixed(1)} ms a minute`);
  return cost;
}

describe("the frame's simulation budget", () => {
  it("stands still for a minute on almost nothing", () => {
    const cost = costPerMinute("standing", 60);
    // Measured: no rays, no routes, no ground built. A survivor who has not
    // moved has already seen what they can see, and the viewshed is held.
    expect(cost.rays).toBeLessThan(RAY_BUDGET_STILL);
    expect(cost.routes).toBeLessThan(1);
    expect(cost.chunks).toBeLessThan(0.5);
  });

  it("works for a minute on almost nothing", () => {
    const cost = costPerMinute("working", 60, (state, world) => {
      beginTask(state, world, calendar(state.minute, state.startDoy), "deadwood");
    });
    expect(cost.rays).toBeLessThan(RAY_BUDGET_STILL);
    expect(cost.routes).toBeLessThan(1);
    expect(cost.chunks).toBeLessThan(0.5);
  });

  it("pays for a walked minute in sight, and stays inside what a frame can carry", () => {
    // The dear case, and the one the hurry multiplies: a walking survivor
    // looks from every patch they cross and a patch is about a minute.
    // Measured at 503 rays and 9.8 ms against a standing minute's 2.5 ms.
    const cost = costPerMinute("walking", 40, (state, world) => {
      const cal = calendar(state.minute, state.startDoy);
      const here = cellOf(state, world);
      const target = regionAt(world, state.player.region).cells
        .filter((c) => passable(cellAt(world, c).terrain))
        .sort((a, b) => Math.abs(b - here) - Math.abs(a - here))[0];
      beginTask(state, world, cal, "walk", `cell:${target}`);
    });
    expect(cost.rays).toBeLessThan(RAY_BUDGET_WALKING);
    expect(cost.routes).toBeLessThan(2);
    expect(cost.chunks).toBeLessThan(0.5);
    expect(cost.ms).toBeLessThan(WALKED_MINUTE_MS_CEILING);
  });
});
