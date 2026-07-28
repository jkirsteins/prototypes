import { describe, it, expect } from "vitest";
import {
  newRun,
  chooseOpening,
  playerLead,
  playerPass,
  playerAnswer,
  playerSurrender,
  playerDiscard,
  legalPlayerAnswers,
  legalPlayerLeads,
  legalPlayerDiscards,
} from "../src/game";
import { HAND_CAP } from "../src/types";
import type { GameState } from "../src/types";

function started(seed = 1, choice = "shield"): GameState {
  const state = newRun(seed);
  chooseOpening(state, choice);
  return state;
}

/**
 * Force a specific hand so a scenario is deterministic. Emptying the deck and
 * discard matters: the convict draws at the start of his turn, and a stray draw
 * would otherwise hand the AI a card the scenario did not account for.
 */
function stage(state: GameState, opts: {
  playerHand?: string[];
  convictHand?: string[];
}): void {
  if (opts.playerHand) {
    state.playerPile.hand = [...opts.playerHand];
    state.playerPile.deck = [];
    state.playerPile.discard = [];
  }
  if (opts.convictHand) {
    state.convictPile.hand = [...opts.convictHand];
    state.convictPile.deck = [];
    state.convictPile.discard = [];
  }
}

describe("newRun and chooseOpening", () => {
  it("starts at the opening event with shuffled piles", () => {
    const state = newRun(7);
    expect(state.phase).toBe("openingEvent");
    expect(state.playerPile.deck).toHaveLength(16);
    expect(state.convictPile.deck).toHaveLength(15);
    expect(state.playerPile.hand).toEqual([]);
  });

  it("is reproducible for a seed", () => {
    expect(newRun(3).playerPile.deck).toEqual(newRun(3).playerPile.deck);
  });

  it("applies the chosen stance and deals three cards each", () => {
    const state = started(1, "comply");
    expect(state.phase).toBe("playerLead");
    expect(state.turn).toBe(1);
    expect(state.player.willpower).toBe(4);
    expect(state.convict.willpower).toBe(5);
    expect(state.scene.range).toBe("away");
    expect(state.player.bound).toBe(true);
    expect(state.playerPile.hand).toHaveLength(3);
    expect(state.convictPile.hand).toHaveLength(3);
    expect(state.secretsRemaining).toHaveLength(3);
  });

  it("rejects an unknown opening choice", () => {
    const state = newRun(1);
    expect(() => chooseOpening(state, "nope")).toThrow(/Unknown opening/);
  });
});

describe("leading", () => {
  it("refuses an illegal lead", () => {
    const state = started();
    stage(state, { playerHand: ["kickHisKnee"] });
    expect(() => playerLead(state, "kickHisKnee")).toThrow(/not legal/);
  });

  it("refuses a card that is not in hand", () => {
    const state = started();
    stage(state, { playerHand: ["stallHim"] });
    expect(() => playerLead(state, "headbutt")).toThrow(/not available/);
  });

  it("resolves an unanswered lead and discards it", () => {
    const state = started();
    stage(state, { playerHand: ["stallHim"], convictHand: [] });
    // A real run always has cards left in the deck at this hand size; a
    // completely empty deck+discard is a test-only degenerate case that
    // would make the next-turn draw reshuffle the card we are about to
    // discard right back into hand. Seed one filler card so the draw at
    // the end of this call has something else to find.
    state.playerPile.deck = ["flinch"];
    const before = state.convict.willpower;
    playerLead(state, "stallHim");
    expect(state.convict.willpower).toBe(before - 2);
    expect(state.playerPile.discard).toContain("stallHim");
    expect(state.log.some((e) => e.cardId === "stallHim" && e.kind === "lead")).toBe(true);
  });

  it("lets the convict answer and negate", () => {
    const state = started();
    state.player.bound = true;
    stage(state, { playerHand: ["wiggleOut"], convictHand: ["expertKnots"] });
    playerLead(state, "wiggleOut");
    expect(state.player.bound).toBe(true);
    expect(state.log.some((e) => e.cardId === "expertKnots" && e.kind === "answer")).toBe(true);
  });

  it("passing draws an extra card", () => {
    const state = started();
    const handBefore = state.playerPile.hand.length;
    stage(state, { convictHand: [] });
    playerPass(state);
    expect(state.log.some((e) => e.kind === "pass")).toBe(true);
    expect(state.playerPile.hand.length).toBeGreaterThanOrEqual(handBefore);
  });

  it("draws on the next turn even when leading from a full hand", () => {
    const state = started();
    stage(state, {
      playerHand: ["stallHim", "stoic", "flinch", "talkHimDown", "takeItForHer"],
      convictHand: [],
    });
    state.playerPile.deck = ["kickHisKnee"];
    playerLead(state, "stallHim");
    expect(state.playerPile.hand).toHaveLength(5);
    expect(state.playerPile.hand).toContain("kickHisKnee");
  });
});

