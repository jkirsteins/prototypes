import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, beginTurn, playCard, discardCard,
  advance, isHumanTurn, viewOf,
  OPENING_HAND, victoryRealmSize, type GameState,
} from "../src/game";
import { DECK_SIZE, buildDeck, CARDS, type Rng } from "../src/cards";
import {
  allianceKey, bumpMight, bumpStatus, getRel, leadsOf, type Relations,
} from "../src/relations";
import { playableSet } from "../src/playability";
import { rulerOf } from "../src/rulers";
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
    expect(g.seenThisRun).toEqual([]);
    expect(g.adjacency["alpha"].sort()).toEqual(["beta", "delta", "gamma"]);
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
  "incorporate", "reclaim-independence", "revolt",
  "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
  "favourable-omens",
];

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

  it("pay-tribute requires a track", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 0, ["pay-tribute"]);
    expect(playCard(g, 0, rng())).toBe(g);
    expect(playCard(g, 0, rng(), undefined, "might")).not.toBe(g);
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
      .filter((c) => c === "pay-tribute");
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
    deltaP = { ...deltaP, deck: [...deltaP.deck, "pay-tribute", "pay-tribute"] };
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
        .filter((c) => c === "pay-tribute"),
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
    gammaP = { ...gammaP, deck: [...gammaP.deck, "pay-tribute", "pay-tribute"] };
    g = { ...g, players: g.players.map((p) => (p.factionId === "gamma" ? gammaP : p)) };
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    const poached = after.players.find((p) => p.factionId === "gamma")!;
    expect(
      [...poached.deck, ...poached.hand, ...poached.discard]
        .filter((c) => c === "pay-tribute"),
    ).toHaveLength(2);
  });

  it("incorporate is permanent and ends the game when the human falls", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.incorporated).toEqual({ gamma: "beta" });
    expect(after.overlords.has("gamma")).toBe(false);
    expect(after.phase).toBe("playing");

    // now the human is someone's vassal and gets incorporated
    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, current: 2, overlords: new Map([["beta", "gamma"]]) };
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
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.incorporated).toEqual({ delta: "beta", gamma: "beta" });
  });

  it("reclaim frees the player and strips tribute copies", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    let p0 = g.players[0];
    p0 = {
      ...p0,
      deck: [...p0.deck, "pay-tribute"],
      discard: ["pay-tribute"],
      hand: ["reclaim-independence"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    // overlord lead < 2 on both tracks (all zeros): reclaim is playable
    const after = playCard(g, 0, rng());
    expect(after.overlords.has("beta")).toBe(false);
    const freed = after.players[0];
    expect(
      [...freed.deck, ...freed.hand, ...freed.discard].filter((c) => c === "pay-tribute"),
    ).toHaveLength(0);
    expect(after.log.at(-1)).toMatchObject({
      type: "reclaimed", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("reclaim is rejected while the overlord's lead is 2+", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withRel(g, mightLead(g.relations, "gamma", "beta", 2));
    g = withHand(g, 0, ["reclaim-independence"]);
    // reclaim unplayable -> hand of 1 means discard mode
    expect(playCard(g, 0, rng())).toBe(g);
    expect(discardCard(g, 0)).not.toBe(g);
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
      deck: [...p0.deck, "pay-tribute"],
      discard: ["pay-tribute"],
      hand: ["revolt"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = playCard(g, 0, rng());
    expect(after.overlords.has("beta")).toBe(false);
    const freed = after.players[0];
    expect(
      [...freed.deck, ...freed.hand, ...freed.discard].filter((c) => c === "pay-tribute"),
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
    g = {
      ...g,
      overlords: new Map([["beta", "gamma"]]),
      incorporated: { delta: "gamma" },
    };
    g = withHand(g, 0, ["pay-tribute"]);
    const after = playCard(g, 0, rng(), undefined, "status");
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

describe("seenThisRun", () => {
  it("records AI cards played against the human realm, once, in order", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, current: 2 }; // gamma acts
    g = withHand(g, 2, ["raid"]);
    let after = playCard(g, 0, rng(), "beta");
    expect(after.seenThisRun).toEqual(["raid"]);
    after = { ...after, playedThisTurn: false };
    after = withHand(after, 2, ["raid"]);
    after = playCard(after, 0, rng(), "beta");
    expect(after.seenThisRun).toEqual(["raid"]); // deduped
  });

  it("records untargeted plays only from factions adjacent to the human realm", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, current: 2 }; // gamma, adjacent to beta
    g = withHand(g, 2, ["fortify"]);
    expect(playCard(g, 0, rng()).seenThisRun).toEqual(["fortify"]);
    let far = playingState(LINE_ADJ);
    far = { ...far, current: 3 }; // delta, not adjacent to beta
    far = withHand(far, 3, ["fortify"]);
    expect(playCard(far, 0, rng()).seenThisRun).toEqual([]);
  });

  it("ignores the human's own plays and AI plays on other AIs", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid"]);
    expect(playCard(g, 0, rng(), "alpha").seenThisRun).toEqual([]);
    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, current: 2 };
    g2 = withHand(g2, 2, ["raid"]);
    expect(playCard(g2, 0, rng(), "delta").seenThisRun).toEqual([]);
  });

  it("records a poach of the human's own vassal", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, current: 3, overlords: new Map([["gamma", "beta"]]) };
    g = withRel(g, mightLead(g.relations, "delta", "gamma", 2));
    g = withHand(g, 3, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.seenThisRun).toEqual(["subjugate"]);
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

  it("grants one Might per bordering land of the actor's realm", () => {
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
    expect(getRel(g.relations, "beta", "alpha").might).toBe(2);
  });

  it("no longer promises a flat +1 in its rules text", () => {
    expect(CARDS["raid"].text).toContain("for each");
    expect(CARDS["raid"].text).toContain("border");
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
    expect(getRel(g.relations, "beta", "alpha").might).toBe(4); // 2 border x 2
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
    g = withHand(g, 0, ["pay-tribute"]);
    g = playCard(g, 0, seededRng(1), undefined, "might");
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
    g = withHand(g, 2, ["incorporate"]);
    const after = playCard(g, 0, seededRng(1), "beta");
    expect(after.incorporated).toEqual({ beta: "gamma" });
    expect(after.phase).toBe("playing");
    expect(after.log.some((e) => e.type === "defeat")).toBe(false);

    // Mirror: the identical incorporation of beta, with the default
    // humanSeat (0), does end the run in defeat.
    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, current: 2, overlords: new Map([["beta", "gamma"]]) };
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
