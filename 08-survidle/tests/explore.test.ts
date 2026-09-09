import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { NOT_ORDERS } from "../src/sim/ladder";
import { isKnown, knownShare } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { baseWalkSpeed } from "../src/sim/player";
import { cellOf } from "../src/sim/position";
import { survivorRoute } from "../src/sim/routing";
import { beginTask, check, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { doHtml } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";
import { routeMinutes } from "../src/world/route";
import { siteCamp } from "./siting-helpers";

type G = ReturnType<typeof newGame>;

/** A neighbouring region already glimpsed a little (a toehold to walk from) but nowhere near fully mapped. */
function partlyKnownNeighbour(g: G): number {
  const { state, world } = g;
  const home = regionAt(world, state.player.region);
  const nb = home.neighbours.find((n) => {
    const s = knownShare(state, world, n.id);
    return s > 0 && s < 1;
  });
  if (!nb) throw new Error("reference seed no longer leaves a neighbour partly seen at landing");
  return nb.id;
}

/**
 * Runs the current explore task minute by minute, summing routeMinutes for
 * each leg's route as it is first set (the same figure stepExplore itself
 * walks it at), so the total can be checked against real elapsed minutes.
 */
function driveExplore(g: G, maxMinutes = 40000): { minutes: number; expected: number; legs: number } {
  const { state, world } = g;
  const rng = new Rng(1);
  let expected = 0;
  let legs = 0;
  let seen: unknown = null;
  const noteLeg = () => {
    if (state.route && state.route !== seen) {
      seen = state.route;
      legs++;
      expected += routeMinutes(world, state.route.path, baseWalkSpeed(state, calendar(state.minute), state.weather), state.route.ice);
    }
  };
  noteLeg();
  let minutes = 0;
  for (; minutes < maxMinutes && state.task; minutes++) {
    stepTask(state, world, calendar(state.minute), rng, 1);
    noteLeg();
  }
  return { minutes, expected, legs };
}

describe("explore", () => {
  it("maps a region by walking it, and the minutes are the ground's", () => {
    const g = newGame(4);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    const before = knownShare(state, world, region);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);

    expect(startTask(state, world, calendar(state.minute), "explore", `region:${region}`)).toBe(true);
    const { minutes, expected, legs } = driveExplore(g);
    expect(state.task).toBeNull();
    expect(knownShare(state, world, region)).toBe(1);
    // Each tick can waste at most the tick's own minute at a leg's end (the
    // spare stride does not roll into the next leg), so real time is within
    // one minute of the sum per leg walked, never a made-up figure.
    expect(minutes).toBeGreaterThanOrEqual(expected);
    expect(minutes).toBeLessThan(expected + legs + 1);
    expect(state.player.region).toBe(region);
    expect(state.goals.done.explore).toBe(true);
    expect(startTask(state, world, calendar(state.minute), "makeCamp")).toBe(true);
    driveExplore(g, 30);
    expect(state.goals.done.secondCamp).toBe(true);
  });

  it("leaves a crossable corridor when it is stopped halfway", () => {
    const g = newGame(4);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = partlyKnownNeighbour(g);
    const r = regionAt(world, region);
    const home = cellOf(state, world);
    // The camp sits inland; nothing so far seen of this region reaches it.
    expect(survivorRoute(state, world, home, r.campCell)).toBeNull();

    startTask(state, world, calendar(state.minute), "explore", `region:${region}`);
    const rng = new Rng(1);
    // Stop the moment the camp itself is seen, well short of the whole region.
    for (let m = 0; m < 20000 && state.task && !isKnown(state, r.campCell); m++) {
      stepTask(state, world, calendar(state.minute), rng, 1);
    }
    expect(knownShare(state, world, region)).toBeLessThan(1);
    stopTask(state, world);
    const share = knownShare(state, world, region);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    // The swept ground now reaches far enough to route to the camp, unmapped as
    // the rest of the region still is.
    expect(survivorRoute(state, world, cellOf(state, world), r.campCell)).not.toBeNull();
  });

  it("is never an order", () => {
    expect(NOT_ORDERS).toContain("explore");
    const { state, world } = newGame(4);
    const ui = newUiState();
    const html = doHtml(state, world, calendar(state.minute), ui);
    expect(html).not.toContain('data-id="explore"');
  });

  it("refuses a region with no name", () => {
    const { state, world } = newGame(4);
    const home = regionAt(world, state.player.region);
    const cal = calendar(state.minute);
    // A region two hops away, never seen or heard of.
    const far = home.neighbours
      .flatMap((nb) => regionAt(world, nb.id).neighbours)
      .find((nb2) => !home.neighbours.some((n) => n.id === nb2.id) && nb2.id !== state.player.region);
    if (!far) throw new Error("reference seed no longer has an unheard-of region two hops out");
    const o = check(state, world, cal, "explore", `region:${far.id}`);
    expect(o.ok).toBe(false);
    expect(o.why).toBe("{you} {know} nothing of that country");
    expect(beginTask(state, world, cal, "explore", `region:${far.id}`)).toBe(false);
  });
});
