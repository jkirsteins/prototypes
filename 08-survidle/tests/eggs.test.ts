import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { qty } from "../src/sim/inventory";
import { EGG_CLUTCH_KG, EGG_FROM_DOY, EGG_KG_PER_HOUR, EGG_TO_DOY, FOODS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { NESTING, nestsFor } from "../src/sim/stocks";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";

describe("eggs", () => {
  it("nests are set on 1 May from the nesting birds and cleared on 1 July; the task takes half a kilo an hour until they are empty", () => {
    expect(FOODS.eggs).toEqual({ kcalPerKg: 1500, portionKg: 0.2, sickChance: 0, leanShare: 0.4 });
    expect([EGG_CLUTCH_KG, EGG_KG_PER_HOUR, EGG_FROM_DOY, EGG_TO_DOY]).toEqual([0.4, 0.5, 120, 181]);
    const { state, world } = newGame(17, EGG_FROM_DOY);
    const st = regionState(state, world, state.player.region);
    dailyCamp(state, world, calendar(0, EGG_FROM_DOY), new Rng(1), null);
    expect(st.nests).toBeCloseTo(nestsFor(world, st, state.player.region), 6);
    expect(st.nests).toBeGreaterThan(0);
    placeAtSpot(state, world, state.player.region, "shore");
    const cal = calendar(0, EGG_FROM_DOY);
    const o = check(state, world, cal, "eggs");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(60);
    const before = st.nests;
    startTask(state, world, cal, "eggs");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "eggs")).toBeCloseTo(Math.min(EGG_KG_PER_HOUR, before * EGG_CLUTCH_KG), 6);
    expect(st.nests).toBeCloseTo(before - qty(state.player.pack, "eggs") / EGG_CLUTCH_KG, 6);
    st.nests = 0;
    expect(check(state, world, cal, "eggs").why).toBe("the nests are empty");
    dailyCamp(state, world, calendar(0, EGG_TO_DOY + 1), new Rng(2), null);
    expect(check(state, world, calendar(0, EGG_TO_DOY + 1), "eggs").why).toBe("no eggs until May");
  });

  it("a region whose state is first created mid-window is seeded as though the roll had already run, with no dailyCamp call", () => {
    // Mid-June: past 1 May, before 1 July.
    const { state, world } = newGame(17, 150);
    const st = regionState(state, world, state.player.region);
    expect(st.nests).toBeCloseTo(nestsFor(world, st, state.player.region), 6);
    expect(st.nests).toBeGreaterThan(0);

    // A neighbour never touched before now: its state comes into being on this
    // very call, mid-season, the same as a survivor walking into it in June.
    const r = regionAt(world, state.player.region);
    const neighbour = r.neighbours.find((nb) => NESTING.some((s) => regionAt(world, nb.id).capacity[s]))!;
    expect(neighbour).toBeDefined();
    const nst = regionState(state, world, neighbour.id);
    expect(nst.nests).toBeCloseTo(nestsFor(world, nst, neighbour.id), 6);
    expect(nst.nests).toBeGreaterThan(0);
  });
});