describe("answering and coercion", () => {
  it("stops for the player to answer a convict lead", () => {
    const state = started();
    stage(state, { playerHand: ["stallHim"], convictHand: ["backhand"] });
    playerLead(state, "stallHim");
    expect(state.phase).toBe("playerAnswer");
    expect(state.pendingLead?.cardId).toBe("backhand");
  });

  it("declining lets the lead resolve in full", () => {
    const state = started();
    stage(state, { playerHand: ["stallHim"], convictHand: ["backhand"] });
    playerLead(state, "stallHim");
    const vigorBefore = state.player.vigor;
    playerAnswer(state, null);
    expect(state.player.vigor).toBe(vigorBefore - 1);
    expect(state.phase).toBe("playerLead");
  });

  it("reports a card not in hand as unavailable even when it would also be illegal", () => {
    const state = started();
    stage(state, { playerHand: ["stallHim"], convictHand: ["backhand"] });
    playerLead(state, "stallHim");
    // Take It For Her only answers a threatensWife card, and backhand is not
    // one, so this card fails both checks. Availability must win the race,
    // matching playerLead's order, rather than reporting "not legal" for a
    // card the player was never even holding.
    expect(() => playerAnswer(state, "takeItForHer")).toThrow(/not available/);
  });

  it("fires coercion when willpower ends at zero", () => {
    const state = started();
    state.player.willpower = 2;
    stage(state, { playerHand: ["stallHim"], convictHand: ["whereIsIt"] });
    playerLead(state, "stallHim");
    playerAnswer(state, null);
    expect(state.phase).toBe("forcedSurrender");
    expect(state.player.willpower).toBe(0);
  });

  it("stoic defuses coercion by lifting willpower first", () => {
    const state = started();
    state.player.willpower = 2;
    stage(state, { playerHand: ["stallHim", "stoic"], convictHand: ["whereIsIt"] });
    playerLead(state, "stallHim");
    playerAnswer(state, "stoic");
    expect(state.player.willpower).toBe(2);
    expect(state.phase).toBe("playerLead");
    expect(state.coercionDefused).toBe(true);
  });

  it("talk him down strips the demand but not the damage", () => {
    const state = started();
    state.player.willpower = 2;
    stage(state, { playerHand: ["stallHim", "talkHimDown"], convictHand: ["whereIsIt"] });
    playerLead(state, "stallHim");
    playerAnswer(state, "talkHimDown");
    expect(state.player.willpower).toBe(0);
    expect(state.phase).toBe("playerLead");
    expect(state.coercionDefused).toBe(true);
  });

  it("giving up a secret to a coercive lead is capitulation, not resistance", () => {
    const state = started();
    state.player.willpower = 2;
    stage(state, { playerHand: ["stallHim"], convictHand: ["whereIsIt"] });
    playerLead(state, "stallHim");
    playerAnswer(state, "secretFreezer");
    expect(state.player.willpower).toBe(3);
    expect(state.coercionDefused).toBe(false);
    expect(state.stats.secretsGiven).toEqual([{ cardId: "secretFreezer", coerced: false }]);
    const coercionLogs = state.log.filter((e) => e.kind === "coercion");
    expect(coercionLogs.at(-1)?.text).toBe("He got what he wanted. He does not need to ask again.");
    expect(state.log.some((e) => e.text === "You hold. He does not get his answer.")).toBe(false);
  });

  it("a surrendered secret restores willpower and applies its state", () => {
    const state = started();
    state.player.willpower = 2;
    stage(state, { playerHand: ["stallHim"], convictHand: ["whereIsIt"] });
    playerLead(state, "stallHim");
    playerAnswer(state, null);
    expect(state.phase).toBe("forcedSurrender");
    playerSurrender(state, "secretFreezer");
    expect(state.player.willpower).toBe(3);
    expect(state.convict.distracted).toBe(2);
    expect(state.scene.range).toBe("away");
    expect(state.secretsRemaining).toEqual(["secretSafe", "secretFloorboard"]);
    expect(state.stats.secretsGiven).toEqual([{ cardId: "secretFreezer", coerced: true }]);
    expect(state.phase).toBe("playerLead");
  });

  it("a secret played voluntarily negates the lead", () => {
    const state = started();
    stage(state, { playerHand: ["stallHim"], convictHand: ["buttOfTheKnife"] });
    playerLead(state, "stallHim");
    const vigorBefore = state.player.vigor;
    playerAnswer(state, "secretFreezer");
    expect(state.player.vigor).toBe(vigorBefore);
    expect(state.stats.secretsGiven).toEqual([{ cardId: "secretFreezer", coerced: false }]);
  });

  it("giving up the third secret loses the run", () => {
    const state = started();
    state.secretsRemaining = ["secretFloorboard"];
    stage(state, { playerHand: ["stallHim"], convictHand: ["backhand"] });
    playerLead(state, "stallHim");
    playerAnswer(state, "secretFloorboard");
    expect(state.phase).toBe("gameOver");
    expect(state.outcome).toBe("lossSecrets");
  });

  it("logs an ending line exactly once when the run is lost to secrets", () => {
    const state = started();
    state.secretsRemaining = ["secretFloorboard"];
    stage(state, { playerHand: ["stallHim"], convictHand: ["backhand"] });
    playerLead(state, "stallHim");
    playerAnswer(state, "secretFloorboard");
    expect(state.phase).toBe("gameOver");
    const endings = state.log.filter((e) => e.kind === "outcome");
    expect(endings).toHaveLength(1);
    expect(endings[0].text.length).toBeGreaterThan(0);
  });

  it("gives the same distraction whether a secret is surrendered under coercion or answered voluntarily", () => {
    const coerced = started();
    coerced.player.willpower = 2;
    stage(coerced, { playerHand: ["stallHim"], convictHand: ["whereIsIt"] });
    playerLead(coerced, "stallHim");
    playerAnswer(coerced, null);
    expect(coerced.phase).toBe("forcedSurrender");
    playerSurrender(coerced, "secretFreezer");

    const voluntary = started();
    stage(voluntary, { playerHand: ["stallHim"], convictHand: ["backhand"] });
    playerLead(voluntary, "stallHim");
    playerAnswer(voluntary, "secretFreezer");

    expect(coerced.convict.distracted).toBe(2);
    expect(voluntary.convict.distracted).toBe(2);
  });
});

