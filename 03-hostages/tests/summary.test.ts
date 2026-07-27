import { describe, it, expect } from "vitest";
import { summarize } from "../src/summary";
import { newRun, chooseOpening } from "../src/game";
import type { GameState } from "../src/types";

function finished(outcome: GameState["outcome"]): GameState {
  const state = newRun(2);
  chooseOpening(state, "shield");
  state.outcome = outcome;
  state.turn = 14;
  return state;
}

describe("summarize", () => {
  it("refuses to summarise a run in progress", () => {
    const state = newRun(1);
    expect(() => summarize(state)).toThrow(/not over/);
  });

  it("headlines a victory", () => {
    const summary = summarize(finished("victory"));
    expect(summary.headline).toMatch(/You win/i);
  });

  it("headlines each defeat differently", () => {
    const secrets = summarize(finished("lossSecrets")).headline;
    const vigor = summarize(finished("lossVigor")).headline;
    const wife = summarize(finished("lossWife")).headline;
    expect(new Set([secrets, vigor, wife]).size).toBe(3);
  });

  it("reports how long it lasted", () => {
    const summary = summarize(finished("victory"));
    expect(summary.lines.join(" ")).toMatch(/14 turns/);
  });

  it("says nothing was given up when no secrets were spent", () => {
    const summary = summarize(finished("victory"));
    expect(summary.lines.join(" ")).toMatch(/told him nothing/i);
  });

  it("lists each secret and whether it was forced", () => {
    const state = finished("victory");
    state.stats.secretsGiven = [
      { cardId: "secretFreezer", coerced: true },
      { cardId: "secretSafe", coerced: false },
    ];
    const text = summarize(state).lines.join(" ");
    expect(text).toMatch(/freezer/i);
    expect(text).toMatch(/headboard/i);
    expect(text).toMatch(/because he made you/i);
    expect(text).toMatch(/because you chose to/i);
  });

  it("reports how close she came", () => {
    const state = finished("victory");
    state.stats.wifeLowestVigor = 1;
    expect(summarize(state).lines.join(" ")).toMatch(/1 vigor/);
  });

  it("notes when he had to use his last reserve", () => {
    const state = finished("victory");
    state.stats.notYetForced = true;
    expect(summarize(state).lines.join(" ")).toMatch(/got back up once/i);
  });

  it("reports the largest willpower swing when there was one", () => {
    const state = finished("lossSecrets");
    state.stats.largestWillpowerSwing = { amount: 4, cause: "watching her get hurt" };
    expect(summarize(state).lines.join(" ")).toMatch(/watching her get hurt/);
  });
});
