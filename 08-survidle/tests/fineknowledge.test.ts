import { describe, expect, it } from "vitest";
import {
  decodeKnowledge, encodeKnowledge, inheritKnowledge, knowledgeAt, knowledgeCounts,
  knownPatches, markSeen, markVisited, newKnowledge, setKnowledge,
} from "../src/sim/fineknowledge";
import { readSave, serialize } from "../src/sim/save";
import { newGame } from "../src/sim/newgame";
import { patchId } from "../src/world/spatial";

describe("compact fine knowledge", () => {
  it("allocates knowledge only for touched chunks", () => {
    const knowledge = newKnowledge();
    markVisited(knowledge, patchId(10, 10));
    expect(knowledge.chunks.size).toBe(1);
    expect(knowledgeAt(knowledge, patchId(10, 10))).toBe("visited");
    expect(knowledgeAt(knowledge, patchId(5000, 5000))).toBe("unknown");
  });

  it("round trips compact knowledge without object keys per patch", () => {
    const knowledge = newKnowledge();
    for (let x = 0; x < 96; x++) markSeen(knowledge, patchId(x, 10));
    const encoded = encodeKnowledge(knowledge);
    expect(encoded.length).toBeLessThan(1200);
    expect(knowledgeCounts(decodeKnowledge(encoded))).toEqual(knowledgeCounts(knowledge));
  });

  it("keeps a round trip patch for patch across several chunks", () => {
    const knowledge = newKnowledge();
    const seen = patchId(3, 4);
    const visited = patchId(1000, 900);
    const inherited = patchId(5000, 77);
    markSeen(knowledge, seen);
    markVisited(knowledge, visited);
    setKnowledge(knowledge, inherited, "inherited");
    expect(knowledge.chunks.size).toBe(3);
    const back = decodeKnowledge(encodeKnowledge(knowledge));
    expect(knowledgeAt(back, seen)).toBe("seen");
    expect(knowledgeAt(back, visited)).toBe("visited");
    expect(knowledgeAt(back, inherited)).toBe("inherited");
    expect(knownPatches(back).sort((a, b) => a - b)).toEqual([seen, visited, inherited].sort((a, b) => a - b));
  });

  it("refuses a corrupted string rather than decoding it as ground", () => {
    const knowledge = newKnowledge();
    markVisited(knowledge, patchId(40, 40));
    const encoded = encodeKnowledge(knowledge);
    // A character outside the alphabet read as zero is indistinguishable from
    // unknown ground once it is in the chunks, so decode refuses it instead.
    for (const bad of ["*", "!", " ", "\u00e9"]) {
      const damaged = `${encoded.slice(0, -1)}${bad}`;
      expect(() => decodeKnowledge(damaged)).toThrow();
      const { state } = newGame(1);
      const save = serialize(state, 1).replace(/"knowledge":"[^"]*"/, `"knowledge":"${damaged}"`);
      expect(save).toContain(damaged);
      expect(readSave(save)).toBeNull();
    }
  });

  it("raises a level but never lowers one, and the journal dims what is left", () => {
    const knowledge = newKnowledge();
    const patch = patchId(20, 20);
    expect(markVisited(knowledge, patch)).toBe(true);
    expect(markSeen(knowledge, patch)).toBe(false);
    expect(knowledgeAt(knowledge, patch)).toBe("visited");
    inheritKnowledge(knowledge);
    expect(knowledgeAt(knowledge, patch)).toBe("inherited");
    expect(knowledgeCounts(knowledge)).toEqual({ inherited: 1, seen: 0, visited: 0, known: 1 });
    expect(markSeen(knowledge, patch)).toBe(true);
    expect(knowledgeAt(knowledge, patch)).toBe("seen");
  });
});

describe("knowledge in a save", () => {
  it("carries the ground a landing knows through serialize and deserialize", () => {
    const { state } = newGame(1);
    const before = knowledgeCounts(state.knowledge);
    expect(before.known).toBeGreaterThan(0);
    const loaded = readSave(serialize(state))!;
    expect(loaded).not.toBeNull();
    expect(knowledgeCounts(loaded.state.knowledge)).toEqual(before);
    expect(encodeKnowledge(loaded.state.knowledge)).toBe(encodeKnowledge(state.knowledge));
    // structuredClone is how the forecast runs a copy of the world forward.
    expect(knowledgeCounts(structuredClone(state).knowledge)).toEqual(before);
  });

  it("opens a save whose knowledge was a property per cell", () => {
    const { state } = newGame(1);
    const legacy = JSON.parse(serialize(state)) as { state: Record<string, unknown> };
    legacy.state.knowledge = undefined;
    legacy.state.mapped = { 5: 1, 6: 3 };
    const loaded = readSave(JSON.stringify(legacy))!;
    expect(knowledgeAt(loaded.state.knowledge, 5)).toBe("seen");
    expect(knowledgeAt(loaded.state.knowledge, 6)).toBe("inherited");
  });
});
