import { describe, expect, it } from "vitest";
import { entry, epitaph, epitaphTail, since } from "../src/sim/epitaph";
import { newRecord } from "../src/sim/record";
import { medianPerson } from "../src/sim/person";
import { runReference } from "../src/sim/reference";
import type { LifeRecord } from "../src/sim/types";

function rec(): LifeRecord {
  const r = newRecord(1, { first: "Eirik", last: "Kalnins" }, { year: 1, doy: 90 }, 0, medianPerson("m"));
  r.events.push({ kind: "entered", region: "Hareskog", day: 1, date: { year: 1, doy: 90 } });
  r.events.push({ kind: "built", structure: "firePit", day: 2, date: { year: 1, doy: 91 } });
  r.events.push({ kind: "firstKill", species: "hare", day: 5, date: { year: 1, doy: 94 } });
  r.events.push({ kind: "threshold", id: "firstFrost", day: 83, date: { year: 1, doy: 172 } });
  r.worst = { day: 84, warmth: 12, wolves: true };
  r.died = {
    day: 87, date: { year: 1, doy: 176 }, cause: "froze", region: "Hareskog", kmFromCamp: 2.1,
    packFoodKg: 0.4, campFoodKcal: 0, campFirewoodKg: 6, after: { threshold: "firstFrost", nights: 4 },
  };
  return r;
}

describe("the epitaph", () => {
  it("is one line of real quantities", () => {
    expect(epitaph(rec())).toBe(
      "Eirik Kalnins. Day 87. Died of cold on the fourth night after the first frost, 2.1 km from camp, with 400 g of dried meat in the pack and 6 kg of firewood at camp.",
    );
  });

  it("writes the night as a proper ordinal past ten, not 'the 21th'", () => {
    const cases: [number, string][] = [[11, "11th"], [21, "21st"], [22, "22nd"], [23, "23rd"], [24, "24th"], [101, "101st"]];
    for (const [nights, word] of cases) {
      const r = rec();
      r.died = { ...r.died!, after: { threshold: "firstFrost", nights } };
      expect(epitaphTail(r)).toContain(`on the ${word} night after`);
    }
  });

  it("says at camp and on day N when there is nothing else to say", () => {
    const r = rec();
    r.died = { ...r.died!, kmFromCamp: 0.1, after: null, packFoodKg: 0, campFirewoodKg: 0 };
    expect(epitaph(r)).toBe("Eirik Kalnins. Day 87. Died of cold at camp, with nothing in the pack and no firewood at camp.");
  });

  it("writes the entry in date order, at most twelve lines, keeping the epitaph and the cause", () => {
    const lines = entry(rec());
    expect(lines[0]).toBe(epitaph(rec()));
    expect(lines).toContain("Day 5. First mountain hare.");
    expect(lines).toContain("Day 83. First frost.");
    expect(lines).toContain("Day 84. The worst night: warmth 12, wolves at the fire.");
    expect(lines[lines.length - 1]).toBe("Day 87. Died of cold.");
    expect(lines.length).toBeLessThanOrEqual(12);
  });

  it("says what happened since a day, for the away report", () => {
    expect(since(rec(), 80)).toBe("First frost on day 83; the worst night on day 84.");
    expect(since(rec(), 88)).toBe("Nothing worth telling.");
  });

  it("is a living survivor's entry without a tombstone line", () => {
    const r = rec();
    r.died = null;
    expect(entry(r)[0]).toBe("Eirik Kalnins. Landed 1 April, year 1.");
  });

  it("is deterministic for the reference seeds; trap yields more with larger capacities", () => {
    // Inline snapshots fill themselves on the first run; a later change to the sim that moves a death shows here.
    // What these two deaths rest on: a shore's fish capacity is biomass per hectare over mean weight, tens of
    // thousands per km2, so a trap and a spear both find fish; a hunted small-game range refills from its
    // neighbours as well as from the herd migration, so the snares keep finding hares; a pole rack holds 40 kg
    // and a second rack another 40; the named hunts are grinds below the hut group rather than keeps, so raw meat
    // at camp never blocks a keep the hang grind is clearing; a soaked body under 5 C reads cold at warmth 45, so
    // the early days buy warmth at the fire; and the 400 kg woodpile keep is open only from 1 September to
    // 1 April, which a 1 April start reaches in neither of the sixty-day lives below. The felling grind at
    // the end of the list is a 150-log keep shut until 1 September and placed beside the woodpile keep, so a
    // spring runner with nothing else able to run rests instead of felling; and stone is wanted twice, a
    // once job for eight at the opening and a keep of eight as the restock below the clothing block.
    // Both seeds starve at camp rather than freezing or dying on the trail: the reference
    // player's opening grinds fill firewood and food ahead of the cold, so the woodpile
    // outlasts the larder and the run ends on hunger with wood still banked (37 kg for seed
    // 17, 20 kg for seed 19). Frozen lingon under the snow open a berries row through the
    // April start itself, ahead of the wood-first grind order, so the larder empties where
    // the ledger above finds it. The larder these seeds empty is meat, berries, roots, eggs
    // and bark flour together, and both still starve at camp with wood banked.
    expect(epitaph(runReference(17, 60).record)).toMatchInlineSnapshot(`"Aldona Niemi. Day 24. Starved at camp, with nothing in the pack and 37 kg of firewood at camp."`);
    expect(epitaph(runReference(19, 60).record)).toMatchInlineSnapshot(`"Astrid Dahl. Day 24. Starved at camp, with nothing in the pack and 20 kg of firewood at camp."`);
  });

  it("writes the first snare set as its own line", () => {
    const r = rec();
    r.events.push({ kind: "built", structure: "snare", day: 3, date: { year: 1, doy: 92 } });
    expect(entry(r)).toContain("Day 3. Set the first snare.");
  });
});
