import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { EMBER_MINUTES, hasEmbers } from "../src/sim/fire";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { feltTemperature } from "../src/sim/player";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import { siteCamp } from "./siting-helpers";

/** A lit fire at camp with a known fuel load and nobody to auto-feed it. */
function litCamp(seed = 3, fuelKg = 1) {
  const { state, world } = newGame(seed);
  siteCamp(state, world);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell!);
  siteFor(st, st.campCell!).structures.firePit = true;
  st.fire.lit = true;
  st.fire.fuelKg = fuelKg;
  st.fire.wetKg = 0;
  st.fire.litSince = state.minute;
  state.player.autoFeed = false;
  return { state, world, st };
}

describe("a spent fire", () => {
  it("falls to embers rather than going out", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(st.fire.lit).toBe(false);
    expect(hasEmbers(st.fire)).toBe(true);
  });

  it("is only truly out once the embers are spent", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    advance(state, world, EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    expect(st.fire.embers).toBe(0);
  });

  it("keeps its run open through the embers and closes it when they die", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(st.fire.litSince).not.toBe(null);
    advance(state, world, EMBER_MINUTES + 60);
    expect(st.fire.litSince).toBe(null);
  });

  it("loses its embers faster in the rain with nothing over it", () => {
    const dry = litCamp();
    advance(dry.state, dry.world, 120);
    const dryLeft = dry.st.fire.embers;

    const wet = litCamp();
    wet.state.weather.precip = "light";
    advance(wet.state, wet.world, 120);
    expect(wet.st.fire.embers).toBeLessThan(dryLeft);
  });

  it("leaves no embers when heavy rain drowns it", () => {
    const { state, world, st } = litCamp(3, 1.5);
    state.weather.precip = "heavy";
    // drownedLow wants above-freezing rain, no roof and under 2 kg on the
    // fire. The camp built here has no roof and the fuel load is already
    // under 2 kg; force the temperature above freezing regardless of season
    // and freeze the daily reroll so it cannot undo that mid-window, which
    // is what makes this deterministic rather than a maybe.
    state.weather.offset = 50;
    state.weather.rolledDay = calendar(state.minute).dayIndex + 1;
    advance(state, world, 30);
    expect(st.fire.lit).toBe(false);
    expect(hasEmbers(st.fire)).toBe(false);
  });
});

describe("embers against a lit fire", () => {
  it("warm less and light less", async () => {
    const { fireWarmth, EMBER_WARMTH, EMBER_LUX } = await import("../src/sim/fire");
    const { CAMP_FIRE_LUX } = await import("../src/sim/light");
    const lit = { lit: true, fuelKg: 10, wetKg: 0, indoors: false, unattended: 0, embers: 0, litSince: 0, rainHeld: 0 };
    expect(EMBER_WARMTH).toBeLessThan(fireWarmth(lit, false));
    expect(EMBER_LUX).toBeLessThan(CAMP_FIRE_LUX);
  });

  it("glow under the band that finds wood in the dark, so a banked fire is no place to forage", async () => {
    const { EMBER_LUX } = await import("../src/sim/fire");
    const { NIGHT_WORK } = await import("../src/sim/light");
    expect(EMBER_LUX).toBeLessThan(NIGHT_WORK.deadwood!.needLux);
  });

  it("reach the body: a survivor beside coals is warmer than beside a dead pit and colder than beside flame", () => {
    const litFire = litCamp();
    const lit = feltTemperature(litFire.state, litFire.world, -10);

    const embers = litCamp();
    embers.st.fire.lit = false;
    embers.st.fire.fuelKg = 0;
    embers.st.fire.embers = EMBER_MINUTES;
    const banked = feltTemperature(embers.state, embers.world, -10);

    const dead = litCamp();
    dead.st.fire.lit = false;
    dead.st.fire.fuelKg = 0;
    dead.st.fire.embers = 0;
    const cold = feltTemperature(dead.state, dead.world, -10);

    expect(banked).toBeGreaterThan(cold);
    expect(banked).toBeLessThan(lit);
  });
});

describe("rekindling", () => {
  it("takes no drill and cannot fail, however hard it is raining", () => {
    const { state, world, st } = litCamp();
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    const before = state.player.tools.find((t) => t.id === "fireDrill")!.durability;
    state.weather.precip = "heavy";
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, calendar(state.minute, state.startDoy), "light")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(st.fire.lit).toBe(true);
    expect(state.player.tools.find((t) => t.id === "fireDrill")!.durability).toBe(before);
  });

  it("still needs the drill when the coals are dead", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120 + EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "light");
    expect(o.ok).toBe(false);
    expect(o.why).toMatch(/drill/i);
  });

  it("takes no drill indoors either, whoever is short one beside a turf hut's coals", () => {
    const { state, world, st } = litCamp();
    siteFor(st, st.campCell!).structures.turfHut = true;
    st.fire.indoors = true;
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "lightIndoors");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, calendar(state.minute, state.startDoy), "lightIndoors")).toBe(true);
    advance(state, world, o.duration + 1);
    expect(st.fire.lit).toBe(true);
  });

  it("still needs the drill indoors once the hut's coals are dead", () => {
    const { state, world, st } = litCamp();
    siteFor(st, st.campCell!).structures.turfHut = true;
    st.fire.indoors = true;
    advance(state, world, 120 + EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "lightIndoors");
    expect(o.ok).toBe(false);
    expect(o.why).toMatch(/drill/i);
  });

  it("does not claim a drill is needed to relight from live coals", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "light");
    expect(o.detail).not.toMatch(/drill/i);
  });

  it("does claim a drill is needed to light from cold", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120 + EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, calendar(state.minute, state.startDoy), "light");
    expect(o.detail).toMatch(/drill/i);
  });
});
