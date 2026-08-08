import { describe, it, expect } from "vitest";
import { POLICY_COVERAGE, chooseAction, aiTakeTurn } from "../src/ai";
import {
  chooseBuild, chooseRules, newGame, pickFaction, startGame,
  type GameState,
} from "../src/game";
import { CARDS, type Strategy } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";
import { seededRng } from "../src/rng";

// Six factions on a complete graph (newGame's default adjacency): everything
// is in everything's reach, so the tests are about the POLICY, not distance.
// The human sits on zeta; the actor is alpha at index 1 throughout.
const FACTIONS = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

function base(): GameState {
  const g = pickFaction(
    chooseBuild(startGame(newGame(FACTIONS)), "warpath"), "zeta", seededRng(1),
  );
  return { ...g, current: 1 };
}

function withHand(g: GameState, hand: string[]): GameState {
  const p = { ...g.players[1], hand };
  return { ...g, players: g.players.map((pl, i) => (i === 1 ? p : pl)) };
}

/** pickFaction rolls each AI seat's build, seeded; a test about one branch
 *  stamps the branch it means to exercise. */
function asStrategy(g: GameState, strategy: Strategy): GameState {
  return {
    ...g,
    players: g.players.map((pl, i) => (i === 1 ? { ...pl, strategy } : pl)),
  };
}

function withLeadership(g: GameState, lead: Record<string, number>): GameState {
  const rulers = { ...g.rulers };
  for (const [f, n] of Object.entries(lead)) {
    rulers[f] = { ...rulers[f], leadership: n };
  }
  return { ...g, rulers };
}

describe("POLICY_COVERAGE", () => {
  it("names a policy branch for every card in the game", () => {
    expect(Object.keys(POLICY_COVERAGE).sort()).toEqual(Object.keys(CARDS).sort());
  });

  it("names a non-empty branch for each", () => {
    for (const [id, step] of Object.entries(POLICY_COVERAGE)) {
      expect(step, id).not.toBe("");
    }
  });
});

