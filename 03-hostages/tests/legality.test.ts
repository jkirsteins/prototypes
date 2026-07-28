import { describe, it, expect } from "vitest";
import { canLead, canAnswer, leadDamageTo } from "../src/legality";
import { cardById } from "../src/content/cards";
import type { GameState } from "../src/types";

function baseState(): GameState {
  return {
    phase: "playerLead",
    turn: 1,
    player: { willpower: 6, vigor: 6, bound: true, toppled: false },
    wife: { vigor: 4, bond: 3 },
    convict: {
      willpower: 6,
      vigor: 8,
      distracted: 0,
      offBalance: false,
      weaponDown: false,
      incapacitated: false,
    },
    scene: { zone: "livingRoom", range: "near" },
    playerPile: { deck: [], discard: [], hand: [] },
    convictPile: { deck: [], discard: [], hand: [] },
    secretsRemaining: ["secretFreezer", "secretSafe", "secretFloorboard"],
    notYetSpent: false,
    coercionDefused: false,
    pendingLead: null,
    log: [],
    outcome: null,
    stats: {
      wifeLowestVigor: 4,
      secretsGiven: [],
      largestWillpowerSwing: null,
      notYetForced: false,
    },
    rng: { seed: 1 },
  };
}

describe("canLead", () => {
  it("rejects defensive cards as leads", () => {
    const result = canLead(baseState(), "player", cardById("stoic"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot be led/i);
  });

  it("allows an always-legal offensive card", () => {
    expect(canLead(baseState(), "player", cardById("stallHim")).ok).toBe(true);
  });

  it("blocks physical cards while bound", () => {
    const result = canLead(baseState(), "player", cardById("kickHisKnee"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs: you are not bound");
  });

  it("allows headbutt while bound if he is near and distracted", () => {
    const state = baseState();
    state.convict.distracted = 1;
    expect(canLead(state, "player", cardById("headbutt")).ok).toBe(true);
  });

  it("allows headbutt while bound if he is near and off-balance", () => {
    const state = baseState();
    state.convict.offBalance = true;
    expect(canLead(state, "player", cardById("headbutt")).ok).toBe(true);
  });

  it("blocks headbutt when he is neither distracted nor off-balance", () => {
    const result = canLead(baseState(), "player", cardById("headbutt"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs: he is distracted or off-balance");
  });

  it("blocks cards needing him near when he is away", () => {
    const state = baseState();
    state.player.bound = false;
    state.scene.range = "away";
    const result = canLead(state, "player", cardById("kickHisKnee"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs: he is near");
  });

  it("gates lamp cord on the bedroom", () => {
    const state = baseState();
    state.player.bound = false;
    const result = canLead(state, "player", cardById("lampCord"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs: you are in the bedroom");
  });

  it("gates grab for the knife on distracted or off-balance", () => {
    const state = baseState();
    state.player.bound = false;
    const blocked = canLead(state, "player", cardById("grabForTheKnife"));
    expect(blocked.ok).toBe(false);
    state.convict.offBalance = true;
    expect(canLead(state, "player", cardById("grabForTheKnife")).ok).toBe(true);
  });

  it("gates the victory card on incapacitation", () => {
    const state = baseState();
    expect(canLead(state, "player", cardById("bindHisHands")).ok).toBe(false);
    state.convict.incapacitated = true;
    expect(canLead(state, "player", cardById("bindHisHands")).ok).toBe(true);
  });

  it("gates break her fingers on a defused coercion", () => {
    const state = baseState();
    expect(canLead(state, "convict", cardById("breakHerFingers")).ok).toBe(false);
    state.coercionDefused = true;
    expect(canLead(state, "convict", cardById("breakHerFingers")).ok).toBe(true);
  });

  it("gates snatch it back on a downed weapon", () => {
    const state = baseState();
    expect(canLead(state, "convict", cardById("snatchItBack")).ok).toBe(false);
    state.convict.weaponDown = true;
    expect(canLead(state, "convict", cardById("snatchItBack")).ok).toBe(true);
  });

  it("rejects cards belonging to the other side", () => {
    expect(canLead(baseState(), "player", cardById("backhand")).ok).toBe(false);
  });
});

describe("canAnswer", () => {
  it("rejects offensive cards as answers", () => {
    const result = canAnswer(baseState(), "player", cardById("headbutt"), cardById("backhand"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot answer/i);
  });

  it("lets stoic answer anything", () => {
    expect(canAnswer(baseState(), "player", cardById("stoic"), cardById("whereIsIt")).ok).toBe(
      true,
    );
  });

  it("lets secrets answer anything", () => {
    expect(
      canAnswer(baseState(), "player", cardById("secretFreezer"), cardById("backhand")).ok,
    ).toBe(true);
  });

  it("restricts talk him down to coercion cards", () => {
    expect(
      canAnswer(baseState(), "player", cardById("talkHimDown"), cardById("whereIsIt")).ok,
    ).toBe(true);
    const result = canAnswer(baseState(), "player", cardById("talkHimDown"), cardById("backhand"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs: he is making a demand");
  });

  it("restricts take it for her to cards that threaten her", () => {
    expect(
      canAnswer(baseState(), "player", cardById("takeItForHer"), cardById("knifeToHerThroat")).ok,
    ).toBe(true);
    expect(
      canAnswer(baseState(), "player", cardById("takeItForHer"), cardById("whereIsIt")).ok,
    ).toBe(false);
  });

  it("restricts flinch to cards that damage you", () => {
    expect(canAnswer(baseState(), "player", cardById("flinch"), cardById("backhand")).ok).toBe(
      true,
    );
    expect(canAnswer(baseState(), "player", cardById("flinch"), cardById("whereIsIt")).ok).toBe(
      false,
    );
  });

  it("restricts expert knots to the wiggle card", () => {
    expect(
      canAnswer(baseState(), "convict", cardById("expertKnots"), cardById("wiggleOut")).ok,
    ).toBe(true);
    expect(
      canAnswer(baseState(), "convict", cardById("expertKnots"), cardById("headbutt")).ok,
    ).toBe(false);
  });

  it("forbids brace while he is distracted", () => {
    const state = baseState();
    expect(canAnswer(state, "convict", cardById("brace"), cardById("shoulderCharge")).ok).toBe(
      true,
    );
    state.convict.distracted = 2;
    const result = canAnswer(state, "convict", cardById("brace"), cardById("shoulderCharge"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs: he is not distracted");
  });

  it("forbids brace against a card that does no damage to him", () => {
    expect(canAnswer(baseState(), "convict", cardById("brace"), cardById("wiggleOut")).ok).toBe(
      false,
    );
  });

  it("restricts not yet to the victory card and to one use", () => {
    const state = baseState();
    expect(canAnswer(state, "convict", cardById("notYet"), cardById("bindHisHands")).ok).toBe(
      true,
    );
    state.notYetSpent = true;
    const result = canAnswer(state, "convict", cardById("notYet"), cardById("bindHisHands"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already used");
  });

  it("only offers remaining secrets", () => {
    const state = baseState();
    state.secretsRemaining = ["secretSafe", "secretFloorboard"];
    expect(
      canAnswer(state, "player", cardById("secretFreezer"), cardById("backhand")).ok,
    ).toBe(false);
  });
});

describe("leadDamageTo", () => {
  it("sums flat damage and ignores the off-balance bonus", () => {
    expect(leadDamageTo(cardById("shoulderCharge"), "convict")).toBe(2);
    expect(leadDamageTo(cardById("backhand"), "player")).toBe(1);
    expect(leadDamageTo(cardById("whereIsIt"), "player")).toBe(0);
  });
});
