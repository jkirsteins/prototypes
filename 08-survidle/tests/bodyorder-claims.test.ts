/**
 * A care claim stands only while something runs under it.
 *
 * The strip prints a care intent's step and the bar is the task; a claim
 * left standing with no task reads as a stall. Two ways a claim used to be
 * left: the want was answered on the spot (a hole cut and drunk from in one
 * minute left "opening an ice hole" on the strip), and the need ended while
 * the claim stood. tests/slow/care-steps-run.test.ts holds the whole
 * reference run to the same rule.
 */
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { bodyRowOf, serveBodyRow } from "../src/sim/bodyorder";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { THIRSTY_L } from "../src/sim/water";

function campedWithWater() {
  const { state, world } = newGame(3);
  const camp = cellOf(state, world);
  regionState(state, world, state.player.region).campCell = camp;
  addItem(pile(state, camp), "water", 5);
  const row = bodyRowOf(state, world)!;
  state.task = null;
  state.intent = { mode: "care", care: "body", need: "thirsty", orderId: row.id, step: "opening an ice hole" };
  return { state, world, row, cal: calendar(state.minute, state.startDoy), rng: new Rng(1) };
}

describe("a care claim", () => {
  it("is cleared when the want is answered on the spot", () => {
    const { state, world, row, cal, rng } = campedWithWater();
    state.player.water = THIRSTY_L - 0.5;
    serveBodyRow(state, world, cal, rng, row);
    expect(state.player.water).toBeGreaterThan(THIRSTY_L - 0.5);
    expect(state.task).toBeNull();
    expect(state.intent).toBeNull();
  });

  it("is cleared when the need has ended", () => {
    const { state, world, row, cal, rng } = campedWithWater();
    state.player.water = 3;
    state.player.kcal = 3000;
    state.player.energy = 90;
    serveBodyRow(state, world, cal, rng, row);
    expect(state.task).toBeNull();
    expect(state.intent).toBeNull();
  });
});
