import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, chooseRules, pickFaction, beginTurn,
  playCard, discardCard, endTurn, advance, surrender, viewOf,
  autoTransfer, transferDefense, transferLimit,
  OPENING_HAND, HAND_REFILL, MAX_ACTIVE, TURNIP_HARVEST_THRESHOLD,
  victoryRealmSize, type GameState,
} from "../src/game";
import {
  hasPassive, passivesOn, playsTurns, QUIET_PASSIVES, stripOnCapture,
} from "../src/passives";
import { hasRuler } from "../src/rulers";
import { DEFAULT_RULES } from "../src/rules";
import { CARDS, isTributeCard, startingDeck, type Rng } from "../src/cards";
import {
  DEFAULT_DEFENSE_MAX, INDEPENDENCE_GATE, LAND_GROWTH, SUBJUGATION_GATE,
  FORTIFY_HEAL, GREAT_RAID_DAMAGE, HARVEST_FEAST_HEAL, HILLFORT_HEAL,
  PLAGUE_DAMAGE_PER_STACK, RAID_DAMAGE, turnipThresholdFor,
  WAR_COUNCIL_LEADERSHIP,
} from "../src/defense";
import {
  cardBlockReason, ESCAPE_RESPITE_TURNS, playableSet, validTargetsFor,
} from "../src/playability";
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

/** A roomy polygon for the fixtures, well above the shipped map's 2..18.
 *  The rules are scale-free and the heals are not: at a shipped max of 6 a
 *  Hillfort (15) fills anything and a Fortify (4) all but does, so every
 *  test about "how much did this move" would be a test about the cap. A 60
 *  polygon leaves both gates and both heals distinguishable, the same reason
 *  tests/playability.test.ts works at 600. */
const FIXTURE_MAX = 60;
const maxes = (ids: string[]): Record<string, number> =>
  Object.fromEntries(ids.map((id) => [id, FIXTURE_MAX]));

/** The one gate arithmetic the fixtures lean on, spelled out once: a 60
 *  polygon opens to Subjugate at 15 and crosses back to freedom at 45. */
const SUBJUGATE_LINE = Math.floor(SUBJUGATION_GATE * FIXTURE_MAX);
const INDEPENDENCE_LINE = Math.ceil(INDEPENDENCE_GATE * FIXTURE_MAX);

/** Grow turnips plays a FIXTURE_MAX land owes before a harvest - the same
 *  derivation `turnipThresholdOn` runs against the real ceiling, so a fixture
 *  at FIXTURE_MAX cannot borrow the module's DEFAULT_DEFENSE_MAX constant. */
const FIXTURE_TURNIP_THRESHOLD = turnipThresholdFor(FIXTURE_MAX);

function playingState(adj?: Record<string, string[]>): GameState {
  return pickFaction(
    chooseBuild(
      startGame(newGame(FACTIONS, adj, {}, undefined, maxes(FACTIONS))),
      "warpath", seededRng(1),
    ),
    "beta",
    seededRng(1),
  );
}

