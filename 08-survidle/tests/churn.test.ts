/**
 * The churn budget.
 *
 * A panel is drawn by building its whole markup as a string and, when that
 * string differs from last frame's, morphing the panel to match it. The
 * morph is what makes a redraw safe - nothing a person is using gets taken
 * away - but a redraw still costs a parse and a walk of the panel, and the
 * cheapest one is the one that never happens.
 *
 * What puts a panel over budget is a value that moves faster than the panel
 * has any business redrawing: a raw float where the reader is shown a whole
 * number, a share that climbs with every minute of work. Such a value does
 * not belong in the markup. It belongs on an element with a name, written
 * each frame by src/ui/bars.ts, which is what the body's bars, the hurry
 * pulse, the wear bars and the Do rows' mastery all do.
 *
 * This ran red when it was written: the gear panel redrew on 300 frames of
 * 300, because the clothing wear bars carried unrounded percentages.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { startTask } from "../src/sim/tasks";
import { Rng } from "../src/rng";
import { doHtml } from "../src/ui/dopanel";
import { levelAt, mapHtml, mapKey, mapTargetAtPoint } from "../src/ui/map";
import { tipHtml, tipKey } from "../src/ui/tip";
import { campHtml, forecastHtml, gearHtml, inventoryHtml, journalHtml, logHtml, skillsHtml, statsHtml, taskHtml, travelHtml, weatherHtml, weatherKey } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";
import { fillShare } from "../src/ui/bars";
import { emptyView } from "../src/sim/forecaster";
import { feltTemperature } from "../src/sim/player";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { ambientTemperature } from "../src/sim/weather";
import { GAME_MINUTES_PER_REAL_SECOND } from "../src/units";
import { PEAK } from "../src/ui/hurry";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

afterEach(() => vi.restoreAllMocks());

const FRAMES = 300;
/** Frames a second, so the run below is five seconds of the worst case: work in hand, hurried to the peak. */
const FPS = 60;
const MINUTES_PER_FRAME = (GAME_MINUTES_PER_REAL_SECOND * PEAK) / FPS;

/**
 * What each panel may redraw over the run below.
 *
 * A budget is a claim about what the panel shows, not a tolerance for churn.
 * Thirty game minutes pass here, so a panel reading to the game minute - the
 * clock, a countdown to the next level, an order's running total, a timed
 * status - turns over about thirty times and gets MINUTE. Everything else
 * shows quantities that only a day, a task or an event moves, and a handful
 * covers those. A panel that wants more is showing something that moves per
 * frame, and that something belongs in a named fill written by bars.ts.
 *
 * Measured at the time of writing: clock 31, skills 31 while working, and 0
 * to 2 for every other panel.
 */
const MINUTE = 35;
const BUDGET: Record<string, number> = {
  stats: MINUTE,
  gear: 2,
  skills: MINUTE,
  weather: MINUTE,
  camp: 5,
  maptravel: 5,
  task: MINUTE,
  forecast: 2,
  dorows: 5,
  inventory: 5,
  journal: 5,
  log: 5,
  map: 5,
};

function panels(state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"]): Record<string, string> {
  const ui = newUiState();
  const cal = calendar(state.minute, state.startDoy);
  const ambient = ambientTemperature(cal, state.weather);
  return {
    stats: statsHtml(state, world, cal, ambient, ui),
    gear: gearHtml(state, feltTemperature(state, world, ambient)),
    skills: skillsHtml(state),
    camp: campHtml(state, world, cal),
    // Weather and map own CSS animation inside stable markup. Their render keys,
    // not continuously sampled presentation values, decide when markup is rebuilt.
    weather: weatherKey(state, world, cal, 1),
    maptravel: travelHtml(state, world, cal),
    task: taskHtml(state, world, cal),
    forecast: forecastHtml(emptyView(), state),
    dorows: doHtml(state, world, cal, ui),
    inventory: inventoryHtml(state, world, cal),
    journal: journalHtml(state, cal, ui),
    log: logHtml(state),
    map: mapKey(state, world, ui, cal),
  };
}

/** Runs the panels over a stretch of frames and counts, per panel, how many of them changed its markup. */
function churn(seed: number, work: boolean): Record<string, number> {
  const { state, world } = newGame(seed);
  if (work) {
    const cal = calendar(state.minute, state.startDoy);
    startTask(state, world, cal, "deadwood", undefined, true, new Rng(state.rng));
  }
  let prev = panels(state, world);
  const counts: Record<string, number> = {};
  for (const id of Object.keys(prev)) counts[id] = 0;
  for (let f = 0; f < FRAMES; f++) {
    advance(state, world, MINUTES_PER_FRAME);
    const now = panels(state, world);
    for (const id of Object.keys(now)) if (now[id] !== prev[id]) counts[id]++;
    prev = now;
  }
  return counts;
}

