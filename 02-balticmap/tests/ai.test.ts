import { describe, it, expect } from "vitest";
import { POLICY_COVERAGE, chooseAction } from "../src/ai";
import { INCORPORATE_RAMP, loyaltyKey } from "../src/playability";
import {
  newGame, startGame, chooseDeck, pickFaction, type GameState,
} from "../src/game";
import { bumpMight, bumpStatus, type Relations } from "../src/relations";
import { CARDS, buildDeck, type Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function base(): GameState {
  // human is beta; make alpha (player 2, index 1) the actor
  const g = pickFaction(
    chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1),
  );
  return { ...g, current: 1 };
}

/** Hold every named land long enough that Incorporate is certain, so a test
 *  about WHICH vassal the policy picks is not also a test of the loyalty roll. */
function digestedAll(g: GameState, lands: string[], lord: string): GameState {
  const loyalty = { ...g.loyalty };
  for (const land of lands) loyalty[loyaltyKey(land, lord)] = INCORPORATE_RAMP;
  return { ...g, loyalty };
}

function withHand(g: GameState, hand: string[]): GameState {
  const p = { ...g.players[1], hand };
  return { ...g, players: g.players.map((pl, i) => (i === 1 ? p : pl)) };
}

function lead(rel: Relations, actor: string, target: string, n: number): Relations {
  let out = rel;
  for (let i = 0; i < n; i++) out = bumpMight(out, actor, target);
  return out;
}

function statusLead(rel: Relations, actor: string, target: string, n: number): Relations {
  let out = rel;
  for (let i = 0; i < n; i++) out = bumpStatus(out, actor, target);
  return out;
}

