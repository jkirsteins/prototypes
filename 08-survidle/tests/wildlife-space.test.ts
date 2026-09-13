import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { encounterGeometry, metricAreaForCell, metricPointForPlayer, resolveSpatialEstimate } from "../src/sim/wildlife-space";
import { activateWildlife } from "../src/sim/wildlife-agents";
import { Rng } from "../src/rng";

afterEach(() => vi.restoreAllMocks());

describe("wildlife metric space", () => {
  it("initializes an active animal at its stable metric point without consuming another random draw", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    const active = subject.active!;
    expect(active.position).toEqual(resolveSpatialEstimate(state.seed, subject.id, metricAreaForCell(world, active.cell)!));
    expect(active.travel).toBeNull();
  });

  it("keeps a coarse subject point stable and separated inside the same area", () => {
    const { state, world } = newGame(1);
    const area = metricAreaForCell(world, cellOf(state, world));
    if (!area) throw new Error("test setup needs a finite area");
    const a = resolveSpatialEstimate(state.seed, 17, area);
    const b = resolveSpatialEstimate(state.seed, 17, area);

    expect(a).toEqual(b);
    if (!a) throw new Error("test setup needs a resolved subject point");
    const player = metricPointForPlayer(state, world);
    if (!player) throw new Error("test setup needs a finite player point");
    expect(encounterGeometry(player, a)?.distanceM).toBeGreaterThan(0);
  });

  it("makes exact and area estimates agree when they resolve to the same point", () => {
    const point = { xM: 125, yM: 240 };
    const resolved = resolveSpatialEstimate(1, 1, { kind: "exact", point });
    if (!resolved) throw new Error("test setup needs an exact point");

    expect(encounterGeometry(point, resolved)).toMatchObject({ distanceM: 0, uncertaintyM: 0 });
  });

  it("rejects non-finite geometry at the spatial boundary", () => {
    const { state, world } = newGame(1);
    const assertion = vi.spyOn(console, "assert").mockImplementation(() => undefined);
    state.player.xM = Number.NaN;

    expect(metricPointForPlayer(state, world)).toBeNull();
    expect(metricAreaForCell(world, Number.NaN)).toBeNull();
    expect(resolveSpatialEstimate(1, 1, { kind: "exact", point: { xM: Number.NaN, yM: 0 } })).toBeNull();
    expect(encounterGeometry({ xM: 0, yM: 0 }, { xM: Number.POSITIVE_INFINITY, yM: 0 })).toBeNull();
    expect(assertion).toHaveBeenCalledTimes(4);
  });
});
