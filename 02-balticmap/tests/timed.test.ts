import { describe, expect, it } from "vitest";
import { activeExpiry, sweepLapsed, timedActive, untilTurn } from "../src/timed";

describe("timedActive / activeExpiry", () => {
  it("runs strictly before the expiry turn and is over ON it", () => {
    expect(timedActive(5, 3)).toBe(true);
    expect(timedActive(5, 4)).toBe(true);
    expect(timedActive(5, 5)).toBe(false);
    expect(timedActive(5, 6)).toBe(false);
    expect(activeExpiry(5, 4)).toBe(5);
    expect(activeExpiry(5, 5)).toBeUndefined();
  });

  it("treats no status at all as inactive", () => {
    expect(timedActive(undefined, 1)).toBe(false);
    expect(activeExpiry(undefined, 1)).toBeUndefined();
  });
});

describe("sweepLapsed", () => {
  it("splits run-out entries from running ones", () => {
    const entries = { a: 3, b: 7, c: 5 };
    const { kept, lapsed } = sweepLapsed(entries, 5, (e) => e);
    expect(kept).toEqual({ b: 7 });
    expect(lapsed).toEqual([["a", 3], ["c", 5]]);
  });

  it("returns the input record itself when nothing lapsed", () => {
    const entries = { a: 9 };
    const { kept, lapsed } = sweepLapsed(entries, 5, (e) => e);
    expect(kept).toBe(entries);
    expect(lapsed).toEqual([]);
  });

  it("reads the expiry through the accessor for payload-carrying entries", () => {
    const entries = { x: { expiry: 4, against: ["y"] } };
    const { kept, lapsed } = sweepLapsed(entries, 4, (e) => e.expiry);
    expect(kept).toEqual({});
    expect(lapsed.map(([k]) => k)).toEqual(["x"]);
  });
});

describe("untilTurn", () => {
  it("is the one spelling every surface quotes", () => {
    expect(untilTurn(12)).toBe("until turn 12");
  });
});
