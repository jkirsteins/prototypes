import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { orderByHand } from "../src/sim/ladder";
import { addOrder, ordersHere } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { RESTED_AT, SPENT_AT } from "../src/sim/sleep";
import { siteCamp } from "./siting-helpers";
import { openCampWithForestNear } from "./world-facts";
import { testAtmosphere } from "./weather-helpers";

beforeEach(() => testAtmosphere());

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}

/**
 * A camp you leave to gather wood - open ground with forest a short walk off -
 * with the body at camp, a hair past the spent line and with a round trip's
 * worth of energy over the collapse, which is the one thing that would end a
 * once. A camp standing in the wood is worked without walking anywhere, and
 * there is then no round trip to give out on.
 */
function spentAtCamp() {
  const g = newGame(39);
  const { state, world } = g;
  placeAt(state, world, openCampWithForestNear(world, state.player.region).camp);
  siteCamp(state, world);
  const camp = regionState(state, world, state.player.region).campCell!;
  placeAt(state, world, camp);
  addItem(state.player.pack, "driedMeat", 2);
  state.player.energy = SPENT_AT - 1;
  return { g, state, world, camp };
}

describe("work chosen by hand is the player's", () => {
  it("a once order past the spent line walks to the wood and gathers; it turns for camp for nothing short of the collapse", () => {
    const { g, state, world } = spentAtCamp();
    orderByHand(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    // Started on the click, spent or not, and ranked over the body's row,
    // which is what keeps a body past the spent line from taking it back.
    expect(state.intent?.task).toBe("deadwood");
    expect(state.intent?.mode).toBe("hand");
    // The care rows hold ids 1 and 2; this is the first real order.
    expect(state.intent?.orderId).toBe(3);
    const steps = new Set<string>();
    expect(until(g, () => {
      if (state.intent) steps.add(state.intent.step);
      return state.task?.id === "deadwood";
    })).toBe(true);
    expect([...steps].some((s) => s.includes("for the evening"))).toBe(false);
    // The body's memory says what it wants, not what it is getting: under
    // the work, the want is read every minute and served on none of them.
    expect(state.player.bodyNeed).not.toBeNull();
    expect(state.intent?.mode).toBe("hand");
    expect(state.player.energy).toBeLessThan(SPENT_AT);
    // Nothing turned it for camp: the steps above never said "for the evening".
    // What does end it is the collapse, and the body is taken to that line here
    // rather than left to spend itself on the walk, since what a round trip
    // costs follows from how far the wood is.
    expect(state.intent?.mode).toBe("hand");
    state.player.energy = 0;
    advance(state, world, 1);
    expect(state.intent).toBeNull();
    expect(state.player.collapsed).toBe(true);
    expect(state.player.sleeping).toBeNull();
    advance(state, world, 1);
    expect(state.intent?.mode).toBe("care");
    expect(until(g, () => state.task?.id === "rest", 300)).toBe(true);
  });

  it("a list of once orders served while away: the body speaks before each one starts", () => {
    const { g, state, world } = spentAtCamp();
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    addOrder(state, world, { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    advance(state, world, 1);
    // Not the first once: the body takes over between orders because it is spent.
    expect(state.intent?.mode).toBe("care");
    expect(state.player.bodyNeed).toBe("spent");
    expect(until(g, () => state.intent?.task === "sticks", 1500)).toBe(true);
    expect(state.player.energy).toBeGreaterThanOrEqual(RESTED_AT);
    expect(until(g, () => state.intent?.task === "deadwood", 1500)).toBe(true);
  });

  it("a once given by hand while the runner is on its own order cuts in, and a second click displaces the first", () => {
    const { g, state, world } = spentAtCamp();
    state.player.energy = 90;
    addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    expect(until(g, () => state.task?.id === "sticks", 200)).toBe(true);
    orderByHand(state, world, cal, new Rng(1), { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(state.intent?.task).toBe("deadwood");
    // The care rows are 1 and 2, the standing sticks grind given first is 3, so deadwood is 4.
    expect(state.intent?.orderId).toBe(4);
    // The second click is the player asking for something else now: it takes
    // the top of the list, the care rows included, and the minute with it.
    // Bark, not stone: a click that cannot run where it is given displaces
    // nothing, and whether there is an outcrop within reach is the map's.
    const second = orderByHand(state, world, cal, new Rng(1), { task: "bark", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(state.intent?.orderId).toBe(second.id);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([second.id, 4, 1, 2, 3]);
  });

  it("the same work as a standing order is the runner's, and the spent body goes home first", () => {
    const { state, world } = spentAtCamp();
    addOrder(state, world, { task: "deadwood", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 1);
    expect(state.intent?.mode).toBe("care");
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