describe("no panel redraws faster than what it is showing", () => {
  it("changes the weather key for same-minute changes that alter feels-like", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const idle = weatherKey(state, world, cal, 1);

    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const working = weatherKey(state, world, cal, 1);
    expect(working).not.toBe(idle);

    state.player.wetness = 100;
    expect(weatherKey(state, world, cal, 1)).not.toBe(working);
  });

  it("holds through fractional rain wetness until the displayed felt degree changes", () => {
    testAtmosphere({ temperatureC: 5, precipMmPerHour: 2, rainMmPerHour: 2, precip: "rain" });
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const dryFelt = feltTemperature(state, world, 5);
    const boundary = Math.floor(dryFelt - 0.5) + 0.5;
    const wetnessFor = (felt: number) => (dryFelt - felt) / 0.15;
    const shownFelt = () => weatherHtml(state, world, cal, 5).match(/Feels like<\/div><div class="wx-v[^"]*">(-?\d+) C/)?.[1];

    state.player.wetness = wetnessFor(boundary + 0.2);
    const opening = weatherKey(state, world, cal, 1);
    const openingShown = shownFelt();
    state.player.wetness = wetnessFor(boundary + 0.08);
    const damp = weatherKey(state, world, cal, 1);
    expect(shownFelt()).toBe(openingShown);
    expect(damp).toBe(opening);

    state.player.wetness = wetnessFor(boundary - 0.02);
    expect(shownFelt()).not.toBe(openingShown);
    expect(weatherKey(state, world, cal, 1)).not.toBe(damp);
  });

  it("changes the same-minute weather key as shelter, fire, clothing, and fat alter feels-like", () => {
    const { state, world } = newGame(21);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    const opening = weatherKey(state, world, cal, 1);

    siteFor(st, camp).structures.leanTo = true;
    const sheltered = weatherKey(state, world, cal, 1);
    expect(sheltered).not.toBe(opening);

    st.fire.lit = true;
    st.fire.fuelKg = 5;
    const byFire = weatherKey(state, world, cal, 1);
    expect(byFire).not.toBe(sheltered);

    state.player.clothing[0].durability = 0;
    const worn = weatherKey(state, world, cal, 1);
    expect(worn).not.toBe(byFire);

    state.player.fat = 0;
    expect(weatherKey(state, world, cal, 1)).not.toBe(worn);
  });

  for (const work of [false, true]) {
    it(`${work ? "with work in hand" : "standing idle"}, every panel stays inside its budget`, () => {
      const counts = churn(21, work);
      const over = Object.entries(counts)
        .filter(([id, n]) => n > BUDGET[id])
        .map(([id, n]) => `${id}: ${n} of ${FRAMES} frames, budget ${BUDGET[id]}`);
      // The whole table rides along, so a failure says what every panel did and not just the one over.
      expect(over, JSON.stringify(counts)).toEqual([]);
    });
  }

  it("no panel redraws on every frame, whatever it is showing", () => {
    for (const work of [false, true]) {
      const counts = churn(19, work);
      // A panel rebuilt every frame is never right: nothing a person reads changes sixty times a second.
      const everyFrame = Object.entries(counts).filter(([, n]) => n >= FRAMES).map(([id]) => id);
      expect(everyFrame).toEqual([]);
    }
  });

  /**
   * The rule the budgets above rest on, checked directly so a new bar cannot
   * quietly reintroduce the problem: a fill names what it draws, and its
   * width is written by updateFills from the state.
   */
  it("no panel bakes a width into a bar's fill", () => {
    const { state, world } = newGame(21);
    for (const [id, html] of Object.entries(panels(state, world))) {
      const baked = [...html.matchAll(/<div class="fill"[^>]*style="[^"]*width/g)];
      expect({ id, baked: baked.map((m) => m[0]) }).toEqual({ id, baked: [] });
    }
  });

  it("every name a fill carries is one the state can answer", () => {
    const { state, world } = newGame(21);
    const names = new Set<string>();
    for (const html of Object.values(panels(state, world))) {
      for (const m of html.matchAll(/data-fill="([^"]*)"/g)) names.add(m[1].replace(/&amp;/g, "&"));
    }
    expect(names.size).toBeGreaterThan(0);
    const unanswered = [...names].filter((n) => fillShare(state, n) === null);
    expect(unanswered).toEqual([]);
  });
});

/**
 * A pointer moving across the map is not the map's business.
 *
 * The tooltip's position is written onto its element, and its text is
 * guarded by a key that names the cell rather than the pointer. If either
 * ever leaks into the map's markup, the map redraws on every mousemove -
 * dozens of times a second, for a board of thousands of glyphs - and this
 * is the test that says so. Raising a budget is not the fix; taking the
 * coordinate back out is.
 */
describe("sweeping the pointer does not redraw the map", () => {
  it("the map's markup and key are the same still as swept", () => {
    const { state, world } = newGame(21);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    const still = `${mapKey(state, world, ui, cal)}|${mapHtml(world, state, ui, cal)}`;
    const l = levelAt(ui.zoom);
    let changed = 0;
    for (let f = 0; f < FRAMES; f++) {
      ui.hover = mapTargetAtPoint(world, state, ui, (f * 7) % (l.w * l.px), (f * 11) % (l.h * l.line))?.patch ?? null;
      const now = `${mapKey(state, world, ui, cal)}|${mapHtml(world, state, ui, cal)}`;
      if (now !== still) changed++;
    }
    expect(changed).toBe(0);
  });

  it("the tooltip redraws once per cell crossed, not once per pixel", () => {
    const { state, world } = newGame(21);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    const l = levelAt(ui.zoom);
    // Two hundred moves along one row of glyphs, a pixel at a time.
    let redraws = 0;
    let last = "";
    let cells = 0;
    let lastCell: number | null = null;
    for (let x = 0; x < 200; x++) {
      const cell = mapTargetAtPoint(world, state, ui, x, l.line / 2)?.patch ?? null;
      if (cell === null) continue;
      if (cell !== lastCell) cells++;
      lastCell = cell;
      const key = tipKey(state, world, cal, cell);
      if (key !== last) {
        last = key;
        redraws++;
        // The drawing itself must not depend on the pointer either.
        expect(tipHtml(state, world, cal, cell)).not.toMatch(/left:|top:/);
      }
    }
    expect(cells).toBeGreaterThan(1);
    expect(redraws).toBe(cells);
  });
});
