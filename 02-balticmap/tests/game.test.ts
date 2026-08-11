import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, chooseRules, pickFaction, beginTurn,
  playCard, discardCard, endTurn, advance, surrender, viewOf,
  autoTransfer, transferDefense, transferLimit,
  OPENING_HAND, MAX_ACTIVE, TURNIP_HARVEST_THRESHOLD,
  victoryRealmSize, winSizeFor, keepPlaying, type GameState,
} from "../src/game";
import {
  hasPassive, passivesOn, playsTurns, QUIET_PASSIVES, stripOnCapture,
} from "../src/passives";
import { hasRuler, vacateRulers } from "../src/rulers";
import { DEFAULT_RULES } from "../src/rules";
import { CARDS, isTributeCard, startingDeck, type Rng } from "../src/cards";
import {
  DEFAULT_DEFENSE_MAX, INDEPENDENCE_GATE, LAND_GROWTH, SUBJUGATION_GATE,
  ATTACK_DAMAGE, FORTIFY_HEAL, HARVEST_FEAST_HEAL, HILLFORT_HEAL, STRONG_BONUS,
  PLAGUE_DAMAGE_PER_STACK, RAID_DAMAGE, turnipThresholdFor,
  WAR_COUNCIL_LEADERSHIP,
} from "../src/defense";
import {
  cardBlockReason, ESCAPE_RESPITE_TURNS, handLimitFor, MIN_HAND, playableSet,
  validTargetsFor,
} from "../src/playability";
import { rulerOf } from "../src/rulers";
import { aiTakeTurn } from "../src/ai";
import {
  SIM_ADJACENCY, SIM_DEFENSE_MAX, SIM_ETHNICITIES, SIM_FACTION_IDS,
  SIM_SITE_CAPS, naiveHumanTurn,
} from "../src/sim";
import { BASELINE_FACTION } from "./baseline-config";

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
 *  The rules are scale-free and the heals are not: on a small shipped polygon
 *  a Hillfort fills half of it and a Fortify a third, so every
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

/** Replaces a seat's deck and/or discard outright. The harvest ladder is
 *  priced against what a seat HOLDS, so a test about a price has to say what
 *  the piles are rather than inherit a dealt deck. */
