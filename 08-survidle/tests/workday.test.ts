import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { currentNeed, NIGHT_SLEEP_UNDER, snaresWaiting, spentNow, WORK_HOURS_DEFAULT } from "../src/sim/body";
import { calendar, minutesUntilDawn, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { placeAtSpot } from "../src/sim/position";
import { kitOut } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask, setAside, startTask } from "../src/sim/tasks";
import type { GameState } from "../src/sim/types";
import { drink, THIRSTY_L, WATER_FULL } from "../src/sim/water";
import { stormComing, stormNow } from "../src/sim/weather";
import { regionAt, spotOf } from "../src/world/gen";

const LINE = "A day's work done. You rest by the fire.";

/** A kitted camp on seed 17 with one endless felling grind, the survivor fresh at 08:00. */
function felling() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  g.state.player.energy = 100;
  addOrder(g.state, g.world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  // One minute is enough for the order to become a live intent to read needs against.
  advance(g.state, g.world, 1);
  return g;
}

/** The day's work counted as done, so the spent marker holds on the next reading. */
function workedTheDay(state: GameState): void {
  today(state).workMin = state.player.workHours * 60;
}

/** The first minute from here that is night with no storm about, so only the clause under test can hold. */
function calmNight(state: GameState): number {
  let m = state.minute;
  for (let i = 0; i < 4000; i++) {
    if (calendar(m).isNight && !stormNow(state.weather, m) && !stormComing(state.weather, m)) return m;
    m += 15;
  }
  throw new Error("no calm night within the search");
}

