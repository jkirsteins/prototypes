/**
 * Opportunities have to arrive over time, or gating the Do panel on them
 * does nothing.
 *
 * Every tool recipe and every shelter used to be seeded at minute 0, with
 * a comment saying so: nothing in the simulation gated them behind a
 * skill, a season or a place, so they were known from world start. That
 * was true and harmless while opportunities only described goals. It stops
 * being harmless the moment a Do row's existence hangs off one, because
 * fifteen rows would be revealed before the player had done anything -
 * including the twenty-two unmakeable recipes that started this pass.
 *
 * So the day-one set is now the work of the first night, and the rest wait
 * for the ground, the kit or the skill that makes them a real prospect.
 */
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { isOpportunityDiscovered } from "../src/sim/opportunities";
import type { OpportunityKey } from "../src/sim/types";

function fresh() {
  const { state } = newGame(21);
  return (key: OpportunityKey) => isOpportunityDiscovered(state.opportunities, key);
}

describe("a fresh world does not hand over every capability", () => {
  it("keeps the first night's work", () => {
    const has = fresh();
    expect(has("make:fireDrill")).toBe(true);
    expect(has("build:leanTo")).toBe(true);
    expect(has("build:boughBed")).toBe(true);
  });

  it("withholds what needs kit the survivor has not got", () => {
    const has = fresh();
    expect(has("make:knife")).toBe(false);
    expect(has("make:needle")).toBe(false);
    expect(has("make:flakedAxe")).toBe(false);
    expect(has("make:waterskin")).toBe(false);
  });

  it("withholds what needs a camp, a season of skill or an animal seen", () => {
    const has = fresh();
    expect(has("make:bow")).toBe(false);
    expect(has("build:cabin")).toBe(false);
    expect(has("build:turfHut")).toBe(false);
    expect(has("build:snowShelter")).toBe(false);
  });

  it("still seeds the seasons and the first siting, which are not capabilities", () => {
    const has = fresh();
    expect(has("season:spring")).toBe(true);
    expect(has("site")).toBe(true);
  });
});
