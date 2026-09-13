import { describe, expect, it } from "vitest";
import { WORK_HOURS_DEFAULT } from "../src/sim/body";
import { newGame } from "../src/sim/newgame";
import { derived, grades, medianPerson, QUIRKS, quirkFear, quirkLine, rollCandidates } from "../src/sim/person";
import { BASE_KCAL_PER_HOUR, COMFORT_C } from "../src/sim/player";
import { readSave, serialize } from "../src/sim/save";
import type { Person } from "../src/sim/types";
import { SAVE_VERSION } from "../src/sim/world-version";
import { PACK_COMFORTABLE_KG, PACK_HARD_KG } from "../src/units";
import { siteCamp } from "./siting-helpers";

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

  it("derives today's numbers from the median for either sex, mass included", () => {
    // Everything but mass is sex-blind; mass carries the reference body (72 kg, BASE_KCAL_PER_HOUR)
    // for a man and a lighter body of the woman's own median (62 kg) scaled the same way for the other sex.
    for (const sex of ["f", "m"] as const) {
      const d = derived(medianPerson(sex));
      expect(d.packComfortableKg).toBe(PACK_COMFORTABLE_KG);
      expect(d.packHardKg).toBe(PACK_HARD_KG);
      expect(d.workHours).toBe(WORK_HOURS_DEFAULT);
      expect(d.workBurn).toBe(1);
      expect(d.comfortC).toBe(COMFORT_C);
      expect(d.spoilFactor).toBe(1);
      expect(d.wearFactor).toBe(1);
      expect(d.sightReach).toBe(1);
      expect(d.dayOdds).toBe(1);
    }
    const m = derived(medianPerson("m"));
    expect(m.massKg).toBe(72);
    expect(m.baseBurn).toBe(BASE_KCAL_PER_HOUR);
    const f = derived(medianPerson("f"));
    expect(f.massKg).toBe(62);
    expect(f.baseBurn).toBe(60.27777777777778);
  });

  it("derives the table's ends", () => {
    const p = medianPerson("m");
    const top = derived({ ...p, axes: { strength: 2, build: 2, hands: 2, eyes: 2 } });
    expect(top.packComfortableKg).toBe(30);
    expect(top.packHardKg).toBe(42);
    expect(top.workHours).toBe(12);
    expect(top.workBurn).toBeCloseTo(1.1);
    expect(top.massKg).toBe(84);
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
    expect(low.baseBurn).toBeCloseTo(58.33, 1);
    expect(low.comfortC).toBe(7);
    expect(low.spoilFactor).toBeCloseTo(1.4);
    expect(low.wearFactor).toBeCloseTo(1.2);
    expect(low.sightReach).toBe(0);
    expect(low.dayOdds).toBeCloseTo(0.8);
    expect(derived({ ...p, axes: { strength: 0, build: 0, hands: 0, eyes: -1 } }).sightReach).toBe(0);
    expect(derived({ ...p, axes: { strength: 0, build: 0, hands: 0, eyes: 1 } }).sightReach).toBe(2);
  });

  it("shows grades as the word first and the quantity behind it", () => {
    const p = medianPerson("f");
    // A woman's own median (62 kg) scales by build the same way a man's does, so
    // her card shows her own mass at each build, rounded to a tenth off the median.
    expect(grades({ ...p, axes: { strength: 2, build: 2, hands: 2, eyes: 2 } })).toEqual([
      { word: "Mighty and unflagging.", evidence: "carries 30 kg, 42 kg at a push; works 12 hours" },
      { word: "Heavy, sleeps warm.", evidence: "72.3 kg" },
      { word: "Steady hands, an eagle's eye.", evidence: "" },
    ]);
    expect(grades({ ...p, axes: { strength: -1, build: -2, hands: -2, eyes: -1 } })).toEqual([
      { word: "Slight and short-winded.", evidence: "carries 22.5 kg, 31.5 kg at a push; works 9 hours" },
      { word: "Spare, sleeps cold.", evidence: "51.7 kg" },
      { word: "Clumsy hands, short sight.", evidence: "" },
    ]);
    expect(grades(p)).toEqual([
      { word: "Ordinary and steady.", evidence: "carries 25 kg, 35 kg at a push; works 10 hours" },
      { word: "Ordinary.", evidence: "62 kg" },
      { word: "Ordinary hands, ordinary sight.", evidence: "" },
    ]);
    expect(quirkFear("coastBorn")).toBe("the fell in cloud");
    expect(quirkFear("bigEater")).toBeNull();
  });

  it("says what a quirk refuses once: on the Fears line, never also in its own sentence", () => {
    for (const q of QUIRKS) {
      const fear = quirkFear(q);
      if (fear) expect(quirkLine(q)).not.toContain(fear);
      expect(quirkLine(q)).not.toMatch(/will not/);
    }
    expect(quirkLine("coastBorn")).toBe("Coast-born. Reads any shore at a glance.");
  });

  it("puts the median person on a new game's record and keeps a person through the save", () => {
    const { state } = newGame(17);
    expect(state.survivors[0].person).toEqual(medianPerson(state.survivors[0].person.sex));
    const custom: Person = { ...medianPerson("f"), axes: { strength: 1, build: -1, hands: 0, eyes: 2 }, quirks: ["bigEater"], face: 99 };
    const g = newGame(17, undefined, custom);
    siteCamp(g.state, g.world);
    expect(g.state.survivors[0].person).toEqual(custom);
    const back = readSave(serialize(g.state))!;
    expect(back.state.survivors[0].person).toEqual(custom);
    expect(JSON.parse(serialize(g.state)).version).toBe(SAVE_VERSION);
  });

  it("gives a record missing its person field the median with the sex its name says", () => {
    const { state } = newGame(17);
    const raw = JSON.parse(serialize(state)) as { version: number; state: { survivors: Record<string, unknown>[] } };
    delete raw.state.survivors[0].person;
    const back = readSave(JSON.stringify(raw))!;
    const p = back.state.survivors[0].person;
    expect(p.axes).toEqual({ strength: 0, build: 0, hands: 0, eyes: 0 });
    expect(p.quirks).toEqual([]);
    expect(p.face).toBe(1);
    expect(p.sex).toBe(state.survivors[0].person.sex);
  });
});
