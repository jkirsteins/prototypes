/**
 * The survivor routes on the ground they have mapped, never the true
 * grid: a fresh game cannot plan a walk to unmapped ground, mapping a
 * region opens it, and the world's own decisions (camp siting) still
 * read the true grid regardless of what the survivor has seen.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { cellPossibilities } from "../src/sim/camp";
import { isKnown, mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { discovery, SEEN } from "../src/sim/regionstate";
import { frontierRoute, survivorRoute } from "../src/sim/routing";
import { seepGround } from "../src/sim/seep";
import { check } from "../src/sim/tasks";
import { cellAt, neighbours, regionAt } from "../src/world/gen";
import { passable } from "../src/world/route";
import { cellOf } from "../src/sim/position";

const cal = calendar(0);

describe("the survivor routes on knowledge", () => {
  it("offers no walk to a place there is no known way to", () => {
    const { state, world } = newGame(3);
    const home = state.player.region;
    // A region on the far side of the world: seen at a distance (so the
    // travel option's own "know nothing of that country" gate does not
    // fire first) but nothing between here and there has ever been walked.
    const far = home === 0 ? 1 : 0;
    state.discovered[far] = SEEN;
    expect(discovery(state, far)).not.toBe(0);
    const o = check(state, world, cal, "travel", `region:${far}`);
    expect(o.ok).toBe(false);
    expect(o.why).toBe("{you} {know} no way there");
  });

  it("opens once the ground between is mapped", () => {
    const { state, world } = newGame(3);
    const home = state.player.region;
    const nb = regionAt(world, home).neighbours[0].id;
    mapRegion(state, world, home);
    mapRegion(state, world, nb);
    state.discovered[nb] = SEEN;
    const o = check(state, world, cal, "travel", `region:${nb}`);
    expect(o.ok).toBe(true);
  });

  it("keeps camp siting on the world's own ground", () => {
    const { state, world } = newGame(3);
    const home = state.player.region;
    // The landing maps the home region whole; a neighbour, never visited, is
    // ground the survivor has never seen, which is what this case is about.
    const nb = regionAt(world, home).neighbours[0].id;
    const r = regionAt(world, nb);
    expect(r.spots.some((s) => !isKnown(state, s.cell))).toBe(true);
    // Cell capabilities read the true ground, not the survivor's map.
    expect(cellPossibilities(world, r.campCell)).toEqual(seepGround(world, r.campCell) ? ["seep possible"] : []);
  });

  it("survivorRoute refuses ground the state has not mapped, even when the true grid would allow it", () => {
    const { state, world } = newGame(3);
    const home = state.player.region;
    const camp = regionAt(world, home).campCell;
    const nb = regionAt(world, home).neighbours[0];
    // The neighbour's camp cell exists and is truly reachable, but nothing
    // has been mapped, so the survivor cannot plan a route to it.
    expect(survivorRoute(state, world, camp, regionAt(world, nb.id).campCell)).toBeNull();
    mapRegion(state, world, home);
    mapRegion(state, world, nb.id);
    expect(survivorRoute(state, world, camp, regionAt(world, nb.id).campCell)).not.toBeNull();
  });

  it("frontierRoute permits one unknown final step and no route through unknown ground", () => {
    const { state, world } = newGame(3);
    const from = cellOf(state, world);
    let target: number | undefined;
    for (const known of Object.keys(state.mapped).map(Number)) {
      target = neighbours(world, known).find((cell) => !isKnown(state, cell) && passable(cellAt(world, cell).terrain) && survivorRoute(state, world, from, known) !== null);
      if (target !== undefined) break;
    }
    expect(target).toBeDefined();
    const route = frontierRoute(state, world, from, target!);
    expect(route?.at(-1)).toBe(target);
    expect(route?.slice(0, -1).every((cell) => isKnown(state, cell))).toBe(true);
    const deeper = neighbours(world, target!).find((cell) => !isKnown(state, cell) && neighbours(world, cell).every((n) => !isKnown(state, n)) && passable(cellAt(world, cell).terrain));
    if (deeper !== undefined) expect(frontierRoute(state, world, from, deeper)).toBeNull();
  });
});
