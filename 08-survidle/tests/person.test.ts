import { describe, expect, it } from "vitest";
import { WORK_HOURS_DEFAULT } from "../src/sim/body";
import { newGame } from "../src/sim/newgame";
import { derived, gradeLines, medianPerson, quirkFear, quirkLine, rollCandidates } from "../src/sim/person";
import { BASE_KCAL_PER_HOUR, COMFORT_C, FAT_FULL } from "../src/sim/player";
import { deserialize, serialize } from "../src/sim/save";
import type { Person } from "../src/sim/types";
import { PACK_COMFORTABLE_KG, PACK_HARD_KG } from "../src/units";

describe("the person", () => {
  it("rolls the same three twice, a different three per boat, and never coast-born with forest-born", () => {
    const a = rollCandidates(17, 1, 0, []);
    const b = rollCandidates(17, 1, 0, []);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const c of a) {
      expect(c.person.quirks.length).toBeGreaterThanOrEqual(1);
      expect(c.person.quirks.length).toBeLessThanOrEqual(2);
      expect(c.person.quirks.includes("coastBorn") && c.person.quirks.includes("forestBorn")).toBe(false);
      expect(new Set(c.person.quirks).size).toBe(c.person.quirks.length);
    }
    expect(rollCandidates(17, 1, 1, []).map((c) => c.name)).not.toEqual(a.map((c) => c.name));
    const names = a.map((c) => `${c.name.first} ${c.name.last}`);
    expect(new Set(names).size).toBe(3);
  });

  it("spreads grades one, two, three, two, one in nine", () => {
    const counts = [0, 0, 0, 0, 0];
    let n = 0;
    for (let s = 0; s < 3000; s++) {
      for (const c of rollCandidates(s, 1, 0, [])) {
        counts[c.person.axes.strength + 2]++;
        n++;
      }
    }
    for (const [i, share] of [1 / 9, 2 / 9, 3 / 9, 2 / 9, 1 / 9].entries()) expect(Math.abs(counts[i] / n - share)).toBeLessThan(0.02);
  });

  it("derives today's numbers from the median for either sex", () => {
    for (const sex of ["f", "m"] as const) {
      const d = derived(medianPerson(sex));
      expect(d.packComfortableKg).toBe(PACK_COMFORTABLE_KG);
      expect(d.packHardKg).toBe(PACK_HARD_KG);
      expect(d.workHours).toBe(WORK_HOURS_DEFAULT);
      expect(d.workBurn).toBe(1);
      expect(d.massKg).toBe(72);
      expect(d.fatFull).toBe(FAT_FULL);
      expect(d.baseBurn).toBe(BASE_KCAL_PER_HOUR);
      expect(d.comfortC).toBe(COMFORT_C);
      expect(d.spoilFactor).toBe(1);
      expect(d.wearFactor).toBe(1);
      expect(d.sightReach).toBe(1);
      expect(d.dayOdds).toBe(1);
    }
  });

  it("derives the table's ends", () => {
    const p = medianPerson("m");
    const top = derived({ ...p, axes: { strength: 2, build: 2, hands: 2, eyes: 2 } });
    expect(top.packComfortableKg).toBe(30);
    expect(top.packHardKg).toBe(42);
    expect(top.workHours).toBe(12);
    expect(top.workBurn).toBeCloseTo(1.1);
    expect(top.massKg).toBe(84);
    expect(top.fatFull).toBeCloseTo(93333.33, 1);
    expect(top.baseBurn).toBeCloseTo(81.67, 1);
    expect(top.comfortC).toBe(3);
    expect(top.spoilFactor).toBeCloseTo(0.6);
    expect(top.wearFactor).toBeCloseTo(0.8);
    expect(top.sightReach).toBe(2);
    expect(top.dayOdds).toBeCloseTo(1.2);
    const low = derived({ ...p, axes: { strength: -2, build: -2, hands: -2, eyes: -2 } });
    expect(low.packComfortableKg).toBe(20);
    expect(low.packHardKg).toBe(28);
    expect(low.workHours).toBe(8);
    expect(low.workBurn).toBeCloseTo(0.9);
    expect(low.massKg).toBe(60);
    expect(low.fatFull).toBeCloseTo(66666.67, 1);
    expect(low.baseBurn).toBeCloseTo(58.33, 1);
    expect(low.comfortC).toBe(7);
    expect(low.spoilFactor).toBeCloseTo(1.4);
    expect(low.wearFactor).toBeCloseTo(1.2);
    expect(low.sightReach).toBe(0);
    expect(low.dayOdds).toBeCloseTo(0.8);
    expect(derived({ ...p, axes: { strength: 0, build: 0, hands: 0, eyes: -1 } }).sightReach).toBe(0);
    expect(derived({ ...p, axes: { strength: 0, build: 0, hands: 0, eyes: 1 } }).sightReach).toBe(2);
  });

  it("shows grades as words and quantities, never the number", () => {
    const p = medianPerson("f");
    expect(gradeLines({ ...p, axes: { strength: 2, build: 2, hands: 2, eyes: 2 } })).toEqual([
      "carries 30 kg all day, 42 kg at a push; works twelve hours", "84 kg, sleeps warm", "steady hands", "eagle-eyed",
    ]);
    expect(gradeLines({ ...p, axes: { strength: -1, build: -2, hands: -2, eyes: -1 } })).toEqual([
      "carries 22.5 kg all day, 31.5 kg at a push; works nine hours", "60 kg, sleeps cold", "clumsy", "short sight",
    ]);
    expect(gradeLines(p)).toEqual(["carries 25 kg all day, 35 kg at a push; works ten hours", "72 kg", "ordinary hands", "ordinary sight"]);
    expect(quirkLine("coastBorn")).toBe("Coast-born. Reads any shore at a glance; will not go up on the fell in cloud.");
    expect(quirkFear("coastBorn")).toBe("the fell in cloud");
    expect(quirkFear("bigEater")).toBeNull();
  });

  it("puts the median person on a new game's record and keeps a person through the save", () => {
    const { state } = newGame(17);
    expect(state.survivors[0].person).toEqual(medianPerson(state.survivors[0].person.sex));
    const custom: Person = { ...medianPerson("f"), axes: { strength: 1, build: -1, hands: 0, eyes: 2 }, quirks: ["bigEater"], face: 99 };
    const g = newGame(17, undefined, custom);
    expect(g.state.survivors[0].person).toEqual(custom);
    const back = deserialize(serialize(g.state))!;
    expect(back.state.survivors[0].person).toEqual(custom);
    expect(JSON.parse(serialize(g.state)).version).toBe(7);
  });

  it("gives a record from before the person the median with the sex its name says", () => {
    const { state } = newGame(17);
    const raw = JSON.parse(serialize(state)) as { version: number; state: { survivors: Record<string, unknown>[] } };
    raw.version = 6;
    delete raw.state.survivors[0].person;
    const back = deserialize(JSON.stringify(raw))!;
    const p = back.state.survivors[0].person;
    expect(p.axes).toEqual({ strength: 0, build: 0, hands: 0, eyes: 0 });
    expect(p.quirks).toEqual([]);
    expect(p.face).toBe(1);
    expect(p.sex).toBe(state.survivors[0].person.sex);
  });
});
