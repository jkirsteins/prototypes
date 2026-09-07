import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHtml } from "../src/ui/build";
import { GLYPH, legendHtml, MARKS } from "../src/ui/map";
import { css, rule } from "./css";

describe("the map's own surface", () => {
  it("marks a region by a wash over it and never by a frame on each of its cells", () => {
    // A frame per cell repeats at cell scale what the wash and the region's
    // accent-coloured border already say once, and 69 of them read as graph
    // paper laid over the ground. Both the region stood in and the one picked.
    for (const sel of [".grid .c.cur", ".grid .c.sel"]) {
      expect(rule(sel)).toContain("box-shadow");
      expect(rule(sel)).not.toContain("outline");
    }
  });

  it("puts the grid beyond text selection in the browsers that spell it differently", () => {
    const grid = rule(".grid");
    expect(grid).toContain("user-select: none");
    // Safari honours only the prefixed property; without it a drag across the
    // map paints a row of glyphs blue.
    expect(grid).toContain("-webkit-user-select: none");
  });

  it("keeps fog, void and dim tellable apart, since all three read as dark ground", () => {
    // Fog carries a grain the void does not, and dim is a drawn glyph at
    // reduced opacity rather than a colour: three states, three readings.
    expect(css).toContain(".grid .c.fog::before");
    expect(rule(".grid .c.void")).toContain("background");
    expect(rule(".grid .c.dim")).toContain("opacity");
  });
});

describe("the layout", () => {
  it("the right column is a check-in: task, forecast, log, then actions, inventory, journal", () => {
    const html = readFileSync("index.html", "utf8");
    const right = html.slice(html.indexOf('id="right"'));
    const order = ["task", "forecast", "log", "actions", "inventory", "journal"].map((id) => right.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the sound and the beacon live in a settings panel that is hidden until it is asked for", () => {
    const html = readFileSync("index.html", "utf8");
    const open = html.indexOf('data-act="settings-open"');
    expect(open).toBeGreaterThan(0);
    const settings = html.indexOf('id="settings"');
    expect(settings).toBeGreaterThan(0);
    // Hidden on the same element, so a fresh page spends no room on either control.
    const tag = html.slice(settings, html.indexOf(">", settings));
    expect(tag).toContain("hidden");
    // Both controls inside it, and neither left behind in a column.
    const close = html.indexOf("</div>", html.indexOf('data-act="settings-close"'));
    const inside = html.slice(settings, html.indexOf('id="overlay"'));
    expect(inside).toContain('id="sound"');
    expect(inside).toContain('id="beacon"');
    expect(close).toBeGreaterThan(0);
    const columns = html.slice(html.indexOf('id="app"'), settings);
    expect(columns).not.toContain('id="sound"');
    expect(columns).not.toContain('id="beacon"');
  });

  it("the page ends in a footer naming the build, filled from the version the bundle was built with", () => {
    const html = readFileSync("index.html", "utf8");
    const footer = html.indexOf('id="build"');
    expect(footer).toBeGreaterThan(html.indexOf("</div>", html.indexOf('id="app"')));
    expect(html.slice(footer - 20, footer)).toContain("footer");
  });

  it("the footer says what git describe said, and reads dev where git could not be asked", () => {
    expect(buildHtml("336a797", "2026-09-07 14:12 UTC")).toContain("336a797");
    // When it was built is the title rather than more text in the corner.
    expect(buildHtml("336a797", "2026-09-07 14:12 UTC")).toContain('title="built 2026-09-07 14:12 UTC"');
    expect(buildHtml("v0.3-2-gabc1234-dirty", "")).toContain("v0.3-2-gabc1234-dirty");
    expect(buildHtml("dev", "")).toContain("dev");
    expect(buildHtml("dev", "")).not.toContain("title=");
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
