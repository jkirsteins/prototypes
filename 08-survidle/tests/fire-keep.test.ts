/**
 * A fire's setting, per fire (types.ts, FireKeep).
 *
 * The camp row obeys it: `burning` feeds and relights, `coals` lets the
 * fire down and relights only as the coals go, `out` asks nothing. The
 * field fire has the same setting. An older save reads `burning`.
 */
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { bodyStep, campNeed } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { EMBER_RELIGHT_MINUTES, SPREAD_FUEL_KG } from "../src/sim/fire";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { readSave, serialize } from "../src/sim/save";
import { campHtml } from "../src/ui/panels";
import { siteCamp } from "./siting-helpers";

/** A camp with a pit, a drill in the pack and dry wood in the pile, at midday. */
function pit(seed = 3) {
  const { state, world } = newGame(seed);
  siteCamp(state, world);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell!);
  siteFor(st, st.campCell!).structures.firePit = true;
  state.player.tools.push({ id: "fireDrill", durability: 100 });
  addItem(pile(state, st.campCell!), "firewood", 10);
  // Midday by the calendar: the clock's minute zero is the landing hour, not midnight.
  while (Math.abs(calendar(state.minute, state.startDoy).hour - 12) > 0.05) state.minute++;
  // A body wanting nothing: the relight yields to thirst, hunger and rest.
  state.player.water = 3;
  state.player.kcal = 3000;
  state.player.energy = 90;
  state.player.sleepDebt = 0;
  return { state, world, st, cal: calendar(state.minute, state.startDoy), rng: new Rng(1) };
}

describe("the camp row and a fire's setting", () => {
  it("relights a fire gone to coals when set to burn, leaves one set to go out, and never starts one from cold", () => {
    const { state, world, st, cal, rng } = pit();
    expect(st.fire.keep).toBe("burning");
    // Stone cold: the pit is the body's or the player's to light, not the row's.
    expect(campNeed(state, world, cal)).toBeNull();
    st.fire.embers = EMBER_RELIGHT_MINUTES * 20;
    expect(campNeed(state, world, cal)).toBe("fire");
    expect(bodyStep(state, world, cal, rng, "fire")?.id).toBe("light");
    st.fire.keep = "out";
    expect(campNeed(state, world, cal)).toBeNull();
  });

  it("feeds a low fire only when set to burn", () => {
    const { state, world, st, cal } = pit();
    st.fire.lit = true;
    st.fire.fuelKg = 0.5;
    expect(campNeed(state, world, cal)).toBe("fire");
    st.fire.keep = "coals";
    expect(campNeed(state, world, cal)).toBeNull();
  });

  it("under coals, relights as the coals go and not before", () => {
    const { state, world, st, cal, rng } = pit();
    st.fire.keep = "coals";
    st.fire.embers = EMBER_RELIGHT_MINUTES * 6;
    expect(campNeed(state, world, cal)).toBeNull();
    st.fire.embers = EMBER_RELIGHT_MINUTES;
    expect(campNeed(state, world, cal)).toBe("fire");
    expect(bodyStep(state, world, cal, rng, "fire")?.id).toBe("light");
    // Dead outright, it is not the row's to start: cold, the night or the player light it.
    st.fire.embers = 0;
    expect(campNeed(state, world, cal)).toBeNull();
  });

  it("feeds a field fire under foot from the pack when set to burn", () => {
    const { state, world, cal, rng } = pit();
    const here = state.player.pack;
    addItem(here, "firewood", 5);
    state.player.fieldFire = { cell: regionState(state, world, state.player.region).campCell!, fuelKg: 2, keep: "burning" };
    expect(campNeed(state, world, cal)).toBe("fire");
    expect(bodyStep(state, world, cal, rng, "fire")).toBeNull();
    expect(state.player.fieldFire.fuelKg).toBeGreaterThan(2);
    expect(state.player.fieldFire.fuelKg).toBeLessThanOrEqual(SPREAD_FUEL_KG + 1e-9);
    state.player.fieldFire.keep = "out";
    state.player.fieldFire.fuelKg = 2;
    expect(campNeed(state, world, cal)).toBeNull();
  });

  it("reads burning from a save that predates the setting", () => {
    const { state, world, st } = pit();
    state.player.fieldFire = { cell: st.campCell!, fuelKg: 2, keep: "coals" };
    const raw = JSON.parse(serialize(state)) as { state: { regions: Record<string, { fire: { keep?: string } }>; player: { fieldFire: { keep?: string } } } };
    for (const region of Object.values(raw.state.regions)) delete region.fire.keep;
    delete raw.state.player.fieldFire.keep;
    const loaded = readSave(JSON.stringify(raw));
    expect(loaded).not.toBeNull();
    expect(loaded!.state.regions[state.player.region].fire.keep).toBe("burning");
    expect(loaded!.state.player.fieldFire?.keep).toBe("burning");
    void world;
  });
});

describe("the fire line", () => {
  it("offers to light a cold pit when the drill and dry wood are at hand, and says what is missing otherwise", () => {
    const { state, world, st, cal } = pit();
    expect(campHtml(state, world, cal)).toContain("light it now");
    state.player.tools = state.player.tools.filter((t) => t.id !== "fireDrill");
    const html = campHtml(state, world, cal);
    expect(html).not.toContain("light it now");
    expect(html).toContain("to light it: needs a fire drill");
    st.fire.lit = true;
    expect(campHtml(state, world, cal)).not.toContain("to light it");
  });
});