function withPiles(
  g: GameState,
  playerIdx: number,
  piles: Partial<Pick<GameState["players"][number], "deck" | "hand" | "discard">>,
): GameState {
  const p = { ...g.players[playerIdx], ...piles };
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
    // Every seat opens on one land, and one land refills to OPENING_HAND, so
    // the human's first beginTurn draws nothing on top of the deal - the 4th
    // card arrives with the 3rd land. See `handLimitFor`.
    expect(g.players.every((p) => p.hand.length === OPENING_HAND)).toBe(true);
    // opening hands are dealt silently, and there was no turn draw to log
    expect(g.log.filter((e) => e.type === "draw")).toHaveLength(0);
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
  it("refills the hand to the realm's limit, and logs every draw", () => {
    // Under BOTH turn rules. Drawing exactly one was arithmetic written when a
    // standard turn spent exactly one card; a Raid re-opening the turn for
    // more raids spends several, so the fixed draw shrank the hand of anybody
    // who used the keyword, round after round.
    const g = withHand(playingState(), 0, ["raid"]);
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    expect(after.rules.turn).toBe("standard");
    expect(after.players[0].hand).toHaveLength(MIN_HAND);
    expect(fresh(after, before).filter((e) => e.type === "draw"))
      .toHaveLength(MIN_HAND - 1);
  });

  it("refills to the bigger limit a wider realm earns", () => {
    // Four lands under beta: itself, one annexation, a vassal, and the land
    // that vassal annexed. The hand counts the FULL realm walked to depth, so
    // the last of those four has to count or the number would read 3.
    const g = withHand(
      {
        ...playingState(),
        incorporated: { gamma: "beta", delta: "alpha" },
        overlords: new Map([["alpha", "beta"]]),
      },
      0, ["raid"],
    );
    expect(handLimitFor(g, "beta")).toBe(4);
    expect(beginTurn(g, seededRng(2)).players[0].hand).toHaveLength(4);
  });

  it("draws nothing into a hand already at or over the limit", () => {
    // Over, in fact: four cards against a one-land limit of three. The refill
    // is a target and not a cap, so nothing is discarded either.
    const g = withHand(playingState(), 0, ["raid", "raid", "fortify", "fortify"]);
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(4);
    expect(fresh(after, before).some((e) => e.type === "draw")).toBe(false);
    expect(after.players[0].discard).toEqual(g.players[0].discard);
  });

  it("reshuffles the discard when the deck is empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0], deck: [] as string[], hand: [] as string[],
      discard: ["grow-crops", "grow-crops", "grow-crops"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const before = g.log.length;
    const after = beginTurn(g, seededRng(2));
    // Three is all there was, and a refill takes what it can get rather than
    // stalling on a short deck.
    expect(after.players[0].hand).toHaveLength(3);
    expect(after.players[0].deck).toHaveLength(0);
    expect(fresh(after, before).filter((e) => e.type === "reshuffle"))
      .toHaveLength(1);
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
  it("refills the hand to its limit, reshuffling a dry deck mid-refill", () => {
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
    expect(after.players[0].hand).toHaveLength(MIN_HAND);
    const events = fresh(after, before);
    expect(events.filter((e) => e.type === "draw")).toHaveLength(MIN_HAND);
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
    // The deal already put the one-land seat at its limit; pickFaction's
    // beginTurn had nothing left to draw.
    expect(g.players[0].hand).toHaveLength(MIN_HAND);
    const before = g.log.length;
    const again = beginTurn(g, seededRng(3));
    expect(again.players[0].hand).toHaveLength(MIN_HAND);
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
      id: g.nextMarchId,
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
    // At 0 there is nothing left to damage, so the landing moves no score.
    // It is still a landing, and still gets its line - the land changing
    // hands is indented under it.
    const landing = dead.log.find((e) => e.type === "march-resolved");
    expect(landing).toBeDefined();
    expect(landing?.amount).toBeUndefined();
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
        [String(g.nextMarchId)]: {
          id: g.nextMarchId, actor: "alpha", from: "alpha", to: "beta", cardId: "raid",
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
      amount: 6, incoming: 10, counter: 4,
    });
  });

  it("throws the leftover back onto the attacker when the counter is stronger", () => {
    const after = landMarches(facingRaids(4, 10));
    expect(after.defense.beta).toBe(FIXTURE_MAX - 6);
    expect(after.defense.alpha).toBeUndefined();
    expect(after.log.find((e) => e.type === "march-resolved")).toMatchObject({
      type: "march-resolved", targetFactionId: "beta", sourceFactionId: "alpha",
      amount: 6, incoming: 10, counter: 4,
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
    expect(line).toMatchObject({ incoming: 5, counter: 5 });
    expect(line.amount).toBeUndefined();
  });

  it("pairs the armies off, so two raids answered by one hit both lands", () => {
    // Two Raids out of beta, one Strong raid back out of alpha. Summed, this
    // was 2 against 2 and NOTHING happened: alpha's army bought nothing for
    // being the stronger one, and beta's second army evaporated having met no
    // one. Paired, the Strong raid beats the Raid it meets and pushes 1
    // through, and the Raid nobody met pushes 1 back.
    const g = playingState(LINE_ADJ);
    const arrow = (
      id: number, from: string, to: string, cardId: string, damage: number,
    ) => ({
      id, actor: from, from, to, cardId, damage,
      holdsArmy: true, expiry: g.turn + 1,
    });
    const after = landMarches({
      ...g,
      marches: {
        "1": arrow(1, "beta", "alpha", "raid", 1),
        "2": arrow(2, "beta", "alpha", "raid", 1),
        "3": arrow(3, "alpha", "beta", "strong-raid", 2),
      },
    });
    expect(after.defense.alpha).toBe(FIXTURE_MAX - 1);
    expect(after.defense.beta).toBe(FIXTURE_MAX - 1);
    expect(after.marches).toEqual({});
    // A line per pairing, each naming the land it landed on. The pair that met
    // reports the clash it was; the arrow that met nobody reports no clash,
    // because nothing answered it.
    const landed = after.log.filter((e) => e.type === "march-resolved");
    expect(landed).toMatchObject([
      {
        targetFactionId: "beta", sourceFactionId: "alpha",
        cardId: "strong-raid", amount: 1, incoming: 2, counter: 1,
      },
      {
        targetFactionId: "alpha", sourceFactionId: "beta",
        cardId: "raid", amount: 1,
      },
    ]);
    expect(landed[1].counter).toBeUndefined();
  });

  it("lets two armies down one axis break a land and then walk into it", () => {
    // The pairings resolve in order against the defense the one before left,
    // which is the same "first flattens it, second walks in" two armies down
    // two axes already had. Two arrows because each carries exactly what the
    // land has standing: one carrying two would take it on its own.
    const g = playingState(LINE_ADJ);
    const arrow = (id: number) => ({
      id, actor: "beta", from: "beta", to: "alpha", cardId: "raid",
      damage: 1, holdsArmy: true, expiry: g.turn + 1,
    });
    const after = landMarches({
      ...g,
      defense: { alpha: 1 },
      marches: { "1": arrow(1), "2": arrow(2) },
    });
    expect(after.defense.alpha).toBe(0);
    expect(after.overlords.get("alpha")).toBe("beta");
  });

  it("reports no clash for a march that met no counter and hit a dead land", () => {
    // The other zero: one side only, aimed at a polygon already at 0. Nothing
    // met it and nothing moved, so there is no clash to report - the standoff
    // line above exists because two armies were spent, and here only one was.
    // The arrival itself is still reported: it took the land.
    const declared = playCard(
      withHand(playingState(LINE_ADJ), 0, ["raid"]), 0, rng(), "alpha",
    );
    const after = landMarches({ ...declared, defense: { alpha: 0 } });
    expect(after.marches).toEqual({});
    const landing = after.log.find((e) => e.type === "march-resolved");
    expect(landing?.counter).toBeUndefined();
    expect(landing?.amount).toBeUndefined();
  });

  it("spends the counter even though its own turn has not come round", () => {
    // The counter's expiry is a turn out too, but the axis resolves whole at
    // the earlier of the two - otherwise the attack would land first and the
    // counter would survive to strike an already-battered land.
    expect(landMarches(facingRaids(4, 10)).marches).toEqual({});
  });

  it("a landing states the force aimed at it, not just what got through", () => {
    // A 3-strength raid onto a land holding 1. `amount` is floored at the
    // defense that was there; `incoming` is what was thrown.
    const g = playingState(LINE_ADJ);
    const after = landMarches({
      ...g,
      defense: { alpha: 1 },
      marches: {
        "1": {
          id: 1, actor: "beta", from: "beta", to: "alpha", cardId: "raid",
          damage: 3, holdsArmy: true, expiry: g.turn + 1,
        },
      },
    });
    const e = after.log.find((x) => x.type === "march-resolved")!;
    expect(e.amount).toBe(1);
    expect(e.incoming).toBe(3);
    expect(e.counter).toBeUndefined();
  });
});

describe("great-raid", () => {
  /** beta holds gamma as a vassal on the complete graph, so TWO lands of the
   *  realm border delta and a Great raid aimed there musters both. The card
   *  names one land and every neighbour of it that the realm holds piles on,
   *  which takes a realm of more than one land to show at all. */
  function pyramid(hand: string[] = ["great-raid"]): GameState {
    const g = playingState(); // complete graph
    return withHand(
      { ...g, overlords: new Map([["gamma", "beta"]]) }, 0, hand,
    );
  }

  it("musters one army from every land of the realm bordering the target", () => {
    const after = playCard(pyramid(), 0, rng(), "delta");
    expect(Object.values(after.marches).map((m) => [m.from, m.to, m.holdsArmy]))
      .toEqual([["beta", "delta", true], ["gamma", "delta", true]]);
    // Each sallying land spends its OWN army, and nothing lands yet.
    expect(after.defense).toEqual({});
  });

  it("cannot sally at all once the frontier's armies are already out", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid", "great-raid"]);
    // At FIXTURE_MAX every land already fields many armies at once; shrink
    // beta's own ceiling to exactly one army's worth so a single raid can
    // actually exhaust it.
    g = { ...g, defenseMax: { ...g.defenseMax, beta: 3 } };
    g = playCard(g, 0, rng(), "alpha");
    const after = playCard({ ...g, playedThisTurn: false }, 0, rng(), "alpha");
    // beta is the realm's only land and its army is on the road to alpha.
    expect(after.marches).toEqual(g.marches);
  });

  it("lands each arrow separately on the one land it named", () => {
    const before = playCard(pyramid(), 0, rng(), "delta");
    const after = landMarches(before);
    const landed = fresh(after, before.log.length)
      .filter((e) => e.type === "march-resolved");
    // Two arrows, answered one at a time - a Raid's worth each, not a card's.
    expect(landed.map((e) => e.targetFactionId)).toEqual(["delta", "delta"]);
    expect(landed.every((e) => e.amount === ATTACK_DAMAGE["great-raid"])).toBe(true);
    expect(after.defense.delta).toBe(FIXTURE_MAX - 2 * ATTACK_DAMAGE["great-raid"]);
    expect(after.defense.beta).toBeUndefined(); // never hits itself
  });

  it("spares the realm's own members - a vassal is not a target", () => {
    // gamma is beta's vassal and borders it on the complete graph, so it would
    // be a neighbour if the card asked the map instead of the realm.
    const after = landMarches(playCard(pyramid(), 0, rng(), "alpha"));
    const landed = after.log.filter((e) => e.type === "march-resolved");
    expect(landed.map((e) => e.targetFactionId)).toEqual(["alpha", "alpha"]);
    expect(after.defense.gamma).toBeUndefined();
  });

  it("stacks leadership and omens like a raid, one multiplier over every arrow", () => {
    let g = pyramid();
    g = {
      ...g,
      omens: { beta: 1 },
      rulers: { ...g.rulers, beta: { ...g.rulers.beta, leadership: 5 } },
    };
    const declared = playCard(g, 0, rng(), "delta");
    expect(declared.log.find((e) => e.type === "play")?.readings).toBe(1);
    expect(declared.omens.beta).toBeUndefined();
    const after = landMarches(declared);
    // The reading is spent once and doubles every arrow the play sent.
    const each = (ATTACK_DAMAGE["great-raid"] + 5) * 2;
    expect(after.defense.delta).toBe(FIXTURE_MAX - 2 * each);
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
    // Spent AND gone: the harvest is unique, so it leaves the deck rather than
    // discarding. The bar hands out a fresh one when it fills again, and one
    // that also came round with the discard would cash a season nobody farmed.
    expect(pilesOf(after, "beta")).not.toContain("turnip-harvest");
  });

  it("a priced pick is bought with copies that leave the game", () => {
    let g = withHand(playingState(), 0, ["turnip-harvest"]);
    g = withPiles(g, 0, { deck: ["raid", "raid", "fortify"], discard: [] });
    const before = g.log.length;
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { kind: "build", cardId: "strong-raid" },
    });
    // ONE copy, not one per card spent: the trade is two in, one out.
    expect(pilesOf(after, "beta").filter((c) => c === "strong-raid"))
      .toEqual(["strong-raid"]);
    // Both Raids gone from every pile, not moved to the discard.
    expect(pilesOf(after, "beta").filter((c) => c === "raid")).toEqual([]);
    // Two Raids out, one Strong raid in, and the harvest itself consumed:
    // two cards fewer than the seat held. Climbing THINS the deck.
    expect(pilesOf(after, "beta")).toHaveLength(pilesOf(g, "beta").length - 2);
    // Two out, one in: climbing thins the deck rather than padding it.
    expect(fresh(after, before).filter((e) => e.type === "harvest-burned"))
      .toMatchObject([{ cardId: "raid" }, { cardId: "raid" }]);
    expect(after.log.at(-1)).toMatchObject({
      type: "harvest-picked", cardId: "strong-raid",
    });
  });

  it("spends the discard before the deck and the hand last", () => {
    let g = withHand(playingState(), 0, ["turnip-harvest", "raid"]);
    g = withPiles(g, 0, { deck: ["raid"], discard: ["raid"] });
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { kind: "build", cardId: "strong-raid" },
    });
    const seat = after.players[0];
    expect(seat.deck).not.toContain("raid");
    // The discard also holds the spent Turnip harvest, so it is the Raid that
    // has to be gone rather than the pile.
    expect(seat.discard).not.toContain("raid");
    expect(seat.hand).toContain("raid");
  });

  it("a pick the seat cannot pay for grants nothing and costs nothing", () => {
    let g = withHand(playingState(), 0, ["turnip-harvest"]);
    g = withPiles(g, 0, { deck: ["raid"], discard: [] });
    const before = g.log.length;
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { kind: "build", cardId: "strong-raid" },
    });
    expect(pilesOf(after, "beta")).not.toContain("strong-raid");
    expect(pilesOf(after, "beta")).toContain("raid");
    expect(fresh(after, before).some((e) => e.type === "harvest-burned"))
      .toBe(false);
    expect(after.log.some((e) => e.type === "harvest-picked")).toBe(false);
  });

  it("pays with the last two copies it holds - the pick is priced before the payment", () => {
    // The payment must not be able to make its own pick unaffordable: a seat
    // holding exactly the price handed both copies over and was then told it
    // could not afford what it had just paid for.
    let g = withHand(playingState(), 0, ["turnip-harvest"]);
    g = withPiles(g, 0, { deck: ["raid", "raid"], discard: [] });
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { kind: "build", cardId: "strong-raid" },
    });
    expect(pilesOf(after, "beta")).toContain("strong-raid");
    expect(pilesOf(after, "beta").filter((c) => c === "raid")).toEqual([]);
  });

  it("charges nothing for a free build card", () => {
    let g = withHand(playingState(), 0, ["turnip-harvest"]);
    g = withPiles(g, 0, { deck: ["raid", "raid"], discard: [] });
    const before = g.log.length;
    const after = playCard(g, 0, rng(), undefined, {
      harvest: { kind: "build", cardId: "raid" },
    });
    expect(pilesOf(after, "beta").filter((c) => c === "raid")).toHaveLength(3);
    expect(fresh(after, before).some((e) => e.type === "harvest-burned"))
      .toBe(false);
  });

  it("charges nothing for a card the random draw happened to land on", () => {
    // "A card from anywhere" is a lucky break by decision - the ladder is what
    // the named pick charges for, and a sight-unseen draw charges nothing.
    let g = withHand(playingState(), 0, ["turnip-harvest"]);
    g = withPiles(g, 0, { deck: ["raid", "raid"], discard: [] });
    const before = g.log.length;
    const after = playCard(g, 0, rng(), undefined, { harvest: { kind: "random" } });
    expect(fresh(after, before).some((e) => e.type === "harvest-burned"))
      .toBe(false);
    expect(pilesOf(after, "beta").filter((c) => c === "raid")).toHaveLength(2);
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
    expect(after.repeatGroup).toBe("raid");
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
    expect(beginTurn({ ...first, turn: first.turn + 1 }, rng()).repeatGroup)
      .toBeNull();
  });

  it("a card that declares nothing closes the turn, as every card always has", () => {
    // Hillfort: a single-land heal carrying no keyword at all, so it is the
    // heal that neither costs a settlement nor re-opens anything.
    const g = withHand(
      { ...playingState(LINE_ADJ), defense: { beta: 10 } }, 0,
      ["hillfort", "raid"],
    );
    const after = playCard(g, 0, rng(), "beta");
    expect(after.playedThisTurn).toBe(true);
    expect(after.repeatGroup).toBeNull();
    expect(playCard(after, 0, rng(), "alpha")).toBe(after);
  });

  it("is the declaration that re-opens the turn, not the card's name", () => {
    // Nothing about Fortify is a raid. Declaring it a plays-again card for
    // this one test is the point: the rule is the field, and no branch
    // anywhere asks whether the card is a Raid.
    const def = CARDS.fortify;
    CARDS.fortify = { ...def, keywords: ["raid"] };
    try {
      const g = withHand(
        { ...playingState(LINE_ADJ), defense: { beta: 10 } }, 0,
        ["fortify", "fortify"],
      );
      const first = playCard(g, 0, rng(), "beta");
      // The group is the KEYWORD's id, not the card's: what re-opened the turn
      // is the raid keyword this Fortify was handed for the test.
      expect(first.repeatGroup).toBe("raid");
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
    expect(played.repeatGroup).toBe("raid");
    expect(endTurn(played).repeatGroup).toBeNull();
    // The discard half asks the same of a turn that IS open: a fresh state's
    // repeatGroup is already null, so discarding into one proves nothing.
    // Under unlimited rules a discard is legal with the turn still live.
    const open = withHand(unlimitedPlaying(LINE_ADJ), 0, ["raid", "subjugate"]);
    const raided = playCard(open, 0, rng(), "alpha");
    expect(raided.repeatGroup).toBe("raid");
    expect(discardCard(raided, 0).repeatGroup).toBeNull();
  });
});

