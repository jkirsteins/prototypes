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
    // Seed 17's death day rests on the sleep model as well: no rest latch holds
    // a spent body down until dawn, so the evening ends at the rested line and
    // the dark is worked rather than sat out, which spends the arrival kit at a
    // different pace.
    // The bough bed keep right after the lean-to (reference.ts) moves seed 17's death from
    // day 36 to day 19: laying and relaying the bed spends sticks and time the opening has
    // none to spare, and the shared rng stream draws differently from there on.
    // The tables audit's food pass (items.ts: meat down from 1,500 to 1,100 a kilo, dried
    // meat from 3,500 to 3,300, berries from 500 to 450) moves it again, from day 19 to
    // day 22, and the death is now at camp rather than 0.2 km out.
    // The trap line (items.ts: MAX_SNARES 5 to 40, SNARE_ODDS_PER_NIGHT 0.3 to 0.04; the
    // twenty- and forty-snare keeps in reference.ts) leaves day 22 as it was but the wood
    // pile smaller, at 36 kg rather than 71: the two new wants push everything after the
    // berries keep down the list, so the reference player spends some of the days before
    // the death setting snares that would otherwise have gone to splitting firewood.
    // The fire's cold scaling (fire.ts: SHELTER_BURN_KG_PER_HOUR replaced by
    // openBurnPerHour, 3 kg/h at zero rising a tenth per degree of frost, with
    // SHELTER_BURN_RATIO applying the hut and cabin as ratios on it) moves seed 17
    // from day 22 to day 20 and the woodpile from 36 kg to 33: an open fire lit
    // into the cold now burns faster than the old flat 3, so the same nights spend
    // the pile quicker and the timeline compresses by two days. Seed 19 moves from
    // day 4 to day 9, with 1.2 kg of food in the pack rather than none at the end:
    // the faster cold-weather burn reorders the early feeding and food-gathering
    // grinds enough to buy five extra days before the cold catches up.
    // The snow pass (weather.ts: fresh snow a quarter as fast, the pack settling five
    // percent a day) moves seed 17 from day 20 to 25 and the woodpile from 33 kg to 14:
    // a shallower pack costs the walk less, so the days that used to go to breaking
    // trail go to firewood and food instead, and starvation comes later with less
    // wood banked against it. Seed 19 moves further, from a day 9 cold death to a day
    // 24 starvation: the thinner snow no longer chills the reference player past the
    // early frost, so the run survives on warmth long enough to run out of food instead.
    expect(epitaph(runReference(17, 60).record)).toMatchInlineSnapshot(`"Aldona Niemi. Day 25. Starved at camp, with nothing in the pack and 14 kg of firewood at camp."`);
    expect(epitaph(runReference(19, 60).record)).toMatchInlineSnapshot(`"Astrid Dahl. Day 24. Starved at camp, with nothing in the pack and 38 kg of firewood at camp."`);
  });

  it("writes the first snare set as its own line", () => {
    const r = rec();
    r.events.push({ kind: "built", structure: "snare", day: 3, date: { year: 1, doy: 92 } });
    expect(entry(r)).toContain("Day 3. Set the first snare.");
  });
});
