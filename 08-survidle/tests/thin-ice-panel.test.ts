import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { campCellOf, cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { survivorRoute } from "../src/sim/routing";
import { check } from "../src/sim/tasks";
import { ensureGround } from "../src/sim/weather";
import { placesHtml, thinIceButton } from "../src/ui/panels";
import { cellAt, regionAt } from "../src/world/gen";
import { findRoute } from "../src/world/route";
import { FINE_CHUNK } from "../src/world/cells";
import { TERRAIN_INDEX } from "../src/world/terrain";

function crossing() {
  const g = newGame(42);
  const remote = regionAt(g.world, g.state.player.region).neighbours[0].id;
  const from = cellOf(g.state, g.world);
  const water = from + 1;
  const target = from + 2;
  // A known three-patch corridor isolates thin ice from seed geography.
  for (const cell of [water, target]) {
    const { x, y } = cellAt(g.world, cell);
    const chunk = g.world.fineChunks.get(Math.floor(y / FINE_CHUNK) * Math.ceil(g.world.w / FINE_CHUNK) + Math.floor(x / FINE_CHUNK))!;
    const i = (y % FINE_CHUNK) * FINE_CHUNK + x % FINE_CHUNK;
    chunk.terrain[i] = TERRAIN_INDEX[cell === water ? "water" : "pine"];
    chunk.region[i] = remote;
  }
  g.state.mapped = {};
  for (const cell of [from, water, target]) markKnown(g.state, cell);
  ensureGround(g.state, g.world, g.state.player.region).iceCm = 20;
  ensureGround(g.state, g.world, remote).iceCm = 8;
  return { ...g, from, water, target, remote };
}

describe("thin-ice route offers", () => {
  it("resolves a named place before measuring its shortcut and local risk", () => {
    const { state, world, target } = crossing();
    const forest = regionAt(world, state.player.region).spots.find((spot) => spot.id === "forest")!;
    forest.cell = target;

    const html = placesHtml(state, world, calendar(0));
    expect(html).toContain('data-arg="spot:forest:thin"');
    expect(html).toContain("7% chance of falling through, per cell crossed");
  });

  it("measures a moved camp route at campCellOf rather than the generated camp landmark", () => {
    const { state, world, from, target, remote } = crossing();
    regionState(state, world, remote).campCell = target;
    expect(campCellOf(state, world, remote)).toBe(target);
    expect(target).not.toBe(regionAt(world, remote).campCell);

    const route = survivorRoute(state, world, from, target, "thin")!;
    expect(route).toEqual([from + 1, target]);
    state.mapped = {};
    markKnown(state, from);
    for (const cell of route) markKnown(state, cell);
    state.discovered[remote] = 2;
    const arg = `region:${remote}`;
    const plain = check(state, world, calendar(0), "travel", arg);

    expect(thinIceButton(state, world, calendar(0), "travel", arg, plain)).toContain(`${arg}:thin`);
  });

  it("ignores thin regional ice under land when reporting actual water-crossing risk", () => {
    const { state, world, from, target, remote } = crossing();
    const ground = cellAt(world, target);
    const chunk = world.fineChunks.get(Math.floor(ground.y / FINE_CHUNK) * Math.ceil(world.w / FINE_CHUNK) + Math.floor(ground.x / FINE_CHUNK))!;
    chunk.region[(ground.y % FINE_CHUNK) * FINE_CHUNK + ground.x % FINE_CHUNK] = state.player.region;
    const route = findRoute(world, from, target, "thin")!;
    expect(route).toEqual([from + 1, target]);
    const waterRegions = new Set(route.filter((cell) => cellAt(world, cell).terrain === "water").map((cell) => cellAt(world, cell).region));
    const landOnlyRegions = new Set(route.filter((cell) => cellAt(world, cell).terrain !== "water").map((cell) => cellAt(world, cell).region));
    for (const region of waterRegions) {
      landOnlyRegions.delete(region);
      ensureGround(state, world, region).iceCm = 8;
    }
    expect([...waterRegions]).toEqual([remote]);
    expect([...landOnlyRegions]).toEqual([state.player.region]);
    for (const region of landOnlyRegions) ensureGround(state, world, region).iceCm = 6;
    for (const cell of route) markKnown(state, cell);

    const arg = `cell:${target}`;
    const plain = check(state, world, calendar(0), "walk", arg);
    const html = thinIceButton(state, world, calendar(0), "walk", arg, plain);
    expect(html).toContain("8 cm, thin");
    expect(html).toContain("7% chance of falling through, per cell crossed");
    expect(html).not.toContain("6 cm, thin");
    expect(html).not.toContain("9% chance");
  });

  it.each([
    ["walk", "cell:nope"],
    ["walk", "cell:NaN"],
    ["walk", "spot:nope"],
    ["travel", "region:nope"],
  ] as const)("fails safely for invalid %s destination %s", (id, arg) => {
    const { state, world } = crossing();
    const plain = check(state, world, calendar(0), id, arg);
    expect(() => thinIceButton(state, world, calendar(0), id, arg, plain)).not.toThrow();
    expect(thinIceButton(state, world, calendar(0), id, arg, plain)).toBe("");
  });
});
