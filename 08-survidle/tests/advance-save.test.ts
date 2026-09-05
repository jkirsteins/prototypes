import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { fillPopulations } from "../src/sim/regionstate";
import { awaySeconds, catchUp, deserialize, loadGame, SAVE_KEY, saveGame, serialize } from "../src/sim/save";
import { AWAY_HOURS_MAX } from "../src/units";
import { regionAt, speciesHere } from "../src/world/gen";

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

  it("stores, loads, and keeps the save on death", () => {
    const storage = new MemStorage();
    const { state } = newGame(9);
    saveGame(state, storage, 5);
    expect(loadGame(storage)?.state.seed).toBe(9);
    state.dead = { cause: "starved", minute: 10 };
    saveGame(state, storage, 6);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadGame(storage)?.state.dead?.cause).toBe("starved");
  });

  it("finishes a hunt or a cast saved against a species the catalogue no longer has, as nothing", () => {
    // Saves written before the species catalogue carry a bare "fish" task and hunts
    // for "grouse". SaveFile.version is still 3, so they load and their task runs on.
    for (const task of [{ id: "fish" as const, progress: 59, duration: 60, repeat: false }, { id: "hunt" as const, arg: "grouse", progress: 59, duration: 60, repeat: false }]) {
      const { state, world } = newGame(4);
      state.task = { ...task };
      expect(() => advance(state, world, 2)).not.toThrow();
      expect(state.task).toBeNull();
      expect(state.stats.animals).toBe(0);
    }
  });

  it("a save from the five-animal world loads with its roster filled and its dead keys gone", () => {
    const { state, world } = newGame(5);
    const id = state.player.region;
    const st = state.regions[id];
    (st as unknown as { pop: Record<string, number> }).pop = { hare: 10, grouse: 20, deer: 3, elk: 1, fish: 40 };
    state.task = { id: "fish", progress: 0, duration: 60, repeat: false };
    state.paused["hunt:grouse@123"] = { id: "hunt", arg: "grouse", fraction: 0.5, cell: 123 };
    const file = deserialize(serialize(state))!;
    fillPopulations(file.state, world);
    const pop = file.state.regions[id].pop as Record<string, number | undefined>;
    expect(pop.grouse).toBeUndefined();
    expect(pop.fish).toBeUndefined();
    if (regionAt(world, id).capacity.hare) expect(pop.hare).toBe(10);
    for (const s of speciesHere(regionAt(world, id))) expect(pop[s]).toBeGreaterThan(0);
    expect(file.state.task).toMatchObject({ id: "fish", arg: "any" });
    // The renamed arg moves house: the dictionary key is derived from it, so the entry is
    // re-keyed too, not just edited in place under its stale "grouse" key.
    expect(file.state.paused["hunt:grouse@123"]).toBeUndefined();
    expect(file.state.paused["hunt:willowGrouse@123"]).toMatchObject({ arg: "willowGrouse", fraction: 0.5 });
  });

  it("a standing order saved against the old grouse or the bare fish keeps working after load", () => {
    const { state } = newGame(5);
    const id = state.player.region;
    const st = state.regions[id];
    st.orders = [
      { id: 1, kind: "grind", req: { task: "fish", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, done: 0, minutes: 0, skipped: "" },
      { id: 2, kind: "job", req: { task: "hunt", arg: "grouse", until: { kind: "once" }, deliver: "camp", where: "nearest" }, done: 0, minutes: 0, skipped: "" },
    ];
    st.nextOrderId = 3;
    const file = deserialize(serialize(state))!;
    const orders = file.state.regions[id].orders;
    expect(orders[0].req.arg).toBe("any");
    expect(orders[1].req.arg).toBe("willowGrouse");
  });

  it("a genuine version 3 save predating ice holes and water piles loads clean", () => {
    const { state, world } = newGame(17);
    const raw = JSON.parse(serialize(state));
    raw.version = 3;
    for (const st of Object.values(raw.state.regions) as Record<string, unknown>[]) {
      delete st.iceHole;
    }
    const toolIds = ["axe", "knife", "bow", "fishingSpear", "fireDrill", "needle", "barkBucket", "waterskin"];
    for (const inv of Object.values(raw.state.piles) as { items: Record<string, unknown> }[]) {
      delete inv.items.water;
      delete inv.items.ice;
      for (const id of toolIds) delete inv.items[id];
    }
    const file = deserialize(JSON.stringify(raw));
    expect(file).not.toBeNull();
    for (const st of Object.values(file!.state.regions)) expect(st.iceHole).toBeNull();
    expect(() => advance(file!.state, world, 1440)).not.toThrow();
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
    long.state.awayHours = AWAY_HOURS_MAX;
    catchUp(long.state, long.world, awaySeconds(long.state) * 3);
    // A real second is a game minute, so the cap in game minutes equals the cap in seconds.
    expect(long.state.minute).toBeLessThanOrEqual(awaySeconds(long.state));
  });
});