describe("a fortify calls on a settlement", () => {
  const rng = (): Rng => seededRng(4);

  const SIX_ADJ: Record<string, string[]> = {
    alpha: ["beta"], beta: ["alpha", "gamma"], gamma: ["beta", "delta"],
    delta: ["gamma", "epsilon"], epsilon: ["delta", "zeta"], zeta: ["epsilon"],
  };

  /** beta with gamma as its vassal, both damaged, so the realm holds two
   *  lands a fortify is legal on. Every land begins on the one settlement it
   *  was drawn with (`settlements` stays empty), which is the case the bound
   *  is about: one fortify each.
   *
   *  Six factions for the same reason the raid fixture above uses six: a realm
   *  of two wins a four-land map outright, and the first fortify would end the
   *  run by ending the game. */
  function twoLands(settlements: Record<string, number> = {}): GameState {
    const g = pickFaction(
      chooseBuild(
        startGame(newGame(SIX, SIX_ADJ, {}, undefined, maxes(SIX))),
        "warpath", seededRng(1),
      ),
      "beta", seededRng(1),
    );
    return withHand(
      {
        ...g,
        overlords: new Map([["gamma", "beta"]]),
        defense: { beta: 10, gamma: 10 },
        settlements,
      },
      0, ["fortify", "fortify", "strong-fortify"],
    );
  }

  it("re-opens the turn and marks the settlement it called on", () => {
    const after = playCard(twoLands(), 0, rng(), "beta");
    expect(after.playedThisTurn).toBe(true);
    expect(after.repeatGroup).toBe("fortify");
    expect(after.settlementsSpent).toEqual({ beta: 1 });
  });

  it("refuses a second fortify on a land whose one settlement answered", () => {
    const first = playCard(twoLands(), 0, rng(), "beta");
    expect(validTargetsFor(viewOf(first), "beta", "fortify")).toEqual(["gamma"]);
    expect(playCard(first, 0, rng(), "beta")).toBe(first);
  });

  it("takes the next land in the realm instead", () => {
    const first = playCard(twoLands(), 0, rng(), "beta");
    const second = playCard(first, 0, rng(), "gamma");
    expect(second.defense.gamma).toBe(10 + FORTIFY_HEAL);
    expect(second.settlementsSpent).toEqual({ beta: 1, gamma: 1 });
  });

  it("takes two on a land that founded its second settlement", () => {
    // `settlements` counts what was FOUNDED, so beta: 1 is a land standing on
    // two. The second fortify then has a settlement of its own to answer it.
    const first = playCard(twoLands({ beta: 1 }), 0, rng(), "beta");
    const second = playCard(first, 0, rng(), "beta");
    expect(second.defense.beta).toBe(10 + 2 * FORTIFY_HEAL);
    expect(second.settlementsSpent).toEqual({ beta: 2 });
    expect(playCard(second, 0, rng(), "beta")).toBe(second);
  });

  it("lets a Strong fortify follow a Fortify - one keyword, one run", () => {
    const first = playCard(twoLands(), 0, rng(), "beta");
    const strong = first.players[0].hand.indexOf("strong-fortify");
    const second = playCard(first, strong, rng(), "gamma");
    expect(second.defense.gamma).toBe(10 + FORTIFY_HEAL + STRONG_BONUS);
  });

  it("does not let a raid follow a fortify, or a fortify follow a raid", () => {
    const g = withHand(twoLands(), 0, ["fortify", "raid"]);
    // By index found AFTER the play, never the index it had before: the played
    // card leaves the hand, so a stale index refuses for want of a card rather
    // than for want of the turn.
    const fortified = playCard(g, 0, rng(), "beta");
    const raidAfter = fortified.players[0].hand.indexOf("raid");
    expect(raidAfter).toBeGreaterThanOrEqual(0);
    expect(playCard(fortified, raidAfter, rng(), "alpha")).toBe(fortified);
    const raided = playCard(g, 1, rng(), "alpha");
    expect(raided.repeatGroup).toBe("raid");
    const fortifyAfter = raided.players[0].hand.indexOf("fortify");
    expect(fortifyAfter).toBeGreaterThanOrEqual(0);
    expect(playCard(raided, fortifyAfter, rng(), "beta")).toBe(raided);
  });

  it("hands the settlements back at the next turn start", () => {
    const first = playCard(twoLands(), 0, rng(), "beta");
    expect(first.settlementsSpent).toEqual({ beta: 1 });
    const next = beginTurn({ ...first, turn: first.turn + 1 }, rng());
    expect(next.settlementsSpent).toEqual({});
  });

  it("stops the run when the realm's settlements are out, not at a count", () => {
    // Both lands fortified, and the third card in hand is refused by the
    // board rather than by anything counting plays.
    const second = playCard(
      playCard(twoLands(), 0, rng(), "beta"), 0, rng(), "gamma",
    );
    expect(validTargetsFor(viewOf(second), "beta", "fortify")).toEqual([]);
    expect(cardBlockReason(viewOf(second), "beta", "strong-fortify"))
      .toEqual({ code: "no-settlement" });
  });

  it("costs a Hillfort nothing - the class is asked, not the heal", () => {
    const g = withHand(
      { ...playingState(LINE_ADJ), defense: { beta: 10 } }, 0, ["hillfort"],
    );
    const after = playCard(g, 0, rng(), "beta");
    expect(after.settlementsSpent).toEqual({});
    expect(after.repeatGroup).toBeNull();
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

  it("keeps a person's chair warm when their chief is killed", () => {
    // A player skipped forever is not a rule, it is a hung game. The exemption
    // is the PERSON's, not seat 0's: it has to hold at whichever seat they
    // sit, or a second human loses their turns where the first would not.
    const base = playingState();
    const g = {
      ...base,
      humanSeats: [0, 2],
      current: 1, playedThisTurn: true,
      rulers: vacateRulers(base.rulers, [base.players[0].factionId]),
    };
    expect(advance(g, seededRng(3)).current).toBe(2);
  });

  it("but passes over a person whose realm has been swallowed", () => {
    // The other half, and the order matters: an annexed people has no seat to
    // sit in whoever was playing them. Exempting them too would leave the rest
    // of the table waiting on a turn that can never be taken.
    const base = playingState();
    const g = {
      ...base,
      humanSeats: [0, 2],
      current: 1, playedThisTurn: true,
      incorporated: { [base.players[2].factionId]: base.players[0].factionId },
    };
    expect(advance(g, seededRng(3)).current).not.toBe(2);
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
          actor: "gamma", from: "gamma", to: "alpha", cardId: "subjugate",
          expiry: g.turn + 1,
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
          actor: "beta", from: "beta", to: "alpha", cardId: "subjugate",
          expiry: g.turn + 1,
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
    // The card that walked the army in, so the line cannot say Subjugate.
    expect(fresh(after, before)).toContainEqual(expect.objectContaining({
      type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta",
      via: "conquest", cardId: "raid", consequence: true,
    }));
    // Nothing was damaged: there was nothing left to damage. The arrival is
    // still a line, and it is the one the submission indents under.
    const landing = fresh(after, before).find(
      (e) => e.type === "march-resolved" && e.targetFactionId === "alpha",
    );
    expect(landing).toMatchObject({ cardId: "raid", sourceFactionId: "beta" });
    expect(landing?.amount).toBeUndefined();
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
        "1": {
          id: 1, actor: raider, from: raider, to: target, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: g.turn,
        },
      },
    };
    const after = beginTurn(armed, rng());
    expect(after.marches["1"]).toBeUndefined();
    expect(after.overlords.get(target)).toBeUndefined();
    expect(after.log.some((e) => e.type === "subjugated")).toBe(false);
  });
});

