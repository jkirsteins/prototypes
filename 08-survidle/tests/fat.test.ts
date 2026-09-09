import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, edible } from "../src/sim/actions";
import { calendar, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { gutRefused } from "../src/sim/gut";
import { addItem, qty, weight } from "../src/sim/inventory";
import { GUT, KCAL_FULL } from "../src/sim/items";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { body, bodyMassKg, derived, fatLandmarks, MEDIAN_MASS_KG } from "../src/sim/person";
import { baseWalkSpeed, FAT_KCAL_PER_KG, starvation, stepPlayer, workSpeed } from "../src/sim/player";
import { current } from "../src/sim/record";
import type { Person } from "../src/sim/types";
import { waterLossPerHour } from "../src/sim/water";
import { siteCamp } from "./siting-helpers";

describe("the fat reserve", () => {
  it("costs fat and no health for an hour with kcal at zero and fat above zero", () => {
    const { state, world } = newGame(1);
    state.player.kcal = 0;
    const fat0 = state.player.fat;
    const health0 = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    // A new survivor lands at exactly the typical reserve, so the base bucket
    // reads exactly BASE_KCAL_PER_HOUR and the hour (base plus the rest
    // activity's 30 above it) comes in at 100.
    expect(fat0 - state.player.fat).toBeCloseTo(100, 1);
    expect(state.player.health).toBeCloseTo(health0, 1);
  });

  it("fills the stomach to its cap and banks the whole portion as fat, not just what overflowed it", () => {
    const { state, world } = newGame(1);
    state.player.kcal = KCAL_FULL - 100;
    state.player.fat = 0;
    addItem(state.player.pack, "driedMeat", 1);
    // driedMeat: 3,300 kcal/kg (three kilos to one rack kilo), 0.15 kg portion = 495 kcal.
    // The stomach has 100 kcal of room and clamps there; fat is a separate
    // book that gets the full 495, whether or not it fit in the stomach too.
    eat(state, world, "driedMeat", new Rng(1));
    expect(state.player.kcal).toBe(KCAL_FULL);
    expect(state.player.fat).toBeCloseTo(495, 5);
  });

  it("work speed at the midpoint of the failing range is three quarters of a non-starving body", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.typical;
    const full = workSpeed(state, world);
    state.player.fat = (l.lower + l.floor) / 2;
    const half = workSpeed(state, world);
    expect(half).toBeCloseTo(full * 0.75, 5);
  });

  it("logs each fat warning once as the reserve crosses its threshold", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.floor - 1;
    for (let m = 0; m < 5; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const texts = state.log.map((e) => e.text);
    for (const line of ["{You} {are} getting thin.", "{Your} ribs show.", "{You} {are} wasting away."]) {
      expect(texts.filter((t) => t === line).length).toBe(1);
    }
  });
});

describe("body mass", () => {
  it("counts the fat reserve, so a fatter body weighs more and burns more at rest", () => {
    const { state, world } = newGame(1);
    const lean = body(state).leanKg;
    state.player.fat = 0;
    expect(bodyMassKg(state)).toBeCloseTo(lean, 6);
    state.player.fat = 9 * FAT_KCAL_PER_KG;
    expect(bodyMassKg(state)).toBeCloseTo(lean + 9, 6);

    // Resting burn tracks total mass.
    state.player.fat = 0;
    state.task = null;
    const k0 = state.player.kcal;
    state.player.kcal = 3000;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const thin = 3000 - state.player.kcal;
    state.player.fat = 20 * FAT_KCAL_PER_KG;
    state.player.kcal = 3000;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const fat = 3000 - state.player.kcal;
    expect(fat).toBeGreaterThan(thin);
    void k0;
  });
});

