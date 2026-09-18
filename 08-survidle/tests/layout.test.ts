import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHtml } from "../src/ui/build";
import { GLYPH, legendHtml, MARKS, mapKey } from "../src/ui/map";
import { glyphStyle } from "../src/ui/palette";
import { board } from "./board";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { allOpportunityDefs, discoverOpportunity } from "../src/sim/opportunities";
import { opportunityCatalogHtml } from "../src/ui/opportunity-catalog";
import { newUiState } from "../src/ui/render";
import { css, rule } from "./css";

const day = { season: "summer", night: false };

describe("the map's own surface", () => {
  it("marks a region by a wash over it and never by a frame on each of its cells", () => {
    // A frame per cell repeats at cell scale what the wash and the region's
    // accent-coloured border already say once, and 69 of them read as graph
    // paper laid over the ground. Both the region stood in and the one picked.
    for (const token of ["cur", "sel"]) {
      const look = glyphStyle(day, ["c", "t-meadow", token]);
      expect(look.wash).not.toBeNull();
      expect(look.border).toEqual({ l: null, r: null, t: null, b: null });
    }
    // Only a real region edge draws a line, and the region stood in draws its own in the accent.
    expect(glyphStyle(day, ["c", "t-meadow", "cur", "bl"]).border.l).toBe("#e6c229");
  });

  it("has no stylesheet behind the board at all", () => {
    // Every glyph's look is the palette's (palette.ts); the cells the rules
    // used to dress are gone, and a rule for them would be a rule nothing reads.
    expect(css).not.toMatch(/\.grid \.c\b/);
    expect(css).not.toMatch(/\.grid\.night/);
    expect(css).not.toContain(".wildlife-startle");
    expect(css).not.toContain(".micro-mark");
    expect(css).not.toContain("@keyframes flicker");
  });

  it("puts the grid beyond text selection in the browsers that spell it differently", () => {
    const grid = rule(".grid");
    expect(grid).toContain("user-select: none");
    // Safari honours only the prefixed property; without it a drag across the
    // map paints a row of glyphs blue.
    expect(grid).toContain("-webkit-user-select: none");
  });

  it("draws space beyond the world like unexplored ground instead of a black bar", () => {
    const fog = glyphStyle(day, ["c", "fog"]);
    const beyond = glyphStyle(day, ["c", "void"]);
    expect(beyond.bg).toBe(fog.bg);
    expect(beyond.dot).toBe(fog.dot);
    expect(fog.dot).not.toBeNull();
    // Inherited ground is the letter dimmed, not the cell.
    expect(glyphStyle(day, ["c", "t-meadow", "dim"]).alpha).toBeLessThan(1);
    // The panel's own grain continues the map behind a small board.
    expect(rule(".scroll-x")).toContain("radial-gradient");
  });
});

