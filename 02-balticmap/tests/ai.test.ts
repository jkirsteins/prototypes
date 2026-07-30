import { describe, it, expect } from "vitest";
import { chooseAction } from "../src/ai";
import {
  newGame, startGame, chooseDeck, pickFaction, type GameState,
} from "../src/game";
import { bumpMight, bumpStatus, type Relations } from "../src/relations";
import { buildDeck, type Rng } from "../src/cards";

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
    // gamma leads alpha by 2 might, 0 status -> weaker track is status
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 2) };
    g = withHand(g, ["raid", "pay-tribute"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, tributeTrack: "status",
    });
  });

  it("1: tribute track tie goes to might", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["pay-tribute"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, tributeTrack: "might",
    });
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
    // Pay tribute is forced while a vassal, giving it exclusive occupancy of
    // cardIndexes. This means idxOf("revolt") is undefined and step 2 never
    // fires. The two cards cannot co-occur in playableSet, so their relative
    // step order has no observable effect and no ordering test exists.
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["revolt", "pay-tribute"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, tributeTrack: "might",
    });
  });

  it("3: incorporates the vassal that brings the most land", () => {
    let g = base();
    // alpha holds gamma and delta; delta has annexed a land, so it is worth more
    g = { ...g, overlords: new Map([["gamma", "alpha"], ["delta", "alpha"]]) };
    g = { ...g, incorporated: { beta: "delta" } };
    g = withHand(g, ["incorporate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "delta",
    });
  });

  it("3: breaks a realm-size tie by faction order", () => {
    let g = base();
    g = { ...g, overlords: new Map([["gamma", "alpha"], ["delta", "alpha"]]) };
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

  it("9: unrecognized diplomacy cards (no dedicated priority) fall through as a last resort without crashing", () => {
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
