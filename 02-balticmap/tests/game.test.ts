import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, chooseRules, pickFaction, beginTurn,
  playCard, discardCard, endTurn, advance, surrender, viewOf,
  OPENING_HAND, HAND_REFILL, TURNIP_HARVEST_THRESHOLD, victoryRealmSize,
  type GameState,
} from "../src/game";
import { ARMIES_PER_POLYGON } from "../src/marches";
import { DEFAULT_RULES } from "../src/rules";
import { isTributeCard, startingDeck, type Rng } from "../src/cards";
import {
  DEFAULT_DEFENSE_MAX, INDEPENDENCE_GATE, SUBJUGATION_GATE,
  FORTIFY_HEAL_PER_OMEN, GREAT_RAID_DAMAGE, HARVEST_FEAST_HEAL, HILLFORT_HEAL,
  PLAGUE_DAMAGE_PER_STACK, RAID_DAMAGE, WAR_COUNCIL_LEADERSHIP,
} from "../src/defense";
import { ESCAPE_RESPITE_TURNS, validTargetsFor } from "../src/playability";
import { rulerOf } from "../src/rulers";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma", "delta"];
const LINE_ADJ = {
  alpha: ["beta"],
  beta: ["alpha", "gamma"],
  gamma: ["beta", "delta"],
  delta: ["gamma"],
};

/** The one gate arithmetic the fixtures lean on, spelled out once: a 600
 *  polygon opens to Subjugate at 150 and crosses back to freedom at 450. */
const SUBJUGATE_LINE = Math.floor(SUBJUGATION_GATE * DEFAULT_DEFENSE_MAX);
const INDEPENDENCE_LINE = Math.ceil(INDEPENDENCE_GATE * DEFAULT_DEFENSE_MAX);

function playingState(adj?: Record<string, string[]>): GameState {
  return pickFaction(
    chooseBuild(startGame(newGame(FACTIONS, adj)), "warpath"),
    "beta",
    seededRng(1),
  );
}

/** A playing state under unlimited turn rules, human seat current. */
function unlimitedPlaying(adj?: Record<string, string[]>): GameState {
  const g = chooseRules(startGame(newGame(FACTIONS, adj)), {
    ...DEFAULT_RULES,
    turn: "unlimited",
  });
  return pickFaction(chooseBuild(g, "warpath"), "beta", seededRng(1));
}

function withHand(g: GameState, playerIdx: number, hand: string[]): GameState {
  const p = { ...g.players[playerIdx], hand };
  return { ...g, players: g.players.map((pl, i) => (i === playerIdx ? p : pl)) };
}

function pilesOf(g: GameState, factionId: string): string[] {
  const p = g.players.find((pl) => pl.factionId === factionId)!;
  return [...p.deck, ...p.hand, ...p.discard];
}

/** The events one action appended: slice off everything logged before it. */
function fresh(g: GameState, before: number) {
  return g.log.slice(before);
}

const rng = () => seededRng(7);

/** Roll the clock forward to the CURRENT seat's next turn, without walking
 *  every other seat through theirs. That is exactly where a march lands - a
 *  march declared on turn T stores expiry T+1 and resolves in its actor's own
 *  `beginTurn` - so this is the fixture for "and then it landed". */
function landMarches(g: GameState): GameState {
  return beginTurn({ ...g, turn: g.turn + 1 }, rng());
}

// The four-faction world's victory size (3) sits BELOW the incorporate realm
// gate (4), so a fixture that opens the gate by growing the actor's realm can
// tip a test into victory by accident. Fixtures below either hang the spare
// factions under the TARGET - freed by the digest, so the realm falls back
// out of the win line - or move to a six-faction roster whose win size is 4.
const SIX = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

function playingSix(): GameState {
  return pickFaction(
    chooseBuild(startGame(newGame(SIX)), "warpath"), "beta", seededRng(1),
  );
}

it("victoryRealmSize anchors the fixtures: 3 of 4 lands, 4 of 6", () => {
  expect(victoryRealmSize(FACTIONS.length)).toBe(3);
  expect(victoryRealmSize(SIX.length)).toBe(4);
});

describe("setup", () => {
  it("newGame initializes defense-score state", () => {
    const g = newGame(FACTIONS);
    expect(g.phase).toBe("main-menu");
    expect(g.overlords.size).toBe(0);
    expect(g.adjacency.alpha.sort()).toEqual(["beta", "delta", "gamma"]);
    expect(g.defense).toEqual({});
    expect(g.defenseMax).toEqual({
      alpha: DEFAULT_DEFENSE_MAX, beta: DEFAULT_DEFENSE_MAX,
      gamma: DEFAULT_DEFENSE_MAX, delta: DEFAULT_DEFENSE_MAX,
    });
    expect(g.disease).toEqual({});
    expect(g.miasma).toEqual({});
    expect(g.turnips).toEqual({});
    expect(g.guards).toEqual({});
    expect(g.rules).toEqual(DEFAULT_RULES);
    expect(g.humanStrategy).toBe("warpath");
  });

  it("newGame's fifth parameter overrides the defense ceilings", () => {
    const g = newGame(FACTIONS, undefined, {}, undefined, {
      alpha: 200, beta: 1800, gamma: 600, delta: 600,
    });
    expect(g.defenseMax.alpha).toBe(200);
    expect(g.defenseMax.beta).toBe(1800);
  });

  it("startGame and chooseBuild walk the phases, refusing out of order", () => {
    const g = newGame(FACTIONS);
    expect(chooseBuild(g, "pestilence")).toBe(g); // not deck-building yet
    const started = startGame(g);
    expect(started.phase).toBe("deck-building");
    const built = chooseBuild(started, "pestilence");
    expect(built.phase).toBe("pick-faction");
    expect(built.humanStrategy).toBe("pestilence");
  });

  it("chooseRules is legal only while deck-building", () => {
    const started = startGame(newGame(FACTIONS));
    const ruled = chooseRules(started, { turn: "unlimited" });
    expect(ruled.rules.turn).toBe("unlimited");
    const built = chooseBuild(started, "warpath");
    expect(chooseRules(built, { turn: "unlimited" })).toBe(built); // too late
  });

  it("pickFaction deals the same starting deck to every seat", () => {
    const g = playingState();
    expect(g.players.map((p) => p.factionId)).toEqual(
      ["beta", "alpha", "gamma", "delta"],
    );
    for (const p of g.players) {
      // The draw only moves a card between piles, so the multiset holds for
      // the human seat too.
      expect([...p.hand, ...p.deck, ...p.discard].sort())
        .toEqual(startingDeck().sort());
    }
    expect(g.players[0].hand).toHaveLength(OPENING_HAND + 1); // +1 = turn draw
    expect(g.players.slice(1).every((p) => p.hand.length === OPENING_HAND))
      .toBe(true);
    // opening hands are dealt silently: only the turn draw is logged
    expect(g.log.filter((e) => e.type === "draw")).toHaveLength(1);
  });

  it("pickFaction refuses a faction id off the roster", () => {
    const g = chooseBuild(startGame(newGame(FACTIONS)), "warpath");
    expect(pickFaction(g, "atlantis", seededRng(1))).toBe(g);
  });

  it("the human seat plays the chosen build; AI builds are rolled seeded", () => {
    const at = (seed: number) =>
      pickFaction(
        chooseBuild(startGame(newGame(FACTIONS)), "pestilence"),
        "beta", seededRng(seed),
      );
    const g = at(3);
    expect(g.players[0].strategy).toBe("pestilence");
    for (const p of g.players.slice(1)) {
      expect(["warpath", "pestilence"]).toContain(p.strategy);
    }
    // deterministic: the same seed rolls the same builds
    expect(at(3).players.map((p) => p.strategy))
      .toEqual(g.players.map((p) => p.strategy));
    // and the roll is real: across seeds, AI seats land on both builds
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
      for (const p of at(seed).players.slice(1)) seen.add(p.strategy);
    }
    expect([...seen].sort()).toEqual(["pestilence", "warpath"]);
  });
});

