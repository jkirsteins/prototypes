import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { autoEat } from "../src/sim/actions";
import { advance } from "../src/sim/advance";
import { hourlyEvents } from "../src/sim/events";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { regionAt } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { placeAt } from "../src/sim/position";

/** Midnight in June, unsheltered, no fire: the wolf roll's conditions. */
const NIGHT = calendar(1440 * 70 + 16 * 60);   // 00:00 on day 71

function nights(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], hours: number, seed = 1): number {
  const rng = new Rng(seed);
  let attacks = 0;
  for (let h = 0; h < hours; h++) {
    const before = state.player.health;
    state.player.health = 100;
    state.player.sick = 1;   // keep the fever roll from muddying the count
    hourlyEvents(state, world, NIGHT, 10, 10, rng);
    if (state.player.health < 100) attacks++;
    void before;
  }
  return attacks;
}

describe("wolves", () => {
  it("never come where there are none, and come more where there are many", () => {
    const { state, world } = newGame(5);
    let safe = -1;
    let wolfy = -1;
    for (let id = 0; id < LATTICE_W * LATTICE_H && (safe < 0 || wolfy < 0); id++) {
      const r = regionAt(world, id);
      if (r.landCells < 20) continue;
      if (!r.capacity.wolf && safe < 0) safe = id;
      if (r.capacity.wolf && wolfy < 0) wolfy = id;
    }
    placeAt(state, world, regionAt(world, safe).campCell);
    expect(nights(state, world, 2000)).toBe(0);
    placeAt(state, world, regionAt(world, wolfy).campCell);
    regionState(state, world, wolfy).pop.wolf = regionAt(world, wolfy).capacity.wolf;
    const full = nights(state, world, 2000, 2);
    expect(full).toBeGreaterThan(20);
    regionState(state, world, wolfy).pop.wolf = regionAt(world, wolfy).capacity.wolf! * 0.1;
    const thin = nights(state, world, 2000, 3);
    expect(thin).toBeLessThan(full / 3);
  });
});


describe("the body says what it ate", () => {
  it("one line for the sitting, naming what went and how much", () => {
    const { state, world } = newGame(21);
    // "auto-eat: on" was legible on screen the whole time he could not tell
    // whether his survivor was eating: state was shown and the event was not.
    // Then it ate his whole meat stock while he slept, silently.
    state.player.autoEat = true;
    state.player.kcal = 0;
    addItem(state.player.pack, "driedMeat", 3);
    autoEat(state, world, new Rng(1));
    const said = state.log.filter((e) => e.text.includes("{eat}"));
    // One line for the sitting, not one per mouthful: what a meal cost is
    // the thing worth knowing, not how many portions it took.
    expect(said).toHaveLength(1);
    expect(said[0].text).toContain("kg");
    expect(said[0].text).toContain("dried meat");
  });

  it("claims no meal when there was nothing to eat", () => {
    const { state, world } = newGame(21);
    state.player.autoEat = true;
    state.player.kcal = 0;
    state.player.pack.items = {};
    autoEat(state, world, new Rng(1));
    // No meal line. A body with nothing left says so in its own words,
    // which is a different thing and worth saying.
    expect(state.log.some((e) => e.text.includes("{eat}"))).toBe(false);
  });

  it("a fire falling to coals says so, since losing what you built must be louder than silence", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 0.01;
    state.player.autoFeed = false;
    advance(state, world, 30);
    // A fire that eats its wood banks rather than dies, so the line that
    // matters is the one saying the flames are gone - not that the fire is.
    expect(state.log.some((e) => /down to coals/i.test(e.text))).toBe(true);
  });
});
