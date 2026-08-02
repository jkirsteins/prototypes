import { describe, expect, test } from "vitest";
import { zoneFor } from "../src/combat/measure";
import { WEAPONS } from "../src/combat/weapons";

describe("measure zones are per-weapon and asymmetric", () => {
  const ls = WEAPONS.longsword; // reach 200 cm, step 60 cm
  const rp = WEAPONS.rapier;    // reach 240 cm, step 50 cm

  test("boundaries for longsword", () => {
    expect(zoneFor(200, ls)).toBe("narrow");
    expect(zoneFor(200.1, ls)).toBe("wide");
    expect(zoneFor(260, ls)).toBe("wide");
    expect(zoneFor(260.1, ls)).toBe("out");
  });

  test("asymmetry: a gap can be narrow for rapier and wide for longsword", () => {
    expect(zoneFor(220, rp)).toBe("narrow");
    expect(zoneFor(220, ls)).toBe("wide");
  });
});
