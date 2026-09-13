import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { campMeltReady, currentNeed } from "../src/sim/body";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { ensureGround } from "../src/sim/weather";
import { testAtmosphere } from "./weather-helpers";
import { siteCamp } from "./siting-helpers";

/**
 * The thirst need is gated on being able to quench at all, so a body that can
 * neither drink nor walk to water nor melt keeps no thirst row. These two cases
 * are the ends of that gate: melting at the fire, and a walk to water.
 */
describe("the thirst need opens", () => {
  it("at camp, over snow and a lit fire, with no vessel and the water iced over", () => {
    testAtmosphere();
    const { state, world } = newGame(42);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    Object.assign(ensureGround(state, world, state.player.region), { iceCm: 4, snowCm: 5 });
    siteFor(st, st.campCell!).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.player.tools = state.player.tools.filter((t) => (t.litres ?? 0) === 0 && t.id !== "axe");
    state.player.water = 0.8;
    expect(campMeltReady(state, world, calendar(state.minute))).toBe(true);
    expect(currentNeed(state, world, calendar(state.minute))).toBe("thirsty");
  });

  it("away from the water, as a walk to it", () => {
    testAtmosphere();
    const { state, world } = newGame(42);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    state.player.tools = state.player.tools.filter((t) => (t.litres ?? 0) === 0);
    state.player.water = 0.8;
    advance(state, world, 1);
    expect(state.player.bodyNeed).toBe("thirsty");
    expect(state.intent?.step).toMatch(/for water$/);
  });
});
