import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { yieldItem } from "../src/sim/intent";
import { addItem, pile, qty, takeUp } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder, chooseOrder, orderMet } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { waterSource } from "../src/sim/water";
import { regionAt, spotOf } from "../src/world/gen";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
/** Seed 17's start has a shore. Two buckets: one in hand, one at camp. */
function waterCamp(seed = 17) {
  const g = newGame(seed);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  const camp = pile(state, st.campCell);
  addItem(camp, "barkBucket", 1);
  addItem(state.player.pack, "barkBucket", 1);
  takeUp(state, world, "barkBucket");
  addItem(state.player.pack, "driedMeat", 3);
  return { g, state, world, st, camp };
}

describe("the fill task", () => {
  it("fills at open water, and its yield for orders is water", () => {
    const { state, world } = waterCamp();
    expect(yieldItem("fill")).toBe("water");
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    placeAt(state, world, shore.cell);
    const o = check(state, world, cal, "fill");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(5);
  });

  it("a water keep fills at the shore, walks home, pours, and is met", () => {
    const { g, state, world, camp } = waterCamp();
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(until(g, () => orderMet(state, world, o, true), 6000)).toBe(true);
    expect(qty(camp, "water")).toBeCloseTo(2, 5);
  });

  it("a keep past the camp's capacity is skipped with the reason, not looped", () => {
    const { state, world, camp } = waterCamp();
    addItem(camp, "water", 2);
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 6 }, deliver: "camp", where: "nearest" }, "keep");
    expect(chooseOrder(state, world, cal)).toBeNull();
    expect(o.skipped).toBe("camp holds 2 litres; more vessels at camp would hold more");
  });

  it("on a frozen shore the fill opens an ice hole first, and the hole is gone at dawn", () => {
    const { g, state, world, st, camp } = waterCamp();
    state.weather.iceCm = 10;
    state.weather.snowCm = 0;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    expect(check(state, world, cal, "iceHole", undefined, shore.cell).ok).toBe(true);
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    // The dawn roll melts April ice at 2 cm a degree of mean; pin it so the shore stays shut for the test.
    expect(until(g, () => { state.weather.iceCm = 10; return st.iceHole !== null; }, 4000)).toBe(true);
    expect(st.iceHole!.cell).toBe(shore.cell);
    placeAt(state, world, shore.cell);
    expect(waterSource(state, world)).toBe(true);
    expect(until(g, () => orderMet(state, world, o, true), 6000)).toBe(true);
    expect(qty(camp, "water")).toBeCloseTo(2, 5);
    // The daily tick runs at 04:00; from 1 April 06:00 that is under a day away.
    expect(until(g, () => st.iceHole === null, 1500)).toBe(true);
    expect(state.log.some((l) => l.text === "The ice hole has skinned over.")).toBe(true);
  });

  it("with no axe in reach a frozen shore blocks the fill and says so", () => {
    const { state, world } = waterCamp();
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    state.weather.iceCm = 10;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    const o = check(state, world, cal, "fill", undefined, shore.cell);
    expect(o.ok).toBe(false);
    expect(o.why).toBe("iced over; needs an axe for an ice hole");
  });
});
