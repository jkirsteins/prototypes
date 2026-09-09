import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { mapHtml, mapKey } from "../src/ui/map";
import { MOOD_BY_TASK, MOODS, moodOf } from "../src/ui/mood";
import { statsHtml } from "../src/ui/panels";
import { updateBars } from "../src/ui/bars";
import { newUiState } from "../src/ui/render";
import { ambientTemperature } from "../src/sim/weather";
import { COLLAPSE_RECOVERED_AT } from "../src/sim/sleep";
import type { GameState, TaskId } from "../src/sim/types";
import { css } from "./css";

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
    expect(mapHtml(world, state, ui, cal)).toContain("mk-player mood-work");
    expect(statsHtml(state, world, cal, ambient, ui)).toContain("stat-face mood-work");
    doing(state, "travel");
    expect(mapHtml(world, state, ui, cal)).toContain("mk-player mood-walk");
    expect(statsHtml(state, world, cal, ambient, ui)).toContain("stat-face mood-walk");
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

  it("carries no mood in a data attribute, which the morph would key the glyph by", () => {
    const { state, world } = newGame(17);
    doing(state, "chop");
    // A key that changed with the task would have the morph replace the @'s node at
    // every change of work instead of restyling it; see morphChildren in render.ts.
    expect(mapHtml(world, state, newUiState(), calendar(state.minute, state.startDoy))).not.toContain("data-mood");
  });

  it("draws every mood it can produce, and asks for none of it under reduced motion", () => {
    for (const mood of MOODS) {
      expect(css).toContain(`.mood-${mood}`);
    }
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("mood-walk");
    expect(reduced).toContain("mood-work");
  });

  it("shows the active collapse recovery line on the Energy bar", () => {
    const { state, world } = newGame(17);
    state.player.energy = 55;
    state.player.sleeping = { collapsed: true };
    const cal = calendar(state.minute, state.startDoy);
    const html = statsHtml(state, world, cal, ambientTemperature(cal, state.weather), newUiState());
    expect(html).toContain(`left:${COLLAPSE_RECOVERED_AT.toFixed(1)}%`);
    expect(html).toContain("work resumes here after collapse");
  });

  it("does not round Energy up across its active recovery line", () => {
    const { state, world } = newGame(17);
    state.player.energy = COLLAPSE_RECOVERED_AT - 0.1;
    state.player.sleeping = { collapsed: true };
    const cal = calendar(state.minute, state.startDoy);
    document.body.innerHTML = statsHtml(state, world, cal, ambientTemperature(cal, state.weather), newUiState());
    updateBars(state, world);
    expect(document.querySelector('[data-val="energy"]')?.textContent).toBe("99");
  });

  it("never animates a map cell with a positional transform", () => {
    const mapRules = css.match(/\.grid \.c[^}]*}/g)?.join("\n") ?? "";
    expect(mapRules).not.toMatch(/transform\s*:/);
    expect(mapRules).not.toContain("mood-step");
  });
});
