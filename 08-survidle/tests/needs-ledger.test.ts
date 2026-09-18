/**
 * The needs ledger: blocked rows publish, the camp row fulfils, a refusal
 * comes back onto the row (sim/needs.ts).
 */
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { bodyStep, campFireLevel, campNeed, raiseFire, thermalFireLevel } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { needsOf } from "../src/sim/needs";
import { newGame } from "../src/sim/newgame";
import { addOrder, judgeOrders } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { needsHtml } from "../src/ui/needs";
import { siteCamp } from "./siting-helpers";

function camp(seed = 3) {
  const { state, world } = newGame(seed);
  siteCamp(state, world);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell!);
  siteFor(st, st.campCell!).structures.firePit = true;
  state.player.tools.push({ id: "fireDrill", durability: 100 });
  addItem(pile(state, st.campCell!), "firewood", 10);
  addItem(pile(state, st.campCell!), "rawMeat", 2);
  const p = state.player;
  p.water = 3; p.kcal = 3000; p.energy = 90; p.sleepDebt = 0; p.warmth = 80; p.wetness = 0;
  while (Math.abs(calendar(state.minute, state.startDoy).hour - 12) > 0.05) state.minute++;
  return { state, world, st, cal: calendar(state.minute, state.startDoy), rng: new Rng(1) };
}

describe("the needs ledger", () => {
  it("is written by a blocked cook row each pass, and cleared when the row is gone", () => {
    const { state, world, cal } = camp();
    const cook = addOrder(state, world, { task: "cook", arg: "rawMeat", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    judgeOrders(state, world, cal);
    expect(needsOf(state).fire).toBe("full");
    expect(needsOf(state).fireBy).toContain("Cook raw meat");
    expect(campFireLevel(state, world)).toBe("full");
    regionState(state, world, state.player.region).orders = regionState(state, world, state.player.region).orders.filter((o) => o.id !== cook.id);
    judgeOrders(state, world, cal);
    expect(needsOf(state).fire).toBe("none");
    expect(campFireLevel(state, world)).toBe("coals");
  });

  it("the camp row raises coals to a full fire for the row, and refuses a cold pit with words the row then carries", () => {
    const { state, world, st, cal, rng } = camp();
    addOrder(state, world, { task: "cook", arg: "rawMeat", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    judgeOrders(state, world, cal);
    // Cold pit: the camp row will not light it, and says so.
    expect(campNeed(state, world, cal)).toBeNull();
    expect(bodyStep(state, world, cal, rng, "fire")).toBeNull();
    const cold = raiseFire(state, world, cal, st.campCell!, "full", false);
    expect(cold).toEqual({ refused: "no fire to raise; light one first" });
    // Coals: raised.
    st.fire.embers = 200;
    expect(campNeed(state, world, cal)).toBe("fire");
    expect(bodyStep(state, world, cal, rng, "fire")?.id).toBe("light");
    // The refusal reaches the row's own reason on the next pass.
    st.fire.embers = 0;
    pile(state, st.campCell!).items.firewood = 0;
    judgeOrders(state, world, cal);
    const verdictWhy = regionState(state, world, state.player.region).orders.find((o) => "req" in o && o.req.task === "cook")?.skipped;
    expect(verdictWhy ?? "").toContain("needs a lit fire");
    expect(needsHtml(state)).toContain("fire: full");
  });

  it("the body's own fire is the body's: cold or soaked wants a full fire, a warm sleeper lets it burn down", () => {
    const { state } = camp();
    expect(thermalFireLevel(state, "cold", false)).toBe("full");
    expect(thermalFireLevel(state, "sleep", false)).toBe("full");
    expect(thermalFireLevel(state, "sleep", true)).toBe("none");
    expect(thermalFireLevel(state, "spent", false)).toBe("none");
    state.player.warmth = 40;
    expect(thermalFireLevel(state, "sleep", true)).toBe("full");
    expect(thermalFireLevel(state, "spent", false)).toBe("full");
  });
});
