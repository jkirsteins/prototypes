import { describe, it, expect } from "vitest";
import { count, plural } from "../src/plural";

describe("count", () => {
  it("agrees the noun with the number", () => {
    expect(count(1, "land")).toBe("1 land");
    expect(count(2, "land")).toBe("2 lands");
  });

  /** Zero is plural in English, and the ternaries this replaced all wrote
   *  `n === 1`, so they already agreed - worth pinning so a future `n <= 1`
   *  cannot slip in. */
  it("treats zero as plural", () => {
    expect(count(0, "pack")).toBe("0 packs");
  });

  it("takes an explicit plural for anything the -s rule misses", () => {
    expect(count(1, "vassal", "vassals")).toBe("1 vassal");
    expect(count(3, "person", "people")).toBe("3 people");
  });
});

describe("plural", () => {
  it("picks the form without printing the number", () => {
    expect(plural(1, "is", "are")).toBe("is");
    expect(plural(2, "is", "are")).toBe("are");
    expect(plural(0, "is", "are")).toBe("are");
  });

  /** Generic on purpose: the round summary picks between a finished heading
   *  and a function of the count, not just between two words. */
  it("is not restricted to strings", () => {
    expect(plural(2, 10, 20)).toBe(20);
  });
});
