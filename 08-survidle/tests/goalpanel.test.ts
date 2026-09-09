import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { GOALS, goalDeed, introduceGoals } from "../src/sim/goals";
import { newGame } from "../src/sim/newgame";
import { goalDoneHtml, goalGuideHtml, goalIntroductionToOpen, goalMomentToOpen, goalsHtml } from "../src/ui/goalpanel";
import { GOAL_GUIDES } from "../src/ui/goalguide";
import { newUiState } from "../src/ui/render";

const cal = calendar(0);

describe("the goal panel", () => {
  it("is a named checklist without progress chrome", () => {
    const { state, world } = newGame(3);
    const html = goalsHtml(state, world, cal);
    expect(html).toContain("<h2>Goals</h2>");
    expect(html).toContain("[ ]");
    expect(html).toContain("Choose where to live");
    expect(html).toContain('data-act="goal-open"');
    expect(html).not.toContain("0 / 1");
    expect(html).not.toContain('class="bar"');
    expect(html).not.toContain("goal-next");
  });

  it("shows nothing once the ladder is finished", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    expect(goalsHtml(state, cal)).toBe("");
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
    introduceGoals(state, ["site"]);
    expect(goalIntroductionToOpen(state, cal, ui)).toBe(null);
  });

  it("labels a new goal explicitly and does not prescribe a route", () => {
    const { state, world } = newGame(3);
    const html = goalGuideHtml(state, world, cal, ["site"]);
    expect(html).toContain("<h1>Goals</h1>");
    expect(html).toContain("New goal available: Choose where to live");
    expect(html).toContain("[ ]</span> Make camp");
    expect(html).not.toContain("Build &gt; Site");
    expect(html).not.toContain("0 / 1");
  });

  it("labels a manually opened goal as current", () => {
    const { state, world } = newGame(3);
    const html = goalGuideHtml(state, world, cal, ["drink"], [], false);
    expect(html).toContain("Current goal: Drink water");
    expect(html).not.toContain("New goal available");
  });

  it("shows the concise water mechanics note", () => {
    const { state, world } = newGame(3);
    const html = goalGuideHtml(state, world, cal, ["drink"]);
    expect(html).toContain("Below 1 litre, the survivor drinks automatically");
    expect(html).toContain("Self-care handles it through the activity queue");
  });
});

describe("the congratulation", () => {
  it("opens only on an announced queued completion", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    introduceGoals(state, ["firewood"]);
    expect(goalMomentToOpen(state, ui)).toBe(null);
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    expect(goalMomentToOpen(state, ui)).toEqual(["firewood"]);
  });

  it("queues behind a larger teaching moment", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    introduceGoals(state, ["firewood"]);
    goalDeed(state, { kind: "gathered", item: "firewood", kg: 20 });
    ui.teach = "job";
    expect(goalMomentToOpen(state, ui)).toBe(null);
  });

  it("uses explicit completed and available wording in one modal", () => {
    const { state, world } = newGame(3);
    state.goals.done.site = true;
    const html = goalGuideHtml(state, world, cal, ["drink"], ["site"]);
    expect(html).toContain("Goal completed: Choose where to live");
    expect(html).toContain("New goal available: Drink water");
    expect(html).not.toContain("[x] Choose where to live");
  });

  it("uses the same explicit wording in the standalone renderer", () => {
    const { state } = newGame(3);
    state.goals.done.site = true;
    const html = goalDoneHtml(state, cal, ["site"]);
    expect(html).toContain("<h1>Goals</h1>");
    expect(html).toContain("Goal completed: Choose where to live");
    expect(html).toContain("New goal available: Drink water");
  });
});
