import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { FIRST_NAMES, fmtName, LAST_NAMES, nameTaken, rollName } from "../src/sim/names";

describe("names", () => {
  it("draws from pools that mix Scandinavian and Baltic names", () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(FIRST_NAMES).toContain("Eirik");
    expect(FIRST_NAMES).toContain("Janis");
    expect(LAST_NAMES).toContain("Kalnins");
    expect(LAST_NAMES).toContain("Berg");
  });

  it("is deterministic per rng and never offers a taken name", () => {
    const a = rollName(new Rng(5), []);
    const b = rollName(new Rng(5), []);
    expect(a).toEqual(b);
    const c = rollName(new Rng(5), [a]);
    expect(nameTaken(c, [a])).toBe(false);
    expect(fmtName(a)).toBe(`${a.first} ${a.last}`);
  });
});
