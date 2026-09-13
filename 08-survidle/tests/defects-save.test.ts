import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { readSave, serialize } from "../src/sim/save";
import type { GameState } from "../src/sim/types";
import { siteCamp } from "./siting-helpers";
import { knowledgeAt, markSeen, markVisited, setKnowledge } from "../src/sim/fineknowledge";
import { patchId, WORLD_FINE_H, WORLD_FINE_W } from "../src/world/spatial";

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

  it("carries patches either side of a chunk seam and on the world's partial edge chunk", () => {
    const { state } = newGame(9);
    // 96 patches to a chunk side, and the world is 112.5 chunks wide, so the
    // last column of chunks is cut short: its trailing bytes are a chunk's
    // worth of ground that is not there, and the encoding drops trailing zero
    // bytes and pads them back, which has to land on the same patches.
    const inside = patchId(95, 300);
    const across = patchId(96, 300);
    const edge = patchId(WORLD_FINE_W - 1, WORLD_FINE_H - 1);
    markVisited(state.knowledge, inside);
    markSeen(state.knowledge, across);
    setKnowledge(state.knowledge, edge, "inherited");
    const file = readSave(serialize(state, 1));
    expect(file).not.toBeNull();
    const back = file!.state.knowledge;
    expect(knowledgeAt(back, inside)).toBe("visited");
    expect(knowledgeAt(back, across)).toBe("seen");
    expect(knowledgeAt(back, edge)).toBe("inherited");
    // The seam is a seam: neither patch bleeds into the other's chunk.
    expect(knowledgeAt(back, patchId(94, 300))).toBe("unknown");
    expect(knowledgeAt(back, patchId(97, 300))).toBe("unknown");
    expect(back.chunks).toEqual(state.knowledge.chunks);
  });
});
