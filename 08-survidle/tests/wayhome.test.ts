import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { bodyStep } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { NOT_ORDERS } from "../src/sim/ladder";
import { beginAgain, land } from "../src/sim/landing";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { campCellOf, cellOf, placeAtSpot } from "../src/sim/position";
import { SEEN } from "../src/sim/regionstate";
import { survivorRoute } from "../src/sim/routing";
import { MASTERY_KEYS, masteryKey, skillOf } from "../src/sim/skills";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { doHtml } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

type G = ReturnType<typeof newGame>;

/** Kills the reference player after a minute and lands the next survivor, the same beginAgain/land pair the epitaph flow uses. */
function landHeir(seed: number): G {
  const { state, world } = newGame(seed);
  siteCamp(state, world);
  advance(state, world, 60);
  die(state, "froze", regionAt(world, state.player.region).name);
  beginAgain(state, world);
  land(state, world);
  // The heir lands in a region with no camp of its own; these tests are about the
  // walk home to one, so the heir makes camp on the region's own ground first.
  siteCamp(state, world);
  // The landing maps the whole region so a fresh camp can be chosen with the
  // ground in view; these tests are about the search a survivor standing on
  // ground it has not otherwise walked would still have to make, so that
  // mapping is undone here rather than in the sim itself.
  for (const c of regionAt(world, state.player.region).cells) delete state.mapped[c];
  return { state, world };
}

describe("searching for the way home", () => {
  it("says why there is no way home, and offers the search instead", () => {
    // Seed 2 lands the heir on ground with no known corridor to the region's
    // own camp: too little is mapped yet for survivorRoute to find one.
    const { state, world } = landHeir(2);
    const cal = calendar(state.minute);
    const walk = check(state, world, cal, "walk", "spot:camp");
    expect(walk.ok).toBe(false);
    expect(walk.why).toBe("{you} {know} no way there");
    const home = check(state, world, cal, "searchHome");
    expect(home.ok).toBe(true);
    // No duration is knowable, so none is promised.
    expect(home.duration).toBe(0);
    expect(home.detail).not.toBe("");
  });

  it("offers nothing once the way is already known", () => {
    const { state, world } = newGame(4);
    siteCamp(state, world);
    // A step off camp, onto ground the spawn's own sight already opened: the ordinary case.
    placeAtSpot(state, world, state.player.region, "forest");
    const cal = calendar(state.minute);
    expect(check(state, world, cal, "walk", "spot:camp").ok).toBe(true);
    expect(check(state, world, cal, "searchHome").ok).toBe(false);
  });

  it("searches toward camp and stops the moment a route opens", () => {
    // Seed 4 resolves in a handful of legs, all inside the landing region itself.
    const { state, world } = landHeir(4);
    const camp = campCellOf(state, world)!;
    expect(survivorRoute(state, world, cellOf(state, world), camp)).toBeNull();
    expect(startTask(state, world, calendar(state.minute), "searchHome")).toBe(true);
    const rng = new Rng(1);
    let minutes = 0;
    let sawNoRouteWhileWorking = false;
    for (; minutes < 20000 && state.task; minutes++) {
      if (state.task.id === "searchHome" && survivorRoute(state, world, cellOf(state, world), camp) === null) sawNoRouteWhileWorking = true;
      stepTask(state, world, calendar(state.minute), rng, 1);
    }
    expect(state.task).toBeNull();
    // It was genuinely searching, not already standing on the answer.
    expect(sawNoRouteWhileWorking).toBe(true);
    expect(survivorRoute(state, world, cellOf(state, world), camp)).not.toBeNull();
  });

  it("moves on to a neighbouring region once the one it is sweeping is used up", () => {
    const { state, world } = newGame(4);
    siteCamp(state, world);
    const A = state.player.region;
    // Everything of the landing region is already known, so nothing here can open a route the survivor does not already have.
    mapRegion(state, world, A);
    const B = regionAt(world, A).neighbours[0]!.id;
    // B is named (seen from a distance), but not a cell of it has been walked.
    state.discovered[B] = SEEN;
    const home = regionAt(world, B).campCell!;
    expect(survivorRoute(state, world, cellOf(state, world), home)).toBeNull();
    const here = cellOf(state, world);
    // A leg already standing at its own end: the next tick reads straight into the "this region gave nothing more" branch.
    state.task = { id: "searchHome", arg: `region:${A}`, progress: 0, duration: 1e9, repeat: false, visited: [here], home };
    state.route = { target: here, path: [], walked: [here], label: "the way home", ice: "none", lastLand: here };
    const rng = new Rng(1);
    stepTask(state, world, calendar(state.minute), rng, 1);
    expect(state.task?.arg).toBe(`region:${B}`);
    let minutes = 0;
    for (; minutes < 20000 && state.task; minutes++) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(state.task).toBeNull();
    expect(survivorRoute(state, world, cellOf(state, world), home)).not.toBeNull();
  });

  it("the body does not walk home over ground it does not know", () => {
    const { state, world } = landHeir(2);
    const cal = calendar(state.minute);
    expect(check(state, world, cal, "walk", "spot:camp").ok).toBe(false);
    const here = cellOf(state, world);
    state.intent = null;
    const rng = new Rng(1);
    const step = bodyStep(state, world, cal, rng, "sleep");
    // The body settles where it stands rather than setting off over unknown ground.
    expect(step?.id).not.toBe("walk");
    expect(step?.step).toContain("no way to camp");
    expect(cellOf(state, world)).toBe(here);
    expect(state.log.some((e) => e.text.includes("No way to camp"))).toBe(true);
  });

  it("is the same kind of move as explore: never an order, its own mastery key", () => {
    expect(NOT_ORDERS).toContain("searchHome");
    expect(skillOf("searchHome")).toBe("wayfinding");
    expect(masteryKey({} as never, {} as never, "searchHome")).toBe("searchHome");
    expect(MASTERY_KEYS.wayfinding).toContain("searchHome");

    const { state, world } = newGame(4);
    siteCamp(state, world);
    const ui = newUiState();
    expect(doHtml(state, world, calendar(state.minute), ui)).not.toContain('data-id="searchHome"');
  });

});
