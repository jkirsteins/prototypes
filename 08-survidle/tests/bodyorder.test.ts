import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { NEED_LOG_LINES, NEED_WORDS } from "../src/sim/body";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { SPENT_AT } from "../src/sim/sleep";
import { addOrder, removeOrder, ordersHere, orderSentence, judgeOrders } from "../src/sim/orders";
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

  it("a blocked need reads as the row's own fragment on the row, and the log's own sentence in the log", () => {
    const { state, world } = newGame(3);
    // Off camp, over the pack's hard limit, so the walk home fails and the
    // storm has nowhere to send the body: the same way the reviewer reached it.
    placeAtSpot(state, world, state.player.region, "heath");
    addItem(state.player.pack, "log", 2);
    state.weather.storm = { from: state.minute, until: state.minute + 200, warned: true };
    // The row's own reading is the fragment, the same shape every other
    // skip reason takes, since the panel never resolves the log's voice.
    expect(judgeBodyRow(state, world, cal, new Rng(1))).toEqual({ v: "blocked", why: NEED_WORDS.storm });
    judgeOrders(state, world, cal);
    // The log's own line is the templated sentence, not the row's fragment:
    // this is the one the fix guards, since a wrong lookup here would still
    // pass a test that checked the row's own text instead.
    expect(state.log.at(-1)?.text).toBe(NEED_LOG_LINES.storm);
  });
});

describe("the body row takes its turn by rank", () => {
  it("under the work, the survivor works on past spent", () => {
    const { state, world } = newGame(3);
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    // No panel control ranks a row above the body row, so the list is
    // arranged here directly: what is under test is the scheduler's rule
    // about rank, not the door a rank is changed through.
    const list = ordersHere(state, world);
    list.reverse();
    expect(list[0].id).toBe(grind.id);
    state.player.energy = SPENT_AT - 1;
    advance(state, world, 5);
    expect(state.intent?.orderId).toBe(grind.id);
  });

  it("above the work, it takes the minute mid-chunk and the work keeps its minutes", () => {
    const { state, world } = newGame(3);
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 30);
    expect(state.intent?.orderId).toBe(grind.id);
    const minutes = grind.minutes;
    // Thirsty with nothing to drink from on the belt, so the need wants his
    // feet: a mouthful he could take where he stands would cost the sticks
    // nothing and the row would never need the minute at all.
    state.player.water = 0;
    advance(state, world, 2);
    expect(state.intent?.orderId).toBe(bodyRowOf(state, world)!.id);
    expect(grind.minutes).toBeGreaterThanOrEqual(minutes);
  });

  it("striking the last order off does not stop a sleep already under way", () => {
    const { state, world } = newGame(3);
    const chore = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    state.player.energy = 15;
    state.player.sleepDebt = 1000;
    advance(state, world, 5);
    expect(state.task?.id).toBe("sleep");
    const slept = state.task!.progress;
    removeOrder(state, world, chore.id);
    advance(state, world, 1);
    expect(state.task?.id).toBe("sleep");
    expect(state.task!.progress).toBeGreaterThanOrEqual(slept);
  });
});
