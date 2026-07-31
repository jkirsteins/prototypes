import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, beginTurn, playCard, discardCard,
  advance, surrender, viewOf,
  OPENING_HAND, victoryRealmSize, type GameState,
} from "../src/game";
import {
  DECK_SIZE, buildDeck, isTributeCard, CARDS, TRIBUTE_CARDS, type Rng,
} from "../src/cards";
import {
  allianceKey, bumpMight, bumpStatus, getRel, leadsOf, type Relations,
} from "../src/relations";
import {
  INCORPORATE_RAMP, PASSIVE_PER_LANDS, loyaltyKey, playableSet, raidYield,
  subjugationGripOn,
} from "../src/playability";
import { rulerOf } from "../src/rulers";
import { runTurnips, runXp } from "../src/xp";
import pools from "../src/data/ruler-names.json";

const POOLS = pools as Record<string, string[]>;

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

function playingState(adj?: Record<string, string[]>): GameState {
  return pickFaction(
    chooseDeck(startGame(newGame(FACTIONS, adj)), buildDeck()),
    "beta",
    seededRng(1),
  );
}

function withHand(g: GameState, playerIdx: number, hand: string[]): GameState {
  const p = { ...g.players[playerIdx], hand };
  return { ...g, players: g.players.map((pl, i) => (i === playerIdx ? p : pl)) };
}

function withRel(g: GameState, relations: Relations): GameState {
  return { ...g, relations };
}

/** Makes the human a vassal of `lord` for tests that are about something else.
 *  Keeping a Seeds of revolt in the deck is not decoration: a human vassal
 *  holding no escape card in any pile is a dead run, and playCard ends it on
 *  the spot, so a fixture that hand-sets `overlords` and then replaces the hand
 *  can silently stop testing what it meant to. */
function asVassal(g: GameState, lord: string): GameState {
  const human = g.players[0];
  // Into the DECK, not merely "somewhere in the piles": these fixtures go on to
  // replace the hand, which would throw away the only copy if it happened to be
  // dealt there.
  return {
    ...g,
    overlords: new Map([...g.overlords, [human.factionId, lord]]),
    players: g.players.map((pl, i) =>
      i === 0 && !pl.deck.includes("seeds-of-revolt")
        ? { ...pl, deck: [...pl.deck, "seeds-of-revolt"] }
        : pl,
    ),
  };
}

/** actor leads target by n might */
function mightLead(rel: Relations, actor: string, target: string, n: number): Relations {
  let out = rel;
  for (let i = 0; i < n; i++) out = bumpMight(out, actor, target);
  return out;
}

const rng = () => seededRng(7);

describe("setup", () => {
  it("newGame initializes v2 state", () => {
    const g = newGame(FACTIONS);
    expect(g.phase).toBe("main-menu");
    expect(g.overlords.size).toBe(0);
    expect(g.adjacency.alpha.sort()).toEqual(["beta", "delta", "gamma"]);
    expect(g.alliances).toEqual({});
    expect(g.diplomacyBoost).toEqual([]);
    expect(g.bodyguards).toEqual([]);
  });

  it("pickFaction deals opening hands of 3 plus the first draw, without opening-draw log spam", () => {
    const g = playingState();
    expect(g.players.map((p) => p.factionId)).toEqual(["beta", "alpha", "gamma", "delta"]);
    expect(g.players[0].hand).toHaveLength(OPENING_HAND + 1); // +1 = turn draw
    expect(g.players[0].deck).toHaveLength(DECK_SIZE - OPENING_HAND - 1);
    expect(g.players[1].hand).toHaveLength(OPENING_HAND);
    expect(g.log.filter((e) => e.type === "draw")).toHaveLength(1); // only the turn draw
  });
});

const NON_BASICS = [
  "raid", "shrewd-marriage", "fortify", "subjugate",
  "incorporate", "seeds-of-revolt",
  "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
  "favourable-omens", "found-settlement",
];

/** A vassalage held long enough that Incorporate is certain, so a test about
 *  what incorporation DOES is not silently also a test of the loyalty roll. */
function digested(g: GameState, land: string, lord: string): GameState {
  return {
    ...g,
    loyalty: { ...g.loyalty, [loyaltyKey(land, lord)]: INCORPORATE_RAMP },
  };
}

function pickAt(seed: number): GameState {
  return pickFaction(
    chooseDeck(startGame(newGame(FACTIONS)), buildDeck()),
    "beta",
    seededRng(seed),
  );
}

describe("pickFaction AI decks", () => {
  it("AI players' cards are drawn only from valid deck-buildable ids, DECK_SIZE total", () => {
    const g = pickAt(3);
    for (const p of g.players.slice(1)) {
      const all = [...p.hand, ...p.deck, ...p.discard];
      expect(all).toHaveLength(DECK_SIZE);
      for (const id of all) {
        expect(["grow-crops", ...NON_BASICS]).toContain(id);
      }
    }
  });

  it("AI decks are randomized: some seed yields an AI non-basic set unlike the exhaustive default", () => {
    let sawDifference = false;
    for (let seed = 1; seed <= 40 && !sawDifference; seed++) {
      const g = pickAt(seed);
      for (const p of g.players.slice(1)) {
        const nonBasicIds = [...p.hand, ...p.deck, ...p.discard]
          .filter((id) => CARDS[id]?.maxPerDeck !== null);
        if (new Set(nonBasicIds).size !== NON_BASICS.length) sawDifference = true;
      }
    }
    expect(sawDifference).toBe(true);
  });

  it("human deck is unaffected by AI randomization: same multiset as the chosen humanDeck", () => {
    const g = pickAt(5);
    const human = g.players[0];
    const humanCards = [...human.hand, ...human.deck, ...human.discard];
    expect(humanCards.sort()).toEqual(buildDeck().sort());
  });
});

describe("beginTurn", () => {
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
});

describe("playCard validation", () => {
  it("rejects cards outside the playable set and bad targets", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["raid", "subjugate"]);
    expect(playCard(g, 1, rng(), "alpha")).toBe(g); // no lead: subjugate unplayable
    expect(playCard(g, 0, rng())).toBe(g); // raid without target
    expect(playCard(g, 0, rng(), "delta")).toBe(g); // not adjacent to beta
    expect(playCard(g, 5, rng(), "alpha")).toBe(g); // out of range
  });

  it("rejects playing while the hand demands a discard, and discarding while playable", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["subjugate"]);
    expect(playCard(g, 0, rng(), "alpha")).toBe(g);
    const d = discardCard(g, 0);
    expect(d).not.toBe(g);
    const g2 = withHand(playingState(LINE_ADJ), 0, ["grow-crops"]);
    expect(discardCard(g2, 0)).toBe(g2);
  });

  it("a tribute card carries its own track - playing it is the whole decision", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    // free faction: no lord to pay, so neither tribute card resolves
    const free = withHand(playingState(LINE_ADJ), 0, ["pay-military-tribute"]);
    expect(playCard(free, 0, rng())).toBe(free);
    for (const [cardId, track] of Object.entries(TRIBUTE_CARDS)) {
      const after = playCard(withHand(g, 0, [cardId]), 0, rng());
      // find, not at(-1): a vassal with no escape is stranded on the same play
      expect(after.log.find((e) => e.type === "tribute"))
        .toMatchObject({ type: "tribute", track });
    }
  });
});

