import { describe, expect, it } from "vitest";
import { BERRY_PICK_KG, FOODS } from "../src/sim/items";
import { BASE_KCAL_PER_HOUR, WALK_KCAL_PER_HOUR } from "../src/sim/player";
import { APRIL, BERRY, BURN, LATE_AUGUST, SLEEP_HOURS, sourceBand, tableFor, verdict } from "../src/sim/tables";

describe("the tables", () => {
  it("carry the roadmap's April and late-August rows", () => {
    expect(APRIL.rows.fishing!.beginner).toEqual({ lo: 0, hi: 400 });
    expect(APRIL.rows.total!.experienced).toEqual({ lo: 1500, hi: 3500 });
    expect(APRIL.rows.largeGame!.beginner).toEqual({ lo: 0, hi: 0 });
    expect(LATE_AUGUST.rows.plants!.beginner).toEqual({ lo: 300, hi: 800 });
    expect(LATE_AUGUST.rows.total!.beginner).toEqual({ lo: 700, hi: 1500 });
    expect(LATE_AUGUST.rows.passiveFishing).toBeNull();
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
});

describe("the constants sit in their real bands", () => {
  it("base burn over a day is a fit adult's resting burn", () => {
    expect(verdict(BASE_KCAL_PER_HOUR * 24, BURN.base)).toBe("in band");
  });

  it("a berry is about 500 kcal a kilo", () => {
    expect(verdict(FOODS.berries.kcalPerKg, BERRY.kcalPerKg)).toBe("in band");
  });

  it("an hour's picking at level one is what a hand picker takes", () => {
    expect(verdict(BERRY_PICK_KG, BERRY.pickKgPerHour)).toBe("in band");
  });

  // A walk's rate above base times the hours a day's walking takes is a part of
  // the work share, not the whole of it, so it has no band of its own here. What
  // it does have is a floor: below 200 kcal/h a walk costs less than steady work
  // standing still, which no body does.
  it("the walking rate stays between its floor and a porter's pace", () => {
    expect(WALK_KCAL_PER_HOUR).toBeGreaterThanOrEqual(200);
    expect(WALK_KCAL_PER_HOUR).toBeLessThanOrEqual(300);
  });

  it("the burn shares add up to the day band", () => {
    expect(BURN.base.lo + BURN.work.lo + BURN.cold.lo).toBeGreaterThanOrEqual(BURN.day.lo - 100);
    expect(BURN.base.hi + BURN.work.hi + BURN.cold.hi).toBeLessThanOrEqual(BURN.day.hi + 300);
    expect(SLEEP_HOURS).toEqual({ lo: 7, hi: 9 });
  });
});
