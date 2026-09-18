/**
 * The alert stack reads the body's own lines and stands while they hold.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { RESTED_AT, SLEEP_AT, SPENT_AT } from "../src/sim/sleep";
import { THIRSTY_L } from "../src/sim/water";
import { alerts, alertsHtml } from "../src/ui/alerts";
import { ensureGround } from "../src/sim/weather";
import { placeAt } from "../src/sim/position";
import { cellAt, regionAt } from "../src/world/gen";

function fresh(seed = 3) {
  const { state, world } = newGame(seed);
  const p = state.player;
  p.energy = 90; p.water = 3; p.kcal = 3000; p.warmth = 80; p.wetness = 0; p.sleepDebt = 0; p.collapsed = false;
  return { state, world, cal: calendar(state.minute, state.startDoy) };
}

describe("the alert stack", () => {
  it("is empty for a body wanting nothing", () => {
    const { state, world, cal } = fresh();
    expect(alerts(state, world, cal)).toEqual([]);
    expect(alertsHtml(state, world, cal)).toContain("Nothing to report");
  });

  it("warns of tiredness between the spent line and the collapse, and says collapsed under it", () => {
    const { state, world, cal } = fresh();
    state.player.energy = (SPENT_AT + SLEEP_AT) / 2;
    expect(alerts(state, world, cal).map((a) => a.title)).toEqual(["Tired"]);
    expect(alerts(state, world, cal)[0].detail).toContain(`${SLEEP_AT}`);
    state.player.collapsed = true;
    state.player.energy = SLEEP_AT - 1;
    const rows = alerts(state, world, cal);
    expect(rows.map((a) => a.title)).toEqual(["Collapsed"]);
    expect(rows[0].level).toBe("bad");
    expect(rows[0].detail).toContain(`${RESTED_AT}`);
  });

  it("puts what is happening above what is next, and draws each as a block", () => {
    const { state, world, cal } = fresh();
    state.player.energy = SPENT_AT - 1;
    state.player.water = THIRSTY_L - 0.1;
    const rows = alerts(state, world, cal);
    expect(rows.map((a) => a.title)).toEqual(["Thirsty", "Tired"]);
    const html = alertsHtml(state, world, cal);
    expect(html).toContain('class="alert bad"');
    expect(html).toContain('class="alert warn"');
    expect(html.indexOf("Thirsty")).toBeLessThan(html.indexOf("Tired"));
  });

  it("reads the pit's low mark", () => {
    const { state, world, cal } = fresh();
    const st = regionState(state, world, state.player.region);
    st.campCell = cellOf(state, world);
    siteFor(st, st.campCell).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 1;
    expect(alerts(state, world, cal).map((a) => a.title)).toContain("Fire burning low");
    st.fire.fuelKg = 20;
    expect(alerts(state, world, cal).map((a) => a.title)).not.toContain("Fire burning low");
  });

  it("warns on thin ice under foot and cries out when it is giving way", () => {
    const { state, world, cal } = fresh();
    const water = regionAt(world, state.player.region).cells.find((c) => cellAt(world, c).terrain === "water");
    if (water === undefined) throw new Error("no water on this seed");
    placeAt(state, world, water);
    ensureGround(state, world, state.player.region).iceCm = 10;
    expect(alerts(state, world, cal).map((a) => a.title)).toContain("On thin ice");
    ensureGround(state, world, state.player.region).iceCm = 2;
    const rows = alerts(state, world, cal);
    expect(rows[0].title).toBe("Ice giving way");
    expect(rows[0].level).toBe("bad");
    ensureGround(state, world, state.player.region).iceCm = 20;
    expect(alerts(state, world, cal).map((a) => a.title)).not.toContain("On thin ice");
  });
});