describe("beginTurn", () => {
  it("draws one card and logs it", () => {
    const g = playingState();
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(g.players[0].hand.length + 1);
    expect(fresh(after, before).filter((e) => e.type === "draw"))
      .toHaveLength(1);
  });

  it("reshuffles the discard when the deck is empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0], deck: [] as string[], hand: [] as string[],
      discard: ["grow-crops", "grow-crops", "grow-crops"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(1);
    expect(after.players[0].deck).toHaveLength(2);
    expect(after.log.at(-2)?.type).toBe("reshuffle");
  });

  it("pays settlement income: 1, plus 1 per settlement founded in the own realm", () => {
    // pickFaction already ran the human's first beginTurn, so the baseline
    // income is visible on the fresh playing state.
    expect(playingState().wealth.beta).toBe(1);
    const g = {
      ...playingState(),
      wealth: {},
      incorporated: { gamma: "beta" },
      overlords: new Map([["delta", "beta"]]),
      settlements: { gamma: 1, delta: 1 },
    };
    // gamma is incorporated (counts); delta is only a vassal (does not -
    // tribute is the channel for a vassal's wealth, not income).
    expect(beginTurn(g, seededRng(2)).wealth.beta).toBe(2);
  });

  it("sweeps a lapsed respite silently", () => {
    const g = { ...playingState(), respites: { alpha: 1 } }; // over ON turn 1
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    expect(after.respites).toEqual({});
    expect(fresh(after, before).every((e) => e.type === "draw")).toBe(true);
  });
});

describe("the independence gate at turn start", () => {
  /** Human beta a vassal of alpha, with tribute cards salted into the piles
   *  so the strip has something real to remove. */
  function vassalState(defense: Record<string, number>): GameState {
    const g = playingState();
    return {
      ...g,
      overlords: new Map([["beta", "alpha"]]),
      defense,
      players: g.players.map((pl, i) =>
        i === 0
          ? {
              ...pl,
              hand: [...pl.hand, "pay-military-tribute"],
              deck: [...pl.deck, "pay-military-tribute"],
            }
          : pl,
      ),
    };
  }

  it("frees a vassal whose home defense reached the 75% line, with respite and tribute strip", () => {
    // An absent defense key means pristine, which is comfortably above the line.
    const g = vassalState({});
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    expect(after.overlords.has("beta")).toBe(false);
    expect(after.respites.beta).toBe(g.turn + ESCAPE_RESPITE_TURNS);
    expect(pilesOf(after, "beta").filter(isTributeCard)).toHaveLength(0);
    expect(fresh(after, before)[0]).toMatchObject({
      type: "independence", playerId: 1,
      targetFactionId: "beta", overlordFactionId: "alpha",
    });
  });

  it("fires at exactly the line, and not one point below it", () => {
    const at = beginTurn(
      vassalState({ beta: INDEPENDENCE_LINE }), seededRng(2),
    );
    expect(at.overlords.has("beta")).toBe(false);

    const below = beginTurn(
      vassalState({ beta: INDEPENDENCE_LINE - 1 }), seededRng(2),
    );
    expect(below.overlords.get("beta")).toBe("alpha");
    expect(below.log.some((e) => e.type === "independence")).toBe(false);
    expect(pilesOf(below, "beta").filter(isTributeCard).length)
      .toBeGreaterThan(0);
  });
});

describe("beginTurn under unlimited rules", () => {
  it("refills the hand to HAND_REFILL, reshuffling a dry deck mid-refill", () => {
    let g = unlimitedPlaying();
    // Strand the player on an empty hand and a one-card deck; the rest of
    // their cards sit in the discard, so the refill must reshuffle mid-loop.
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0
          ? {
              ...pl,
              hand: [],
              deck: pl.deck.slice(0, 1),
              discard: [...pl.deck.slice(1), ...pl.hand],
            }
          : pl,
      ),
    };
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(HAND_REFILL);
    const events = fresh(after, before);
    expect(events.filter((e) => e.type === "draw")).toHaveLength(HAND_REFILL);
    expect(events.some((e) => e.type === "reshuffle")).toBe(true);
  });

  it("draws what exists when deck and discard cannot fill the hand", () => {
    let g = unlimitedPlaying();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0 ? { ...pl, hand: [], deck: ["raid"], discard: ["raid"] } : pl,
      ),
    };
    expect(beginTurn(g, seededRng(2)).players[0].hand).toHaveLength(2);
  });

  it("draws nothing when the hand is already full", () => {
    const g = unlimitedPlaying();
    // pickFaction's beginTurn already refilled to HAND_REFILL.
    expect(g.players[0].hand).toHaveLength(HAND_REFILL);
    const before = g.log.length;
    const again = beginTurn(g, seededRng(3));
    expect(again.players[0].hand).toHaveLength(HAND_REFILL);
    expect(fresh(again, before).some((e) => e.type === "draw")).toBe(false);
  });
});

describe("playCard validation", () => {
  it("rejects cards outside the playable set and bad targets", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["raid", "subjugate"]);
    expect(playCard(g, 1, rng(), "alpha")).toBe(g); // gate closed at full defense
    expect(playCard(g, 0, rng())).toBe(g); // raid without target
    expect(playCard(g, 0, rng(), "delta")).toBe(g); // out of beta's reach
    expect(playCard(g, 5, rng(), "alpha")).toBe(g); // out of range
  });

  it("a forced tribute card monopolizes the playable set", () => {
    let g = playingState();
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = withHand(g, 0, ["raid", "pay-military-tribute"]);
    expect(playCard(g, 0, rng(), "alpha")).toBe(g); // the raid must wait
    expect(playCard(g, 1, rng())).not.toBe(g);
  });

  it("refuses a second action in the same standard turn", () => {
    const g = withHand(playingState(), 0, ["grow-crops", "grow-crops"]);
    const once = playCard(g, 0, rng());
    expect(once.playedThisTurn).toBe(true);
    expect(playCard(once, 0, rng())).toBe(once);
  });
});

