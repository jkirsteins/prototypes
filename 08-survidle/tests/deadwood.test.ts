import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, freshTool, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { beginTask, check, DEADWOOD_KG, DEADWOOD_TREE_SHARE } from "../src/sim/tasks";

describe("dead wood", () => {
  it("gathers 10 kg of firewood in an hour with no tool and draws the stock an eighth", () => {
    const { state, world } = newGame(17);
    state.player.tools = [];
    placeAtSpot(state, world, state.player.region, "forest");
    const st = state.regions[state.player.region];
    const wood = st.wood;
    const cal = calendar(state.minute, state.startDoy);
    const o = check(state, world, cal, "deadwood");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(60);
    expect(beginTask(state, world, cal, "deadwood")).toBe(true);
    advance(state, world, 60);
    expect(qty(state.player.pack, "firewood")).toBeCloseTo(DEADWOOD_KG);
    expect(st.wood).toBeCloseTo(wood - DEADWOOD_TREE_SHARE);
  });

  it("comes out wet in rain and refuses a picked-clean forest", () => {
    const { state, world } = newGame(17);
    placeAtSpot(state, world, state.player.region, "forest");
    state.weather.precip = "light";
    const cal = calendar(state.minute, state.startDoy);
    beginTask(state, world, cal, "deadwood");
    advance(state, world, 60);
    expect(qty(state.player.pack, "wetFirewood")).toBeCloseTo(DEADWOOD_KG, 0);
    state.regions[state.player.region].wood = 0.1;
    expect(check(state, world, cal, "deadwood").why).toBe("the forest is picked clean");
  });
});

describe("wedges", () => {
  it("are two from two sticks with a knife in twenty minutes", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "stick", 2);
    state.player.tools.push(freshTool("knife"));
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "craft", "wedges").duration).toBe(20);
    beginTask(state, world, cal, "craft", "wedges");
    advance(state, world, 20);
    expect(qty(state.player.pack, "wedge")).toBe(2);
  });

  it("split a log in 45 minutes into 20 kg and need two of them", () => {
    const { state, world } = newGame(17);
    state.player.tools = [];
    const camp = pile(state, state.regions[state.player.region].campCell);
    addItem(camp, "log", 1);
    addItem(camp, "wedge", 1);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "splitWedges").why).toBe("needs two wedges");
    addItem(camp, "wedge", 1);
    const o = check(state, world, cal, "splitWedges");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(45);
    beginTask(state, world, cal, "splitWedges");
    advance(state, world, 45);
    expect(qty(camp, "firewood") + qty(state.player.pack, "firewood")).toBeCloseTo(20);
    expect(qty(camp, "log")).toBe(0);
    expect(qty(camp, "wedge")).toBeGreaterThanOrEqual(1);
  });
});
