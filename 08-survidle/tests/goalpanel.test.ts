import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { GOALS, goalDeed } from "../src/sim/goals";
import { newGame } from "../src/sim/newgame";
import { goalsHtml, updateGoalBars } from "../src/ui/goalpanel";

const cal = calendar(0);

describe("the goal panel", () => {
  it("shows the opening goal by name", () => {
    const { state } = newGame(3);
    expect(goalsHtml(state, cal)).toContain("Bring 10 kg of firewood back to camp");
  });

  it("shows nothing once the ladder is finished, so the panel can collapse", () => {
    const { state } = newGame(3);
    for (const g of GOALS) state.goals.done[g.id] = true;
    expect(goalsHtml(state, cal)).toBe("");
  });

  it("keeps the moving figure out of the markup, so the panel does not redraw on it", () => {
    const { state } = newGame(3);
    const before = goalsHtml(state, cal);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 4.237 });
    expect(goalsHtml(state, cal)).toBe(before);
    expect(before).not.toMatch(/\d+\.\d+%/);
  });

  it("writes the figure and the fill onto the named elements each frame", () => {
    const { state } = newGame(3);
    goalDeed(state, { kind: "delivered", item: "firewood", kg: 4 });
    document.body.innerHTML = `<div id="goals">${goalsHtml(state, cal)}</div>`;
    updateGoalBars(state, cal);
    expect(document.querySelector<HTMLElement>("#val-goal-firewood")!.textContent).toBe("4 / 10 kg");
    expect(document.querySelector<HTMLElement>("#bar-goal-firewood")!.style.width).toBe("40.0%");
  });

  it("draws no bar on a goal that is simply done or not done", () => {
    const { state } = newGame(3);
    state.goals.done.firewood = true;
    const html = goalsHtml(state, cal);
    expect(html).toContain("Light a fire");
    expect(html).not.toContain("bar-goal-fire");
  });

  it("escapes nothing it does not have to, and never leaks a tag", () => {
    const { state } = newGame(3);
    expect(goalsHtml(state, cal)).not.toContain("<script");
  });
});
