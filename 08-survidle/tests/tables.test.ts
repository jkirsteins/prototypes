import { describe, expect, it } from "vitest";
import { BERRY_PICK_KG, FOODS } from "../src/sim/items";
import { emptyYield, YIELD_SOURCES } from "../src/sim/ledger";
import { BASE_KCAL_PER_HOUR, ENERGY_RATE, taskDrain, WALK_KCAL_PER_HOUR } from "../src/sim/player";
import { APRIL, BERRY, BURN, coldBand, isWinterDoy, LATE_AUGUST, SLEEP_HOURS, SOURCE_ROWS, sourceBand, tableFor, verdict } from "../src/sim/tables";
import { WORK_HOURS_DEFAULT } from "../src/sim/body";
import { minutesToWake } from "../src/sim/sleep";

describe("the tables", () => {
  it("carry the roadmap's April and late-August rows", () => {
    expect(APRIL.rows.fishing!.beginner).toEqual({ lo: 0, hi: 400 });
    expect(APRIL.rows.total!.experienced).toEqual({ lo: 1500, hi: 3500 });
    expect(APRIL.rows.largeGame!.beginner).toEqual({ lo: 0, hi: 0 });
    expect(LATE_AUGUST.rows.plants!.beginner).toEqual({ lo: 300, hi: 800 });
    expect(LATE_AUGUST.rows.total!.beginner).toEqual({ lo: 700, hi: 1500 });
    expect(LATE_AUGUST.rows.passiveFishing).toEqual({ beginner: { lo: 100, hi: 400 }, experienced: { lo: 400, hi: 1000 } });
  });

  it("a source's band is the sum of its rows; a source with no row has none", () => {
    expect(sourceBand(APRIL, "hunt", "beginner")).toEqual({ lo: 0, hi: 100 });
    expect(sourceBand(APRIL, "fish", "beginner")).toEqual({ lo: 0, hi: 400 });
    expect(sourceBand(APRIL, "berries", "beginner")).toEqual({ lo: 0, hi: 150 });
    expect(sourceBand(LATE_AUGUST, "snare", "experienced")).toEqual({ lo: 200, hi: 700 });
    expect(sourceBand(APRIL, "kit", "beginner")).toBeNull();
  });

  it("the table for a day is April until midsummer and late August after", () => {
    expect(tableFor(90)).toBe(APRIL);
    expect(tableFor(181)).toBe(APRIL);
    expect(tableFor(182)).toBe(LATE_AUGUST);
    expect(tableFor(235)).toBe(LATE_AUGUST);
  });

  it("verdicts read in band, under and over, inclusive at the edges", () => {
    const b = { lo: 100, hi: 300 };
    expect(verdict(100, b)).toBe("in band");
    expect(verdict(300, b)).toBe("in band");
    expect(verdict(99, b)).toBe("under");
    expect(verdict(301, b)).toBe("over");
  });

  it("the trap answers to the passive fishing row, which late August now splits out", () => {
    expect(SOURCE_ROWS.trap).toEqual(["passiveFishing"]);
    expect(LATE_AUGUST.rows.passiveFishing).toEqual({ beginner: { lo: 100, hi: 400 }, experienced: { lo: 400, hi: 1000 } });
    expect(sourceBand(LATE_AUGUST, "trap", "beginner")).toEqual({ lo: 100, hi: 400 });
    expect(YIELD_SOURCES).toContain("trap");
    expect(emptyYield().trap).toBe(0);
  });
});

describe("the constants sit in their real bands", () => {
  it("base burn over a day is a fit adult's resting burn", () => {
    expect(verdict(BASE_KCAL_PER_HOUR * 24, BURN.base)).toBe("in band");
  });

  it("a berry is about 500 kcal a kilo", () => {
    expect(verdict(FOODS.berries.kcalPerKg, BERRY.kcalPerKg)).toBe("in band");
    expect(BERRY.fullCreditKg).toBe(1.2);
    expect(BERRY.refuseKg).toBe(2);
  });

  it("an hour's picking at level one is what a hand picker takes", () => {
    expect(verdict(BERRY_PICK_KG, BERRY.pickKgPerHour)).toBe("in band");
    expect(BERRY_PICK_KG).toBe(0.7);
  });

  // A walk's rate above base times the hours a day's walking takes is a part of
  // the work share, not the whole of it, so it has no band of its own here. What
  // it does have is a floor: below 200 kcal/h a walk costs less than steady work
  // standing still, which no body does.
  it("the walking rate stays between its floor and a porter's pace", () => {
    expect(WALK_KCAL_PER_HOUR).toBeGreaterThanOrEqual(200);
    expect(WALK_KCAL_PER_HOUR).toBeLessThanOrEqual(300);
  });

  it("the burn shares add up to the day band, with the warm cold share", () => {
    expect(BURN.base.lo + BURN.work.lo + BURN.coldWarm.lo).toBeGreaterThanOrEqual(BURN.day.lo - 100);
    expect(BURN.base.hi + BURN.work.hi + BURN.coldWarm.hi).toBeLessThanOrEqual(BURN.day.hi + 300);
    expect(SLEEP_HOURS).toEqual({ lo: 7, hi: 9 });
  });

  it("the day band is the handbook's settled day to its camp-building day, and the cold share is a winter band inside December to February", () => {
    expect(BURN.day).toEqual({ lo: 3000, hi: 4500 });
    expect(BURN.deepCold).toEqual({ lo: 4500, hi: 6000 });
    expect(coldBand(90)).toEqual(BURN.coldWarm);
    expect(coldBand(334)).toEqual(BURN.coldWinter);
    expect(coldBand(10)).toEqual(BURN.coldWinter);
    expect(coldBand(59)).toEqual(BURN.coldWarm);
    expect(isWinterDoy(333)).toBe(false);
    expect(isWinterDoy(58)).toBe(true);
  });

  it("the energy budget balances: twelve hours on a task and four of camp work drain what eight hours asleep restore", () => {
    expect(12 * taskDrain(WORK_HOURS_DEFAULT) + 4 * -ENERGY_RATE.camp).toBeCloseTo(8 * ENERGY_RATE.sleep, 6);
  });

  it("the night the sleep model gives is inside the sleep band", () => {
    // No cap holds the hours in the band any more: the night is however long
    // the debt takes to fall to the wake line from where the onset line laid
    // the body down, which for the spec's December evening is 8.2 hours.
    expect(verdict(minutesToWake(64, 22 + 20 / 60) / 60, SLEEP_HOURS)).toBe("in band");
  });
});
