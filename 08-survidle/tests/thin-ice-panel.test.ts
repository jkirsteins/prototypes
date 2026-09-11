import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { mapRegion, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { campCellOf, cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { survivorRoute } from "../src/sim/routing";
import { check } from "../src/sim/tasks";
import { ensureGround } from "../src/sim/weather";
import { placesHtml, thinIceButton } from "../src/ui/panels";
import { cellAt, regionAt } from "../src/world/gen";
import { findRoute } from "../src/world/route";
import { iceShortcut, regionsOutward } from "./world-facts";

// Ground across the water from the landing, where the ice is the shorter way
// there than the walk round, which is what puts a thin-ice offer on the row.
const CROSSING_WORLD = newGame(42).world;
const { region: REMOTE_REGION, target: REMOTE_CELL } = iceShortcut(CROSSING_WORLD, CROSSING_WORLD.start, CROSSING_WORLD.startCell);

function crossing() {
  const g = newGame(42);
  mapRegion(g.state, g.world, g.state.player.region);
  mapRegion(g.state, g.world, REMOTE_REGION);
  ensureGround(g.state, g.world, g.state.player.region).iceCm = 20;
  ensureGround(g.state, g.world, REMOTE_REGION).iceCm = 8;
  return g;
}

describe("thin-ice route offers", () => {
  it("resolves a named place before measuring its shortcut and local risk", () => {
    const { state, world } = crossing();
    const forest = regionAt(world, state.player.region).spots.find((spot) => spot.id === "forest")!;
    forest.cell = REMOTE_CELL;

    const html = placesHtml(state, world, calendar(0));
    expect(html).toContain('data-arg="spot:forest:thin"');
    expect(html).toContain("7% chance of falling through, per cell crossed");
  });

  it("measures a moved camp route at campCellOf rather than the generated camp landmark", () => {
    const { state, world } = crossing();
    regionState(state, world, REMOTE_REGION).campCell = REMOTE_CELL;
    expect(campCellOf(state, world, REMOTE_REGION)).toBe(REMOTE_CELL);
    expect(REMOTE_CELL).not.toBe(regionAt(world, REMOTE_REGION).campCell);

    const route = survivorRoute(state, world, cellOf(state, world), REMOTE_CELL, "thin")!;
    state.mapped = {};
    for (const cell of route) markKnown(state, cell);
    state.discovered[REMOTE_REGION] = 2;
    const arg = `region:${REMOTE_REGION}`;
    const plain = check(state, world, calendar(0), "travel", arg);

    expect(thinIceButton(state, world, calendar(0), "travel", arg, plain)).toContain(`${arg}:thin`);
  });

  it("ignores thin regional ice under land when reporting actual water-crossing risk", () => {
    const { state, world } = newGame(42);
    const from = cellOf(state, world);
    // A walk that crosses water in some regions and only land in others: which
    // regions those are is the world's business, and the case needs both kinds on
    // the one route.
    let target = -1;
    let route: number[] = [];
    let waterRegions = new Set<number>();
    let landOnlyRegions = new Set<number>();
    for (const region of regionsOutward(world, state.player.region, 30)) {
      const candidate = regionAt(world, region).campCell;
      const way = findRoute(world, from, candidate, "thin");
      if (!way) continue;
      const wet = new Set(way.filter((cell) => cellAt(world, cell).terrain === "water").map((cell) => cellAt(world, cell).region));
      const dry = new Set(way.filter((cell) => cellAt(world, cell).terrain !== "water").map((cell) => cellAt(world, cell).region));
      for (const r of wet) dry.delete(r);
      if (!wet.size || !dry.size) continue;
      target = candidate;
      route = way;
      waterRegions = wet;
      landOnlyRegions = dry;
      break;
    }
    expect(target).toBeGreaterThan(0);
    for (const region of waterRegions) ensureGround(state, world, region).iceCm = 8;
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
