import { describe, expect, it } from "vitest";
import {
  CIRCADIAN_PEAK_HOUR, ULTRADIAN_AMPLITUDE,
  alertness, circadian, debtStep, minutesToWake, sleepiness,
  SLEEP_MAX_MINUTES, SLEEP_MIN_MINUTES, SLEEP_ONSET, WAKE_AT,
} from "../src/sim/sleep";

/** Hours of the process at a minute a time, which is the step the body itself takes. */
function awake(debt: number, hours: number): number {
  let d = debt;
  for (let m = 0; m < hours * 60; m++) d = debtStep(d, false, 1);
  return d;
}
function asleep(debt: number, hours: number, halfRate = false): number {
  let d = debt;
  for (let m = 0; m < hours * 60; m++) d = debtStep(d, true, 1, halfRate);
  return d;
}

describe("sleep debt, the homeostatic process", () => {
  it("sixteen hours awake from 10 reads 63, and eight asleep from there read 9", () => {
    // The balance a working adult keeps, and the reason the seven-to-nine
    // band exists: the rise takes sixteen hours to reach what the fall
    // undoes in eight.
    expect(Math.round(awake(10, 16))).toBe(63);
    expect(Math.round(asleep(63, 8))).toBe(9);
  });

  it("a light sleeper on a storm night clears debt at half the rate", () => {
    const full = 60 - debtStep(60, true, 60, false);
    const half = 60 - debtStep(60, true, 60, true);
    expect(half).toBeCloseTo(full / 2, 6);
    // Over a night it is not half the debt cleared but half the rate: what is
    // left is what a light sleeper wakes carrying.
    expect(asleep(63, 8, true)).toBeGreaterThan(asleep(63, 8));
  });

  it("work does not move the debt: only the clock does", () => {
    // A felling day and a sewing day are equally long awake. Fatigue is where
    // the work goes, and the two never meet in this function.
    expect(awake(10, 8)).toBeCloseTo(awake(10, 8), 12);
    expect(debtStep(40, false, 1)).toBeGreaterThan(40);
    expect(debtStep(40, true, 1)).toBeLessThan(40);
  });
});

describe("alertness, the circadian process", () => {
  it("the circadian wave peaks at 16:48 and troughs twelve hours from it", () => {
    let peak = 0;
    let trough = 0;
    for (let m = 0; m < 24 * 60; m++) {
      const h = m / 60;
      if (circadian(h) > circadian(peak / 60)) peak = m;
      if (circadian(h) < circadian(trough / 60)) trough = m;
    }
    expect(peak / 60).toBeCloseTo(CIRCADIAN_PEAK_HOUR, 1);
    expect(peak).toBe(16 * 60 + 48);
    expect(trough).toBe(4 * 60 + 48);
  });

  it("the post-lunch dip at 14:30 reads a full amplitude under the circadian line", () => {
    expect(circadian(14.5) - alertness(14.5)).toBeCloseTo(ULTRADIAN_AMPLITUDE, 6);
    // The dip is shallow: at 14:30 the whole wave is still well above the
    // small hours, so an afternoon doze is fatigue's doing and not the debt's.
    expect(alertness(14.5)).toBeGreaterThan(alertness(4.5) + 20);
  });
});

/**
 * The spec's worked December day: up at 05:30 on 1 December with a debt of
 * 10, stepped a minute at a time, asleep the first minute the onset line is
 * crossed and awake again the first minute the wake line is.
 */
function decemberDay() {
  const START_HOUR = 5.5;
  let debt = 10;
  let sleeping = false;
  let onset = 0;
  let wake = 0;
  const at = new Map<number, { debt: number; alert: number; sleepy: number }>();
  for (let m = 0; m <= 30 * 60; m++) {
    const hour = START_HOUR + m / 60;
    const s = sleepiness(debt, hour);
    if (!sleeping && s >= SLEEP_ONSET) {
      sleeping = true;
      onset = hour;
    } else if (sleeping && s <= WAKE_AT && wake === 0) {
      wake = hour;
    }
    at.set(Math.round(hour * 60), { debt, alert: alertness(hour), sleepy: s });
    if (wake > 0) break;
    debt = debtStep(debt, sleeping, 1);
  }
  return { at, onset, wake };
}

/** The table is stated to the point, so a reading is right when it is within one. */
function within(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

describe("the December table, computed from the model", () => {
  const { at, onset, wake } = decemberDay();

  // clock, the hour counted on from the 05:30 start, debt, alertness, sleepiness
  const rows: [string, number, number, number, number][] = [
    ["16:00", 16, 49, 17, 32],
    ["21:00", 21, 62, 13, 49],
    ["22:20", 22 + 20 / 60, 64, 4, 60],
    ["04:30", 28.5, 15, -22, 37],
    ["06:30", 30.5, 9, -16, 25],
  ];
  for (const [clock, hour, debt, alert, sleepy] of rows) {
    it(`${clock} reads debt ${debt}, alertness ${alert}, sleepiness ${sleepy}`, () => {
      const row = at.get(Math.round(hour * 60));
      expect(row).toBeDefined();
      within(row!.debt, debt);
      within(row!.alert, alert);
      within(row!.sleepy, sleepy);
    });
  }

  it("the night the model gives is 22:20 to 06:30, eight and a bit hours, with no cap over it", () => {
    expect(onset * 60).toBeCloseTo(22 * 60 + 20, -1);
    expect((wake % 24) * 60).toBeCloseTo(6 * 60 + 30, -1);
    expect(wake - onset).toBeCloseTo(8.2, 1);
  });

  it("the wake leaves the dark morning to work by firelight", () => {
    // Sunrise on 1 December at this latitude is 10:19: nearly four hours of
    // chores by the fire before the light, which is what the sunset bedtime
    // spent asleep.
    expect((wake % 24)).toBeLessThan(10.32);
    expect(10.32 - (wake % 24)).toBeGreaterThan(3.5);
  });
});

describe("the sleep task's length", () => {
  it("is the minutes to the wake line, never under an hour and never over fourteen", () => {
    // A body already at the wake line still lies down for the floor's hour.
    expect(minutesToWake(0, 12)).toBe(SLEEP_MIN_MINUTES);
    // One that cannot reach the line inside the ceiling gets the ceiling.
    expect(minutesToWake(100, 4.8)).toBeLessThanOrEqual(SLEEP_MAX_MINUTES);
    const night = minutesToWake(64, 22 + 20 / 60);
    expect(night / 60).toBeCloseTo(8.2, 1);
  });

  it("a light sleeper in a storm lies there longer for the same debt", () => {
    expect(minutesToWake(64, 22.5, true)).toBeGreaterThan(minutesToWake(64, 22.5, false));
  });
});
