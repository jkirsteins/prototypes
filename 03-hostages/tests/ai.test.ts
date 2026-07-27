import { describe, it, expect } from "vitest";
import { chooseConvictAnswer, chooseConvictDiscard, chooseConvictLead } from "../src/ai";
import { cardById } from "../src/content/cards";
import { newRun, chooseOpening } from "../src/game";
import type { GameState } from "../src/types";

function state(): GameState {
  const s = newRun(11);
  chooseOpening(s, "shield");
  s.convictPile.hand = [];
  return s;
}

describe("chooseConvictLead", () => {
  it("returns null when nothing is legal", () => {
    const s = state();
    s.convictPile.hand = ["snatchItBack"];
    expect(chooseConvictLead(s)).toBeNull();
  });

  it("retrieves the knife first when it is down", () => {
    const s = state();
    s.convict.weaponDown = true;
    s.convictPile.hand = ["backhand", "snatchItBack"];
    expect(chooseConvictLead(s)).toBe("snatchItBack");
  });

  it("presses a demand when your willpower is low", () => {
    const s = state();
    s.player.willpower = 2;
    s.convictPile.hand = ["backhand", "whereIsIt", "knifeToHerThroat"];
    expect(chooseConvictLead(s)).toBe("knifeToHerThroat");
  });

  it("re-binds you the moment you are free", () => {
    const s = state();
    s.player.bound = false;
    s.player.willpower = 6;
    s.convictPile.hand = ["backhand", "tightenTheRopes"];
    expect(chooseConvictLead(s)).toBe("tightenTheRopes");
  });

  it("escalates to her only after you defused a demand and you can take it", () => {
    const s = state();
    s.player.willpower = 6;
    s.convictPile.hand = ["backhand", "breakHerFingers"];
    expect(chooseConvictLead(s)).toBe("backhand");
    s.coercionDefused = true;
    expect(chooseConvictLead(s)).toBe("breakHerFingers");
  });

  it("does not escalate to her when your willpower is already low", () => {
    const s = state();
    s.coercionDefused = true;
    s.player.willpower = 4;
    s.convictPile.hand = ["backhand", "breakHerFingers"];
    expect(chooseConvictLead(s)).not.toBe("breakHerFingers");
  });

  it("otherwise takes the hardest legal hit", () => {
    const s = state();
    s.player.willpower = 6;
    s.convictPile.hand = ["backhand", "buttOfTheKnife"];
    expect(chooseConvictLead(s)).toBe("buttOfTheKnife");
  });
});

describe("chooseConvictAnswer", () => {
  it("plays not yet against the victory card", () => {
    const s = state();
    s.convict.incapacitated = true;
    expect(chooseConvictAnswer(s, cardById("bindHisHands"))).toBe("notYet");
  });

  it("does not replay not yet", () => {
    const s = state();
    s.convict.incapacitated = true;
    s.notYetSpent = true;
    expect(chooseConvictAnswer(s, cardById("bindHisHands"))).toBeNull();
  });

  it("stops you unbinding when it holds the knots", () => {
    const s = state();
    s.convictPile.hand = ["expertKnots", "brace"];
    expect(chooseConvictAnswer(s, cardById("wiggleOut"))).toBe("expertKnots");
  });

  it("calls a bluff only when his willpower is under pressure", () => {
    const s = state();
    s.convictPile.hand = ["heardThatBefore"];
    s.convict.willpower = 6;
    expect(chooseConvictAnswer(s, cardById("stallHim"))).toBeNull();
    s.convict.willpower = 3;
    expect(chooseConvictAnswer(s, cardById("stallHim"))).toBe("heardThatBefore");
  });

  it("braces only against a real hit", () => {
    const s = state();
    s.convictPile.hand = ["brace"];
    expect(chooseConvictAnswer(s, cardById("kickHisKnee"))).toBeNull();
    expect(chooseConvictAnswer(s, cardById("headbutt"))).toBeNull();
    expect(chooseConvictAnswer(s, cardById("shoulderCharge"))).toBeNull();
    s.convict.offBalance = true;
    expect(chooseConvictAnswer(s, cardById("shoulderCharge"))).toBe("brace");
  });

  it("declines when it holds nothing useful", () => {
    const s = state();
    s.convictPile.hand = ["backhand"];
    expect(chooseConvictAnswer(s, cardById("stallHim"))).toBeNull();
  });
});

describe("chooseConvictDiscard", () => {
  it("throws away the first card he cannot lead", () => {
    const s = state();
    s.convictPile.hand = ["backhand", "brace", "snatchItBack"];
    expect(chooseConvictDiscard(s)).toBe("brace");
  });

  it("falls back to the first card when everything is legal", () => {
    const s = state();
    s.convictPile.hand = ["backhand", "whereIsIt"];
    expect(chooseConvictDiscard(s)).toBe("backhand");
  });

  it("does not mutate the hand", () => {
    const s = state();
    s.convictPile.hand = ["backhand", "brace"];
    chooseConvictDiscard(s);
    expect(s.convictPile.hand).toEqual(["backhand", "brace"]);
  });
});
