import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar, fmtDate, minutesUntilDawn, START_DOY } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { setUpReference } from "../src/sim/reference";
import { deserialize, serialize } from "../src/sim/save";
import { berrySeason } from "../src/sim/tasks";

describe("a start day", () => {
  it("the calendar reads the given day of year at 08:00 on day 1, April by default", () => {
    expect(calendar(0).dayOfYear).toBe(START_DOY);
    expect(fmtDate(calendar(0))).toBe("1 Apr");
    const july = calendar(0, 200);
    expect(july.day).toBe(1);
    expect(july.hour).toBeCloseTo(8, 6);
    expect(july.dayOfYear).toBe(200);
    expect(fmtDate(july)).toBe("20 Jul");
    expect(fmtDate(calendar(0, 235))).toBe("24 Aug");
    expect(calendar(3 * 1440, 200).day).toBe(4);
    expect(calendar(3 * 1440, 200).dayOfYear).toBe(203);
  });

  it("dawn is read on the start day's daylight", () => {
    // A July dawn at 62 N comes about four in the morning; an April one near six thirty.
    expect(minutesUntilDawn(13 * 60, 200)).toBeLessThan(minutesUntilDawn(13 * 60));
  });

  it("a July game opens with no ice and no snow, in berry season, and fires no catch-up roll", () => {
    const { state, world } = newGame(17, 200);
    expect(state.startDoy).toBe(200);
    expect(state.weather.iceCm).toBe(0);
    expect(state.weather.snowCm).toBe(0);
    expect(berrySeason(calendar(state.minute, state.startDoy))).toBe(true);
    expect(state.log.some((e) => e.text.startsWith("20 Jul."))).toBe(true);
    advance(state, world, 60);
    expect(state.lastDay).toBe(0);
    expect(state.weather.rolledDay).toBe(0);
    expect(calendar(state.minute, state.startDoy).day).toBe(1);
  });

  it("an April game is unchanged: three centimetres of snow in the shade", () => {
    const { state } = newGame(17);
    expect(state.startDoy).toBe(START_DOY);
    expect(state.weather.snowCm).toBe(3);
    expect(state.log.some((e) => e.text.startsWith("1 April."))).toBe(true);
  });

  it("the reference set-up takes a start day, and a save without one loads as April", () => {
    const ref = setUpReference(17, false, 235);
    expect(ref.state.startDoy).toBe(235);
    const raw = JSON.parse(serialize(ref.state));
    delete raw.state.startDoy;
    expect(deserialize(JSON.stringify(raw))!.state.startDoy).toBe(START_DOY);
  });
});
