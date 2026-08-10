import { describe, it, expect, afterEach } from "vitest";
import {
  addPassive, BUREAUCRACY_PER_ARMY, damageAfterTerrain,
  hasPassive, PASSIVES, passivesOn, perArmyOn, playsTurns, QUIET_PASSIVES,
  quietPassives, rollTerrain, seedTerrain, stripOnCapture,
  type Passives,
} from "../src/passives";
import { armyCapFor, DEFENSE_PER_ARMY, turnipThresholdFor } from "../src/defense";
import { seededRng, SIM_DEFENSE_MAX } from "../src/sim";
import data from "../src/data/baltic.json";
import iberiaData from "../src/data/iberia.json";
import { activeRegion, DEFAULT_REGION, setActiveRegion } from "../src/regions";
import type { MapData } from "../src/types";

afterEach(() => setActiveRegion(DEFAULT_REGION));

describe("the passive table", () => {
  it("gives every status a name, a line of text and a capture rule", () => {
    for (const [id, def] of Object.entries(PASSIVES)) {
      expect(def.id, id).toBe(id);
      expect(def.name.length, id).toBeGreaterThan(0);
      expect(def.text.length, id).toBeGreaterThan(0);
      expect(typeof def.strippedOnCapture, id).toBe("boolean");
    }
  });

  it("strips exactly the statuses that describe an unheld land", () => {
    const stripped = Object.values(PASSIVES)
      .filter((d) => d.strippedOnCapture)
      .map((d) => d.id)
      .sort();
    expect(stripped).toEqual(["keeps-to-itself", "no-successor", "wild-lands"]);
  });

  it("wakes a taken land up - the quiet set is exactly what capture strips", () => {
    // The whole quiet set goes on capture: its people join the game as their
    // new lord's vassal, with turns and a deck. That is also what makes "only
    // unheld lands raid on their own" a fact about the status rather than a
    // second rule written down somewhere.
    expect([...QUIET_PASSIVES].sort()).toEqual(
      Object.values(PASSIVES)
        .filter((d) => d.strippedOnCapture)
        .map((d) => d.id)
        .sort(),
    );
    expect(playsTurns(
      stripOnCapture({ selija: [...QUIET_PASSIVES] }, "selija"), "selija",
    )).toBe(true);
  });

  it("keeps the ground, which is not about who holds the land", () => {
    for (const id of ["hill-country", "river-trade", "burden-of-bureaucracy"]) {
      expect(PASSIVES[id].strippedOnCapture, id).toBe(false);
    }
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

  it("keeps the ground and drops the rest, on capture", () => {
    let p: Passives = {};
    for (const id of ["keeps-to-itself", "wild-lands", "no-successor", "hill-country"]) {
      p = addPassive(p, "selija", id);
    }
    expect(passivesOn(stripOnCapture(p, "selija"), "selija"))
      .toEqual(["hill-country"]);
  });

  it("leaves a land carrying nothing strippable exactly as it was", () => {
    const p = addPassive({}, "selija", "river-trade");
    expect(stripOnCapture(p, "selija")).toBe(p);
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
    for (const [land, ids] of Object.entries(activeRegion().terrainEligibility)) {
      expect(lands.has(land), land).toBe(true);
      expect(ids.length, land).toBeGreaterThan(0);
      for (const id of ids) {
        expect(PASSIVES[id], `${land}/${id}`).toBeDefined();
        expect(PASSIVES[id].strippedOnCapture, `${land}/${id}`).toBe(false);
      }
    }
  });

  it("rolls the same terrain twice from the same seed", () => {
    const ids = Object.keys(activeRegion().terrainEligibility);
    expect(rollTerrain(ids, seededRng(3))).toEqual(rollTerrain(ids, seededRng(3)));
  });

  it("never gives a land a status it is not eligible for", () => {
    const rolled = rollTerrain(["selonians", "osilians", "jersikans"], seededRng(9));
    for (const [land, carried] of Object.entries(rolled)) {
      for (const id of carried) {
        expect(activeRegion().terrainEligibility[land] ?? [], land).toContain(id);
      }
    }
  });

  it("terrain tables live on the region and name real factions", () => {
    const region = activeRegion();
    const factionIds = new Set((data as MapData).factions.map((f) => f.id));
    for (const id of Object.keys(region.terrainEligibility)) {
      expect(factionIds.has(id)).toBe(true);
    }
    expect(region.bureaucracyLands).toEqual([
      "eastern-aukstaitian-confederacy", "samogitian-confederacy", "lietuva",
    ]);
  });
});

describe("seedTerrain", () => {
  it("carries the named burden as well as the roll", () => {
    const lands = [...activeRegion().bureaucracyLands, "selonians"];
    const ground = seedTerrain(lands, seededRng(1));
    for (const land of activeRegion().bureaucracyLands) {
      expect(hasPassive(ground, land, "burden-of-bureaucracy"), land).toBe(true);
    }
    expect(hasPassive(ground, "selonians", "burden-of-bureaucracy")).toBe(false);
  });

  it("says nothing about who acts - that is not the ground's question", () => {
    const ground = seedTerrain(["selonians", "jersikans"], seededRng(1));
    for (const carried of Object.values(ground)) {
      for (const id of QUIET_PASSIVES) expect(carried).not.toContain(id);
    }
  });

  it("reads the burden off the ACTIVE region, not the Baltic table", () => {
    setActiveRegion("iberia");
    const iberiaFactionIds = (iberiaData as MapData).factions.map((f) => f.id);
    const ground = seedTerrain(iberiaFactionIds, seededRng(1));
    expect(hasPassive(ground, "umayyads", "burden-of-bureaucracy")).toBe(true);
    expect(hasPassive(ground, "selonians", "burden-of-bureaucracy")).toBe(false);
  });
});

describe("quietPassives", () => {
  it("quiets every land that does not act, and none that does", () => {
    const lands = ["selonians", "jersikans", "sakalans"];
    const seeded = quietPassives({}, lands, ["selonians"]);
    expect(playsTurns(seeded, "selonians")).toBe(true);
    expect(playsTurns(seeded, "jersikans")).toBe(false);
    expect(hasPassive(seeded, "jersikans", "wild-lands")).toBe(true);
    expect(hasPassive(seeded, "selonians", "no-successor")).toBe(false);
  });

  it("leaves the ground it was handed alone", () => {
    const ground = addPassive({}, "selonians", "hill-country");
    const seeded = quietPassives(ground, ["selonians", "jersikans"], ["jersikans"]);
    expect(hasPassive(seeded, "selonians", "hill-country")).toBe(true);
    expect(hasPassive(seeded, "selonians", "keeps-to-itself")).toBe(true);
  });
});

describe("perArmyOn", () => {
  it("asks 4 defense per army of a land under the burden, 3 of everything else", () => {
    const burdened = addPassive({}, "lietuva", "burden-of-bureaucracy");
    expect(perArmyOn(burdened, "lietuva")).toBe(BUREAUCRACY_PER_ARMY);
    expect(perArmyOn(burdened, "selonians")).toBe(DEFENSE_PER_ARMY);
    expect(BUREAUCRACY_PER_ARMY).toBeGreaterThan(DEFENSE_PER_ARMY);
  });

  it("costs the three biggest lands an army at their own shipped ceilings", () => {
    // The point of the burden: at the map's own divisor these three out-muster
    // a realm, so the test is that the divisor actually removes an army from
    // each of them rather than that the constant reads what it reads.
    const ground = seedTerrain([...activeRegion().bureaucracyLands], seededRng(1));
    for (const land of activeRegion().bureaucracyLands) {
      const max = SIM_DEFENSE_MAX[land];
      expect(max, land).toBeGreaterThan(0);
      expect(armyCapFor(max, perArmyOn(ground, land)), land)
        .toBeLessThan(armyCapFor(max));
    }
  });

  it("says nothing about harvests - the turnip threshold reads the ceiling alone", () => {
    // Slowing a big land's seasons as well would punish it twice for its size,
    // so `turnipThresholdFor` takes no passives at all.
    expect(turnipThresholdFor(12)).toBe(4);
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

  it("rounds to a whole number a badge can print", () => {
    const view = { passives: addPassive({}, "selija", "hill-country") };
    // 6 * 0.75 = 4.5, and Math.round takes it up.
    expect(damageAfterTerrain(view, "selija", 6)).toBe(5);
    expect(damageAfterTerrain(view, "selija", 10)).toBe(8);
  });

  it("never lets a hill hit harder than the plain would", () => {
    const view = { passives: addPassive({}, "selija", "hill-country") };
    // A Great raid's half point rounds UP to 1, which is more than came in -
    // the min is what stops a reduction turning into a bonus.
    expect(damageAfterTerrain(view, "selija", 0.5)).toBe(0.5);
    for (const damage of [0.5, 1, 1.5, 2, 3, 4.5, 7]) {
      expect(damageAfterTerrain(view, "selija", damage), `${damage}`)
        .toBeLessThanOrEqual(damage);
    }
  });

  it("never rounds a real attack away to nothing", () => {
    const view = { passives: addPassive({}, "selija", "hill-country") };
    expect(damageAfterTerrain(view, "selija", 1)).toBe(1);
    expect(damageAfterTerrain(view, "selija", 2)).toBe(2);
  });
});
