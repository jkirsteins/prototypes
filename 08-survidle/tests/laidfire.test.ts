/**
 * A fire is laid before it is lit. The pit takes wood while it is cold, which
 * is what makes "Fuel the fire site" a thing a player can do rather than a
 * line that only ticks at the moment of the light it sits above.
 */
import { describe, expect, it } from "vitest";
import { BANKED_KG } from "../src/sim/fire";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty, removeItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import { reveal } from "./opportunity-helpers";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

const cal = calendar(0);

/** A camp with a fire site cleared, standing on it, and nothing burning. */
function atSite({ seed = 3, site = true }: { seed?: number; site?: boolean } = {}) {
  testAtmosphere({ temperatureC: 5 });
  const game = newGame(seed);
  const { state, world } = game;
  siteCamp(state, world);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell!);
  if (site) siteFor(st, st.campCell!).structures.firePit = true;
  removeItem(pile(state, st.campCell!), "wetFirewood", 999);
  removeItem(state.player.pack, "wetFirewood", 999);
  return { state, world, st, campCell: st.campCell! };
}

describe("a fire laid before it is lit", () => {
  it("takes wood cold, credits the goal's fuel step, and lights off what is already in the pit", () => {
    const { state, world, st, campCell } = atSite({ site: false });
    reveal(state, ["fire"]);
    addItem(pile(state, campCell), "firewood", 8);
    // The whole checklist, walked in the order it lists its steps.
    const b = check(state, world, cal, "build", "firePit");
    expect(b.ok, b.why).toBe(true);
    expect(startTask(state, world, cal, "build", "firePit")).toBe(true);
    advance(state, world, b.duration);
    // The pit is its own rung before the fire goal now, not a step of it:
    // tests/opportunity-fyi.test.ts holds that rung. This fixture reveals
    // the fire goal directly and walks its remaining steps.
    // No drill: laying the fire is work that stands on its own, so the player
    // who has wood and no drill yet can still do the step in front of them.
    state.player.tools = [];
    removeItem(state.player.pack, "fireDrill", 9);
    const o = check(state, world, cal, "fuel");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "fuel")).toBe(true);
    advance(state, world, o.duration);
    expect(st.fire.lit).toBe(false);
    expect(st.fire.fuelKg).toBeGreaterThan(1);
    expect(state.opportunities.stepProgress.fire?.fuel).toBe(1);

    // Having the drill is the step, however it was come by: this one is put in
    // the pack rather than crafted, the way an heir finds one in the pile.
    addItem(state.player.pack, "fireDrill", 1);
    const laid = st.fire.fuelKg;
    const inPile = qty(pile(state, campCell), "firewood");
    const l = check(state, world, cal, "light");
    expect(l.ok, l.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    advance(state, world, l.duration);
    expect(st.fire.lit).toBe(true);
    // The laid wood is the fire's fuel: no lighting kilo comes off the pile.
    // A fire lit on purpose then starts with the banked few kilos, topped up
    // from the pile, so it is not out before anyone comes back to it.
    expect(qty(pile(state, campCell), "firewood")).toBeCloseTo(inPile - Math.max(0, BANKED_KG - laid), 1);
    expect(st.fire.fuelKg).toBeGreaterThan(laid - 1);
    expect(state.opportunities.completedAt.fire).toBeDefined();
  });

  it("lays dry wood only, and says so rather than denying wood the player can see", () => {
    const { state, world, campCell } = atSite();
    removeItem(pile(state, campCell), "firewood", 999);
    removeItem(state.player.pack, "firewood", 999);
    addItem(pile(state, campCell), "wetFirewood", 10);
    const o = check(state, world, cal, "fuel");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("needs 1 kg of dry wood");
    expect(o.why).toContain("10 kg wet firewood");
  });

  it("refuses to light on wet wood with the same words, which is the stall a player actually hits", () => {
    const { state, world, campCell } = atSite();
    removeItem(pile(state, campCell), "firewood", 999);
    removeItem(state.player.pack, "firewood", 999);
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "wetFirewood", 10);
    const o = check(state, world, cal, "light");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("needs 1 kg of dry wood");
  });
});