describe("toppled interrupt", () => {
  it("costs him his turn and leaves him near and off-balance", () => {
    const state = started(1, "comply");
    expect(state.scene.range).toBe("away");
    stage(state, { playerHand: ["rockTheChair"], convictHand: ["ransackTheRoom"] });
    playerLead(state, "rockTheChair");
    expect(state.player.toppled).toBe(false);
    expect(state.scene.range).toBe("near");
    expect(state.convict.offBalance).toBe(true);
    expect(state.phase).toBe("playerLead");
    expect(state.log.some((e) => e.kind === "haulUp")).toBe(true);
  });
});

describe("distraction ticking", () => {
  it("ticks down once at the end of the convict's turn", () => {
    const state = started();
    stage(state, { playerHand: ["lieAboutTheMoney"], convictHand: [] });
    playerLead(state, "lieAboutTheMoney");
    expect(state.convict.distracted).toBe(1);
  });
});

describe("incapacitation and victory", () => {
  it("sets incapacitated at zero vigor and recovers on his turn", () => {
    const state = started();
    state.convict.vigor = 1;
    state.player.bound = false;
    state.convict.offBalance = true;
    stage(state, { playerHand: ["shoulderCharge"], convictHand: [] });
    playerLead(state, "shoulderCharge");
    expect(state.convict.incapacitated).toBe(true);
    expect(state.convict.vigor).toBe(2);
    expect(state.log.some((e) => e.kind === "recover")).toBe(true);
  });

  it("clears incapacitation once he is back to four vigor", () => {
    const state = started();
    state.convict.vigor = 0;
    state.convict.incapacitated = true;
    stage(state, { playerHand: ["stallHim"], convictHand: [] });
    playerLead(state, "stallHim");
    expect(state.convict.vigor).toBe(2);
    expect(state.convict.incapacitated).toBe(true);
    stage(state, { playerHand: ["stallHim"] });
    playerLead(state, "stallHim");
    expect(state.convict.vigor).toBe(4);
    expect(state.convict.incapacitated).toBe(false);
  });

  it("not yet answers the victory card once, then he has nothing", () => {
    const state = started();
    state.convict.vigor = 0;
    state.convict.incapacitated = true;
    stage(state, { playerHand: [], convictHand: [] });
    playerLead(state, "bindHisHands");
    expect(state.notYetSpent).toBe(true);
    expect(state.convict.vigor).toBe(3);
    expect(state.convict.incapacitated).toBe(false);
    expect(state.outcome).toBeNull();
    expect(state.stats.notYetForced).toBe(true);

    state.convict.vigor = 0;
    state.convict.incapacitated = true;
    state.phase = "playerLead";
    playerLead(state, "bindHisHands");
    expect(state.phase).toBe("gameOver");
    expect(state.outcome).toBe("victory");
  });
});

