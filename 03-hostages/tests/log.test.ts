import { describe, it, expect } from "vitest";
import { logCard, logNote, push } from "../src/log";
import type { GameState } from "../src/types";

function stateWithTurn(turn: number): GameState {
  return {
    phase: "playerLead",
    turn,
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
    secretsRemaining: [],
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

describe("log", () => {
  it("stamps the turn", () => {
    const state = stateWithTurn(4);
    push(state, { side: "player", kind: "pass", text: "You wait.", deltas: [] });
    expect(state.log[0].turn).toBe(4);
  });

  it("names the actor and the card and includes the narration", () => {
    const state = stateWithTurn(1);
    logCard(state, "player", "lead", "headbutt", ["His vigor -3"]);
    expect(state.log[0].text).toBe(
      "You play Headbutt. You snap your forehead into his face.",
    );
    expect(state.log[0].cardId).toBe("headbutt");
    expect(state.log[0].deltas).toEqual(["His vigor -3"]);
  });

  it("names the convict", () => {
    const state = stateWithTurn(1);
    logCard(state, "convict", "lead", "backhand", []);
    expect(state.log[0].text).toBe(
      "The Convict plays Backhand. He backhands you across the mouth.",
    );
  });

  it("records notes with an empty delta list by default", () => {
    const state = stateWithTurn(2);
    logNote(state, "system", "outcome", "He goes still.");
    expect(state.log[0]).toMatchObject({ side: "system", kind: "outcome", deltas: [] });
  });
});
