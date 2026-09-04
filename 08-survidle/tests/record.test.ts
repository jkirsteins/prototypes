import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { current, worldDate } from "../src/sim/record";

describe("the life record", () => {
  it("starts a new game with one survivor, landed on the start day of year 1", () => {
    const { state } = newGame(8);
    expect(state.survivors).toHaveLength(1);
    const rec = current(state);
    expect(rec.index).toBe(1);
    expect(rec.landed).toEqual({ year: 1, doy: 90 });
    expect(rec.gapDays).toBe(0);
    expect(rec.events).toEqual([]);
    expect(rec.died).toBeNull();
    expect(state.year).toBe(1);
  });

  it("gives a world date for any minute of the life, stepping the year past 31 December", () => {
    const { state } = newGame(8, 360);
    expect(worldDate(state, 0)).toEqual({ year: 1, doy: 360 });
    expect(worldDate(state, 10 * 1440)).toEqual({ year: 2, doy: 5 });
    state.year = 3;
    expect(worldDate(state, 10 * 1440)).toEqual({ year: 4, doy: 5 });
  });
});
