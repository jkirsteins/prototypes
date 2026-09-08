import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { leaveCamp } from "../src/sim/camp";
import { EMBER_MINUTES } from "../src/sim/fire";
import { newGame } from "../src/sim/newgame";
import { fatLandmarks, personOf } from "../src/sim/person";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { regionAt, type World } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

/**
 * These goals credit on real deeds emitted from stepCamp over real advance()
 * runs, never on a Deed built by hand: a mutation that deletes the emission
 * has to make one of these fail, or it is not pinned.
 *
 * Every test tops the survivor up before each real-time span so a five-day
 * fire-keeping run is not derailed by starvation or cold along the way -
 * what happens to the fire is what these tests are about, not the body.
 */
function feed(state: ReturnType<typeof newGame>["state"]): void {
  state.player.kcal = 6000;
  state.player.fat = fatLandmarks(personOf(state)).typical;
  state.player.water = 3;
  state.player.health = 100;
  state.player.energy = 100;
  state.player.sleepDebt = 0;
}

/** Advances in chunks, topping the survivor back up between them: a single feed before a five-day advance still lets them starve partway through. */
function run(state: ReturnType<typeof newGame>["state"], world: World, minutes: number): void {
  let left = minutes;
  while (left > 1e-9 && !state.dead) {
    const dt = Math.min(360, left);
    feed(state);
    advance(state, world, dt);
    left -= dt;
  }
}

/** A camp with a huge fuel stock so the fire's own burn math never ends a test early; only the deliberate mutations in each test do. */
function litCamp(startDoy?: number) {
  const { state, world } = startDoy === undefined ? newGame(3) : newGame(3, startDoy);
  siteCamp(state, world);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell!);
  st.fire.lit = true;
  st.fire.fuelKg = 1e7;
  st.fire.wetKg = 0;
  st.fire.litSince = state.minute;
  return { state, world, st };
}

describe("keeping a fire overnight", () => {
  it("credits a fire alive at dusk that is still alive at dawn", () => {
    const { state, world } = litCamp();
    run(state, world, 26 * 60);
    expect(state.goals.done.keptNight).toBe(true);
  });

  it("credits nothing when the fire dies at 03:00, well before dawn", () => {
    const { state, world, st } = litCamp();
    run(state, world, 19 * 60); // 08:00 day 1 + 19h = 03:00 day 2
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 0;
    st.fire.embers = 0;
    st.fire.litSince = null;
    run(state, world, 8 * 60); // well past day 2's dawn
    expect(state.goals.done.keptNight).toBeUndefined();
  });

  it("credits an ember-only night when the coals outlast a short summer one", () => {
    // DayOfYear 172: sunset ~22:38, sunrise ~03:21, a night of well under
    // EMBER_MINUTES (8 hours) - a fire banked at dusk with no one feeding
    // it can plausibly see this one through on coals alone.
    const { state, world, st } = litCamp(172);
    run(state, world, 870); // to just before tonight's dusk, still an open flame
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 0;
    st.fire.embers = EMBER_MINUTES; // banked fresh, right as the short night begins
    run(state, world, 430); // through dusk and the night, past dawn, coals still alight
    expect(state.goals.done.keptNight).toBe(true);
  });
});

describe("keeping a fire for three days", () => {
  it("credits a fire kept continuously across seventy-two hours", () => {
    const { state, world } = litCamp();
    run(state, world, 5 * 24 * 60);
    expect(state.goals.done.keptDays).toBe(true);
  });

  it("restarts the count when the run breaks, so five elapsed days since a two-day-old relight is not enough", () => {
    const { state, world, st } = litCamp();
    run(state, world, 2 * 24 * 60);
    // The fire goes out outright: this run is broken, not merely banked.
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 0;
    st.fire.embers = 0;
    st.fire.litSince = null;
    run(state, world, 60);
    // Relit from cold: a new run starts here, not a continuation of the old one.
    st.fire.lit = true;
    st.fire.fuelKg = 1e7;
    st.fire.litSince = state.minute;
    run(state, world, 2 * 24 * 60);
    expect(state.goals.done.keptDays).toBeUndefined();
  });

  it("credits three days kept even with a brief dip to embers along the way", () => {
    const { state, world, st } = litCamp();
    run(state, world, 24 * 60);
    // Banked, not out: coals only for a couple of hours, well inside their eight.
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 0;
    st.fire.embers = EMBER_MINUTES;
    run(state, world, 2 * 60);
    st.fire.lit = true;
    st.fire.fuelKg = 1e7;
    st.fire.embers = 0;
    run(state, world, 3 * 24 * 60);
    expect(state.goals.done.keptDays).toBe(true);
    // The dip never broke the run: litSince is still the original light.
    expect(st.fire.litSince).toBe(0);
  });

  it("credits the tick it reaches seventy-two hours, rather than waiting for the next day's roll", () => {
    const { state, world } = litCamp();
    run(state, world, 3 * 24 * 60 - 1);
    expect(state.goals.done.keptDays).toBeUndefined();
    run(state, world, 1);
    expect(state.goals.done.keptDays).toBe(true);
  });
});

