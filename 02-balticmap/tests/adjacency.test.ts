import { describe, expect, it } from "vitest";
import { hopsBetween } from "../src/adjacency";

describe("hopsBetween", () => {
  // a - b - c - d - e in a line, plus f attached to nothing.
  const LINE: Record<string, string[]> = {
    a: ["b"], b: ["a", "c"], c: ["b", "d"], d: ["c", "e"], e: ["d"], f: [],
  };

  it("counts a neighbour as one hop", () => {
    expect(hopsBetween(LINE, "a", "b", 3)).toBe(1);
  });

  it("counts the lands crossed, not the lands passed through", () => {
    expect(hopsBetween(LINE, "a", "c", 3)).toBe(2);
    expect(hopsBetween(LINE, "a", "d", 3)).toBe(3);
  });

  it("gives up past the maximum rather than walking the whole map", () => {
    expect(hopsBetween(LINE, "a", "e", 3)).toBeNull();
  });

  it("says nothing for a land with no path to it", () => {
    expect(hopsBetween(LINE, "a", "f", 3)).toBeNull();
  });

  it("is zero hops to itself, which is not a march anybody can declare", () => {
    expect(hopsBetween(LINE, "a", "a", 3)).toBe(0);
  });
});
