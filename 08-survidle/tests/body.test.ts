import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty, weight } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { PACK_COMFORTABLE_KG } from "../src/units";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
const rng = () => new Rng(1);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
/** A forever felling from camp, with the camp cell to hand. Seed 17: bog camp, forest 0.6 km away. */
function felling(seed = 17, deliver: "leave" | "camp" = "leave") {
  const g = newGame(seed);
  const { state, world } = g;
  const camp = regionState(state, world, state.player.region).campCell;
  addItem(state.player.pack, "driedMeat", 2);
  startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "forever" }, deliver, where: "nearest" });
  return { g, state, world, camp };
}

describe("the body tier", () => {
  it("spent, it sets the tree aside, walks to camp and sleeps there", () => {
    const { g, state, world, camp } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    advance(state, world, 20);
    state.player.energy = 20;
    advance(state, world, 1);
    expect(state.task?.id).toBe("walk");
    expect(state.intent?.step).toBe("walking to camp for the night");
    expect(state.intent?.need).toBe("sleep");
    expect(Object.keys(state.paused)).toHaveLength(1);
    expect(until(g, () => state.task?.id === "sleep")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    expect(state.intent?.step).toBe("sleeping");
    expect(until(g, () => state.task?.id !== "sleep", 700)).toBe(true);
    expect(state.intent?.need).toBeNull();
    // Back to the tree it left, and on with the same intent.
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.task!.progress).toBeGreaterThan(15);
  });

  it("night with the energy under 60 is bedtime; over it is not", () => {
    const { g, state } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // 21:00 on 1 April is dark at 62 N.
    state.minute = 13 * 60;
    state.player.energy = 59;
    advance(state, g.world, 1);
    expect(state.intent?.need).toBe("sleep");
    const other = felling();
    expect(until(other.g, () => other.state.task?.id === "chop")).toBe(true);
    other.state.minute = 13 * 60;
    other.state.player.energy = 61;
    advance(other.state, other.world, 1);
    expect(other.state.intent?.need).toBeNull();
    expect(other.state.task?.id).toBe("chop");
  });

  it("makes a fire for the night when the means are at camp: pit from stones, a split log, then light", () => {
    const { g, state, world, camp } = felling();
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, camp), "stone", 6);
    addItem(pile(state, camp), "log", 1);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.energy = 20;
    const steps: string[] = [];
    until(g, () => {
      const s = state.intent?.step ?? "";
      if (steps.at(-1) !== s) steps.push(s);
      return state.task?.id === "sleep";
    }, 1500);
    expect(steps).toEqual(expect.arrayContaining(["walking to camp for the night", "laying a fire pit", "splitting a log for the fire", "lighting the fire", "sleeping"]));
    expect(regionState(state, world, state.player.region).fire.lit).toBe(true);
  });

  it("with no way to camp it sleeps where it stands and says so", () => {
    const { g, state, world } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // Overload the pack so no walk can start.
    addItem(state.player.pack, "stone", 40);
    state.player.energy = 20;
    advance(state, world, 1);
    expect(state.task?.id).toBe("sleep");
    expect(state.intent?.step).toContain("where you stand");
    expect(state.log.some((e) => e.text.includes("You sleep where you are"))).toBe(true);
  });

  it("cold, it goes to camp and rests until warm again, and sleep outranks cold", () => {
    const { g, state, world, camp } = felling();
    const st = regionState(state, world, state.player.region);
    // A fire already going, so this region's camp can actually warm a cold body.
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    expect(state.intent?.step).toBe("walking to camp to warm up");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    // The fire actually raises warmth: the rest runs to completion and gains real ground, so it is not "spent".
    expect(until(g, () => state.task?.id !== "rest", 200)).toBe(true);
    expect(state.player.warmth).toBeGreaterThan(45);
    expect(state.intent?.coldSpent).toBeFalsy();
    // Cold again: the need re-enters normally, not stuck spent from the rest that worked.
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    // Between the entry and the exit the need still holds; at the exit it lets go.
    state.player.warmth = 40;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    state.player.warmth = 80;
    advance(state, world, 1);
    expect(state.intent?.need).toBeNull();
    state.player.warmth = 20;
    state.player.energy = 15;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("sleep");
  });

  it("cold with a bare camp (no pit, no drill, no shelter) keeps working: the camp cannot warm anyone", () => {
    const { g, state, world } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBeNull();
    expect(state.task?.id).toBe("chop");
  });

  it("cold with a lean-to at camp and no fire still goes to camp: shelter alone counts", () => {
    const { g, state, world } = felling();
    const st = regionState(state, world, state.player.region);
    st.structures.leanTo = true;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    expect(state.intent?.step).toBe("walking to camp to warm up");
  });

  it("cold with a lean-to and no fire in deep cold: a rest that cannot help gives the need up", () => {
    const { g, state, world, camp } = felling(17);
    const st = regionState(state, world, state.player.region);
    st.structures.leanTo = true;
    // Far below any target the shelter alone can reach, so the rest that follows cannot gain a point.
    state.weather.offset = -25;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    expect(until(g, () => state.task?.id !== "rest", 200)).toBe(true);
    expect(state.intent?.need).toBeNull();
    expect(state.intent?.coldSpent).toBe(true);
    // Spent, not stuck: the chop resumes rather than resting forever for nothing.
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // Warm again some other way (not by resting here): coldSpent lets go once warmth clears WARM_AT.
    state.player.warmth = 80;
    advance(state, world, 1);
    expect(state.intent?.coldSpent).toBe(false);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
  });

  it("hungry, it eats from the pack and keeps working; with food only at camp it goes there", () => {
    const { g, state, world, camp } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.autoEat = false;
    state.player.kcal = 1700;
    advance(state, world, 1);
    expect(state.player.kcal).toBeGreaterThan(1700);
    expect(state.task?.id).toBe("chop");
    state.player.pack.items.driedMeat = 0;
    addItem(pile(state, camp), "driedMeat", 1);
    state.player.kcal = 1700;
    advance(state, world, 1);
    expect(state.intent?.step).toBe("walking to camp to eat");
    expect(until(g, () => state.player.kcal > 1800)).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
  });

  it("pockets provisions when leaving camp, up to 2 kg and never past the comfortable load", () => {
    // Seed 3's camp sits on forest, so a "sticks" intent never leaves camp and provision()
    // (fired from walkTo) never runs. Seed 17's camp is bog; the forest is 0.6 km off.
    const g = newGame(17);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    state.player.pack.items.driedMeat = 0;
    addItem(pile(state, camp), "driedMeat", 5);
    startIntent(state, world, cal, rng(), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(qty(state.player.pack, "driedMeat")).toBeCloseTo(2, 6);
    expect(weight(state.player.pack)).toBeLessThanOrEqual(PACK_COMFORTABLE_KG);
  });

  it("a working day: trees fall, the night is spent at camp, and the work goes on at dawn", () => {
    // Seed 19: meadow camp, forest 0.6 km away.
    const { state, world, camp } = felling(19);
    const seen = new Map<string, number>();
    for (let m = 0; m < 1440 * 1.5; m++) {
      advance(state, world, 1);
      const k = `${state.task?.id ?? "idle"}@${cellOf(state, world) === camp ? "camp" : "away"}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect(state.dead).toBeNull();
    expect(state.stats.trees).toBeGreaterThan(3);
    expect(seen.get("sleep@camp") ?? 0).toBeGreaterThan(60);
    expect(seen.get("chop@away") ?? 0).toBeGreaterThan(300);
    expect(state.intent?.task).toBe("chop");
    // Woodcraft trained only through the felling minutes. The trace samples after each minute, so the
    // minute a tree comes down is counted by train and not by the trace: one minute per tree of slack.
    expect(Math.abs(state.skills.woodcraft.xp - seen.get("chop@away")!)).toBeLessThanOrEqual(state.stats.trees + 1);
  });

  it("a working day with deliver camp: logs pile up at camp, the pack clears after each delivery, and sleep still happens at camp", () => {
    // Seed 19: meadow camp, forest 0.6 km away.
    const { state, world, camp } = felling(19, "camp");
    let clearedAfterDelivery = false;
    let sleptAtCamp = false;
    let lastCampLogs = qty(pile(state, camp), "log");
    for (let m = 0; m < 1440 * 1.5; m++) {
      advance(state, world, 1);
      const campLogs = qty(pile(state, camp), "log");
      // Whenever the camp pile just grew, the load that grew it should already be off the back.
      if (campLogs > lastCampLogs && qty(state.player.pack, "log") === 0) clearedAfterDelivery = true;
      lastCampLogs = campLogs;
      if (state.task?.id === "sleep" && cellOf(state, world) === camp) sleptAtCamp = true;
    }
    expect(state.dead).toBeNull();
    expect(qty(pile(state, camp), "log")).toBeGreaterThan(8);
    expect(clearedAfterDelivery).toBe(true);
    expect(sleptAtCamp).toBe(true);
  });

  it("a cabin build is set aside for the night and picked up with its minutes kept", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    addItem(pile(state, camp), "log", 40);
    addItem(pile(state, camp), "stone", 12);
    addItem(pile(state, camp), "cordage", 8);
    addItem(state.player.pack, "driedMeat", 2);
    // At energy 25 the cabin's slow early-mastery pace bakes fewer than 4 banked
    // minutes into the ~37 minutes before sleep claims it; 40 gives it room to clear 10.
    state.player.energy = 40;
    startIntent(state, world, cal, rng(), { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.task?.id).toBe("build");
    expect(until(g, () => state.task?.id === "sleep", 1500)).toBe(true);
    const banked = st.build.cabin ?? 0;
    expect(banked).toBeGreaterThan(10);
    expect(until(g, () => state.task?.id === "build", 1500)).toBe(true);
    expect(state.task!.duration).toBeCloseTo(3600 - banked, 0);
  });
});
