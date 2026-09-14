import { describe, expect, it } from "vitest";
import { derive } from "../src/rng";
import { advance } from "../src/sim/advance";
import { dayNumber } from "../src/sim/calendar";
import { CAUSE_WORD, FORECAST_RUNS, forecastRow, horizons, type ForecastRow, type Horizon } from "../src/sim/forecast";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { kitOut, REFERENCE_ORDERS } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { addItem, pile, removeItem, qty } from "../src/sim/inventory";
import { GAME_MINUTES_PER_REAL_SECOND } from "../src/units";
import { AUTO_EAT_ORDER } from "../src/sim/items";
import type { DeathCause, GameState } from "../src/sim/types";
import { WATER_FULL } from "../src/sim/water";
import type { World } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

/** A kitted camp on seed 17 with the reference orders and a stocked larder. */
function stocked() {
  const g = newGame(17);
  siteCamp(g.state, g.world);
  kitOut(g.state, g.world);
  for (const w of REFERENCE_ORDERS) addOrder(g.state, g.world, w.req, w.kind);
  addItem(pile(g.state, regionState(g.state, g.world, g.state.player.region).campCell!), "driedMeat", 5);
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
    const campPile = pile(state, regionState(state, world, state.player.region).campCell!);
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

  // The two readings that are whole simulated runs - the map over every
  // horizon, whose month row is thirty days, and the runner check's six
  // week-long runs - live in tests/slow/forecast.test.ts (`npm run test:slow`).
});

const CAUSES = Object.keys(CAUSE_WORD) as DeathCause[];

function median(sorted: number[]): number {
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * forecastRow's own loop and verdict, before its clone was narrowed to skip
 * the closed survivors and the notices queue: a full structuredClone(state)
 * every run, kept only here to pin the narrowed clone against. Nothing
 * about the loop or the verdict changed, so a match proves the narrower
 * clone reads exactly what the wide one did.
 */
function forecastRowWithFullClone(state: GameState, world: World, horizon: Horizon, runs: number): ForecastRow {
  const deaths: { cause: DeathCause; day: number }[] = [];
  for (let k = 0; k < runs; k++) {
    const s = structuredClone(state);
    s.rng = derive(state.rng, k);
    for (let left = horizon.minutes; left > 0 && !s.dead; left -= 1440) advance(s, world, Math.min(1440, left));
    if (s.dead) deaths.push({ cause: s.dead.cause, day: dayNumber(s.dead.minute) - dayNumber(state.minute) + 1 });
  }
  if (deaths.length === 0) return { id: horizon.id, runs, died: 0, cause: null, day: null };
  let best: { cause: DeathCause; n: number; day: number } | null = null;
  for (const c of CAUSES) {
    const days = deaths.filter((d) => d.cause === c).map((d) => d.day).sort((a, b) => a - b);
    if (days.length === 0) continue;
    const day = median(days);
    if (!best || days.length > best.n || (days.length === best.n && day < best.day)) best = { cause: c, n: days.length, day };
  }
  return { id: horizon.id, runs, died: deaths.length, cause: best!.cause, day: best!.day };
}

describe("the narrowed clone", () => {
  it("forecasts the same verdicts a full structuredClone(state) would, on a state a session has grown", () => {
    const { state, world } = stocked();
    // Ten days is enough for the ledger to have trimmed past its window at
    // least once and for the log to hold real entries - the shape of a
    // grown session the narrowed clone is for - without paying for a whole
    // month of a full-size world twice over.
    for (let day = 0; day < 9 && !state.dead; day++) advance(state, world, 1440);
    expect(state.dead).toBeNull();
    expect(state.ledger.length).toBeLessThan(9);
    const horizon: Horizon = { id: "away", minutes: 3 * 1440 };
    const narrowed = forecastRow(state, world, horizon, 2);
    const full = forecastRowWithFullClone(state, world, horizon, 2);
    expect(narrowed).toEqual(full);
  });
});
