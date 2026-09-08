import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { orderByHand } from "../src/sim/ladder";
import { addOrder, ordersHere } from "../src/sim/orders";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { RESTED_AT, SPENT_AT } from "../src/sim/sleep";
import type { GameState, Order } from "../src/sim/types";
import type { World } from "../src/world/gen";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}

/** Seed 39: meadow camp, forest 0.6 km away. The body is at camp, a hair past the spent line and with a round trip's worth of energy over the collapse, which is the one thing that would end a once. */
function spentAtCamp() {
  const g = newGame(39);
  const { state, world } = g;
  const camp = regionState(state, world, state.player.region).campCell;
  placeAt(state, world, camp);
  addItem(state.player.pack, "driedMeat", 2);
  state.player.energy = SPENT_AT - 1;
  return { g, state, world, camp };
}

/**
 * A row ranked over the body's own, which is where work the player chose in
 * the moment belongs. No panel control moves a row past the body row, so the
 * list is arranged here directly: these tests are about what the scheduler
 * does with a rank, not about the door the rank is asked for through.
 */
function over(state: GameState, world: World, o: Order): Order {
  const list = ordersHere(state, world);
  list.splice(list.indexOf(o), 1);
  list.unshift(o);
  return o;
}

describe("work chosen by hand is the player's", () => {
  it("a once order past the spent line walks to the wood and gathers; it turns for camp for nothing short of the collapse", () => {
    const { g, state, world, camp } = spentAtCamp();
    over(state, world, orderByHand(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job"));
    // Started on the click, spent or not, and ranked over the body's row,
    // which is what keeps a body past the spent line from taking it back.
    expect(state.intent?.task).toBe("deadwood");
    expect(state.intent?.mode).toBe("hand");
    // The body row holds id 1; this is the first real order.
    expect(state.intent?.orderId).toBe(2);
    const steps = new Set<string>();
    expect(until(g, () => {
      if (state.intent) steps.add(state.intent.step);
      return state.task?.id === "deadwood";
    })).toBe(true);
    expect([...steps].some((s) => s.includes("for the evening"))).toBe(false);
    expect(state.player.bodyNeed).toBeNull();
    expect(state.player.energy).toBeLessThan(SPENT_AT);
    expect(until(g, () => state.intent?.task !== "deadwood")).toBe(true);
    // A deadwood round trip costs more energy than the ten points between the
    // spent line and the collapse, so a body that starts one past the spent
    // line gives out on the way. Nothing turned it for camp: it worked until
    // it dropped, and it sleeps in the forest with the wood still on its back.
    expect(state.intent).toBeNull();
    expect(cellOf(state, world)).not.toBe(camp);
    expect(state.task?.id).toBe("sleep");
    expect(state.player.sleeping?.collapsed).toBe(true);
  });

  it("a list of once orders served while away: the body speaks before each one starts", () => {
    const { g, state, world } = spentAtCamp();
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    addOrder(state, world, { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    advance(state, world, 1);
    // Not the first once: the runner is its own between orders, and the body is spent.
    expect(state.intent?.task).toBe("wait");
    expect(state.intent?.mode === "runner" && state.player.bodyNeed).toBe("spent");
    expect(until(g, () => state.intent?.task === "sticks", 1500)).toBe(true);
    expect(state.player.energy).toBeGreaterThanOrEqual(RESTED_AT);
    expect(until(g, () => state.intent?.task === "deadwood", 1500)).toBe(true);
  });

  it("a once given by hand while the runner is on its own order cuts in, and a second one queues behind the first", () => {
    const { g, state, world } = spentAtCamp();
    state.player.energy = 90;
    addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    expect(until(g, () => state.task?.id === "sticks", 200)).toBe(true);
    orderByHand(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(state.intent?.task).toBe("deadwood");
    // Body row is 1, the standing sticks grind given first is 2, so deadwood is 3.
    expect(state.intent?.orderId).toBe(3);
    const second = orderByHand(state, world, cal, new Rng(1), { task: "stone", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(state.intent?.orderId).toBe(3);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 3, second.id, 2]);
  });

  it("the same work as a standing order is the runner's, and the spent body goes home first", () => {
    const { state, world } = spentAtCamp();
    addOrder(state, world, { task: "deadwood", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 1);
    expect(state.intent?.mode).toBe("runner");
    expect(state.player.bodyNeed).toBe("spent");
  });

  it("a night out is the runner's even though nobody counts it; a once started by hand is the player's", () => {
    const night = spentAtCamp();
    expect(startIntent(night.state, night.world, cal, new Rng(1), { task: "night", until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
    expect(night.state.intent?.mode).toBe("runner");
    const sticks = spentAtCamp();
    expect(startIntent(sticks.state, sticks.world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
    expect(sticks.state.intent?.mode).toBe("hand");
  });
});