describe("card effects", () => {
  it("raids another overlord's vassal without changing the overlord relation", () => {
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([["gamma", "delta"]]),
    };
    g = withHand(g, 0, ["raid"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(leadsOf(after.relations, "beta", "gamma").might).toBe(1);
    expect(leadsOf(after.relations, "beta", "delta").might).toBe(0);
  });

  it("raid and marriage bump one pair; fortify bumps everyone living", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid", "shrewd-marriage", "fortify"]);
    const afterRaid = playCard(g, 0, rng(), "alpha");
    expect(getRel(afterRaid.relations, "beta", "alpha").might).toBe(1);
    const afterMarriage = playCard(g, 1, rng(), "gamma");
    expect(getRel(afterMarriage.relations, "beta", "gamma").status).toBe(1);
    g = { ...g, incorporated: { delta: "gamma" } };
    const afterFortify = playCard(g, 2, rng());
    expect(getRel(afterFortify.relations, "beta", "alpha").might).toBe(1);
    expect(getRel(afterFortify.relations, "beta", "gamma").might).toBe(1);
    expect(getRel(afterFortify.relations, "beta", "delta").might).toBe(0); // incorporated
  });

  it("subjugate stores the overlord, injects 2 tribute cards, logs", () => {
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
    const gammaPlayer = after.players.find((p) => p.factionId === "gamma")!;
    const tributes = [...gammaPlayer.deck, ...gammaPlayer.hand, ...gammaPlayer.discard]
      .filter(isTributeCard);
    expect(tributes).toHaveLength(2);
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugated", targetFactionId: "gamma", overlordFactionId: "beta",
    });
    expect(g.overlords.size).toBe(0); // input untouched
  });

  it("subjugate poaches and frees the target's own vassals with tribute cleanup", () => {
    let g = playingState(LINE_ADJ);
    // gamma holds delta; beta out-leads and takes gamma
    g = { ...g, overlords: new Map([["delta", "gamma"]]) };
    let deltaP = g.players.find((p) => p.factionId === "delta")!;
    deltaP = { ...deltaP, deck: [...deltaP.deck, ...Object.keys(TRIBUTE_CARDS)] };
    g = { ...g, players: g.players.map((p) => (p.factionId === "delta" ? deltaP : p)) };
    // gamma's realm (self + vassal delta) is size 2, so the scaled subjugate
    // threshold here is 4, not the flat 2.
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 4));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
    expect(after.overlords.has("delta")).toBe(false);
    const freedDelta = after.players.find((p) => p.factionId === "delta")!;
    expect(
      [...freedDelta.deck, ...freedDelta.hand, ...freedDelta.discard]
        .filter(isTributeCard),
    ).toHaveLength(0);
    expect(after.log.some((e) => e.type === "released" && e.targetFactionId === "delta")).toBe(true);
  });

  it("poaching bumps the vassal's lead over the former lord by +1 Might and +1 Status", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "alpha"]]) };
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    const l = leadsOf(after.relations, "gamma", "alpha");
    expect(l.might).toBe(1);
    expect(l.status).toBe(1);
  });

  it("does not apply the vassal-loss penalty on a first subjugation (no former lord)", () => {
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(leadsOf(after.relations, "gamma", "alpha")).toEqual({ might: 0, status: 0 });
  });

  it("poaching replaces tribute copies instead of stacking them", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "alpha"]]) };
    let gammaP = g.players.find((p) => p.factionId === "gamma")!;
    gammaP = { ...gammaP, deck: [...gammaP.deck, ...Object.keys(TRIBUTE_CARDS)] };
    g = { ...g, players: g.players.map((p) => (p.factionId === "gamma" ? gammaP : p)) };
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    const poached = after.players.find((p) => p.factionId === "gamma")!;
    expect(
      [...poached.deck, ...poached.hand, ...poached.discard]
        .filter(isTributeCard),
    ).toHaveLength(2);
  });

  it("incorporate is permanent and ends the game when the human falls", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = digested(g, "gamma", "beta");
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.incorporated).toEqual({ gamma: "beta" });
    expect(after.overlords.has("gamma")).toBe(false);
    expect(after.phase).toBe("playing");

    // now the human is someone's vassal and gets incorporated
    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g2 = digested(g2, "beta", "gamma");
    g2 = withHand(g2, 2, ["incorporate"]);
    const dead = playCard(g2, 0, rng(), "beta");
    expect(dead.phase).toBe("defeat");
    expect(dead.log.at(-1)).toMatchObject({
      type: "defeat", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("incorporating a faction transfers its incorporated lands", () => {
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([["gamma", "beta"]]),
      incorporated: { delta: "gamma" },
    };
    g = digested(g, "gamma", "beta");
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.incorporated).toEqual({ delta: "beta", gamma: "beta" });
  });

  it("revolt is not playable while free (no overlord)", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["revolt"]);
    expect(playCard(g, 0, rng())).toBe(g);
  });

  it("revolt is playable as a vassal even under an overwhelming overlord lead", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withRel(g, mightLead(g.relations, "gamma", "beta", 10));
    g = withHand(g, 0, ["revolt"]);
    const after = playCard(g, 0, rng());
    expect(after).not.toBe(g);
    expect(after.overlords.has("beta")).toBe(false);
  });

  it("revolt strips tribute, frees the vassal, applies the vassal-loss penalty, and emits reclaimed", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    let p0 = g.players[0];
    p0 = {
      ...p0,
      deck: [...p0.deck, "pay-military-tribute"],
      discard: ["pay-status-tribute"],
      hand: ["revolt"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = playCard(g, 0, rng());
    expect(after.overlords.has("beta")).toBe(false);
    const freed = after.players[0];
    expect(
      [...freed.deck, ...freed.hand, ...freed.discard].filter(isTributeCard),
    ).toHaveLength(0);
    const l = leadsOf(after.relations, "beta", "gamma");
    expect(l.might).toBe(1);
    expect(l.status).toBe(1);
    expect(after.log.at(-1)).toMatchObject({
      type: "reclaimed", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("tribute feeds the overlord and its incorporated lands on the chosen track", () => {
    // A 4-faction roster makes gamma's realm here (itself + vassal beta +
    // incorporated delta) exactly the victory size, which would end the game
    // on this unrelated play. Widen the roster so 3 stays under threshold.
    const factions = [...FACTIONS, "epsilon", "zeta"];
    let g = pickFaction(
      chooseDeck(startGame(newGame(factions)), buildDeck()),
      "beta",
      seededRng(1),
    );
    g = asVassal({ ...g, incorporated: { delta: "gamma" } }, "gamma");
    g = withHand(g, 0, ["pay-status-tribute"]);
    const after = playCard(g, 0, rng());
    expect(getRel(after.relations, "gamma", "beta").status).toBe(1);
    expect(getRel(after.relations, "delta", "beta").status).toBe(1);
    expect(getRel(after.relations, "alpha", "beta").status).toBe(0);
    expect(after.log.at(-1)).toMatchObject({
      type: "tribute", targetFactionId: "beta", overlordFactionId: "gamma",
      track: "status",
    });
  });

  it("victory needs a 55 percent majority of the roster", () => {
    expect(victoryRealmSize(20)).toBe(11); // the old hardcoded value
    expect(victoryRealmSize(26)).toBe(15); // the Prussian roster
    expect(victoryRealmSize(4)).toBe(3);
  });

  it("victory triggers when the realm reaches the roster threshold", () => {
    // 4-faction fixture: victory needs 3, unreachable here - verify the check
    // by lowering the bar structurally: subjugating gamma makes realm 2 < 3.
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.phase).toBe("playing");
    // and by direct construction: 11 of 20 factions incorporated
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    let big = pickFaction(
      chooseDeck(startGame(newGame(many)), buildDeck()), "f0", seededRng(1),
    );
    const inc: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) inc[`f${i}`] = "f0";
    big = { ...big, incorporated: inc };
    big = withHand(big, 0, ["grow-crops"]);
    const won = playCard(big, 0, rng());
    expect(won.phase).toBe("victory");
    expect(won.log.at(-1)?.type).toBe("victory");
  });
});

describe("found a settlement", () => {
  it("records the land, logs it, and raises the bar against the realm", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["found-settlement"]);
    expect(subjugationGripOn(viewOf(g), "beta")).toEqual({ might: 2, status: 2 });
    const after = playCard(g, 0, rng(), "beta");
    expect(after.settled).toEqual(["beta"]);
    // The settlement is garrisoned ground: it raises Might and leaves Status.
    expect(subjugationGripOn(viewOf(after), "beta")).toEqual({ might: 3, status: 2 });
    expect(after.log.filter((e) => e.type === "settled")).toEqual([
      expect.objectContaining({ type: "settled", targetFactionId: "beta", playerId: 1 }),
    ]);
  });

  it("refuses a land outside the realm and a land with no site", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["found-settlement"]);
    expect(playCard(g, 0, rng(), "alpha").playedThisTurn).toBe(false);
    const noSites = { ...g, sites: [] };
    expect(playCard(noSites, 0, rng(), "beta").playedThisTurn).toBe(false);
  });

  it("leaves the settlement with the land when a vassal revolts", () => {
    // The lord settles its vassal's land, then the vassal leaves: the lord's
    // realm loses both the land and the settlement's +1.
    let g = withHand(playingState(LINE_ADJ), 0, ["found-settlement"]);
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    let after = playCard(g, 0, rng(), "gamma");
    // 2 lands, +1 Might for the settlement
    expect(subjugationGripOn(viewOf(after), "beta")).toEqual({ might: 5, status: 4 });
    after = { ...after, overlords: new Map() };
    expect(subjugationGripOn(viewOf(after), "beta")).toEqual({ might: 2, status: 2 });
    expect(subjugationGripOn(viewOf(after), "gamma")) // it keeps it
      .toEqual({ might: 3, status: 2 });
    expect(after.settled).toEqual(["gamma"]);
  });

  it("does not double a settlement with a Favourable omens reading", () => {
    // Nothing about it is a Might or Status gain, so a held reading stays held.
    let g = withHand(playingState(LINE_ADJ), 0, ["found-settlement"]);
    g = { ...g, omens: ["beta"] };
    const after = playCard(g, 0, rng(), "beta");
    expect(after.omens).toEqual(["beta"]);
    expect(subjugationGripOn(viewOf(after), "beta")).toEqual({ might: 3, status: 2 });
  });
});