describe("raid", () => {
  it("declares a march instead of landing, and moves nothing this turn", () => {
    const g = withHand(playingState(), 0, ["raid"]);
    const before = g.log.length;
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.defense.alpha).toBeUndefined(); // untouched, still at max
    const events = fresh(after, before);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "play", cardId: "raid", targetFactionId: "alpha",
      sourceFactionId: "beta",
    });
    expect(Object.values(after.marches)).toEqual([{
      actor: "beta", from: "beta", to: "alpha", cardId: "raid",
      damage: RAID_DAMAGE, holdsArmy: true, expiry: g.turn + 1,
    }]);
  });

  it("lands at the start of the actor's next turn and logs the movement", () => {
    const g = playCard(withHand(playingState(), 0, ["raid"]), 0, rng(), "alpha");
    const before = g.log.length;
    const after = landMarches(g);
    expect(after.defense.alpha).toBe(DEFAULT_DEFENSE_MAX - RAID_DAMAGE);
    expect(after.marches).toEqual({}); // the army is home
    expect(fresh(after, before).find((e) => e.type === "march-resolved"))
      .toMatchObject({
        type: "march-resolved", cardId: "raid", targetFactionId: "alpha",
        sourceFactionId: "beta", amount: RAID_DAMAGE,
      });
  });

  it("marches out of the source the caller names, and refuses an illegal one", () => {
    let g = playingState(LINE_ADJ); // alpha - beta - gamma - delta
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["raid"]);
    // beta and gamma both border delta's neighbour gamma; only gamma borders
    // delta itself, so gamma is the one legal tail.
    const out = playCard(g, 0, rng(), "delta", { sourceId: "gamma" });
    expect(Object.values(out.marches)[0]).toMatchObject({
      from: "gamma", to: "delta",
    });
    // beta does not border delta, so naming it is refused outright rather
    // than quietly redirected.
    expect(playCard(g, 0, rng(), "delta", { sourceId: "beta" })).toBe(g);
  });

  it("adds the ruler's leadership to the damage, frozen at declaration", () => {
    let g = withHand(playingState(), 0, ["raid"]);
    g = {
      ...g,
      rulers: { ...g.rulers, beta: { ...g.rulers.beta, leadership: 50 } },
    };
    let after = playCard(g, 0, rng(), "alpha");
    // Losing the ruler after the arrow is drawn does not disarm it: the
    // march carries the number the card tip promised.
    after = {
      ...after,
      rulers: { ...after.rulers, beta: { ...after.rulers.beta, leadership: 0 } },
    };
    expect(landMarches(after).defense.alpha)
      .toBe(DEFAULT_DEFENSE_MAX - (RAID_DAMAGE + 50));
  });

  it("cashes the whole omens stack at declaration: x2 for one reading, x4 for two", () => {
    const base = withHand(playingState(), 0, ["raid"]);

    const one = playCard({ ...base, omens: { beta: 1 } }, 0, rng(), "alpha");
    expect(one.log.find((e) => e.type === "play")?.readings).toBe(1);
    expect(one.omens.beta).toBeUndefined(); // spent whole, at declaration
    expect(landMarches(one).defense.alpha)
      .toBe(DEFAULT_DEFENSE_MAX - RAID_DAMAGE * 2);

    const two = landMarches(
      playCard({ ...base, omens: { beta: 2 } }, 0, rng(), "alpha"),
    );
    expect(two.defense.alpha).toBe(DEFAULT_DEFENSE_MAX - RAID_DAMAGE * 4);
    expect(two.log.find((e) => e.type === "march-resolved")).toMatchObject({
      type: "march-resolved", amount: RAID_DAMAGE * 4,
    });
  });

  it("records the actual movement on a nearly-broken polygon, and nothing at 0", () => {
    const g = withHand(playingState(), 0, ["raid"]);
    // A polygon standing at less than one raid's damage: the event records
    // the actual movement, not the card's number.
    const standing = Math.max(1, RAID_DAMAGE - 1);
    const low = landMarches(
      playCard({ ...g, defense: { alpha: standing } }, 0, rng(), "alpha"),
    );
    expect(low.defense.alpha).toBe(0);
    expect(low.log.find((e) => e.type === "march-resolved")).toMatchObject({
      type: "march-resolved", amount: standing,
    });

    const dead = landMarches(
      playCard({ ...g, defense: { alpha: 0 } }, 0, rng(), "alpha"),
    );
    // Nothing special happens at 0: the march comes home, nothing to record.
    expect(dead.log.some((e) => e.type === "march-resolved")).toBe(false);
    expect(dead.marches).toEqual({});
  });

  it("may target the actor's own vassal - vassalage is upkeep", () => {
    let g = playingState();
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["raid"]);
    const after = landMarches(playCard(g, 0, rng(), "gamma"));
    expect(after.defense.gamma).toBe(DEFAULT_DEFENSE_MAX - RAID_DAMAGE);
    expect(after.overlords.get("gamma")).toBe("beta"); // fealty untouched
  });

  it("holds the source's army until the march lands", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["raid", "raid"]);
    const one = playCard(g, 0, rng(), "alpha");
    // beta's single army is out, and beta is the only land of this realm, so
    // a second raid has nothing left to send.
    expect(playCard({ ...one, playedThisTurn: false }, 0, rng(), "gamma"))
      .toMatchObject({ marches: one.marches });
    expect(landMarches(one).marches).toEqual({});
  });

  it("drops a march whose source left the realm while it was in flight", () => {
    const g = playCard(
      withHand(playingState(LINE_ADJ), 0, ["raid"]), 0, rng(), "alpha",
    );
    // beta is annexed by gamma before the army gets anywhere: there is no
    // longer a land of beta's realm for it to have marched out of.
    const stolen = { ...g, incorporated: { beta: "gamma" } };
    const after = landMarches(stolen);
    expect(after.defense.alpha).toBeUndefined();
    expect(after.marches).toEqual({});
    expect(after.log.find((e) => e.type === "march-lapsed")).toMatchObject({
      type: "march-lapsed", cardId: "raid",
      targetFactionId: "alpha", sourceFactionId: "beta",
    });
  });
});