describe("an army that overwhelms a land", () => {
  /** One arrow of `damage` aimed at `to` out of the human's own seat, landing
   *  at that seat's next turn start. The fixture the whole excess rule is read
   *  against: what it deals, against what the land has standing. */
  function oneArrow(damage: number, to: string, standing: number): GameState {
    const base = playingSix();
    return landMarches({
      ...base,
      defense: { [to]: standing },
      marches: {
        "1": {
          id: 1, actor: "beta", from: "beta", to, cardId: "raid",
          damage, holdsArmy: true, expiry: base.turn + 1,
        },
      },
    });
  }

  it("takes it in the same blow - one point more than it holds is enough", () => {
    // The rule this whole file used to state the other way round: a 5 STR arrow
    // landing on a land holding 1 flattened it and stopped, and the conquest
    // wanted a second army a turn later.
    const after = oneArrow(2, "alpha", 1);
    expect(after.defense.alpha).toBe(0);
    expect(after.overlords.get("alpha")).toBe("beta");
    expect(after.log).toContainEqual(expect.objectContaining({
      type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta",
      via: "conquest",
    }));
  });

  it("holds when the blow only equals what is standing", () => {
    // Equal is a flattening and not a conquest. The land is left at 0, holding
    // nothing, and the NEXT arrival walks in - which is the timing game the
    // strict-excess line exists to keep.
    const after = oneArrow(1, "alpha", 1);
    expect(after.defense.alpha).toBe(0);
    expect(after.overlords.get("alpha")).toBeUndefined();
    expect(after.log.some((e) => e.type === "subjugated")).toBe(false);
  });

  it("reports the arrival ONCE, carrying what the blow moved", () => {
    // Two lines for one arrow is the thing this design is shaped around: the
    // damage the blow dealt and the arrival that took the land are one event,
    // and the submission indents under it.
    const base = playingSix();
    const before = base.log.length;
    const after = landMarches({
      ...base,
      defense: { alpha: 1 },
      marches: {
        "1": {
          id: 1, actor: "beta", from: "beta", to: "alpha", cardId: "strong-raid",
          damage: 2, holdsArmy: true, expiry: base.turn + 1,
        },
      },
    });
    const batch = fresh(after, before);
    const landings = batch.filter(
      (e) => e.type === "march-resolved" && e.targetFactionId === "alpha",
    );
    expect(landings).toHaveLength(1);
    expect(landings[0]).toMatchObject({
      cardId: "strong-raid", sourceFactionId: "beta", amount: 1,
    });
    // The submission stands immediately after it, and reads as its consequence.
    const at = batch.indexOf(landings[0]);
    expect(batch[at + 1]).toMatchObject({
      type: "subjugated", targetFactionId: "alpha", consequence: true,
    });
  });

  it("still reports nothing moved when the land was already flat", () => {
    // The old walk-in is a case of the new rule, not a branch beside it, and
    // its line keeps the `metNothing` shape: no amount, so no `(Defense ...)`
    // suffix on a blow that moved no score.
    const after = oneArrow(1, "alpha", 0);
    expect(after.overlords.get("alpha")).toBe("beta");
    const landing = after.log.find(
      (e) => e.type === "march-resolved" && e.targetFactionId === "alpha",
    );
    expect(landing?.amount).toBeUndefined();
    expect(landing?.counter).toBeUndefined();
  });

  it("spends a second arrow of your own WITHOUT sacking the land it took", () => {
    // An army does not sack the land its own side has just moved defenders
    // into. The surplus arrow gets its arrival line - so the player can see
    // where the arrow went - and lands nothing on top of the conquest.
    // TEN, because the taker ends the turn holding three lands and a conquest
    // that wins the run would end it before the second arrow is accounted for.
    const base = playingTen();
    // The conqueror is a seat NOBODY plays, so the conquest moves half of
    // `from`'s defense across on the spot rather than waiting on a modal.
    // Those defenders are exactly what a second arrow must NOT take back off.
    const taker = base.factionIds.find(
      (f) => hasRuler(base.rulers, f) &&
        f !== "beta" && f !== "alpha" && f !== "gamma",
    )!;
    const after = landMarches({
      ...base,
      // Marches resolve at their ACTOR's turn start, so the taker holds it.
      current: base.players.findIndex((pl) => pl.factionId === taker),
      // Both arrows have to march out of the taker's OWN realm, so gamma
      // kneels to it first - an army cannot set out from a land its actor
      // does not hold.
      overlords: new Map([["gamma", taker]]),
      defense: { alpha: 0, [taker]: 4, gamma: 4 },
      marches: {
        "1": {
          id: 1, actor: taker, from: taker, to: "alpha", cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn + 1,
        },
        "2": {
          id: 2, actor: taker, from: "gamma", to: "alpha", cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn + 1,
        },
      },
    });
    expect(after.overlords.get("alpha")).toBe(taker);
    // One conquest, not two: a land changes hands once.
    expect(
      after.log.filter((e) => e.type === "subjugated" && e.targetFactionId === "alpha"),
    ).toHaveLength(1);
    // The defenders the conquest moved in are all still standing: the second
    // arrow took nothing off them.
    const moved = after.log.find(
      (e) => e.type === "transferred" && e.targetFactionId === "alpha",
    );
    expect(moved?.amount).toBeGreaterThan(0);
    expect(after.defense.alpha).toBe(moved?.amount);
    // Both arrows are accounted for on the surface the player reads, and
    // neither claims damage on the land that changed hands.
    const arrivals = after.log.filter(
      (e) => e.type === "march-resolved" && e.targetFactionId === "alpha",
    );
    expect(arrivals).toHaveLength(2);
    expect(arrivals.every((e) => e.amount === undefined)).toBe(true);
  });

  it("resolves arrivals one at a time, each against the board the last one left", () => {
    // The whole point of one-at-a-time: a rival's arrow arriving after a
    // conquest meets the land under its NEW holder, with the defenders that
    // conquest moved in - and can take it straight back off them. Resolved in
    // one pass, both arrows read the same pre-conquest board and the second
    // one answered a question that was already out of date.
    const base = playingTen();
    const taker = base.factionIds.find(
      (f) => hasRuler(base.rulers, f) &&
        f !== "beta" && f !== "alpha" && f !== "gamma",
    )!;
    // Both arrows resolve in the same pass: the sweep over the seats that
    // never take a turn runs every one of them inside a single beginTurn.
    const after = landMarches({
      ...base,
      current: base.players.findIndex((pl) => pl.factionId === taker),
      overlords: new Map([["gamma", taker]]),
      defense: { alpha: 0, [taker]: 6, gamma: 6 },
      marches: {
        "1": {
          id: 1, actor: taker, from: taker, to: "alpha", cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn + 1,
        },
      },
    });
    // The conquest moved defenders in, and they are all still standing - the
    // taker's own second arrow is the case that must NOT touch them, and
    // there is no second arrow of the taker's here.
    const moved = after.log.find(
      (e) => e.type === "transferred" && e.targetFactionId === "alpha",
    );
    expect(after.overlords.get("alpha")).toBe(taker);
    expect(after.defense.alpha).toBe(moved?.amount);
    expect(after.defense.alpha).toBeGreaterThan(0);
  });

  it("finishes one land before starting the next, in the log as on the board", () => {
    // What "one at a time" means where the player can see it. Two arrows at
    // two lands used to resolve in two passes - every blow, then every
    // arrival - so the log read as two damage lines followed by two conquests
    // and the replay walked the round twice. Each land is now finished before
    // the next one starts.
    const base = playingTen();
    const taker = base.factionIds.find(
      (f) => hasRuler(base.rulers, f) &&
        f !== "beta" && f !== "alpha" && f !== "gamma",
    )!;
    const before = base.log.length;
    const after = landMarches({
      ...base,
      current: base.players.findIndex((pl) => pl.factionId === taker),
      overlords: new Map([["gamma", taker]]),
      defense: { alpha: 0, delta: 0, [taker]: 8, gamma: 8 },
      marches: {
        "1": {
          id: 1, actor: taker, from: taker, to: "alpha", cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn + 1,
        },
        "2": {
          id: 2, actor: taker, from: "gamma", to: "delta", cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn + 1,
        },
      },
    });
    expect(after.overlords.get("alpha")).toBe(taker);
    expect(after.overlords.get("delta")).toBe(taker);
    // The lands each own a contiguous run: no line about the second land
    // appears between the first land's arrival and its submission.
    const lands = fresh(after, before)
      .filter((e) => e.type === "march-resolved" || e.type === "subjugated")
      .map((e) => e.targetFactionId);
    const firstLand = lands[0];
    const runEnds = lands.findIndex((l) => l !== firstLand);
    expect(lands.slice(0, runEnds).every((l) => l === firstLand)).toBe(true);
    expect(lands.slice(runEnds).every((l) => l !== firstLand)).toBe(true);
  });

  it("never takes a land below zero, however hard the blow", () => {
    const after = oneArrow(99, "alpha", 2);
    expect(after.defense.alpha).toBe(0);
    expect(after.defense.alpha).toBeGreaterThanOrEqual(0);
    // And the line quotes what actually moved, not what was thrown.
    const landing = after.log.find(
      (e) => e.type === "march-resolved" && e.targetFactionId === "alpha",
    );
    expect(landing?.amount).toBe(2);
  });

  it("takes the ATTACKER's land when the counter overruns it", () => {
    // Symmetric, because it is one rule asked of whichever side the difference
    // lands on. Marching out with your last defenders is a real risk: 1 out
    // against 3 back leaves 2 walking into a land holding 1.
    const base = playingSix();
    const foe = base.factionIds.find(
      (f) => f !== "beta" && hasRuler(base.rulers, f),
    )!;
    const after = landMarches({
      ...base,
      defense: { beta: 1 },
      marches: {
        "1": {
          id: 1, actor: "beta", from: "beta", to: foe, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn + 1,
        },
        "2": {
          id: 2, actor: foe, from: foe, to: "beta", cardId: "raid",
          damage: 3, holdsArmy: true, expiry: base.turn + 1,
        },
      },
    });
    expect(after.overlords.get("beta")).toBe(foe);
    // The arrival names the attacker's OWN land, and the clash reads from that
    // land's side: 3 came at it, 1 answered.
    expect(after.log).toContainEqual(expect.objectContaining({
      type: "march-resolved", targetFactionId: "beta", sourceFactionId: foe,
      amount: 1, incoming: 3, counter: 1,
    }));
  });

  it("is shaved by the ground: hill country holds what open land loses", () => {
    // The excess is asked of what actually LANDS. A 4 reduced to 3 against 3
    // standing is exactly equal, and exactly equal holds.
    const base = playingSix();
    const armed: GameState = {
      ...base,
      passives: { alpha: ["hill-country"] },
      defense: { alpha: 3 },
      marches: {
        "1": {
          id: 1, actor: "beta", from: "beta", to: "alpha", cardId: "great-raid",
          damage: 4, holdsArmy: true, expiry: base.turn + 1,
        },
      },
    };
    const after = landMarches(armed);
    expect(after.defense.alpha).toBe(0);
    expect(after.overlords.get("alpha")).toBeUndefined();
    // On open ground the same arrow takes it.
    const open = landMarches({ ...armed, passives: {} });
    expect(open.overlords.get("alpha")).toBe("beta");
  });

  it("breaks a land for a leaderless raider without taking it", () => {
    // A raid out of the grey middle is a raid, not a conquest, however hard it
    // lands - and the blow it dealt is still a line, or an arrow would come off
    // the map with nothing said about it.
    const g = playingSix();
    const raider = g.factionIds.filter((f) => !hasRuler(g.rulers, f))[0];
    const target = g.factionIds.find(
      (f) => f !== raider && hasRuler(g.rulers, f),
    )!;
    const before = g.log.length;
    const after = beginTurn({
      ...g,
      current: 0,
      defense: { [target]: 1 },
      marches: {
        "1": {
          id: 1, actor: raider, from: raider, to: target, cardId: "raid",
          damage: 3, holdsArmy: true, expiry: g.turn,
        },
      },
    }, rng());
    expect(after.defense[target]).toBe(0);
    expect(after.overlords.get(target)).toBeUndefined();
    expect(fresh(after, before)).toContainEqual(expect.objectContaining({
      type: "march-resolved", targetFactionId: target, amount: 1,
    }));
  });

  it("asks the conquering person how many defenders follow it in", () => {
    // The same question a walk-in raises, from a blow that had to break the
    // land first: keyed by faction, from the land the army marched out of.
    const after = oneArrow(2, "alpha", 1);
    expect(after.pendingTransfers).toEqual({ beta: [{ from: "beta", to: "alpha" }] });
  });
});

