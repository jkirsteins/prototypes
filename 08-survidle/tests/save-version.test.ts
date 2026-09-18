import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { loadGame, readSave, SAVE_KEY, serialize } from "../src/sim/save";
import { inspectSave, SAVE_VERSION } from "../src/sim/save-version";

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

describe("the save version", () => {
  it("calls another schema version stale, and reads nothing from it", () => {
    const old = JSON.stringify({ version: SAVE_VERSION - 1, savedAt: 1, state: { seed: 21 } });
    expect(inspectSave(old)).toBe("stale");
    expect(readSave(old)).toBeNull();
    const newer = JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 1, state: { seed: 21 } });
    expect(inspectSave(newer)).toBe("stale");
    expect(readSave(newer)).toBeNull();
  });

  it("calls unparsable text invalid, not stale", () => {
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

  it("writes the schema version and nothing else into the envelope", () => {
    const { state } = newGame(21);
    const envelope = JSON.parse(serialize(state, 1000)) as Record<string, unknown>;
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(Object.keys(envelope).sort()).toEqual(["savedAt", "state", "version"]);
  });

  it("loads nothing from storage holding a save of another version", () => {
    const { state } = newGame(21);
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION - 1, savedAt: 1, state }));
    expect(loadGame(storage)).toBeNull();
  });
});