describe("the counter-raid clash", () => {
  /** alpha - beta - gamma - delta, with alpha's seat holding a raid aimed
   *  back down the axis beta is marching along. */
  function facingRaids(betaDamage: number, alphaDamage: number): GameState {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid"]);
    g = playCard(g, 0, rng(), "alpha");
    // Hand-place alpha's counter rather than walking its turn: the clash is
    // about the two marches, not about how the second one got declared.
    return {
      ...g,
      marches: {
        ...Object.fromEntries(
          Object.entries(g.marches).map(([k, m]) => [k, { ...m, damage: betaDamage }]),
        ),
        "alpha>beta#0": {
          actor: "alpha", from: "alpha", to: "beta", cardId: "raid",
          damage: alphaDamage, holdsArmy: true, expiry: g.turn + 1,
        },
      },
    };
  }

  it("lands only the leftover when the counter is weaker", () => {
    const after = landMarches(facingRaids(10, 4));
    expect(after.defense.alpha).toBe(DEFAULT_DEFENSE_MAX - 6);
    expect(after.defense.beta).toBeUndefined();
    expect(after.log.find((e) => e.type === "march-resolved")).toMatchObject({
      type: "march-resolved", targetFactionId: "alpha", sourceFactionId: "beta",
      amount: 6, clash: { incoming: 10, counter: 4 },
    });
  });

  it("throws the leftover back onto the attacker when the counter is stronger", () => {
    const after = landMarches(facingRaids(4, 10));
    expect(after.defense.beta).toBe(DEFAULT_DEFENSE_MAX - 6);
    expect(after.defense.alpha).toBeUndefined();
    expect(after.log.find((e) => e.type === "march-resolved")).toMatchObject({
      type: "march-resolved", targetFactionId: "beta", sourceFactionId: "alpha",
      amount: 6, clash: { incoming: 10, counter: 4 },
    });
  });

  it("cancels an even clash, moving no score and clearing both arrows", () => {
    const after = landMarches(facingRaids(5, 5));
    expect(after.defense).toEqual({});
    expect(after.marches).toEqual({});
    expect(after.log.some((e) => e.type === "march-resolved")).toBe(false);
  });

  it("spends the counter even though its own turn has not come round", () => {
    // The counter's expiry is a turn out too, but the axis resolves whole at
    // the earlier of the two - otherwise the attack would land first and the
    // counter would survive to strike an already-battered land.
    expect(landMarches(facingRaids(4, 10)).marches).toEqual({});
  });
});

describe("great-raid", () => {
  it("fans one army out of each sallying land, one arrow per bordering polygon", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["great-raid"]);
    const after = playCard(g, 0, rng());
    expect(Object.values(after.marches).map((m) => [m.from, m.to, m.holdsArmy]))
      .toEqual([["beta", "alpha", true], ["beta", "gamma", false]]);
    // One army for the sally, two arrows. beta's army is out either way, so
    // nothing else may march from it until these land.
    expect(after.defense).toEqual({}); // nothing lands yet
  });

  it("cannot sally at all once the frontier's armies are already out", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid", "great-raid"]);
    g = playCard(g, 0, rng(), "alpha");
    const after = playCard({ ...g, playedThisTurn: false }, 0, rng());
    // beta is the realm's only land and its army is on the road to alpha.
    expect(after.marches).toEqual(g.marches);
  });

  it("hits exactly the polygons bordering the full realm when they land", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["great-raid"]);
    const before = playCard(g, 0, rng());
    const after = landMarches(before);
    const landed = fresh(after, before.log.length)
      .filter((e) => e.type === "march-resolved");
    expect(landed.map((e) => e.targetFactionId)).toEqual(["alpha", "gamma"]);
    expect(landed.every((e) => e.amount === GREAT_RAID_DAMAGE)).toBe(true);
    expect(after.defense.beta).toBeUndefined(); // never hits itself
  });

  it("spares the realm's own members and strikes what the pyramid borders", () => {
    let g = playingState(); // complete graph
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["great-raid"]);
    const after = landMarches(playCard(g, 0, rng()));
    const landed = after.log.filter((e) => e.type === "march-resolved");
    expect(landed.map((e) => e.targetFactionId)).toEqual(["alpha", "delta"]);
  });

  it("stacks leadership and omens like a raid, one multiplier over every polygon", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["great-raid"]);
    g = {
      ...g,
      omens: { beta: 1 },
      rulers: { ...g.rulers, beta: { ...g.rulers.beta, leadership: 5 } },
    };
    const declared = playCard(g, 0, rng());
    expect(declared.log.find((e) => e.type === "play")?.readings).toBe(1);
    expect(declared.omens.beta).toBeUndefined();
    const after = landMarches(declared);
    const each = (GREAT_RAID_DAMAGE + 5) * 2;
    expect(after.defense.alpha).toBe(DEFAULT_DEFENSE_MAX - each);
    expect(after.defense.gamma).toBe(DEFAULT_DEFENSE_MAX - each);
  });
});

describe("create-army", () => {
  it("stations an army and leaves the deck instead of discarding", () => {
    const g = withHand(playingState(), 0, ["create-army"]);
    const before = g.log.length;
    const after = playCard(g, 0, rng(), "beta");
    expect(after.armies).toEqual({ beta: ARMIES_PER_POLYGON + 1 });
    // Gone for good: the discard is where a card waits to be reshuffled back,
    // and an army raised twice off one pick is the compounding this prevents.
    expect(after.players[0].discard).not.toContain("create-army");
    expect(pilesOf(after, "beta")).not.toContain("create-army");
    // No event of its own - armies are not a walked standing, so the play
    // line carries no suffix and there is nothing else to say.
    expect(fresh(after, before)).toHaveLength(1);
  });

  it("lets the second army march while the first is away", () => {
    let g = withHand(unlimitedPlaying(LINE_ADJ), 0, ["create-army", "raid", "raid"]);
    g = playCard(g, 0, rng(), "beta");
    g = playCard(g, 0, rng(), "alpha");
    g = playCard(g, 0, rng(), "gamma");
    expect(Object.values(g.marches).map((m) => m.to)).toEqual(["alpha", "gamma"]);
  });

  it("aims only inward - a rival's land is no place to raise your army", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["create-army"]);
    expect(validTargetsFor(viewOf(g), "beta", "create-army")).toEqual(["beta"]);
  });
});

describe("the reserves and the council", () => {
  it("favourable-omens and miasma stack one reading per play", () => {
    let g = withHand(unlimitedPlaying(), 0, ["favourable-omens", "favourable-omens", "miasma"]);
    g = playCard(g, 0, rng());
    g = playCard(g, 0, rng());
    expect(g.omens.beta).toBe(2);
    g = playCard(g, 0, rng());
    expect(g.miasma.beta).toBe(1);
  });

  it("war-council adds 50 leadership to the acting ruler and stamps the amount", () => {
    const g = withHand(playingState(), 0, ["war-council"]);
    const after = playCard(g, 0, rng());
    expect(rulerOf(after.rulers, "beta").leadership)
      .toBe(WAR_COUNCIL_LEADERSHIP);
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "war-council", amount: WAR_COUNCIL_LEADERSHIP,
    });
  });
});

