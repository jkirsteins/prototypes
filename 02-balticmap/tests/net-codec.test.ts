// tests/net-codec.test.ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { buildDeck, type Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import { serializeGame, deserializeGame } from "../src/net-codec";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A real mid-game state: dealt, then a few AI rounds so overlords,
 *  relations and the log are all populated. */
function midGame(rng: Rng): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseDeck(g, buildDeck());
  g = pickFaction(g, "alpha", rng);
  for (let i = 0; i < 12 && g.phase === "playing"; i++) {
    g = advance(aiTakeTurn(g, rng), rng);
  }
  return g;
}

describe("net codec", () => {
  it("round-trips a mid-game state through JSON, overlords included", () => {
    const g = midGame(seededRng(7));
    const wire = JSON.parse(JSON.stringify(serializeGame(g)));
    const back = deserializeGame(wire);
    expect(back).toEqual(g);
    expect(back.overlords).toBeInstanceOf(Map);
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
