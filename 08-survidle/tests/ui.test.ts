import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, pile } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { LEAN_KCAL_PER_DAY, RECIPE_IDS, STRUCTURE_IDS } from "../src/sim/items";
import { isKnown, knownShare, mapRegion, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { addOrder, moveOrder } from "../src/sim/orders";
import { die } from "../src/sim/player";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { discovery, regionState, SEEN } from "../src/sim/regionstate";
import { levelMinutes, poolCapacity } from "../src/sim/skills";
import { startTask, stepTask, stopTask } from "../src/sim/tasks";
import { ambientTemperature } from "../src/sim/weather";
import { applyRow, beginRequest, emptyView } from "../src/sim/forecaster";
import { updateBars, updateHurryBar } from "../src/ui/bars";
import { DEFAULT_ZOOM, LEVELS, mapHtml, mapKey, viewOrigin, ZOOMS } from "../src/ui/map";
import { lighting } from "../src/ui/sky";
import { doHtml } from "../src/ui/dopanel";
import { campHtml, forecastHtml, instantHtml, inventoryHtml, placesHtml, queueHtml, skillsHtml, statsHtml, taskHtml, tombstoneHtml, travelHtml, weatherHtml } from "../src/ui/panels";
import { commitChoiceN, defaultChoice, newUiState, resetPanels, rowRequest, setPanel } from "../src/ui/render";
import { allPanesHtml, paneFor, paneHtml } from "./pane";
import { tipHtml } from "../src/ui/tip";
import { hurryClick, hurryKind, newHurry } from "../src/ui/hurry";
import { fishSpecies, huntedLand } from "../src/sim/species";
import { cellAt, neighbours, regionAt, spotOf } from "../src/world/gen";
import { findRoute } from "../src/world/route";

/**
 * Everything the player can reach, from the panels they actually have: the Do
 * list, the map's own corner, which holds the walks and the ways out, and the
 * Pack panel that holds the haul. There is no second list behind a toggle and
 * no region panel any more, so reachability is measured against these or it is
 * not measured at all.
 *
 * The Do list shows one subtab and one purpose at a time, so all of it means
 * all of them. Nothing is hidden behind a "more" any more: a pane holds a
 * handful of rows and shows every one, saying why where it cannot be started.
 */
function allActions(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"]) {
  const cal = calendar(state.minute);
  return [allPanesHtml(state, world, cal), placesHtml(state, world, cal), travelHtml(state, world, cal), inventoryHtml(state, world, cal)].join("\n");
}

describe("reachability: everything in the catalogue has a button", () => {
  const { state, world } = newGame(21);
  // A walk is only offered over ground the survivor knows, so this asks its
  // question of a survivor who has been round their own valley and the next.
  mapRegion(state, world, state.player.region);
  for (const nb of regionAt(world, state.player.region).neighbours) mapRegion(state, world, nb.id);
  const html = allActions(state, world);

  it("every recipe", () => {
    for (const id of RECIPE_IDS) expect(html).toContain(`data-opt="intent:craft:${id}"`);
  });
  it("every structure", () => {
    for (const id of STRUCTURE_IDS) expect(html).toContain(`data-opt="intent:build:${id}"`);
  });
  it("every mend, even a lean-to and a rack not yet built", () => {
    for (const id of ["leanTo", "dryingRack"]) expect(html).toContain(`data-opt="intent:mend:${id}"`);
  });
  it("every animal the region holds, and nothing it does not", () => {
    const r = regionAt(world, state.player.region);
    const here = huntedLand().filter((s) => r.capacity[s]);
    expect(here.length).toBeGreaterThan(0);
    for (const s of here) expect(html).toContain(`data-opt="intent:hunt:${s}"`);
    for (const s of huntedLand()) if (!r.capacity[s]) expect(html).not.toContain(`data-opt="intent:hunt:${s}"`);
    for (const s of fishSpecies()) expect(html.includes(`data-opt="intent:fish:${s}"`)).toBe(Boolean(r.capacity[s]));
  });
  it("every gather and camp task, in the Do list", () => {
    for (const id of ["chop", "sticks", "bark", "stone", "berries", "split", "cook", "light", "lightTorch", "sharpen", "repair", "rest", "sleep"]) {
      expect(html).toContain(`data-opt="intent:${id}:`);
    }
  });
  it("every walk out of camp, in the map's places list", () => {
    for (const s of regionAt(world, state.player.region).spots) {
      if (s.id !== "camp") expect(html).toContain(`data-id="walk" data-arg="spot:${s.id}"`);
    }
  });
  it("every road out, in the map's corner, without picking anything first", () => {
    // A road out used to be offered only by a region you had selected on the
    // map, so a player who never worked out that regions were clickable never
    // learned there was anywhere to go. Every neighbour is listed, always.
    const cal = calendar(state.minute);
    const ways = travelHtml(state, world, cal);
    for (const nb of regionAt(world, state.player.region).neighbours) {
      expect(ways).toContain(`data-arg="region:${nb.id}"`);
    }
  });
  it("shows a legal button, not a greyed one, when the inputs are there", () => {
    const rich = newGame(21);
    addItem(rich.state.player.pack, "bark", 3);
    const h = allActions(rich.state, rich.world);
    expect(h).toContain(`data-act="intent" data-id="craft" data-arg="cordage"`);
  });
  it("offers a real mend button once a lean-to stands worn and the sticks are in reach", () => {
    const worn = newGame(21);
    const st = regionState(worn.state, worn.world, worn.state.player.region);
    st.structures.leanTo = true;
    st.structureAge.leanTo = 244 * 1440;
    addItem(worn.state.player.pack, "stick", 2);
    const h = allActions(worn.state, worn.world);
    expect(h).toContain(`data-act="intent" data-id="mend" data-arg="leanTo"`);
  });
  it("names the ground to stand on when work is greyed", () => {
    expect(html).toMatch(/Fell a tree.*forest/s);
    expect(html).toMatch(/Gather stone.*(rock|outcrop)/s);
  });
  it("every option that trains says which skill it is under and what its practice is called", () => {
    document.body.innerHTML = html;
    // The breadcrumb is the whole point: a row's number is a child of the skill
    // named beside it, so "Woodcraft > Spruce felling 1" under "Woodcraft 2" in
    // the Skills panel reads as one tree rather than two numbers that disagree.
    expect(document.querySelector('[data-opt="intent:chop:"] small.crumb')?.textContent)
      .toBe("Woodcraft > Spruce felling 1");
    // Walking trains nothing, so it carries neither breadcrumb nor bar.
    expect(document.querySelector('[data-opt="intent:rest:"] small.crumb')).toBeNull();
    expect(document.querySelector('[data-opt="intent:hunt:elk"] small.rec.warn')?.textContent).toBe("Hunting 8, you are 1");
  });

  it("the bar under a row aims at the next thing practice buys, and a key that buys nothing more has none", () => {
    document.body.innerHTML = html;
    // Felling promises an extra stick per tree at mastery 20; the bar fills toward
    // that rather than toward the next digit, which is 0.25% speed and unfelt.
    const bar = document.querySelector('[data-opt="intent:chop:"] .bar.mastery');
    expect(bar?.getAttribute("title")).toBe("an extra stick per tree at 20");
    expect(bar?.querySelector(".fill")?.getAttribute("data-fill")).toBe("masteryTo:woodcraft|chop:spruce");
    // Gathering dead wood is speed only: it has a breadcrumb and no bar to fill.
    expect(document.querySelector('[data-opt="intent:deadwood:"] small.crumb')).not.toBeNull();
    expect(document.querySelector('[data-opt="intent:deadwood:"] .bar.mastery')).toBeNull();
  });
});

describe("panels", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="stats"></div><div id="weather"></div><div id="map"></div><div id="camp"></div><div id="maptravel"></div><div id="task"></div><div id="orders"></div><div id="inventory"></div><div id="overlay"></div>`;
    resetPanels();
  });

  it("zooms in two levels past the cell: the same ground drawn on a smaller grid of bigger glyphs, and the map still opens where it did", () => {
    // Every level closer than the default reads one cell per glyph: past the cell
    // there is nothing finer to draw, so zooming in makes the ground bigger.
    const open = LEVELS[DEFAULT_ZOOM];
    expect(open).toEqual({ cells: 1, w: 72, h: 36, px: 11, line: 14, font: 12 });
    expect(newUiState().zoom).toBe(DEFAULT_ZOOM);
    expect(DEFAULT_ZOOM).toBeGreaterThanOrEqual(2);
    for (let z = 0; z < DEFAULT_ZOOM; z++) {
      expect(LEVELS[z].cells).toBe(1);
      expect(LEVELS[z].px).toBeGreaterThan(LEVELS[z + 1].px);
      expect(LEVELS[z].w).toBeLessThan(LEVELS[z + 1].w);
      // The box on screen stays the size it was, within a glyph either way.
      expect(Math.abs(LEVELS[z].w * LEVELS[z].px - open.w * open.px)).toBeLessThanOrEqual(LEVELS[z].px);
      expect(Math.abs(LEVELS[z].h * LEVELS[z].line - open.h * open.line)).toBeLessThanOrEqual(LEVELS[z].line);
    }
  });

  it("the closest zoom draws its own grid, and the grid carries its size for the stylesheet", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    ui.zoom = 0;
    setPanel("map", mapHtml(world, state, ui, cal));
    const l = LEVELS[0];
    expect(document.querySelectorAll("#map .c").length).toBe(l.w * l.h);
    const grid = document.querySelector<HTMLElement>("#map .grid")!;
    expect(grid.getAttribute("style")).toContain(`--cols:${l.w}`);
    expect(grid.getAttribute("style")).toContain(`--px:${l.px}px`);
    expect(document.querySelector("#map svg.walk")!.getAttribute("viewBox")).toBe(`0 0 ${l.w} ${l.h}`);
  });

  it("a rebuilt grid is born with the hour's light, so a zoom does not fade in from full day", () => {
    const { state, world } = newGame(21);
    // Dusk, where the light is well away from the stylesheet's daylight defaults.
    const cal = calendar(19 * 60);
    const light = lighting(cal, state.weather, ambientTemperature(cal, state.weather));
    expect(light.brightness).toBeLessThan(1);
    setPanel("map", mapHtml(world, state, newUiState(), cal));
    const style = document.querySelector("#map .grid")!.getAttribute("style")!;
    // The same figures updateSky writes, so the first frame after a rebuild
    // changes nothing and the 0.5 s transitions have nothing to animate.
    expect(style).toContain(`--bright:${light.brightness.toFixed(3)}`);
    expect(style).toContain(`--sat:${light.saturation.toFixed(3)}`);
    expect(style).toContain(`--tint:${light.tint}`);
    expect(style).toContain(`--tint-a:${light.alpha.toFixed(3)}`);
  });

  it("the falling weather is on the grid it is built with, not toggled on a frame later", () => {
    const { state, world } = newGame(21);
    const cal = calendar(12 * 60);
    state.weather.precip = "heavy";
    state.weather.clear = false;
    const light = lighting(cal, state.weather, ambientTemperature(cal, state.weather));
    setPanel("map", mapHtml(world, state, newUiState(), cal));
    const grid = document.querySelector("#map .grid")!;
    expect(grid.classList.contains(light.precip === "snow" ? "snowing" : "rain")).toBe(true);
  });

  it("the zoom buttons sit in the map's bottom left corner, drawn after the grid", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    setPanel("map", mapHtml(world, state, newUiState(), cal));
    const html = document.getElementById("map")!.innerHTML;
    expect(html.indexOf("maptools")).toBeGreaterThan(html.indexOf("scroll-x"));
    expect(document.querySelectorAll("#map .maptools [data-act=zoom]").length).toBe(2);
  });

  it("renders one span per cell with region borders and the player marker on the player's cell", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    // Borders and the current-region tint only draw over ground actually known; a
    // camp otherwise stands on the one cell the dark landing saw, so it is walked
    // whole here first, the way a life lived at it would leave it.
    mapRegion(state, world, state.player.region);
    setPanel("map", mapHtml(world, state, ui, cal));
    const cells = document.querySelectorAll("#map .c");
    expect(cells.length).toBe(LEVELS[ui.zoom].w * LEVELS[ui.zoom].h);
    expect(document.querySelectorAll("#map .c.bl, #map .c.br, #map .c.bt, #map .c.bb").length).toBeGreaterThanOrEqual(50);
    expect(document.querySelectorAll("#map .mk-player").length).toBe(1);
    expect(document.querySelectorAll("#map .c.fog").length).toBeGreaterThan(100);
    expect(document.querySelectorAll("#map .c.cur").length).toBeGreaterThan(50);
  });

  it("draws the walk as a line, solid ahead and dashed behind, and marks cells with something lying on them", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    const z = ZOOMS[ui.zoom];
    const glyphs = (cells: number[]) => {
      const { x0, y0 } = viewOrigin(state, world, ui.zoom);
      return new Set(cells.map((c) => `${Math.floor((cellAt(world, c).x - x0) / z)},${Math.floor((cellAt(world, c).y - y0) / z)}`)).size;
    };
    const points = (sel: string) => (document.querySelector(sel)!.getAttribute("points") ?? "").trim().split(/\s+/).filter(Boolean).length;
    mapRegion(state, world, state.player.region);
    const k1 = mapKey(state, world, ui, cal);
    // The farthest spot, so the walk is long enough to be caught three cells in.
    const far = regionAt(world, state.player.region).spots.filter((s) => s.id !== "camp").reduce((a, b) => (b.km > a.km ? b : a));
    startTask(state, world, cal, "walk", `spot:${far.id}`);
    expect(mapKey(state, world, ui, cal)).not.toBe(k1);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.rt").length).toBe(0);
    expect(document.querySelectorAll("#map svg.walk").length).toBe(1);
    expect(points("#map polyline.walk-ahead")).toBe(glyphs([cellOf(state, world), ...state.route!.path]));
    expect(points("#map polyline.walk-behind")).toBe(1);
    const rng = new Rng(1);
    while (state.route && state.route.walked.length < 3) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(state.route).not.toBeNull();
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(points("#map polyline.walk-behind")).toBe(glyphs([...state.route!.walked, cellOf(state, world)]));
    expect(points("#map polyline.walk-ahead")).toBe(glyphs([cellOf(state, world), ...state.route!.path]));
    stopTask(state, world);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(points("#map polyline.walk-ahead")).toBe(0);
    expect(points("#map polyline.walk-behind")).toBe(0);
    // Camp may already have a pile behind you; the stone adds one under your feet.
    const piles = document.querySelectorAll("#map .c.pl").length;
    addItem(herePile(state, world), "stone", 2);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.pl").length).toBe(piles + 1);
    const nb = neighbours(world, cellOf(state, world)).find((c) => cellAt(world, c).terrain !== "water")!;
    placeAt(state, world, nb);
    setPanel("map", mapHtml(world, state, ui, cal));
    // The stone's cell is underlined with no marker on it; camp's pile sits under its x.
    expect(document.querySelectorAll("#map .c.pl").length).toBe(piles + 1);
    expect(document.querySelectorAll("#map .c.pl:not(.mk)").length).toBe(1);
  });

  it("marks this region's camp with an x whenever you are not on its glyph", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ui = newUiState();
    const st = regionState(state, world, state.player.region);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .mk-camp").length).toBe(0);
    const nb = neighbours(world, st.campCell).find((c) => cellAt(world, c).terrain !== "water")!;
    placeAt(state, world, nb);
    setPanel("map", mapHtml(world, state, ui, cal));
    const camp = document.querySelectorAll<HTMLElement>("#map .mk-camp");
    expect(camp.length).toBe(1);
    expect(camp[0].textContent).toBe("x");
    expect(camp[0].title).toContain(`camp, ${regionAt(world, state.player.region).name}`);
    st.fire.lit = true;
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .mk-camp").length).toBe(0);
    expect(document.querySelectorAll("#map .mk-fire").length).toBe(1);
    st.fire.lit = false;
    ui.zoom = ZOOMS.length - 1;
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .mk-camp").length).toBe(0);
  });

  it("the live row of a counted order is a click target with a pulse bar, a once order's row is not", () => {
    const { state, world } = newGame(3);
    const cal = calendar(0);
    addOrder(state, world, { task: "sticks", until: { kind: "times", n: 5 }, deliver: "leave", where: "nearest" }, "job");
    advance(state, world, 1);
    expect(state.intent?.orderId).not.toBeNull();
    setPanel("orders", queueHtml(state, world, cal));
    expect(document.querySelectorAll('#orders .order.live .head[data-act="hurry"]').length).toBe(1);
    expect(document.querySelectorAll("#orders .order.live .bar.hurry #bar-hurry").length).toBe(1);
    const h = newHurry();
    hurryClick(h, hurryKind(state), state.intent!.orderId);
    updateHurryBar(h);
    expect(document.querySelector<HTMLElement>("#bar-hurry")!.style.width).toBe("100.0%");
    const once = newGame(3);
    addOrder(once.state, once.world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    advance(once.state, once.world, 1);
    setPanel("orders", queueHtml(once.state, once.world, cal));
    expect(document.querySelectorAll("#orders .order.live").length).toBe(1);
    expect(document.querySelectorAll('#orders [data-act="hurry"]').length).toBe(0);
    expect(document.querySelectorAll("#orders .bar.hurry").length).toBe(0);
  });

  it("the weather widget reads the hurry's rate", () => {
    const { state, world } = newGame(3);
    const cal = calendar(0);
    document.body.insertAdjacentHTML("beforeend", `<div id="weather"></div>`);
    setPanel("weather", weatherHtml(state, world, cal, 5));
    expect(document.querySelector("#weather .wx-rate")?.textContent).toBe("1 s = 1 game min");
    expect(document.querySelectorAll("#weather .hurrying").length).toBe(0);
    setPanel("weather", weatherHtml(state, world, cal, 5, 6));
    expect(document.querySelector("#weather .hurrying")?.textContent).toBe("1 s = 6 game min");
  });

  it("and says the day, the hour and the date, which the clock panel used to", () => {
    const { state, world } = newGame(3);
    const cal = calendar(0);
    const html = weatherHtml(state, world, cal, 5);
    expect(html).toContain("Day 1");
    expect(html).toMatch(/wx-date/);
  });

  it("bars follow the state", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const ambient = ambientTemperature(cal, state.weather);
    setPanel("stats", statsHtml(state, world, cal, ambient, newUiState()));
    state.player.health = 42;
    state.task = { id: "rest", progress: 30, duration: 60, repeat: false };
    setPanel("task", taskHtml(state, world, cal));
    updateBars(state, world);
    expect(document.querySelector<HTMLElement>("#bar-health")!.style.width).toBe("42.0%");
    expect(document.querySelector("#val-health")!.textContent).toBe("42");
    expect(document.querySelector<HTMLElement>("#bar-task")!.style.width).toBe("50.0%");
    expect(document.querySelector("#val-task")!.textContent).toContain("30 min left (30 s)");
  });

  it("region card shows the travel button for another region, and the spots and loose piles for here", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const nb = regionAt(world, state.player.region).neighbours[0].id;
    // Walked whole, as though a previous life had already mapped both regions and
    // the way between - camp to camp can cross a third region's corner, so the
    // path itself is marked known too, or the route has nowhere known to cross.
    mapRegion(state, world, state.player.region);
    mapRegion(state, world, nb);
    const path = findRoute(world, cellOf(state, world), regionAt(world, nb).campCell)!;
    for (const c of path) markKnown(state, c);
    setPanel("maptravel", `${placesHtml(state, world, cal)}${travelHtml(state, world, cal)}`);
    expect(document.querySelector(`#maptravel [data-act="task"][data-id="travel"][data-arg="region:${nb}"]`)).not.toBeNull();
    expect(document.querySelector(`#maptravel [data-act="task"][data-id="walk"][data-arg="spot:forest"]`)).not.toBeNull();
    expect(document.querySelector("#maptravel")!.textContent).toContain("you are here");
    // A heap on a bare cell is the tooltip's to report: it is a fact about
    // that cell, and the map is the panel that has cells.
    const loose = neighbours(world, cellOf(state, world)).find((c) => cellAt(world, c).terrain !== "water")!;
    placeAt(state, world, loose);
    addItem(herePile(state, world), "log", 2);
    placeAtSpot(state, world, state.player.region, "camp");
    markKnown(state, loose);
    const tip = tipHtml(state, world, cal, loose);
    expect(tip).toContain("40 kg lying here");
    expect(tip).toContain(`data-act="task" data-id="walk" data-arg="cell:${loose}"`);
  });

  it("draws a corridor as a thread, not an open polygon", () => {
    const { state, world } = newGame(21);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    const home = regionAt(world, state.player.region);
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    const l = LEVELS[ui.zoom];
    const cells = new Set(home.cells);
    // A run of cells in the home region, in view, that the landing sight never reached.
    let run: number[] = [];
    outer: for (let y = y0; y < y0 + l.h; y++) {
      run = [];
      for (let x = x0; x < x0 + l.w; x++) {
        const c = y * world.w + x;
        if (cells.has(c) && !isKnown(state, c)) {
          run.push(c);
          if (run.length >= 6) break outer;
        } else {
          run = [];
        }
      }
    }
    expect(run.length).toBeGreaterThanOrEqual(6);
    const thread = run.slice(0, 4);
    const untouched = run.slice(4);
    for (const c of thread) markKnown(state, c);
    setPanel("map", mapHtml(world, state, ui, cal));
    const glyphs = document.querySelectorAll("#map .c");
    const glyphAt = (c: number): HTMLElement => {
      const x = c % world.w;
      const y = Math.floor(c / world.w);
      return glyphs[(y - y0) * l.w + (x - x0)] as HTMLElement;
    };
    for (const c of thread) expect(glyphAt(c).classList.contains("fog")).toBe(false);
    for (const c of untouched) expect(glyphAt(c).classList.contains("fog")).toBe(true);
  });

  it("names black ground it has heard of, and offers Explore rather than Go", () => {
    const { state, world } = newGame(21);
    const cal = calendar(0);
    const home = state.player.region;
    const nbId = regionAt(world, home).neighbours[0].id;
    const nb = regionAt(world, nbId); // building it is what lets the map and panel name it
    expect(discovery(state, nbId)).toBe(SEEN);
    expect(knownShare(state, world, nbId)).toBe(0);
    const ui = newUiState();
    setPanel("map", mapHtml(world, state, ui, cal));
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    const l = LEVELS[ui.zoom];
    const cellInView = nb.cells.find((c) => {
      const x = c % world.w;
      const y = Math.floor(c / world.w);
      return x >= x0 && y >= y0 && x < x0 + l.w && y < y0 + l.h;
    });
    expect(cellInView).toBeDefined();
    const x = cellInView! % world.w;
    const y = Math.floor(cellInView! / world.w);
    const glyph = document.querySelectorAll("#map .c")[(y - y0) * l.w + (x - x0)] as HTMLElement;
    expect(glyph.classList.contains("fog")).toBe(true);
    expect(glyph.title).toBe(nb.name);
    expect(glyph.getAttribute("data-act")).toBe("select");
    setPanel("maptravel", travelHtml(state, world, cal));
    const btn = document.querySelector(`#maptravel [data-act="task"][data-id="explore"][data-arg="region:${nbId}"]`);
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain(`Explore ${nb.name}`);
    expect(document.querySelector(`#maptravel [data-act="task"][data-id="travel"][data-arg="region:${nbId}"]`)).toBeNull();
  });

  it("the camp box shows camp water against its capacity", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "barkBucket", 2);
    addItem(pile(state, st.campCell), "water", 3);
    const html = campHtml(state, world);
    expect(html).toContain("water: 3.0 of 4.0 l");
  });


  it("inventory lists pack and ground with take and drop", () => {
    const { state, world } = newGame(21);
    addItem(state.player.pack, "stick", 3);
    setPanel("inventory", inventoryHtml(state, world, calendar(state.minute)));
    expect(document.querySelector(`#inventory [data-act="drop"][data-item="stick"]`)).not.toBeNull();
    expect(document.querySelector(`#inventory [data-act="drop"][data-item="driedMeat"]`)).not.toBeNull();
  });

  it("water on the ground gets no take button: it is inert in the pack", () => {
    const { state, world } = newGame(21);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addItem(herePile(state, world), "water", 2);
    setPanel("inventory", inventoryHtml(state, world, calendar(state.minute)));
    expect(document.querySelector(`#inventory [data-act="take"][data-item="water"]`)).toBeNull();
  });

  it("tombstone names the cause through the epitaph and offers to begin again, never a restart", () => {
    const { state, world } = newGame(21);
    die(state, "froze", regionAt(world, state.player.region).name);
    setPanel("overlay", tombstoneHtml(state, world, newUiState()));
    expect(document.querySelector("#overlay")!.textContent).toContain("Died of cold");
    expect(document.querySelector(`#overlay [data-act="begin-again"]`)).not.toBeNull();
    expect(document.querySelector(`#overlay [data-act="restart"]`)).toBeNull();
  });

  it("skills panel lists seven rows with level, hours to next, pool share and active perks", () => {
    const { state } = newGame(21);
    state.skills.woodcraft.xp = levelMinutes(7) + 60;
    state.skills.woodcraft.pool = poolCapacity("woodcraft") * 0.3;
    const h = skillsHtml(state);
    expect(h).toContain("Woodcraft");
    expect(h).toContain("Fishing");
    expect((h.match(/class="skill"/g) ?? []).length).toBe(7);
    // Level 8 needs 98 h; level 7 had 72; one hour in, 25 h to go.
    expect(h).toContain("25 h to 8");
    expect(h).toContain("pool 30%");
    expect(h).toContain("half the tool wear");
    expect(h).toContain("5% faster");
  });

  it("commitChoiceN clamps to at least 1 on every keystroke", () => {
    const ui = newUiState();
    commitChoiceN(ui, "7");
    expect(ui.choice.n).toBe(7);
    commitChoiceN(ui, ""); // a cleared field
    expect(ui.choice.n).toBe(1);
    commitChoiceN(ui, "0");
    expect(ui.choice.n).toBe(1);
    commitChoiceN(ui, "3.6");
    expect(ui.choice.n).toBe(4);
  });

  it("a redraw leaves untouched nodes alone rather than rebuilding them", () => {
    document.body.innerHTML = `<div id="dorows"></div>`;
    resetPanels();
    expect(setPanel("dorows", `<div class="rows"><div class="opt" data-opt="a">first</div><div class="opt" data-opt="b">second</div></div>`)).toBe(true);
    const box = document.querySelector<HTMLElement>(".rows")!;
    const a = document.querySelector('[data-opt="a"]')!;
    const b = document.querySelector('[data-opt="b"]')!;
    // A row inserted above the others, and one of them reworded.
    expect(setPanel("dorows", `<div class="rows"><div class="opt" data-opt="c">new</div><div class="opt" data-opt="a">first</div><div class="opt" data-opt="b">changed</div></div>`)).toBe(true);
    expect(document.querySelector<HTMLElement>(".rows")).toBe(box);
    expect(document.querySelector('[data-opt="a"]')).toBe(a);
    expect(document.querySelector('[data-opt="b"]')).toBe(b);
    expect(b.textContent).toBe("changed");
    expect([...box.children].map((c) => (c as HTMLElement).dataset.opt)).toEqual(["c", "a", "b"]);
  });

  it("a redraw carries the field being typed in across it: focus, the typed string and the caret", () => {
    document.body.innerHTML = `<div id="dorows"></div>`;
    resetPanels();
    expect(setPanel("dorows", `<div class="row"><input data-row-n value="5"></div>`)).toBe(true);
    const field = document.querySelector<HTMLInputElement>("[data-row-n]")!;
    field.focus();
    // Mid-edit: the field holds a string the state has not got, and the caret sits inside it.
    field.value = "12";
    field.setSelectionRange(1, 1);
    // The panel redraws around it rather than freezing until the field is left.
    expect(setPanel("dorows", `<div class="row"><input data-row-n value="1"></div><div class="row">more</div>`)).toBe(true);
    const after = document.querySelector<HTMLInputElement>("[data-row-n]")!;
    expect(document.body.textContent).toContain("more");
    // The same field, never taken away, so focus and caret were never lost in the first place.
    expect(after).toBe(field);
    expect(document.activeElement).toBe(after);
    expect(after.value).toBe("12");
    expect(after.selectionStart).toBe(1);
  });

  it("a redraw keeps a focused dropdown focused, and leaves where a list was scrolled alone", () => {
    document.body.innerHTML = `<div id="dorows"></div>`;
    resetPanels();
    const rows = `<div class="rows"><select data-act="row-where" data-id="chop"><option value="nearest">nearest</option></select></div>`;
    expect(setPanel("dorows", rows)).toBe(true);
    const box = document.querySelector<HTMLElement>(".rows")!;
    box.scrollTop = 220;
    const sel = document.querySelector<HTMLSelectElement>("select")!;
    sel.focus();
    expect(setPanel("dorows", `${rows}<p>a mastery bar ticked</p>`)).toBe(true);
    expect(document.body.textContent).toContain("a mastery bar ticked");
    // The select and the scrolled box are the same nodes as before, so neither had anything to lose.
    expect(document.querySelector("select")).toBe(sel);
    expect(document.activeElement).toBe(sel);
    expect(document.querySelector<HTMLElement>(".rows")).toBe(box);
    expect(box.scrollTop).toBe(220);
  });

  it("a redraw that takes the focused control away does not strand focus on a detached node", () => {
    document.body.innerHTML = `<div id="dorows"></div>`;
    resetPanels();
    expect(setPanel("dorows", `<input data-row-n value="5">`)).toBe(true);
    document.querySelector<HTMLInputElement>("[data-row-n]")!.focus();
    expect(setPanel("dorows", "<p>the row is gone</p>")).toBe(true);
    expect(document.querySelector("[data-row-n]")).toBeNull();
    expect(document.body.contains(document.activeElement)).toBe(true);
  });
});