describe("disease", () => {
  it("spread-disease sets one owned stack on a polygon in reach", () => {
    const g = withHand(
      { ...playingState(), disease: { alpha: { beta: 1 } } }, 0,
      ["spread-disease"],
    );
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.disease.alpha.beta).toBe(2); // stacks accumulate
    expect(after.log.at(-1)).toMatchObject({
      type: "disease-spread", cardId: "spread-disease",
      targetFactionId: "alpha", amount: 1,
    });
  });

  it("localized-outbreak stacks every neighbour of the target except the own realm", () => {
    const g = withHand(playingState(), 0, ["localized-outbreak"]);
    const before = g.log.length;
    const after = playCard(g, 0, rng(), "alpha");
    // alpha's neighbours on the complete graph are beta, gamma, delta; beta
    // is the actor's realm, and the target polygon itself gets nothing.
    expect(after.disease.gamma?.beta).toBe(1);
    expect(after.disease.delta?.beta).toBe(1);
    expect(after.disease.alpha).toBeUndefined();
    const spread = fresh(after, before).filter((e) => e.type === "disease-spread");
    expect(spread.map((e) => e.targetFactionId)).toEqual(["gamma", "delta"]);
  });

  it("plague cashes only the actor's stacks, everywhere, and clears them", () => {
    // Two owners on gamma: only beta's stack burns, delta's stays.
    let g = playingState();
    g = {
      ...g,
      disease: { alpha: { beta: 2 }, gamma: { beta: 1, delta: 1 } },
    };
    g = withHand(g, 0, ["plague"]);
    const before = g.log.length;
    const after = playCard(g, 0, rng());
    expect(after.defense.alpha)
      .toBe(DEFAULT_DEFENSE_MAX - 2 * PLAGUE_DAMAGE_PER_STACK);
    expect(after.defense.gamma)
      .toBe(DEFAULT_DEFENSE_MAX - PLAGUE_DAMAGE_PER_STACK);
    expect(after.disease).toEqual({ gamma: { delta: 1 } });
    const plagued = fresh(after, before).filter((e) => e.type === "plagued");
    expect(plagued.map((e) => [e.targetFactionId, e.amount])).toEqual([
      ["alpha", 20], ["gamma", 10],
    ]);
  });

  it("plague doubles per miasma reading, spends the stack, stamps readings", () => {
    let g = playingState();
    g = {
      ...g,
      disease: { alpha: { beta: 2 } },
      miasma: { beta: 1 },
    };
    g = withHand(g, 0, ["plague"]);
    const after = playCard(g, 0, rng());
    expect(after.defense.alpha)
      .toBe(DEFAULT_DEFENSE_MAX - 2 * PLAGUE_DAMAGE_PER_STACK * 2);
    expect(after.miasma.beta).toBeUndefined();
    expect(after.log.find((e) => e.type === "play")?.readings).toBe(1);
  });

  it("plague on a broken polygon still logs where the stacks went, amount 0", () => {
    let g = playingState();
    g = { ...g, disease: { alpha: { beta: 1 } }, defense: { alpha: 0 } };
    g = withHand(g, 0, ["plague"]);
    const after = playCard(g, 0, rng());
    expect(after.log.at(-1)).toMatchObject({
      type: "plagued", targetFactionId: "alpha", amount: 0,
    });
    expect(after.disease).toEqual({});
  });

  it("foul-winds claims every stack on every land, logging what was gained", () => {
    let g = playingState();
    g = {
      ...g,
      // alpha holds a mix (some already beta's); delta is all gamma's.
      disease: { alpha: { gamma: 2, beta: 1 }, delta: { gamma: 3 } },
    };
    g = withHand(g, 0, ["foul-winds"]);
    const before = g.log.length;
    const after = playCard(g, 0, rng());
    expect(after.disease).toEqual({ alpha: { beta: 3 }, delta: { beta: 3 } });
    const shifted = fresh(after, before).filter((e) => e.type === "winds-shifted");
    // amount = stacks GAINED, so beta's own stack on alpha is not re-counted
    expect(shifted.map((e) => [e.targetFactionId, e.amount])).toEqual([
      ["alpha", 2], ["delta", 3],
    ]);
  });

  it("foul-winds and plague are dead cards in a world with no disease", () => {
    const g = withHand(playingState(), 0, ["foul-winds", "plague", "grow-crops"]);
    expect(playCard(g, 0, rng())).toBe(g);
    expect(playCard(g, 1, rng())).toBe(g);
  });
});

describe("heals", () => {
  it("hillfort restores 15 to one realm polygon, capped at its max", () => {
    const g = withHand(
      { ...playingState(), defense: { beta: 50 } }, 0, ["hillfort"],
    );
    const after = playCard(g, 0, rng(), "beta");
    expect(after.defense.beta).toBeUndefined(); // back at max: key deleted
    expect(after.log.at(-1)).toMatchObject({
      type: "healed", cardId: "hillfort", targetFactionId: "beta", amount: 10,
    });
    const deep = playCard(
      withHand({ ...playingState(), defense: { beta: 30 } }, 0, ["hillfort"]),
      0, rng(), "beta",
    );
    expect(deep.defense.beta).toBe(30 + HILLFORT_HEAL);
  });

  it("hillfort cannot target a polygon already at full defense", () => {
    const g = withHand(playingState(), 0, ["hillfort", "grow-crops"]);
    expect(playCard(g, 0, rng(), "beta")).toBe(g);
  });

  it("harvest-feast heals every realm polygon, healed events only where defense moved", () => {
    let g = playingState();
    g = {
      ...g,
      overlords: new Map([["gamma", "beta"]]),
      defense: { beta: 50 }, // gamma pristine: the feast moves nothing there
    };
    g = withHand(g, 0, ["harvest-feast"]);
    const before = g.log.length;
    const after = playCard(g, 0, rng());
    expect(after.defense.beta).toBe(50 + HARVEST_FEAST_HEAL);
    const healed = fresh(after, before).filter((e) => e.type === "healed");
    expect(healed).toHaveLength(1);
    expect(healed[0]).toMatchObject({
      targetFactionId: "beta", amount: HARVEST_FEAST_HEAL,
    });
  });

  it("harvest-feast is dead while the whole realm stands at full defense", () => {
    const g = withHand(playingState(), 0, ["harvest-feast", "grow-crops"]);
    expect(playCard(g, 0, rng())).toBe(g);
  });

  it("fortify heals the realm by 1 per held omens reading, capped, no cash", () => {
    // Zero readings: legal, but heals nothing - a wasted turn, not a refusal.
    const dry = withHand({ ...playingState(), defense: { beta: 30 } }, 0, ["fortify"]);
    const after = playCard(dry, 0, rng());
    expect(after.defense.beta).toBe(30);
    expect(after.log.at(-1)).toMatchObject({ type: "play", cardId: "fortify" });

    // Two readings: 2 * FORTIFY_HEAL_PER_OMEN per realm polygon, and the
    // stack survives the play - Fortify reads it, it does not cash it.
    let g: GameState = { ...playingState(), defense: { beta: 30 }, omens: { beta: 2 } };
    g = withHand(g, 0, ["fortify"]);
    const healed = playCard(g, 0, rng());
    expect(healed.defense.beta).toBe(30 + 2 * FORTIFY_HEAL_PER_OMEN);
    expect(healed.omens.beta).toBe(2);

    // Capped at max, like every other heal.
    let capped: GameState = { ...playingState(), defense: { beta: 59 }, omens: { beta: 5 } };
    capped = withHand(capped, 0, ["fortify"]);
    expect(playCard(capped, 0, rng()).defense.beta).toBeUndefined();
  });
});

