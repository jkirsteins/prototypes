import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { needsMending } from "../src/sim/camp";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { placeAtSpot } from "../src/sim/position";
import { hasEvent } from "../src/sim/record";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";

function camp(seed = 8) {
  const g = newGame(seed);
  const st = regionState(g.state, g.world, g.state.player.region);
  st.structures.firePit = true;
  st.structures.leanTo = true;
  st.structures.dryingRack = true;
  st.structures.cabin = true;
  return { ...g, st };
}

describe("structure decay", () => {
  it("drops the lean-to after a year and the rack after two, and keeps the cabin and the fire pit", () => {
    const { state, world, st } = camp();
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 200 * 1440, { nobody: true });
    expect(st.structures.leanTo).toBe(true);
    expect(st.structures.dryingRack).toBe(true);
    advance(state, world, 165 * 1440, { nobody: true });
    expect(st.structures.leanTo).toBe(false);
    expect(st.structures.dryingRack).toBe(true);
    advance(state, world, 365 * 1440, { nobody: true });
    expect(st.structures.dryingRack).toBe(false);
    expect(st.racks).toBe(0);
    expect(st.structures.cabin).toBe(true);
    expect(st.structures.firePit).toBe(true);
  });

  it("loses what hung on the rack when it rots after two years", () => {
    const { state, world, st } = camp();
    st.rack.kg = 3;
    state.weather.precip = "heavy";
    st.structureAge.dryingRack = 731 * 1440;
    advance(state, world, 1440, { nobody: true });
    expect(st.structures.dryingRack).toBe(false);
    expect(st.rack.kg).toBe(0);
  });

  it("asks for mending past two thirds (244 days), and mending resets the age and is recorded", () => {
    const { state, world, st } = camp();
    st.structureAge.leanTo = 244 * 1440;
    expect(needsMending(st, "leanTo")).toBe(true);
    addItem(pile(state, st.campCell), "stick", 2);
    const o = check(state, world, calendar(0), "mend", "leanTo");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(60);
    startTask(state, world, calendar(0), "mend", "leanTo");
    advance(state, world, 120);
    expect(st.structureAge.leanTo).toBeLessThan(2 * 1440);
    expect(needsMending(st, "leanTo")).toBe(false);
    expect(hasEvent(state, (e) => e.kind === "repaired" && e.structure === "leanTo")).toBe(true);
  });

  it("a mend order walks the runner to camp instead of reading skipped forever", () => {
    const { state, world, st } = camp();
    st.structureAge.leanTo = 244 * 1440;
    addItem(pile(state, st.campCell), "stick", 2);
    placeAtSpot(state, world, state.player.region, "forest");
    const o = addOrder(state, world, { task: "mend", arg: "leanTo", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    // A few minutes in, the order is already routed to the work, not left
    // reading "walk to camp" while a fallback wait happens to carry the
    // player home for an unrelated reason.
    advance(state, world, 3);
    expect(o.skipped).toBe("");
    expect(state.intent?.task).toBe("mend");
    advance(state, world, 600);
    expect(st.structureAge.leanTo).toBeLessThan(2 * 1440);
    expect(needsMending(st, "leanTo")).toBe(false);
    expect(hasEvent(state, (e) => e.kind === "repaired" && e.structure === "leanTo")).toBe(true);
  });

  it("does not offer mending for a structure that stands fresh", () => {
    const { state, world } = camp();
    expect(check(state, world, calendar(0), "mend", "leanTo").ok).toBe(false);
  });
});
