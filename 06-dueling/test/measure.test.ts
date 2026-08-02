import { describe, expect, test } from "vitest";
import { zoneFor } from "../src/combat/measure";
import { WEAPONS } from "../src/combat/weapons";
import { zoneLabelStyle } from "../src/render/draw";

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

describe("zone label style flags the landing band per fighter", () => {
  const tint = "#c9a227";

  test("narrow is green+bold for the player, red+bold for the AI", () => {
    expect(zoneLabelStyle("narrow", 0, tint)).toEqual({ color: "#57a55a", bold: true });
    expect(zoneLabelStyle("narrow", 1, "#4aa3df")).toEqual({ color: "#d64541", bold: true });
  });

  test("wide and out keep the fighter's tint, unbolded", () => {
    expect(zoneLabelStyle("wide", 0, tint)).toEqual({ color: tint, bold: false });
    expect(zoneLabelStyle("out", 1, "#4aa3df")).toEqual({ color: "#4aa3df", bold: false });
  });
});
