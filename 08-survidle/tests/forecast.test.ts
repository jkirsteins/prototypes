import { describe, expect, it } from "vitest";
import { CAUSE_WORD, FORECAST_RUNS, forecast, forecastRow, horizons } from "../src/sim/forecast";
import { HORIZON_STAGES, setUpStage } from "../src/sim/horizon";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { kitOut, REFERENCE_ORDERS } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { addItem, pile, removeItem, qty } from "../src/sim/inventory";
import { GAME_MINUTES_PER_REAL_SECOND } from "../src/units";
import { AUTO_EAT_ORDER } from "../src/sim/items";
import { WATER_FULL } from "../src/sim/water";

/** A kitted camp on seed 17 with the reference orders and a stocked larder. */
function stocked() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  for (const w of REFERENCE_ORDERS) addOrder(g.state, g.world, w.req, w.kind);
  addItem(pile(g.state, regionState(g.state, g.world, g.state.player.region).campCell), "driedMeat", 5);
  return g;
}

describe("the horizons", () => {
  it("are the dial, and the month the life record keeps", () => {
    const { state } = newGame(1);
    const h = horizons(state);
    // The dial spans two and a half to sixty game days, so tonight and a
    // week both fall inside it and neither was a question anybody asked.
    // The month stays because a survivor's record keeps its number, and a
    // number that moved with a slider would be no record at all.
    expect(h.map((x) => x.id)).toEqual(["away", "month"]);
    expect(h[0].minutes).toBe(8 * 3600 * GAME_MINUTES_PER_REAL_SECOND);
    expect(h[1].minutes).toBe(30 * 1440);
    state.awayHours = 2;
    expect(horizons(state)[0].minutes).toBe(2 * 3600 * GAME_MINUTES_PER_REAL_SECOND);
    expect(horizons(state)[1].minutes).toBe(30 * 1440);
    expect(FORECAST_RUNS).toBe(10);
  });
});

describe("a forecast row", () => {
  it("is deterministic and leaves the live state untouched", () => {
    const { state, world } = stocked();
    const minute = state.minute;
    const rng = state.rng;
    const logLen = state.log.length;
    const a = forecastRow(state, world, { id: "away", minutes: 240 }, 3);
    const b = forecastRow(state, world, { id: "away", minutes: 240 }, 3);
    expect(a).toEqual(b);
    expect(state.minute).toBe(minute);
    expect(state.rng).toBe(rng);
    expect(state.log.length).toBe(logLen);
  });

  it("counts a clearly alive body as no deaths and a clearly dead one as three, with the cause and the day", () => {
    const { state, world } = stocked();
    const alive = forecastRow(state, world, { id: "away", minutes: 1440 }, 3);
    expect(alive).toEqual({ id: "away", runs: 3, died: 0, cause: null, day: null });
    regionState(state, world, state.player.region).orders = [];
    const inv = state.player.pack;
    const campPile = pile(state, regionState(state, world, state.player.region).campCell);
    const foodIds = [...AUTO_EAT_ORDER, "rawMeat"] as const;
    for (const f of foodIds) {
      removeItem(inv, f, qty(inv, f));
      removeItem(campPile, f, qty(campPile, f));
    }
    state.player.water = WATER_FULL;
    state.player.kcal = 0;
    state.player.fat = 0;
    state.player.health = 3;
    const dead = forecastRow(state, world, { id: "away", minutes: 7 * 1440 }, 3);
    expect(dead.died).toBe(3);
    expect(dead.cause).toBe("starved");
    expect(dead.day).toBe(1);
  });

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
  });

  it("runs the runner: the horizon's stocked stage holds a week only because its orders are worked, as the harness reads it", () => {
    const { state, world } = setUpStage(17, HORIZON_STAGES[4]);
    const rowWithOrders = forecastRow(state, world, { id: "away", minutes: 7 * 1440 }, 3);
    expect(rowWithOrders.died).toBe(0);
    const { state: stateNoOrders, world: worldNoOrders } = setUpStage(17, HORIZON_STAGES[4]);
    regionState(stateNoOrders, worldNoOrders, stateNoOrders.player.region).orders = [];
    const rowNoOrders = forecastRow(stateNoOrders, worldNoOrders, { id: "away", minutes: 7 * 1440 }, 3);
    expect(rowNoOrders.died > rowWithOrders.died || rowNoOrders.died > 0).toBe(true);
  });
});
