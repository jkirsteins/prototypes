// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mountMapInspection } from "../src/ui/map";

describe("map inspection", () => {
  it("uses one top-left readout for pointer and keyboard inspection", () => {
    document.body.innerHTML = `
      <div id="mapdyn">
        <div class="grid" tabindex="0">
          <span class="c" role="gridcell" data-map-info="spruce; known bear den" data-map-x="0" data-map-y="0">D</span>
          <span class="c" role="gridcell" data-map-info="bog; wolf pack, 4, hunting" data-map-x="1" data-map-y="0">w</span>
          <output class="map-inspect">Map: point at a glyph.</output>
        </div>
      </div>`;
    const root = document.getElementById("mapdyn")!;
    mountMapInspection(root);
    const cells = root.querySelectorAll<HTMLElement>("[data-map-info]");
    const output = root.querySelector<HTMLOutputElement>(".map-inspect")!;

    cells[0].dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(output.textContent).toBe("spruce; known bear den");

    const grid = root.querySelector<HTMLElement>(".grid")!;
    grid.focus();
    grid.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(cells[1]);
    expect(output.textContent).toBe("bog; wolf pack, 4, hunting");
  });
});