/** A playing state under unlimited turn rules, human seat current. */
function unlimitedPlaying(adj?: Record<string, string[]>): GameState {
  const g = chooseRules(
    startGame(newGame(FACTIONS, adj, {}, undefined, maxes(FACTIONS))),
    { ...DEFAULT_RULES, turn: "unlimited" },
  );
  return pickFaction(chooseBuild(g, "warpath", seededRng(1)), "beta", seededRng(1));
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

// Victory is half the map, and the incorporate realm gate is a flat 4, so a
// small roster puts the two in each other's way: on four lands a single
// subjugation already wins, and on six a pyramid of three does. A fixture
// that grows the actor's realm therefore states which roster it needs -
// SIX (win size 3) for one vassal, TEN (win size 5) for anything that has to
// reach the incorporate gate.
const SIX = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
const TEN = [...SIX, "eta", "theta", "iota", "kappa"];

function playingSix(): GameState {
  return pickFaction(
    chooseBuild(
      startGame(newGame(SIX, undefined, {}, undefined, maxes(SIX))),
      "warpath", seededRng(1),
    ),
    "beta", seededRng(1),
  );
}

function playingTen(): GameState {
  return pickFaction(
    chooseBuild(
      startGame(newGame(TEN, undefined, {}, undefined, maxes(TEN))),
      "warpath", seededRng(1),
    ),
    "beta", seededRng(1),
  );
}

it("victoryRealmSize is half the map: 2 of 4 lands, 3 of 6, 13 of 26", () => {
  expect(victoryRealmSize(FACTIONS.length)).toBe(2);
  expect(victoryRealmSize(SIX.length)).toBe(3);
  expect(victoryRealmSize(26)).toBe(13);
});

it("earns a harvest every second turnip, in a world nobody handed a map to", () => {
  expect(TURNIP_HARVEST_THRESHOLD).toBe(2);
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
    expect(chooseBuild(g, "pestilence", seededRng(1))).toBe(g); // not deck-building yet
    const started = startGame(g);
    expect(started.phase).toBe("deck-building");
    const built = chooseBuild(started, "pestilence", seededRng(1));
    expect(built.phase).toBe("pick-faction");
    expect(built.humanStrategy).toBe("pestilence");
  });

  it("chooseRules is legal only while deck-building", () => {
    const started = startGame(newGame(FACTIONS));
    const ruled = chooseRules(started, { ...DEFAULT_RULES, turn: "unlimited" });
    expect(ruled.rules.turn).toBe("unlimited");
    const built = chooseBuild(started, "warpath", seededRng(1));
    expect(chooseRules(built, { ...DEFAULT_RULES, turn: "unlimited" })).toBe(built); // too late
  });

  it("pickFaction deals the same starting deck to every seat", () => {
    const g = playingState();
    expect(g.players.map((p) => p.factionId)).toEqual(
      ["beta", "alpha", "gamma", "delta"],
    );
    for (const p of g.players) {
      // The draw only moves a card between piles, so the multiset holds for
      // the human seat too. Each seat's OWN build, since an AI seat can roll
      // pestilence even though the human here chose warpath.
      expect([...p.hand, ...p.deck, ...p.discard].sort())
        .toEqual(startingDeck(p.strategy).sort());
    }
    expect(g.players[0].hand).toHaveLength(OPENING_HAND + 1); // +1 = turn draw
    expect(g.players.slice(1).every((p) => p.hand.length === OPENING_HAND))
      .toBe(true);
    // opening hands are dealt silently: only the turn draw is logged
    expect(g.log.filter((e) => e.type === "draw")).toHaveLength(1);
  });

  it("pickFaction refuses a faction id off the roster", () => {
    const g = chooseBuild(startGame(newGame(FACTIONS)), "warpath", seededRng(1));
    expect(pickFaction(g, "atlantis", seededRng(1))).toBe(g);
  });

  it("the human seat plays the chosen build; AI builds are rolled seeded", () => {
    const at = (seed: number) =>
      pickFaction(
        chooseBuild(startGame(newGame(FACTIONS)), "pestilence", seededRng(1)),
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
    expect(after.defense.alpha).toBe(FIXTURE_MAX - RAID_DAMAGE);
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
      .toBe(FIXTURE_MAX - (RAID_DAMAGE + 50));
  });

  it("cashes the whole omens stack at declaration: x2 for one reading, x4 for two", () => {
    const base = withHand(playingState(), 0, ["raid"]);

    const one = playCard({ ...base, omens: { beta: 1 } }, 0, rng(), "alpha");
    expect(one.log.find((e) => e.type === "play")?.readings).toBe(1);
    expect(one.omens.beta).toBeUndefined(); // spent whole, at declaration
    expect(landMarches(one).defense.alpha)
      .toBe(FIXTURE_MAX - RAID_DAMAGE * 2);

    const two = landMarches(
      playCard({ ...base, omens: { beta: 2 } }, 0, rng(), "alpha"),
    );
    expect(two.defense.alpha).toBe(FIXTURE_MAX - RAID_DAMAGE * 4);
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
    expect(after.defense.gamma).toBe(FIXTURE_MAX - RAID_DAMAGE);
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
    expect(after.defense.alpha).toBe(FIXTURE_MAX - 6);
    expect(after.defense.beta).toBeUndefined();
    expect(after.log.find((e) => e.type === "march-resolved")).toMatchObject({
      type: "march-resolved", targetFactionId: "alpha", sourceFactionId: "beta",
      amount: 6, clash: { incoming: 10, counter: 4 },
    });
  });

  it("throws the leftover back onto the attacker when the counter is stronger", () => {
    const after = landMarches(facingRaids(4, 10));
    expect(after.defense.beta).toBe(FIXTURE_MAX - 6);
    expect(after.defense.alpha).toBeUndefined();
    expect(after.log.find((e) => e.type === "march-resolved")).toMatchObject({
      type: "march-resolved", targetFactionId: "beta", sourceFactionId: "alpha",
      amount: 6, clash: { incoming: 10, counter: 4 },
    });
  });

  it("cancels an even clash, moving no score but still reporting it", () => {
    const after = landMarches(facingRaids(5, 5));
    expect(after.defense).toEqual({});
    expect(after.marches).toEqual({});
    // A line without an `amount`: nothing moved, but two armies met and both
    // are spent, and a player whose raid was answered exactly must not be
    // left thinking their card did nothing.
    const line = after.log.find((e) => e.type === "march-resolved")!;
    expect(line).toMatchObject({ clash: { incoming: 5, counter: 5 } });
    expect(line.amount).toBeUndefined();
  });

  it("reports nothing for a march that met no counter and hit a dead land", () => {
    // The other zero: one side only, aimed at a polygon already at 0. Nothing
    // met it and nothing moved, so there is no clash to report - the standoff
    // line above exists because two armies were spent, and here only one was.
    const declared = playCard(
      withHand(playingState(LINE_ADJ), 0, ["raid"]), 0, rng(), "alpha",
    );
    const after = landMarches({ ...declared, defense: { alpha: 0 } });
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
    // At FIXTURE_MAX every land already fields many armies at once; shrink
    // beta's own ceiling to exactly one army's worth so a single raid can
    // actually exhaust it.
    g = { ...g, defenseMax: { ...g.defenseMax, beta: 3 } };
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
    expect(after.defense.alpha).toBe(FIXTURE_MAX - each);
    expect(after.defense.gamma).toBe(FIXTURE_MAX - each);
  });
});

