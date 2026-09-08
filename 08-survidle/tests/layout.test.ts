import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHtml } from "../src/ui/build";
import { GLYPH, legendHtml, MARKS, mapHtml, mapKey } from "../src/ui/map";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { newUiState } from "../src/ui/render";
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

    for (const id of ["goals", "stats", "gear", "skills", "forecast"]) expect(left).toContain(`id="${id}"`);
    // The clock is gone: the day and the hour are three lines in the weather
    // widget, and the row it took is map now.
    for (const id of ["map", "task", "panes"]) expect(mid).toContain(`id="${id}"`);
    expect(mid).not.toContain('id="clock"');
    expect(right).toContain('id="orders"');
    // The weather sits above the queue, by the author's direction.
    expect(right).toContain('id="weather"');

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
    const stats = left.indexOf('id="stats"');
    const forecast = left.indexOf('id="forecast"');
    const away = left.indexOf('data-away="hours"');
    const gear = left.indexOf('id="gear"');
    expect(stats).toBeLessThan(forecast);
    expect(forecast).toBeLessThan(away);
    expect(away).toBeLessThan(gear);
  });

  it("all five panes exist at once, four of them hidden", () => {
    const html = page();
    for (const id of ["pane-do", "pane-camp", "pane-log", "pane-pack", "pane-journal"]) {
      expect(html).toContain(`id="${id}"`);
    }
    // Rendering a pane on demand would destroy the other three and the
    // scroll position each holds, which is the complaint this answers.
    expect((html.match(/id="pane-[a-z]+"[^>]*hidden/g) ?? []).length).toBe(4);
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

  it("settings offers one browser-wide travel estimate format", () => {
    const html = page();
    const settings = html.slice(html.indexOf('id="settings"'), html.indexOf('id="overlay"'));
    expect((settings.match(/data-display="travel"/g) ?? []).length).toBe(1);
    for (const value of ["distance", "time", "both"]) expect(settings).toContain(`value="${value}"`);
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

describe("what survives the night sheet", () => {
  it("lifts you, camp, the fire and its banked coals over it, and leaves every other mark under it", () => {
    // Where you are, where camp is and the line of your walk are what you would
    // know in the dark without looking. The fire is over it because it is the
    // light, and its own cell already rises at the close rungs; banked coals
    // are the same light at a lower wattage.
    const lifted = rule(".grid .c.mk-player, .grid .c.mk-camp, .grid .c.mk-fire, .grid .c.mk-coals");
    expect(lifted).toContain("z-index: 1");
    // The blanket lift on every mark is what put a shore at full daylight
    // brightness at midnight.
    expect(rule(".grid .c.mk")).not.toContain("z-index");
  });

  it("marks only what the survivor built or found, never ground the world always had", () => {
    // A named place is not clickable, the HERE panel lists every one of them
    // with a walk button, and an order walks there on its own.
    expect(Object.values(MARKS).map((m) => m.label).sort()).toEqual(["camp", "coals", "fire", "seep", "shelter", "trap", "you"]);
    for (const gone of ["forest", "outcrop", "shore", "heath"]) {
      expect(legendHtml()).not.toContain(`> ${gone}<`);
    }
  });
});

describe("the year on the map", () => {
  it("names the season on the grid and in the map's key, so a redraw follows the calendar", () => {
    const { state, world } = newGame(17);
    const ui = newUiState();
    const seen = new Set<string>();
    // One date in each season of the run's first year.
    for (const doy of [100, 190, 280, 20]) {
      const cal = calendar(12 * 60, doy);
      const html = mapHtml(world, state, ui, cal);
      expect(html).toContain(`grid season-${cal.season}`);
      seen.add(cal.season);
    }
    expect([...seen].sort()).toEqual(["autumn", "spring", "summer", "winter"]);
    const spring = calendar(12 * 60, 100);
    const autumn = calendar(12 * 60, 280);
    expect(mapKey(state, world, ui, spring)).not.toBe(mapKey(state, world, ui, autumn));
  });

  it("lets snow beat the season by selector, not by where the rules sit in the file", () => {
    // Snow is on the ground or it is not, whatever the month says. A later edit
    // that moves a block must not silently flip which one wins.
    expect(css).toContain(".grid.season-winter:not(.snow)");
    expect(css).toContain(".grid.season-autumn:not(.snow)");
  });

  it("keeps the evergreens green under snow, and buries them only once it is deep", () => {
    // Snow in the needles lifts and cools the green; it does not replace it.
    expect(rule(".grid.snow .c:not(.mk).t-spruce")).toContain("#6f9e78");
    // The bare birch takes the colour of the snow around it straight away.
    expect(rule(".grid.snow .c:not(.mk).t-birch")).toContain("#9fb8c8");
    // Past DEEP_SNOW_CM there is more snow than tree to see.
    expect(rule(".grid.snow-deep .c:not(.mk).t-spruce")).toContain("#c3d6dd");
  });

  it("lets snow flatten the relief, by selector rather than by file order", () => {
    // A tone rule sits later in the file than the snow rules at equal
    // specificity, so without the guard a toned tree would keep its green
    // under snow while its untoned neighbour went white.
    expect(css).toContain(".grid:not(.snow) .c:not(.mk).t-spruce.tone-0");
    expect(css).toContain(".grid:not(.snow) .c:not(.mk).t-water.deep-0");
  });
});

describe("a mark owns its whole cell", () => {
  it("lets no conditional ground rule touch one", () => {
    // Every rule that paints ground under a condition - a tone, a depth, a
    // season, snow - carries more classes than the mark rules do and so wins on
    // specificity. Miss one and the @ takes the ground's colour on the cells it
    // matches and its own back on the cells it does not: a survivor who
    // flickers as they walk, and a camp that comes and goes.
    const conditional = css
      .split("\n")
      .filter((line) => /^\.grid[.:]/.test(line) && / \.c[.:]/.test(line) && line.includes("{"))
      .filter((line) => /\.t-\w+|\.tone-|\.deep-/.test(line));
    expect(conditional.length).toBeGreaterThan(20);
    for (const line of conditional) expect(line).toContain(".c:not(.mk)");
  });
});