describe("the spine, steps 1..5", () => {
  it("1: plays the forced tribute before anything else", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["raid", "pay-military-tribute"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("2: subjugates through an open gate, above every voluntary play", () => {
    let g = base();
    g = { ...g, defense: { beta: 150 } }; // exactly the 25% line of 600
    g = withHand(g, ["raid", "subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("2: among several open gates, takes the biggest full realm", () => {
    // gamma holds delta, so taking gamma takes the pyramid: 2 lands beat
    // beta's 1 even though beta sorts first.
    let g = base();
    g = { ...g, overlords: new Map([["delta", "gamma"]]) };
    g = { ...g, defense: { beta: 100, gamma: 120 } };
    g = withHand(g, ["subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("2: honours the respite - and never raids an already-open gate instead", () => {
    // beta's gate is open but its escape respite runs: Subjugate has no legal
    // target, and the build raid must not batter the open gate further - the
    // gateCandidates filter sends it at a CLOSED gate (gamma, by tie order).
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 100 }, respites: { beta: 5 }, turn: 2 };
    g = withHand(g, ["subjugate", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("3: incorporates the vassal that nets the most permanent land", () => {
    // beta is a plain vassal (net 1); gamma is a mid-lord whose digestion
    // frees delta (net 0). The realm counts 4 with both pyramids, so the
    // gate is open and the scoring is what decides.
    let g = base();
    g = {
      ...g,
      overlords: new Map([["beta", "alpha"], ["gamma", "alpha"], ["delta", "gamma"]]),
    };
    g = withHand(g, ["incorporate", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("3: refuses a digest whose freed subtree cancels the land kept", () => {
    // Only vassal gamma is a mid-lord holding delta: kept 1, freed 1, net 0 -
    // never picked, so the turn grows a turnip. The annexed epsilon only
    // holds the realm gate open.
    let g = base();
    g = {
      ...g,
      overlords: new Map([["gamma", "alpha"], ["delta", "gamma"]]),
      incorporated: { epsilon: "alpha" },
    };
    g = withHand(g, ["incorporate", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("4: assassinates the highest leadership in reach", () => {
    let g = withLeadership(base(), { beta: 100, gamma: 50 });
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("4: skips a guarded ruler - the trade would leave the leadership standing", () => {
    let g = withLeadership(base(), { beta: 100, gamma: 50 });
    g = { ...g, guards: { bodyguard: ["beta"] } };
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("4: holds the card below one council's worth of leadership", () => {
    let g = withLeadership(base(), { beta: 49 });
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("5: a vassal heals its home toward the independence gate", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = { ...g, defense: { alpha: 300 } }; // one Hillfort short of 450
    expect(chooseAction(withHand(g, ["hillfort", "grow-crops"]))).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
    expect(chooseAction(withHand(g, ["harvest-feast", "grow-crops"]))).toEqual({
      type: "play", cardIndex: 0,
    });
  });

  it("5: stops healing once the home stands at the gate - beginTurn frees it", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = { ...g, defense: { alpha: 450 } }; // ceil(0.75 * 600): gate open
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("5: while free, repairs a realm polygon under half strength", () => {
    let g = base();
    g = { ...g, defense: { alpha: 250 } };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("5: leaves a scratch above half strength for the harvest loop", () => {
    let g = base();
    g = { ...g, defense: { alpha: 350 } };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });
});

describe("6W: warpath decisive moves", () => {
  it("6W-1: raids its own vassal one heal from the independence gate", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, defense: { beta: 320 } }; // 320 + 150 >= 450
    g = withHand(g, ["raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("6W-2: finishes a gate one raid can open - above the council", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 300 } }; // gap 150 <= raid damage 150
    g = withHand(g, ["war-council", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("6W-3: fans a great raid when it would open two or more border gates", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 200, gamma: 200 } }; // gaps 50 <= fan 75
    g = withHand(g, ["great-raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
    // One gate is not worth the fan: the turn feeds the harvest loop instead.
    const one = withHand(
      { ...g, defense: { beta: 200 } }, ["great-raid", "grow-crops"],
    );
    expect(chooseAction(one)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6W-4: reads the omens when only the doubled raid opens a gate", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 400 } }; // gap 250: >150, <=300
    g = withHand(g, ["favourable-omens", "raid"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6W-4: never delays a finishing raid to stack a reading", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 300 } };
    g = withHand(g, ["favourable-omens", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });
});

describe("6P: pestilence decisive moves", () => {
  it("6P-1: plagues its restive vassal's stacks before any outward play", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, defense: { beta: 320 }, disease: { beta: { alpha: 1 } } };
    g = withHand(g, ["plague", "spread-disease"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6P-1: sickens the restive vassal when no stacks sit there yet", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, defense: { beta: 320 } };
    g = withHand(g, ["spread-disease", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("6P-2: cashes the plague when it opens a gate", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, defense: { beta: 250 }, disease: { beta: { alpha: 1 } } };
    g = withHand(g, ["plague", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6P-2: cashes when the total damage beats a raid, else waits", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, disease: { beta: { alpha: 2 } } }; // 200 > 150
    g = withHand(g, ["plague", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
    const thin = { ...g, disease: { beta: { alpha: 1 } } }; // 100 <= 150
    expect(chooseAction(withHand(thin, ["plague", "grow-crops"])))
      .toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-2: a rival's stacks feed nothing - ownership is per faction", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, disease: { beta: { gamma: 5 } } };
    g = withHand(g, ["plague", "grow-crops"]);
    // No own stacks anywhere: the card is not even legal (no-disease).
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-3: claims the board with foul winds while rivals hold more stacks", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, disease: { beta: { gamma: 2 }, gamma: { alpha: 1 } } };
    g = withHand(g, ["foul-winds", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
    const ahead = { ...g, disease: { beta: { alpha: 2 }, gamma: { delta: 1 } } };
    expect(chooseAction(withHand(ahead, ["foul-winds", "grow-crops"])))
      .toEqual({ type: "play", cardIndex: 1 });
  });

  it("6P-4: reads the miasma when only the doubled plague opens a gate", () => {
    let g = asStrategy(base(), "pestilence");
    // gap 150: one stack cashes 100 (no), doubled 200 (yes).
    g = { ...g, defense: { beta: 300 }, disease: { beta: { alpha: 1 } } };
    g = withHand(g, ["miasma", "plague"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6P-5: seeds the junction with the most non-own neighbours", () => {
    // A little map with a real junction: beta touches two third parties,
    // gamma only one, so the outbreak goes to beta.
    const ADJ = {
      alpha: ["beta", "gamma"],
      beta: ["alpha", "delta", "epsilon"],
      gamma: ["alpha", "zeta"],
      delta: ["beta"],
      epsilon: ["beta"],
      zeta: ["gamma"],
    };
    let g = pickFaction(
      chooseBuild(startGame(newGame(FACTIONS, ADJ)), "warpath"),
      "zeta", seededRng(1),
    );
    g = asStrategy({ ...g, current: 1 }, "pestilence");
    g = withHand(g, ["localized-outbreak", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
    // On a line, no target splashes 2+ non-own neighbours: hold the card.
    const LINE = {
      alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta", "delta"],
      delta: ["gamma", "epsilon"], epsilon: ["delta", "zeta"],
      zeta: ["epsilon"],
    };
    let flat = pickFaction(
      chooseBuild(startGame(newGame(FACTIONS, LINE)), "warpath"),
      "zeta", seededRng(1),
    );
    flat = asStrategy({ ...flat, current: 1 }, "pestilence");
    flat = withHand(flat, ["localized-outbreak", "grow-crops"]);
    expect(chooseAction(flat)).toEqual({ type: "play", cardIndex: 1 });
  });
});

describe("steps 7..10: guard, settle, harvest, turnips", () => {
  it("7: posts the bodyguard while own leadership is the board's highest", () => {
    let g = withLeadership(base(), { alpha: 50 });
    g = withHand(g, ["bodyguard", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("7: a tie is not highest, and unproven is nothing to guard", () => {
    let tied = withLeadership(base(), { alpha: 50, gamma: 50 });
    tied = withHand(tied, ["bodyguard", "grow-crops"]);
    expect(chooseAction(tied)).toEqual({ type: "play", cardIndex: 1 });
    const unproven = withHand(base(), ["bodyguard", "grow-crops"]);
    expect(chooseAction(unproven)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("8: settles a spare turn, preferring its own land", () => {
    let g = base();
    g = { ...g, wealth: { alpha: 1 } };
    g = withHand(g, ["found-settlement", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("8: settles an annexed land before a vassal's, which can walk off", () => {
    let g = base();
    g = {
      ...g,
      wealth: { alpha: 1 },
      overlords: new Map([["beta", "alpha"]]),
      incorporated: { gamma: "alpha" },
      settlements: { alpha: 1 },
      siteCaps: Object.fromEntries(FACTIONS.map((f) => [f, 1])),
    };
    g = withHand(g, ["found-settlement", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("9: cashes a held harvest above growing turnips", () => {
    const g = withHand(base(), ["grow-crops", "turnip-harvest"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("10: grows turnips above the build raid - the loop must keep turning", () => {
    // A quiet board: no gate within one raid, nothing restive. The old
    // policy raided here every turn and starved the harvest loop to zero
    // subjugations over 150 turns; the turnip now outranks the build move.
    let g = asStrategy(base(), "warpath");
    g = withHand(g, ["raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("10: grows turnips above the build spread, same reason", () => {
    let g = asStrategy(base(), "pestilence");
    g = withHand(g, ["spread-disease", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });
});

describe("step 11: build moves", () => {
  it("11W-1: councils while no gate is within two attacks", () => {
    let g = asStrategy(base(), "warpath");
    g = withHand(g, ["war-council", "raid"]); // every gap is 450 > 300
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("11W-2: raids the polygon nearest its gate once one is within reach", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { gamma: 400 } }; // gap 250 <= 2 attacks
    g = withHand(g, ["war-council", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("11W-2: the build raid skips open gates - those want Subjugate", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 100, gamma: 400 } };
    g = withHand(g, ["raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("11P: spreads disease on the polygon nearest its closed gate", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, defense: { beta: 400, gamma: 200 } };
    g = withHand(g, ["spread-disease"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });
});

describe("fallthrough and dead hands", () => {
  it("12: plays the first playable card with its first legal target", () => {
    // A damaged-but-healthy home: step 5 refuses (above half), the branches
    // hold nothing else, so the hillfort lands as the last resort.
    let g = base();
    g = { ...g, defense: { alpha: 500 } };
    g = withHand(g, ["hillfort"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("discards leftmost when nothing is playable", () => {
    const g = withHand(base(), ["subjugate", "incorporate"]);
    expect(chooseAction(g)).toEqual({ type: "discard", cardIndex: 0 });
  });
});

function unlimitedAiPlaying(): GameState {
  const g = chooseRules(startGame(newGame(FACTIONS)), {
    ...DEFAULT_RULES,
    turn: "unlimited",
  });
  return pickFaction(chooseBuild(g, "warpath"), "zeta", seededRng(1));
}

describe("aiTakeTurn under unlimited rules", () => {
  it("plays multiple cards, then ends the turn without discarding", () => {
    let g = unlimitedAiPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0
          ? { ...pl, hand: ["grow-crops", "grow-crops", "pay-military-tribute"] }
          : pl,
      ),
    };
    const before = g.log.length;
    const after = aiTakeTurn(g, seededRng(1));
    expect(after.playedThisTurn).toBe(true);
    const fresh = after.log.slice(before);
    expect(fresh.filter((e) => e.type === "play")).toHaveLength(2);
    expect(fresh.some((e) => e.type === "discard")).toBe(false);
  });

  it("a dead hand ends the turn with no discard and the hand intact", () => {
    let g = unlimitedAiPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0 ? { ...pl, hand: ["pay-military-tribute"] } : pl,
      ),
    };
    const after = aiTakeTurn(g, seededRng(1));
    expect(after.playedThisTurn).toBe(true);
    expect(after.players[0].hand).toEqual(["pay-military-tribute"]);
  });
});
