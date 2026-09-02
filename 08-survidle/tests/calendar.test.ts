import { describe, expect, it } from "vitest";
import { calendar, daylight, fmtDate, minutesUntilDawn } from "../src/sim/calendar";

describe("calendar", () => {
  it("starts on 1 April at 08:00 in spring", () => {
    const c = calendar(0);
    expect(c.day).toBe(1);
    expect(c.hour).toBeCloseTo(8);
    expect(fmtDate(c)).toBe("1 Apr");
    expect(c.season).toBe("spring");
  });

  it("counts days and wraps the year", () => {
    const c = calendar(1440 * 275);
    expect(c.day).toBe(276);
    expect(c.month).toBe(0);
    expect(c.season).toBe("winter");
  });

  it("has long midsummer days and short midwinter days at 62 N", () => {
    expect(daylight(172)).toBeGreaterThan(18.5);
    expect(daylight(172)).toBeLessThan(21);
    expect(daylight(355)).toBeGreaterThan(4);
    expect(daylight(355)).toBeLessThan(6.5);
  });

  it("knows night from day", () => {
    const noon = calendar(4 * 60);
    expect(noon.isNight).toBe(false);
    const midnight = calendar(16 * 60);
    expect(midnight.isNight).toBe(true);
  });

  it("finds the next dawn", () => {
    const m = 16 * 60;
    const dawn = minutesUntilDawn(m);
    const then = calendar(m + dawn);
    expect(then.hour).toBeCloseTo(then.sunrise, 1);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(1440);
  });
});
