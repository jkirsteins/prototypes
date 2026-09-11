import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { deserialize, loadGame, SAVE_KEY, serialize } from "../src/sim/save";

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

describe("save version 10", () => {
  it("round-trips a fresh save and refuses an older one with a reason", () => {
    const { state } = newGame(42);
    const text = serialize(state);
    expect(JSON.parse(text).version).toBe(10);
    const back = deserialize(text);
    expect(back && "state" in back && back.state.seed).toBe(42);
    const old = JSON.stringify({ version: 9, savedAt: 1, state });
    const refused = deserialize(old);
    expect(refused && "refused" in refused ? refused.refused : "").toMatch(/world/i);
  });

  it("loads nothing from storage holding an older save, and tells the caller why", () => {
    const { state } = newGame(42);
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 9, savedAt: 1, state }));
    let reason = "";
    expect(loadGame(storage, (r) => { reason = r; })).toBeNull();
    expect(reason).toMatch(/world/i);
  });

  it("reads nothing from a version above 10: a save from a later build is unreadable, not refused with a reason", () => {
    const { state } = newGame(42);
    expect(deserialize(JSON.stringify({ version: 11, savedAt: 1, state }))).toBeNull();
  });
});
