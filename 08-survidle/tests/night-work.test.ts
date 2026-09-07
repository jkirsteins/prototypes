import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { SLEEP_AT } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { addOrder, chooseOrder, NIGHT_SKIP, ordersHere } from "../src/sim/orders";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";

/** 1 December, so a night is long enough to work a whole task in. */
const DECEMBER = 334;
/** The run opens at 08:00, so these are the clock times they are named for. */
const MIDNIGHT = 16 * 60;
const MIDDAY = 5 * 60;

/** A survivor at their December camp under an overcast, snowless sky: pitch dark at night, and no moon to argue about. */
function camp(minute: number) {
  const { state, world } = newGame(17, DECEMBER);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  state.minute = minute;
  state.weather.clear = false;
  state.weather.snowCm = 0;
  return { state, world, st, cal: calendar(minute, state.startDoy) };
}

/** Starts the work by hand, the way the Do panel's button does, and returns the minutes it took to finish one piece of it. */
function minutesForOne(minute: number, task: "sticks" | "rest", cap: number): number {
  const c = camp(minute);
  expect(startIntent(c.state, c.world, c.cal, new Rng(1), { task, until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
  const start = c.state.minute;
  // A once intent ends itself the moment its one piece of work is done, so a
  // live intent at the cap is work that never came in.
  for (let m = 0; m < cap && c.state.intent; m++) {
    // The body is held up, so this measures the light and nothing else: a
    // hand intent has no body tier and would otherwise collapse mid-count.
    c.state.player.energy = 100;
    advance(c.state, c.world, 1);
  }
  expect(c.state.intent).toBeNull();
  return c.state.minute - start;
}

describe("work in the dark", () => {
  it("is not refused: a bundle of sticks gathered at midnight comes in, at many times the daylight hours", () => {
    const lit = minutesForOne(MIDDAY, "sticks", 12 * 60);
    const dark = minutesForOne(MIDNIGHT, "sticks", 60 * 24 * 5);
    expect(dark).toBeGreaterThan(lit * 3);
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
    expect(ordersHere(state, world)[0].skipped).toBe(NIGHT_SKIP.away);
  });
});

describe("the collapse", () => {
  it("is the one thing that stops work chosen by hand, and it sleeps where it stands", () => {
    const c = camp(MIDNIGHT);
    startIntent(c.state, c.world, c.cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(c.state.intent?.mode).toBe("hand");
    c.state.player.energy = SLEEP_AT;
    advance(c.state, c.world, 1);
    expect(c.state.intent).toBeNull();
    expect(c.state.player.sleeping?.collapsed).toBe(true);
    expect(c.state.task?.id).toBe("sleep");
  });

  it("does not fire while there is anything left in the body", () => {
    const c = camp(MIDNIGHT);
    startIntent(c.state, c.world, c.cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    c.state.player.energy = SLEEP_AT + 5;
    advance(c.state, c.world, 1);
    expect(c.state.intent).not.toBeNull();
  });
});