describe("the berry ceiling", () => {
  function berried(kg: number) {
    const g = newGame(1);
    siteCamp(g.state, g.world);
    addItem(g.state.player.pack, "berries", kg);
    return g;
  }

  it("1.2 kilos in a day credit their full 540 kcal", () => {
    const { state, world } = berried(1.2);
    state.player.kcal = 1000;
    for (let i = 0; i < 6; i++) expect(eat(state, world, "berries", new Rng(1))).toBeGreaterThan(0);
    expect(state.player.kcal).toBeCloseTo(1540, 6);
    expect(today(state).eaten).toBeCloseTo(540, 6);
    // Berries' kilos live under the shared gut counter, keyed by food.
    expect(state.player.gut.day).toBe(1);
    expect(state.player.gut.kg.berries).toBeCloseTo(1.2, 6);
    expect(state.log.some((e) => e.text === "{Your} stomach is turning.")).toBe(false);
  });

  it("past 1.2 kilos the gut credits half, turns the stomach once, and costs water like a fever", () => {
    const { state, world } = berried(2);
    state.player.kcal = 1000;
    for (let i = 0; i < 6; i++) eat(state, world, "berries", new Rng(1));
    const plain = waterLossPerHour(state, 10);
    for (let i = 0; i < 2; i++) eat(state, world, "berries", new Rng(1));
    // 540 for the first 1.2 kilos, 90 for the next 0.4 at half credit.
    expect(state.player.kcal).toBeCloseTo(1630, 6);
    expect(state.log.filter((e) => e.text === "{Your} stomach is turning.").length).toBe(1);
    expect(waterLossPerHour(state, 10)).toBeCloseTo(plain * 1.2, 6);
    for (let i = 0; i < 2; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.kcal).toBeCloseTo(1720, 6);
    expect(state.log.filter((e) => e.text === "{Your} stomach is turning.").length).toBe(1);
  });

  it("at 2 kilos berries are refused, said once, and auto-eat passes over berries for the day", () => {
    const { state, world } = berried(2.5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.gut.kg.berries).toBeCloseTo(2, 6);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(0.5, 6);
    expect(eat(state, world, "berries", new Rng(1))).toBe(0);
    expect(gutRefused(state.player, state.minute, "berries")).toBe(true);
    expect(edible(state, "berries")).toBe(false);
    expect(edible(state, "driedMeat")).toBe(true);
    expect(state.log.filter((e) => e.text === "{You} cannot face another berry.").length).toBe(1);
    state.player.kcal = 1000;
    addItem(state.player.pack, "driedMeat", 1);
    const k = state.player.kcal;
    autoEat(state, world, new Rng(1));
    expect(state.player.kcal).toBeGreaterThan(k);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(0.5, 6);
  });

  it("the counter resets with the day", () => {
    const { state, world } = berried(2.5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    state.minute = 24 * 60 - START_MINUTE_OF_DAY;
    expect(gutRefused(state.player, state.minute, "berries")).toBe(false);
    expect(eat(state, world, "berries", new Rng(1))).toBeGreaterThan(0);
    expect(state.player.gut.day).toBe(2);
    expect(state.player.gut.kg.berries).toBeCloseTo(0.2, 6);
    expect(calendar(state.minute).day).toBe(2);
  });

  // The Swedish handbook's not over two litres of berries a day, about 1.2 kg, past which the gut turns.
  it("the ceiling's numbers are the table's", () => {
    expect(GUT.berries).toEqual({ fullCreditKg: 1.2, refuseKg: 2 });
  });
});

describe("the fat landmarks", () => {
  it("are strictly ordered for every build and both sexes", () => {
    for (const sex of ["m", "f"] as const) {
      for (const build of [-2, -1, 0, 1, 2] as const) {
        const p: Person = { sex, axes: { strength: 0, build, hands: 0, eyes: 0 }, quirks: [], face: 0 };
        const l = fatLandmarks(p);
        expect(l.floor).toBeGreaterThan(0);
        expect(l.lower).toBeGreaterThan(l.floor);
        expect(l.typical).toBeGreaterThan(l.lower);
        expect(l.upper).toBeGreaterThan(l.typical);
      }
    }
  });

  it("puts a woman's floor at a larger share of her mass than a man's", () => {
    const share = (sex: "m" | "f") => {
      const p: Person = { sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
      const l = fatLandmarks(p);
      const d = derived(p);
      const floorKg = l.floor / FAT_KCAL_PER_KG;
      return floorKg / (d.leanKg + floorKg);
    };
    expect(share("f")).toBeGreaterThan(share("m") * 2);
  });

  it("stands both sexes at the midpoint of their own settling zone", () => {
    // The zone is defined in body-fat share, so the invariant is exact there: FAT_SHARES
    // places typical at the midpoint between lower and upper for both sexes by construction.
    // Converting a share to kilocalories is nonlinear (fatAt's share/(1-share)), so the same
    // midpoint does not land at the same fraction of the zone measured in kcal - that curve
    // is real and is read back out here rather than tuned away.
    const shareOf = (kcal: number, leanKg: number) => {
      const fatKg = kcal / FAT_KCAL_PER_KG;
      return fatKg / (leanKg + fatKg);
    };
    for (const sex of ["m", "f"] as const) {
      const p: Person = { sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
      const l = fatLandmarks(p);
      const lean = derived(p).leanKg;
      const lower = shareOf(l.lower, lean);
      const typical = shareOf(l.typical, lean);
      const upper = shareOf(l.upper, lean);
      expect((typical - lower) / (upper - lower)).toBeCloseTo(0.5, 6);
    }
  });

  it("weighs a median man at his typical reserve at the reference mass", () => {
    const p: Person = { sex: "m", axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
    const l = fatLandmarks(p);
    expect(derived(p).leanKg + l.typical / FAT_KCAL_PER_KG).toBeCloseTo(MEDIAN_MASS_KG, 1);
  });
});

describe("starvation", () => {
  it("is nothing at the lower landmark and above, and total at the floor", () => {
    const { state } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.typical;
    expect(starvation(state)).toBe(0);
    state.player.fat = l.lower;
    expect(starvation(state)).toBe(0);
    state.player.fat = l.upper * 2;
    expect(starvation(state)).toBe(0);
    state.player.fat = l.floor;
    expect(starvation(state)).toBe(1);
    state.player.fat = 0;
    expect(starvation(state)).toBe(1);
  });

  it("rises without a step between the two", () => {
    const { state } = newGame(1);
    const l = fatLandmarks(current(state).person);
    const mid = (l.lower + l.floor) / 2;
    state.player.fat = mid;
    const s = starvation(state);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    state.player.fat = mid - 1000;
    expect(starvation(state)).toBeGreaterThan(s);
  });
});

describe("the floor", () => {
  it("starts the body dying at essential fat, not at nothing", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.kcal = 0;
    state.player.fat = l.floor - 1;
    const h0 = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(state.player.health).toBeLessThan(h0);
  });

  it("does not start it dying while the reserve is still above the floor", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.kcal = 0;
    state.player.fat = l.floor + 20000;
    const h0 = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(state.player.health).toBeCloseTo(h0, 1);
  });
});

describe("the body's words about its reserve", () => {
  it("says nothing while the body sits in its settling zone", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.typical;
    state.player.kcal = KCAL_FULL;
    const before = state.log.length;
    for (let m = 0; m < 120; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const said = state.log.slice(before).map((e) => e.text);
    expect(said.some((t) => /thin|ribs|wasting|starving/i.test(t))).toBe(false);
  });

  it("says them in order as the reserve falls toward the floor", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    const seen: string[] = [];
    for (const share of [0.7, 0.4, 0.1]) {
      state.player.fat = l.floor + (l.lower - l.floor) * share;
      state.player.kcal = KCAL_FULL;
      const before = state.log.length;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
      seen.push(...state.log.slice(before).map((e) => e.text));
    }
    expect(seen.some((t) => /thin/i.test(t))).toBe(true);
    expect(seen.some((t) => /ribs/i.test(t))).toBe(true);
    expect(seen.some((t) => /wasting/i.test(t))).toBe(true);
  });
});

describe("no ceiling", () => {
  it("lets a body eat past its upper landmark and keep going", () => {
    const { state, world } = newGame(1);
    const l = fatLandmarks(current(state).person);
    state.player.fat = l.upper;
    state.player.kcal = KCAL_FULL;
    addItem(state.player.pack, "fat", 20);
    for (let i = 0; i < 40; i++) eat(state, world, "fat", new Rng(1));
    expect(state.player.fat).toBeGreaterThan(l.upper * 1.2);
  });

  it("lands a new survivor at the typical reserve", () => {
    const { state } = newGame(1);
    expect(state.player.fat).toBeCloseTo(fatLandmarks(current(state).person).typical, 6);
  });
});

describe("carrying the reserve", () => {
  const walkHour = (fatKg: number) => {
    const { state, world } = newGame(17);
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    state.player.fat = fatKg * FAT_KCAL_PER_KG;
    state.player.kcal = KCAL_FULL;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    return KCAL_FULL - state.player.kcal;
  };

  it("costs a heavier body more to walk an hour", () => {
    expect(walkHour(20)).toBeGreaterThan(walkHour(5) * 1.05);
  });

  it("does not slow it down", () => {
    const { state } = newGame(17);
    state.player.fat = 5 * FAT_KCAL_PER_KG;
    const thin = baseWalkSpeed(state, calendar(0, state.startDoy), state.weather, 0);
    state.player.fat = 25 * FAT_KCAL_PER_KG;
    expect(baseWalkSpeed(state, calendar(0, state.startDoy), state.weather, 0)).toBeCloseTo(thin, 6);
  });

  it("leaves work done standing still alone", () => {
    const craftHour = (fatKg: number) => {
      const { state, world } = newGame(17);
      state.task = { id: "craft", progress: 0, duration: 60, repeat: false };
      state.player.fat = fatKg * FAT_KCAL_PER_KG;
      state.player.kcal = KCAL_FULL;
      for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
      return KCAL_FULL - state.player.kcal;
    };
    // Resting burn still rises with mass; the work above it does not.
    const heavy = craftHour(20), light = craftHour(5);
    expect(heavy - light).toBeLessThan(walkHour(20) - walkHour(5));
  });

  it("still charges more for a carried kilo than for a kilo of the body", () => {
    const { state, world } = newGame(17);
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    const perKgBody = (walkHour(20) - walkHour(5)) / 15;
    state.player.fat = 5 * FAT_KCAL_PER_KG;
    state.player.kcal = KCAL_FULL;
    addItem(state.player.pack, "log", 3);
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const loaded = KCAL_FULL - state.player.kcal;
    expect((loaded - walkHour(5)) / Math.max(1, weight(state.player.pack))).toBeGreaterThan(perKgBody);
  });
});
