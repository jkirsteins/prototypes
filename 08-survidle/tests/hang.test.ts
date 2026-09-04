import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { yieldItem, yieldItems } from "../src/sim/intent";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder, orderMet } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { beginTask, check } from "../src/sim/tasks";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
function rackCamp() {
  const g = newGame(17);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  st.structures.dryingRack = true;
  // Fat, not dried meat: a driedMeat keep's untilMet now counts the pack as
  // well as the camp pile, so pack food of the same item the keep targets
  // would read as the shortfall already in hand and never let the rack run.
  addItem(state.player.pack, "fat", 3);
  return { g, state, world, st, camp: pile(state, st.campCell) };
}

describe("hanging meat is a task", () => {
  it("needs the rack, raw meat and room; takes five minutes a kilo for what fits", () => {
    const { state, world, st, camp } = rackCamp();
    st.structures.dryingRack = false;
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: false, why: "needs a drying rack" });
    st.structures.dryingRack = true;
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: false, why: "no raw meat here" });
    addItem(camp, "rawMeat", 9);
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: true, duration: 30 });
    st.rack.kg = 6;
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: false, why: "the rack is full" });
  });

  it("the task moves what fits onto the rack over its minutes", () => {
    const { state, world, st, camp } = rackCamp();
    addItem(camp, "rawMeat", 9);
    expect(beginTask(state, world, cal, "hang")).toBe(true);
    advance(state, world, 10);
    expect(st.rack.kg).toBe(0);
    advance(state, world, 25);
    expect(st.rack.kg).toBe(6);
    expect(qty(camp, "rawMeat")).toBe(3);
  });

  it("a keep on dried meat is met when the rack drops it into the pile", () => {
    const { g, state, world, st, camp } = rackCamp();
    expect(yieldItem("hang")).toBe("driedMeat");
    expect(yieldItems("hang")).toEqual([]);
    addItem(camp, "rawMeat", 6);
    state.weather.precip = "none";
    const o = addOrder(state, world, { task: "hang", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(until(g, () => st.rack.kg === 6, 200)).toBe(true);
    // Two dry days; the weather may rain, so allow four.
    expect(until(g, () => orderMet(state, world, o, true), 4 * 1440)).toBe(true);
    // The rack empties the camp pile, so tidyPiles sweeps it; the camp captured
    // above is a stale reference by now, so read the pile fresh.
    expect(qty(pile(state, st.campCell), "driedMeat")).toBeGreaterThanOrEqual(2);
  });
});
