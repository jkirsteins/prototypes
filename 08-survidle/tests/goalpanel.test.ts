import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { GOALS, goalDeed } from "../src/sim/goals";
import { newGame } from "../src/sim/newgame";
import { goalDoneHtml, goalGuideHtml, goalIntroductionToOpen, goalMomentToOpen, goalsHtml, updateGoalBars } from "../src/ui/goalpanel";
import { GOAL_GUIDES } from "../src/ui/goalguide";
import { newUiState } from "../src/ui/render";

const cal = calendar(0);

describe("the goal panel", () => {
  it("shows the opening goal by name", () => {
    const { state, world } = newGame(3);
    const html = goalsHtml(state, world, cal);
    expect(html).toContain("Choose where to live");
    expect(html).toContain('data-act="goal-open"');
    expect(html).toContain("0 / 1");
    expect(html).not.toContain("Your goal");
  });

  it("shows nothing once the ladder is finished, so the panel can collapse", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    expect(goalsHtml(state, cal)).toBe("");
  });

  it("keeps the moving figure out of the markup, so the panel does not redraw on it", () => {
    const { state } = newGame(3);
    const before = goalsHtml(state, cal);
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 4.237 });
    expect(goalsHtml(state, cal)).toBe(before);
    expect(before).not.toContain("4.237");
  });

  it("writes the figure and the fill onto the named elements each frame", () => {
    const { state } = newGame(3);
    state.goals.done.site = true;
    state.goals.done.drink = true;
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 4 });
    document.body.innerHTML = `<div id="goals">${goalsHtml(state, cal)}</div>`;
    updateGoalBars(state, cal);
    expect(document.querySelector<HTMLElement>("#val-goal-firewood")!.textContent).toBe("4 / 10 kg");
    expect(document.querySelector<HTMLElement>("#bar-goal-firewood")!.style.width).toBe("40.0%");
  });

  it("floors the figure rather than rounding it up to a target not yet reached", () => {
    const { state } = newGame(3);
    state.goals.done.site = true;
    state.goals.done.drink = true;
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 9.6 });
    document.body.innerHTML = `<div id="goals">${goalsHtml(state, cal)}</div>`;
    updateGoalBars(state, cal);
    expect(document.querySelector<HTMLElement>("#val-goal-firewood")!.textContent).toBe("9 / 10 kg");
    expect(state.goals.done.firewood).toBeUndefined();
  });

  it("shows progress even for a goal that is simply done or not done", () => {
    const { state } = newGame(3);
    state.goals.done.site = true;
    state.goals.done.firewood = true;
    state.goals.done.drink = true;
    const html = goalsHtml(state, cal);
    expect(html).toContain("Light a fire");
    expect(html).toContain("bar-goal-fire");
    expect(html).toContain("0 / 1");
  });

  it("escapes nothing it does not have to, and never leaks a tag", () => {
    const { state } = newGame(3);
    expect(goalsHtml(state, cal)).not.toContain("<script");
  });
});

describe("goal guidance", () => {
  it("covers every goal exactly once", () => {
    expect(GOAL_GUIDES.map((guide) => guide.id)).toEqual(GOALS.map((goal) => goal.id));
  });

  it("opens an active goal until its introduction is dismissed", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    expect(goalIntroductionToOpen(state, cal, ui)).toEqual(["site"]);
    state.goals.introduced.site = true;
    expect(goalIntroductionToOpen(state, cal, ui)).toBe(null);
  });

  it("gives the first goal one reason, one path, and live progress", () => {
    const { state, world } = newGame(3);
    const html = goalGuideHtml(state, world, cal, ["site"]);
    expect(html).toContain("Choose where to live");
    expect(html).toContain("0 / 1");
    expect(html).toContain("Build &gt; Site");
    expect(html).not.toContain("Next step");
  });
});

describe("the congratulation", () => {
  it("opens on a queued completion", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    expect(goalMomentToOpen(state, ui)).toBe(null);
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    expect(goalMomentToOpen(state, ui)).toEqual(["firewood"]);
  });

  it("queues behind a rung moment, which is the larger event", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    ui.teach = "job";
    expect(goalMomentToOpen(state, ui)).toBe(null);
  });

  it("waits out the landing, the tombstone and the away report", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    const ui = newUiState();

    // Each guard blocks the opening while a completion is queued.
    ui.goalGuide = { ids: [], done: ["firewood"], automatic: true };
    expect(goalMomentToOpen(state, ui)).toBe(null);
    ui.goalGuide = null;

    ui.teach = "job";
    expect(goalMomentToOpen(state, ui)).toBe(null);
    ui.teach = null;

    ui.welcome = true;
    expect(goalMomentToOpen(state, ui)).toBe(null);
    ui.welcome = false;

    ui.manual = true;
    expect(goalMomentToOpen(state, ui)).toBe(null);
    ui.manual = false;

    ui.cemetery = true;
    expect(goalMomentToOpen(state, ui)).toBe(null);
    ui.cemetery = false;

    ui.away = { entries: [], orders: [], movedTo: null };
    expect(goalMomentToOpen(state, ui)).toBe(null);
    ui.away = null;

    state.landing = { cell: 0, region: 0, date: { doy: 1, year: 1 }, gapDays: 0, candidates: [], boat: 0, chosen: 0, name: { first: "Test", last: "Name" }, oldCamp: null };
    expect(goalMomentToOpen(state, ui)).toBe(null);
    state.landing = null;

    state.dead = { cause: "froze", minute: 0 };
    expect(goalMomentToOpen(state, ui)).toBe(null);
    state.dead = null;

    // With all guards clear, the queued completion opens.
    expect(goalMomentToOpen(state, ui)).toEqual(["firewood"]);
  });

  it("gathers a catch-up's completions into one screen rather than a stack", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    goalDeed(state, { kind: "built", structure: "boughBed" });
    expect(goalMomentToOpen(state, ui)).toEqual(["firewood", "bed"]);
  });

  it("names what was done and where to go next", () => {
    const { state } = newGame(3);
    state.goals.done.site = true;
    state.goals.done.drink = true;
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    const html = goalDoneHtml(state, cal, ["firewood"]);
    expect(html).toContain("Gather 10 kg of firewood");
    expect(html).toContain("Light a fire");
    expect(html).toContain("goal-close");
  });

  it("introduces nothing when the ladder is finished", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    const html = goalDoneHtml(state, cal, ["winter"]);
    expect(html).toContain("Live to see the winter");
    expect(html).not.toContain("Next");
  });
});