describe("defeat conditions", () => {
  it("loses when your vigor reaches zero", () => {
    const state = started();
    state.player.vigor = 1;
    stage(state, { playerHand: ["stallHim"], convictHand: ["buttOfTheKnife"] });
    playerLead(state, "stallHim");
    playerAnswer(state, null);
    expect(state.phase).toBe("gameOver");
    expect(state.outcome).toBe("lossVigor");
  });

  it("loses when her vigor reaches zero", () => {
    const state = started();
    state.wife.vigor = 1;
    state.coercionDefused = true;
    stage(state, { playerHand: ["stallHim"], convictHand: ["breakHerFingers"] });
    playerLead(state, "stallHim");
    playerAnswer(state, null);
    expect(state.phase).toBe("gameOver");
    expect(state.outcome).toBe("lossWife");
  });

  it("refuses further play once the run is over", () => {
    const state = started();
    state.phase = "gameOver";
    expect(() => playerLead(state, "stallHim")).toThrow(/over/);
  });
});

describe("discarding down", () => {
  it("stops for a discard when the hand goes over the cap", () => {
    const state = started();
    state.playerPile.hand = ["stoic", "flinch", "flinch", "stoic", "talkHimDown"];
    state.playerPile.deck = ["stallHim"];
    state.playerPile.discard = [];
    state.convictPile.hand = [];
    state.convictPile.deck = [];
    state.convictPile.discard = [];
    playerPass(state);
    expect(state.phase).toBe("discardDown");
    expect(state.playerPile.hand.length).toBeGreaterThan(HAND_CAP);
  });

  it("returns to the lead phase once the hand is back at the cap", () => {
    const state = started();
    state.phase = "discardDown";
    state.playerPile.hand = ["stoic", "flinch", "flinch", "stoic", "talkHimDown", "stallHim"];
    playerDiscard(state, "stoic");
    expect(state.playerPile.hand).toHaveLength(HAND_CAP);
    expect(state.playerPile.discard).toContain("stoic");
    expect(state.phase).toBe("playerLead");
  });

  it("stays in the discard phase while still over the cap", () => {
    const state = started();
    state.phase = "discardDown";
    state.playerPile.hand = ["stoic", "flinch", "flinch", "stoic", "talkHimDown", "stallHim", "wiggleOut"];
    playerDiscard(state, "stoic");
    expect(state.phase).toBe("discardDown");
    playerDiscard(state, "flinch");
    expect(state.phase).toBe("playerLead");
  });

  it("refuses a discard outside the discard phase", () => {
    const state = started();
    expect(() => playerDiscard(state, state.playerPile.hand[0])).toThrow(/not discarding/);
  });

  it("refuses to discard a card that is not in hand", () => {
    const state = started();
    state.phase = "discardDown";
    expect(() => playerDiscard(state, "lampCord")).toThrow(/not in hand/);
  });

  it("lists every held card as discardable", () => {
    const state = started();
    state.playerPile.hand = ["stoic", "stallHim"];
    expect(legalPlayerDiscards(state)).toEqual(["stoic", "stallHim"]);
  });

  it("has the convict discard without pausing the game", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.playerPile.deck = [];
    state.playerPile.discard = [];
    state.convictPile.hand = ["brace", "expertKnots", "brace", "heardThatBefore", "expertKnots"];
    state.convictPile.deck = ["backhand"];
    state.convictPile.discard = [];
    playerLead(state, "stallHim");
    expect(state.convictPile.hand.length).toBeLessThanOrEqual(HAND_CAP);
    expect(state.phase).not.toBe("discardDown");
  });
});

describe("legal option listings", () => {
  it("lists hand cards plus fixtures for leads", () => {
    const state = started();
    stage(state, { playerHand: ["stallHim"] });
    const ids = legalPlayerLeads(state).map((o) => o.cardId);
    expect(ids).toContain("stallHim");
    expect(ids).toContain("bindHisHands");
    expect(ids).not.toContain("secretFreezer");
  });

  it("lists defensive hand cards plus remaining secrets for answers", () => {
    const state = started();
    stage(state, { playerHand: ["stoic", "stallHim"], convictHand: ["backhand"] });
    playerLead(state, "stallHim");
    const options = legalPlayerAnswers(state);
    const ids = options.map((o) => o.cardId);
    expect(ids).toContain("stoic");
    expect(ids).toContain("secretFreezer");
    expect(ids).not.toContain("stallHim");
  });
});
