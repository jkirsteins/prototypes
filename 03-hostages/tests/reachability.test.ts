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
import { cardById } from "../src/content/cards";
import type { GameState } from "../src/types";

/**
 * A competent-but-not-optimal player: finish him when possible, set up when not,
 * defend when it is cheap, and spend secrets only under real pressure.
 */
function playWell(state: GameState, maxSteps = 600): GameState {
  let steps = 0;
  while (state.phase !== "gameOver" && steps < maxSteps) {
    steps += 1;
    if (state.phase === "discardDown") {
      playerDiscard(state, legalPlayerDiscards(state)[0]);
      continue;
    }
    if (state.phase === "forcedSurrender") {
      playerSurrender(state, state.secretsRemaining[0]);
      continue;
    }
    if (state.phase === "playerAnswer") {
      const legal = legalPlayerAnswers(state).filter((o) => o.legality.ok);
      const nonSecret = legal.find((o) => !cardById(o.cardId).tags.includes("secret"));
      playerAnswer(state, nonSecret ? nonSecret.cardId : null);
      continue;
    }
    const legal = legalPlayerLeads(state).filter((o) => o.legality.ok);
    if (legal.length === 0) {
      playerPass(state);
      continue;
    }
    const prefer = [
      "bindHisHands",
      "shoulderCharge",
      "headbutt",
      "lampCord",
      "kickHisKnee",
      "grabForTheKnife",
      "wiggleOut",
      "rockTheChair",
      "stallHim",
      "lieAboutTheMoney",
    ];
    const pick =
      prefer.map((id) => legal.find((o) => o.cardId === id)).find((o) => o !== undefined) ??
      legal[0];
    playerLead(state, pick.cardId);
  }
  return state;
}

describe("reachability", () => {
  it("lets a competent player actually win sometimes", () => {
    const openings = ["shield", "phone", "comply"];
    let victories = 0;
    let everDrivenToTheFloor = false;
    for (const opening of openings) {
      for (let seed = 1; seed <= 60; seed += 1) {
        const state = newRun(seed);
        chooseOpening(state, opening);
        playWell(state);
        if (state.convict.incapacitated || state.outcome === "victory") {
          everDrivenToTheFloor = true;
        }
        if (state.outcome === "victory") victories += 1;
      }
    }
    expect(everDrivenToTheFloor).toBe(true);
    expect(victories).toBeGreaterThan(0);
  });

  it("never strands the player in a state that cannot be won", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = newRun(seed);
      chooseOpening(state, "shield");
      playWell(state);
      // A finished run - win or loss - has already been decided and is not
      // "stranded"; only an active run that has painted itself into this
      // corner would be. Since secretFloorboard now also relocates the
      // convict (setRange away) as part of the count-based secrets rule,
      // a run that ends in lossSecrets can legitimately finish with this
      // exact zone/range combination.
      const stranded =
        state.phase !== "gameOver" &&
        state.scene.zone === "bedroom" &&
        state.scene.range === "away" &&
        !state.player.bound &&
        !state.secretsRemaining.includes("secretSafe");
      expect(stranded).toBe(false);
    }
  });
});