describe("XP is derived from a real game's log", () => {
  it("scores a human turnip as one point and counts it as a turnip", () => {
    let g = playingState();
    g = withHand(g, 0, ["grow-crops"]);
    const before = runXp(g.log);
    const beforeTurnips = runTurnips(g.log);
    g = playCard(g, 0, seededRng(1));
    expect(runXp(g.log)).toBe(before + 1);
    expect(runTurnips(g.log)).toBe(beforeTurnips + 1);
  });

  it("ignores an AI's plays entirely", () => {
    let g = playingState();
    g = { ...g, current: 1 };
    g = withHand(g, 1, ["grow-crops"]);
    const before = runXp(g.log);
    g = playCard(g, 0, seededRng(1));
    expect(runXp(g.log)).toBe(before);
    expect(runTurnips(g.log)).toBe(0);
  });
});

describe("discard and advance", () => {
  it("discard moves the card and logs it", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["subjugate"]);
    const after = discardCard(g, 0);
    expect(after.players[0].hand).toEqual([]);
    expect(after.players[0].discard.at(-1)).toBe("subjugate");
    expect(after.playedThisTurn).toBe(true);
    expect(after.log.at(-1)).toMatchObject({ type: "discard", cardId: "subjugate" });
  });

  it("advance requires a completed turn, skips only incorporated players, wraps the turn counter", () => {
    const g = playingState(LINE_ADJ);
    expect(advance(g, seededRng(3))).toBe(g); // nothing played yet
    let played = playCard(withHand(g, 0, ["grow-crops"]), 0, rng());
    let next = advance(played, seededRng(3));
    expect(next.current).toBe(1);
    // subjugated players still get turns now
    played = { ...played, overlords: new Map([["alpha", "gamma"]]) };
    next = advance(played, seededRng(3));
    expect(next.current).toBe(1);
    // incorporated players are skipped
    played = { ...played, overlords: new Map(), incorporated: { alpha: "gamma" } };
    next = advance(played, seededRng(3));
    expect(next.current).toBe(2);
    // full wrap increments the turn
    let wrap = next;
    for (const _ of [2, 3]) {
      wrap = { ...wrap, playedThisTurn: true };
      wrap = advance(wrap, seededRng(3));
    }
    expect(wrap.current).toBe(0);
    expect(wrap.turn).toBe(2);
  });

  it("playCard and discardCard reject a second action in the same turn", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["grow-crops", "grow-crops"]);
    const once = playCard(g, 0, rng());
    expect(playCard(once, 0, rng())).toBe(once);
    expect(discardCard(once, 0)).toBe(once);
  });
});

describe("immutability", () => {
  it("playCard leaves the input state untouched", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["raid"]);
    const handBefore = [...g.players[0].hand];
    const logLen = g.log.length;
    playCard(g, 0, rng(), "alpha");
    expect(g.players[0].hand).toEqual(handBefore);
    expect(g.log).toHaveLength(logLen);
    expect(g.playedThisTurn).toBe(false);
    expect(g.overlords.size).toBe(0);
  });
});

