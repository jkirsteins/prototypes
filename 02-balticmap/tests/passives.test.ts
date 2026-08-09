import { describe, it, expect } from "vitest";
import {
  addPassive, damageAfterTerrain, hasPassive, PASSIVES, passivesOn, playsTurns,
  QUIET_PASSIVES, rollTerrain, seedPassives, stripOnCapture,
  TERRAIN_ELIGIBILITY, type Passives,
} from "../src/passives";
import { seededRng } from "../src/sim";
import data from "../src/data/map.json";

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

describe("terrain eligibility", () => {
  it("names only real lands and only statuses that survive capture", () => {
    const lands = new Set(data.factions.map((f) => f.id));
    for (const [land, ids] of Object.entries(TERRAIN_ELIGIBILITY)) {
      expect(lands.has(land), land).toBe(true);
      expect(ids.length, land).toBeGreaterThan(0);
      for (const id of ids) {
        expect(PASSIVES[id], `${land}/${id}`).toBeDefined();
        expect(PASSIVES[id].strippedOnCapture, `${land}/${id}`).toBe(false);
      }
    }
  });

  it("rolls the same terrain twice from the same seed", () => {
    const ids = Object.keys(TERRAIN_ELIGIBILITY);
    expect(rollTerrain(ids, seededRng(3))).toEqual(rollTerrain(ids, seededRng(3)));
  });

  it("never gives a land a status it is not eligible for", () => {
    const rolled = rollTerrain(["selonians", "osilians", "jersikans"], seededRng(9));
    for (const [land, carried] of Object.entries(rolled)) {
      for (const id of carried) {
        expect(TERRAIN_ELIGIBILITY[land] ?? [], land).toContain(id);
      }
    }
  });
});

describe("seedPassives", () => {
  it("quiets every land that does not act, and none that does", () => {
    const lands = ["selonians", "jersikans", "sakalans"];
    const seeded = seedPassives(lands, ["selonians"], seededRng(1));
    expect(playsTurns(seeded, "selonians")).toBe(true);
    expect(playsTurns(seeded, "jersikans")).toBe(false);
    expect(hasPassive(seeded, "jersikans", "wild-lands")).toBe(true);
    expect(hasPassive(seeded, "selonians", "no-successor")).toBe(false);
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