describe("the Do panel", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute);
  // Woodcraft 5 keeps chop's row open at the grind and job rungs the tests below reach for.
  // The ladder gate has its own tests; these rows are about a row's own kind buttons, so
  // woodcraft is past the gates they use.
  state.skills.woodcraft.xp = levelMinutes(5);

  it("has one row per intent, judged at the work's place", () => {
    // The roster is spread across the panes now, so the whole of it is the
    // whole of them. Nothing is hidden behind a "more" any more: a pane holds
    // a handful of rows, and what a survivor cannot do yet still shows and
    // says why.
    const html = allPanesHtml(state, world, cal);
    // Eating lives with what is happening now, not in the Do pane: inside a
    // pane it would vanish the moment somebody opened the Log.
    expect(html).not.toContain('data-act="eat"');
    expect(taskHtml(state, world, cal)).toContain('data-act="eat"');
    // Felling is legal from camp because the intent walks to the forest itself.
    expect(html).toContain('data-act="intent" data-id="chop" data-arg=""');
    expect(html).not.toContain('class="opt off" data-opt="intent:chop:"');
    for (const id of RECIPE_IDS) expect(html).toContain(`data-opt="intent:craft:${id}"`);
    for (const id of STRUCTURE_IDS) expect(html).toContain(`data-opt="intent:build:${id}"`);
    const roster = regionAt(world, state.player.region);
    for (const s of huntedLand()) if (roster.capacity[s]) expect(html).toContain(`data-opt="intent:hunt:${s}"`);
    for (const s of fishSpecies()) expect(html.includes(`data-opt="intent:fish:${s}"`)).toBe(Boolean(roster.capacity[s]));
    for (const id of ["sticks", "bark", "stone", "berries", "split", "cook", "light", "sharpen", "repair", "night", "rest", "sleep"]) {
      expect(html).toContain(`data-opt="intent:${id}:`);
    }
    expect(html).toContain('data-opt="intent:lightTorch:"');
    expect(html).not.toContain('class="tabs"');
  });

  it("a lean food past the day's ceiling shows a disabled eat button with its own reason; fat's stays open", () => {
    const g = newGame(21);
    const p = g.state.player;
    // Lean kcal lives on the shared gut counter's leanKcal field.
    p.gut = { day: 1, kg: {}, leanKcal: LEAN_KCAL_PER_DAY };
    addItem(p.pack, "cookedMeat", 1);
    addItem(p.pack, "fat", 1);
    const html = instantHtml(g.state, g.world);
    expect(html).toContain('data-act="eat" data-food="cookedMeat" disabled');
    expect(html).toContain("not more lean meat today");
    expect(html).toContain('data-act="eat" data-food="fat" >');
    expect(html).not.toContain('data-act="eat" data-food="fat" disabled');
  });

  it("the Hunt group also offers reading the shore and setting and emptying the trap", () => {
    // Seed 21's start region has a shore (tests/start.test.ts covers this
    // generally); the rows render as buttons whether or not they are greyed
    // with a reason. Reading the water is scouting; the trap is its own
    // purpose, since setting one and emptying it are different jobs.
    expect(paneHtml(state, world, cal, "read")).toContain("Read the water");
    const traps = paneHtml(state, world, cal, "setTrap");
    expect(traps).toContain("Set the trap");
    expect(paneHtml(state, world, cal, "emptyTrap")).toContain("Empty the trap");
    expect(traps).not.toContain("Read the water");
  });

  it("there is one Do list and no second one behind a toggle", () => {
    const html = doHtml(state, world, cal, newUiState());
    expect(html).not.toContain('data-act="advanced"');
    expect(html).not.toContain('class="tabs"');
    // The raw list's rows were data-opt="<id>:<arg>"; every row is an intent row now.
    expect(html).not.toMatch(/data-opt="(?!intent:)/);
  });

  it("haul is offered beside the ground pile it would carry, not in the Do list", () => {
    const g = newGame(21);
    // Away from camp, with something on the ground worth carrying home. The
    // haul is a walk back, so the way home has to be ground they know.
    mapRegion(g.state, g.world, g.state.player.region);
    placeAtSpot(g.state, g.world, g.state.player.region, "forest");
    addItem(herePile(g.state, g.world), "log", 3);
    const c = calendar(g.state.minute);
    expect(doHtml(g.state, g.world, c, newUiState())).not.toContain('data-id="haul"');
    expect(inventoryHtml(g.state, g.world, c)).toContain('data-act="task" data-id="haul"');
  });

  it("a build blocked only by materials elsewhere in the region is not greyed out, and names what it would fetch", () => {
    // Fetch fixture: sticks and cordage already at camp, the missing logs sitting at the forest.
    const g = newGame(3);
    const camp = regionState(g.state, g.world, g.state.player.region).campCell;
    const r = regionAt(g.world, g.state.player.region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(g.state, camp), "stick", 8);
    addItem(pile(g.state, camp), "cordage", 2);
    addItem(pile(g.state, forest), "log", 4);
    const html = paneHtml(g.state, g.world, calendar(g.state.minute), "build", "leanTo");
    expect(html).toContain('data-act="intent" data-id="build" data-arg="leanTo"');
  });

  it("a build already finished renders as a greyed row, not a fetchable one, however much sits elsewhere", () => {
    const g = newGame(3);
    regionState(g.state, g.world, g.state.player.region).structures.leanTo = true;
    const r = regionAt(g.world, g.state.player.region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(g.state, forest), "log", 4);
    const html = paneHtml(g.state, g.world, calendar(g.state.minute), "build", "leanTo");
    expect(html).toContain('class="opt off" data-opt="intent:build:leanTo"');
  });

  it("the Doing panel reads the intent as a sentence with its step, and set-aside work can be finished from anywhere", () => {
    const g = newGame(21);
    const rng = new Rng(1);
    // Seed 21's camp cell is itself forest ground; stand off it (the heath) so the intent really walks to the forest.
    placeAtSpot(g.state, g.world, g.state.player.region, "heath");
    mapRegion(g.state, g.world, g.state.player.region);
    startIntent(g.state, g.world, calendar(0), rng, { task: "chop", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" });
    let html = taskHtml(g.state, g.world, calendar(0));
    expect(html).toContain("Fell a tree, until camp has 40 logs, bringing it to camp");
    expect(html).toContain("walking to the forest");
    expect(html).toContain('data-act="stop"');
    // A tree half felled, then the intent stopped from camp: the entry offers finish, not resume.
    placeAtSpot(g.state, g.world, g.state.player.region, "forest");
    startTask(g.state, g.world, calendar(0), "chop");
    for (let i = 0; i < 30; i++) stepTask(g.state, g.world, calendar(0), rng, 1);
    stopTask(g.state, g.world);
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    html = taskHtml(g.state, g.world, calendar(0));
    expect(html).toContain('data-act="finish" data-id="chop"');
    expect(html).toMatch(/data-act="finish" data-id="chop"[^>]*data-cell="\d+"/);
    expect(html).not.toContain('>resume<');
  });

  it("carried work's finish button names no cell, so it resolves through nearest and still reaches camp", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, camp), "firewood", 2);
    // Paused partway through, at camp; light is carried work, so its paused entry carries no cell.
    startTask(state, world, calendar(0), "light");
    stepTask(state, world, calendar(0), new Rng(1), 3);
    stopTask(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    const html = taskHtml(state, world, calendar(0));
    expect(html).toContain('data-act="finish" data-id="light"');
    expect(html).not.toMatch(/data-act="finish" data-id="light"[^>]*data-cell=/);
    // The finish handler's own logic when the button carries no cell: where "nearest".
    expect(startIntent(state, world, calendar(0), new Rng(1), { task: "light", until: { kind: "once" }, deliver: "leave", where: "nearest" })).toBe(true);
    expect(state.intent?.cell).toBe(camp);
  });
});