describe("the world save", () => {
  it("keeps the file when the survivor is dead", () => {
    const store = new MemStorage();
    const { state } = newGame(8);
    state.dead = { cause: "froze", minute: state.minute };
    saveGame(state, store);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadGame(store)!.state.dead!.cause).toBe("froze");
  });

  it("writes version 6 and reads 4 by wrapping the survivor as the first of the world", () => {
    const { state } = newGame(8);
    expect(JSON.parse(serialize(state)).version).toBe(6);
    const v4 = JSON.parse(serialize(state)) as { version: number; savedAt: number; state: Record<string, unknown> };
    v4.version = 4;
    delete v4.state.survivors;
    delete v4.state.year;
    delete v4.state.landing;
    delete v4.state.spine;
    // structureAge is version 5's own field: a real version 4 file never had it, so the
    // fixture must drop it too, or fillDefaults' default is never exercised.
    for (const st of Object.values(v4.state.regions as Record<string, Record<string, unknown>>)) delete st.structureAge;
    const file = deserialize(JSON.stringify(v4))!;
    expect(file.state.year).toBe(1);
    expect(file.state.landing).toBeNull();
    expect(file.state.survivors).toHaveLength(1);
    expect(file.state.survivors[0].index).toBe(1);
    expect(file.state.survivors[0].name.first.length).toBeGreaterThan(0);
    expect(file.state.survivors[0].landed).toEqual({ year: 1, doy: file.state.startDoy });
    expect(file.state.spine).toEqual({ fired: {}, announced: {} });
    for (const st of Object.values(file.state.regions)) expect(st.structureAge).toEqual({});
  });
});

describe("the version 6 save", () => {
  it("writes version 6 and fills the producers' fields into an older save", () => {
    const { state } = newGame(8);
    const text = serialize(state);
    expect(JSON.parse(text).version).toBe(6);
    const old = JSON.parse(text);
    old.version = 5;
    delete old.state.player.known;
    for (const st of Object.values(old.state.regions) as Record<string, unknown>[]) {
      delete (st.structures as Record<string, unknown>).turfHut;
      delete (st.structures as Record<string, unknown>).waterStore;
      delete st.trap;
    }
    old.state.ledger = [{ day: 1, yield: { fish: 0, snare: 0, hunt: 0, berries: 0, kit: 0 }, eaten: 0, burn: { base: 0, activity: 0, walk: 0, cold: 0, sick: 0 }, sleepMin: 0, workMin: 0 }];
    const file = deserialize(JSON.stringify(old))!;
    expect(file).not.toBeNull();
    expect(file.state.player.known).toEqual({});
    for (const st of Object.values(file.state.regions)) {
      expect(st.structures.turfHut).toBe(false);
      expect(st.structures.waterStore).toBe(false);
      expect(st.trap).toBeNull();
    }
    expect(file.state.ledger[0].yield.trap).toBe(0);
  });
});
