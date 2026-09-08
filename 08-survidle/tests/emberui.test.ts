import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { EMBER_MINUTES, hasEmbers } from "../src/sim/fire";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { updateBars } from "../src/ui/bars";
import { lightSources } from "../src/ui/map";
import { regionHtml } from "../src/ui/panels";
import { newUiState, setPanel } from "../src/ui/render";

/** A lit fire at camp with a small fuel load and nobody tending it, so it burns down on its own. */
function litCamp(seed = 3, fuelKg = 1) {
  const { state, world } = newGame(seed);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell);
  st.structures.firePit = true;
  st.fire.lit = true;
  st.fire.fuelKg = fuelKg;
  st.fire.wetKg = 0;
  st.fire.litSince = state.minute;
  state.player.autoFeed = false;
  return { state, world, st };
}

describe("the HERE panel's fire line", () => {
  it("reads a third word for coals, neither burning nor cold", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    const html = regionHtml(state, world, calendar(state.minute, state.startDoy), newUiState());
    expect(html).toMatch(/coals/);
    expect(html).not.toMatch(/>burning/);
    expect(html).not.toMatch(/>cold</);
  });

  it("still reads burning while fed, and reads cold again once the coals are spent", () => {
    const { state: litState, world: litWorld } = litCamp(3, 30);
    const litHtml = regionHtml(litState, litWorld, calendar(litState.minute, litState.startDoy), newUiState());
    expect(litHtml).toMatch(/burning/);

    const { state, world, st } = litCamp();
    advance(state, world, 120 + EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    expect(st.fire.lit).toBe(false);
    const coldHtml = regionHtml(state, world, calendar(state.minute, state.startDoy), newUiState());
    expect(coldHtml).toMatch(/cold/);
    expect(coldHtml).not.toMatch(/coals/);
  });
});

describe("the map's ember light", () => {
  it("keeps an ember camp in lightSources, reaching only its own cell", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    const sources = lightSources(state, world);
    const mine = sources.find((s) => s.cell === st.campCell);
    expect(mine).toBeTruthy();
    expect(mine!.reach).toBe(0);
  });

  it("drops a dead fire from the light sources entirely, same as it never lit", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120 + EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    const sources = lightSources(state, world);
    expect(sources.find((s) => s.cell === st.campCell)).toBeUndefined();
  });
});

describe("the fuel bar's text at embers", () => {
  it("says coals rather than the 0.0 kg a dead fire would read", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120);
    expect(hasEmbers(st.fire)).toBe(true);
    const cal = calendar(state.minute, state.startDoy);
    document.body.insertAdjacentHTML("beforeend", `<div id="region"></div>`);
    setPanel("region", regionHtml(state, world, cal, newUiState()));
    updateBars(state, world);
    const text = document.querySelector("#val-fire")!.textContent;
    expect(text).not.toMatch(/0\.0 kg/);
    expect(text).toMatch(/coals/);
  });

  it("reads the plain kg text once the fire is actually dead", () => {
    const { state, world, st } = litCamp();
    advance(state, world, 120 + EMBER_MINUTES + 60);
    expect(hasEmbers(st.fire)).toBe(false);
    const cal = calendar(state.minute, state.startDoy);
    document.body.insertAdjacentHTML("beforeend", `<div id="region"></div>`);
    setPanel("region", regionHtml(state, world, cal, newUiState()));
    updateBars(state, world);
    const text = document.querySelector("#val-fire")!.textContent;
    expect(text).toMatch(/0\.0 kg/);
    expect(text).not.toMatch(/coals/);
  });
});
