import { describe, expect, it } from "vitest";
import { isKnown, knowledgeGen, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { cellAt, cellIdx, regionAt } from "../src/world/gen";
import { findRoute, knownRoute, passable } from "../src/world/route";
import * as routes from "../src/world/route";
import { flatWorld, paintWorld } from "./world-fixture";
import { openBlock } from "./world-facts";

describe("knownRoute", () => {
  it("will not leave known ground, and takes the long way round rather than cross the dark", () => {
    const { state, world } = newGame(1);
    const known = (c: number) => isKnown(state, c);
    // Which way from the landing the walkable ground runs is the world's
    // business, so the corridor is laid out on a block of it rather than on a
    // compass direction. The block is ground nobody has mapped, so the only
    // known way over it is the one this test marks.
    const idx = openBlock(
      world, cellIdx(world, Math.floor(state.player.x), Math.floor(state.player.y)), 21, 6,
      (c) => passable(cellAt(world, c).terrain) && !known(c),
    );

    const from = idx(0, 0);
    const to = idx(20, 0);
    // The direct row stays dark. A dip five cells off it is the only mapped way
    // over: off, along, and back.
    for (let dy = 1; dy <= 5; dy++) markKnown(state, idx(0, dy));
    for (let dx = 0; dx <= 20; dx++) markKnown(state, idx(dx, 5));
    for (let dy = 5; dy >= 0; dy--) markKnown(state, idx(20, dy));

    const direct = findRoute(world, from, to)!;
    const detour = knownRoute(world, from, to, known, knowledgeGen())!;
    expect(detour).not.toBeNull();
    expect(direct.length).toBeLessThan(detour.length);
    for (const c of detour) expect(known(c)).toBe(true);

    // Nothing was ever mapped up here: no known corridor reaches it.
    const strandedTarget = idx(20, -20);
    expect(knownRoute(world, from, strandedTarget, known, knowledgeGen())).toBeNull();
  });

  it("serves a fresh route once new ground is known", () => {
    const { state, world } = newGame(1);
    const known = (c: number) => isKnown(state, c);
    const idx = openBlock(world, cellIdx(world, Math.floor(state.player.x), Math.floor(state.player.y)), 4, 1, (c) => passable(cellAt(world, c).terrain) && known(c));

    const from = idx(0, 0);
    const to = idx(3, 0);
    // The landing already maps the whole home region; drop this short stretch
    // back to unknown so the cache has a real "not yet known" state to prove
    // itself against, the same shape ground the survivor had never mapped once had.
    for (let dx = 0; dx <= 3; dx++) delete state.mapped[idx(dx, 0)];

    expect(knownRoute(world, from, to, known, knowledgeGen())).toBeNull();
    for (let dx = 0; dx <= 3; dx++) markKnown(state, idx(dx, 0));
    // The stale null must not be served now that the corridor is known:
    // the cache key has to move with a fresh knowledgeGen() reading.
    const route = knownRoute(world, from, to, known, knowledgeGen());
    expect(route).not.toBeNull();
    expect(route!.length).toBe(3);
  });
});

describe("remaining walking time", () => {
  it("counts the actual mixed-terrain minute steps without moving the route", () => {
    expect(routes.remainingWalkMinutes).toBeTypeOf("function");
    // A hand-made world, so the two speeds the count is made of are named here
    // rather than found wherever the generator puts a terrain edge: 300 m of
    // meadow at 3 km/h times 1.1, then 300 m of bog at 3 km/h times 0.7.
    const world = flatWorld({ w: 8, h: 3, terrain: "meadow" });
    paintWorld(world, [9], "bog");
    const position = { x: 3.5, y: 1.5 };
    const before = { ...position };
    const path = [10, 9];
    expect(routes.remainingWalkMinutes(world, position, path, 3, "none")).toBe(12);
    expect(position).toEqual(before);
    expect(path).toEqual([10, 9]);
  });

  it.each(["safe", "thin"] as const)("uses the %s ice route's walking speed", ice => {
    expect(routes.remainingWalkMinutes).toBeTypeOf("function");
    const { state, world } = newGame(17);
    const from = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "water"
      && cellAt(world, c + 1).terrain === "water")!;
    const position = { x: from % world.w + 0.5, y: Math.floor(from / world.w) + 0.5 };
    // 300 m at 3 km/h * the ice's 0.8 pace takes 7.5 minutes,
    // completing on the eighth real minute step.
    expect(routes.remainingWalkMinutes(world, position, [from + 1], 3, ice)).toBe(8);
    expect(routes.remainingWalkMinutes(world, position, [from + 1], 3, "none")).toBe(Number.POSITIVE_INFINITY);
  });
});