describe("the Orders panel", () => {
  it("a blocked row is still a button, and its open keep button words the count by the item", () => {
    const { state, world } = newGame(3);
    // Woodcraft 10 opens the keep rung, so split's row is blocked by "no logs here", not the ladder gate.
    state.skills.woodcraft.xp = levelMinutes(10);
    const cal = calendar(0);
    let html = paneHtml(state, world, cal, "split");
    // Split needs logs this camp has none of: dim, with the reason, and still clickable.
    expect(html).toMatch(/class="opt off" data-opt="intent:split:"><button class="act" data-act="intent" data-id="split"/);
    expect(html).toContain("no logs here");
    const ui = paneFor("split", undefined, {
      open: { id: "split", arg: "" },
      choice: { ...defaultChoice(), until: "keep", n: 40 },
    });
    html = doHtml(state, world, cal, ui);
    expect(html.slice(html.indexOf('data-opt="intent:split:"'))).toContain("keep camp at 40 kg firewood");
  });

  it("a wait with nothing to do says so once and shows no bar; a wait doing something names it and shows one", () => {
    // The wait's own hour of rest is not a thing the player is waiting for: it
    // ends when an order can run, not when the hour is up.
    const { state, world } = newGame(1);
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "camp");
    addOrder(state, world, { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    advance(state, world, 3);
    expect(state.intent?.task).toBe("wait");
    let html = queueHtml(state, world, calendar(state.minute));
    expect(html).toContain("Waiting at camp");
    expect(html).not.toContain("Waiting at camp: waiting at camp");
    expect(html).not.toContain('id="bar-task"');
    // The fire is work, and work under way has its bar and its own words.
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell), "firewood", 5);
    for (let i = 0; i < 120 && state.task?.id === "rest"; i++) advance(state, world, 1);
    expect(state.task?.id).not.toBe("rest");
    html = queueHtml(state, world, calendar(state.minute));
    expect(html).toContain("Waiting at camp: ");
    expect(html).toContain('id="bar-task"');
  });

  it("lists the orders in rank order with their state, counters and buttons", () => {
    // Seed 1's camp sits on forest ground, so the grind order is gathering within
    // the window below rather than still walking out to the forest spot.
    const g = newGame(1);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "log", 6);
    addItem(pile(state, st.campCell), "firewood", 60);
    const keep = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    // Ranked under the grind: a once order that cannot run stops every order
    // beneath it, so a cabin above the grind would leave nothing to draw.
    const cabin = addOrder(state, world, { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    advance(state, world, 3);
    const cal = calendar(state.minute);
    let html = queueHtml(state, world, cal);
    // The heading counts what is standing, which is the first thing a
    // reader wants from a queue.
    expect(html).toContain("<h2>Orders <span class=\"r\">3</span></h2>");
    expect(html.indexOf(`data-id="${keep.id}"`)).toBeLessThan(html.indexOf(`data-id="${cabin.id}"`));
    expect(html).toContain("met");
    expect(html).toMatch(/short .* at camp/);
    expect(html).toContain("gathering sticks");
    expect(html).toContain('id="bar-task"');
    expect(html.split('id="bar-task"').length).toBe(2);
    expect(html).toContain(`data-act="order-up" data-id="${keep.id}" disabled`);
    expect(html).toContain(`data-act="order-down" data-id="${cabin.id}" disabled`);
    expect(html).toContain(`data-act="order-remove" data-id="${cabin.id}"`);
    expect(html).not.toContain('data-act="stop"');
    // Counters appear once the work has completed.
    for (let i = 0; i < 400 && grind.done === 0; i++) advance(state, world, 1);
    html = queueHtml(state, world, calendar(state.minute));
    expect(html).toMatch(new RegExp(`${grind.done} bundle`));
    // Moving the cabin up shows in the next render.
    moveOrder(state, world, cabin.id, -1);
    html = queueHtml(state, world, calendar(state.minute));
    expect(html.indexOf(`data-id="${cabin.id}"`)).toBeLessThan(html.indexOf(`data-id="${grind.id}"`));
  });

  it("a blocked order below the live one shows its own reason, not \"waiting\"", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "log", 6);
    const grind = addOrder(state, world, { task: "split", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const cabin = addOrder(state, world, { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(grind.id);
    const html = queueHtml(state, world, calendar(state.minute));
    expect(html).toMatch(/<div class="step">short .* at camp<\/div>/);
    expect(html).not.toContain('<div class="step">waiting</div>');
    expect(html).toContain(`data-act="order-remove" data-id="${cabin.id}"`);
  });

  it("shows the wait, and no bar, when nothing on the list can run", () => {
    const g = newGame(3);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "firewood", 60);
    addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 2);
    const html = queueHtml(state, world, calendar(state.minute));
    expect(html).toContain("Waiting at camp");
    expect(html).not.toContain('id="bar-task"');
  });
});