describe("deck building", () => {
  it("startGame enters deck-building; chooseDeck moves to pick-faction", () => {
    const g = startGame(newGame(FACTIONS));
    expect(g.phase).toBe("deck-building");
    const picked = chooseDeck(g, buildDeck());
    expect(picked.phase).toBe("pick-faction");
    expect(picked.humanDeck).toEqual(buildDeck());
  });

  it("chooseDeck rejects wrong phases and wrong deck sizes", () => {
    const menu = newGame(FACTIONS);
    expect(chooseDeck(menu, buildDeck())).toBe(menu);
    const g = startGame(menu);
    expect(chooseDeck(g, ["grow-crops"])).toBe(g);
  });

  it("the human is dealt from humanDeck, AIs from a randomized deck", () => {
    const custom = Array.from({ length: 10 }, () => "grow-crops");
    let g = chooseDeck(startGame(newGame(FACTIONS)), custom);
    g = pickFaction(g, "beta", seededRng(1));
    const human = g.players[0];
    expect(
      [...human.deck, ...human.hand, ...human.discard].every(
        (c) => c === "grow-crops",
      ),
    ).toBe(true);
    const ai = g.players[1];
    const aiCards = [...ai.deck, ...ai.hand, ...ai.discard];
    expect(aiCards).toHaveLength(DECK_SIZE);
    for (const id of aiCards) {
      expect(["grow-crops", ...NON_BASICS]).toContain(id);
    }
  });
});

describe("event enrichment", () => {
  it("stamps formerOverlordFactionId when a vassal is poached", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "alpha"]]) };
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    const ev = after.log.find((e) => e.type === "subjugated");
    expect(ev?.overlordFactionId).toBe("beta");
    expect(ev?.formerOverlordFactionId).toBe("alpha");
  });

  it("omits formerOverlordFactionId on a first subjugation", () => {
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    const ev = after.log.find((e) => e.type === "subjugated");
    expect(ev?.formerOverlordFactionId).toBeUndefined();
  });

  it("stamps the fallen lord on released events", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["delta", "gamma"]]) };
    // gamma's realm (self + vassal delta) is size 2, so the scaled subjugate
    // threshold here is 4, not the flat 2.
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 4));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    const rel = after.log.find((e) => e.type === "released");
    expect(rel?.targetFactionId).toBe("delta");
    expect(rel?.overlordFactionId).toBe("gamma");
  });
});

describe("diplomacy cards", () => {
  it("assassinate-ruler levels the status lead to 0 both ways; might is untouched", () => {
    let g = playingState(LINE_ADJ);
    let rel: Relations = {};
    rel = bumpStatus(rel, "beta", "alpha");
    rel = bumpStatus(rel, "beta", "alpha");
    rel = bumpStatus(rel, "beta", "alpha"); // beta leads alpha by 3 status
    rel = bumpMight(rel, "alpha", "beta"); // might should be untouched
    g = withRel(g, rel);
    g = withHand(g, 0, ["assassinate-ruler"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(getRel(after.relations, "beta", "alpha").status).toBe(3);
    expect(getRel(after.relations, "alpha", "beta").status).toBe(3);
    expect(leadsOf(after.relations, "beta", "alpha").status).toBe(0);
    expect(getRel(after.relations, "alpha", "beta").might).toBe(1); // untouched
    expect(getRel(after.relations, "beta", "alpha").might).toBe(0); // untouched
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "assassinate-ruler", targetFactionId: "alpha",
    });
  });

  it("alliance sets expiry to turn + 5, or turn + 10 with a consumed diplomacyBoost", () => {
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["alliance"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.alliances[allianceKey("beta", "alpha")]).toBe(g.turn + 5);

    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, diplomacyBoost: ["beta"] };
    g2 = withHand(g2, 0, ["alliance"]);
    const boosted = playCard(g2, 0, rng(), "alpha");
    expect(boosted.alliances[allianceKey("beta", "alpha")]).toBe(g2.turn + 10);
    expect(boosted.diplomacyBoost).not.toContain("beta");
  });

  it("alliance can re-target an active ally to renew the pact, overwriting the expiry", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, alliances: { [allianceKey("beta", "alpha")]: g.turn + 1 } };
    g = withHand(g, 0, ["alliance"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.alliances[allianceKey("beta", "alpha")]).toBe(g.turn + 5);

    let g2 = playingState(LINE_ADJ);
    g2 = {
      ...g2,
      alliances: { [allianceKey("beta", "alpha")]: g2.turn + 1 },
      diplomacyBoost: ["beta"],
    };
    g2 = withHand(g2, 0, ["alliance"]);
    const boosted = playCard(g2, 0, rng(), "alpha");
    expect(boosted.alliances[allianceKey("beta", "alpha")]).toBe(g2.turn + 10);
    expect(boosted.diplomacyBoost).not.toContain("beta");
  });

  it("extended-diplomacy adds the actor to diplomacyBoost, once", () => {
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["extended-diplomacy"]);
    const after = playCard(g, 0, rng());
    expect(after.diplomacyBoost).toEqual(["beta"]);

    let g2 = { ...playingState(LINE_ADJ), diplomacyBoost: ["beta"] };
    g2 = withHand(g2, 0, ["extended-diplomacy"]);
    const again = playCard(g2, 0, rng());
    expect(again.diplomacyBoost).toEqual(["beta"]); // not duplicated
  });
});

describe("raid gain", () => {
  it("grants one Might for a single bordering land", () => {
    // beta is the human; beta borders alpha and gamma.
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").might).toBe(1);
  });

  it("is convex in border width: two bordering lands are worth 3, not 2", () => {
    // Give beta gamma as a vassal. beta borders alpha; gamma does not.
    // Now make a map where both do.
    const ADJ = {
      alpha: ["beta", "gamma"],
      beta: ["alpha", "gamma"],
      gamma: ["alpha", "beta", "delta"],
      delta: ["gamma"],
    };
    let g = playingState(ADJ);
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    // raidYield(2) = 1 + 2. A wide border has to beat the sum of narrow ones,
    // or realm size buys no accumulation rate and a peer endgame never breaks.
    expect(getRel(g.relations, "beta", "alpha").might).toBe(raidYield(2));
    expect(getRel(g.relations, "beta", "alpha").might).toBe(3);
  });

  it("states the escalating yield in its rules text", () => {
    expect(CARDS.raid.text).toContain("+1 for your first land");
    expect(CARDS.raid.text).toContain("+2 for the second");
    expect(CARDS.raid.text).toContain("border");
  });
});

