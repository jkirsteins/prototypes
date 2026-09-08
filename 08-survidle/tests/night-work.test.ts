import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { SLEEP_AT } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { orderByHand } from "../src/sim/ladder";
import { addOrder, chooseOrder, NIGHT_SKIP, ordersHere } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { cellAt, regionAt } from "../src/world/gen";

/**
 * 8 December, a long night with a new moon over it: the sky puts nothing at
 * all into these cells, so what a run measures is the work's own dark odds.
 */
const DECEMBER = 342;
/** The run opens at 08:00, so these are the clock times they are named for. */
const MIDNIGHT = 16 * 60;
const MIDDAY = 5 * 60;

/**
 * A survivor standing in their own woods under an overcast, snowless
 * December sky: pitch dark at night, no moon to argue about, and no walk
 * between them and the work, so what a run measures is the light alone.
 */
function camp(minute: number) {
  const { state, world } = newGame(17, DECEMBER);
  const st = regionState(state, world, state.player.region);
  const wood = regionAt(world, state.player.region).cells.find((c) => cellAt(world, c).terrain === "pine" || cellAt(world, c).terrain === "spruce");
  placeAt(state, world, wood ?? st.campCell);
  state.minute = minute;
  state.weather.clear = false;
  state.weather.snowCm = 0;
  return { state, world, st, cal: calendar(minute, state.startDoy) };
}

/** Starts the work by hand, the way the Do panel's button does, and returns the minutes it took to finish one piece of it. */
function minutesForOne(minute: number, task: "sticks" | "rest", cap: number, seed = 1): number {
  const c = camp(minute);
  c.state.rng = seed;
  // An empty list, so this measures the light and nothing else: with no body
  // row on it nothing walks him home before dark or lays him down halfway
  // through the count, and the minutes that come back are the work's own.
  c.st.orders.length = 0;
  expect(startIntent(c.state, c.world, c.cal, new Rng(1), { task, until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
  const start = c.state.minute;
  // A once intent ends itself the moment its one piece of work is done, so a
  // live intent at the cap is work that never came in.
  for (let m = 0; m < cap && c.state.intent; m++) {
    c.state.player.energy = 100;
    advance(c.state, c.world, 1);
  }
  expect(c.state.intent).toBeNull();
  return c.state.minute - start;
}

describe("work in the dark", () => {
  it("is not refused: a bundle of sticks gathered at midnight comes in, at many times the daylight hours", () => {
    // One night's gathering is a run of one-in-twenty rolls and can come off
    // early, so this reads the middle of five nights rather than one of them.
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const lit = median(seeds.map((s) => minutesForOne(MIDDAY, "sticks", 12 * 60, s)));
    const dark = median(seeds.map((s) => minutesForOne(MIDNIGHT, "sticks", 60 * 24 * 5, s)));
    // A twentieth of the odds per attempt: fourteen tries is the middle of a
    // run of them and twenty is the average, so five times the daylight
    // minutes is a floor a night beats comfortably without being flaky.
    expect(dark).toBeGreaterThan(lit * 5);
  });

  it("costs very nearly nothing with a torch lit", () => {
    const c = camp(MIDNIGHT);
    c.state.player.torch = { lit: true, minutes: 100_000 };
    expect(startIntent(c.state, c.world, c.cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
    const start = c.state.minute;
    for (let m = 0; m < 12 * 60 && c.state.intent; m++) {
      c.state.player.energy = 100;
      c.state.player.torch = { lit: true, minutes: 100_000 };
      advance(c.state, c.world, 1);
    }
    expect(c.state.intent).toBeNull();
    const torchlit = c.state.minute - start;
    // Only the walk in the dark is left between this and the daylight run.
    expect(torchlit).toBeLessThan(minutesForOne(MIDDAY, "sticks", 12 * 60) * 3);
  });

  it("does not touch work that declares no need for light: an hour off your feet is an hour at either end of the day", () => {
    expect(minutesForOne(MIDNIGHT, "rest", 6 * 60)).toBe(minutesForOne(MIDDAY, "rest", 6 * 60));
  });
});

describe("the runner keeps its night gate", () => {
  it("still skips a standing order for the forest after dark, with the reason it always gave", () => {
    const { state, world } = newGame(17, DECEMBER);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addOrder(state, world, { task: "sticks", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, "keep");
    state.minute = MIDNIGHT;
    const night = calendar(state.minute, state.startDoy);
    expect(night.isNight).toBe(true);
    expect(chooseOrder(state, world, night)).toBeNull();
    // Index 1: the body row sits at 0.
    expect(ordersHere(state, world)[1].skipped).toBe(NIGHT_SKIP.away);
  });
});

describe("the collapse", () => {
  it("is the one thing that stops work chosen by hand, and it sleeps where it stands", () => {
    const c = camp(MIDNIGHT);
    // A click lands over the body's row, which is what makes the work the
    // player chose in the moment the player's: nothing tired, thirsty or cold
    // takes the minute back off it, and the collapse is the one thing left
    // that ends it. The click starts the work itself, which is how a once
    // order runs at an hour the list would refuse to send anyone out at.
    orderByHand(c.state, c.world, c.cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(c.state.intent?.mode).toBe("hand");
    c.state.player.energy = SLEEP_AT;
    advance(c.state, c.world, 1);
    expect(c.state.intent).toBeNull();
    expect(c.state.player.sleeping?.collapsed).toBe(true);
    expect(c.state.task?.id).toBe("sleep");
  });

  it("does not fire while there is anything left in the body", () => {
    const c = camp(MIDNIGHT);
    orderByHand(c.state, c.world, c.cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    c.state.player.energy = SLEEP_AT + 5;
    advance(c.state, c.world, 1);
    expect(c.state.intent).not.toBeNull();
  });
});

describe("the row says what the dark costs", () => {
  it("names the light and the odds on work that needs light, and says nothing on work that does not", () => {
    const c = camp(MIDNIGHT);
    const sticks = check(c.state, c.world, c.cal, "sticks");
    expect(sticks.ok).toBe(true);
    expect(sticks.detail).toContain("pitch dark");
    expect(sticks.detail).toContain("per try");
    expect(check(c.state, c.world, c.cal, "rest").detail).not.toContain("per try");
    // A torch in hand is very nearly daylight, and the row says so rather than going quiet.
    c.state.player.torch = { lit: true, minutes: 30 };
    expect(check(c.state, c.world, c.cal, "sticks").detail).toContain("firelit, about 95% per try");
  });

  it("says nothing at all by day", () => {
    const c = camp(MIDDAY);
    expect(check(c.state, c.world, c.cal, "sticks").detail).not.toContain("per try");
  });
});