describe("the Do panel and the ladder", () => {
  it("the choice becomes a request and a kind", () => {
    const choice = { ...defaultChoice(), until: "keep" as const, n: 40, deliver: "camp" as const, where: "nearest" as const };
    expect(rowRequest(choice, "split", undefined)).toEqual({ req: { task: "split", arg: undefined, until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, kind: "keep" });
    expect(rowRequest({ ...choice, until: "forever" }, "chop", undefined).kind).toBe("grind");
    expect(rowRequest({ ...choice, until: "times", n: 3 }, "chop", undefined)).toMatchObject({ req: { until: { kind: "times", n: 3 } }, kind: "job" });
    expect(rowRequest({ ...choice, until: "once" }, "chop", undefined)).toMatchObject({ req: { until: { kind: "once" } }, kind: "job" });
    expect(rowRequest({ ...choice, until: "campHas", n: 8 }, "stone", undefined)).toMatchObject({ req: { until: { kind: "campHas", qty: 8 } }, kind: "job" });
  });

  it("opening a row's kinds does not hide any other row's data-opt", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute);
    const closed = paneHtml(state, world, cal, "split");
    const opened = paneHtml(state, world, cal, "split", undefined, { open: { id: "split", arg: "" } });
    const opts = (h: string) => [...h.matchAll(/data-opt="intent:[^"]*"/g)].map((m) => m[0]).sort();
    expect(opts(opened)).toEqual(opts(closed));
  });
});