describe("prosperous-proliferation", () => {
  it("grows a land's ceiling and heals it to match, leaving the deck instead of discarding", () => {
    let g = withHand(playingState(), 0, ["prosperous-proliferation"]);
    g = { ...g, defense: { beta: FIXTURE_MAX - 5 } }; // damaged, so the heal moves something
    const before = g.log.length;
    const after = playCard(g, 0, rng(), "beta");
    expect(after.defenseMax.beta).toBe(FIXTURE_MAX + LAND_GROWTH);
    expect(after.defense.beta).toBe(FIXTURE_MAX - 5 + LAND_GROWTH);
    // Gone for good: the discard is where a card waits to be reshuffled back,
    // and a ceiling raised twice off one pick is the compounding this
    // prevents.
    expect(after.players[0].discard).not.toContain("prosperous-proliferation");
    expect(pilesOf(after, "beta")).not.toContain("prosperous-proliferation");
    expect(fresh(after, before).map((e) => e.type)).toEqual(["play", "healed"]);
  });

  it("grows a land already at full defense without a heal nobody sees move", () => {
    const g = withHand(playingState(), 0, ["prosperous-proliferation"]);
    const after = playCard(g, 0, rng(), "beta");
    expect(after.defenseMax.beta).toBe(FIXTURE_MAX + LAND_GROWTH);
    // Absent means "at max" for both defense and its new ceiling at once, so
    // an undamaged land grows without a heal event to log.
    expect(after.defense.beta).toBeUndefined();
    expect(after.log.some((e) => e.type === "healed")).toBe(false);
  });

  it("aims only inward - a rival's land is no place to grow", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["prosperous-proliferation"]);
    expect(validTargetsFor(viewOf(g), "beta", "prosperous-proliferation"))
      .toEqual(["beta"]);
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
      .toBe(FIXTURE_MAX - 2 * PLAGUE_DAMAGE_PER_STACK);
    expect(after.defense.gamma)
      .toBe(FIXTURE_MAX - PLAGUE_DAMAGE_PER_STACK);
    expect(after.disease).toEqual({ gamma: { delta: 1 } });
    const plagued = fresh(after, before).filter((e) => e.type === "plagued");
    expect(plagued.map((e) => [e.targetFactionId, e.amount])).toEqual([
      ["alpha", 2 * PLAGUE_DAMAGE_PER_STACK], ["gamma", 1 * PLAGUE_DAMAGE_PER_STACK],
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
      .toBe(FIXTURE_MAX - 2 * PLAGUE_DAMAGE_PER_STACK * 2);
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
  it("hillfort restores HILLFORT_HEAL to one realm polygon, capped at its max", () => {
    const g = withHand(
      { ...playingState(), defense: { beta: FIXTURE_MAX - HILLFORT_HEAL } },
      0, ["hillfort"],
    );
    const after = playCard(g, 0, rng(), "beta");
    expect(after.defense.beta).toBeUndefined(); // back at max: key deleted
    expect(after.log.at(-1)).toMatchObject({
      type: "healed", cardId: "hillfort", targetFactionId: "beta",
      amount: HILLFORT_HEAL,
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

  it("fortify heals the one land it is aimed at, capped, whatever the omens", () => {
    let g: GameState = { ...playingState(), defense: { beta: 30 } };
    g = withHand(g, 0, ["fortify"]);
    const healed = playCard(g, 0, rng(), "beta");
    // A flat heal: it no longer reads the omens stack at all, which is what
    // made it a dead card in a hand holding no readings.
    expect(healed.defense.beta).toBe(30 + FORTIFY_HEAL);
    expect(healed.log.at(-1)).toMatchObject({
      type: "healed", cardId: "fortify", targetFactionId: "beta",
      amount: FORTIFY_HEAL,
    });

    // Capped at max, like every other heal.
    let capped: GameState = { ...playingState(), defense: { beta: 59 } };
    capped = withHand(capped, 0, ["fortify"]);
    expect(playCard(capped, 0, rng(), "beta").defense.beta).toBeUndefined();
  });

  it("fortify aims inward, and never at a land already at full defense", () => {
    const g = { ...playingState(), defense: { beta: 30 } };
    // Own realm only - the whole point of the card is that it is not an
    // attack, and alpha is a rival.
    expect(validTargetsFor(viewOf(g), "beta", "fortify")).toEqual(["beta"]);
    // Nothing to restore, so nothing to aim at, so the card is dead in hand -
    // the same rule Hillfort keeps.
    expect(cardBlockReason(viewOf(playingState()), "beta", "fortify"))
      .toEqual({ code: "no-target" });
  });
});

describe("subjugate", () => {
  // Subjugate is DECLARED, the same shape a Raid takes: playCard registers a
  // Claim and it lands only at the actor's next turn (landMarches), where the
  // gate is checked again against whatever the target's defense has become
  // by then.
  it("is legal at exactly the 25% line and refused one point above it", () => {
    const open = withHand(
      { ...playingState(), defense: { alpha: SUBJUGATE_LINE } },
      0, ["subjugate"],
    );
    const after = landMarches(playCard(open, 0, rng(), "alpha"));
    expect(after.overlords.get("alpha")).toBe("beta");

    const closed = withHand(
      { ...playingState(), defense: { alpha: SUBJUGATE_LINE + 1 } },
      0, ["subjugate"],
    );
    expect(playCard(closed, 0, rng(), "alpha")).toBe(closed);
  });

  it("stores the overlord, injects the tribute card, logs", () => {
    // SIX, not the four-faction roster: half of four is two, so beta taking
    // one vassal would win the run and the log would end on `victory`.
    const g = withHand(
      { ...playingSix(), defense: { alpha: 0 } }, 0, ["subjugate"],
    );
    const declared = playCard(g, 0, rng(), "alpha");
    const before = declared.log.length;
    const after = landMarches(declared);
    expect(after.overlords.get("alpha")).toBe("beta");
    expect(pilesOf(after, "alpha").filter(isTributeCard)).toHaveLength(1);
    // Not the log's last line: the claim lands before the turn's own draw.
    const subjugated = fresh(after, before).find((e) => e.type === "subjugated");
    expect(subjugated).toMatchObject({
      type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta",
    });
    expect(subjugated?.formerOverlordFactionId).toBeUndefined();
    expect(g.overlords.size).toBe(0); // input untouched
  });

  it("poaching records the former lord and grants the target no respite", () => {
    let g = playingSix();
    g = {
      ...g,
      overlords: new Map([["alpha", "gamma"]]),
      defense: { alpha: 0 },
    };
    g = withHand(g, 0, ["subjugate"]);
    const declared = playCard(g, 0, rng(), "alpha");
    const before = declared.log.length;
    const after = landMarches(declared);
    expect(after.overlords.get("alpha")).toBe("beta");
    const subjugated = fresh(after, before).find((e) => e.type === "subjugated");
    expect(subjugated?.formerOverlordFactionId).toBe("gamma");
    expect(after.respites.alpha).toBeUndefined(); // poached, not escaped
  });

  it("taking a lord takes its whole pyramid, releasing nobody", () => {
    // The ten-faction roster: beta + alpha + delta is 3 lands, below its win
    // size of 5, so the pyramid landing cannot tip the phase.
    let g = playingTen();
    g = {
      ...g,
      overlords: new Map([["delta", "alpha"]]),
      defense: { alpha: 0 },
    };
    g = withHand(g, 0, ["subjugate"]);
    const after = landMarches(playCard(g, 0, rng(), "alpha"));
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
    // TEN, because the incorporate realm gate is a flat 4 and victory is half
    // the map: on any smaller roster the realm that opens the gate has
    // already won, and the play would log `victory` instead of a digest.
    let g = playingTen();
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
   *  (1 per land of the payer's own realm) is 2. On the ten-faction roster,
   *  because the lord's realm counts the vassal's annexation: alpha stands
   *  at three lands, and on any smaller roster that is the win line, so
   *  every play here would end as `unified` instead of as tribute. */
  function owing(wealth: Record<string, number>): GameState {
    let g = playingTen();
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
      { ...playingState(), turnips: { beta: FIXTURE_TURNIP_THRESHOLD - 2 } },
      0, ["grow-crops"],
    );
    const after = playCard(g, 0, rng());
    expect(after.turnips.beta).toBe(FIXTURE_TURNIP_THRESHOLD - 1);
    expect(after.log.some((e) => e.type === "harvest-earned")).toBe(false);
    expect(pilesOf(after, "beta")).not.toContain("turnip-harvest");
  });

  it("crossing the bar: reset, injection, harvest-earned", () => {
    const g = withHand(
      { ...playingState(), turnips: { beta: FIXTURE_TURNIP_THRESHOLD - 1 } },
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

  it("every seat counts: an AI seat crossing the bar earns its harvest too", () => {
    let g = playingState();
    g = {
      ...g,
      current: 1, playedThisTurn: false,
      turnips: { alpha: FIXTURE_TURNIP_THRESHOLD - 1 },
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
      harvest: { kind: "build", cardId: "war-council" },
    });
    expect(after.players[0].deck).toContain("war-council");
    expect(after.log.at(-1)).toMatchObject({
      type: "harvest-picked", cardId: "war-council", consequence: true,
    });
  });

  it("a skip keeps the deck lean and logs no pick", () => {
    const g = withHand(playingState(), 0, ["turnip-harvest"]);
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { kind: "skip" },
    });
    expect(after.players[0].deck.sort()).toEqual(g.players[0].deck.sort());
    expect(after.log.some((e) => e.type === "harvest-picked")).toBe(false);
    expect(after.players[0].discard).toContain("turnip-harvest"); // still spent
  });

  it("a choiceless play never re-offers a build card already at its cap", () => {
    // foul-winds is capped at one copy; with one already in the deck the
    // choiceless pick has to skip it even though it sits in the seat's own
    // build and every other pestilence card outranks nothing there.
    let g = playingState();
    g = {
      ...g,
      players: g.players.map((pl, i) =>
        i === 0 ? { ...pl, strategy: "pestilence", deck: [...pl.deck, "foul-winds"] } : pl,
      ),
    };
    g = withHand(g, 0, ["turnip-harvest"]);
    const after = playCard(g, 0, rng());
    const picked = after.log.find((e) => e.type === "harvest-picked");
    expect(picked).toMatchObject({ cardId: "plague" });
    expect(
      after.players[0].deck.filter((c) => c === "foul-winds"),
    ).toHaveLength(1);
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

describe("a card that plays again", () => {
  /** Six lands in a line: alpha - beta - gamma - delta - epsilon - zeta. */
  const LINE_SIX: Record<string, string[]> = {
    alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta", "delta"],
    delta: ["gamma", "epsilon"], epsilon: ["delta", "zeta"], zeta: ["epsilon"],
  };

  /** Two lands with ONE army each, and two Raids in hand. beta can only reach
   *  alpha and its vassal gamma only delta, so the two raids come out of
   *  different lands.
   *
   *  Six factions rather than four because a realm of two wins a four-land
   *  map outright, and a play that ends the run answers no question about
   *  what the next play may do. The army counts are explicit for the opposite
   *  reason: a FIXTURE_MAX land musters twenty, and a rule about running out
   *  of armies cannot be tested on lands that never do. */
  function twoArmies(): GameState {
    const g = pickFaction(
      chooseBuild(
        startGame(newGame(SIX, LINE_SIX, {}, undefined, maxes(SIX))),
        "warpath", seededRng(1),
      ),
      "beta", seededRng(1),
    );
    return withHand(
      {
        ...g,
        overlords: new Map([["gamma", "beta"]]),
        armies: { beta: 1, gamma: 1 },
      },
      0, ["raid", "raid", "fortify"],
    );
  }

  it("leaves the turn open for another copy of itself", () => {
    const after = playCard(twoArmies(), 0, rng(), "alpha");
    expect(after.playedThisTurn).toBe(true);
    expect(after.repeatCardId).toBe("raid");
  });

  it("accepts the second copy even though the turn is spent", () => {
    const first = playCard(twoArmies(), 0, rng(), "alpha");
    const second = playCard(first, 0, rng(), "delta");
    expect(Object.values(second.marches)).toHaveLength(2);
  });

  it("refuses every OTHER card once the turn is spent", () => {
    // Fortify is legal on its own terms on a damaged land, so what refuses it
    // afterwards is the spent turn rather than the card's own rule.
    const g = { ...twoArmies(), defense: { beta: 10 } };
    expect(playCard(g, 2, rng(), "beta")).not.toBe(g);
    const first = playCard(g, 0, rng(), "alpha");
    const fortifyIndex = first.players[0].hand.indexOf("fortify");
    expect(playCard(first, fortifyIndex, rng(), "beta")).toBe(first);
  });

  it("stops when the armies run out, not at a count of plays", () => {
    // One land, one army: the second Raid has nowhere to march out of.
    const g = withHand(
      { ...playingState(), armies: { beta: 1 } }, 0, ["raid", "raid"],
    );
    const first = playCard(g, 0, rng(), "alpha");
    expect(validTargetsFor(viewOf(first), "beta", "raid")).toEqual([]);
    expect(playCard(first, 0, rng(), "alpha")).toBe(first);
  });

  it("clears at the next turn start", () => {
    const first = playCard(twoArmies(), 0, rng(), "alpha");
    expect(beginTurn({ ...first, turn: first.turn + 1 }, rng()).repeatCardId)
      .toBeNull();
  });

  it("a card that declares nothing closes the turn, as every card always has", () => {
    const g = withHand(
      { ...playingState(LINE_ADJ), defense: { beta: 10 } }, 0,
      ["fortify", "raid"],
    );
    const after = playCard(g, 0, rng(), "beta");
    expect(after.playedThisTurn).toBe(true);
    expect(after.repeatCardId).toBeNull();
    expect(playCard(after, 0, rng(), "alpha")).toBe(after);
  });

  it("is the declaration that re-opens the turn, not the card's name", () => {
    // Nothing about Fortify is a raid. Declaring it a plays-again card for
    // this one test is the point: the rule is the field, and no branch
    // anywhere asks whether the card is a Raid.
    const def = CARDS.fortify;
    CARDS.fortify = { ...def, playsAgain: true };
    try {
      const g = withHand(
        { ...playingState(LINE_ADJ), defense: { beta: 10 } }, 0,
        ["fortify", "fortify"],
      );
      const first = playCard(g, 0, rng(), "beta");
      expect(first.repeatCardId).toBe("fortify");
      expect(playCard(first, 0, rng(), "beta").defense.beta)
        .toBe(10 + 2 * FORTIFY_HEAL);
    } finally {
      CARDS.fortify = def;
    }
  });

  it("a turn closed by a discard or by endTurn stays closed", () => {
    // Only a play re-opens a turn. Ending one does not, or End turn under
    // unlimited rules would hand back a turn the player just gave up.
    const g = withHand(unlimitedPlaying(LINE_ADJ), 0, ["raid", "raid"]);
    const played = playCard(g, 0, rng(), "alpha");
    expect(played.repeatCardId).toBe("raid");
    expect(endTurn(played).repeatCardId).toBeNull();
    const dead = discardCard(withHand(playingState(), 0, ["subjugate"]), 0);
    expect(dead.repeatCardId).toBeNull();
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

  it("does not close itself when the last card is played - only endTurn does", () => {
    // A turn that ended itself the moment the last card left would hand the
    // round over while the player was still reading what their play did.
    let g = unlimitedPlaying();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.players[0].hand).toHaveLength(0);
    expect(g.playedThisTurn).toBe(false);
    expect(advance(g, seededRng(3))).toBe(g); // still not complete
    expect(endTurn(g).playedThisTurn).toBe(true);
  });

  it("endTurn is a no-op under standard rules and on a closed turn", () => {
    const standard = playingState();
    expect(endTurn(standard)).toBe(standard);
    let g = unlimitedPlaying();
    g = endTurn(g);
    expect(endTurn(g)).toBe(g);
  });

  it("discards a dead hand under unlimited turns too - the discard is unconditional now", () => {
    let g = unlimitedPlaying();
    g = withHand(g, 0, ["subjugate"]); // every gate closed: dead hand
    expect(playCard(g, 0, rng(), "alpha")).toBe(g); // still not a legal target
    const after = discardCard(g, 0);
    expect(after.players[0].hand).toHaveLength(0);
    expect(after.players[0].discard).toContain("subjugate");
    expect(after.playedThisTurn).toBe(true);
    // endTurn is still a second way out, dead card and all.
    expect(endTurn(g).players[0].hand).toEqual(["subjugate"]);
    expect(endTurn(g).playedThisTurn).toBe(true);
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

describe("a dead hand under unlimited turns", () => {
  /** Unlimited turns, a hand of cards none of which can be played: five
   *  Fortify with the whole realm at full defense. The hand refills to 4 at
   *  turn start, so nothing leaves it on its own - without a discard the seat
   *  holds the same dead four for the rest of the game and every turn after
   *  this one is silent. */
  function stuck(): GameState {
    const g = unlimitedPlaying();
    return withHand(g, 0, ["fortify", "fortify", "fortify", "fortify"]);
  }

  it("offers the discard rather than leaving the turn with nothing to do", () => {
    const set = playableSet(viewOf(stuck()), "beta", stuck().players[0].hand);
    expect(set.mode).toBe("discard");
  });

  it("lets the card actually go, and logs it", () => {
    const g = stuck();
    const after = discardCard(g, 0);
    expect(after.players[0].hand).toHaveLength(3);
    expect(after.players[0].discard).toContain("fortify");
    expect(after.log.at(-1)).toMatchObject({ type: "discard", cardId: "fortify" });
  });
});

describe("the hand sweep", () => {
  const sweeping = (g: GameState): GameState =>
    ({ ...g, rules: { ...g.rules, hand: "sweep" } });

  it("discards what is left in hand when the turn moves on", () => {
    const g = withHand(sweeping(playingState()), 0, ["grow-crops", "fortify", "raid"]);
    const played = playCard(g, 0, rng());
    const after = advance(played, rng());
    const beta = after.players.find((p) => p.factionId === "beta")!;
    expect(beta.hand).toEqual([]);
    // The played card and the two swept ones all land in the discard.
    expect(beta.discard).toEqual(
      expect.arrayContaining(["grow-crops", "fortify", "raid"]),
    );
  });

  it("keeps the hand when the rules say to", () => {
    const g = withHand(playingState(), 0, ["grow-crops", "fortify", "raid"]);
    const after = advance(playCard(g, 0, rng()), rng());
    const beta = after.players.find((p) => p.factionId === "beta")!;
    expect(beta.hand).toEqual(["fortify", "raid"]);
  });

  it("sweeps the seat whose turn ended, not the one whose turn begins", () => {
    const g = withHand(sweeping(playingState()), 1, ["fortify", "raid"]);
    const played = playCard(withHand(g, 0, ["grow-crops"]), 0, rng());
    const after = advance(played, rng());
    const alpha = after.players.find((p) => p.factionId === "alpha")!;
    expect(alpha.hand).toEqual(expect.arrayContaining(["fortify", "raid"]));
  });
});

describe("who acts", () => {
  /** A ring of twenty: each land borders the next, so the spacing rule has
   *  real work, and there is room for five apart from each other. A ring of
   *  ten would not be - a 10-cycle has exactly one five-land independent set,
   *  and greedy placement is not meant to search for it. */
  const RING = [
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j",
    "k", "l", "m", "n", "o", "p", "q", "r", "s", "t",
  ];
  const ringAdj = Object.fromEntries(
    RING.map((id, i) => [
      id, [RING[(i + 1) % RING.length], RING[(i + RING.length - 1) % RING.length]],
    ]),
  );
  const deal = (seed: number, opts?: { reservedFactionIds?: string[] }) =>
    pickFaction(
      chooseBuild(startGame(newGame(RING, ringAdj)), "warpath", seededRng(1)),
      "a", seededRng(seed), opts,
    );
  const acting = (g: GameState): string[] =>
    g.players.map((p) => p.factionId).filter((f) => playsTurns(g.passives, f));

  it("still deals every faction a seat and a deck", () => {
    const g = deal(1);
    expect(g.players).toHaveLength(RING.length);
    for (const p of g.players) {
      expect(p.deck.length + p.hand.length).toBeGreaterThan(0);
    }
  });

  it("lets exactly five of them act, the human first", () => {
    const g = deal(1);
    expect(acting(g)).toHaveLength(MAX_ACTIVE);
    expect(acting(g)[0]).toBe("a");
  });

  it("never lets two acting factions border each other", () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      const homes = acting(deal(seed));
      for (const home of homes) {
        for (const other of homes) {
          if (home === other) continue;
          expect(ringAdj[home], `seed ${seed}`).not.toContain(other);
        }
      }
    }
  });

  it("picks the same five twice from the same seed", () => {
    expect(acting(deal(5))).toEqual(acting(deal(5)));
  });

  it("lets a reserved pick act", () => {
    expect(acting(deal(4, { reservedFactionIds: ["f"] }))).toContain("f");
  });

  it("seats the table anyway on a map with no room to spread out", () => {
    // A ring of five wanting five: every candidate borders one already
    // chosen, so the spacing pass finds nothing and the fallback fills the
    // table. Placement never failing outranks placement being pretty.
    const TIGHT = ["a", "b", "c", "d", "e"];
    const tightAdj = Object.fromEntries(
      TIGHT.map((id, i) => [
        id,
        [TIGHT[(i + 1) % TIGHT.length], TIGHT[(i + TIGHT.length - 1) % TIGHT.length]],
      ]),
    );
    const g = pickFaction(
      chooseBuild(startGame(newGame(TIGHT, tightAdj)), "warpath", seededRng(1)),
      "a", seededRng(1),
    );
    expect(acting(g)).toHaveLength(MAX_ACTIVE);
  });

  it("lets everybody act when the map is smaller than the table", () => {
    const g = pickFaction(
      chooseBuild(startGame(newGame(["a", "b", "c"])), "warpath", seededRng(1)),
      "a", seededRng(1),
    );
    expect(acting(g)).toHaveLength(3);
  });

  it("skips a quiet seat when the turn moves on", () => {
    const g = deal(1);
    const next = advance({ ...g, playedThisTurn: true }, seededRng(1));
    expect(playsTurns(next.passives, next.players[next.current].factionId)).toBe(true);
    expect(next.current).not.toBe(0);
  });
});

describe("the ground under the faction picker", () => {
  /** Real land ids, because the terrain tables name the shipped map and this
   *  is a question about what the shipped map's picker can say. More lands
   *  than MAX_ACTIVE, so somebody ends up quiet. */
  const GROUND = [
    "lietuva", "selonians", "jersikans", "sakalans",
    "ugandians", "talavians", "dainavians", "osilians",
  ];
  const built = (seed: number): GameState =>
    chooseBuild(startGame(newGame(GROUND)), "warpath", seededRng(seed));

  it("rolls the ground before the faction is picked", () => {
    const g = built(1);
    expect(g.phase).toBe("pick-faction");
    // Something for the picker's hover to read whatever the roll did: the
    // burden is named rather than rolled.
    expect(hasPassive(g.passives, "lietuva", "burden-of-bureaucracy")).toBe(true);
    // And nothing that turns on who acts, because nobody has picked yet.
    for (const carried of Object.values(g.passives)) {
      for (const id of QUIET_PASSIVES) expect(carried).not.toContain(id);
    }
  });

  it("rolls the same ground twice from the same seed", () => {
    expect(built(4).passives).toEqual(built(4).passives);
  });

  it("adds the quiet set when the seats are dealt, and keeps the ground", () => {
    const before = built(1);
    const g = pickFaction(before, "lietuva", seededRng(1));
    const quiet = GROUND.filter((id) => !playsTurns(g.passives, id));
    expect(quiet.length).toBeGreaterThan(0);
    // The map the player picked off does not change under the pick.
    for (const land of GROUND) {
      for (const id of passivesOn(before.passives, land)) {
        expect(passivesOn(g.passives, land), land).toContain(id);
      }
    }
  });
});

describe("a claim in flight", () => {
  /** beta demands alpha's fealty with alpha's defenses at 0. */
  function declared(): GameState {
    const g = withHand(
      { ...playingSix(), defense: { alpha: 0 } }, 0, ["subjugate"],
    );
    return playCard(g, 0, rng(), "alpha");
  }

  it("changes nothing when it is played - it is a demand made a turn ahead", () => {
    const g = declared();
    expect(g.overlords.size).toBe(0);
    expect(g.claims["beta>alpha"]).toMatchObject({
      actor: "beta", from: "beta", to: "alpha",
    });
    expect(g.log.some((e) => e.type === "subjugated")).toBe(false);
  });

  it("answers at the ACTOR's next turn, not at whoever's turn comes round", () => {
    const g = declared();
    // Another seat's turn beginning, and the clock moved: still not beta's
    // demand to answer.
    const elsewhere = beginTurn({ ...g, current: 1, turn: g.turn + 1 }, rng());
    expect(elsewhere.overlords.size).toBe(0);
    expect(elsewhere.claims["beta>alpha"]).toBeDefined();

    const landed = landMarches(g);
    expect(landed.overlords.get("alpha")).toBe("beta");
    expect(landed.claims["beta>alpha"]).toBeUndefined();
  });

  it("lapses when it finds the gate closed, and takes nothing", () => {
    const g = declared();
    // alpha put its defenses back over the line while the demand was in the
    // air - the whole point of declaring it a turn ahead.
    const repaired = { ...g, defense: { alpha: SUBJUGATE_LINE + 1 } };
    const before = repaired.log.length;
    const after = landMarches(repaired);
    expect(after.overlords.size).toBe(0);
    expect(after.claims["beta>alpha"]).toBeUndefined();
    expect(fresh(after, before)).toContainEqual(expect.objectContaining({
      type: "march-lapsed", cardId: "subjugate", targetFactionId: "alpha",
      sourceFactionId: "beta",
    }));
  });

  it("lapses when the land is already the actor's own", () => {
    // Still broken, but it answers to beta now: there is no fealty left to
    // demand, and a second `subjugated` line would say it changed hands twice.
    const g = declared();
    const after = landMarches({
      ...g, overlords: new Map([["alpha", "beta"]]),
    });
    expect(after.claims["beta>alpha"]).toBeUndefined();
    expect(after.log.filter((e) => e.type === "subjugated")).toHaveLength(0);
    expect(after.log.some(
      (e) => e.type === "march-lapsed" && e.cardId === "subjugate",
    )).toBe(true);
  });

  it("lapses against a land that escaped into its respite while it flew", () => {
    const g = declared();
    const after = landMarches({
      ...g, respites: { alpha: g.turn + ESCAPE_RESPITE_TURNS },
    });
    expect(after.overlords.size).toBe(0);
    expect(after.claims["beta>alpha"]).toBeUndefined();
    expect(after.log.some(
      (e) => e.type === "march-lapsed" && e.cardId === "subjugate",
    )).toBe(true);
  });

  it("is broken by an army marching at the same land - by anyone else", () => {
    // A land being fought over is a land not submitting to anybody, which is
    // what makes a raid an answer to a Subjugate rather than a race beside it.
    let g = playingSix();
    g = {
      ...g,
      defense: { alpha: 0 },
      claims: {
        "gamma>alpha": {
          actor: "gamma", from: "gamma", to: "alpha", expiry: g.turn + 1,
        },
      },
    };
    const before = g.log.length;
    const after = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), "alpha", { sourceId: "beta" },
    );
    expect(after.claims["gamma>alpha"]).toBeUndefined();
    expect(fresh(after, before)).toContainEqual(expect.objectContaining({
      type: "march-lapsed", cardId: "subjugate", targetFactionId: "alpha",
      sourceFactionId: "gamma",
    }));
  });

  it("survives its own actor's raid at the same land", () => {
    // Otherwise Subjugate and Raid would refuse to be played together.
    let g = playingSix();
    g = {
      ...g,
      defense: { alpha: 0 },
      claims: {
        "beta>alpha": {
          actor: "beta", from: "beta", to: "alpha", expiry: g.turn + 1,
        },
      },
    };
    const after = playCard(
      withHand(g, 0, ["raid"]), 0, rng(), "alpha", { sourceId: "beta" },
    );
    expect(after.claims["beta>alpha"]).toBeDefined();
  });
});

describe("an army walking into a broken land", () => {
  it("takes it - two raids on one land need no Subjugate between them", () => {
    let g = playingSix();
    g = withHand({ ...g, defense: { alpha: 0 } }, 0, ["raid"]);
    const declaredRaid = playCard(g, 0, rng(), "alpha", { sourceId: "beta" });
    const before = declaredRaid.log.length;
    const after = landMarches(declaredRaid);
    expect(after.overlords.get("alpha")).toBe("beta");
    expect(fresh(after, before)).toContainEqual(expect.objectContaining({
      type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta",
    }));
    // Nothing was damaged: there was nothing left to damage.
    expect(after.log.some(
      (e) => e.type === "march-resolved" && e.targetFactionId === "alpha",
    )).toBe(false);
  });

  it("wakes the land up - a conquest is a vassal with turns and a deck", () => {
    let g = playingSix();
    g = {
      ...g,
      defense: { alpha: 0 },
      passives: { alpha: ["keeps-to-itself", "wild-lands", "hill-country"] },
    };
    const after = landMarches(
      playCard(withHand(g, 0, ["raid"]), 0, rng(), "alpha", { sourceId: "beta" }),
    );
    expect(playsTurns(after.passives, "alpha")).toBe(true);
    expect(hasPassive(after.passives, "alpha", "wild-lands")).toBe(false);
    // The ground stays: it was never about who held the land.
    expect(hasPassive(after.passives, "alpha", "hill-country")).toBe(true);
    expect(pilesOf(after, "alpha").filter(isTributeCard)).toHaveLength(1);
  });

  it("takes nothing for a faction with no leader - a raid is not a conquest", () => {
    // The grey middle raids, and without this it quietly ate itself: lands
    // with no chief to answer for them ended up holding vassals.
    const g = playingSix();
    const leaderless = g.factionIds.filter((f) => !hasRuler(g.rulers, f));
    expect(leaderless.length).toBeGreaterThan(0);
    const raider = leaderless[0];
    const target = g.factionIds.find(
      (f) => f !== raider && hasRuler(g.rulers, f),
    )!;
    const armed: GameState = {
      ...g,
      current: 0,
      defense: { [target]: 0 },
      marches: {
        [`${raider}>${target}#0`]: {
          actor: raider, from: raider, to: target, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: g.turn,
        },
      },
    };
    const after = beginTurn(armed, rng());
    expect(after.marches[`${raider}>${target}#0`]).toBeUndefined();
    expect(after.overlords.get(target)).toBeUndefined();
    expect(after.log.some((e) => e.type === "subjugated")).toBe(false);
  });
});

describe("the defense transfer", () => {
  /** The human's own capture leaves the question pending; an AI's does not. */
  function captured(): GameState {
    const g = withHand(
      { ...playingSix(), defense: { alpha: 0, beta: 40 } }, 0, ["raid"],
    );
    return landMarches(playCard(g, 0, rng(), "alpha", { sourceId: "beta" }));
  }

  it("asks the human, and answers nothing until they say", () => {
    const after = captured();
    expect(after.pendingTransfer).toEqual({ from: "beta", to: "alpha" });
    expect(after.defense.alpha).toBe(0);
    expect(after.defense.beta).toBe(40);
  });

  it("moves the points the player names and clears the question", () => {
    const g = captured();
    const after = transferDefense(g, 10);
    expect(after.defense.beta).toBe(30);
    expect(after.defense.alpha).toBe(10);
    expect(after.pendingTransfer).toBeNull();
    expect(after.log.at(-1)).toMatchObject({
      type: "transferred", targetFactionId: "alpha", sourceFactionId: "beta",
      amount: 10,
    });
  });

  it("clamps to what the origin holds", () => {
    const g = captured();
    expect(transferLimit(g, "beta", "alpha")).toBe(40);
    const after = transferDefense(g, 9999);
    expect(after.defense.beta).toBe(0);
    expect(after.defense.alpha).toBe(40);
    expect(after.log.at(-1)).toMatchObject({ type: "transferred", amount: 40 });
  });

  it("clamps to the room the destination has - points past a ceiling would vanish", () => {
    const g = { ...captured(), defense: { alpha: FIXTURE_MAX - 5, beta: 40 } };
    expect(transferLimit(g, "beta", "alpha")).toBe(5);
    const after = transferDefense(g, 40);
    expect(after.defense.beta).toBe(35);
    // A land back at its ceiling drops its key, the pristine convention.
    expect(after.defense.alpha).toBeUndefined();
  });

  it("0 is a real answer: the question closes and nothing moves", () => {
    const g = captured();
    const before = g.log.length;
    const after = transferDefense(g, 0);
    expect(after.pendingTransfer).toBeNull();
    expect(after.defense.beta).toBe(40);
    expect(fresh(after, before)).toEqual([]);
  });

  it("does nothing at all when no capture is waiting on an answer", () => {
    const g = playingSix();
    expect(transferDefense(g, 10)).toBe(g);
  });

  it("a seat nobody can ask moves half of what the origin holds", () => {
    // Deterministic - no rng - so an AI seat's conquest replays identically.
    const g = { ...playingSix(), defense: { alpha: 0, beta: 41 } };
    expect(autoTransfer(g, "beta", "alpha")).toBe(20);
    // And still clamped by the destination's room.
    const tight = { ...g, defense: { alpha: FIXTURE_MAX - 3, beta: 41 } };
    expect(autoTransfer(tight, "beta", "alpha")).toBe(3);
  });

  it("moves it on the spot for an AI capture, with no question left over", () => {
    const base = playingSix();
    // An acting seat that is not the human's: it cannot be asked, so it
    // decides for itself.
    const raider = base.factionIds.find(
      (f) => f !== "beta" && hasRuler(base.rulers, f),
    )!;
    const target = base.factionIds.find((f) => f !== "beta" && f !== raider)!;
    const g: GameState = {
      ...base,
      current: base.players.findIndex((p) => p.factionId === raider),
      defense: { [target]: 0, [raider]: 40 },
      marches: {
        [`${raider}>${target}#0`]: {
          actor: raider, from: raider, to: target, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn,
        },
      },
    };
    const after = beginTurn(g, rng());
    expect(after.overlords.get(target)).toBe(raider);
    expect(after.pendingTransfer).toBeNull();
    expect(after.defense[raider]).toBe(20);
    expect(after.defense[target]).toBe(20);
  });
});

describe("the restless middle of the map", () => {
  /** Every roll comes up, so the raid that happens about one round in four
   *  happens here. */
  const always = () => 0;

  function quietLands(g: GameState): string[] {
    return g.factionIds.filter(
      (f) => hasPassive(g.passives, f, "keeps-to-itself"),
    );
  }

  it("sends a raid out of a land that takes no turns, at the round wrap", () => {
    const g = playingSix();
    const quiet = quietLands(g);
    expect(quiet.length).toBeGreaterThan(0);
    const before = g.log.length;
    const after = beginTurn({ ...g, current: 0, turn: g.turn + 1 }, always);
    const arrows = Object.values(after.marches)
      .filter((m) => quiet.includes(m.actor));
    expect(arrows).toHaveLength(quiet.length);
    for (const arrow of arrows) {
      expect(arrow.from).toBe(arrow.actor);
      expect(arrow.cardId).toBe("raid");
      expect(arrow.expiry).toBe(after.turn + 1);
    }
    // Logged as the play it reads as on the map, and out of nobody's deck.
    const declaredBy = fresh(after, before).filter(
      (e) => e.type === "play" && e.cardId === "raid" &&
        quiet.includes(e.sourceFactionId ?? ""),
    );
    expect(declaredBy).toHaveLength(quiet.length);
  });

  it("never sends one out of a land somebody has taken", () => {
    // The status IS the condition: capture strips it, so there is no second
    // rule anywhere saying an unheld land is the one that raids.
    const g = playingSix();
    const quiet = quietLands(g)[0];
    const taken: GameState = {
      ...g,
      passives: stripOnCapture(g.passives, quiet),
      overlords: new Map([[quiet, "beta"]]),
    };
    const after = beginTurn({ ...taken, current: 0, turn: g.turn + 1 }, always);
    expect(Object.values(after.marches).some((m) => m.actor === quiet))
      .toBe(false);
  });

  it("lands its arrow at the next wrap - nothing it declares stands forever", () => {
    const g = playingSix();
    const quiet = quietLands(g);
    const declaredRound = beginTurn(
      { ...g, current: 0, turn: g.turn + 1 }, always,
    );
    const standing = Object.values(declaredRound.marches)
      .filter((m) => quiet.includes(m.actor));
    expect(standing.length).toBeGreaterThan(0);
    for (const m of standing) {
      expect(m.expiry).toBe(declaredRound.turn + 1);
    }

    const nextRound = beginTurn(
      { ...declaredRound, current: 0, turn: declaredRound.turn + 1 }, always,
    );
    // Nothing declared before this round is still on the map - the arrows on
    // it are the ones this wrap just drew. Asserted on the expiry rather than
    // the key, because a freed slot is reused by the next declaration.
    for (const m of Object.values(nextRound.marches)) {
      expect(m.expiry).toBeGreaterThan(nextRound.turn);
    }
    expect(nextRound.log.some((e) => e.type === "march-resolved")).toBe(true);
  });
});
