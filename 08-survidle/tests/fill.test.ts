import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { yieldItem } from "../src/sim/intent";
import { addItem, freshTool, pile, qty, takeUp } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder, chooseOrder, orderMet } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { beginTask, check } from "../src/sim/tasks";
import { ICE_SHORE_CM, vesselLitres, vesselLitresCapacity, waterSource } from "../src/sim/water";
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

  it("with the carried vessel already full, the task stops instead of repeating forever", () => {
    const { state, world } = waterCamp();
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    placeAt(state, world, shore.cell);
    const bucket = state.player.tools.find((t) => t.id === "barkBucket")!;
    bucket.litres = 2;
    const o = check(state, world, cal, "fill");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("the vessels are full");
  });

  it("a water keep fills at the shore, walks home, pours, and is met", () => {
    const { g, state, world, camp } = waterCamp();
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(until(g, () => orderMet(state, world, o, true), 6000)).toBe(true);
    expect(qty(camp, "water")).toBeCloseTo(2, 5);
  });

  it("a keep run to its first delivery never logs 'the vessels are full' while walking the load home", () => {
    const { g, state, world, camp } = waterCamp();
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(until(g, () => orderMet(state, world, o, true), 6000)).toBe(true);
    expect(qty(camp, "water")).toBeCloseTo(2, 5);
    expect(state.log.some((l) => l.text.includes("the vessels are full"))).toBe(false);
  });

  it("with a vessel in hand and none at camp, a full carried vessel reports the truer reason", () => {
    const g = newGame(17);
    const { state, world } = g;
    addItem(state.player.pack, "barkBucket", 1);
    takeUp(state, world, "barkBucket");
    const bucket = state.player.tools.find((t) => t.id === "barkBucket")!;
    bucket.litres = vesselLitresCapacity(state.player);
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    placeAt(state, world, shore.cell);
    const o = check(state, world, cal, "fill");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("camp is full");
  });

  it("a keep past the camp's capacity is skipped with the reason, not looped", () => {
    const { state, world, camp } = waterCamp();
    addItem(camp, "water", 2);
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 6 }, deliver: "camp", where: "nearest" }, "keep");
    expect(chooseOrder(state, world, cal)).toBeNull();
    expect(o.skipped).toBe("camp holds 2 litres; more vessels at camp would hold more");
  });

  it("a keep with no vessel anywhere reads as needing one, not as already at capacity", () => {
    const g = newGame(17);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    // No barkBucket in the pack, the pile, or in hand: camp capacity is 0
    // litres, same as a camp that is genuinely full. Zero is not full.
    const o = addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(chooseOrder(state, world, cal)).toBeNull();
    expect(o.skipped).toBe("needs a vessel");
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

  it("a manual fill on a frozen shore cuts the hole itself, then fills the vessel", () => {
    const { state, world } = waterCamp();
    state.weather.iceCm = 10;
    state.weather.snowCm = 0;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    placeAt(state, world, shore.cell);
    expect(beginTask(state, world, cal, "fill")).toBe(true);
    expect(state.task?.duration).toBe(25);
    advance(state, world, 25);
    const st = regionState(state, world, state.player.region);
    expect(st.iceHole?.cell).toBe(shore.cell);
    expect(vesselLitres(state.player)).toBeCloseTo(vesselLitresCapacity(state.player), 5);
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

describe("the fill keep in winter", () => {
  it("melts snow at the fire when the shore is iced and no hole can be cut, and the camp water rises", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    state.player.tools.push(freshTool("barkBucket"));
    // A bucket at camp too, as waterCamp() gives: with none, the camp pile has
    // no water capacity at all, and a melted litre can never be poured out of
    // the vessel carried, whatever the fire does.
    addItem(pile(state, st.campCell), "barkBucket", 1);
    state.weather.iceCm = ICE_SHORE_CM;
    state.weather.snowCm = 20;
    addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    const before = qty(pile(state, st.campCell), "water");
    advance(state, world, 120);
    expect(qty(pile(state, st.campCell), "water")).toBeGreaterThan(before);
  });

  it("with an axe in hand, an iced shore, snow and a lit fire, the fill keep walks to the shore and cuts a hole rather than melting snow at camp", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.player.tools.push(freshTool("barkBucket"));
    addItem(pile(state, st.campCell), "barkBucket", 1);
    state.weather.iceCm = ICE_SHORE_CM;
    state.weather.snowCm = 20;
    const shore = spotOf(regionAt(world, state.player.region), "shore")!;
    addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    const before = qty(pile(state, st.campCell), "water");
    advance(state, world, 120);
    // Only the iceHole task ever sets a standing hole at the shore; the melt
    // fallback never does, so its presence alone rules out melting having run.
    expect(st.iceHole?.cell).toBe(shore.cell);
    expect(qty(pile(state, st.campCell), "water")).toBeGreaterThan(before);
  });
});
