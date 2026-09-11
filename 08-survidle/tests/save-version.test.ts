import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";

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
});