describe("the kind per row", () => {
  it("the default choice is once, leave, nearest, and rowRequest with it is the plain click", () => {
    expect(defaultChoice()).toEqual({ until: "once", n: 10, deliver: "leave", where: "nearest", when: {} });
    expect(rowRequest(defaultChoice(), "sticks", undefined)).toEqual({ req: { task: "sticks", arg: undefined, until: { kind: "once" }, deliver: "leave", where: "nearest" }, kind: "job" });
  });

  it("a NOT_ORDERS task ignores the choice", () => {
    const r = rowRequest({ ...defaultChoice(), until: "keep", n: 3 }, "rest", undefined);
    expect(r.kind).toBe("job");
    expect(r.req.until).toEqual({ kind: "once" });
  });

  it("the open row renders the six kinds, greys the unearned ones with the rung they need, and other rows render no expansion", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = paneHtml(state, world, cal, "fish", "any", { open: { id: "fish", arg: "any" } });
    const open = html.slice(html.indexOf('data-opt="intent:fish:any"'));
    expect(open).toContain('data-act="row-kind"');
    for (const k of ["once", "times", "daily", "campHas", "keep", "forever"]) expect(open).toContain(`data-until="${k}"`);
    // Fishing at level 1 has not earned a keep: the keep is greyed and says what it needs.
    expect(open).toMatch(/data-until="keep"[^>]*class="[^"]*off[^"]*"/);
    expect(open).toContain("keeps at Fishing 10, you are 1");
    expect(open).toContain('data-row-n');
    expect(open).toContain('data-act="row-deliver"');
    // A row nobody opened, in its own pane: no expansion, but a way in.
    const sticks = paneHtml(state, world, cal, "sticks");
    const closed = sticks.slice(sticks.indexOf('data-opt="intent:sticks:"'), sticks.indexOf('data-opt="intent:sticks:"') + 600);
    expect(closed).not.toContain('data-act="row-kind"');
    expect(closed).toContain('data-act="row-more"');
    // rest is a NOT_ORDERS task: rowRequest always collapses its choice to a once job, so it gets
    // no more button and no expansion at all, even when ui.open somehow names it.
    const restHtml = paneHtml(state, world, cal, "rest", undefined, { open: { id: "rest", arg: "" } });
    const restRow = restHtml.slice(restHtml.indexOf('data-opt="intent:rest:"'), restHtml.indexOf('data-opt="intent:rest:"') + 400);
    expect(restRow).not.toContain('data-act="row-kind"');
    expect(restRow).not.toContain('data-act="row-more"');
  });

  it("the where-select follows the real ground rule, not the display group: fill is grouped camp but grounded to the shore", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    const html = paneHtml(state, world, cal, "fill", "shore", { open: { id: "fill", arg: "shore" } });
    const open = html.slice(html.indexOf('data-opt="intent:fill:shore"'));
    expect(open).toContain('data-act="row-where"');
  });

  it("no strip: the panel has no data-strip kind buttons and no strip sentence", () => {
    const { state, world } = newGame(17);
    const html = doHtml(state, world, calendar(state.minute, state.startDoy), newUiState());
    expect(html).not.toContain('data-act="strip"');
    expect(html).not.toContain("data-strip=");
  });
});