describe("chooseAction priorities", () => {
  it("1: tribute first, feeding the overlord's weaker track", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    // gamma leads alpha by 2 might, 0 status -> weaker track is status, so of
    // the two tribute cards in hand it plays the one that pays Status
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 2) };
    g = withHand(g, ["pay-military-tribute", "pay-status-tribute"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("1: tribute track tie goes to might", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["pay-status-tribute", "pay-military-tribute"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("1: plays the tribute it has when the weaker track's card is elsewhere", () => {
    // The common case: one tribute card in hand and nothing to choose. The
    // weaker track here is status and the card that pays it is not in hand.
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 2) };
    g = withHand(g, ["raid", "pay-military-tribute"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("2: revolts out of vassalage rather than building", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["raid", "revolt"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("2: does not revolt when not subjugated", () => {
    let g = base();
    g = withHand(g, ["revolt", "grow-crops"]);
    // Revolt is unplayable while free, so the potato is the play
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("forced tribute monopolises the playable set, so revolt is unreachable", () => {
    // Tribute is forced while a vassal, giving it exclusive occupancy of
    // cardIndexes. This means idxOf("revolt") is undefined and step 2 never
    // fires. The two cards cannot co-occur in playableSet, so their relative
    // step order has no observable effect and no ordering test exists.
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["revolt", "pay-military-tribute"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("3: incorporates the vassal that brings the most land", () => {
    let g = base();
    // alpha holds gamma and delta; delta has annexed a land, so it is worth more
    g = { ...g, overlords: new Map([["gamma", "alpha"], ["delta", "alpha"]]) };
    g = { ...g, incorporated: { beta: "delta" } };
    g = digestedAll(g, ["gamma", "delta"], "alpha");
    g = withHand(g, ["incorporate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "delta",
    });
  });

  it("3: breaks a realm-size tie by faction order", () => {
    let g = base();
    g = { ...g, overlords: new Map([["gamma", "alpha"], ["delta", "alpha"]]) };
    g = digestedAll(g, ["gamma", "delta"], "alpha");
    g = withHand(g, ["incorporate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("4: subjugate the biggest lead", () => {
    let g = base();
    let rel = lead(g.relations, "alpha", "beta", 2);
    rel = lead(rel, "alpha", "gamma", 3);
    g = { ...g, relations: rel };
    g = withHand(g, ["raid", "subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("5: finish a deficit-1 target before generic building", () => {
    let g = base();
    // alpha already leads gamma by 1 might; delta untouched
    g = { ...g, relations: lead(g.relations, "alpha", "gamma", 1) };
    g = withHand(g, ["raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("5: allies with the faction that can subjugate it now", () => {
    let g = base();
    // gamma is 1 short of taking alpha; alliance freezes it for 5 turns
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 1) };
    g = withHand(g, ["grow-crops", "alliance"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("5: does not ally with a faction it could subjugate itself", () => {
    let g = base();
    // beta threatens alpha AND alpha can already take beta: a pact would freeze
    // alpha's own conquest for five turns, so step 5 must decline entirely.
    // The hand carries a potato so the decline is visible: if the step fired it
    // would seal with beta, the only threat within one play.
    //
    // The two leads MUST sit on different tracks. leadsOf is a difference, so
    // bumping both directions on Might would cancel to a lead of zero and nobody
    // would threaten anyone. Subjugation needs the bar on either track, so beta
    // threatens on Might while alpha holds its own claim on Status.
    g = { ...g, relations: statusLead(lead(g.relations, "beta", "alpha", 2), "alpha", "beta", 2) };
    g = withHand(g, ["alliance", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("5: does not fire when nobody is close to subjugating it", () => {
    let g = base();
    g = withHand(g, ["alliance", "raid"]);
    // no threat within one play, so the build step takes the turn
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
  });

  it("5: skips an excluded threat and allies with the next one", () => {
    let g = base();
    // gamma is the worst threat (shortfall 0) but alpha can subjugate gamma, so
    // it is excluded. delta is a lesser threat (shortfall 1) and is eligible.
    // The two leads sit on different tracks on purpose: leadsOf is a difference,
    // so same-track bumps in both directions would cancel to zero.
    let rel = lead(g.relations, "gamma", "alpha", 2);      // gamma -> alpha, might
    rel = statusLead(rel, "alpha", "gamma", 2);            // alpha -> gamma, status
    rel = lead(rel, "delta", "alpha", 1);                  // delta -> alpha, might
    g = { ...g, relations: rel };
    g = withHand(g, ["grow-crops", "alliance"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "delta",
    });
  });

  it("5: assassinates the ruler closest to taking it on Status", () => {
    let g = base();
    g = { ...g, relations: statusLead(g.relations, "gamma", "alpha", 1) };
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("5: sorts assassination candidates by statusShortfall, not by threats' shortfall order", () => {
    // delta out-mights alpha by 3 (mightShortfall -1) but is only 1 short on
    // Status (statusShortfall 1): its overall shortfall (-1) sorts it first in
    // `threats`. gamma leads only on Status, exactly to the bar
    // (statusShortfall 0, shortfall 0), so it sorts second in `threats`. A
    // policy that reused threats' order (e.g. threats.find(...)) instead of
    // re-sorting by statusShortfall would wrongly assassinate delta, whose
    // Might lead the card cannot touch, instead of gamma.
    let g = base();
    let rel = lead(g.relations, "delta", "alpha", 3);
    rel = statusLead(rel, "delta", "alpha", 1);
    rel = statusLead(rel, "gamma", "alpha", 2);
    g = { ...g, relations: rel };
    g = withHand(g, ["grow-crops", "assassinate-ruler"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("5: ignores a Might-only threat, which levelling Status cannot help", () => {
    let g = base();
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 2) };
    g = withHand(g, ["assassinate-ruler", "raid"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
  });

  it("5: does not fire when every qualifying ruler is guarded", () => {
    let g = base();
    g = { ...g, relations: statusLead(g.relations, "gamma", "alpha", 1) };
    g = { ...g, bodyguards: ["gamma"] };
    g = withHand(g, ["assassinate-ruler", "raid"]);
    // spending the card to strip a guard leaves the threat standing
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
  });

  it("5: prefers the alliance when both are in hand", () => {
    let g = base();
    g = { ...g, relations: statusLead(g.relations, "gamma", "alpha", 1) };
    g = withHand(g, ["assassinate-ruler", "alliance"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "gamma" });
  });

  it("6: fortify defensively when out-mighted", () => {
    let g = base();
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 1) };
    g = withHand(g, ["fortify", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("7: otherwise build toward the closest target, raid over marriage, faction order", () => {
    let g = base();
    g = withHand(g, ["shrewd-marriage", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("8: grow crops as filler", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    // subjugated: no raid on overlord; gamma is only... beta and delta remain raidable
    g = withHand(g, ["grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("8: extends diplomacy only with an Alliance in hand to extend", () => {
    let g = base();
    g = withHand(g, ["extended-diplomacy", "alliance"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("8: does not extend diplomacy with no Alliance in hand", () => {
    let g = base();
    g = withHand(g, ["extended-diplomacy", "grow-crops"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
  });

  it("8: an emergency alliance outranks extending the next one", () => {
    let g = base();
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 1) };
    g = withHand(g, ["extended-diplomacy", "alliance"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "gamma" });
  });

  it("8: posts a guard on a Status lead it cannot cash this turn", () => {
    let g = base();
    g = { ...g, relations: statusLead(g.relations, "alpha", "beta", 2) };
    g = withHand(g, ["bodyguard", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("8: does not post a guard when Subjugate is playable this turn", () => {
    let g = base();
    g = { ...g, relations: statusLead(g.relations, "alpha", "beta", 2) };
    g = withHand(g, ["bodyguard", "subjugate"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "beta" });
  });

  it("8: does not post a guard with no subjugation-grade Status lead", () => {
    let g = base();
    g = { ...g, relations: statusLead(g.relations, "alpha", "beta", 1) };
    g = withHand(g, ["bodyguard", "grow-crops"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
  });

  // Supplementary tests below: the brief's six "8:" tests above mostly pass
  // even if the branch they target is deleted outright, because an existing,
  // unconditional later step (grow-crops, or the lone build target) happens
  // to land on the same card by coincidence. These tests are built so that
  // deleting or weakening the relevant guard actually changes the answer.

  it("8 (supplementary): extending diplomacy still wins over an available grow-crops fallback", () => {
    // Unlike the brief's own "extends only with an Alliance in hand" test,
    // grow-crops is also in hand here. If the extend branch were deleted,
    // the unconditional grow-crops step (existing, later) would take the
    // turn instead, at cardIndex 2, not 0 - so this fails without the branch.
    let g = base();
    g = withHand(g, ["extended-diplomacy", "alliance", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("8 (supplementary): withholds diplomacy when Alliance is not in hand, even though Alliance has valid targets in the game state", () => {
    // validTargetsFor("alliance") is nonempty here purely from game state
    // (nobody is allied, all reachable) even though "alliance" is not in
    // hand. A guard that dropped the hand.includes("alliance") check and
    // relied on validTargetsFor alone would wrongly fire and return
    // cardIndex 0; the build step's Raid is the correct fallback instead.
    let g = base();
    g = withHand(g, ["extended-diplomacy", "raid"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "beta" });
  });

  it("8 (supplementary): the guard threshold is the Subjugate bar itself, not merely 'some lead'", () => {
    // alpha leads beta by 1 Status, one short of the bar of
    // SUBJUGATE_THRESHOLD * 1 = 2. A guard that fired on any positive lead
    // (dropping the ">= required" comparison) would wrongly post the guard
    // at cardIndex 0; the correct answer builds with Raid instead.
    let g = base();
    g = { ...g, relations: statusLead(g.relations, "alpha", "beta", 1) };
    g = withHand(g, ["bodyguard", "raid"]);
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "beta" });
  });

  it("9: discards leftmost when nothing is playable", () => {
    let g = base();
    g = withHand(g, ["subjugate", "incorporate"]);
    expect(chooseAction(g)).toEqual({ type: "discard", cardIndex: 0 });
  });

  it("fortify is not wasted when unthreatened", () => {
    let g = base();
    g = withHand(g, ["fortify", "raid"]);
    // no one leads alpha: prefer building with raid (priority 7 over 6's gate)
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("11: a card whose branch declines still falls through without crashing", () => {
    let g = base();
    g = withHand(g, ["alliance"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0, targetId: "beta" });

    let g2 = base();
    g2 = withHand(g2, ["assassinate-ruler"]);
    expect(chooseAction(g2)).toEqual({ type: "play", cardIndex: 0, targetId: "beta" });

    let g3 = base();
    g3 = withHand(g3, ["extended-diplomacy"]);
    expect(chooseAction(g3)).toEqual({ type: "play", cardIndex: 0 });
  });
});

const chosen = (g: GameState): string => {
  const a = chooseAction(g);
  return a.type === "play" ? g.players[1].hand[a.cardIndex] : "(discard)";
};

describe("chooseAction with scaling gains", () => {
  it("5: finishes a bar that only a multi-point Raid can reach", () => {
    // Full adjacency. alpha holds delta, so alpha's realm touches beta twice
    // -> Raid on beta is worth 2, and beta's bar is 2 x 1 land = 2.
    // alpha also sits one Status short of gamma's bar of 2.
    // Old policy: Raid needs lead === bar - 1, which fails at lead 0, so it
    // falls to Shrewd marriage on gamma. New policy: 0 + 2 >= 2, so Raid on
    // beta finishes now. The two differ, which is what makes this a test.
    let g = base();
    g = {
      ...g,
      overlords: new Map([["delta", "alpha"]]),
      relations: statusLead({}, "alpha", "gamma", 1),
    };
    g = withHand(g, ["shrewd-marriage", "raid"]);
    expect(chooseAction(g)).toMatchObject({
      type: "play", targetId: "beta",
    });
    expect(chosen(g)).toBe("raid");
  });

  it("6b: reads the omens before building", () => {
    // No vassals, so Raid is worth 1 against a bar of 2: step 5 cannot fire
    // and the policy would otherwise build. It reads the omens instead.
    expect(chosen(withHand(base(), ["favourable-omens", "raid"]))).toBe(
      "favourable-omens",
    );
  });

  it("6b: does not read the omens with nothing to double", () => {
    expect(chosen(withHand(base(), ["favourable-omens", "grow-crops"]))).toBe(
      "grow-crops",
    );
  });

  it("6b: never reads the omens while a vassal, which would double its tribute", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "delta"]]) };
    expect(chosen(withHand(g, ["favourable-omens", "raid"]))).toBe("raid");
  });

  it("6b: never delays a play that finishes a subjugation", () => {
    // lead 1 + gain 1 meets beta's bar of 2, so step 5 fires first.
    let g = base();
    g = { ...g, relations: lead({}, "alpha", "beta", 1) };
    expect(chosen(withHand(g, ["favourable-omens", "raid"]))).toBe("raid");
  });

  it("7: ranks by plays remaining, not by point deficit", () => {
    // A six-land map built so the two rankings disagree:
    //   beta  - bar 2, alpha trails by 1 -> deficit 3, Raid worth 1 -> 3 plays
    //   gamma - bar 4 (gamma plus incorporated g1), lead 0 -> deficit 4,
    //           Raid worth 3 (alpha, a1 and a2 all touch gamma) -> 2 plays
    // Neither is finishable, so step 5 stays quiet and step 7 decides.
    // The old ranking picks beta (3 < 4); the new one must pick gamma.
    const IDS = ["alpha", "a1", "a2", "beta", "gamma", "g1"];
    const ADJ = {
      alpha: ["a1", "a2", "beta", "gamma"],
      a1: ["alpha", "gamma"],
      a2: ["alpha", "gamma"],
      beta: ["alpha"],
      gamma: ["alpha", "a1", "a2", "g1"],
      g1: ["gamma"],
    };
    let g = pickFaction(
      chooseDeck(startGame(newGame(IDS, ADJ)), buildDeck()),
      "beta",
      seededRng(1),
    );
    g = {
      ...g,
      current: g.players.findIndex((p) => p.factionId === "alpha"),
      overlords: new Map([["a1", "alpha"], ["a2", "alpha"]]),
      incorporated: { g1: "gamma" },
      relations: lead({}, "beta", "alpha", 1), // beta leads alpha by 1
    };
    g = {
      ...g,
      players: g.players.map((pl) =>
        pl.factionId === "alpha" ? { ...pl, hand: ["raid"] } : pl,
      ),
    };
    expect(chooseAction(g)).toMatchObject({ type: "play", targetId: "gamma" });
  });
});

describe("found a settlement (steps 7b and 9b)", () => {
  // alpha is the actor throughout; beta is the human seat.
  const threatened = (g: GameState, by: string, n: number): GameState => ({
    ...g,
    relations: lead({}, by, "alpha", n),
  });

  it("settles against a threat within two plays of taking it", () => {
    // alpha's bar is 2 (one land); gamma leading by 1 is one play short.
    const g = threatened(withHand(base(), ["found-settlement"]), "gamma", 1);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "alpha",
    });
  });

  it("prefers its own land, then an annexed one, over a vassal's", () => {
    const g = {
      ...threatened(withHand(base(), ["found-settlement"]), "gamma", 1),
      overlords: new Map([["delta", "alpha"]]),
      incorporated: { beta: "alpha" },
      settled: ["alpha"], // own land already settled
    };
    // beta is annexed and permanent; delta is a vassal that can walk off.
    expect(chooseAction(g)).toMatchObject({ targetId: "beta" });
    expect(chooseAction({ ...g, settled: ["alpha", "beta"] }))
      .toMatchObject({ targetId: "delta" });
  });

  it("does not settle a land with no free site", () => {
    const g = {
      ...threatened(withHand(base(), ["found-settlement", "grow-crops"]), "gamma", 1),
      sites: [], // no land in this world has a spare slot
    };
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 }); // grows crops
  });

  it("does not settle the same land twice", () => {
    const g = {
      ...threatened(withHand(base(), ["found-settlement", "grow-crops"]), "gamma", 1),
      sites: ["alpha"],
      settled: ["alpha"],
    };
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
  });

  it("spends an unthreatened turn settling rather than growing crops", () => {
    // No leads anywhere, so no threat and nothing to build toward: step 9b.
    const g = withHand(base(), ["grow-crops", "found-settlement"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "alpha",
    });
  });

  it("takes a subjugation over a settlement", () => {
    // alpha leads gamma by 2, gamma's realm is one land: Subjugate is live.
    const g = {
      ...withHand(base(), ["found-settlement", "subjugate"]),
      relations: lead({}, "alpha", "gamma", 2),
    };
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1, targetId: "gamma" });
  });

  it("raids toward a subjugation rather than settling, when one is near", () => {
    // Step 9 outranks 9b: a lead that wins a vassal beats a bar that delays one.
    const g = {
      ...withHand(base(), ["found-settlement", "raid"]),
      relations: lead({}, "alpha", "gamma", 1),
    };
    expect(chooseAction(g)).toMatchObject({ cardIndex: 1 });
  });
});

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

describe("subjugation-stability policy branches", () => {
  it("2a: sows a revolt while a vassal", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "beta"]]) };
    g = withHand(g, ["grow-crops", "seeds-of-revolt"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("2: prefers a live Revolt over sowing another", () => {
    // Sowing is illegal while one is live, but the ordering must also be right:
    // escaping now beats preparing to escape.
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "beta"]]) };
    g = withHand(g, ["seeds-of-revolt", "revolt"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("3: waits rather than gambling the only Incorporate on long odds", () => {
    let g = base();
    g = { ...g, overlords: new Map([["gamma", "alpha"]]) };
    // loyalty 1 of 5 -> 20%, below MIN_ODDS: the policy must not play it.
    g = { ...g, loyalty: { [loyaltyKey("gamma", "alpha")]: 1 } };
    g = withHand(g, ["incorporate", "grow-crops"]);
    expect(chooseAction(g)).not.toMatchObject({ cardIndex: 0 });
  });

  it("3: prefers the smaller vassal when the bigger one is a long shot", () => {
    // delta is worth 2 land at 20%; gamma is worth 1 at 100%. Land alone would
    // pick delta and usually burn the card for nothing.
    let g = base();
    g = { ...g, overlords: new Map([["gamma", "alpha"], ["delta", "alpha"]]) };
    g = { ...g, incorporated: { beta: "delta" } };
    g = {
      ...g,
      loyalty: {
        [loyaltyKey("gamma", "alpha")]: INCORPORATE_RAMP,
        [loyaltyKey("delta", "alpha")]: 1,
      },
    };
    g = withHand(g, ["incorporate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("4: takes the certain target over a bigger lead on a coin-flip poach", () => {
    let g = base();
    g = { ...g, overlords: new Map([["delta", "beta"]]) };
    let rel: Relations = {};
    rel = lead(rel, "alpha", "gamma", 2);   // free: exactly at the bar, certain
    rel = lead(rel, "alpha", "delta", 9);   // poach: far clear, but 50%
    g = { ...g, relations: rel };
    g = withHand(g, ["subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });
});

describe("convex Raid valuation", () => {
  it("prefers the target it has the widest border against", () => {
    // alpha (the actor) holds gamma as a vassal, so its realm is {alpha, gamma}.
    // On this map both alpha and gamma touch beta, but only alpha touches delta:
    // a Raid on beta is worth raidYield(2)=3, on delta raidYield(1)=1.
    const ADJ = {
      alpha: ["beta", "gamma", "delta"],
      beta: ["alpha", "gamma"],
      gamma: ["alpha", "beta"],
      delta: ["alpha"],
    };
    let g = pickFaction(
      chooseDeck(startGame(newGame(FACTIONS, ADJ)), buildDeck()),
      "beta",
      seededRng(1),
    );
    g = { ...g, current: 1, overlords: new Map([["gamma", "alpha"]]) };
    g = withHand(g, ["raid"]);
    const action = chooseAction(g);
    expect(action).toMatchObject({ type: "play", cardIndex: 0 });
    expect((action as { targetId: string }).targetId).toBe("beta");
  });

  it("scores a wide-border Raid above a flat +1 card", () => {
    // Same wide border. Given both Raid and Shrewd marriage, the policy must
    // take the Raid: scoring the raw border count instead of raidYield would
    // still pick Raid here, so the guard that matters is the size of the gain
    // it believes in - checked directly below.
    const ADJ = {
      alpha: ["beta", "gamma", "delta"],
      beta: ["alpha", "gamma"],
      gamma: ["alpha", "beta"],
      delta: ["alpha"],
    };
    let g = pickFaction(
      chooseDeck(startGame(newGame(FACTIONS, ADJ)), buildDeck()),
      "beta",
      seededRng(1),
    );
    g = { ...g, current: 1, overlords: new Map([["gamma", "alpha"]]) };
    g = withHand(g, ["shrewd-marriage", "raid"]);
    expect(chooseAction(g)).toMatchObject({ type: "play", cardIndex: 1 });
  });

  it("finishes with a Raid whose convex yield alone clears the bar", () => {
    // delta's bar is SUBJUGATE_THRESHOLD * 1 = 2 and alpha leads by 0. A raid
    // worth 1 cannot set up a finish, but a raid worth 3 can. Give alpha a wide
    // border on delta and check the policy sees a finishing play.
    const ADJ = {
      alpha: ["delta", "gamma"],
      beta: ["gamma"],
      gamma: ["alpha", "beta", "delta"],
      delta: ["alpha", "gamma"],
    };
    let g = pickFaction(
      chooseDeck(startGame(newGame(FACTIONS, ADJ)), buildDeck()),
      "beta",
      seededRng(1),
    );
    g = { ...g, current: 1, overlords: new Map([["gamma", "alpha"]]) };
    g = withHand(g, ["raid"]);
    const action = chooseAction(g);
    // Two of alpha's realm lands border delta, so the raid is worth 3 - past
    // delta's bar of 2 in one play.
    expect(action).toMatchObject({ type: "play", cardIndex: 0, targetId: "delta" });
  });
});
