import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLYPH, legendHtml } from "../src/ui/map";

describe("the layout", () => {
  it("the right column is a check-in: task, forecast, log, then actions, inventory, journal", () => {
    const html = readFileSync("index.html", "utf8");
    const right = html.slice(html.indexOf('id="right"'));
    const order = ["task", "forecast", "log", "actions", "inventory", "journal"].map((id) => right.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the legend names every terrain letter the map draws, and the survivor and camp marks", () => {
    const html = legendHtml();
    for (const letter of Object.values(GLYPH)) {
      const shown = letter === '"' ? "&quot;" : letter;
      expect(html).toContain(`<b>${shown}</b>`);
    }
    expect(html).toContain("<b>@</b>");
    expect(html).toContain("<b>H</b>");
    expect(html).toContain("<b>F</b>");
  });
});
