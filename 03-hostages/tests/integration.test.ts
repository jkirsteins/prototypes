import { describe, it, expect } from "vitest";
import {
  chooseOpening,
  legalPlayerAnswers,
  legalPlayerDiscards,
  legalPlayerLeads,
  newRun,
  playerAnswer,
  playerDiscard,
  playerLead,
  playerPass,
  playerSurrender,
} from "../src/game";
import { summarize } from "../src/summary";
import type { GameState } from "../src/types";

/** Plays greedily: the first legal lead, always declines, surrenders in order. */
function autoplay(state: GameState, maxSteps = 400): GameState {
  let steps = 0;
  while (state.phase !== "gameOver" && steps < maxSteps) {
    steps += 1;
    if (state.phase === "playerLead") {
      const legal = legalPlayerLeads(state).filter((o) => o.legality.ok);
      if (legal.length === 0) playerPass(state);
      else playerLead(state, legal[0].cardId);
    } else if (state.phase === "playerAnswer") {
      playerAnswer(state, null);
    } else if (state.phase === "forcedSurrender") {
      playerSurrender(state, state.secretsRemaining[0]);
    } else if (state.phase === "discardDown") {
      playerDiscard(state, legalPlayerDiscards(state)[0]);
    }
  }
  expect(steps).toBeLessThan(maxSteps);
  return state;
}

describe("full runs", () => {
  it("terminates for many seeds and always produces a summary", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = newRun(seed);
      chooseOpening(state, "shield");
      autoplay(state);
      expect(state.phase).toBe("gameOver");
      expect(state.outcome).not.toBeNull();
      const summary = summarize(state);
      expect(summary.headline.length).toBeGreaterThan(0);
      expect(summary.lines.length).toBeGreaterThan(0);
    }
  });

  it("is reproducible for a given seed and opening", () => {
    const a = newRun(12);
    chooseOpening(a, "phone");
    autoplay(a);
    const b = newRun(12);
    chooseOpening(b, "phone");
    autoplay(b);
    expect(b.outcome).toBe(a.outcome);
    expect(b.log.map((e) => e.text)).toEqual(a.log.map((e) => e.text));
  });

  it("reaches a victory when the player plays the setup properly", () => {
    const state = newRun(5);
    chooseOpening(state, "shield");
    // Script a win: distract him, get free, batter him down, then bind him twice.
    state.playerPile.hand = ["lieAboutTheMoney", "wiggleOut", "kickHisKnee"];
    state.convictPile.hand = [];
    state.convict.vigor = 2;
    state.player.bound = false;
    state.scene.range = "near";
    state.convict.offBalance = true;
    state.playerPile.hand = ["shoulderCharge"];
    playerLead(state, "shoulderCharge");
    expect(state.convict.incapacitated).toBe(true);
    state.phase = "playerLead";
    state.convict.vigor = 0;
    state.convict.incapacitated = true;
    playerLead(state, "bindHisHands");
    expect(state.notYetSpent).toBe(true);
    state.phase = "playerLead";
    state.convict.vigor = 0;
    state.convict.incapacitated = true;
    playerLead(state, "bindHisHands");
    expect(state.outcome).toBe("victory");
    expect(summarize(state).headline).toMatch(/You win/);
  });

  it("reaches the secrets loss once the count of remaining secrets hits zero", () => {
    const state = newRun(6);
    chooseOpening(state, "comply");
    state.secretsRemaining = ["secretFloorboard"];
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = ["whereIsIt"];
    playerLead(state, "stallHim");
    playerAnswer(state, "secretFloorboard");
    expect(state.outcome).toBe("lossSecrets");
    expect(summarize(state).headline).toMatch(/knows where the money is/);
  });

  it("never offers an answer option the engine would reject", () => {
    const state = newRun(9);
    chooseOpening(state, "shield");
    let guard = 0;
    while (state.phase !== "gameOver" && guard < 200) {
      guard += 1;
      if (state.phase === "playerLead") {
        const legal = legalPlayerLeads(state).filter((o) => o.legality.ok);
        if (legal.length === 0) playerPass(state);
        else playerLead(state, legal[0].cardId);
      } else if (state.phase === "playerAnswer") {
        const legal = legalPlayerAnswers(state).filter((o) => o.legality.ok);
        if (legal.length === 0) {
          playerAnswer(state, null);
        } else {
          const pick = legal.find((o) => !o.cardId.startsWith("secret")) ?? null;
          expect(() => playerAnswer(state, pick ? pick.cardId : null)).not.toThrow();
        }
      } else if (state.phase === "forcedSurrender") {
        playerSurrender(state, state.secretsRemaining[0]);
      } else if (state.phase === "discardDown") {
        playerDiscard(state, legalPlayerDiscards(state)[0]);
      }
    }
    expect(state.phase).toBe("gameOver");
  });
});
