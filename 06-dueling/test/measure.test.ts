import { describe, expect, test } from "vitest";
import { zoneFor } from "../src/combat/measure";
import { WEAPONS } from "../src/combat/weapons";

describe("measure zones are per-weapon and asymmetric", () => {
  const ls = WEAPONS.longsword; // reach 95, step 34
  const rp = WEAPONS.rapier;    // reach 115, step 28

  test("boundaries for longsword", () => {
    expect(zoneFor(95, ls)).toBe("narrow");
    expect(zoneFor(95.1, ls)).toBe("wide");
    expect(zoneFor(129, ls)).toBe("wide");
    expect(zoneFor(129.1, ls)).toBe("out");
  });

  test("asymmetry: a gap can be narrow for rapier and wide for longsword", () => {
    expect(zoneFor(110, rp)).toBe("narrow");
    expect(zoneFor(110, ls)).toBe("wide");
  });
});
