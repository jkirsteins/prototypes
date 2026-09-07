import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty } from "../src/sim/inventory";
import { BARK_FRESH_KG_PER_HOUR, BARK_TREE_SHARE, FOODS, GUT } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { cellAt, regionAt } from "../src/world/gen";

// Seed 17's start region holds pine (checked directly: 85 of its cells are
// pine), so the early return below never fires for it.
function pineCell(world: import("../src/world/gen").World, region: number): number | undefined {
  return regionAt(world, region).cells.find((c) => cellAt(world, c).terrain === "pine");
}

describe("pine inner bark", () => {
  it("is stripped on pine with a knife, dries by the fire three to one, grinds to flour with a stone, and eats to a ceiling", () => {
    expect(FOODS.barkFlour).toEqual({ kcalPerKg: 800, portionKg: 0.2, sickChance: 0, leanShare: 0 });
    expect(GUT.barkFlour).toEqual({ fullCreditKg: 0.5, refuseKg: 1 });
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    const pine = pineCell(world, region);
    if (pine === undefined) return;
    placeAt(state, world, pine);
    state.player.tools.push({ id: "knife", durability: 100 });
    const cal = calendar(0, 130);
    const o = check(state, world, cal, "innerBark");
    expect(o.ok).toBe(true);
    const wood = st.wood;
    startTask(state, world, cal, "innerBark");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "freshBark")).toBeCloseTo(BARK_FRESH_KG_PER_HOUR, 6);
    expect(wood - st.wood).toBeCloseTo(BARK_FRESH_KG_PER_HOUR * BARK_TREE_SHARE, 6);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    addItem(pile(state, st.campCell), "freshBark", 3);
    advance(state, world, 90);
    expect(qty(pile(state, st.campCell), "driedBark")).toBeCloseTo(1, 1);
    addItem(state.player.pack, "stone", 1);
    const g = check(state, world, calendar(90, 130), "grindBark");
    expect(g.ok).toBe(true);
    startTask(state, world, calendar(90, 130), "grindBark");
    for (let m = 0; m < 20 && state.task; m++) stepTask(state, world, calendar(90 + m, 130), new Rng(m), 1);
    expect(qty(state.player.pack, "barkFlour") + qty(pile(state, st.campCell), "barkFlour")).toBeCloseTo(1, 1);
  });

  it("stripping outside spring is half as fast and a stand can be stripped out", () => {
    const { state, world } = newGame(17, 250);
    const region = state.player.region;
    const st = regionState(state, world, region);
    const pine = pineCell(world, region);
    if (pine === undefined) return;
    placeAt(state, world, pine);
    state.player.tools.push({ id: "knife", durability: 100 });
    const cal = calendar(0, 250);
    startTask(state, world, cal, "innerBark");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "freshBark")).toBeCloseTo(BARK_FRESH_KG_PER_HOUR / 2, 6);
    st.wood = 0.5;
    expect(check(state, world, cal, "innerBark").why).toBe("the pines are stripped");
  });
});
