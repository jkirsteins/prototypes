import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLYPH, legendHtml, MARKS } from "../src/ui/map";

describe("the layout", () => {
  it("the right column is a check-in: task, forecast, log, then actions, inventory, journal", () => {
    const html = readFileSync("index.html", "utf8");
    const right = html.slice(html.indexOf('id="right"'));
    const order = ["task", "forecast", "log", "actions", "inventory", "journal"].map((id) => right.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the legend names every terrain letter the map draws", () => {
    const html = legendHtml();
    for (const letter of Object.values(GLYPH)) {
      const shown = letter === '"' ? "&quot;" : letter;
      expect(html).toContain(`<b>${shown}</b>`);
    }
  });

  it("the legend names every mark the map draws, by label, from the same table mapHtml places marks with", () => {
    const html = legendHtml();
    for (const mark of Object.values(MARKS)) {
      // The mark's letter carries its map class, so the legend's colour matches the map's.
      expect(html).toContain(`<b class="${mark.cls}">${mark.glyph}</b> ${mark.label}`);
    }
  });
});
