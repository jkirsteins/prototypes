import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { catchUp, deserialize, loadGame, MAX_OFFLINE_SECONDS, SAVE_KEY, saveGame, serialize } from "../src/sim/save";

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe("advance", () => {
  it("moves the clock by exactly the minutes asked, in any step size", () => {
    const a = newGame(8);
    const b = newGame(8);
    advance(a.state, a.world, 60);
    for (let i = 0; i < 600; i++) advance(b.state, b.world, 0.1);
    expect(a.state.minute).toBeCloseTo(60, 6);
    expect(b.state.minute).toBeCloseTo(60, 6);
  });

  it("kills an idle character who never eats, and names the cause", () => {
    const { state, world } = newGame(8);
    state.player.autoEat = false;
    advance(state, world, 1440 * 12);
    expect(state.dead).not.toBeNull();
    expect(["starved", "froze"]).toContain(state.dead!.cause);
    expect(state.task).toBeNull();
  });

  it("falls asleep on its own when idle and spent", () => {
    const { state, world } = newGame(8);
    state.player.energy = 9;
    advance(state, world, 5);
    expect(state.task?.id).toBe("sleep");
    expect(state.log.some((e) => e.text.includes("sleep where you are"))).toBe(true);
  });

  it("survives the first day with the starting kit", () => {
    const { state, world } = newGame(8);
    advance(state, world, 1440);
    expect(state.dead).toBeNull();
    expect(state.player.health).toBeGreaterThan(50);
  });
});

describe("save", () => {
  it("round-trips the whole state", () => {
    const { state, world } = newGame(9);
    advance(state, world, 500);
    const file = deserialize(serialize(state, 1234));
    expect(file).not.toBeNull();
    expect(file!.savedAt).toBe(1234);
    const expected = JSON.parse(JSON.stringify(state));
    delete (expected as unknown as Record<string, unknown>).plan;
    expect(file!.state).toEqual(expected);
  });

  it("stores, loads, and removes the save on death", () => {
    const storage = new MemStorage();
    const { state } = newGame(9);
    saveGame(state, storage, 5);
    expect(loadGame(storage)?.state.seed).toBe(9);
    state.dead = { cause: "starved", minute: 10 };
    saveGame(state, storage, 6);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(loadGame(storage)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize("{}")).toBeNull();
  });

  it("catches up on time away, capped at a day, and reports what happened", () => {
    const { state, world } = newGame(9);
    // Twenty real minutes are 1200 game minutes.
    const entries = catchUp(state, world, 20 * 60);
    expect(state.minute).toBeCloseTo(1200, 6);
    expect(Array.isArray(entries)).toBe(true);
    const long = newGame(9);
    catchUp(long.state, long.world, MAX_OFFLINE_SECONDS * 3);
    // A real second is a game minute, so the cap in game minutes equals the cap in seconds.
    expect(long.state.minute).toBeLessThanOrEqual(MAX_OFFLINE_SECONDS);
  });
});
