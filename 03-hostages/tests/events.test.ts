import { describe, it, expect } from "vitest";
import { newRun, chooseOpening, playerLead, playerPass } from "../src/game";
import { drawCard } from "../src/deck";
import type { EventKind, GameState } from "../src/types";

function started(): GameState {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

const kinds = (state: GameState): EventKind[] => state.log.map((e) => e.kind);

describe("event stream", () => {
  it("stamps vitals on every event", () => {
    const state = started();
    expect(state.log.length).toBeGreaterThan(0);
    for (const e of state.log) {
      expect(e.vitals.playerVigor).toBe(state.player.vigor);
      expect(typeof e.vitals.secretsLeft).toBe("number");
    }
  });

  it("stamps pile snapshots on every event", () => {
    const state = started();
    const last = state.log[state.log.length - 1];
    expect(last.piles.player.hand).toEqual(state.playerPile.hand);
    expect(last.piles.player.deck).toBe(state.playerPile.deck.length);
    expect(last.piles.convict.hand).toBe(state.convictPile.hand.length);
  });

  it("does not alias the hand - later mutation leaves the snapshot alone", () => {
    const state = started();
    const before = state.log[state.log.length - 1].piles.player.hand.length;
    state.playerPile.hand.push("stoic");
    expect(state.log[state.log.length - 1].piles.player.hand).toHaveLength(before);
  });

  it("emits a draw per card dealt in the opening", () => {
    const state = started();
    // three for each side
    expect(state.log.filter((e) => e.kind === "draw")).toHaveLength(6);
  });

  it("emits a turn marker for each side's turn", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    state.convictPile.hand = [];
    playerLead(state, "stallHim");
    const turnMarkers = state.log.filter((e) => e.kind === "turn");
    expect(turnMarkers.map((e) => e.side)).toContain("convict");
  });

  it("puts the convict turn marker before anything he does", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    playerPass(state);
    const seq = kinds(state);
    const marker = seq.lastIndexOf("turn");
    expect(marker).toBeGreaterThan(-1);
    const convictMarker = state.log.findIndex((e) => e.kind === "turn" && e.side === "convict");
    const convictDraw = state.log.findIndex((e) => e.kind === "draw" && e.side === "convict" && e.turn > 1);
    expect(convictMarker).toBeLessThan(convictDraw);
  });

  it("marks the turn with the number it belongs to", () => {
    const state = started();
    state.playerPile.hand = ["stallHim"];
    playerPass(state);
    for (const e of state.log.filter((m) => m.kind === "turn")) {
      expect(e.turn).toBeGreaterThan(0);
    }
  });
});

describe("drawCard reshuffle hook", () => {
  it("fires exactly once when the deck is refilled from the discard", () => {
    let fired = 0;
    const pile = { deck: [], discard: ["stoic", "stallHim"], hand: [] as string[] };
    drawCard(pile, { seed: 7 }, () => {
      fired += 1;
    });
    expect(fired).toBe(1);
    drawCard(pile, { seed: 7 }, () => {
      fired += 1;
    });
    expect(fired).toBe(1);
  });

  it("does not fire when both deck and discard are empty", () => {
    let fired = 0;
    const pile = { deck: [] as string[], discard: [] as string[], hand: [] as string[] };
    expect(drawCard(pile, { seed: 7 }, () => {
      fired += 1;
    })).toBeNull();
    expect(fired).toBe(0);
  });

  it("still works with no callback supplied", () => {
    const pile = { deck: ["stoic"], discard: [] as string[], hand: [] as string[] };
    expect(drawCard(pile, { seed: 7 })).toBe("stoic");
  });
});
