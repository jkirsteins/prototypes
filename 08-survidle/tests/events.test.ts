import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { hourlyEvents } from "../src/sim/events";
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
