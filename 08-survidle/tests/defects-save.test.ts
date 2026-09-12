import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { readSave, serialize } from "../src/sim/save";
import type { GameState } from "../src/sim/types";
import { siteCamp } from "./siting-helpers";

/**
 * Knowledge rides the save as an encoded string and comes back a Map of typed
 * arrays, so a JSON copy of the live state is not a usable expectation for it:
 * it flattens the Map to an empty object. The chunks are compared as chunks
 * and the rest as JSON.
 */
function jsonPart(state: GameState): unknown {
  const copy = { ...state, knowledge: { ...state.knowledge, chunks: undefined } };
  const plain = JSON.parse(JSON.stringify(copy)) as Record<string, unknown>;
  delete plain.plan;
  return plain;
}

describe("a current save round-trips", () => {
  it("carries every field, the knowledge chunks included", () => {
    const { state, world } = newGame(9);
    siteCamp(state, world);
    advance(state, world, 120);
    const file = readSave(serialize(state, 1234));
    expect(file).not.toBeNull();
    expect(file!.savedAt).toBe(1234);
    expect(state.knowledge.chunks.size).toBeGreaterThan(0);
    expect(file!.state.knowledge.chunks).toEqual(state.knowledge.chunks);
    expect(jsonPart(file!.state)).toEqual(jsonPart(state));
  });
});
