import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar, START_DOY } from "../src/sim/calendar";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { medianPerson } from "../src/sim/person";
import { baseWalkSpeed, BASE_KCAL_PER_HOUR, COMFORT_C, warmthTarget } from "../src/sim/player";
import { discovery, enterRegion, SEEN } from "../src/sim/regionstate";
import { craftSuccess, wearFactor } from "../src/sim/skills";
import { huntOdds } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";
import type { Grade, Person } from "../src/sim/types";

function withAxes(seed: number, axes: Partial<Person["axes"]>) {
  const p: Person = { ...medianPerson("m"), axes: { strength: 0, build: 0, hands: 0, eyes: 0, ...axes } as Record<keyof Person["axes"], Grade> };
  return newGame(seed, undefined, p);
}

describe("the grades at their seams", () => {
  it("strength: 28 kg walks at full speed at +2 where the median slows, and the working day is twelve hours", () => {
    const strong = withAxes(17, { strength: 2 });
    const median = newGame(17);
    const cal = calendar(0, START_DOY);
    expect(baseWalkSpeed(strong.state, cal, strong.state.weather, 28)).toBe(3);
    expect(baseWalkSpeed(median.state, cal, median.state.weather, 28)).toBeCloseTo(2.4);
    expect(baseWalkSpeed(strong.state, cal, strong.state.weather, 43)).toBeCloseTo(1.8);
    expect(strong.state.player.workHours).toBe(12);
    expect(median.state.player.workHours).toBe(10);
  });

  it("build: the landing fat, the base burn and the comfort follow the mass", () => {
    const heavy = withAxes(17, { build: 2 });
    expect(heavy.state.player.fat).toBeCloseTo(93333.33, 1);
    expect(newGame(17).state.player.fat).toBe(80000);
    // A day asleep at 0 C ambient: the base bucket is the only burn, scaled by mass over 72.
    expect(BASE_KCAL_PER_HOUR).toBe(70);
    expect(warmthTarget(COMFORT_C)).toBe(50);
    expect(warmthTarget(COMFORT_C, COMFORT_C - 2)).toBe(60);
  });

  it("build: the ledger's base bucket scales with the mass", () => {
    const heavy = withAxes(17, { build: 2 });
    const median = newGame(17);
    advance(heavy.state, heavy.world, 60);
    advance(median.state, median.world, 60);
    const h = heavy.state.ledger.at(-1)!.burn.base;
    const m = median.state.ledger.at(-1)!.burn.base;
    expect(h / m).toBeCloseTo(84 / 72, 2);
  });

  it("hands: the spoil chance one level short is 0.7 at -2 and 0.3 at +2 of the attempt", () => {
    const clumsy = withAxes(17, { hands: -2 });
    const steady = withAxes(17, { hands: 2 });
    const median = newGame(17);
    // Nothing recommends a level for cordage, so the chance is 1 for everyone; the bow wants Crafting 5.
    expect(craftSuccess(median.state, "cordage")).toBe(1);
    expect(craftSuccess(clumsy.state, "cordage")).toBe(1);
    // Four levels short at level 1: the level's own chance is 1/16, so the spoil is 15/16 times the factor.
    expect(craftSuccess(median.state, "bow")).toBeCloseTo(1 / 16);
    expect(craftSuccess(clumsy.state, "bow")).toBeCloseTo(1 - Math.min(1, (15 / 16) * 1.4));
    expect(craftSuccess(steady.state, "bow")).toBeCloseTo(1 - (15 / 16) * 0.6);
    expect(wearFactor(clumsy.state, clumsy.world, "sticks")).toBeCloseTo(1.2);
    expect(wearFactor(steady.state, steady.world, "sticks")).toBeCloseTo(0.8);
  });

  it("eyes: the sight reach on entry, and the hunting odds by day and not by night", () => {
    const sharp = withAxes(17, { eyes: 2 });
    const poor = withAxes(17, { eyes: -2 });
    const median = newGame(17);
    const region = (g: ReturnType<typeof newGame>) => regionAt(g.world, g.state.player.region);
    for (const g of [sharp, poor, median]) {
      for (const id of Object.keys(g.state.discovered)) if (Number(id) !== g.state.player.region) delete g.state.discovered[Number(id)];
      enterRegion(g.state, g.world, g.state.player.region);
    }
    const nb = region(median).neighbours[0].id;
    expect(discovery(median.state, nb)).toBe(SEEN);
    expect(discovery(poor.state, nb)).toBe(0);
    expect(discovery(sharp.state, nb)).toBe(SEEN);
    const nb2 = regionAt(sharp.world, nb).neighbours.find((n) => n.id !== sharp.state.player.region && !region(sharp).neighbours.some((x) => x.id === n.id));
    if (nb2) {
      expect(discovery(sharp.state, nb2.id)).toBe(SEEN);
      expect(discovery(median.state, nb2.id)).toBe(0);
    }
    const day = calendar(4 * 60, START_DOY);
    const night = calendar(20 * 60, START_DOY);
    addItem(sharp.state.player.pack, "arrow", 5);
    addItem(median.state.player.pack, "arrow", 5);
    const s = huntOdds(sharp.state, sharp.world, day, 1, "hare");
    const m = huntOdds(median.state, median.world, day, 1, "hare");
    expect(s / m).toBeCloseTo(1.2);
    expect(huntOdds(sharp.state, sharp.world, night, 1, "hare")).toBeCloseTo(huntOdds(median.state, median.world, night, 1, "hare"));
  });
});