describe("bodyguard", () => {
  it("play appends the actor faction to bodyguards", () => {
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["bodyguard"]);
    const after = playCard(g, 0, rng());
    expect(after.bodyguards).toEqual(["beta"]);
  });

  it("is unplayable while already guarded (no stacking)", () => {
    let g = { ...playingState(LINE_ADJ), bodyguards: ["beta"] };
    g = withHand(g, 0, ["bodyguard"]);
    expect(playCard(g, 0, rng())).toBe(g); // rejected: not in the playable set
  });

  it("assassinate-ruler against a guarded target is nullified: guard consumed, relations untouched, event stamped prevented", () => {
    let g = { ...playingState(LINE_ADJ), bodyguards: ["alpha"] };
    let rel: Relations = {};
    rel = bumpStatus(rel, "beta", "alpha");
    rel = bumpStatus(rel, "beta", "alpha"); // beta leads alpha by 2 status
    g = withRel(g, rel);
    g = withHand(g, 0, ["assassinate-ruler"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.bodyguards).not.toContain("alpha");
    expect(getRel(after.relations, "beta", "alpha").status).toBe(2); // untouched
    expect(getRel(after.relations, "alpha", "beta").status).toBe(0); // untouched
    expect(leadsOf(after.relations, "beta", "alpha").status).toBe(2); // lead survives
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "assassinate-ruler", targetFactionId: "alpha",
      prevented: true,
    });
  });

  it("a second assassinate-ruler after the guard is consumed succeeds normally", () => {
    let g = { ...playingState(LINE_ADJ), bodyguards: ["alpha"] };
    let rel: Relations = {};
    rel = bumpStatus(rel, "beta", "alpha");
    rel = bumpStatus(rel, "beta", "alpha");
    g = withRel(g, rel);
    g = withHand(g, 0, ["assassinate-ruler"]);
    let after = playCard(g, 0, rng(), "alpha"); // 1st: nullified
    expect(leadsOf(after.relations, "beta", "alpha").status).toBe(2);
    expect(after.log.at(-1)?.prevented).toBe(true);

    after = { ...after, playedThisTurn: false };
    after = withHand(after, 0, ["assassinate-ruler"]);
    after = playCard(after, 0, rng(), "alpha"); // 2nd: guard already spent, succeeds
    expect(leadsOf(after.relations, "beta", "alpha").status).toBe(0);
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "assassinate-ruler", targetFactionId: "alpha",
    });
    expect(after.log.at(-1)?.prevented).toBeUndefined();
  });

  it("assassinate-ruler against an unguarded target still levels status as before", () => {
    let g = { ...playingState(LINE_ADJ), bodyguards: [] as string[] };
    let rel: Relations = {};
    rel = bumpStatus(rel, "beta", "alpha");
    g = withRel(g, rel);
    g = withHand(g, 0, ["assassinate-ruler"]);
    const after = playCard(g, 0, rng(), "alpha");
    expect(leadsOf(after.relations, "beta", "alpha").status).toBe(0);
    expect(after.bodyguards).toEqual([]);
    expect(after.log.at(-1)?.prevented).toBeUndefined();
  });
});

describe("favourable omens", () => {
  const armed = (g: GameState): GameState => ({ ...g, omens: ["beta"] });

  it("records a reading when played", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["favourable-omens"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.omens).toContain("beta");
  });

  it("doubles Raid, border and all", () => {
    const ADJ = {
      alpha: ["beta", "gamma"],
      beta: ["alpha", "gamma"],
      gamma: ["alpha", "beta", "delta"],
      delta: ["gamma"],
    };
    let g = armed(playingState(ADJ));
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").might).toBe(raidYield(2) * 2); // raidYield(2) = 3, doubled
    expect(g.omens).not.toContain("beta");
    expect(g.log.at(-1)).toMatchObject({ type: "play", cardId: "raid", doubled: true });
  });

  it("doubles Shrewd marriage", () => {
    let g = withHand(armed(playingState(LINE_ADJ)), 0, ["shrewd-marriage"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    expect(getRel(g.relations, "beta", "alpha").status).toBe(2);
    expect(g.omens).toEqual([]);
  });

  it("doubles Fortify against every living faction", () => {
    let g = withHand(armed(playingState(LINE_ADJ)), 0, ["fortify"]);
    g = playCard(g, 0, seededRng(1));
    expect(getRel(g.relations, "beta", "alpha").might).toBe(2);
    expect(getRel(g.relations, "beta", "gamma").might).toBe(2);
    expect(getRel(g.relations, "beta", "delta").might).toBe(2);
  });

  it("doubles the parting blow from Revolt", () => {
    let g = armed(playingState(LINE_ADJ));
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = withHand(g, 0, ["revolt"]);
    g = playCard(g, 0, seededRng(1));
    expect(leadsOf(g.relations, "beta", "alpha")).toEqual({ might: 2, status: 2 });
  });

  it("doubles the tribute a vassal pays, which is the cost of hoarding it", () => {
    let g = armed(playingState(LINE_ADJ));
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = withHand(g, 0, ["pay-military-tribute"]);
    g = playCard(g, 0, seededRng(1));
    expect(getRel(g.relations, "alpha", "beta").might).toBe(2);
    expect(g.omens).toEqual([]);
  });

  it("passes through a card with nothing to double, keeping the reading", () => {
    let g = armed(playingState(LINE_ADJ));
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.omens).toContain("beta");
    expect(g.log.at(-1)).not.toHaveProperty("doubled");
  });

  it("does not stack: a second reading is not playable", () => {
    const g = armed(playingState(LINE_ADJ));
    const set = playableSet(viewOf(g), "beta", ["favourable-omens"]);
    expect(set.mode).toBe("discard");
  });
});

