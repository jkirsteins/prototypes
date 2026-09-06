import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { canFeed, currentNeed, SLEEP_AT, SOAKED_WETNESS, WET_COLD_C } from "../src/sim/body";
import { alertness, RESTED_AT, sleepiness, sleepMinutes, SLEEP_MAX_MINUTES, SLEEP_MIN_MINUTES, SLEEP_ONSET, SPENT_AT, WAKE_AT } from "../src/sim/sleep";
import { calendar } from "../src/sim/calendar";
import { WATER_FULL } from "../src/sim/water";
import { startIntent } from "../src/sim/intent";
import { addItem, pile, qty, takeUp } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { ambientTemperature } from "../src/sim/weather";
import { placeAt, straightKm } from "../src/sim/position";
import { WINTER_WOOD_FROM_DOY } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { seepGround } from "../src/sim/seep";
import { huntedLand } from "../src/sim/species";
import { check, startTask } from "../src/sim/tasks";
import type { Task } from "../src/sim/types";
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
    // No axe: an iced shore in reach would otherwise be a hole to cut, and
    // this test wants the melt path that runs when a hole is not an option.
    p.tools = p.tools.filter((t) => t.id !== "axe");
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

describe("snares in the pack", () => {
  it("a set-snares order pockets what is at camp before it leaves, and the heath build succeeds", () => {
    const g = newGame(17);
    const { state, world } = g;
    const p = state.player;
    const st = regionState(state, world, p.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "snare", 2);
    const o = addOrder(state, world, { task: "build", arg: "snare", until: { kind: "times", n: 5 }, deliver: "leave", where: "nearest" }, "job");
    // Bound to the order (as the scheduler binds it once it picks the order), the way
    // the arrows test above starts its hunt directly rather than through chooseOrder.
    startIntent(state, world, cal, new Rng(1), o.req, o.id);
    expect(qty(p.pack, "snare")).toBe(2);
    expect(qty(pile(state, st.campCell), "snare")).toBe(0);
    expect(until(g, () => st.structures.snares >= 1, 600)).toBe(true);
  });

  it("a hand-started set-snares intent with no order reads the times target off the intent itself", () => {
    const g = newGame(17);
    const { state, world } = g;
    const p = state.player;
    const st = regionState(state, world, p.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "snare", 5);
    startIntent(state, world, cal, new Rng(1), { task: "build", arg: "snare", until: { kind: "times", n: 5 }, deliver: "leave", where: "nearest" });
    expect(state.intent?.orderId).toBeNull();
    expect(qty(p.pack, "snare")).toBe(5);
    expect(qty(pile(state, st.campCell), "snare")).toBe(0);
  });
});

