import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { removeOrder, ordersHere, orderSentence } from "../src/sim/orders";
import { bodyRowOf, isBodyRow, judgeBodyRow, BODY_SENTENCE } from "../src/sim/bodyorder";
import { addItem } from "../src/sim/inventory";
import { Rng } from "../src/rng";
import { deserialize, serialize } from "../src/sim/save";

const cal = calendar(0);

describe("the body row", () => {
  it("a new region's list is the body row and nothing else", () => {
    const { state, world } = newGame(3);
    const list = ordersHere(state, world);
    expect(list.length).toBe(1);
    expect(isBodyRow(list[0])).toBe(true);
    expect(orderSentence(state, world, cal, list[0])).toBe(BODY_SENTENCE);
  });

  it("it cannot be struck off", () => {
    const { state, world } = newGame(3);
    const row = bodyRowOf(state, world)!;
    removeOrder(state, world, row.id);
    expect(bodyRowOf(state, world)?.id).toBe(row.id);
  });

  it("a save from before it loads with one, at the top", () => {
    const { state, world } = newGame(3);
    const raw = JSON.parse(serialize(state));
    for (const st of Object.values(raw.state.regions) as Record<string, unknown>[]) {
      st.orders = [];
    }
    const file = deserialize(JSON.stringify(raw))!;
    const list = ordersHere(file.state, world);
    expect(isBodyRow(list[0])).toBe(true);
  });

  it("it reads met when the body wants nothing and ready when it does", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.warmth = 100;
    p.water = 3;
    p.kcal = 3000;
    p.energy = 100;
    p.sleepDebt = 0;
    expect(judgeBodyRow(state, world, cal, new Rng(1)).v).toBe("met");
    // Hungry, with food in the pack the row can reach without a walk: the
    // need fires and there is something to do about it.
    p.kcal = 200;
    addItem(p.pack, "driedMeat", 1);
    expect(judgeBodyRow(state, world, cal, new Rng(1)).v).toBe("ready");
  });

  it("a dry read never eats: judging the row over and over leaves the pack and the reserve untouched", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.kcal = 200;
    addItem(p.pack, "driedMeat", 1);
    const before = p.pack.items.driedMeat;
    for (let i = 0; i < 20; i++) judgeBodyRow(state, world, cal, new Rng(1));
    expect(p.kcal).toBe(200);
    expect(p.pack.items.driedMeat).toBe(before);
  });
});