describe("a run that ends at turn start", () => {
  /** A board where one more land wins it, and an arrow about to land on a
   *  flattened neighbour is what takes that land. */
  function oneLandShort(actor: string, current: number): GameState {
    const base = playingSix();
    expect(victoryRealmSize(base.factionIds.length)).toBe(3);
    const target = base.factionIds.find(
      (f) => f !== actor && f !== "gamma",
    )!;
    return {
      ...base,
      current,
      // Two lands already: itself and a vassal. The capture is the third.
      overlords: new Map([...base.overlords, ["gamma", actor]]),
      defense: { [target]: 0, [actor]: 40 },
      marches: {
        "1": {
          id: 1, actor, from: actor, to: target, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn,
        },
      },
    };
  }

  it("ends it THEN, not at somebody's next play", () => {
    // A claim answering, an army walking into a flattened land and a dormant
    // land's raid all resolve here. Only playCard used to compute an ending,
    // so a run won at turn start sat unnoticed for a whole round with the
    // board saying one thing and the screen another.
    const g = oneLandShort("beta", 0); // seat 0 is the human's
    const after = beginTurn(g, rng());
    expect(after.phase).toBe("victory");
    expect(after.log.at(-1)).toMatchObject({ type: "victory" });
  });

  it("and names a rival's unification the same way", () => {
    const base = playingSix();
    const rival = base.factionIds.find(
      (f) => f !== "beta" && f !== "gamma" && hasRuler(base.rulers, f),
    )!;
    const seat = base.players.findIndex((p) => p.factionId === rival);
    const g = { ...oneLandShort(rival, seat), current: seat };
    const after = beginTurn(g, rng());
    expect(after.phase).toBe("defeat");
    expect(after.log.at(-1)).toMatchObject({
      type: "unified", overlordFactionId: rival,
    });
  });

  it("leaves an ordinary turn's phase alone", () => {
    const g = { ...playingSix(), current: 0 };
    expect(beginTurn(g, rng()).phase).toBe("playing");
  });
});

