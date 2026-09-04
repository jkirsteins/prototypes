import { describe, expect, it } from "vitest";
import { dayNumber, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { creditBurn, creditEaten, creditTime, creditYield, type DayLedger, emptyBurn, emptyYield, today, weekBefore, YIELD_SOURCES } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";

describe("the day number", () => {
  it("is 1 at the start, 2 from midnight of the first night", () => {
    expect(dayNumber(0)).toBe(1);
    expect(dayNumber(24 * 60 - START_MINUTE_OF_DAY - 1)).toBe(1);
    expect(dayNumber(24 * 60 - START_MINUTE_OF_DAY)).toBe(2);
    expect(dayNumber(25 * 1440)).toBe(26);
  });
});

describe("the ledger", () => {
  it("starts with one record for day 1 and pushes a fresh one when the day changes", () => {
    const { state } = newGame(1);
    expect(state.ledger.length).toBe(1);
    expect(state.ledger[0].day).toBe(1);
    expect(today(state)).toBe(state.ledger[0]);
    state.minute = 24 * 60 - START_MINUTE_OF_DAY;
    const d2 = today(state);
    expect(d2.day).toBe(2);
    expect(state.ledger.length).toBe(2);
    expect(today(state)).toBe(d2);
  });

  it("credits yield, intake, burn and time onto today's record", () => {
    const { state } = newGame(1);
    const kit = today(state).yield.kit;
    creditYield(state, "fish", 300);
    creditYield(state, "fish", 200);
    creditEaten(state, 525);
    creditBurn(state, { base: 70, activity: 30, walk: 0, cold: 10, sick: 0 });
    creditBurn(state, { base: 70, activity: 0, walk: 230, cold: 0, sick: 5 });
    creditTime(state, "sleep", 60);
    creditTime(state, "work", 90);
    creditTime(state, "idle", 30);
    const d = today(state);
    expect(d.yield).toEqual({ ...emptyYield(), fish: 500, kit });
    expect(d.eaten).toBe(525);
    expect(d.burn).toEqual({ base: 140, activity: 30, walk: 230, cold: 10, sick: 5 });
    expect(d.sleepMin).toBe(60);
    expect(d.workMin).toBe(90);
  });

  it("averages the seven records before a day, and reports how many it found", () => {
    const ledger: DayLedger[] = [];
    for (let day = 1; day <= 10; day++) {
      ledger.push({ day, yield: { ...emptyYield(), fish: day * 100 }, eaten: 50, burn: { ...emptyBurn(), base: 1680, cold: day }, sleepMin: 480, workMin: 600 });
    }
    const w = weekBefore(ledger, 9);
    expect(w.days).toBe(7);
    // Days 2 to 8: fish 200..800 averages 500; cold 2..8 averages 5.
    expect(w.yield.fish).toBeCloseTo(500, 6);
    expect(w.burn.cold).toBeCloseTo(5, 6);
    expect(w.burn.base).toBe(1680);
    expect(w.eaten).toBe(50);
    expect(w.sleepMin).toBe(480);
    expect(w.workMin).toBe(600);
    const early = weekBefore(ledger, 3);
    expect(early.days).toBe(2);
    expect(early.yield.fish).toBeCloseTo(150, 6);
    const none = weekBefore(ledger, 1);
    expect(none.days).toBe(0);
    expect(none.yield.fish).toBe(0);
    expect(none.burn.base).toBe(0);
  });

  it("lists the five sources once each", () => {
    expect(YIELD_SOURCES).toEqual(["fish", "snare", "hunt", "berries", "kit"]);
  });

  it("a save from before the ledger loads with an empty ledger", () => {
    const { state } = newGame(1);
    const text = serialize(state);
    const raw = JSON.parse(text);
    delete raw.state.ledger;
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.ledger).toEqual([]);
  });
});
