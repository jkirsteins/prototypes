import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { deserialize, loadGame, readSave, SAVE_KEY, serialize } from "../src/sim/save";
import { canPersist, inspectSave, SAVE_VERSION, WORLD_VERSION } from "../src/sim/world-version";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

/** The refusal sentence a save from another world comes back with, or "" when it was read. */
function refusal(text: string): string {
  const file = deserialize(text);
  return file && "refused" in file ? file.refused : "";
}

describe("the fine world's version boundary", () => {
  it("rejects a version 9 world before interpreting old cell ids", () => {
    const old = JSON.stringify({ version: 9, savedAt: 1, state: { seed: 21 } });
    expect(inspectSave(old)).toBe("old-world");
    expect(readSave(old)).toBeNull();
    expect(refusal(old)).toMatch(/world/i);
  });

  it("calls unparsable text invalid, not old-world", () => {
    expect(inspectSave("not json")).toBe("invalid");
    expect(inspectSave(JSON.stringify({ savedAt: 1, state: {} }))).toBe("invalid");
    expect(inspectSave(JSON.stringify({ version: 9, state: {} }))).toBe("invalid");
    expect(inspectSave(JSON.stringify({ version: 9, savedAt: 1 }))).toBe("invalid");
  });

  it("calls the current envelope current", () => {
    const { state } = newGame(21);
    expect(inspectSave(serialize(state))).toBe("current");
  });

  it("round trips metre positions, fine patch keys, and compact knowledge", () => {
    const { state } = newGame(21);
    const back = readSave(serialize(state, 1000));
    expect(back).not.toBeNull();
    expect(back?.state.player).toMatchObject({ xM: state.player.xM, yM: state.player.yM });
    expect(back?.state.knowledge).toEqual(state.knowledge);
  });

  it("writes both the schema and world version into a current save", () => {
    const { state } = newGame(21);
    const envelope = JSON.parse(serialize(state, 1000)) as { version: number; worldVersion: number };
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(envelope.worldVersion).toBe(WORLD_VERSION);
  });

  it("calls a current schema version with a stale world version old-world", () => {
    const stale = JSON.stringify({ version: SAVE_VERSION, worldVersion: WORLD_VERSION - 1, savedAt: 1, state: { seed: 21 } });
    expect(inspectSave(stale)).toBe("old-world");
    expect(readSave(stale)).toBeNull();
  });

  it("loads nothing from storage holding a save of another world, and tells the caller why", () => {
    const { state } = newGame(21);
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 9, savedAt: 1, state }));
    let reason = "";
    expect(loadGame(storage, (r) => { reason = r; })).toBeNull();
    expect(reason).toMatch(/world/i);
  });

  it("never lets a throwaway world persist over the save an old-world message is about", () => {
    expect(canPersist(true)).toBe(false);
    expect(canPersist(false)).toBe(true);
  });
});
