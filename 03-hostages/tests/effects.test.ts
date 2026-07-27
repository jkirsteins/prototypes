import { describe, it, expect } from "vitest";
import { applyLeadEffect, applyAnswerEffect, newMods, bondMultiplier } from "../src/effects";
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
      turningPoint: null,
    },
    rng: { seed: 1 },
  };
}

describe("bondMultiplier", () => {
  it("scales with closeness", () => {
    expect(bondMultiplier(3)).toBe(2);
    expect(bondMultiplier(2)).toBe(1);
    expect(bondMultiplier(1)).toBe(1);
    expect(bondMultiplier(-1)).toBe(0);
  });
});

describe("applyLeadEffect", () => {
  it("damages the convict and clamps at zero, setting incapacitated", () => {
    const state = baseState();
    applyLeadEffect(state, { kind: "damage", target: "convict", amount: 12 }, newMods());
    expect(state.convict.vigor).toBe(0);
    expect(state.convict.incapacitated).toBe(true);
  });

  it("adds the off-balance bonus and consumes the state", () => {
    const state = baseState();
    state.convict.offBalance = true;
    applyLeadEffect(
      state,
      { kind: "damage", target: "convict", amount: 2, offBalanceBonus: 3 },
      newMods(),
    );
    expect(state.convict.vigor).toBe(3);
    expect(state.convict.offBalance).toBe(false);
  });

  it("skips the bonus when he is steady", () => {
    const state = baseState();
    applyLeadEffect(
      state,
      { kind: "damage", target: "convict", amount: 2, offBalanceBonus: 3 },
      newMods(),
    );
    expect(state.convict.vigor).toBe(6);
  });

  it("halves incoming damage rounded up", () => {
    const state = baseState();
    const mods = newMods();
    mods.damageFactor = 0.5;
    applyLeadEffect(state, { kind: "damage", target: "player", amount: 3 }, mods);
    expect(state.player.vigor).toBe(4);
  });

  it("charges the player willpower for harm to his wife", () => {
    const state = baseState();
    applyLeadEffect(state, { kind: "damage", target: "wife", amount: 2 }, newMods());
    expect(state.wife.vigor).toBe(2);
    expect(state.player.willpower).toBe(2);
    expect(state.stats.wifeLowestVigor).toBe(2);
  });

  it("redirects wife damage onto the player when interposed", () => {
    const state = baseState();
    const mods = newMods();
    mods.interposed = true;
    applyLeadEffect(state, { kind: "damage", target: "wife", amount: 2 }, mods);
    expect(state.wife.vigor).toBe(4);
    expect(state.player.willpower).toBe(6);
  });

  it("does nothing at all when the lead is negated", () => {
    const state = baseState();
    const mods = newMods();
    mods.negated = true;
    applyLeadEffect(state, { kind: "damage", target: "player", amount: 3 }, mods);
    expect(state.player.vigor).toBe(6);
  });

  it("floors willpower at zero and caps it at ten", () => {
    const state = baseState();
    applyLeadEffect(state, { kind: "willpower", target: "player", amount: -99 }, newMods());
    expect(state.player.willpower).toBe(0);
    applyLeadEffect(state, { kind: "willpower", target: "player", amount: 99 }, newMods());
    expect(state.player.willpower).toBe(10);
  });

  it("binds an unbound player and hurts a bound one", () => {
    const state = baseState();
    state.player.bound = false;
    applyLeadEffect(state, { kind: "bindOrHurt", amount: 1 }, newMods());
    expect(state.player.bound).toBe(true);
    expect(state.player.vigor).toBe(6);
    applyLeadEffect(state, { kind: "bindOrHurt", amount: 1 }, newMods());
    expect(state.player.vigor).toBe(5);
  });

  it("sets scene and state flags", () => {
    const state = baseState();
    applyLeadEffect(state, { kind: "setZone", value: "bedroom" }, newMods());
    applyLeadEffect(state, { kind: "setRange", value: "away" }, newMods());
    applyLeadEffect(state, { kind: "setDistracted", turns: 2 }, newMods());
    applyLeadEffect(state, { kind: "setWeaponDown", value: true }, newMods());
    expect(state.scene).toEqual({ zone: "bedroom", range: "away" });
    expect(state.convict.distracted).toBe(2);
    expect(state.convict.weaponDown).toBe(true);
  });

  it("keeps the longer distraction when stacking", () => {
    const state = baseState();
    applyLeadEffect(state, { kind: "setDistracted", turns: 2 }, newMods());
    applyLeadEffect(state, { kind: "setDistracted", turns: 1 }, newMods());
    expect(state.convict.distracted).toBe(2);
  });

  it("revives the convict", () => {
    const state = baseState();
    state.convict.vigor = 0;
    state.convict.incapacitated = true;
    applyLeadEffect(state, { kind: "reviveConvict", vigor: 3 }, newMods());
    expect(state.convict.vigor).toBe(3);
    expect(state.convict.incapacitated).toBe(false);
  });

  it("records the largest willpower swing", () => {
    const state = baseState();
    applyLeadEffect(state, { kind: "willpower", target: "player", amount: -2 }, newMods());
    applyLeadEffect(state, { kind: "willpower", target: "player", amount: -4 }, newMods());
    expect(state.stats.largestWillpowerSwing?.amount).toBe(4);
  });
});

describe("applyAnswerEffect", () => {
  it("sets negation without touching state", () => {
    const state = baseState();
    const mods = newMods();
    applyAnswerEffect(state, { kind: "negateLead" }, mods);
    expect(mods.negated).toBe(true);
  });

  it("sets the damage factor", () => {
    const mods = newMods();
    applyAnswerEffect(baseState(), { kind: "halveIncomingDamage" }, mods);
    expect(mods.damageFactor).toBe(0.5);
  });

  it("interposes and takes the hit", () => {
    const state = baseState();
    const mods = newMods();
    applyAnswerEffect(state, { kind: "interposeForWife", selfDamage: 2 }, mods);
    expect(mods.interposed).toBe(true);
    expect(state.player.vigor).toBe(4);
  });

  it("strips coercion", () => {
    const mods = newMods();
    applyAnswerEffect(baseState(), { kind: "stripCoercion" }, mods);
    expect(mods.coercionStripped).toBe(true);
  });

  it("flags a lost run", () => {
    const mods = newMods();
    applyAnswerEffect(baseState(), { kind: "loseRun" }, mods);
    expect(mods.runLost).toBe(true);
  });

  it("restores willpower to a fixed value", () => {
    const state = baseState();
    state.player.willpower = 0;
    applyAnswerEffect(state, { kind: "restoreWillpowerTo", target: "player", value: 3 }, newMods());
    expect(state.player.willpower).toBe(3);
  });

  it("applies answer effects even though the lead is negated", () => {
    const state = baseState();
    const mods = newMods();
    mods.negated = true;
    applyAnswerEffect(state, { kind: "willpower", target: "player", amount: 2 }, mods);
    expect(state.player.willpower).toBe(8);
  });
});