describe("playing on past a won run", () => {
  /** A won board: beta holds itself plus a vassal, and 2 of 4 wins. */
  function won(): GameState {
    let g = playingState();
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("victory");
    return after;
  }

  it("keepPlaying refuses anything but a victory, by identity", () => {
    // Identity and not a thrown error: `commitDecision` reads an unchanged
    // state as refused, which is how the router reports it to the player.
    const playing = playingState();
    expect(keepPlaying(playing)).toBe(playing);
    const conceded = surrender(playing);
    expect(keepPlaying(conceded)).toBe(conceded);
    const menu = startGame(newGame(FACTIONS, undefined, {}, undefined, maxes(FACTIONS)));
    expect(keepPlaying(menu)).toBe(menu);
  });

  it("hands the run back and says so in the log", () => {
    const after = keepPlaying(won());
    expect(after.phase).toBe("playing");
    expect(after.playingOn).toBe(true);
    expect(after.log.at(-1)).toMatchObject({ type: "played-on" });
    // A verdict, not a turn boundary: whoever's turn it was still has it.
    expect(after.current).toBe(won().current);
    expect(after.playedThisTurn).toBe(won().playedThisTurn);
  });

  it("moves the human's bar to the whole map and nobody else's", () => {
    const g = playingState();
    const half = victoryRealmSize(g.factionIds.length);
    for (const f of g.factionIds) expect(winSizeFor(g, f)).toBe(half);
    const on = { ...g, playingOn: true };
    expect(winSizeFor(on, "beta")).toBe(g.factionIds.length);
    for (const f of g.factionIds.filter((f) => f !== "beta")) {
      expect(winSizeFor(on, f)).toBe(half);
    }
  });

  /** A resumed run with a turn to play. The card that won it spent the turn
   *  it was played on, and the next one arrives through `advance` at the top
   *  of the round; these skip straight to it. */
  function playedOn(): GameState {
    return { ...keepPlaying(won()), playedThisTurn: false };
  }

  it("does not re-fire the victory it was resumed out of", () => {
    let g = playedOn();
    // Still holding exactly what won it, and a whole turn to play.
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("playing");
    expect(after.log.filter((e) => e.type === "victory")).toHaveLength(1);
  });

  it("ends for real at the whole map, and the line says which bar", () => {
    let g = playedOn();
    g = {
      ...g,
      overlords: new Map([["gamma", "beta"], ["alpha", "beta"], ["delta", "beta"]]),
    };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("victory");
    expect(after.log.at(-1)).toMatchObject({ type: "victory", playOn: true });
  });

  it("can still be lost to a rival crossing the half it never left", () => {
    // The whole point of the offer being a decision: the rival's bar did not
    // move, so the run the player declined to end can still end against them.
    let g = playedOn();
    g = { ...g, overlords: new Map([["alpha", "delta"]]) };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("defeat");
    expect(after.log.at(-1)).toMatchObject({
      type: "unified", overlordFactionId: "delta",
    });
  });

  it("can still be lost by being incorporated", () => {
    let g = playedOn();
    g = { ...g, incorporated: { ...g.incorporated, beta: "delta" } };
    g = withHand(g, 0, ["grow-crops"]);
    const after = playCard(g, 0, rng());
    expect(after.phase).toBe("defeat");
    expect(after.log.at(-1)).toMatchObject({
      type: "defeat", targetFactionId: "beta", overlordFactionId: "delta",
    });
  });

  it("resumes a victory read at an AI seat's turn start without hanging", () => {
    // The reason `keep-playing` settles as an action. The ending was read in
    // `beginTurn` for a seat whose turn is still open, so nothing has spent
    // it: the chain has to be able to carry that seat's turn from here.
    const base = playingSix();
    const vassals = ["gamma", "delta"];
    // Not one of the vassals: the independence gate is checked at a vassal's
    // OWN turn start, so seating the turn there would free it and take the
    // board back below the bar before the ending was ever read.
    const rival = base.factionIds.find(
      (f) => f !== "beta" && !vassals.includes(f) && hasRuler(base.rulers, f),
    )!;
    const seat = base.players.findIndex((p) => p.factionId === rival);
    const ended = beginTurn(
      {
        ...base,
        current: seat,
        overlords: new Map([
          ...base.overlords, ...vassals.map((v) => [v, "beta"] as const),
        ]),
      },
      rng(),
    );
    expect(ended.phase).toBe("victory");
    const resumed = keepPlaying(ended);
    expect(resumed.current).toBe(seat);
    expect(resumed.playedThisTurn).toBe(false);
    // `advance` no-ops on an open turn, so the AI chain is what moves it.
    expect(advance(resumed, rng()).current).toBe(seat);
    const played = advance(aiTakeTurn(resumed, rng()), rng());
    expect(played.current).not.toBe(seat);
  });

  it("advances a play-on board on which every rival has been swallowed", () => {
    // `advance` throws when no seat will take a turn, and its comment says a
    // unification ends the run before that can happen. Playing on is the case
    // that tests it: the human's own seat is never skipped.
    let g = playedOn();
    g = {
      ...g,
      incorporated: Object.fromEntries(
        g.factionIds.filter((f) => f !== "beta").map((f) => [f, "beta"]),
      ),
      playedThisTurn: true,
    };
    // Still one land short of the whole map is impossible here - swallowing
    // every rival IS the whole map - so this is the last turn either way.
    expect(() => advance(g, rng())).not.toThrow();
  });
});