describe("keeping a fire through a day of rain", () => {
  it("credits a fire that comes through twenty-four hours of rain", () => {
    const { state, world, st } = litCamp();
    state.weather.storm = { from: state.minute, until: state.minute + 26 * 60, warned: true };
    run(state, world, 26 * 60);
    expect(state.goals.done.keptRain).toBe(true);
    expect(st.fire.rainHeld).toBeGreaterThanOrEqual(24 * 60);
  });

  it("credits nothing when the rain stops short of a day", () => {
    const { state, world, st } = litCamp();
    state.weather.storm = { from: state.minute, until: state.minute + 20 * 60, warned: true };
    run(state, world, 20 * 60); // exactly the storm's span, so no chance rain after it can pad the count
    expect(state.goals.done.keptRain).toBeUndefined();
    expect(st.fire.rainHeld).toBeLessThan(24 * 60);
  });

  it("credits the day of rain even with a brief dip to embers along the way", () => {
    const { state, world, st } = litCamp();
    state.weather.storm = { from: state.minute, until: state.minute + 26 * 60, warned: true };
    run(state, world, 10 * 60); // ten hours of rain on an open flame
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.wetKg = 0;
    st.fire.embers = EMBER_MINUTES; // banked, still raining, coals only
    run(state, world, 2 * 60); // two hours on coals, well inside their eight
    st.fire.lit = true;
    st.fire.fuelKg = 1e7;
    st.fire.embers = 0;
    run(state, world, 14 * 60); // the rest of the storm and past it
    expect(state.goals.done.keptRain).toBe(true);
  });
});

describe("the fire goals credit only the player's own region", () => {
  it("gives no credit for a fire kept, rained on and burning overnight in a region the player has left", () => {
    const { state, world, st } = litCamp();
    // The player's own fire goes cold at once, so any credit below can only
    // have leaked in from the other region's fire, not this one.
    st.fire.lit = false;
    st.fire.fuelKg = 0;
    st.fire.embers = 0;
    st.fire.litSince = null;

    const otherId = regionAt(world, state.player.region).neighbours[0].id;
    const otherSt = regionState(state, world, otherId);
    otherSt.fire.lit = true;
    otherSt.fire.fuelKg = 1e7;
    otherSt.fire.wetKg = 0;
    otherSt.fire.litSince = state.minute;
    state.weather.storm = { from: state.minute, until: state.minute + 5 * 24 * 60, warned: true };

    run(state, world, 5 * 24 * 60);
    expect(state.goals.done.keptNight).toBeUndefined();
    expect(state.goals.done.keptDays).toBeUndefined();
    expect(state.goals.done.keptRain).toBeUndefined();
  });
});

describe("leaving a camp kills its fire outright", () => {
  it("does not keep crediting a fire-keeping goal once the camp is left behind", () => {
    const { state, world, st } = litCamp();
    run(state, world, 2 * 24 * 60); // short of the three days keptDays asks for
    leaveCamp(state, world);
    expect(st.fire.lit).toBe(false);
    expect(st.fire.embers).toBe(0);
    expect(st.fire.litSince).toBeNull();
    run(state, world, 3 * 24 * 60); // long enough to cross keptDays had the run survived
    expect(state.goals.done.keptDays).toBeUndefined();
  });
});

describe("a catch-up with nobody home", () => {
  it("credits none of the three fire goals, however long the camp's fire burns on unattended", () => {
    const { state, world, st } = litCamp();
    state.weather.storm = { from: state.minute, until: state.minute + 5 * 24 * 60, warned: true };
    advance(state, world, 5 * 24 * 60, { nobody: true });
    expect(st.fire.lit).toBe(true); // 1e7 kg of fuel never runs out, so nothing here ends the run early
    expect(state.goals.done.keptNight).toBeUndefined();
    expect(state.goals.done.keptDays).toBeUndefined();
    expect(state.goals.done.keptRain).toBeUndefined();
  });
});
