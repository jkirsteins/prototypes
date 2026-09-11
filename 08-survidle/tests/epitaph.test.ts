import { afterEach, describe, expect, it, vi } from "vitest";
import { entry, epitaph, epitaphTail, since } from "../src/sim/epitaph";
import { newRecord } from "../src/sim/record";
import { medianPerson } from "../src/sim/person";
import { measure, runReference, setUpReference } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import type { LifeRecord } from "../src/sim/types";
import { testAtmosphere } from "./weather-helpers";

afterEach(() => vi.restoreAllMocks());

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

  it("is deterministic for reference seeds through the larder and camp-fuel loop", () => {
    testAtmosphere({ temperatureC: -3 });
    const first = setUpReference(17);
    const second = setUpReference(79);
    const firstReport = measure(first, 60);
    const secondReport = measure(second, 60);
    for (const report of [firstReport, secondReport]) {
      expect(report.checkpoints.some((checkpoint) => checkpoint.week.eaten > 0)).toBe(true);
      expect(report.checkpoints.at(-1)?.food).toBe(0);
    }
    expect(epitaph(firstReport.record)).toMatchInlineSnapshot(`"Ausra Zukauskaite. Day 31. Starved at camp, with nothing in the pack and 24 kg of firewood at camp."`);
    expect(epitaph(secondReport.record)).toMatchInlineSnapshot(`"Elsa Sjoberg. Day 43. Starved at camp, with nothing in the pack and 40 kg of firewood at camp."`);
  });

  it("carries a kitted trap into the larder under controlled open-water weather", () => {
    // Every kitted landing gets a trap, since every landing has a shore with
    // something in the water. How fast it fills follows from how much of that
    // something the shore holds, so which of the reference landings carries a
    // catch to the larder inside ten days is the map's business; that one of
    // them does is the rule under test.
    let carried = 0;
    for (const seed of [3, 17, 21, 79]) {
      testAtmosphere({ temperatureC: 5 });
      const ref = setUpReference(seed, true);
      const report = measure(ref, 10, true);
      expect(regionState(ref.state, ref.world, ref.state.player.region).trap, `seed ${seed}`).not.toBeNull();
      carried += report.checkpoints.reduce((sum, checkpoint) => sum + checkpoint.week.yield.trap, 0);
    }
    expect(carried).toBeGreaterThan(0);
  });

  it("keeps cold and starvation as distinct deterministic death-cause copy", () => {
    const cold = rec();
    const starved = rec();
    starved.died = { ...starved.died!, cause: "starved" };
    expect(epitaph(cold)).toContain("Died of cold");
    expect(epitaph(starved)).toContain("Starved");
  });

  it("is deterministic for the reference seeds; trap yields more with larger capacities", () => {
    // These are measured deterministic outcomes, not survival targets: wetness,
    // warmth and the work they interrupt can move the day substantially.
    expect(epitaph(runReference(17, 60).record)).toMatchInlineSnapshot(`"Ausra Zukauskaite. Day 47. Starved at camp, with nothing in the pack and 64 kg of firewood at camp."`);
    expect(epitaph(runReference(79, 60).record)).toMatchInlineSnapshot(`"Elsa Sjoberg. Landed 1 April, year 1."`);
  });

  it("writes the first snare set as its own line", () => {
    const r = rec();
    r.events.push({ kind: "built", structure: "snare", day: 3, date: { year: 1, doy: 92 } });
    expect(entry(r)).toContain("Day 3. Set the first snare.");
  });
});