describe("subjugate", () => {
  it("is legal at exactly the 25% line and refused one point above it", () => {
    const open = withHand(
      { ...playingState(), defense: { alpha: SUBJUGATE_LINE } },
      0, ["subjugate"],
    );
    const after = playCard(open, 0, rng(), "alpha");
    expect(after.overlords.get("alpha")).toBe("beta");

    const closed = withHand(
      { ...playingState(), defense: { alpha: SUBJUGATE_LINE + 1 } },
      0, ["subjugate"],
    );
    expect(playCard(closed, 0, rng(), "alpha")).toBe(closed);
  });

  it("stores the overlord, injects the tribute card, logs", () => {
    const g = withHand(
      { ...playingState(), defense: { alpha: 0 } }, 0, ["subjugate"],
    );
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.overlords.get("alpha")).toBe("beta");
    expect(pilesOf(after, "alpha").filter(isTributeCard)).toHaveLength(1);
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta",
    });
    expect(after.log.at(-1)?.formerOverlordFactionId).toBeUndefined();
    expect(g.overlords.size).toBe(0); // input untouched
  });

  it("poaching records the former lord and grants the target no respite", () => {
    let g = playingState();
    g = {
      ...g,
      overlords: new Map([["alpha", "gamma"]]),
      defense: { alpha: 0 },
    };
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.overlords.get("alpha")).toBe("beta");
    expect(after.log.at(-1)?.formerOverlordFactionId).toBe("gamma");
    expect(after.respites.alpha).toBeUndefined(); // poached, not escaped
  });

  it("taking a lord takes its whole pyramid, releasing nobody", () => {
    // The six-faction roster: beta + alpha + delta is 3 lands, below its win
    // size of 4, so the pyramid landing cannot tip the phase.
    let g = playingSix();
    g = {
      ...g,
      overlords: new Map([["delta", "alpha"]]),
      defense: { alpha: 0 },
    };
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.phase).toBe("playing");
    expect(after.overlords.get("alpha")).toBe("beta");
    expect(after.overlords.get("delta")).toBe("alpha"); // chain intact
    expect(after.log.some((e) => e.type === "released")).toBe(false);
  });

  it("cannot touch a faction inside its escape respite", () => {
    let g = playingState();
    g = {
      ...g,
      defense: { alpha: 0 },
      respites: { alpha: g.turn + 1 }, // active while turn < expiry
    };
    g = withHand(g, 0, ["subjugate", "grow-crops"]);
    expect(playCard(g, 0, rng(), "alpha")).toBe(g);
  });
});

describe("incorporate", () => {
  it("digests a vassal at the realm gate, freeing the target's own vassals", () => {
    // The spare factions hang under the TARGET: the digest frees them, so the
    // realm falls back below the win line and the test stays about the digest.
    let g = playingState();
    g = {
      ...g,
      overlords: new Map([
        ["gamma", "beta"], ["alpha", "gamma"], ["delta", "gamma"],
      ]),
    };
    // salt a tribute card into a freed vassal to see the strip
    g = {
      ...g,
      players: g.players.map((pl) =>
        pl.factionId === "alpha"
          ? { ...pl, deck: [...pl.deck, "pay-military-tribute"] }
          : pl,
      ),
    };
    g = withHand(g, 0, ["incorporate"]);
    const before = g.log.length;
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.phase).toBe("playing");
    expect(after.incorporated).toEqual({ gamma: "beta" });
    expect(after.overlords.has("gamma")).toBe(false);
    // gamma's vassals are freed with the escape respite, tribute stripped
    expect(after.overlords.has("alpha")).toBe(false);
    expect(after.overlords.has("delta")).toBe(false);
    expect(after.respites.alpha).toBe(g.turn + ESCAPE_RESPITE_TURNS);
    expect(pilesOf(after, "alpha").filter(isTributeCard)).toHaveLength(0);
    const events = fresh(after, before);
    expect(events.map((e) => e.type)).toEqual(
      ["play", "released", "released", "incorporated"],
    );
    expect(events[3]).toMatchObject({
      targetFactionId: "gamma", overlordFactionId: "beta",
    });
  });

  it("re-parents the target's own annexations to the actor", () => {
    let g = playingSix();
    g = {
      ...g,
      overlords: new Map([["gamma", "beta"], ["alpha", "gamma"]]),
      incorporated: { delta: "gamma" },
    };
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.incorporated).toEqual({ gamma: "beta", delta: "beta" });
  });

  it("is refused below the realm gate and against a non-vassal", () => {
    let g = playingState();
    g = { ...g, overlords: new Map([["gamma", "beta"]]) }; // realm of 2 < 4
    g = withHand(g, 0, ["incorporate", "grow-crops"]);
    expect(playCard(g, 0, rng(), "gamma")).toBe(g);

    // at the gate, but alpha answers to nobody
    let big = playingState();
    big = {
      ...big,
      overlords: new Map([
        ["gamma", "beta"], ["delta", "gamma"], ["alpha", "delta"],
      ]),
    };
    big = withHand(big, 0, ["incorporate", "grow-crops"]);
    expect(playCard(big, 0, rng(), "alpha")).toBe(big);
  });
});

describe("assassinate-ruler and bodyguard", () => {
  it("replaces the target's ruler; the successor starts at leadership 0", () => {
    let g = playingState();
    g = {
      ...g,
      rulers: { ...g.rulers, alpha: { ...g.rulers.alpha, leadership: 30 } },
    };
    const killed = rulerOf(g.rulers, "alpha").name;
    g = withHand(g, 0, ["assassinate-ruler"]);
    const after = playCard(g, 0, rng(), "alpha");
    const successor = rulerOf(after.rulers, "alpha");
    expect(successor.name).not.toBe(killed);
    expect(successor.leadership).toBe(0);
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "assassinate-ruler",
      targetRuler: killed, successorRuler: successor.name,
    });
  });

  it("a posted bodyguard turns the killing aside and is consumed", () => {
    let g = playingState();
    g = {
      ...g,
      guards: { bodyguard: ["alpha"] },
      rulers: { ...g.rulers, alpha: { ...g.rulers.alpha, leadership: 30 } },
    };
    const guarded = rulerOf(g.rulers, "alpha");
    g = withHand(g, 0, ["assassinate-ruler"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(rulerOf(after.rulers, "alpha")).toEqual(guarded); // survived, stack intact
    expect(after.guards.bodyguard).toEqual([]);
    const play = after.log.at(-1);
    expect(play).toMatchObject({
      type: "play", prevented: true, targetRuler: guarded.name,
    });
    expect(play?.successorRuler).toBeUndefined();
  });

  it("bodyguard posts a guard, and a second copy is dead while one is unspent", () => {
    const g = withHand(playingState(), 0, ["bodyguard"]);
    const after = playCard(g, 0, rng());
    expect(after.guards.bodyguard).toEqual(["beta"]);
    const again = withHand(
      { ...playingState(), guards: { bodyguard: ["beta"] } },
      0, ["bodyguard", "grow-crops"],
    );
    expect(playCard(again, 0, rng())).toBe(again);
  });
});