describe("the defense transfer", () => {
  /** The human's own capture leaves the question pending; an AI's does not.
   *
   *  The round wrap that lands the march also lets the quiet lands take their
   *  restless swings, and on this seed gamma takes a point off beta on the way
   *  past. These tests are about what the TRANSFER moves, so the two numbers
   *  are restated after the capture rather than left to the weather. */
  function captured(): GameState {
    const g = withHand(
      { ...playingSix(), defense: { alpha: 0, beta: 40 } }, 0, ["raid"],
    );
    const landed = landMarches(playCard(g, 0, rng(), "alpha", { sourceId: "beta" }));
    return { ...landed, defense: { alpha: 0, beta: 40 } };
  }

  it("asks the human, and answers nothing until they say", () => {
    const after = captured();
    expect(after.pendingTransfers).toEqual({ beta: [{ from: "beta", to: "alpha" }] });
    expect(after.defense.alpha).toBe(0);
    expect(after.defense.beta).toBe(40);
  });

  it("moves the points the player names and clears the question", () => {
    const g = captured();
    const after = transferDefense(g, "beta", 10);
    expect(after.defense.beta).toBe(30);
    expect(after.defense.alpha).toBe(10);
    expect(after.pendingTransfers).toEqual({});
    expect(after.log.at(-1)).toMatchObject({
      type: "transferred", targetFactionId: "alpha", sourceFactionId: "beta",
      amount: 10,
    });
  });

  it("clamps to what the origin holds", () => {
    const g = captured();
    expect(transferLimit(g, "beta", "alpha")).toBe(40);
    const after = transferDefense(g, "beta", 9999);
    expect(after.defense.beta).toBe(0);
    expect(after.defense.alpha).toBe(40);
    expect(after.log.at(-1)).toMatchObject({ type: "transferred", amount: 40 });
  });

  it("clamps to the room the destination has - points past a ceiling would vanish", () => {
    const g = { ...captured(), defense: { alpha: FIXTURE_MAX - 5, beta: 40 } };
    expect(transferLimit(g, "beta", "alpha")).toBe(5);
    const after = transferDefense(g, "beta", 40);
    expect(after.defense.beta).toBe(35);
    // A land back at its ceiling drops its key, the pristine convention.
    expect(after.defense.alpha).toBeUndefined();
  });

  it("0 is a real answer: the question closes and nothing moves", () => {
    const g = captured();
    const before = g.log.length;
    const after = transferDefense(g, "beta", 0);
    expect(after.pendingTransfers).toEqual({});
    expect(after.defense.beta).toBe(40);
    expect(fresh(after, before)).toEqual([]);
  });

  it("does nothing at all when no capture is waiting on an answer", () => {
    const g = playingSix();
    expect(transferDefense(g, "beta", 10)).toBe(g);
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
        "1": {
          id: 1, actor: raider, from: raider, to: target, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn,
        },
      },
    };
    const after = beginTurn(g, rng());
    expect(after.overlords.get(target)).toBe(raider);
    expect(after.pendingTransfers).toEqual({});
    expect(after.defense[raider]).toBe(20);
    expect(after.defense[target]).toBe(20);
  });

  it("asks EVERY person, not only the seat the phase speaks for", () => {
    // The two humans of a net game must play the same rules. Spelled as a
    // single `humanSeat`, this branch asked the host how many defenders to
    // send and moved half out of the guest's land without asking at all.
    const base = playingSix();
    const raider = base.factionIds.find(
      (f) => f !== "beta" && hasRuler(base.rulers, f),
    )!;
    const target = base.factionIds.find((f) => f !== "beta" && f !== raider)!;
    const raiderSeat = base.players.findIndex((p) => p.factionId === raider);
    const g: GameState = {
      ...base,
      humanSeats: [0, raiderSeat],
      current: raiderSeat,
      defense: { [target]: 0, [raider]: 40 },
      marches: {
        "1": {
          id: 1, actor: raider, from: raider, to: target, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn,
        },
      },
    };
    const after = beginTurn(g, rng());
    expect(after.overlords.get(target)).toBe(raider);
    expect(after.pendingTransfers).toEqual({
      [raider]: [{ from: raider, to: target }],
    });
    // Nothing moved: the question is open, and the automatic half must not
    // fire behind it.
    expect(after.defense[raider]).toBe(40);
    expect(after.defense[target]).toBe(0);
  });

  it("keeps the two people's questions apart", () => {
    // One slot would have let whoever conquered first hold the only question
    // on the board, and the other person's conquest fall through to the
    // automatic half they were never asked about.
    const base = playingSix();
    const other = base.factionIds.find((f) => f !== "beta")!;
    const g: GameState = {
      ...base,
      pendingTransfers: {
        beta: [{ from: "beta", to: "alpha" }],
        [other]: [{ from: other, to: "alpha" }],
      },
      defense: { alpha: 0, beta: 40, [other]: 40 },
    };
    const after = transferDefense(g, "beta", 10);
    expect(after.pendingTransfers).toEqual({
      [other]: [{ from: other, to: "alpha" }],
    });
    expect(after.defense.beta).toBe(30);
  });

  it("asks once per conquest, in the order the lands fell", () => {
    // A turn that takes three lands owes three answers. One slot per faction
    // kept the first question and dropped the other two, so two conquests
    // sent no defenders at all and the player was never told why.
    const base = playingSix();
    const g: GameState = {
      ...base,
      pendingTransfers: {
        beta: [
          { from: "beta", to: "alpha" },
          { from: "beta", to: "gamma" },
          { from: "beta", to: "delta" },
        ],
      },
      defense: { alpha: 0, gamma: 0, delta: 0, beta: 40 },
    };
    // Each answer pops the front and leaves the rest standing.
    const first = transferDefense(g, "beta", 4);
    expect(first.pendingTransfers.beta).toEqual([
      { from: "beta", to: "gamma" }, { from: "beta", to: "delta" },
    ]);
    expect(first.defense.alpha).toBe(4);
    const second = transferDefense(first, "beta", 3);
    expect(second.pendingTransfers.beta).toEqual([{ from: "beta", to: "delta" }]);
    expect(second.defense.gamma).toBe(3);
    // The last answer clears the key rather than leaving an empty queue - an
    // empty one reads as "a question is waiting" to anything asking by key.
    const third = transferDefense(second, "beta", 2);
    expect(third.pendingTransfers).toEqual({});
    expect(third.defense.delta).toBe(2);
  });

  it("queues a question per land when one turn takes several", () => {
    // Through the real conquest path rather than a hand-built store: three
    // arrows, three lands, three questions.
    const base = playingTen();
    const targets = ["alpha", "gamma", "delta"];
    const after = landMarches({
      ...base,
      defense: Object.fromEntries([
        ...targets.map((t) => [t, 0]), ["beta", 40],
      ]),
      marches: Object.fromEntries(targets.map((t, i) => [
        String(i + 1),
        {
          id: i + 1, actor: "beta", from: "beta", to: t, cardId: "raid",
          damage: 1, holdsArmy: true, expiry: base.turn + 1,
        },
      ])),
    });
    expect(after.pendingTransfers.beta).toHaveLength(3);
    expect(after.pendingTransfers.beta.map((q) => q.to).sort())
      .toEqual([...targets].sort());
    // Nothing moved yet: every question is still open.
    expect(after.defense.beta).toBe(40);
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

  it("moves its own counter forward when a restless raid draws an id", () => {
    // beginTurn stages `nextMarchId` locally the same way it stages
    // `marches`, and has to return both - a raid declared here that never
    // advanced the counter in the returned state would hand its id straight
    // back out to whatever declares next.
    const g = playingSix();
    const quiet = quietLands(g);
    expect(quiet.length).toBeGreaterThan(0);
    const after = beginTurn({ ...g, current: 0, turn: g.turn + 1 }, always);
    expect(after.nextMarchId).toBeGreaterThan(g.nextMarchId);
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

  it("says which status sent it, and indents the raid under it", () => {
    // A land with no ruler and no turn putting an arrow on the map is the game
    // breaking its own stated rules as far as the player can tell. The status
    // that permits it says so on its own line, and the raid is that line's
    // consequence.
    const g = playingSix();
    const after = beginTurn({ ...g, current: 0, turn: g.turn + 1 }, always);
    const raid = after.log.findIndex(
      (e) => e.type === "play" && quietLands(g).includes(e.sourceFactionId ?? ""),
    );
    expect(raid).toBeGreaterThan(0);
    expect(after.log[raid - 1]).toMatchObject({
      type: "passive-fired", passiveId: "keeps-to-itself",
      targetFactionId: after.log[raid].sourceFactionId,
    });
    expect(after.log[raid].consequence).toBe(true);
    // The cause states itself at the top level - a reason indented under
    // nothing is worse than no reason at all.
    expect(after.log[raid - 1].consequence).toBeUndefined();
  });

  it("never sends one out of a land taken moments earlier in this same wrap", () => {
    // The capture and the declaration are twenty lines apart in one
    // `beginTurn`: the seat's own marches land at its turn start, and the wrap
    // follows. Read off the snapshot the turn began with, the land was still
    // quiet and sent one last raid at its brand-new lord - an arrow leaving a
    // polygon inside the player's own outline.
    const g = playingSix();
    const actor = g.players[0].factionId;
    const quiet = quietLands(g).find((f) => f !== actor)!;
    const turn = g.turn + 1;
    const after = beginTurn(
      {
        ...g,
        current: 0,
        turn,
        defense: { ...g.defense, [quiet]: 0 },
        marches: {
          "1": {
            id: 1, actor, from: actor, to: quiet, cardId: "raid",
            damage: 1, holdsArmy: true, expiry: turn,
          },
        },
      },
      always,
    );
    expect(after.overlords.get(quiet)).toBe(actor);
    expect(hasPassive(after.passives, quiet, "keeps-to-itself")).toBe(false);
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
    // the key, because an id says nothing about when its march landed.
    for (const m of Object.values(nextRound.marches)) {
      expect(m.expiry).toBeGreaterThan(nextRound.turn);
    }
    expect(nextRound.log.some((e) => e.type === "march-resolved")).toBe(true);
  });
});

describe("a status that does something says so", () => {
  const always = () => 0;

  it("names Wild lands above the heal, and indents the heal under it", () => {
    // A defense score climbing on its own, with no line saying why, reads as a
    // land playing a card it is not allowed to hold - which is exactly how it
    // was read.
    const g = playingSix();
    const wild = g.factionIds.find(
      (f) => hasPassive(g.passives, f, "wild-lands"),
    )!;
    const before = g.log.length;
    const after = beginTurn(
      { ...g, current: 0, turn: g.turn + 1, defense: { [wild]: 1 } }, always,
    );
    const batch = fresh(after, before);
    const heal = batch.findIndex(
      (e) => e.type === "healed" && e.targetFactionId === wild,
    );
    expect(heal).toBeGreaterThan(0);
    expect(batch[heal - 1]).toMatchObject({
      type: "passive-fired", passiveId: "wild-lands", targetFactionId: wild,
    });
    expect(batch[heal].consequence).toBe(true);
    expect(batch[heal - 1].consequence).toBeUndefined();
  });

  it("names No successor above the land falling to the killer", () => {
    // This one fires INSIDE a play's batch, so it has both a cause above it
    // and a consequence below - and the status still states itself at the top
    // level, because the reason must not sit a level under the thing it
    // explains.
    // `playingState`, not `playingSix`: the target needs a ruler to lose, and
    // only an acting faction has one.
    const g: GameState = {
      ...playingState(),
      passives: { alpha: ["no-successor"] },
    };
    const before = g.log.length;
    const after = playCard(
      withHand(g, 0, ["assassinate-ruler"]), 0, rng(), "alpha",
    );
    const batch = fresh(after, before);
    const fired = batch.findIndex((e) => e.type === "passive-fired");
    expect(fired).toBeGreaterThan(0);
    expect(batch[fired]).toMatchObject({
      passiveId: "no-successor", targetFactionId: "alpha",
    });
    expect(batch[fired].consequence).toBeUndefined();
    expect(batch[fired + 1]).toMatchObject({
      type: "subjugated", targetFactionId: "alpha", consequence: true,
    });
  });
});

describe("the hostile keyword, past the targeting pass", () => {
  /** beta (the human) with alpha as its brand-new overlord - and held UNDER
   *  its independence gate, or the turn-start clock frees it before any of
   *  this is asked and the fixture quietly tests a free faction. */
  const underAlpha = (g: GameState): GameState => ({
    ...g,
    overlords: new Map([["beta", "alpha"]]),
    defense: { ...g.defense, beta: INDEPENDENCE_LINE - 1 },
  });

  it("lapses an arrow already in flight when its target becomes your lord", () => {
    // The arrow was legal when it was drawn. Somebody's subjugation changed
    // the shape of the pyramid under it, and a rule that only ran at the
    // moment of aiming would let it land anyway.
    let g = withHand(playingState(LINE_ADJ), 0, ["raid"]);
    g = playCard(g, 0, rng(), "alpha");
    expect(Object.values(g.marches).some((m) => m.to === "alpha")).toBe(true);
    const after = landMarches(underAlpha(g));
    expect(after.marches).toEqual({});
    expect(after.defense.alpha).toBeUndefined(); // nothing landed
    expect(after.log.find((e) => e.type === "march-lapsed")).toMatchObject({
      cardId: "raid", targetFactionId: "alpha", sourceFactionId: "beta",
    });
  });

  it("a Plague spares a lord's land, stacks and all", () => {
    // Plague has no aim - it lands wherever the actor's stacks already sit,
    // which may be a land seeded before the actor knelt to anybody.
    const g = underAlpha({
      ...withHand(playingState(LINE_ADJ), 0, ["plague"]),
      disease: { alpha: { beta: 3 }, gamma: { beta: 2 } },
    });
    const after = playCard(g, 0, rng());
    expect(after.defense.alpha).toBeUndefined();
    expect(after.disease.alpha).toEqual({ beta: 3 }); // untouched, not burned
    expect(after.defense.gamma).toBe(FIXTURE_MAX - 2 * PLAGUE_DAMAGE_PER_STACK);
    expect(after.log.some(
      (e) => e.type === "plagued" && e.targetFactionId === "alpha",
    )).toBe(false);
  });

  it("Foul winds leaves a lord's stacks where they are", () => {
    // Claiming the stacks on a lord's land is how the NEXT plague would strike
    // it, so the store and the log must both stop at the pyramid.
    const g = underAlpha({
      ...withHand(playingState(LINE_ADJ), 0, ["foul-winds"]),
      disease: { alpha: { gamma: 4 }, delta: { gamma: 1 } },
    });
    const after = playCard(g, 0, rng());
    expect(after.disease.alpha).toEqual({ gamma: 4 });
    expect(after.disease.delta).toEqual({ beta: 1 });
    expect(after.log.some(
      (e) => e.type === "winds-shifted" && e.targetFactionId === "alpha",
    )).toBe(false);
  });
});

describe("every allegiance change names the route that took the land", () => {
  // The drift guard. Four routes reach a `subjugated` today and the notice
  // renders whichever one the event names; a fifth that forgot to name its
  // route would fall back to "A conquest" on the one surface the player reads,
  // silently, exactly as the hardcoded `card("subjugate")` did before it. The
  // required `cause` argument makes that hard to do and this makes it loud.
  it("holds across a seeded game", () => {
    const rng = seededRng(1);
    let state: GameState = pickFaction(
      chooseBuild(
        startGame(newGame(
          SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES, SIM_SITE_CAPS,
          SIM_DEFENSE_MAX,
        )),
        "warpath", seededRng(1),
      ),
      BASELINE_FACTION,
      rng,
    );
    while (state.phase === "playing" && state.turn <= 120) {
      const next = state.current === 0
        ? naiveHumanTurn(state, rng)
        : aiTakeTurn(state, rng);
      if (!next.playedThisTurn) throw new Error(`stuck turn ${state.turn}`);
      state = next.phase === "playing" ? advance(next, rng) : next;
    }
    const taken = state.log.filter((e) => e.type === "subjugated");
    // Not vacuous: lands did change hands, and every one of them by an army
    // walking in. Subjugate is withdrawn from every pool, so `conquest` is what
    // an ordinary game is made of - which is the whole of the bug this guards.
    expect(taken.length).toBeGreaterThan(0);
    expect(taken.map((e) => e.via)).toContain("conquest");
    for (const e of taken) {
      expect(e.via, `turn ${e.turn}, ${e.targetFactionId}`).toBeDefined();
      // And the route's own half of the cause came with it.
      expect(
        e.via === "passive" ? e.passiveId : e.cardId,
        `turn ${e.turn}, ${e.targetFactionId}`,
      ).toBeDefined();
    }
  });
});

describe("every march that leaves the store is named by an event", () => {
  it("holds across a dozen rounds of a seeded game", () => {
    // The correlation the presentation layer needs. A clash retires two
    // arrows and emits one event, so this cannot be checked one for one - it
    // is a set difference against the union of what the batch names.
    const rng = seededRng(2);
    let g: GameState = pickFaction(
      chooseBuild(
        startGame(newGame(
          SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES, SIM_SITE_CAPS,
          SIM_DEFENSE_MAX,
        )),
        "warpath", seededRng(2),
      ),
      BASELINE_FACTION,
      rng,
    );
    // Walk turns until several seats have marches in flight at once, the
    // same seeded-game loop this file already drives above.
    while (g.phase === "playing" && Object.keys(g.marches).length < 4) {
      const next = g.current === 0 ? naiveHumanTurn(g, rng) : aiTakeTurn(g, rng);
      if (!next.playedThisTurn) throw new Error(`stuck turn ${g.turn}`);
      g = next.phase === "playing" ? advance(next, rng) : next;
    }
    for (let round = 0; round < 12 && g.phase === "playing"; round++) {
      const before = new Set(Object.values(g.marches).map((m) => m.id));
      const logAt = g.log.length;
      const next = g.current === 0 ? naiveHumanTurn(g, rng) : aiTakeTurn(g, rng);
      if (!next.playedThisTurn) throw new Error(`stuck turn ${g.turn}`);
      g = next.phase === "playing" ? advance(next, rng) : next;
      const after = new Set(Object.values(g.marches).map((m) => m.id));
      const departed = [...before].filter((id) => !after.has(id));
      const named = new Set(
        g.log.slice(logAt).flatMap((e) => e.marchIds ?? []),
      );
      expect(departed.filter((id) => !named.has(id))).toEqual([]);
    }
  });
});