describe("the skills panel and the rungs", () => {
  it("lists the three rungs per skill, marks the earned ones, and says how far the next is", () => {
    const { state } = newGame(21);
    let html = skillsHtml(state);
    const wood = html.slice(html.indexOf("<b>Woodcraft</b>"), html.indexOf("<b>Foraging</b>"));
    expect(wood).toContain('<span class="">jobs 3');
    expect(wood).toContain("jobs 3, 8 h to go");
    expect(wood).toContain('<span class="">grinds 5</span>');
    expect(wood).toContain('<span class="">keeps 10</span>');
    state.skills.woodcraft.xp = levelMinutes(5) + 60;
    html = skillsHtml(state);
    const wood5 = html.slice(html.indexOf("<b>Woodcraft</b>"), html.indexOf("<b>Foraging</b>"));
    expect(wood5).toContain('<span class="on">jobs 3</span>');
    expect(wood5).toContain('<span class="on">grinds 5</span>');
    expect(wood5).toContain("keeps 10, 5 d 9 h to go");
  });
});

describe("the forecast panel", () => {
  it("asks one question - what happens if you leave for this long - and says what the hours buy", () => {
    const { state } = newGame(17);
    state.awayHours = 8;
    const v = emptyView();
    beginRequest(v, 1);
    applyRow(v, 1, { id: "away", runs: 10, died: 1, cause: "wolves", day: 1 });
    const html = forecastHtml(v, state);
    // He read "away up to 24 hours" as how long the survivor works, so the
    // panel says leaving, and says the days those hours buy: a real second
    // is a game minute, so eight hours is twenty days.
    expect(html).toContain("If you leave");
    expect(html).toContain("for 8 h");
    // What the hours buy is on the dial right under this, and saying it in
    // both put the same figure twice in one box.
    expect(html).not.toContain("20 days pass");
    expect(html).toContain("1 of 10 die: wolves, day 1");
    expect(html).not.toContain("away up to");
    // The horizons nobody asked for are gone from the panel.
    expect(html).not.toContain("tonight");
    expect(html).not.toContain("a week");
  });

  it("says a row is stale until the new one lands, rather than showing nothing", () => {
    const { state } = newGame(17);
    state.awayHours = 2;
    const v = emptyView();
    beginRequest(v, 1);
    applyRow(v, 1, { id: "away", runs: 10, died: 0, cause: null, day: null });
    expect(forecastHtml(v, state)).toContain("none of 10 die");
    beginRequest(v, 2);
    expect(forecastHtml(v, state)).toMatch(/none of 10 die[\s\S]*?\.\.\./);
  });

  it("nothing has landed yet, so it says so rather than showing an empty row", () => {
    const { state } = newGame(17);
    expect(forecastHtml(null, state)).toContain("If you leave");
    expect(forecastHtml(null, state)).toContain("...");
  });
});
