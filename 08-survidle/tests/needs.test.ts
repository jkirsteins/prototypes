import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { canFeed, currentNeed } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { addItem, pile, qty, takeUp } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { huntedLand } from "../src/sim/species";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
/** A forever felling on seed 17 from camp, pack emptied of food. */
function felling() {
  const g = newGame(17);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  state.player.pack.items.driedMeat = 0;
  startIntent(state, world, cal, new Rng(1), { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" });
  return { g, state, world, st };
}

describe("the need order", () => {
  it("hungry with no food anywhere yields to a thirst with water in reach", () => {
    const { state, world } = felling();
    const p = state.player;
    p.kcal = 1000;
    p.water = 0.5;
    addItem(p.pack, "barkBucket", 1);
    takeUp(state, world, "barkBucket");
    p.tools.find((t) => t.id === "barkBucket")!.litres = 2;
    expect(canFeed(state, world, cal, state.intent!)).toBe(false);
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
  });

  it("both in reach: thirst first, then hunger", () => {
    const { state, world } = felling();
    const p = state.player;
    p.kcal = 1000;
    p.water = 0.5;
    addItem(p.pack, "driedMeat", 1);
    addItem(p.pack, "barkBucket", 1);
    takeUp(state, world, "barkBucket");
    p.tools.find((t) => t.id === "barkBucket")!.litres = 2;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    p.water = 3;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("hungry");
  });

  it("hungry with no food and no water in reach is no need at all", () => {
    const { state, world } = felling();
    const p = state.player;
    p.kcal = 1000;
    p.water = 3;
    expect(currentNeed(state, world, cal, state.intent!)).toBeNull();
  });

  it("thirsty at camp with the fire out and snow down: light the fire, then melt", () => {
    const { g, state, world, st } = felling();
    const p = state.player;
    placeAt(state, world, st.campCell);
    state.weather.iceCm = 10;
    state.weather.snowCm = 20;
    st.structures.firePit = true;
    addItem(p.pack, "fireDrill", 1);
    takeUp(state, world, "fireDrill");
    addItem(pile(state, st.campCell), "firewood", 10);
    p.water = 0.5;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    expect(until(g, () => st.fire.lit, 120)).toBe(true);
    expect(until(g, () => p.water > 1, 120)).toBe(true);
  });

  it("thirsty away from camp with camp water at home walks home for it", () => {
    const { g, state, world, st } = felling();
    const p = state.player;
    state.weather.iceCm = 10;
    addItem(pile(state, st.campCell), "barkBucket", 1);
    addItem(pile(state, st.campCell), "water", 2);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    p.water = 0.5;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("thirsty");
    expect(until(g, () => p.water > 1, 600)).toBe(true);
    expect(qty(pile(state, st.campCell), "water")).toBeLessThan(2);
  });
});

describe("arrows in the pack", () => {
  it("a bow hunt keeps its arrows through an unloading at camp, and provisioning pockets them", () => {
    const g = newGame(17);
    const { state, world } = g;
    const p = state.player;
    const st = regionState(state, world, p.region);
    placeAt(state, world, st.campCell);
    addItem(p.pack, "bow", 1);
    takeUp(state, world, "bow");
    addItem(pile(state, st.campCell), "arrow", 12);
    addItem(pile(state, st.campCell), "driedMeat", 2);
    startIntent(state, world, cal, new Rng(1), { task: "hunt", arg: "any", until: { kind: "campHas", qty: 3 }, deliver: "camp", where: "nearest" });
    expect(qty(p.pack, "arrow")).toBe(10);
    // Meat in the pack meets the promise, so the runner walks home and unloads; the arrows must not go with the meat.
    expect(until(g, () => state.task?.id === "hunt", 600)).toBe(true);
    addItem(p.pack, "rawMeat", 5);
    state.task = null;
    expect(until(g, () => qty(pile(state, st.campCell), "rawMeat") >= 5, 1500)).toBe(true);
    expect(qty(p.pack, "arrow")).toBe(10);
  });

  it("a hunt that cannot start pockets nothing: the check fails with the bow already in hand", () => {
    const g = newGame(17);
    const { state, world } = g;
    const p = state.player;
    const st = regionState(state, world, p.region);
    placeAt(state, world, st.campCell);
    addItem(p.pack, "bow", 1);
    takeUp(state, world, "bow");
    addItem(pile(state, st.campCell), "arrow", 12);
    // Nothing huntable about at all: the check fails on "nothing about" with the bow
    // (and, until reverted, the pocketed arrows) already in hand, not on the bow or arrows.
    for (const s of huntedLand()) st.pop[s] = 0;
    const before = state.intent;
    const ok = startIntent(state, world, cal, new Rng(1), { task: "hunt", arg: "any", until: { kind: "campHas", qty: 3 }, deliver: "camp", where: "nearest" });
    expect(ok).toBe(false);
    expect(state.intent).toBe(before);
    expect(qty(pile(state, st.campCell), "arrow")).toBe(12);
  });
});
