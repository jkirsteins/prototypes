import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { mapKey } from "../src/ui/map";
import { board, glyphsWith } from "./board";
import { MOOD_BY_TASK, MOODS, moodOf } from "../src/ui/mood";
import { statsHtml } from "../src/ui/panels";
import { updateBars } from "../src/ui/bars";
import { newUiState } from "../src/ui/render";
import { ambientTemperature } from "../src/sim/weather";
import { RESTED_AT, sleepiness, SLEEP_ONSET, SLEEPY_AT, WAKE_AT } from "../src/sim/sleep";
import { regionState } from "../src/sim/regionstate";
import type { GameState, TaskId } from "../src/sim/types";
import { css } from "./css";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

afterEach(() => vi.restoreAllMocks());

/** A task on the player, with only the fields the mood reads filled in. */
function doing(state: GameState, id: TaskId): void {
  state.task = { id, progress: 0, duration: 60, repeat: false };
}

describe("the mood a task reads as", () => {
  it("files every task under a mood the stylesheet draws", () => {
    const ids = Object.keys(MOOD_BY_TASK) as TaskId[];
    // The table is a Record<TaskId, Mood>, so tsc already refuses a task with no
    // mood; this holds the other end, that no mood is invented without a rule.
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) expect(MOODS).toContain(MOOD_BY_TASK[id]);
  });

  it("names walking, work, rest, sleep and standing still apart", () => {
    const { state } = newGame(17);
    expect(moodOf(state)).toBe("idle");
    doing(state, "travel");
    expect(moodOf(state)).toBe("walk");
    doing(state, "haul");
    expect(moodOf(state)).toBe("walk");
    doing(state, "chop");
    expect(moodOf(state)).toBe("work");
    doing(state, "makeCamp");
    expect(moodOf(state)).toBe("work");
    doing(state, "emergencyShelter");
    expect(moodOf(state)).toBe("work");
    doing(state, "readSky");
    expect(moodOf(state)).toBe("work");
    doing(state, "rest");
    expect(moodOf(state)).toBe("rest");
    doing(state, "sleep");
    expect(moodOf(state)).toBe("sleep");
  });

  it("holds the dead still whatever they were doing", () => {
    const { state } = newGame(17);
    doing(state, "chop");
    state.dead = { cause: "froze", minute: state.minute };
    expect(moodOf(state)).toBe("idle");
  });
});

