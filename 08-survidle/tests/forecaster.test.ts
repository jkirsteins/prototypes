import { describe, expect, it } from "vitest";
import type { ForecastRow } from "../src/sim/forecast";
import { applyRow, beginRequest, createForecaster, emptyView } from "../src/sim/forecaster";
import { newGame } from "../src/sim/newgame";

const row = (id: ForecastRow["id"], died = 0): ForecastRow => ({ id, runs: 10, died, cause: died ? "starved" : null, day: died ? 3 : null });

describe("the forecast view", () => {
  it("a new request stales every row; rows with the latest id replace, older ones only fill a gap", () => {
    const v = emptyView();
    beginRequest(v, 1);
    applyRow(v, 1, row("away"));
    applyRow(v, 1, row("month", 7));
    expect(v.rows.away).toEqual({ ...row("away"), stale: false });
    beginRequest(v, 2);
    expect(v.rows.away!.stale).toBe(true);
    expect(v.rows.month!.stale).toBe(true);
    applyRow(v, 2, row("away", 1));
    expect(v.rows.away).toEqual({ ...row("away", 1), stale: false });
    // A late row from request 1 for a horizon request 2 has not produced yet fills the gap, staled.
    applyRow(v, 1, row("week", 2));
    expect(v.rows.week).toEqual({ ...row("week", 2), stale: true });
    // A late row for a horizon request 2 already produced is ignored.
    applyRow(v, 1, row("away", 9));
    expect(v.rows.away!.died).toBe(1);
    // A row for a horizon the current request has already filled, from the current request, replaces.
    applyRow(v, 2, row("month", 4));
    expect(v.rows.month).toEqual({ ...row("month", 4), stale: false });
  });

  it("without a worker the client forecasts synchronously and the view is complete at once", () => {
    const { state, world } = newGame(17);
    state.awayHours = 1;
    const f = createForecaster(world, undefined, 1);
    f.request(state);
    const v = f.view();
    expect(v.id).toBe(1);
    expect(Object.keys(v.rows).sort()).toEqual(["away", "month", "tonight", "week"]);
    expect(Object.values(v.rows).every((r) => r!.stale === false)).toBe(true);
    f.request(state);
    expect(f.view().id).toBe(2);
    f.dispose();
  });
});