describe("any faction can win", () => {
  // FACTIONS has 4 members, so victoryRealmSize is ceil(0.55 * 4) = 3.
  it("ends the game when a rival reaches victory size", () => {
    let g = playingState(LINE_ADJ);
    // alpha holds gamma incorporated (realm 2); subjugating delta - the play
    // under test - is what pushes the realm to 3 and crosses the threshold.
    g = {
      ...g,
      current: 1, // alpha's seat
      incorporated: { gamma: "alpha" },
    };
    g = withRel(g, mightLead(g.relations, "alpha", "delta", 2));
    g = withHand(g, 1, ["subjugate"]);
    g = playCard(g, 0, seededRng(1), "delta");
    expect(g.phase).toBe("defeat");
    expect(g.log.at(-1)).toMatchObject({ type: "unified", overlordFactionId: "alpha" });
  });

  it("still calls the human's own unification a victory", () => {
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      incorporated: { alpha: "beta" },
      overlords: new Map([["gamma", "beta"]]),
    };
    g = withHand(g, 0, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "gamma");
    expect(g.phase).toBe("victory");
    expect(g.log.some((e) => e.type === "unified")).toBe(false);
  });

  it("does not end the run when a seat falls and there is no human seat", () => {
    // beta is seat 0 (players[0]) in playingState(). With humanSeat: null
    // there is no human perspective to defeat, so gamma incorporating beta -
    // ordinarily how the human loses, per the mirror case below - must not
    // end the run: it is just one more faction's business.
    let g: GameState = { ...playingState(LINE_ADJ), humanSeat: null };
    g = { ...g, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g = digested(g, "beta", "gamma");
    g = withHand(g, 2, ["incorporate"]);
    const after = playCard(g, 0, seededRng(1), "beta");
    expect(after.incorporated).toEqual({ beta: "gamma" });
    expect(after.phase).toBe("playing");
    expect(after.log.some((e) => e.type === "defeat")).toBe(false);

    // Mirror: the identical incorporation of beta, with the default
    // humanSeat (0), does end the run in defeat.
    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g2 = digested(g2, "beta", "gamma");
    g2 = withHand(g2, 2, ["incorporate"]);
    const dead = playCard(g2, 0, seededRng(1), "beta");
    expect(dead.phase).toBe("defeat");
    expect(dead.log.at(-1)).toMatchObject({
      type: "defeat", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("defaults a real game to seat 0", () => {
    expect(newGame(FACTIONS).humanSeat).toBe(0);
  });
});

describe("rulers in state", () => {
  it("seats a ruler for every faction from the first moment", () => {
    const state = newGame(FACTIONS);
    for (const id of state.factionIds) {
      expect(rulerOf(state.rulers, id).since).toBe(1);
    }
  });

  it("uses the ethnicity map when one is supplied", () => {
    const state = newGame(["alpha"], undefined, { alpha: "livs" });
    expect(state.ethnicities.alpha).toBe("livs");
    expect(POOLS.livs).toContain(rulerOf(state.rulers, "alpha").name);
  });

  it("survives a faction pick with every ruler intact", () => {
    const state = playingState();
    for (const id of state.factionIds) {
      expect(rulerOf(state.rulers, id).name.length).toBeGreaterThan(0);
    }
  });
});

describe("advance", () => {
  it("skips an incorporated seat that is not the human seat", () => {
    let g = playingState(LINE_ADJ);
    // gamma is players[2] (id 3), the seat immediately after alpha's (index
    // 1), so the skip is only observable if advance actually passes over it
    // on the way to delta (index 3).
    g = {
      ...g,
      current: 1, // alpha's seat
      incorporated: { gamma: "alpha" },
      playedThisTurn: true,
    };
    g = advance(g, seededRng(1));
    expect(g.current).toBe(3);
    expect(g.players[g.current].factionId).toBe("delta");
  });

  it("skips an incorporated seat 0 when there is no human seat", () => {
    let g: GameState = { ...playingState(LINE_ADJ), humanSeat: null };
    g = { ...g, incorporated: { beta: "alpha" }, current: 3, playedThisTurn: true };
    g = advance(g, seededRng(1));
    expect(g.players[g.current].factionId).not.toBe("beta");
  });

  it("never skips the human seat, even once incorporated", () => {
    // In the shipped game this cannot arise, since the game ends the moment
    // the human is incorporated. The rule is asserted so the world-run change
    // cannot quietly alter single-player behaviour.
    let g = playingState(LINE_ADJ);
    g = { ...g, incorporated: { beta: "alpha" }, current: 3, playedThisTurn: true };
    g = advance(g, seededRng(1));
    expect(g.current).toBe(0);
  });
});

describe("assassinate ruler succession", () => {
  it("seats a successor and records both names on the event", () => {
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["assassinate-ruler"]);
    const killed = rulerOf(g.rulers, "alpha").name;

    const after = playCard(g, 0, rng(), "alpha");

    const successor = rulerOf(after.rulers, "alpha").name;
    expect(successor).not.toBe(killed);
    expect(rulerOf(after.rulers, "alpha").since).toBe(after.turn);
    expect(after.log.at(-1)).toMatchObject({
      type: "play",
      cardId: "assassinate-ruler",
      targetRuler: killed,
      successorRuler: successor,
    });
  });

  it("leaves the ruler alive when a bodyguard turns the blade", () => {
    let g = { ...playingState(LINE_ADJ), bodyguards: ["alpha"] };
    g = withHand(g, 0, ["assassinate-ruler"]);
    const survivor = rulerOf(g.rulers, "alpha").name;

    const after = playCard(g, 0, rng(), "alpha");

    expect(rulerOf(after.rulers, "alpha").name).toBe(survivor);
    expect(after.log.at(-1)).toMatchObject({
      type: "play",
      prevented: true,
      targetRuler: survivor,
    });
    expect(after.log.at(-1)?.successorRuler).toBeUndefined();
  });

  it("touches no other faction's ruler", () => {
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["assassinate-ruler"]);
    const after = playCard(g, 0, rng(), "alpha");
    for (const id of g.factionIds) {
      if (id === "alpha") continue;
      expect(after.rulers[id]).toBe(g.rulers[id]);
    }
  });
});

describe("event stamping", () => {
  it("stamps every logged event with the ruler who acted", () => {
    // The log is a record of what happened then. Resolving the name at render
    // time would show today's ruler doing his predecessor's deeds.
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["grow-crops"]);
    g = advance(playCard(g, 0, rng()), rng()); // beta plays; alpha's turn opens
    // Force alpha into a discard - nothing in a lone, unplayable "subjugate"
    // is playable at a fresh lead of 0 - to exercise discardCard's append,
    // the third of three call sites that stamp actorRuler.
    g = withHand(g, 1, ["subjugate"]);
    g = discardCard(g, 0);
    expect(g.log.some((e) => e.type === "discard")).toBe(true);
    expect(g.log.length).toBeGreaterThan(0);
    for (const e of g.log) {
      expect(e.actorRuler, `${e.type} on turn ${e.turn}`).toBeTruthy();
    }
  });

  it("marks what a play caused, and never the play itself", () => {
    // The log indents a consequence under its play, so the link has to be in the
    // data. It comes off the shape of the batch in appendEvents, which is why no
    // card branch has to remember it.
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 0, ["revolt"]);
    const after = playCard(g, 0, rng());
    const back = [...after.log].reverse();
    const play = back.find((e) => e.type === "play");
    const reclaimed = back.find((e) => e.type === "reclaimed");
    expect(play?.consequence).toBeUndefined();
    expect(reclaimed?.consequence).toBe(true);
  });

  it("leaves an ending top-level even though its play caused it", () => {
    // A play can win the run, but the last line of a run is a headline, not a
    // sub-item under a card. Same construction as the victory test above.
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    let big = pickFaction(
      chooseDeck(startGame(newGame(many)), buildDeck()), "f0", seededRng(1),
    );
    const inc: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) inc[`f${i}`] = "f0";
    big = { ...big, incorporated: inc };
    big = withHand(big, 0, ["grow-crops"]);
    const won = playCard(big, 0, rng());
    expect(won.log.at(-1)).toMatchObject({ type: "victory" });
    expect(won.log.at(-1)?.consequence).toBeUndefined();
  });

  it("marks nothing in a batch that no play opened", () => {
    // beginTurn's draw, reshuffle and garrison tick follow from the turn, not
    // from a card, so nothing in that batch is anybody's consequence.
    let g = playingState(LINE_ADJ);
    g = withHand(g, 0, ["grow-crops"]);
    g = advance(playCard(g, 0, rng()), rng());
    const turnEvents = g.log.filter(
      (e) => e.type === "draw" || e.type === "reshuffle" || e.type === "garrisoned",
    );
    expect(turnEvents.length).toBeGreaterThan(0);
    expect(turnEvents.every((e) => e.consequence === undefined)).toBe(true);
  });

  it("keeps the name the dead ruler held when he acted", () => {
    let g = playingState(LINE_ADJ);
    const doomed = rulerOf(g.rulers, "alpha").name;
    g = withHand(g, 0, ["grow-crops"]);
    g = advance(playCard(g, 0, rng()), rng()); // alpha's turn opens: a draw is logged for alpha
    expect(g.log.some((e) => e.type === "draw" && e.actorRuler === doomed)).toBe(true);

    // hand the seat back to beta holding an assassin's card
    const back = withHand({ ...g, current: 0, playedThisTurn: false }, 0, ["assassinate-ruler"]);
    const after = playCard(back, 0, rng(), "alpha");

    expect(rulerOf(after.rulers, "alpha").name).not.toBe(doomed);
    // the old event still names the man who actually drew that card
    expect(after.log.some((e) => e.type === "draw" && e.actorRuler === doomed)).toBe(true);
  });
});