describe("the mood on the screen", () => {
  it("puts it on the player's glyph and on the header portrait at once", () => {
    const { state, world } = newGame(17);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    const ambient = ambientTemperature(cal, state.weather);
    doing(state, "chop");
    expect(glyphsWith(board(world, state, ui, cal), "mk-player", "mood-work")).toHaveLength(1);
    expect(statsHtml(state, world, cal, ambient, ui)).toContain("stat-face mood-work");
    doing(state, "travel");
    expect(glyphsWith(board(world, state, ui, cal), "mk-player", "mood-walk")).toHaveLength(1);
    expect(statsHtml(state, world, cal, ambient, ui)).toContain("stat-face mood-walk");
  });

  it("puts live condition and firelight classes on the header portrait", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    doing(state, "chop");
    const focused = statsHtml(state, world, cal, 0, ui);
    expect(focused).toContain("data-portrait-signature");
    expect(focused).toContain("is-focused");
    state.player.warmth = 35;
    expect(statsHtml(state, world, cal, 0, ui)).toContain("is-cold");
    state.player.warmth = 80;
    regionState(state, world, state.player.region).fire.lit = true;
    expect(statsHtml(state, world, cal, 0, ui)).toContain("is-firelit");
  });

  it("changes the map's key, so a mood that changes while you stand still is drawn", () => {
    const { state, world } = newGame(17);
    const ui = newUiState();
    const cal = calendar(state.minute, state.startDoy);
    doing(state, "chop");
    const working = mapKey(state, world, ui, cal);
    doing(state, "sleep");
    expect(mapKey(state, world, ui, cal)).not.toBe(working);
  });

  it("carries the mood as one of the glyph's own words, where the palette and the pulse read it", () => {
    const { state, world } = newGame(17);
    doing(state, "chop");
    const you = glyphsWith(board(world, state, newUiState(), calendar(state.minute, state.startDoy)), "mk-player")[0];
    expect(you.classes.filter((c) => c.startsWith("mood-"))).toEqual(["mood-work"]);
  });

  it("draws every mood it can produce, and asks for none of it under reduced motion", () => {
    for (const mood of MOODS) {
      expect(css).toContain(`.mood-${mood}`);
    }
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("mood-walk");
    expect(reduced).toContain("mood-work");
    expect(css).toContain(".portrait.is-firelit");
    expect(css).toContain("radial-gradient(ellipse at 50% 100%");
    expect(css).toContain(".portrait.is-focused");
    expect(css).toContain(".portrait.is-hot");
    expect(css).toContain(".portrait.is-cold");
    expect(reduced).toContain(".portrait.is-firelit::before");
  });

  it("names the physical reserve Stamina and shows why collapse still blocks work", () => {
    const { state, world } = newGame(17);
    state.player.energy = RESTED_AT - 1;
    state.player.collapsed = true;
    const cal = calendar(state.minute, state.startDoy);
    const html = statsHtml(state, world, cal, ambientTemperature(cal, state.weather), newUiState());
    expect(html).toContain(`left:${RESTED_AT.toFixed(1)}%`);
    expect(html).toContain("work resumes here after collapse");
    expect(html).toContain("Stamina");
    expect(html).toContain(`recovering from collapse, work resumes at ${RESTED_AT} Stamina`);
  });

  it("does not round Stamina up across its active recovery line", () => {
    const { state, world } = newGame(17);
    state.player.energy = RESTED_AT - 0.1;
    state.player.collapsed = true;
    const cal = calendar(state.minute, state.startDoy);
    document.body.innerHTML = statsHtml(state, world, cal, ambientTemperature(cal, state.weather), newUiState());
    updateBars(state, world);
    expect(document.querySelector('[data-val="energy"]')?.textContent).toBe(String(Math.floor(RESTED_AT - 0.1)));
  });

  it("reads alertness as the lower band of the Stamina bar, lower is worse, with the sleep lines on the band", () => {
    const { state, world } = newGame(17);
    state.player.energy = 100;
    state.player.sleepDebt = 40;
    const cal = calendar(state.minute, state.startDoy);
    document.body.innerHTML = statsHtml(state, world, cal, ambientTemperature(cal, state.weather), newUiState());
    updateBars(state, world);
    // One bar, not two: the old Sleepiness bar counted the wrong way up.
    expect(document.querySelector('[data-bar="sleepiness"]')).toBeNull();
    const bar = document.querySelector('[data-bar="alertness"]')?.parentElement;
    expect(bar?.classList.contains("dual")).toBe(true);
    expect(bar?.querySelector('[data-bar="energy"]')).not.toBeNull();
    expect(bar?.textContent).toContain("Stamina");
    expect(bar?.textContent).toContain("alert");
    const sleepy = sleepiness(40, cal.hour);
    expect(bar?.querySelector('[data-val="alertness"]')?.textContent).toBe(String(Math.round(100 - sleepy)));
    expect((bar?.querySelector('[data-bar="alertness"]') as HTMLElement | null)?.style.width).toBe(`${(100 - sleepy).toFixed(1)}%`);
    const band = [...(bar?.querySelectorAll(".mark.band") ?? [])].map((m) => `${(m as HTMLElement).style.left} ${m.getAttribute("title")}`);
    expect(band).toEqual([
      `${(100 - SLEEP_ONSET).toFixed(1)}% falls asleep below here`,
      `${(100 - SLEEPY_AT).toFixed(1)}% sleepy below here`,
      `${(100 - WAKE_AT).toFixed(1)}% wakes above here`,
    ]);
    const stamina = [...(bar?.querySelectorAll(".mark:not(.band)") ?? [])].map((m) => m.getAttribute("title"));
    expect(stamina).toEqual(["stops work and rests below here", "rest ends here", "collapses below here"]);
    expect(document.querySelector('[data-val="energy"]')?.textContent).toBe("100");

    state.player.sleepDebt = 100;
    updateBars(state, world);
    expect(bar?.querySelector('[data-val="alertness"]')?.textContent).toBe("0");
  });

  it("shows the practical sleep clock beside the Stamina bar", () => {
    const { state, world } = newGame(17);
    state.minute = 5 * 60;
    state.player.sleepDebt = 10;
    const cal = calendar(state.minute, state.startDoy);
    document.body.innerHTML = statsHtml(state, world, cal, ambientTemperature(cal, state.weather), newUiState());
    updateBars(state, world);
    expect(document.querySelector("[data-sleep-forecast]")?.textContent).toBe("Sleep about 00:20");

    state.player.sleeping = { collapsed: false };
    state.player.sleepDebt = 64;
    updateBars(state, world);
    expect(document.querySelector("[data-sleep-forecast]")?.textContent).toMatch(/^Wake about \d\d:\d\d$/);

    state.survivors.at(-1)!.person.quirks = ["sleepsLight"];
    testAtmosphere({ precipMmPerHour: 10, rainMmPerHour: 10, precip: "rain", windKmh: 40 });
    updateBars(state, world);
    expect(document.querySelector("[data-sleep-forecast]")?.textContent).toMatch(
      /^Wake about \d\d:\d\d - storm reduces sleep quality$/,
    );
  });

  it("never animates a map glyph through the stylesheet at all", () => {
    // The board is a canvas: there are no cell rules left to animate, and the
    // mood's pulse is a fill the effects layer draws (map.ts, drawPulses).
    expect(css).not.toMatch(/\.grid \.c\b/);
    expect(css).not.toContain("mood-toil");
  });
});