describe("the layout", () => {
  const page = () => readFileSync("index.html", "utf8");

  it("anchors the catalog shell and reserves fixed row space at both breakpoints", () => {
    const shell = rule("#overlay .box.opportunity-catalog");
    expect(shell).toContain("margin: 0 auto");
    expect(shell).toContain("--opportunity-page-size: 8");
    expect(shell).toContain("--opportunity-row-height: 64px");
    expect(rule("#overlay:has(.opportunity-catalog)")).toContain("align-items: flex-start");
    const narrow = css.slice(css.indexOf("@media (max-width: 700px)"));
    expect(narrow).toMatch(/#overlay \.box\.opportunity-catalog\s*\{[^}]*--opportunity-page-size: 6;[^}]*--opportunity-row-height: 96px;/);
    expect(rule(".opportunity-body")).toContain("height: calc(var(--opportunity-page-size) * var(--opportunity-row-height) + 16px)");
    expect(rule(".opportunity-rows")).toContain("grid-template-rows: repeat(var(--opportunity-page-size), var(--opportunity-row-height))");
    expect(rule(".opportunity-rows")).not.toContain("minmax");
  });

  it.each([6, 8])("reserves the same body before navigation for lists and details with %i slots", (size) => {
    const { state } = newGame(3);
    for (const def of allOpportunityDefs()) discoverOpportunity(state.opportunities, def.key, 0, false);
    for (const detail of [null, "huntMeal", "drink"] as const) {
      document.body.innerHTML = opportunityCatalogHtml(state, { category: "food", page: 0, detail }, size);
      const dialog = document.querySelector('[role="dialog"]')!;
      const body = [...dialog.children].find((child) => child.classList.contains("opportunity-body"));
      expect(body).toBeDefined();
      expect(body!.previousElementSibling?.className).toBe("opportunity-categories");
      expect(body!.nextElementSibling?.className).toBe(detail ? "opportunity-detail-actions" : "opportunity-pages");
      if (detail === null) expect(body!.children).toHaveLength(size);
      else expect(body!.querySelector(".opportunity-steps")).not.toBeNull();
    }
  });

  it("keeps catalog pages and their controls outside nested vertical scrollers", () => {
    expect(rule("#overlay .box.opportunity-catalog")).toContain("overflow: visible");
    expect(rule("#overlay .box.opportunity-catalog")).toContain("max-height: none");
    expect(rule("#overlay:has(.opportunity-catalog)")).toContain("overflow-y: auto");
    expect(rule(".opportunity-pages")).toContain("grid-template-columns: 1fr auto 1fr");
    const rules = css.split("}").filter((block) => /\.[a-z-]*opportunity/.test(block.split("{")[0]));
    for (const block of rules.filter((block) => !block.includes("#overlay:has"))) {
      expect(block).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll)/);
    }
  });

  it("gives the speed history the whole weather footer without a dead strip below it", () => {
    expect(rule(".wx")).toContain("display: flex");
    expect(rule(".wx")).toContain("flex-direction: column");
    expect(rule(".wx-where")).toContain("margin: auto -12px 0");
    expect(rule(".wx-where")).toContain("min-height");
  });

  it("keeps weather fixed while only the activity queue scrolls", () => {
    expect(rule("#right")).toContain("overflow: hidden");
    expect(rule("#weather")).toContain("flex: none");
    expect(rule("#orders")).toContain("overflow-y: auto");
    expect(rule("#orders")).toContain("min-height: 0");
  });

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

    for (const id of ["opportunities", "shopping", "stats", "skills", "forecast"]) expect(left).toContain(`id="${id}"`);
    expect(left.indexOf('id="opportunities"')).toBeLessThan(left.indexOf('id="shopping"'));
    expect(left.indexOf('id="shopping"')).toBeLessThan(left.indexOf('id="stats"'));
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
    expect(stats).toBeLessThan(forecast);
    expect(forecast).toBeLessThan(away);
    const box = html.slice(html.indexOf('id="forecastbox"'), html.indexOf('id="skills"'));
    expect(box).toContain('id="forecast"');
    expect(box).toContain('id="away"');
    expect(rule("#forecast .row")).toContain("white-space: nowrap");
  });

  it("all six panes exist at once, five of them hidden", () => {
    const html = page();
    for (const id of ["pane-do", "pane-camp", "pane-log", "pane-pack", "pane-gear", "pane-journal"]) {
      expect(html).toContain(`id="${id}"`);
    }
    // Rendering a pane on demand would destroy the other three and the
    // scroll position each holds, which is the complaint this answers.
    expect((html.match(/id="pane-[a-z]+"[^>]*hidden/g) ?? []).length).toBe(5);
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

  it("keeps the camp inventory on the map and aligns every corner overlay to its content", () => {
    const html = page();
    const inventory = html.indexOf('id="mapinventory"');
    expect(inventory).toBeGreaterThan(html.indexOf('id="map"'));
    expect(inventory).toBeLessThan(html.indexOf('id="task"'));

    expect(rule("#map")).toContain("--map-overlay-inset: 8px");
    expect(rule("#mapinventory")).toMatch(/top:\s*var\(--map-overlay-inset\)/);
    expect(rule("#mapinventory")).toMatch(/left:\s*var\(--map-overlay-inset\)/);
    expect(rule("#mapinventory:empty")).toContain("display: none");
    expect(rule("#maptip")).toMatch(/left:\s*var\(--map-overlay-inset\)/);
  });

  it("centres the map on a fog surface without scrolling or panning", () => {
    const viewport = rule(".scroll-x");
    expect(viewport).toContain("overflow: hidden");
    expect(viewport).toContain("place-items: center");
    expect(viewport).toContain("background");
    expect(viewport).not.toContain("overflow: auto");
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

  it("settings offers browser-wide cloud shadows enabled by default", () => {
    const html = page();
    const settings = html.slice(html.indexOf('id="settings"'), html.indexOf('id="overlay"'));
    expect(settings).toContain('data-display="cloud-shadows"');
    expect(settings).toContain("clouds cast map shadows");
    expect(settings).toContain("checked");
  });

  it("settings can discard the saved world without presenting preferences as world data", () => {
    const settings = page().slice(page().indexOf('id="settings"'), page().indexOf('id="overlay"'));
    expect(settings).toContain('data-act="reset-world"');
    expect(settings).toContain("reset world data");
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
    // are the same light at a lower wattage. The lift is a redraw of those
    // glyphs over the shade (map.ts, drawLifted); a blanket lift on every
    // mark is what put a shore at full daylight brightness at midnight.
    const source = readFileSync("src/ui/map.ts", "utf8");
    const lifted = source.slice(source.indexOf("function drawLifted("), source.indexOf("const RECOIL_MS"));
    for (const mark of ["mk-player", "mk-camp", "mk-fire", "mk-coals"]) expect(lifted).toContain(`"${mark}"`);
    expect(lifted).not.toContain('"mk"');
    expect(lifted).not.toContain("mk-shelter");
    expect(lifted).not.toContain("mk-seep");
  });

  it("marks only what the survivor built or found, never ground the world always had", () => {
    // A named place is not clickable, the HERE panel lists every one of them
    // with a walk button, and an order walks there on its own.
    expect(Object.values(MARKS).map((m) => m.label).sort()).toEqual(["camp", "coals", "fire", "known bear den", "seep", "shelter", "trap", "you"]);
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
      const b = board(world, state, ui, cal);
      expect(b.season).toBe(cal.season);
      expect(b.gridClasses).toContain(`season-${cal.season}`);
      seen.add(cal.season);
    }
    expect([...seen].sort()).toEqual(["autumn", "spring", "summer", "winter"]);
    const spring = calendar(12 * 60, 100);
    const autumn = calendar(12 * 60, 280);
    expect(mapKey(state, world, ui, spring)).not.toBe(mapKey(state, world, ui, autumn));
  });

  it("lets snow beat the season, whatever the month says", () => {
    // Snow is on the ground or it is not, whatever the month says.
    const winter = { season: "winter", night: false };
    const autumn = { season: "autumn", night: false };
    expect(glyphStyle(winter, ["c", "t-birch", "ground-snow"]).fg).toBe(glyphStyle(day, ["c", "t-birch", "ground-snow"]).fg);
    expect(glyphStyle(autumn, ["c", "t-birch", "ground-snow"]).fg).toBe(glyphStyle(day, ["c", "t-birch", "ground-snow"]).fg);
    // And without snow the season shows: the bare birch is gold in autumn and bare wood in winter.
    expect(glyphStyle(autumn, ["c", "t-birch"]).fg).toBe("#f0b93f");
    expect(glyphStyle(winter, ["c", "t-birch"]).fg).toBe("#8a7256");
  });

  it("keeps the evergreens green under snow, and buries them only once it is deep", () => {
    // Snow in the needles lifts and cools the green; it does not replace it.
    expect(glyphStyle(day, ["c", "t-spruce", "ground-snow"]).fg).toBe("#6f9e78");
    // The bare birch takes the colour of the snow around it straight away.
    expect(glyphStyle(day, ["c", "t-birch", "ground-snow"]).fg).toBe("#9fb8c8");
    // Past DEEP_SNOW_CM there is more snow than tree to see.
    expect(glyphStyle(day, ["c", "t-spruce", "ground-snow", "ground-snow-deep"]).fg).toBe("#c3d6dd");
  });

  it("lets snow flatten the relief", () => {
    // A toned tree under snow goes the snow's colour like its untoned
    // neighbour, with the height left on the letter's brightness alone.
    const plain = glyphStyle(day, ["c", "t-spruce", "ground-snow"]);
    const toned = glyphStyle(day, ["c", "t-spruce", "ground-snow", "tone-0"]);
    expect(toned.bg).toBe(plain.bg);
    expect(toned.fg).not.toBe(glyphStyle(day, ["c", "t-spruce", "tone-0"]).fg);
    // Depth is bare water's alone: ice has no shallows.
    expect(glyphStyle(day, ["c", "t-water", "deep-0", "ice-safe"]).bg).toBe(glyphStyle(day, ["c", "t-water", "ice-safe"]).bg);
  });
});

describe("a mark owns its whole cell", () => {
  it("lets no conditional ground look touch one", () => {
    // Whatever the ground under a mark is doing - a tone, a depth, a season,
    // snow - the mark keeps its own colours. Miss one and the @ takes the
    // ground's colour on the cells it matches and its own back on the cells
    // it does not: a survivor who flickers as they walk, and a camp that
    // comes and goes.
    const you = glyphStyle(day, ["c", "t-meadow", "mk", "mk-player", "mood-idle"]);
    for (const grid of [day, { season: "autumn", night: false }, { season: "winter", night: true }]) {
      for (const ground of [["t-meadow", "tone-0"], ["t-meadow", "tone-2", "turned"], ["t-water", "deep-2"], ["t-spruce", "ground-snow", "tone-2"], ["t-birch"]]) {
        const look = glyphStyle(grid, ["c", ...ground, "mk", "mk-player", "mood-idle"]);
        expect(look.bg, `${grid.season} ${ground.join(" ")}`).toBe(you.bg);
        expect(look.fg, `${grid.season} ${ground.join(" ")}`).toBe(you.fg);
      }
    }
  });
});

describe("the phone", () => {
  // The audit of 2026-09-18 at 390 wide with touch emulation found the
  // board a 94px strip of the empty west of the world, the boat's three
  // cards 40px each over 200px of person, and the page tabs three panels
  // above the panel they switch. Each of these is one declaration.
  const narrow = css.slice(css.indexOf("@media (max-width: 700px) {\n  /* One column"));

  it("centres the board on the survivor in both axes, whatever the panel's width", () => {
    const track = rule(".scroll-x");
    expect(track).toContain("grid-template-rows: minmax(0, 1fr)");
    expect(track).toContain("grid-template-columns: minmax(0, 1fr)");
    // An auto margin on the item would beat that alignment and, once the
    // board overflows, resolve to zero: the board pinned to the left.
    expect(rule(".grid")).not.toMatch(/margin:\s*0 auto/);
  });

  it("gives the board a height of its own instead of what the legend leaves", () => {
    expect(narrow).toMatch(/#map \{ height: auto; \}/);
    expect(narrow).toMatch(/#mapdyn \{[^}]*flex: none;[^}]*height: 70vh;/);
  });

  it("folds the legend behind its button on touch, so the board keeps the screen", () => {
    const touch = css.slice(css.indexOf("@media (hover: none) {"));
    expect(rule("#map .legend")).toContain("display: none");
    expect(rule("#map .legendtoggle")).toContain("display: none");
    expect(touch).toMatch(/#map \.legendtoggle \{ display: inline-block;/);
    expect(touch).toMatch(/#map\.legend-open \.legend \{ display: flex; \}/);
    expect(touch).not.toMatch(/\n {2}#map \.legend \{ display: flex; \}/);
    expect(readFileSync("index.html", "utf8")).toContain('data-act="legend-toggle"');
  });

  it("stacks the boat's cards at their own height", () => {
    expect(narrow).toMatch(/\.card \{ flex: none; \}/);
  });

  it("keeps the page tabs with the panel they switch", () => {
    expect(narrow).toMatch(/#rightpages \{ order: 3; \}/);
    expect(narrow).toMatch(/#alerts \{ order: 3; \}/);
    expect(narrow).toMatch(/#weather \{ order: 3; \}/);
  });
});
