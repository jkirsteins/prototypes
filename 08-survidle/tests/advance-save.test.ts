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
    // Never drinks either: away from any shore or vessel, thirst can win the race.
    expect(["starved", "froze", "thirst"]).toContain(state.dead!.cause);
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

  it("a new game starts with the new body fields, and an old save gets them filled", () => {
    const { state } = newGame(8);
    expect(state.player.water).toBe(2.5);
    expect(state.player.autoDrink).toBe(true);
    expect(state.player.frostbite).toEqual({ feet: 0, hands: 0 });
    expect(state.weather.iceCm).toBe(0);
    expect(state.weather.storm).toBeNull();
    const st = state.regions[state.player.region];
    expect(st.fire).toEqual({ lit: false, fuelKg: 0, wetKg: 0, indoors: false, unattended: 0 });
    expect(st.smoke).toBe(0);
    expect(st.structures.hearth).toBe(false);
    state.player.tools.push({ id: "barkBucket", durability: 100 });
    const raw = JSON.parse(serialize(state));
    delete raw.state.player.water;
    delete raw.state.player.autoDrink;
    delete raw.state.player.frostbite;
    delete raw.state.player.toes;
    delete raw.state.player.fingers;
    delete raw.state.player.clothing[0].wet;
    delete raw.state.player.tools.find((t: { id: string }) => t.id === "barkBucket").litres;
    delete raw.state.weather.iceCm;
    delete raw.state.weather.storm;
    delete raw.state.weather.dryDays;
    delete raw.state.weather.wetDay;
    delete raw.state.weather.dryWarned;
    delete raw.state.regions[state.player.region].fire.wetKg;
    delete raw.state.regions[state.player.region].fire.indoors;
    delete raw.state.regions[state.player.region].fire.unattended;
    delete raw.state.regions[state.player.region].smoke;
    delete raw.state.regions[state.player.region].structures.hearth;
    delete raw.state.regions[state.player.region].logsWet;
    const back = deserialize(JSON.stringify(raw))!.state;
    expect(back.player.water).toBe(2.5);
    expect(back.player.autoDrink).toBe(true);
    expect(back.player.frostbite).toEqual({ feet: 0, hands: 0 });
    expect(back.player.toes).toBe(false);
    expect(back.player.fingers).toBe(false);
    expect(back.player.clothing[0].wet).toBe(0);
    expect(back.player.tools.find((t) => t.id === "barkBucket")!.litres).toBe(0);
    expect(back.player.tools.find((t) => t.id === "barkBucket")!.frozen).toBe(false);
    expect(back.weather.iceCm).toBe(0);
    expect(back.weather.storm).toBeNull();
    expect(back.weather.dryDays).toBe(0);
    expect(back.weather.wetDay).toBe(false);
    expect(back.weather.dryWarned).toBe(false);
    expect(back.regions[state.player.region].fire.wetKg).toBe(0);
    expect(back.regions[state.player.region].fire.indoors).toBe(false);
    expect(back.regions[state.player.region].fire.unattended).toBe(0);
    expect(back.regions[state.player.region].smoke).toBe(0);
    expect(back.regions[state.player.region].structures.hearth).toBe(false);
    expect(back.regions[state.player.region].logsWet).toBe(1440);
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
    const away = catchUp(state, world, 20 * 60);
    expect(state.minute).toBeCloseTo(1200, 6);
    expect(Array.isArray(away.entries)).toBe(true);
    const long = newGame(9);
    catchUp(long.state, long.world, MAX_OFFLINE_SECONDS * 3);
    // A real second is a game minute, so the cap in game minutes equals the cap in seconds.
    expect(long.state.minute).toBeLessThanOrEqual(MAX_OFFLINE_SECONDS);
  });
});