describe("a kit at camp counts only while standing there", () => {
  it("at camp with a bow in hand and arrows only in the camp pile, chooseOrder picks the hunt and the runner leaves with arrows in the pack", () => {
    const g = newGame(17);
    const { state, world } = g;
    const p = state.player;
    const st = regionState(state, world, p.region);
    placeAt(state, world, st.campCell);
    addItem(p.pack, "bow", 1);
    takeUp(state, world, "bow");
    addItem(pile(state, st.campCell), "arrow", 12);
    addOrder(state, world, { task: "hunt", arg: "any", until: { kind: "campHas", qty: 3 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 1);
    expect(state.intent?.task).toBe("hunt");
    expect(state.intent?.orderId).not.toBeNull();
    expect(qty(p.pack, "arrow")).toBe(10);
    // Pocketed at the start, not just for a moment: still in the pack once hunting is under way.
    expect(until(g, () => state.task?.id === "hunt", 200)).toBe(true);
    expect(qty(p.pack, "arrow")).toBe(10);
  });

  it("at camp with snares only in the camp pile, chooseOrder picks the set-snares job and the heath build succeeds", () => {
    const g = newGame(17);
    const { state, world } = g;
    const p = state.player;
    const st = regionState(state, world, p.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "snare", 2);
    addOrder(state, world, { task: "build", arg: "snare", until: { kind: "times", n: 5 }, deliver: "leave", where: "nearest" }, "job");
    advance(state, world, 1);
    expect(state.intent?.task).toBe("build");
    expect(state.intent?.orderId).not.toBeNull();
    expect(qty(p.pack, "snare")).toBe(2);
    expect(qty(pile(state, st.campCell), "snare")).toBe(0);
    expect(until(g, () => st.structures.snares >= 1, 600)).toBe(true);
  });

  it("away from camp, the reasons stay needs arrows in the pack and needs a snare, whatever sits at camp", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    const st = regionState(state, world, p.region);
    const r = regionAt(world, p.region);
    addItem(p.pack, "bow", 1);
    takeUp(state, world, "bow");
    addItem(pile(state, st.campCell), "arrow", 12);
    const forest = spotOf(r, "forest")!.cell;
    placeAt(state, world, forest);
    expect(forest).not.toBe(st.campCell);
    expect(check(state, world, cal, "hunt", "any").why).toBe("needs arrows in the pack");

    addItem(pile(state, st.campCell), "snare", 2);
    const heath = spotOf(r, "heath")!.cell;
    placeAt(state, world, heath);
    expect(heath).not.toBe(st.campCell);
    expect(check(state, world, cal, "build", "snare").why).toBe("needs a snare");
  });
});

describe("wet and cold", () => {
  it("counts as cold at warmth 45 when soaked under 5 C, and not when dry", () => {
    const g = felling();
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    state.weather.offset = -10;
    const cal = calendar(state.minute);
    expect(ambientTemperature(cal, state.weather)).toBeLessThan(5);
    state.player.warmth = 40;
    state.player.wetness = 0;
    expect(currentNeed(state, world, cal, state.intent!)).not.toBe("cold");
    state.player.wetness = 80;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("cold");
    expect(SOAKED_WETNESS).toBe(60);
    expect(WET_COLD_C).toBe(5);
  });
});

describe("thirst and the seep", () => {
  /** A felling run with a seep dug on the wet cell nearest the camp; null when the region has none. With `iced` the shore is shut and the axe stowed in the pack once the felling is under way, so no hole can be cut. */
  function withSeep(litres: number, iced: boolean) {
    const f = felling();
    const { g, state, world } = f;
    const p = state.player;
    const r = regionAt(world, p.region);
    const camp = f.st.campCell;
    const wet = r.cells.filter((c) => seepGround(world, c) !== null).sort((a, b) => straightKm(world, camp, a) - straightKm(world, camp, b))[0];
    if (wet === undefined) return null;
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // Dug once the felling is under way, so the pool reads what the test says and not that plus hours of refill.
    state.seeps[wet] = { class: seepGround(world, wet)!, litres, ice: 0, dug: state.minute };
    if (iced) {
      state.weather.iceCm = 10;
      state.weather.snowCm = 0;
      p.tools = p.tools.filter((t) => t.id !== "axe");
      addItem(p.pack, "axe", 1);
    }
    return { ...f, p, wet };
  }

  it("thirsty with an empty seep and an open shore walks for the shore, not the seep", () => {
    const s = withSeep(0, false);
    if (!s) return;
    const { state, world, p, wet } = s;
    p.water = 0.5;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
    expect(state.route?.target).not.toBe(wet);
  });

  it("thirsty with a full seep and the shore iced with no axe in hand walks to the seep and drinks it down", () => {
    const s = withSeep(5, true);
    if (!s) return;
    const { g, state, p, wet } = s;
    p.water = 0.5;
    expect(until(g, () => p.water > 1, 600)).toBe(true);
    expect(state.seeps[wet].litres).toBeLessThan(5);
  });

  it("thirsty with only a trickling seep waits beside it, drinking as it fills", () => {
    const s = withSeep(0.2, true);
    if (!s) return;
    const { g, state, p } = s;
    p.water = 0.5;
    expect(until(g, () => state.intent?.step === "waiting at the seep", 600)).toBe(true);
    expect(until(g, () => p.water > 1, 600)).toBe(true);
  });
});

describe("sleep by the model, not by the clock", () => {
  /** 20:00 on 1 September at camp, a felling intent live: minute 0 is 08:00 and sunset is 19:56, so this is the dark. */
  function septemberEvening() {
    const g = newGame(17, WINTER_WOOD_FROM_DOY);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    state.minute = 720;
    const night = calendar(state.minute, state.startDoy);
    expect(night.isNight).toBe(true);
    startIntent(state, world, night, new Rng(1), { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" });
    return { g, state, world, night };
  }

  /** The debt that puts this hour's sleepiness on a wanted line. */
  function debtFor(target: number, hour: number): number {
    return target + alertness(hour);
  }

  it("the onset line lays the body down and the wake line gets it up: no clock is read either way", () => {
    const { state, world, night } = septemberEvening();
    const p = state.player;
    p.energy = 80;
    p.water = WATER_FULL;
    // A point under the onset line at this hour: still up, whatever the dark.
    p.sleepDebt = debtFor(SLEEP_ONSET - 1, night.hour);
    expect(currentNeed(state, world, night, state.intent!)).not.toBe("sleep");
    // A point over it: to bed.
    p.sleepDebt = debtFor(SLEEP_ONSET + 1, night.hour);
    expect(currentNeed(state, world, night, state.intent!)).toBe("sleep");
    // The sleep holds down to the wake line and lets go under it. The gap
    // between the two lines is what stops a body stirring at every dip.
    state.intent!.need = "sleep";
    p.sleepDebt = debtFor(WAKE_AT + 1, night.hour);
    expect(currentNeed(state, world, night, state.intent!)).toBe("sleep");
    p.sleepDebt = debtFor(WAKE_AT - 1, night.hour);
    expect(currentNeed(state, world, night, state.intent!)).not.toBe("sleep");
  });

  it("a body under the collapse line sleeps parched and holds that sleep until it is rested", () => {
    const { state, world, night } = septemberEvening();
    const p = state.player;
    // Nothing sleepy about it: the debt is at the bottom of the range.
    p.sleepDebt = 0;
    p.water = 0.1;
    p.energy = SLEEP_AT;
    expect(currentNeed(state, world, night, state.intent!)).toBe("sleep");
    expect(state.player.sleeping).toEqual({ collapsed: true });
    // Past the collapse line but not yet rested: still down.
    p.energy = RESTED_AT - 1;
    expect(currentNeed(state, world, night, state.intent!)).toBe("sleep");
    // Rested, and with no sleepiness to hold it there, it is up by the fire.
    p.energy = RESTED_AT;
    state.intent!.need = null;
    expect(currentNeed(state, world, night, state.intent!)).not.toBe("sleep");
    expect(state.player.sleeping).toBeNull();
  });

  it("a rested body with its debt paid works by firelight at 23:00, with no night clause to stop it", () => {
    const { state, world } = septemberEvening();
    const p = state.player;
    state.minute = 15 * 60; // 23:00 on day 1
    const late = calendar(state.minute, state.startDoy);
    expect(late.isNight).toBe(true);
    p.energy = 100;
    p.water = WATER_FULL;
    p.sleepDebt = 20;
    expect(sleepiness(p.sleepDebt, late.hour)).toBeLessThan(SLEEP_ONSET);
    expect(currentNeed(state, world, late, state.intent!)).toBeNull();
  });

  it("a spent body rests by the fire until it is rested, and not until a clock says dawn", () => {
    const { state, world, night } = septemberEvening();
    const p = state.player;
    p.sleepDebt = 0;
    p.water = WATER_FULL;
    p.energy = SPENT_AT - 1;
    expect(currentNeed(state, world, night, state.intent!)).toBe("spent");
    state.intent!.need = "spent";
    p.energy = RESTED_AT - 1;
    expect(currentNeed(state, world, night, state.intent!)).toBe("spent");
    p.energy = RESTED_AT;
    expect(currentNeed(state, world, night, state.intent!)).not.toBe("spent");
  });

  it("the sleep task runs to the model's wake line, with no dawn floor and no cap", () => {
    const { state, world, night } = septemberEvening();
    state.intent = null;
    state.task = null;
    state.player.sleepDebt = debtFor(SLEEP_ONSET, night.hour);
    const minutes = sleepMinutes(state, night);
    expect(check(state, world, night, "sleep").duration).toBe(minutes);
    expect(check(state, world, night, "sleep").detail).toContain("until rested");
    expect(minutes).toBeGreaterThanOrEqual(SLEEP_MIN_MINUTES);
    expect(minutes).toBeLessThanOrEqual(SLEEP_MAX_MINUTES);
    expect(startTask(state, world, night, "sleep")).toBe(true);
    expect(state.task!.duration).toBe(minutes);
    advance(state, world, minutes);
    expect(state.task).toBeNull();
    // It ended on the wake line, which is the body's own reading and not the sun's.
    expect(sleepiness(state.player.sleepDebt, calendar(state.minute, state.startDoy).hour)).toBeLessThanOrEqual(WAKE_AT + 1);
  });

  it("a wait intent at camp keeps its fire before it rests", () => {
    // Every camp chore the dark allows works by firelight, so a runner that
    // waited a fire out would have no way back to work before dawn. The same
    // step a spent body takes at camp.
    const { state, world, night } = septemberEvening();
    const st = regionState(state, world, state.player.region);
    st.fire.lit = false;
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell), "firewood", 5);
    state.intent = null;
    state.task = null;
    state.player.sleepDebt = 0;
    startIntent(state, world, night, new Rng(1), { task: "wait", until: { kind: "forever" }, deliver: "leave", where: "nearest" });
    expect((state.task as Task | null)?.id).toBe("light");
  });

  it("a wait intent never lies down of its own accord: the body's need is what puts it to bed", () => {
    const { state, world, night } = septemberEvening();
    state.intent = null;
    state.task = null;
    const wait = { task: "wait" as const, until: { kind: "forever" as const }, deliver: "leave" as const, where: "nearest" as const };
    // Not sleepy, in the dark: a wait rests.
    state.player.sleepDebt = 0;
    state.player.water = WATER_FULL;
    startIntent(state, world, night, new Rng(1), wait);
    // The cast widens past the "= null" above: tsc otherwise narrows
    // state.task to null there and reads this access as unreachable, since it
    // cannot see that startIntent assigns a task of its own.
    expect((state.task as Task | null)?.id).toBe("rest");
    // Sleepy: the body tier takes the rest over on the next minute.
    state.player.sleepDebt = debtFor(SLEEP_ONSET + 1, calendar(state.minute, state.startDoy).hour);
    advance(state, world, 1);
    expect((state.task as Task | null)?.id).toBe("sleep");
  });
});
