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

  describe("on a graph that forks", () => {
    // Two ways from `hub` to `target`: the long way round through `long1` and
    // `long2`, and the short way through `short1`. The LONG branch is listed
    // first in `hub`'s neighbours deliberately - a walk that follows the first
    // edge it sees to the end, or that keeps whichever answer it found first,
    // reports 3 here and is wrong. A line fixture cannot tell those walks from
    // a breadth-first one, because on a line there is nothing to choose.
    const FORK: Record<string, string[]> = {
      hub: ["long1", "short1"],
      long1: ["hub", "long2"],
      long2: ["long1", "target"],
      short1: ["hub", "target"],
      target: ["long2", "short1"],
    };

    it("answers with the shortest path and not the first one found", () => {
      expect(hopsBetween(FORK, "hub", "target", 3)).toBe(2);
    });

    it("finds the short path even when the bound would exclude the long one", () => {
      expect(hopsBetween(FORK, "hub", "target", 2)).toBe(2);
    });

    it("still gives up when even the short path is past the bound", () => {
      expect(hopsBetween(FORK, "hub", "target", 1)).toBeNull();
    });
  });
});
