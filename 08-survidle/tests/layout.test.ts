import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHtml } from "../src/ui/build";
import { GLYPH, legendHtml, MARKS } from "../src/ui/map";
import { rule } from "./css";

describe("the layout", () => {
  const page = () => readFileSync("index.html", "utf8");

  /**
   * One rule decides where anything goes. A tester spent a session unable
   * to tell what his survivor was doing while the thing he acted through
   * was the sixth panel down a scrolling column, so the columns now mean
   * something: you read the left, you act in the middle, and the right is
   * what runs while you are not looking.
   */
  it("left is info, middle is interactive, right is the queue", () => {
    const html = page();
    const left = html.slice(html.indexOf('id="left"'), html.indexOf('id="center"'));
    const mid = html.slice(html.indexOf('id="center"'), html.indexOf('id="right"'));
    const right = html.slice(html.indexOf('id="right"'), html.indexOf('id="build"'));

    for (const id of ["stats", "camp", "gear", "skills", "forecast"]) expect(left).toContain(`id="${id}"`);
    for (const id of ["clock", "map", "task", "panes"]) expect(mid).toContain(`id="${id}"`);
    expect(right).toContain('id="orders"');

    // The queue column holds the queue. Everything that used to be stacked
    // under it is a pane in the middle now.
    for (const id of ["log", "inventory", "journal", "actions", "forecast"]) {
      expect(right).not.toContain(`id="${id}"`);
    }
  });

  it("the away slider is the one control in the info column, beside what it changes", () => {
    const html = page();
    const left = html.slice(html.indexOf('id="left"'), html.indexOf('id="center"'));
    expect(left).toContain('data-away="hours"');
    expect(left.indexOf('id="forecast"')).toBeLessThan(left.indexOf('data-away="hours"'));
  });

  it("all four panes exist at once, three of them hidden", () => {
    const html = page();
    for (const id of ["pane-do", "pane-log", "pane-pack", "pane-journal"]) {
      expect(html).toContain(`id="${id}"`);
    }
    // Rendering a pane on demand would destroy the other three and the
    // scroll position each holds, which is the complaint this answers.
    expect((html.match(/id="pane-[a-z]+"[^>]*hidden/g) ?? []).length).toBe(3);
  });

  it("the Do pane's only scroll container is the item pane", () => {
    const html = page();
    for (const id of ["panetabs", "dosubs", "dopurposes", "doitems"]) expect(html).toContain(`id="${id}"`);
    // Scroll offset is a DOM property and is not in the markup, so it
    // survives only where the element does. One scroller, one place to lose.
    const decl = rule("#doitems");
    expect(decl).toContain("overflow-y: auto");
    expect(rule("#dopurposes")).not.toContain("overflow-y: auto");
  });

  it("the tooltip is in the markup, hidden, so it is never created or destroyed", () => {
    const html = page();
    const tip = html.indexOf('id="maptip"');
    expect(tip).toBeGreaterThan(0);
    expect(html.slice(tip, html.indexOf(">", tip))).toContain("hidden");
    // Inside the map, so its position is measured against the board.
    expect(tip).toBeGreaterThan(html.indexOf('id="map"'));
    expect(tip).toBeLessThan(html.indexOf('id="task"'));
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
