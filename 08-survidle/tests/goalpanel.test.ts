import { reveal } from "./opportunity-helpers";
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { OPPORTUNITIES, recordOpportunityEvent, acknowledgeOpportunities, queueOpportunityMessage, refreshOpportunities } from "../src/sim/opportunities";
import { newGame, newPerson } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { goalDoneHtml, goalGuideHtml, goalIntroductionToOpen, goalMomentToOpen, goalNoticeToOpen, goalsHtml } from "../src/ui/goalpanel";
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

  it("makes every active row one keyboard button with its goal id", () => {
    const { state, world } = newGame(3);
    for (const id of ["site", "drink", "firewood", "fire"] as const) state.opportunities.completedAt[id] = 0;
    document.body.innerHTML = goalsHtml(state, world, cal);
    const rows = [...document.querySelectorAll<HTMLLIElement>('li.goal:has(button:not([data-goal^="season:"]))')];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => [...row.children].map((child) => child.tagName))).toEqual([["BUTTON"], ["BUTTON"], ["BUTTON"]]);
    expect(rows.map((row) => row.querySelector("button")?.dataset.goal)).toEqual(["bed", "roof", "keptNight"]);
  });

  it("shows nothing once the ladder is finished", () => {
    const { state } = newGame(3);
    for (const g of OPPORTUNITIES) state.opportunities.completedAt[g.key] = 0;
    expect(goalsHtml(state, cal)).toBe("");
  });
});

describe("goal guidance", () => {
  it("covers every goal exactly once", () => {
    expect(GOAL_GUIDES.map((guide) => guide.id)).toEqual(OPPORTUNITIES.map((goal) => goal.key));
  });

  it("keeps every optional mechanics note in ASCII", () => {
    for (const guide of GOAL_GUIDES) {
      expect(guide.note ?? "", guide.id).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it("opens an active goal until its introduction is dismissed", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    expect(goalIntroductionToOpen(state, cal, ui)).toEqual(["site"]);
    acknowledgeOpportunities(state, ["site"]);
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

  it("reopens a weather lesson with the same copy without mutating world state", () => {
    const { state, world } = newGame(3);
    for (const id of ["site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook"] as const) state.opportunities.completedAt[id] = 0;
    state.opportunities.discoveredAt.findUsefulCover = 0;
    refreshOpportunities(state);
    const before = structuredClone(state.opportunities);
    const html = goalsHtml(state, world, cal);
    expect(html).toContain('data-goal="findUsefulCover"');
    const modal = goalGuideHtml(state, world, cal, ["findUsefulCover"], [], false);
    const guide = GOAL_GUIDES.find((candidate) => candidate.id === "findUsefulCover")!;
    expect(modal).toContain(guide.note);
    expect(modal).toContain("Current goal: Find useful cover");
    expect(modal).not.toContain("Explore &gt; Shelter");
    expect(state.opportunities).toEqual(before);
  });

  it("does not automatically introduce a lesson again after an heir arrives", () => {
    const { state, world } = newGame(3);
    for (const id of ["site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook"] as const) state.opportunities.completedAt[id] = 0;
    state.opportunities.discoveredAt.findUsefulCover = 0;
    refreshOpportunities(state);
    acknowledgeOpportunities(state, state.opportunities.notices.flatMap((notice) => notice.discovered));
    const cell = cellOf(state, world);
    const region = state.player.region;
    newPerson(state, world, cell, region);
    expect(goalIntroductionToOpen(state, cal, newUiState())).toBe(null);
  });
});

describe("the congratulation", () => {
  it("keeps factual notices behind completions and introductions until the shared overlay dismisses them", () => {
    const { state, world } = newGame(3);
    const ui = newUiState();
    queueOpportunityMessage(state, "The storm passed. Another opportunity will come.");
    state.opportunities.notices[0].completed = ["site"];
    expect(goalNoticeToOpen(state, ui)).toBe(null);
    acknowledgeOpportunities(state, [], ["site"]);
    expect(goalNoticeToOpen(state, ui)).toBe(null);
    acknowledgeOpportunities(state, ["site"]);
    const notices = goalNoticeToOpen(state, ui);
    expect(notices).toEqual(state.opportunities.notices.flatMap((notice) => notice.messages));
    const before = structuredClone(state.opportunities);
    const html = goalGuideHtml(state, world, cal, [], [], notices!);
    expect(html).toContain("The storm passed. Another opportunity will come.");
    expect(html).toContain('data-act="goal-close"');
    expect(state.opportunities).toEqual(before);
  });

  it("opens only on an announced queued completion", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    reveal(state, ["firewood"]);
    expect(goalMomentToOpen(state, ui)).toBe(null);
    recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 20 });
    expect(goalMomentToOpen(state, ui)).toEqual(["firewood"]);
  });

  it("lets a completion outrank a new introduction in the same minute", () => {
    const { state } = newGame(3);
    state.opportunities.completedAt.site = 0;
    state.opportunities.notices[0].completed = ["site"];
    const ui = newUiState();
    const done = goalMomentToOpen(state, ui);
    expect(done).toEqual(["site"]);
    ui.goalGuide = { ids: ["drink"], done: done!, automatic: true };
    expect(goalIntroductionToOpen(state, cal, ui)).toBe(null);
  });

  it("queues behind a larger teaching moment", () => {
    const { state } = newGame(3);
    const ui = newUiState();
    reveal(state, ["firewood"]);
    recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 20 });
    ui.teach = "job";
    expect(goalMomentToOpen(state, ui)).toBe(null);
  });

  it("uses explicit completed and available wording in one modal", () => {
    const { state, world } = newGame(3);
    state.opportunities.completedAt.site = 0;
    const html = goalGuideHtml(state, world, cal, ["drink"], ["site"]);
    expect(html).toContain("Goal completed: Choose where to live");
    expect(html).toContain("New goal available: Drink water");
    expect(html).not.toContain("[x] Choose where to live");
  });

  it("uses the same explicit wording in the standalone renderer", () => {
    const { state } = newGame(3);
    state.opportunities.completedAt.site = 0;
    const html = goalDoneHtml(state, cal, ["site"]);
    expect(html).toContain("<h1>Goals</h1>");
    expect(html).toContain("Goal completed: Choose where to live");
    expect(html).toContain("New goal available: Drink water");
  });
});
