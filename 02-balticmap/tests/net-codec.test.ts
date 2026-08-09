// tests/net-codec.test.ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import type { Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import { serializeGame, deserializeGame } from "../src/net-codec";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A real mid-game state: dealt, then a few AI rounds so the stores and the
 *  log are populated - then every defense-score store stamped non-empty, so
 *  the round-trip is checked against records a run may or may not have
 *  produced by that turn (overlords especially: the Map is the one field
 *  JSON cannot carry). */
function midGame(rng: Rng): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseBuild(g, "warpath", seededRng(1));
  g = pickFaction(g, "alpha", rng);
  for (let i = 0; i < 12 && g.phase === "playing"; i++) {
    g = advance(aiTakeTurn(g, rng), rng);
  }
  return {
    ...g,
    overlords: new Map([...g.overlords, ["delta", "alpha"]]),
    defense: { ...g.defense, beta: 120 },
    disease: { ...g.disease, gamma: { alpha: 2, beta: 1 } },
    miasma: { ...g.miasma, alpha: 1 },
    turnips: { ...g.turnips, delta: 3 },
  };
}

describe("net codec", () => {
  it("round-trips a mid-game state through JSON, overlords included", () => {
    const g = midGame(seededRng(7));
    expect(g.overlords.size).toBeGreaterThan(0);
    const wire = JSON.parse(JSON.stringify(serializeGame(g)));
    const back = deserializeGame(wire);
    expect(back).toEqual(g);
    expect(back.overlords).toBeInstanceOf(Map);
    // The defense-score stores are plain records and must survive verbatim.
    expect(back.defense).toEqual(g.defense);
    expect(back.disease).toEqual(g.disease);
    expect(back.miasma).toEqual(g.miasma);
    expect(back.turnips).toEqual(g.turnips);
  });

  it("raw JSON.stringify would have dropped overlords (the reason this file exists)", () => {
    const g = midGame(seededRng(7));
    const raw = JSON.parse(JSON.stringify(g));
    // Map -> {} is the silent bug the codec guards against. If this
    // assertion ever fails, overlords stopped being a Map and the codec
    // may be deletable - revisit, do not just fix the test.
    expect(raw.overlords).toEqual({});
  });
});
