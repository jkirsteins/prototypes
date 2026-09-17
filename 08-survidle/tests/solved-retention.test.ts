import { describe, expect, it } from "vitest";
import * as cache from "../src/world/solvecache";
import { solveWorld } from "../src/world/solve";

describe("browser solved-world ownership", () => {
  it("drops cached old seeds without invalidating the retained world's arrays", () => {
    const solved = solveWorld(1, 16, 16);
    cache.rememberSolved(solved, 101);
    cache.rememberSolved(solved, 102);
    const retain = (cache as unknown as { retainSolved?: (seed: number) => void }).retainSolved;
    expect(retain).toBeTypeOf("function");
    retain!(102);
    expect(cache.isRememberedSolved(101, solved)).toBe(false);
    expect(cache.isRememberedSolved(102, solved)).toBe(true);
    expect(solved.height.length).toBe(256);
  });
});
