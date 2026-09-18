/**
 * The collapse holds the body to rest, not to dying of thirst.
 *
 * Under the collapse the body still drinks what is at hand, and walks to
 * water when the walk costs less energy than the store holds (body.ts,
 * spentCanDrink). A walk it cannot afford waits for the rest. The rest is
 * one task to the work line, not an hour handed out again and again.
 */
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { bodyStep, currentNeed } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { restMinutes } from "../src/sim/player";
import { cellOf, placeAt, watersideCell } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { RESTED_AT, SLEEP_AT } from "../src/sim/sleep";
import { check } from "../src/sim/tasks";
import { THIRSTY_L } from "../src/sim/water";
import { ensureGround } from "../src/sim/weather";
import { cellAt, regionAt } from "../src/world/gen";
import { passable } from "../src/world/route";

function collapsed(seed = 3) {
  const { state, world } = newGame(seed);
  // The boat lands on the shore, where a thirsty body simply drinks; the
  // case is a body inland, with the water a walk away.
  const inland = regionAt(world, state.player.region).cells.find((c) => !watersideCell(world, c) && passable(cellAt(world, c).terrain));
  if (inland === undefined) throw new Error("no inland cell on this seed");
  placeAt(state, world, inland);
  regionState(state, world, state.player.region).campCell = inland;
  ensureGround(state, world, state.player.region).iceCm = 0;
  // The landing kit carries water; the case is a body with none in hand.
  for (const t of state.player.tools) t.litres = 0;
  state.player.collapsed = true;
  state.player.energy = SLEEP_AT - 5;
  state.player.water = THIRSTY_L - 0.6;
  return { state, world, cal: calendar(state.minute, state.startDoy) };
}

describe("thirst under the collapse", () => {
  it("drinks what is at hand", () => {
    const { state, world, cal } = collapsed();
    addItem(pile(state, cellOf(state, world)), "water", 5);
    expect(currentNeed(state, world, cal)).toBe("thirsty");
  });

  it("walks to water it can afford, and waits for the rest when it cannot", () => {
    const { state, world, cal } = collapsed();
    const need = currentNeed(state, world, cal);
    // Fifteen points buy hours of walking at the drain of a working day; if
    // no open water is walkable here at all the need is the rest, as before.
    if (need === "thirsty") {
      const step = bodyStep(state, world, cal, new Rng(1), "thirsty");
      expect(step?.id).toBe("walk");
      expect(step?.step).toContain("for water");
      // Whatever the walk costs, a store under it cannot pay: the cheapest
      // walk the model has is one fine cell, and even that drains more
      // than this.
      state.player.energy = 0.01;
      state.player.bodyNeed = null;
      expect(currentNeed(state, world, cal)).toBe("spent");
    } else {
      expect(need).toBe("spent");
    }
  });
});

describe("one rest to the work line", () => {
  it("lasts the minutes the model says it takes to get there, and an hour above it", () => {
    expect(restMinutes(RESTED_AT)).toBe(60);
    expect(restMinutes(90)).toBe(60);
    // 10 -> 20 at the collapsed rate (4 an hour), then 20 -> 55 at 6 an hour.
    expect(restMinutes(10)).toBe(Math.ceil((10 / 4 + 35 / 6) * 60));
    expect(restMinutes(30)).toBe(Math.ceil((25 / 6) * 60));
    const { state, world, cal } = collapsed();
    state.player.energy = 10;
    const rest = check(state, world, cal, "rest");
    expect(rest.duration).toBe(restMinutes(10));
    expect(rest.detail).toContain("to the work line");
  });
});
