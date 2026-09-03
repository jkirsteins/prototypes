import { describe, expect, it, beforeEach } from "vitest";
import { rule } from "./css";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { mapHtml } from "../src/ui/map";
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
