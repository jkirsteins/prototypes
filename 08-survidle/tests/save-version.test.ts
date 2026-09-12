import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";
import { canPersist, inspectSave, SAVE_VERSION, WORLD_VERSION } from "../src/sim/world-version";

describe("the fine world's version boundary", () => {
  it("rejects a version 9 world before interpreting old cell ids", () => {
    const old = JSON.stringify({ version: 9, savedAt: 1, state: { seed: 21 } });
    expect(inspectSave(old)).toBe("old-world");
    expect(deserialize(old)).toBeNull();
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
    const back = deserialize(serialize(state, 1000));
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
    expect(deserialize(stale)).toBeNull();
  });

  it("never lets a throwaway world persist over the save an old-world message is about", () => {
    expect(canPersist(true)).toBe(false);
    expect(canPersist(false)).toBe(true);
  });
});
