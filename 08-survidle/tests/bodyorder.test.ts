import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { NEED_WORDS } from "../src/sim/body";
import { newGame } from "../src/sim/newgame";
import { removeOrder, ordersHere, orderSentence, judgeOrders } from "../src/sim/orders";
import { bodyRowOf, isBodyRow, judgeBodyRow, BODY_SENTENCE } from "../src/sim/bodyorder";
import { addItem, pile, qty } from "../src/sim/inventory";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
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

  it("a dry read never drinks: judging a thirsty body with a full waterskin leaves the reserve untouched", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.tools.push({ id: "waterskin", durability: 100, litres: 3 });
    p.water = 0.5;
    for (let i = 0; i < 20; i++) judgeBodyRow(state, world, cal, new Rng(1));
    expect(p.water).toBe(0.5);
  });

  it("a dry read never feeds the fire: judging a storm at camp leaves the woodpile and the fire's own fuel untouched", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "camp");
    st.fire.lit = true;
    st.fire.fuelKg = 1;
    addItem(pile(state, st.campCell), "firewood", 5);
    state.weather.storm = { from: state.minute, until: state.minute + 200, warned: true };
    for (let i = 0; i < 20; i++) judgeBodyRow(state, world, cal, new Rng(1));
    expect(st.fire.fuelKg).toBe(1);
    expect(qty(pile(state, st.campCell), "firewood")).toBe(5);
  });

  it("a dry read never writes bodyNeed: the one minute a finished sleep or rest opens for the scheduler stays open", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.kcal = 200;
    addItem(p.pack, "driedMeat", 1);
    // tasks.ts clears bodyNeed to null the instant a sleep or a rest's
    // estimated span completes, so the scheduler gets one clean minute
    // before serveBody decides the need is still there. A judgement that
    // wrote the answer back would close that minute before it opened.
    p.bodyNeed = null;
    judgeBodyRow(state, world, cal, new Rng(1));
    expect(p.bodyNeed).toBeNull();
  });

  it("a blocked need reads as the body's own sentence, not a row title and a colon", () => {
    const { state, world } = newGame(3);
    // Off camp, over the pack's hard limit, so the walk home fails and the
    // storm has nowhere to send the body: the same way the reviewer reached it.
    placeAtSpot(state, world, state.player.region, "heath");
    addItem(state.player.pack, "log", 2);
    state.weather.storm = { from: state.minute, until: state.minute + 200, warned: true };
    expect(judgeBodyRow(state, world, cal, new Rng(1))).toEqual({ v: "blocked", why: NEED_WORDS.storm });
    judgeOrders(state, world, cal);
    expect(state.log.at(-1)?.text).toBe(`${NEED_WORDS.storm}.`);
  });
});