describe("seeds of revolt and the two rolls", () => {
  /** An rng returning a fixed value, so a roll's outcome is chosen, not hoped. */
  const fixed = (v: number): Rng => () => v;

  it("sowing shuffles exactly one Revolt into the vassal's own deck", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 0, ["seeds-of-revolt"]);
    const after = playCard(g, 0, rng());
    const me = after.players[0];
    expect(me.deck.filter((c) => c === "revolt")).toHaveLength(1);
    // It lands in the DECK, not the hand: waiting to draw it is the delay.
    expect(me.hand).not.toContain("revolt");
    expect(after.log.at(-1)).toMatchObject({
      type: "seeded", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("a pending Revolt does not survive the vassalage it was sown in", () => {
    // Otherwise a freed faction carries a live Revolt into its NEXT vassalage,
    // which is the pre-loaded escape this whole change removes.
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 0, ["seeds-of-revolt"]);
    g = playCard(g, 0, rng());
    expect(g.players[0].deck).toContain("revolt");

    g = { ...g, playedThisTurn: false };
    g = withHand(g, 0, ["revolt"]);
    const freed = playCard(g, 0, rng());
    const me = freed.players[0];
    expect([...me.deck, ...me.hand, ...me.discard]).not.toContain("revolt");
    expect(freed.overlords.has("beta")).toBe(false);
  });

  it("a failed Incorporate spends the card and leaves the vassalage standing", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["incorporate"]);
    // loyalty 0 -> 0% chance, so any roll misses.
    const after = playCard(g, 0, fixed(0.99), "gamma");
    expect(after.incorporated).toEqual({});
    expect(after.overlords.get("gamma")).toBe("beta");
    expect(after.players[0].discard).toContain("incorporate");
    expect(after.playedThisTurn).toBe(true);
    expect(after.log.at(-1)).toMatchObject({
      type: "incorporate-failed", targetFactionId: "gamma",
    });
  });

  it("a failed poach spends the card and leaves the vassal with its lord", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "delta"]]) };
    g = withRel(g, mightLead({}, "beta", "gamma", 6)); // clear of bar + surcharge
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, fixed(0.99), "gamma");
    expect(after.overlords.get("gamma")).toBe("delta");
    expect(after.players[0].discard).toContain("subjugate");
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugate-failed",
      targetFactionId: "gamma",
      formerOverlordFactionId: "delta",
    });
  });

  it("taking a free faction never rolls, whatever the rng says", () => {
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead({}, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, fixed(0.99), "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
  });

  it("loyalty rises under its lord and decays for everyone else", () => {
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([["beta", "gamma"]]),
      loyalty: { [loyaltyKey("beta", "delta")]: 2 },
      current: 0,
    };
    // beginTurn ticks the clock for the faction about to act.
    const ticked = beginTurn(g, rng());
    expect(ticked.loyalty[loyaltyKey("beta", "gamma")]).toBe(1);
    expect(ticked.loyalty[loyaltyKey("beta", "delta")]).toBe(1);
    // and again: the ex-lord's investment reaches zero and is dropped
    const twice = beginTurn({ ...ticked, current: 0 }, rng());
    expect(twice.loyalty[loyaltyKey("beta", "gamma")]).toBe(2);
    expect(twice.loyalty).not.toHaveProperty(loyaltyKey("beta", "delta"));
  });
});

describe("a vassalage with no way out ends the run", () => {
  /** Empties a seat's piles of both escape cards. `playingState` deals the
   *  human `buildDeck()`, which carries a Seeds of revolt, so the dead-end
   *  position has to be built rather than assumed. */
  function withoutEscape(g: GameState, factionId: string): GameState {
    const drop = (pile: string[]) =>
      pile.filter((c) => c !== "seeds-of-revolt" && c !== "revolt");
    return {
      ...g,
      players: g.players.map((pl) =>
        pl.factionId === factionId
          ? { ...pl, deck: drop(pl.deck), hand: drop(pl.hand), discard: drop(pl.discard) }
          : pl,
      ),
    };
  }

  /** alpha, an AI seat, subjugates the human. beta's realm is one land, so the
   *  flat threshold of 2 applies. */
  function alphaTakesTheHuman(g: GameState): GameState {
    let out = withRel(g, mightLead(g.relations, "alpha", "beta", 2));
    out = { ...out, current: 1 };
    out = withHand(out, 1, ["subjugate"]);
    return playCard(out, 0, rng(), "beta");
  }

  it("ends on the very play that strands you, not a turn later", () => {
    const after = alphaTakesTheHuman(withoutEscape(playingState(LINE_ADJ), "beta"));
    expect(after.overlords.get("beta")).toBe("alpha");
    expect(after.phase).toBe("defeat");
    // both events land in one play: what happened, then what it means
    expect(after.log.at(-2)).toMatchObject({ type: "subjugated", targetFactionId: "beta" });
    expect(after.log.at(-1)).toMatchObject({
      type: "stranded", targetFactionId: "beta", overlordFactionId: "alpha",
    });
  });

  it("leaves the run alive when a Seeds of revolt is still in the piles", () => {
    let g = withoutEscape(playingState(LINE_ADJ), "beta");
    g = {
      ...g,
      players: g.players.map((pl) =>
        pl.factionId === "beta" ? { ...pl, discard: [...pl.discard, "seeds-of-revolt"] } : pl,
      ),
    };
    const after = alphaTakesTheHuman(g);
    expect(after.overlords.get("beta")).toBe("alpha");
    expect(after.phase).toBe("playing");
    expect(after.log.some((e) => e.type === "stranded")).toBe(false);
  });

  it("is not saved by a Revolt carried over from an earlier vassalage", () => {
    // Subjugate strips the target's vassal cards before injecting the new
    // tributes, precisely so a Revolt cannot be pre-loaded. That strip runs
    // before this ending is decided, so a stale Revolt is gone by the time it
    // is asked about - which is what makes the check honest rather than a
    // loophole. A Revolt sown during THIS vassalage is different: the Seeds
    // that sowed it is in the discard, and that is what keeps the run alive.
    let g = withoutEscape(playingState(LINE_ADJ), "beta");
    g = {
      ...g,
      players: g.players.map((pl) =>
        pl.factionId === "beta" ? { ...pl, deck: [...pl.deck, "revolt"] } : pl,
      ),
    };
    const after = alphaTakesTheHuman(g);
    expect([...after.players[0].deck, ...after.players[0].hand]).not.toContain("revolt");
    expect(after.phase).toBe("defeat");
  });

  it("does not strand a player poached out of a live Revolt, because the Seeds survives", () => {
    // The strip invariant this ending rests on: stripVassalCards takes the
    // Revolt on a poach but never the Seeds that sowed it, so the escape is
    // still one draw away and the run must go on.
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 0, ["seeds-of-revolt"]);
    g = playCard(g, 0, rng());
    expect(g.players[0].deck).toContain("revolt");
    expect(g.players[0].discard).toContain("seeds-of-revolt");

    const after = alphaTakesTheHuman({ ...g, playedThisTurn: false });
    expect(after.overlords.get("beta")).toBe("alpha"); // poached
    const me = after.players[0];
    expect([...me.deck, ...me.hand, ...me.discard]).not.toContain("revolt"); // stripped
    expect(me.discard).toContain("seeds-of-revolt"); // and this is why it lives
    expect(after.phase).toBe("playing");
  });

  it("is human-only: an AI vassal with no escape keeps paying tribute", () => {
    let g = withoutEscape(playingState(LINE_ADJ), "gamma");
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
    expect(after.phase).toBe("playing");
    expect(after.log.some((e) => e.type === "stranded")).toBe(false);
  });
});

