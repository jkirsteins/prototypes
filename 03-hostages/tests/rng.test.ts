import { describe, it, expect } from "vitest";
import { createRng, nextInt, shuffle } from "../src/rng";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [nextInt(a, 100), nextInt(a, 100), nextInt(a, 100)];
    const seqB = [nextInt(b, 100), nextInt(b, 100), nextInt(b, 100)];
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextInt(a, 1000)).not.toBe(nextInt(b, 1000));
  });

  it("stays in range", () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i += 1) {
      const value = nextInt(rng, 5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(5);
    }
  });

  it("shuffles without mutating the input and keeps every element", () => {
    const rng = createRng(9);
    const input = ["a", "b", "c", "d", "e"];
    const out = shuffle(rng, input);
    expect(input).toEqual(["a", "b", "c", "d", "e"]);
    expect([...out].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("shuffles reproducibly", () => {
    const one = shuffle(createRng(3), ["a", "b", "c", "d", "e", "f"]);
    const two = shuffle(createRng(3), ["a", "b", "c", "d", "e", "f"]);
    expect(one).toEqual(two);
  });
});