describe("the working day", () => {
  it("is ten hours by default, on a new game and on a save without it", () => {
    const { state } = newGame(1);
    expect(WORK_HOURS_DEFAULT).toBe(10);
    expect(state.player.workHours).toBe(10);
    expect(state.player.restUntil).toBeUndefined();
    const raw = JSON.parse(serialize(state));
    delete raw.state.player.workHours;
    expect(deserialize(JSON.stringify(raw))!.state.player.workHours).toBe(10);
  });

  it("a runner on a felling grind stops at ten hours, rests by the fire until dawn, and sleeps at nightfall", () => {
    const { state, world } = felling();
    // To 23:59 on day 1, an hour at a time, watching for the need.
    let sawSpent = false;
    let sawRest = false;
    for (let h = 0; h < 16; h++) {
      advance(state, world, 60);
      if (state.intent?.need === "spent") {
        sawSpent = true;
        if (state.task?.id === "rest") sawRest = true;
      }
    }
    expect(sawSpent).toBe(true);
    expect(sawRest).toBe(true);
    const day1 = state.ledger.find((d) => d.day === 1)!;
    expect(day1.workMin).toBeGreaterThanOrEqual(state.player.workHours * 60);
    expect(day1.workMin).toBeLessThan(state.player.workHours * 60 + 60);
    expect(state.log.filter((e) => e.text === LINE).length).toBe(1);
    // Nightfall: asleep whatever the energy, with the marker still set.
    expect(calendar(state.minute).isNight).toBe(true);
    expect(state.task?.id).toBe("sleep");
    expect(state.player.restUntil).toBeDefined();
  });

  it("the marker points at the next dawn, and clears there so the runner works again", () => {
    const { state, world } = felling();
    advance(state, world, 15 * 60);
    const until = state.player.restUntil!;
    expect(until).toBeGreaterThan(state.minute);
    // Dawn is where minutesUntilDawn said it was when the marker was set: at or before the sunrise after it.
    const dawnCal = calendar(until);
    expect(Math.abs(dawnCal.hour - dawnCal.sunrise)).toBeLessThan(0.02);
    // Step to an hour past that dawn: marker gone, day 2's count fresh, and the grind back on.
    advance(state, world, until - state.minute + 60);
    expect(state.player.restUntil).toBeUndefined();
    expect(spentNow(state)).toBe(false);
    expect(today(state).workMin).toBeLessThan(120);
    expect(state.intent?.need ?? null).not.toBe("spent");
    expect(state.task).not.toBeNull();
    expect(["chop", "walk", "travel", "haul", "split"]).toContain(state.task!.id);
  });

  it("spentNow sets the marker once at the cap and logs once", () => {
    const { state } = newGame(1);
    today(state).workMin = state.player.workHours * 60;
    expect(spentNow(state)).toBe(true);
    const until = state.player.restUntil!;
    expect(until).toBe(state.minute + minutesUntilDawn(state.minute, state.startDoy));
    expect(spentNow(state)).toBe(true);
    expect(state.player.restUntil).toBe(until);
    expect(state.log.filter((e) => e.text === LINE).length).toBe(1);
    state.minute = until;
    expect(spentNow(state)).toBe(false);
    expect(state.player.restUntil).toBeUndefined();
  });

  it("a chop started by hand has no intent and keeps going past ten hours", () => {
    const { state, world } = newGame(17);
    kitOut(state, world);
    state.player.energy = 100;
    today(state).workMin = 11 * 60;
    const cal = calendar(state.minute);
    expect(startTask(state, world, cal, "chop", undefined, true)).toBe(true);
    expect(state.intent).toBeNull();
    advance(state, world, 30);
    expect(state.task?.id).toBe("chop");
    expect(state.player.restUntil).toBeUndefined();
    expect(START_MINUTE_OF_DAY).toBe(480);
  });

  it("a spent body drinks its fill before it sits down for the evening", () => {
    const { state, world } = felling();
    const it = state.intent!;
    workedTheDay(state);
    placeAtSpot(state, world, state.player.region, "shore");
    state.player.water = 1.5;
    expect(state.player.water).toBeLessThan(WATER_FULL - 0.5);
    expect(currentNeed(state, world, calendar(state.minute), it)).toBe("thirsty");
    expect(drink(state, world)).toBe(true);
    expect(state.player.water).toBe(WATER_FULL);
    expect(currentNeed(state, world, calendar(state.minute), it)).toBe("spent");
  });

  it("at night a rested spent body gets up to drink, and goes to bed once it is full", () => {
    const { state, world } = felling();
    const it = state.intent!;
    workedTheDay(state);
    placeAtSpot(state, world, state.player.region, "shore");
    state.minute = calmNight(state);
    state.player.energy = 100;
    expect(state.player.energy).toBeGreaterThanOrEqual(NIGHT_SLEEP_UNDER);
    state.player.water = THIRSTY_L / 2;
    expect(currentNeed(state, world, calendar(state.minute), it)).toBe("thirsty");
    state.player.water = WATER_FULL;
    expect(currentNeed(state, world, calendar(state.minute), it)).toBe("sleep");
  });

  it("a sleep already in progress lets go by day once the body is rested, but not by night or while it is tired", () => {
    const { state, world } = felling();
    const it = state.intent!;
    it.need = "sleep";
    state.minute = 25 * 60; // day 2, 09:00: a full day after the 08:00 day-1 start.
    let cal = calendar(state.minute);
    expect(cal.hour).toBe(9);
    expect(cal.isNight).toBe(false);
    state.player.energy = 100;
    expect(currentNeed(state, world, cal, it)).not.toBe("sleep");
    // Still tired, still daylight: the sticky clause's other exit is energy, not the clock.
    state.player.energy = 40;
    expect(currentNeed(state, world, cal, it)).toBe("sleep");
    // Rested again, but now night: the clock keeps it.
    state.player.energy = 100;
    state.minute = 14 * 60; // 22:00 on day 1.
    cal = calendar(state.minute);
    expect(cal.isNight).toBe(true);
    expect(currentNeed(state, world, cal, it)).toBe("sleep");
  });

  it("a sleep set aside clears the sleep need, so the next minute decides afresh", () => {
    const { state, world } = felling();
    const it = state.intent!;
    const cal = calendar(state.minute);
    expect(beginTask(state, world, cal, "sleep")).toBe(true);
    it.need = "sleep";
    setAside(state, world);
    expect(state.task).toBeNull();
    expect(it.need).toBeNull();
    // Rested, watered and in daylight: nothing sends this body back to bed.
    state.player.energy = 100;
    state.player.water = WATER_FULL;
    expect(currentNeed(state, world, calendar(state.minute), it)).not.toBe("sleep");
  });
});

describe("checking the snares", () => {
  it("a catch waiting and the heath in reach is a chore by day, and it ends on arrival", () => {
    const { state, world } = felling();
    const st = regionState(state, world, state.player.region);
    const heath = spotOf(regionAt(world, state.player.region), "heath")!.cell;
    expect(snaresWaiting(state, world, calendar(state.minute))).toBeNull();
    st.snareCatch = { count: 2, age: 0 };
    expect(snaresWaiting(state, world, calendar(state.minute))).toBe(heath);
    advance(state, world, 1);
    expect(state.intent?.need).toBe("snares");
    expect(state.intent?.step).toContain("check the snares");
    // Walk there: the catch comes with you and the chore is over.
    for (let m = 0; m < 600 && st.snareCatch.count > 0; m += 15) advance(state, world, 15);
    expect(st.snareCatch.count).toBe(0);
    expect(state.intent?.need ?? null).not.toBe("snares");
    expect(state.log.some((e) => /hares? in the snares/.test(e.text))).toBe(true);
  });

  it("the chore waits for daylight and yields to thirst", () => {
    const { state, world } = felling();
    const st = regionState(state, world, state.player.region);
    st.snareCatch = { count: 1, age: 0 };
    state.minute = 14 * 60; // 22:00
    const night = calendar(state.minute);
    expect(night.isNight).toBe(true);
    expect(snaresWaiting(state, world, night)).toBeNull();
    state.minute = 0;
    state.player.water = 0.5;
    state.player.energy = 100;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("thirsty");
  });
});
