import { describe, it, expect } from "vitest";
import {
  addPassive, damageAfterTerrain, hasPassive, PASSIVES, passivesOn, playsTurns,
  QUIET_PASSIVES, stripOnCapture, type Passives,
} from "../src/passives";

describe("the passive table", () => {
  it("gives every status a name, a line of text and a capture rule", () => {
    for (const [id, def] of Object.entries(PASSIVES)) {
      expect(def.id, id).toBe(id);
      expect(def.name.length, id).toBeGreaterThan(0);
      expect(def.text.length, id).toBeGreaterThan(0);
      expect(typeof def.strippedOnCapture, id).toBe("boolean");
    }
  });

  it("strips exactly the two statuses that describe an unheld land", () => {
    const stripped = Object.values(PASSIVES)
      .filter((d) => d.strippedOnCapture)
      .map((d) => d.id)
      .sort();
    expect(stripped).toEqual(["no-successor", "wild-lands"]);
  });

  it("keeps a taken land quiet - staying quiet is not about who holds it", () => {
    expect(PASSIVES["keeps-to-itself"].strippedOnCapture).toBe(false);
    expect(QUIET_PASSIVES).toContain("keeps-to-itself");
  });
});

describe("the passive store", () => {
  it("reads an absent land as carrying nothing", () => {
    expect(passivesOn({}, "selija")).toEqual([]);
    expect(hasPassive({}, "selija", "wild-lands")).toBe(false);
  });

  it("adds a status once", () => {
    const once = addPassive({}, "selija", "wild-lands");
    expect(addPassive(once, "selija", "wild-lands")).toBe(once);
    expect(passivesOn(once, "selija")).toEqual(["wild-lands"]);
  });

  it("keeps the ground and the silence, and drops the rest, on capture", () => {
    let p: Passives = {};
    for (const id of ["keeps-to-itself", "wild-lands", "no-successor", "hill-country"]) {
      p = addPassive(p, "selija", id);
    }
    expect(passivesOn(stripOnCapture(p, "selija"), "selija"))
      .toEqual(["keeps-to-itself", "hill-country"]);
  });

  it("drops the key entirely when nothing survives capture", () => {
    const p = addPassive(addPassive({}, "selija", "wild-lands"), "selija", "no-successor");
    expect(stripOnCapture(p, "selija")).toEqual({});
  });
});

describe("playsTurns", () => {
  it("is false only for a faction that keeps to itself", () => {
    expect(playsTurns({}, "selonians")).toBe(true);
    expect(playsTurns({ selija: ["wild-lands"] }, "selija")).toBe(true);
    expect(playsTurns({ selija: ["keeps-to-itself"] }, "selija")).toBe(false);
  });
});

describe("damageAfterTerrain", () => {
  it("takes a quarter off an attack on hill country", () => {
    const view = { passives: addPassive({}, "selija", "hill-country") };
    expect(damageAfterTerrain(view, "selija", 4)).toBe(3);
  });

  it("leaves flat ground alone", () => {
    expect(damageAfterTerrain({ passives: {} }, "zemgale", 4)).toBe(4);
  });
});
