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
    g = { ...g, defense: { beta: 15 } }; // exactly the 25% line of 60
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
    g = { ...g, defense: { beta: 10, gamma: 12 } };
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
    g = { ...g, defense: { beta: 10 }, respites: { beta: 5 }, turn: 2 };
    g = withHand(g, ["subjugate", "raid"]);
    // alpha is the realm's only land, so the arrow's tail can only be alpha.
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma", sourceId: "alpha",
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
    let g = withLeadership(base(), { beta: 4 });
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("5: a vassal heals its home toward the independence gate", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = { ...g, defense: { alpha: 30 } }; // one Hillfort short of 45
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
    g = { ...g, defense: { alpha: 45 } }; // ceil(0.75 * 60): gate open
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("5: while free, repairs a realm polygon under half strength", () => {
    let g = base();
    g = { ...g, defense: { alpha: 25 } };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("5: leaves a scratch above half strength for the harvest loop", () => {
    let g = base();
    g = { ...g, defense: { alpha: 35 } };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });
});

describe("5A: answering a march", () => {
  /** One march aimed at `at`, out of `from`, by whoever holds `from`. */
  const incoming = (from: string, at: string, damage: number) => ({
    [`${from}>${at}#0`]: {
      actor: from, from, to: at, cardId: "raid", damage,
      holdsArmy: true, expiry: 3,
    },
  });

  it("5A: counters a march it out-muscles, out of the land under threat", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, marches: incoming("beta", "alpha", 1), turn: 2 };
    g = withHand(g, ["raid", "grow-crops"]);
    // The counter aims BACK at the source, and must march out of the land the
    // arrow is pointed at - anywhere else is a fresh attack on another axis.
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta", sourceId: "alpha",
    });
  });

  it("5A: counters a march it cannot win when the hit would open its gate", () => {
    let g = asStrategy(base(), "warpath");
    // alpha sits 2 above its gate and 6 damage is coming: our raid deals 1,
    // which loses the clash outright but keeps the gate shut.
    g = {
      ...g, defense: { alpha: 17 },
      marches: incoming("beta", "alpha", 6), turn: 2,
    };
    g = withHand(g, ["raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta", sourceId: "alpha",
    });
  });

  it("5A: lets a march it neither survives nor loses to go by", () => {
    let g = asStrategy(base(), "warpath");
    // 6 incoming against a land 40 above its gate, and our raid deals 1:
    // trading the army buys nothing the turn cannot buy elsewhere.
    g = {
      ...g, defense: { alpha: 55 },
      marches: incoming("beta", "alpha", 6), turn: 2,
    };
    g = withHand(g, ["raid", "grow-crops"]);
    expect(chooseAction(g)).not.toMatchObject({ targetId: "beta" });
  });

  it("5A: ignores a march already answered by a counter of our own", () => {
    let g = asStrategy(base(), "warpath");
    g = {
      ...g, turn: 2,
      marches: {
        ...incoming("beta", "alpha", 4),
        "alpha>beta#0": {
          actor: "alpha", from: "alpha", to: "beta", cardId: "raid",
          damage: 4, holdsArmy: true, expiry: 3,
        },
      },
    };
    g = withHand(g, ["raid", "grow-crops"]);
    // The axis already nets to nothing, and alpha's army is out anyway.
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("5A: heals against the braced score, not the standing one", () => {
    let g = asStrategy(base(), "warpath");
    // alpha stands at 35 - above half of 60, so untouched it is a scratch the
    // policy leaves alone - but 10 is in the air, which puts it under.
    g = {
      ...g, defense: { alpha: 35 },
      marches: incoming("beta", "alpha", 10), turn: 2,
    };
    g = withHand(g, ["hillfort", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });
});

describe("12: garrison", () => {
  it("raises an army on the frontier land that has none left to send", () => {
    let g = asStrategy(base(), "warpath");
    g = {
      ...g, turn: 2,
      marches: {
        "alpha>beta#0": {
          actor: "alpha", from: "alpha", to: "beta", cardId: "raid",
          damage: 1, holdsArmy: true, expiry: 3,
        },
      },
    };
    g = withHand(g, ["create-army"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("holds the card while the frontier still has an army free", () => {
    let g = asStrategy(base(), "warpath");
    g = withHand(g, ["create-army", "grow-crops"]);
    // alpha's army is home, so the turn feeds the harvest loop instead.
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("decides the card for a pestilence seat too - it is a neutral", () => {
    let g = asStrategy(base(), "pestilence");
    g = {
      ...g, turn: 2,
      marches: {
        "alpha>beta#0": {
          actor: "alpha", from: "alpha", to: "beta", cardId: "raid",
          damage: 1, holdsArmy: true, expiry: 3,
        },
      },
    };
    g = withHand(g, ["create-army"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });
});

describe("6W: warpath decisive moves", () => {
  it("6W-1: raids its own vassal one heal from the independence gate", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, defense: { beta: 32 } }; // 32 + 15 >= 45
    g = withHand(g, ["raid", "grow-crops"]);
    // Out of alpha, not out of the vassal itself: no land borders itself, so
    // holding a vassal down always takes an army from next door.
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta", sourceId: "alpha",
    });
  });

  it("6W-2: finishes a gate one raid can open - above the council", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 16 } }; // gap 1 <= raid damage 1
    g = withHand(g, ["war-council", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta", sourceId: "alpha",
    });
  });

  it("6W-3: fans a great raid when it would open two or more border gates", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 15.4, gamma: 15.4 } }; // gaps 0.4 <= fan 0.5
    g = withHand(g, ["great-raid", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
    // One gate is not worth the fan: the turn feeds the harvest loop instead.
    const one = withHand(
      { ...g, defense: { beta: 15.4 } }, ["great-raid", "grow-crops"],
    );
    expect(chooseAction(one)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("6W-4: reads the omens when only the doubled raid opens a gate", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 16.5 } }; // gap 1.5: >1, <=2
    g = withHand(g, ["favourable-omens", "raid"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6W-4: never delays a finishing raid to stack a reading", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 16 } };
    g = withHand(g, ["favourable-omens", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta", sourceId: "alpha",
    });
  });
});

describe("6P: pestilence decisive moves", () => {
  it("6P-1: plagues its restive vassal's stacks before any outward play", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, defense: { beta: 32 }, disease: { beta: { alpha: 1 } } };
    g = withHand(g, ["plague", "spread-disease"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6P-1: sickens the restive vassal when no stacks sit there yet", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, defense: { beta: 32 } };
    g = withHand(g, ["spread-disease", "grow-crops"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "beta",
    });
  });

  it("6P-2: cashes the plague when it opens a gate", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, defense: { beta: 25 }, disease: { beta: { alpha: 1 } } };
    g = withHand(g, ["plague", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("6P-2: cashes when the total damage beats a raid, else waits", () => {
    // "A raid's worth" moves with leadership, so the waits-arm needs a
    // council-stacked ruler: at leadership 20 a raid is worth 21, and two
    // stacks (20) sit under it while three (30) beat it.
    let g = asStrategy(base(), "pestilence");
    g = {
      ...g,
      rulers: { ...g.rulers, alpha: { ...g.rulers.alpha, leadership: 20 } },
    };
    const fat = { ...g, disease: { beta: { alpha: 3 } } }; // 30 > 21
    expect(chooseAction(withHand(fat, ["plague", "grow-crops"])))
      .toEqual({ type: "play", cardIndex: 0 });
    const thin = { ...g, disease: { beta: { alpha: 2 } } }; // 20 <= 21
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
    // gap 15: one stack cashes 10 (no), doubled 20 (yes). Leadership keeps
    // a raid's worth above the plain 10, or the total-beats-a-raid arm of
    // 6P-2 would cash the stack before this step is reached.
    g = {
      ...g,
      rulers: { ...g.rulers, alpha: { ...g.rulers.alpha, leadership: 100 } },
    };
    g = { ...g, defense: { beta: 30 }, disease: { beta: { alpha: 1 } } };
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
    g = withHand(g, ["war-council", "raid"]); // every gap is 45 > 2 attacks
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("11W-2: raids the polygon nearest its gate once one is within reach", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { gamma: 16.5 } }; // gap 1.5 <= 2 attacks (2)
    g = withHand(g, ["war-council", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma", sourceId: "alpha",
    });
  });

  it("11W-2: the build raid skips open gates - those want Subjugate", () => {
    let g = asStrategy(base(), "warpath");
    g = { ...g, defense: { beta: 10, gamma: 40 } };
    g = withHand(g, ["raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma", sourceId: "alpha",
    });
  });

  it("11P: spreads disease on the polygon nearest its closed gate", () => {
    let g = asStrategy(base(), "pestilence");
    g = { ...g, defense: { beta: 40, gamma: 20 } };
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
    g = { ...g, defense: { alpha: 50 } };
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