describe("found-settlement", () => {
  it("costs 1 wealth, raises the settlement, logs settled", () => {
    const g = withHand(
      { ...playingState(), wealth: { beta: 1 } }, 0, ["found-settlement"],
    );
    const after = playCard(g, 0, rng(), "beta");
    expect(after.wealth.beta).toBe(0);
    expect(after.settlements.beta).toBe(1);
    expect(after.log.at(-1)).toMatchObject({
      type: "settled", targetFactionId: "beta",
    });
  });

  it("is unaffordable on an empty treasury", () => {
    const g = withHand(
      { ...playingState(), wealth: {} }, 0, ["found-settlement", "grow-crops"],
    );
    expect(playCard(g, 0, rng(), "beta")).toBe(g);
  });
});

describe("tribute", () => {
  /** Human beta a vassal of alpha holding one annexed land, so the owed sum
   *  (1 per land of the payer's own realm) is 2. On the six-faction roster,
   *  because the lord's realm counts the vassal's annexation: on four
   *  factions alpha would stand at the win line and every play here would
   *  end as `unified`. */
  function owing(wealth: Record<string, number>): GameState {
    let g = playingSix();
    g = {
      ...g,
      overlords: new Map([["beta", "alpha"]]),
      incorporated: { gamma: "beta" },
      wealth,
    };
    return withHand(g, 0, ["pay-military-tribute"]);
  }

  it("moves coins only, 1 per land of the payer's own realm", () => {
    const after = playCard(owing({ beta: 3 }), 0, rng());
    expect(after.wealth.beta).toBe(1);
    expect(after.wealth.alpha).toBe(2);
    expect(after.log.at(-1)).toMatchObject({
      type: "tribute", targetFactionId: "beta", overlordFactionId: "alpha",
      wealth: 2,
    });
  });

  it("forgives the shortfall the treasury cannot cover", () => {
    const after = playCard(owing({ beta: 1 }), 0, rng());
    expect(after.wealth.beta).toBe(0);
    expect(after.wealth.alpha).toBe(1);
    expect(after.log.at(-1)?.wealth).toBe(1);
  });

  it("an empty treasury pays nothing and the event carries no wealth", () => {
    const after = playCard(owing({}), 0, rng());
    expect(after.wealth.alpha).toBeUndefined();
    const event = after.log.at(-1);
    expect(event?.type).toBe("tribute");
    expect(event?.wealth).toBeUndefined();
  });
});

describe("the turnip bar", () => {
  it("counts grow-crops plays below the threshold without a harvest", () => {
    const g = withHand(
      { ...playingState(), turnips: { beta: TURNIP_HARVEST_THRESHOLD - 2 } },
      0, ["grow-crops"],
    );
    const after = playCard(g, 0, rng());
    expect(after.turnips.beta).toBe(TURNIP_HARVEST_THRESHOLD - 1);
    expect(after.log.some((e) => e.type === "harvest-earned")).toBe(false);
    expect(pilesOf(after, "beta")).not.toContain("turnip-harvest");
  });

  it("the 5th play crosses the bar: reset, injection, harvest-earned", () => {
    const g = withHand(
      { ...playingState(), turnips: { beta: TURNIP_HARVEST_THRESHOLD - 1 } },
      0, ["grow-crops"],
    );
    const after = playCard(g, 0, rng());
    expect(after.turnips.beta).toBe(0);
    expect(
      after.players[0].deck.filter((c) => c === "turnip-harvest"),
    ).toHaveLength(1);
    expect(after.log.at(-1)).toMatchObject({
      type: "harvest-earned", cardId: "turnip-harvest", consequence: true,
    });
  });

  it("every seat counts: an AI seat's 5th play earns its harvest too", () => {
    let g = playingState();
    g = {
      ...g,
      current: 1, playedThisTurn: false,
      turnips: { alpha: TURNIP_HARVEST_THRESHOLD - 1 },
    };
    g = withHand(g, 1, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.turnips.alpha).toBe(0);
    expect(pilesOf(after, "alpha")).toContain("turnip-harvest");
  });
});

describe("turnip-harvest", () => {
  it("a pick rides the play and is shuffled into the deck", () => {
    const g = withHand(playingState(), 0, ["turnip-harvest"]);
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { cardId: "war-council" },
    });
    expect(after.players[0].deck).toContain("war-council");
    expect(after.log.at(-1)).toMatchObject({
      type: "harvest-picked", cardId: "war-council", consequence: true,
    });
  });

  it("a skip keeps the deck lean and logs no pick", () => {
    const g = withHand(playingState(), 0, ["turnip-harvest"]);
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { skip: true },
    });
    expect(after.players[0].deck.sort()).toEqual(g.players[0].deck.sort());
    expect(after.log.some((e) => e.type === "harvest-picked")).toBe(false);
    expect(after.players[0].discard).toContain("turnip-harvest"); // still spent
  });

  it("a choiceless play auto-picks, and never a card already at its cap", () => {
    // Subjugate tops both strategies' priority but is capped at one copy;
    // with one in the deck the pool must not offer it, whatever the seed.
    for (let seed = 1; seed <= 20; seed++) {
      let g = playingState();
      g = {
        ...g,
        players: g.players.map((pl, i) =>
          i === 0 ? { ...pl, deck: [...pl.deck, "subjugate"] } : pl,
        ),
      };
      g = withHand(g, 0, ["turnip-harvest"]);
      const after = playCard(g, 0, seededRng(seed));
      const picked = after.log.find((e) => e.type === "harvest-picked");
      expect(picked).toBeDefined();
      expect(picked?.cardId).not.toBe("subjugate");
      expect(
        after.players[0].deck.filter((c) => c === "subjugate"),
      ).toHaveLength(1);
    }
  });
});

