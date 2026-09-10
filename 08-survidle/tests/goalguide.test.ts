import { reveal } from "./opportunity-helpers";
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { OPPORTUNITIES, recordOpportunityEvent } from "../src/sim/opportunities";
import { newGame } from "../src/sim/newgame";
import { goalGuide, goalProgress } from "../src/ui/goalguide";

describe("goal guidance", () => {
  it("covers every goal without prescribing UI paths", () => {
    for (const goal of OPPORTUNITIES) {
      const guide = goalGuide(goal.key);
      expect(guide.id).toBe(goal.key);
      expect(guide.note ?? "").not.toContain(">");
      expect(guide.note ?? "").toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it("explains automatic drinking and the activity queue exactly once", () => {
    const note = goalGuide("drink").note;
    expect(note).toBe("Below 1 litre, the survivor drinks automatically from water at hand. If travel is needed, Self-care handles it through the activity queue.");
  });

  it("leaves an obvious camp goal without explanatory copy", () => {
    expect(goalGuide("site").note).toBeUndefined();
  });

  it("warns that raw meat rots and drying preserves it", () => {
    expect(goalGuide("store").note).toBe("Raw meat rots quickly; drying makes it last.");
  });

  it("shows stored deed progress instead of inferring it from possessions", () => {
    const { state, world } = newGame(3);
    reveal(state, ["fire"]);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    const progress = goalProgress(state, world, calendar(state.minute, state.startDoy), "fire");
    expect(progress.steps.map((step) => [step.label, step.done])).toEqual([
      ["Establish a fire site", true],
      ["Provide fuel", false],
      ["Provide ignition", false],
      ["Light the fire", false],
    ]);
  });
});
