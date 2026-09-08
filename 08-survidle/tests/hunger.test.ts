import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, HUNGRY_LINE } from "../src/sim/actions";
import { advance } from "../src/sim/advance";
import { addItem } from "../src/sim/inventory";
import { KCAL_FULL } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { BASE_KCAL_PER_HOUR } from "../src/sim/player";

/**
 * The meal line and what the body does at it. The pool's size is not free:
 * auto-eat holds the reserve just above the line, so the pool decides where
 * on the bar a healthy body sits, and a pool much larger than that resting
 * band puts every healthy moment down in the bar's empty-looking end.
 */
describe("the meal line", () => {
  it("sits inside the bar, so a full body is visibly above the line it eats at", () => {
    expect(HUNGRY_LINE).toBeGreaterThan(0);
    expect(HUNGRY_LINE).toBeLessThan(KCAL_FULL);
  });

  it("keeps a fed body in the upper half of the bar, where the line is drawn", () => {
    // What the bar is worth watching for. auto-eat takes one portion at a time
    // and stops as soon as the reserve passes the line, so a fed body never
    // climbs near the cap: it rests just above the line and dips back to it a
    // few times a day. That resting band is what a player sees for the whole
    // game, and a pool far larger than the band leaves the bar looking nearly
    // empty at every healthy moment, with nothing on it saying so.
    const { state, world } = newGame(17);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let m = 0; m < 2 * 1440; m++) {
      // A mixed larder, so a gut cap never walls the body off from eating and
      // this reads the rhythm rather than a shortage.
      for (const f of ["driedMeat", "cookedFish", "berries", "cookedRoots", "fat"] as const) addItem(state.player.pack, f, 1);
      advance(state, world, 1);
      // Past the first day, so the stomach it landed with has been spent.
      if (m > 1440) {
        lo = Math.min(lo, state.player.kcal);
        hi = Math.max(hi, state.player.kcal);
      }
    }
    expect(lo).toBeGreaterThanOrEqual(HUNGRY_LINE - 1);
    expect(lo / KCAL_FULL).toBeGreaterThanOrEqual(0.5);
    expect(hi / KCAL_FULL).toBeLessThanOrEqual(1);
  });
});

describe("auto-eat", () => {
  it("eats at the line and says so once for the meal, not once for the portion", () => {
    const { state, world } = newGame(1);
    state.player.kcal = HUNGRY_LINE - 1;
    addItem(state.player.pack, "driedMeat", 2);
    const before = state.log.length;
    autoEat(state, world, new Rng(1));
    expect(state.player.kcal).toBeGreaterThanOrEqual(HUNGRY_LINE);
    const lines = state.log.slice(before);
    expect(lines.length).toBe(1);
    expect(lines[0]!.text).toMatch(/eat/i);
  });

  it("says nothing when the body is above the line", () => {
    const { state, world } = newGame(1);
    state.player.kcal = KCAL_FULL;
    addItem(state.player.pack, "driedMeat", 2);
    const before = state.log.length;
    autoEat(state, world, new Rng(1));
    expect(state.log.length).toBe(before);
  });

  it("warns once when the line is crossed with nothing to eat, not once a minute", () => {
    const { state, world } = newGame(1);
    state.player.pack.items = {};
    state.player.kcal = HUNGRY_LINE - 1;
    autoEat(state, world, new Rng(1));
    const warned = state.log.length;
    expect(warned).toBeGreaterThan(0);
    state.player.kcal = HUNGRY_LINE - 200;
    autoEat(state, world, new Rng(1));
    autoEat(state, world, new Rng(1));
    expect(state.log.length).toBe(warned);
  });

  it("warns again after the body is fed and falls past the line a second time", () => {
    const { state, world } = newGame(1);
    state.player.pack.items = {};
    state.player.kcal = HUNGRY_LINE - 1;
    autoEat(state, world, new Rng(1));
    const warned = state.log.length;
    addItem(state.player.pack, "driedMeat", 2);
    autoEat(state, world, new Rng(1));
    state.player.pack.items = {};
    state.player.kcal = HUNGRY_LINE - 1;
    autoEat(state, world, new Rng(1));
    expect(state.log.length).toBeGreaterThan(warned + 1);
  });
});

describe("hunger and satiety", () => {
  it("eats past the line it started at, up to the satiety target", () => {
    const { state, world } = newGame(1);
    state.player.kcal = HUNGRY_LINE - 1;
    addItem(state.player.pack, "driedMeat", 5);
    autoEat(state, world, new Rng(1));
    expect(state.player.kcal).toBeGreaterThan(HUNGRY_LINE + 100);
    expect(state.player.kcal).toBeLessThanOrEqual(KCAL_FULL);
  });

  it("banks the surplus as fat when a deep larder meets a full stomach", () => {
    const { state, world } = newGame(1);
    const fat0 = state.player.fat;
    // A season of plenty: the pack never empties and the body never goes without.
    // Every gain eat() credits lands in fat in full, not only the sliver a
    // portion happens to overshoot the stomach's cap by, so a body that eats
    // more than it burns - even by a little, even for a few days before
    // something else in the world catches up with it - has to show it.
    for (let m = 0; m < 30 * 1440; m++) {
      for (const f of ["driedMeat", "cookedOilyFish", "cookedRoots", "fat"] as const) addItem(state.player.pack, f, 1);
      advance(state, world, 1);
    }
    expect(state.player.fat).toBeGreaterThan(fat0);
  });

  it("loses fat at close to the burn rate through a stretch with nothing to eat", () => {
    const { state, world } = newGame(1);
    state.player.pack.items = {};
    const fat0 = state.player.fat;
    const days = 3;
    for (let m = 0; m < days * 1440; m++) advance(state, world, 1);
    expect(state.dead).toBeNull();
    const lost = fat0 - state.player.fat;
    // p.fat -= kcalBurn runs every minute regardless of what the stomach
    // holds, and nothing credits it back with an empty pack and no food on
    // the ground here, so the loss has to equal the ledger's own record of
    // what was burned over the same stretch - not just approach it.
    const burned = state.ledger.reduce((sum, d) => sum + d.burn.base + d.burn.activity + d.burn.walk + d.burn.cold + d.burn.sick, 0);
    expect(lost).toBeCloseTo(burned, 6);
    // And that burn is a real one, in the range a resting body's day costs,
    // not a rounding error masquerading as starvation.
    expect(lost / days).toBeGreaterThan(BASE_KCAL_PER_HOUR * 24 * 0.5);
    expect(lost / days).toBeLessThan(BASE_KCAL_PER_HOUR * 24 * 3);
  });
});