describe("passive garrison fortify", () => {
  /** `n` lands annexed by `lord`, using ids outside FACTIONS so the four
   *  seats stay sovereign and keep taking turns. */
  const annexed = (lord: string, n: number): Record<string, string> =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`annex-${i}`, lord]),
    );

  it("grants nothing below the threshold", () => {
    const g = playingState(LINE_ADJ);
    const before = leadsOf(g.relations, "beta", "gamma").might;
    const next = beginTurn(
      { ...g, incorporated: annexed("beta", PASSIVE_PER_LANDS - 1), current: 0 },
      rng(),
    );
    expect(leadsOf(next.relations, "beta", "gamma").might).toBe(before);
    expect(next.log.some((e) => e.type === "garrisoned")).toBe(false);
  });

  it("raises Might against every living faction at once, and logs one event", () => {
    const g = playingState(LINE_ADJ);
    const next = beginTurn(
      { ...g, incorporated: annexed("beta", PASSIVE_PER_LANDS), current: 0 },
      rng(),
    );
    for (const other of ["alpha", "gamma", "delta"]) {
      expect(leadsOf(next.relations, "beta", other).might).toBe(1);
    }
    const events = next.log.filter((e) => e.type === "garrisoned");
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(1);
    expect(events[0].targetFactionId).toBe("beta");
  });

  it("skips incorporated factions - they are not living targets", () => {
    const g = playingState(LINE_ADJ);
    const next = beginTurn(
      {
        ...g,
        incorporated: { ...annexed("beta", PASSIVE_PER_LANDS), delta: "beta" },
        current: 0,
      },
      rng(),
    );
    // delta is inside beta's realm now; nothing is accrued against it.
    expect(leadsOf(next.relations, "beta", "delta").might).toBe(0);
    expect(leadsOf(next.relations, "beta", "gamma").might).toBe(1);
  });

  it("is not doubled by a held Favourable omens reading", () => {
    const g = playingState(LINE_ADJ);
    const next = beginTurn(
      {
        ...g,
        incorporated: annexed("beta", PASSIVE_PER_LANDS),
        omens: ["beta"],
        current: 0,
      },
      rng(),
    );
    expect(leadsOf(next.relations, "beta", "gamma").might).toBe(1);
    // The reading is untouched, still there for a Raid.
    expect(next.omens).toContain("beta");
  });

  it("consumes no rng: the same seed yields the same stream with or without it", () => {
    const g = playingState(LINE_ADJ);
    const drawOf = (state: GameState): string | undefined => {
      const r = seededRng(99);
      return beginTurn({ ...state, current: 0 }, r).log
        .filter((e) => e.type === "draw")
        .at(-1)?.cardId;
    };
    const without = drawOf(g);
    const with_ = drawOf({ ...g, incorporated: annexed("beta", PASSIVE_PER_LANDS * 3) });
    expect(with_).toBe(without);
  });
});

describe("surrender", () => {
  it("ends the run in defeat and records why", () => {
    const g = playingState(LINE_ADJ);
    const next = surrender(g);
    expect(next.phase).toBe("defeat");
    expect(next.log.at(-1)?.type).toBe("surrendered");
  });

  it("is inert outside play, so a double click cannot re-end a finished run", () => {
    const g = playingState(LINE_ADJ);
    const once = surrender(g);
    const twice = surrender(once);
    expect(twice).toBe(once);
    expect(surrender(newGame(FACTIONS))).toEqual(newGame(FACTIONS));
  });

  it("carries no overlord, so no killer comparison can be built from it", () => {
    const next = surrender(playingState(LINE_ADJ));
    const e = next.log.at(-1)!;
    expect(e.overlordFactionId).toBeUndefined();
    expect(next.log.some((x) => x.type === "defeat")).toBe(false);
  });
});

// Every site that moves a relation counter records how far, so
// src/standings.ts can reconstruct a before -> after without re-deriving the
// rules from state that has already moved on. See the doc comment on
// GameEvent.amount and the rule in AGENTS.md.
describe("event amount/track", () => {
  it("raid records the doubled yield and the might track", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid"]);
    g = { ...g, omens: ["beta"] }; // doubled
    const after = playCard(g, 0, rng(), "alpha");
    const gain = raidYield(1); // one-land border on LINE_ADJ
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "raid", amount: gain * 2, track: "might",
    });
  });

  it("shrewd marriage records mult and the status track", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["shrewd-marriage"]);
    g = { ...g, omens: ["beta"] };
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "shrewd-marriage", amount: 2, track: "status",
    });
  });

  it("fortify records mult and the might track, with no target", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["fortify"]);
    const after = playCard(g, 0, rng());
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "fortify", amount: 1, track: "might",
    });
    expect(after.log.at(-1)?.targetFactionId).toBeUndefined();
  });

  it("a landed assassination records the actor's Status lead from before the reset", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["assassinate-ruler"]);
    g = withRel(g, bumpStatus(bumpStatus(g.relations, "beta", "alpha"), "beta", "alpha"));
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "assassinate-ruler", amount: 2, track: "status",
    });
    // and the level actually happened - the "before" is not just echoing 0
    expect(leadsOf(after.relations, "beta", "alpha").status).toBe(0);
  });

  it("a prevented assassination records no amount - nothing moved", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["assassinate-ruler"]);
    g = { ...g, bodyguards: ["alpha"] };
    const after = playCard(g, 0, rng(), "alpha");
    expect(after.log.at(-1)?.prevented).toBe(true);
    expect(after.log.at(-1)?.amount).toBeUndefined();
  });

  it("revolt records mult on the reclaimed event, both tracks by 1 rule", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "alpha"]]) };
    g = { ...g, omens: ["beta"] };
    g = withHand(g, 0, ["revolt"]);
    const after = playCard(g, 0, rng());
    expect(after.log.at(-1)).toMatchObject({ type: "reclaimed", amount: 2 });
    expect(after.log.at(-1)?.track).toBeUndefined();
  });

  it("tribute records mult alongside the track it already carried", () => {
    let g = asVassal(playingState(LINE_ADJ), "alpha");
    g = { ...g, omens: ["beta"] };
    g = withHand(g, 0, ["pay-military-tribute"]);
    const after = playCard(g, 0, rng());
    expect(after.log.at(-1)).toMatchObject({
      type: "tribute", track: "might", amount: 2,
    });
  });

  it("a successful subjugation carries no amount - the +1/+1 poach penalty is a constant", () => {
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.log.at(-1)).toMatchObject({ type: "subjugated" });
    expect(after.log.at(-1)?.amount).toBeUndefined();
  });
});
