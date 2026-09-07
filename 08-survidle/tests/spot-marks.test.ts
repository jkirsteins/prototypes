import { beforeEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { DEFAULT_ZOOM, legendHtml, MARKS, mapHtml, SPOT_MARKS } from "../src/ui/map";
import { newUiState, setPanel } from "../src/ui/render";
import type { SpotId } from "../src/sim/types";

function draw(zoom: number) {
  const { state, world } = newGame(21);
  const ui = newUiState();
  ui.zoom = zoom;
  setPanel("map", mapHtml(world, state, ui, calendar(12 * 60)));
  return { state, world };
}

function marksDrawn(): string[] {
  return [...document.querySelectorAll("#map .c.mk-spot")].map((e) => e.textContent ?? "");
}

beforeEach(() => {
  document.body.innerHTML = '<div id="map"></div>';
});

describe("the named places on the map", () => {
  it("appear closer than the map opens at, which is what zooming in buys", () => {
    draw(DEFAULT_ZOOM - 1);
    expect(marksDrawn().length).toBeGreaterThan(0);
  });

  it("are not drawn at the rung the map opens at, nor at any coarser one", () => {
    for (let z = DEFAULT_ZOOM; z <= DEFAULT_ZOOM + 2; z++) {
      document.body.innerHTML = '<div id="map"></div>';
      draw(z);
      expect(marksDrawn(), `rung ${z}`).toEqual([]);
    }
  });

  it("draw only places whose region has been walked in", () => {
    // A fresh landing has visited one region; every mark drawn must sit in it.
    const { state, world } = draw(0);
    const visited = new Set(Object.keys(state.regions).map(Number));
    const spotCells = new Set<number>();
    for (const id of visited) {
      for (const sp of world.regions.get(id)?.spots ?? []) if (SPOT_MARKS[sp.id]) spotCells.add(sp.cell);
    }
    expect(spotCells.size).toBeGreaterThan(0);
    expect(marksDrawn().length).toBeLessThanOrEqual(spotCells.size);
  });

  it("never hide what the player built there", () => {
    const { state, world } = newGame(21);
    const ui = newUiState();
    ui.zoom = 0;
    placeAtSpot(state, world, state.player.region, "forest");
    setPanel("map", mapHtml(world, state, ui, calendar(12 * 60)));
    // The player's own glyph wins its cell outright.
    const you = document.querySelectorAll("#map .c.mk-player");
    expect(you.length).toBe(1);
    expect(you[0].textContent).toBe(MARKS.you.glyph);
    expect(you[0].classList.contains("mk-spot")).toBe(false);
  });

  it("say their name on hover", () => {
    draw(0);
    const mark = document.querySelector("#map .c.mk-spot");
    expect(mark).not.toBeNull();
    const names = Object.values(SPOT_MARKS).map((m) => m?.label);
    expect(names.some((n) => mark?.getAttribute("title")?.startsWith(`${n},`))).toBe(true);
  });

  it("are named in the legend, like every other mark", () => {
    const key = legendHtml();
    for (const id of Object.keys(SPOT_MARKS) as SpotId[]) {
      const m = SPOT_MARKS[id];
      if (!m) continue;
      expect(key).toContain(m.glyph);
      expect(key).toContain(m.label);
    }
  });

  it("give each place its own glyph, sharing none with the ground or another mark", () => {
    const glyphs = Object.values(MARKS).map((m) => m.glyph);
    expect(new Set(glyphs).size, `duplicate mark glyphs in ${glyphs.join("")}`).toBe(glyphs.length);
  });

});
