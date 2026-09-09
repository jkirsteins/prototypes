/**
 * The two forecast readings that are themselves whole simulated runs: the map
 * over every horizon, whose month row is thirty days of real minutes, and the
 * runner check, which is six week-long runs. A minute and a half between them,
 * so they sit behind `npm run test:slow` rather than taxing every commit;
 * tests/forecast.test.ts keeps the cheap checks over the same machinery - the
 * horizon list, a row's determinism, and the alive and dead counts.
 */
import { describe, expect, it } from "vitest";
import { CAUSE_WORD, forecast, forecastRow } from "../../src/sim/forecast";
import { HORIZON_STAGES, setUpStage } from "../../src/sim/horizon";
import { addItem, pile } from "../../src/sim/inventory";
import { newGame } from "../../src/sim/newgame";
import { addOrder } from "../../src/sim/orders";
import { kitOut, REFERENCE_ORDERS } from "../../src/sim/reference";
import { regionState } from "../../src/sim/regionstate";

/** A kitted camp on seed 17 with the reference orders and a stocked larder. */
function stocked() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  for (const w of REFERENCE_ORDERS) addOrder(g.state, g.world, w.req, w.kind);
  addItem(pile(g.state, regionState(g.state, g.world, g.state.player.region).campCell!), "driedMeat", 5);
  return g;
}

describe("a forecast row", () => {
  it("forecast maps every horizon, and the cause words are the ones the panel prints", () => {
    const { state, world } = stocked();
    state.awayHours = 1;
    // Two horizons: the one the slider names and shows, and the month the
    // life record keeps whether anybody is looking at it or not.
    const rows = forecast(state, world, 1);
    expect(rows.map((r) => r.id)).toEqual(["away", "month"]);
    expect(CAUSE_WORD.starved).toBe("starved");
    expect(CAUSE_WORD.froze).toBe("cold");
    expect(CAUSE_WORD.gaveUp).toBe("gave up");
  }, 120000);

  it("runs the runner: the horizon's stocked stage holds a week only because its orders are worked, as the harness reads it", () => {
    const { state, world } = setUpStage(17, HORIZON_STAGES[4]);
    const rowWithOrders = forecastRow(state, world, { id: "away", minutes: 7 * 1440 }, 3);
    expect(rowWithOrders.died).toBe(0);
    const { state: stateNoOrders, world: worldNoOrders } = setUpStage(17, HORIZON_STAGES[4]);
    regionState(stateNoOrders, worldNoOrders, stateNoOrders.player.region).orders = [];
    const rowNoOrders = forecastRow(stateNoOrders, worldNoOrders, { id: "away", minutes: 7 * 1440 }, 3);
    expect(rowNoOrders.died > rowWithOrders.died || rowNoOrders.died > 0).toBe(true);
  }, 120000);
});