describe("endings", () => {
  it("a free human at 55% of the map wins, counted through fullRealmOf", () => {
    // The chain beta -> gamma -> delta proves the count walks vassals of
    // vassals; a one-level walk would see 2 lands and never end the run.
    let g = playingState();
    g = { ...g, overlords: new Map([["gamma", "beta"], ["delta", "gamma"]]) };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("victory");
    const victory = after.log.at(-1);
    expect(victory?.type).toBe("victory");
    expect(victory?.consequence).toBeUndefined(); // a headline, never a sub-item
  });

  it("a vassal at winSize does not win; its root unifies instead", () => {
    let g = playingState();
    g = {
      ...g,
      overlords: new Map([
        ["beta", "alpha"], ["gamma", "beta"], ["delta", "gamma"],
      ]),
    };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("defeat");
    expect(after.log.at(-1)).toMatchObject({
      type: "unified", overlordFactionId: "alpha",
    });
  });

  it("a rival crossing the line ends the run as unified", () => {
    let g = playingState();
    g = { ...g, overlords: new Map([["alpha", "gamma"], ["delta", "gamma"]]) };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("defeat");
    expect(after.log.at(-1)).toMatchObject({
      type: "unified", overlordFactionId: "gamma",
    });
  });

  it("incorporating the human is defeat, checked before the winner's own count", () => {
    let g = playingState();
    g = {
      ...g,
      current: 1, playedThisTurn: false,
      overlords: new Map([
        ["beta", "alpha"], ["gamma", "alpha"], ["delta", "alpha"],
      ]),
    };
    g = withHand(g, 1, ["incorporate"]);
    const after = playCard(g, 0, rng(), "beta");
    // alpha's realm also crosses winSize here; defeat-by-digestion outranks it
    expect(after.phase).toBe("defeat");
    expect(after.log.at(-1)).toMatchObject({
      type: "defeat", targetFactionId: "beta", overlordFactionId: "alpha",
    });
  });

  it("surrender is terminal and logs its own event type", () => {
    const g = playingState();
    const after = surrender(g);
    expect(after.phase).toBe("defeat");
    expect(after.log.at(-1)).toMatchObject({ type: "surrendered", playerId: 1 });
    expect(surrender(after)).toBe(after); // not reversible
  });
});

describe("discardCard", () => {
  it("discards a dead hand, once, and logs it", () => {
    // Subjugate with every gate closed is unplayable: the hand is dead.
    const g = withHand(playingState(), 0, ["subjugate"]);
    const after = discardCard(g, 0);
    expect(after.players[0].hand).toHaveLength(0);
    expect(after.players[0].discard).toContain("subjugate");
    expect(after.playedThisTurn).toBe(true);
    expect(after.log.at(-1)).toMatchObject({
      type: "discard", cardId: "subjugate", playerId: 1,
    });
    expect(discardCard(after, 0)).toBe(after); // the turn is spent
  });

  it("is refused while anything is playable", () => {
    const g = withHand(playingState(), 0, ["grow-crops"]);
    expect(discardCard(g, 0)).toBe(g);
  });
});

describe("unlimited turn flow", () => {
  it("keeps the turn open while cards remain and closes it on endTurn", () => {
    let g = unlimitedPlaying();
    g = withHand(g, 0, ["grow-crops", "grow-crops", "grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.playedThisTurn).toBe(false);
    g = playCard(g, 0, seededRng(1));
    expect(g.playedThisTurn).toBe(false);
    expect(advance(g, seededRng(3))).toBe(g); // the turn is not over
    g = endTurn(g);
    expect(g.playedThisTurn).toBe(true);
    expect(advance(g, seededRng(3)).current).not.toBe(0);
  });

  it("closes the turn by itself when the last card is played", () => {
    let g = unlimitedPlaying();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.players[0].hand).toHaveLength(0);
    expect(g.playedThisTurn).toBe(true);
    expect(advance(g, seededRng(3)).current).not.toBe(0);
  });

  it("endTurn is a no-op under standard rules and on a closed turn", () => {
    const standard = playingState();
    expect(endTurn(standard)).toBe(standard);
    let g = unlimitedPlaying();
    g = endTurn(g);
    expect(endTurn(g)).toBe(g);
  });

  it("never discards in unlimited mode, even with nothing playable", () => {
    let g = unlimitedPlaying();
    g = withHand(g, 0, ["subjugate"]); // every gate closed: dead hand
    expect(discardCard(g, 0)).toBe(g);
    expect(playCard(g, 0, rng(), "alpha")).toBe(g);
    // the way out is endTurn, with the dead card still held
    const done = endTurn(g);
    expect(done.playedThisTurn).toBe(true);
    expect(done.players[0].hand).toEqual(["subjugate"]);
  });
});

describe("advance", () => {
  it("refuses to move on before the turn is complete", () => {
    const g = playingState();
    expect(g.playedThisTurn).toBe(false);
    expect(advance(g, seededRng(3))).toBe(g);
  });

  it("skips incorporated seats", () => {
    const g = {
      ...playingState(),
      current: 1, playedThisTurn: true,
      incorporated: { gamma: "alpha" }, // seat 2's faction
    };
    expect(advance(g, seededRng(3)).current).toBe(3);
  });

  it("bumps the turn counter on wrap", () => {
    const g = { ...playingState(), current: 3, playedThisTurn: true };
    const after = advance(g, seededRng(3));
    expect(after.current).toBe(0);
    expect(after.turn).toBe(2);
  });

  it("never skips the human seat, incorporated or not", () => {
    const g = {
      ...playingState(),
      current: 3, playedThisTurn: true,
      incorporated: { beta: "alpha" },
    };
    expect(advance(g, seededRng(3)).current).toBe(0);
  });
});

describe("appendEvents stamping", () => {
  it("nests a play's damage under the play and stamps the acting ruler", () => {
    // Plague, not Raid: a raid is declared now and lands a turn later, from a
    // batch that opens with no play, so it has nothing to nest under.
    const g = withHand(
      { ...playingState(), disease: { alpha: { beta: 1 } } }, 0, ["plague"],
    );
    const before = g.log.length;
    const after = playCard(g, 0, rng());
    const [play, plagued] = fresh(after, before);
    expect(play.type).toBe("play");
    expect(play.consequence).toBeUndefined(); // the play leads, never nests
    expect(plagued).toMatchObject({ type: "plagued", consequence: true });
    expect(play.actorRuler).toBe(rulerOf(g.rulers, "beta").name);
  });

  it("a march landing is nobody's consequence - its card was a turn ago", () => {
    const g = playCard(withHand(playingState(), 0, ["raid"]), 0, rng(), "alpha");
    const before = g.log.length;
    const landed = fresh(landMarches(g), before)
      .find((e) => e.type === "march-resolved");
    expect(landed?.consequence).toBeUndefined();
  });

  it("a turn-start draw is nobody's consequence", () => {
    const g = playingState();
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    const draw = fresh(after, before).find((e) => e.type === "draw");
    expect(draw?.consequence).toBeUndefined();
  });
});
