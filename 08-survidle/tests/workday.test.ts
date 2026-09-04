import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { spentNow, WORK_HOURS_DEFAULT } from "../src/sim/body";
import { calendar, minutesUntilDawn, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { kitOut } from "../src/sim/reference";
import { deserialize, serialize } from "../src/sim/save";
import { startTask } from "../src/sim/tasks";

const LINE = "A day's work done. You rest by the fire.";

/** A kitted camp on seed 17 with one endless felling grind, the survivor fresh at 08:00. */
function felling() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  g.state.player.energy = 100;
  addOrder(g.state, g.world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  return g;
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
});
