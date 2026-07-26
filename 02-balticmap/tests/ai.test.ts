import { describe, it, expect } from "vitest";
import { chooseAction } from "../src/ai";
import {
  newGame, startGame, pickFaction, type GameState,
} from "../src/game";
import { bumpMight, bumpStatus, type Relations } from "../src/relations";
import type { Rng } from "../src/cards";

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
  const g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
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

  it("2: reclaim when playable", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["grow-crops", "reclaim-independence"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("3: incorporate the first vassal", () => {
    let g = base();
    g = { ...g, overlords: new Map([["delta", "alpha"], ["gamma", "alpha"]]) };
    g = withHand(g, ["subjugate", "incorporate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma", // faction order
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
});
