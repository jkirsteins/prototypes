import { describe, expect, it, beforeEach } from "vitest";
import { css, rule } from "./css";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { mapHtml, mapKey } from "../src/ui/map";
import { newUiState, setPanel, resetPanels } from "../src/ui/render";
import { updateSky } from "../src/ui/sky";

describe("terrain colour", () => {
  const backgrounds: Record<string, string> = {
    water: "#0a1633", spruce: "#0b1f11", pine: "#0e2415", birch: "#1a2a12",
    meadow: "#171f0f", bog: "#0b221f", rock: "#1a1c20", fell: "#22252b",
  };

  it("every terrain glyph sits on a dark background of its own hue", () => {
    for (const [t, bg] of Object.entries(backgrounds)) {
      expect(rule(`.grid .c.t-${t}`)).toContain(`background: ${bg}`);
    }
  });

  it("the region and route highlights are overlays, not backgrounds", () => {
    for (const sel of [".grid .c.cur", ".grid .c.sel", ".grid .c.rt"]) {
      const body = rule(sel);
      expect(body).toContain("box-shadow: inset 0 0 0 20px");
      expect(body).not.toContain("background");
    }
  });
});

describe("night shade", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="map"></div>`;
    resetPanels();
  });

  it("the grid darkens through a shade layer, not a brightness filter", () => {
    expect(rule(".grid")).not.toContain("brightness(");
    expect(rule(".grid")).toContain("saturate(var(--sat))");
    expect(rule(".grid .shade")).toContain("opacity: calc(1 - var(--bright))");
  });

  it("the map carries one shade element and the sky still sets its brightness", () => {
    const { state, world } = newGame(21);
    const night = calendar(16 * 60);
    setPanel("map", mapHtml(world, state, newUiState(), night));
    expect(document.querySelectorAll("#map .grid .shade").length).toBe(1);
    updateSky(state, night, -5);
    expect(document.querySelector<HTMLElement>("#map .grid")!.style.getPropertyValue("--bright")).toBe("0.550");
  });
});

describe("firelight", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="map"></div>`;
    resetPanels();
  });
  const night = calendar(16 * 60);
  const day = calendar(4 * 60);
  const lit = (cls: string) => document.querySelectorAll(`#map .c.${cls}`).length;
  const draw = (state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], cal = night, zoom = 0) =>
    setPanel("map", mapHtml(world, state, { ...newUiState(), zoom }, cal));

  it("a full fire lights the camp glyph and two rings around it, corners cut", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    draw(state, world);
    expect(lit("lit-0")).toBe(1);
    expect(lit("lit-1")).toBe(8);
    expect(lit("lit-2")).toBe(12);
    expect(document.querySelector("#map .c.lit-0.mk-player")).not.toBeNull();
    expect(document.querySelectorAll("#map .c[style*='--fd:-']").length).toBe(21);
  });

  it("a low fire lights one ring; a cold fire none; daylight none", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 2;
    draw(state, world);
    expect(lit("lit-0") + lit("lit-1") + lit("lit-2")).toBe(9);
    draw(state, world, day);
    expect(lit("lit-0") + lit("lit-1") + lit("lit-2")).toBe(0);
    expect(document.querySelector("#map .grid.night")).toBeNull();
    st.fire.lit = false;
    draw(state, world);
    expect(lit("lit-0") + lit("lit-1") + lit("lit-2")).toBe(0);
  });

  it("at three cells per glyph only the source glyph glows", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    draw(state, world, night, 1);
    expect(lit("lit-0")).toBe(1);
    expect(lit("lit-1") + lit("lit-2")).toBe(0);
  });

  it("your fire glows from the forest too, and the key changes when it burns low", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    placeAtSpot(state, world, state.player.region, "forest");
    const k1 = mapKey(state, world, newUiState(), night);
    draw(state, world);
    expect(document.querySelector("#map .c.lit-0.mk-fire")).not.toBeNull();
    st.fire.fuelKg = 2;
    expect(mapKey(state, world, newUiState(), night)).not.toBe(k1);
  });

  it("the flicker rules and the delay are what the stylesheet expects", () => {
    expect(rule(".grid.night .c.lit-0")).toContain("animation: flicker");
    expect(rule(".grid .c.lit-1::after, .grid .c.lit-2::after")).toContain("z-index: 2");
    expect(css).toContain("@keyframes flicker");
    expect(rule(".grid.night .c.mk-fire")).toContain("animation: flicker");
  });
});
