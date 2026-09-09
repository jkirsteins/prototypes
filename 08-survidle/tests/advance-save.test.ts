import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { bodyRowOf, isCampRow, isBodyRow } from "../src/sim/bodyorder";
import { rootStockFor } from "../src/sim/camp";
import { newGame } from "../src/sim/newgame";
import { campSite, fillPopulations, siteFor } from "../src/sim/regionstate";
import { rootKgLeft } from "../src/sim/stocks";
import { startTask } from "../src/sim/tasks";
import { awaySeconds, catchUp, deserialize, loadGame, SAVE_KEY, saveGame, serialize } from "../src/sim/save";
import { addOrder, conditionOpen, orderMet, orderSentence } from "../src/sim/orders";
import { AWAY_HOURS_MAX } from "../src/units";
import { isWorkOrder, type GameState } from "../src/sim/types";
import { regionAt, speciesHere } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

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

  it("kills an idle character who runs out, and names the cause", () => {
    const { state, world } = newGame(8);
    siteCamp(state, world);
    advance(state, world, 1440 * 12);
    expect(state.dead).not.toBeNull();
    // Never drinks either: away from any shore or vessel, thirst can win the race.
    expect(["starved", "froze", "thirst"]).toContain(state.dead!.cause);
    expect(state.task).toBeNull();
  });

  it("falls asleep on its own when idle and spent: the body's own row puts it down", () => {
    const { state, world } = newGame(8);
    siteCamp(state, world);
    state.player.energy = 9;
    advance(state, world, 5);
    expect(state.task?.id).toBe("sleep");
    expect(state.player.bodyNeed).toBe("sleep");
    expect(state.intent?.orderId).toBe(bodyRowOf(state, world)!.id);
  });

  it("survives the first day with the starting kit", () => {
    const { state, world } = newGame(8);
    siteCamp(state, world);
    advance(state, world, 1440);
    expect(state.dead).toBeNull();
    expect(state.player.health).toBeGreaterThan(50);
  });
});

describe("save", () => {
  it("round-trips the whole state", () => {
    const { state, world } = newGame(9);
    siteCamp(state, world);
    advance(state, world, 500);
    const file = deserialize(serialize(state, 1234));
    expect(file).not.toBeNull();
    expect(file!.savedAt).toBe(1234);
    const expected = JSON.parse(JSON.stringify(state));
    delete (expected as unknown as Record<string, unknown>).plan;
    expect(file!.state).toEqual(expected);
  });

  it("a new game starts with the new body fields, and an old save gets them filled", () => {
    const { state, world } = newGame(8);
    siteCamp(state, world);
    expect(state.player.water).toBe(2.5);
    expect(state.player.frostbite).toEqual({ feet: 0, hands: 0 });
    expect(state.weather.iceCm).toBe(0);
    expect(state.weather.storm).toBeNull();
    const st = state.regions[state.player.region];
    expect(st.fire).toEqual({ lit: false, fuelKg: 0, wetKg: 0, indoors: false, unattended: 0, embers: 0, litSince: null, rainHeld: 0 });
    expect(st.smoke).toBe(0);
    expect(campSite(st)?.structures.hearth ?? false).toBe(false);
    state.player.tools.push({ id: "barkBucket", durability: 100 });
    // A rack standing and a trap set, both carried whole through the round trip.
    const site = siteFor(st, st.campCell!);
    site.structures.dryingRack = true;
    site.racks = 1;
    st.trap = { cell: st.campCell!, kg: 0, oilyKg: 0, fish: [], age: 0 };
    const raw = JSON.parse(serialize(state));
    delete raw.state.player.water;
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
    delete raw.state.regions[state.player.region].fire.embers;
    delete raw.state.regions[state.player.region].fire.litSince;
    delete raw.state.regions[state.player.region].fire.rainHeld;
    delete raw.state.regions[state.player.region].smoke;
    delete raw.state.regions[state.player.region].logsWet;
    delete raw.state.regions[state.player.region].trap.age;
    const back = deserialize(JSON.stringify(raw))!.state;
    expect(back.player.water).toBe(2.5);
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
    expect(back.regions[state.player.region].fire.embers).toBe(0);
    expect(back.regions[state.player.region].fire.litSince).toBeNull();
    expect(back.regions[state.player.region].fire.rainHeld).toBe(0);
    expect(back.regions[state.player.region].smoke).toBe(0);
    expect(campSite(back.regions[state.player.region])?.structures.hearth ?? false).toBe(false);
    expect(back.regions[state.player.region].logsWet).toBe(1440);
    expect(campSite(back.regions[state.player.region])?.racks).toBe(1);
    expect(back.regions[state.player.region].trap!.age).toBe(0);
  });

  it("a save mid-walk from before the route remembered its walked cells loads with none", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    startTask(state, world, calendar(0), "walk", "spot:forest");
    const raw = JSON.parse(serialize(state));
    expect(raw.state.route.walked.length).toBe(1);
    delete raw.state.route.walked;
    const back = deserialize(JSON.stringify(raw))!.state;
    expect(back.route!.walked).toEqual([]);
    expect(back.route!.path).toEqual(state.route!.path);
  });

  it("a save from before a skill existed loads with it at nothing, and walks on", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const raw = JSON.parse(serialize(state));
    // The record is there and one key is missing, which is what a skill added
    // after a run started looks like. The whole-record default cannot see it,
    // and the first sight check of the catch-up reads the missing level.
    delete raw.state.skills.wayfinding;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.state.skills.wayfinding).toEqual({ xp: 0, mastery: {}, pool: 0 });
    expect(() => catchUp(back.state, world, 60)).not.toThrow();
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
      siteCamp(state, world);
      state.task = { ...task };
      expect(() => advance(state, world, 2)).not.toThrow();
      expect(state.task).toBeNull();
      expect(state.stats.animals).toBe(0);
    }
  });

  it("a save from the five-animal world loads with its roster filled and its dead keys gone", () => {
    const { state, world } = newGame(5);
    siteCamp(state, world);
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
    // The list carried neither care row, so the load migrates both on at the top.
    expect(isCampRow(orders[0])).toBe(true);
    expect(isBodyRow(orders[1])).toBe(true);
    expect(isWorkOrder(orders[2]) && orders[2].req.arg).toBe("any");
    expect(isWorkOrder(orders[3]) && orders[3].req.arg).toBe("willowGrouse");
  });

  it("a genuine version 3 save predating ice holes and water piles loads clean", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
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

  it("an order from before the order ladder carries no when, held, givenDoy, dayOpened or dayBase, and reads exactly as it did", () => {
    const { state, world } = newGame(9);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "roots", until: { kind: "campHas", qty: 5 }, deliver: "camp", where: "nearest" }, "keep");
    const id = state.player.region;
    const cal = calendar(state.minute, state.startDoy);
    const sentenceBefore = orderSentence(state, world, cal, o);
    const raw = JSON.parse(serialize(state)) as { state: { regions: Record<string, { orders: Record<string, unknown>[] }> } };
    // Index 2: the two care rows sit at 0 and 1, and the keep was given after them.
    const rawOrder = raw.state.regions[id].orders[2];
    delete (rawOrder.req as Record<string, unknown>).when;
    delete rawOrder.held;
    delete rawOrder.givenDoy;
    delete rawOrder.dayOpened;
    delete rawOrder.dayBase;
    const file = deserialize(JSON.stringify(raw))!;
    const back = file.state.regions[id].orders[2];
    if (!isWorkOrder(back)) throw new Error("the migrated row is not work");
    expect(() => orderMet(file.state, world, cal, back, false)).not.toThrow();
    expect(() => conditionOpen(file.state, world, cal, back)).not.toThrow();
    expect(orderSentence(file.state, world, cal, back)).toBe(sentenceBefore);
  });

  it("rejects garbage", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize("{}")).toBeNull();
  });

  it("catches up on time away, capped at a day, and reports what happened", () => {
    const { state, world } = newGame(9);
    siteCamp(state, world);
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

  it("reports what a daily order did across the days away, not only today's count", () => {
    const { state, world } = newGame(9);
    siteCamp(state, world);
    state.awayHours = AWAY_HOURS_MAX;
    const o = addOrder(state, world, { task: "sticks", until: { kind: "daily", n: 1 }, deliver: "camp", where: "nearest" }, "job");
    // Three days: the day roll opens the count twice over, so an order whose done
    // were zeroed each morning would report at most the last morning's work.
    const away = catchUp(state, world, 3 * 1440);
    const line = away.orders.find((x) => x.task === "sticks")!;
    expect(o.done).toBeGreaterThanOrEqual(2);
    expect(line.done).toBe(o.done);
    expect(line.minutes).toBeGreaterThan(0);
    expect(line.gone).toBe(false);
    // The daily count in the sentence, not the run's whole tally.
    expect(line.label).toContain("1 a day");
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

  it("round-trips carcasses, hunting pressure, and personal signs", () => {
    const { state } = newGame(8);
    state.carcasses.push({ id: 3, species: "deer", cell: 12, killedAt: 40, warmAge: 5, yields: { meatKg: 9, hideKg: 2 } });
    state.nextCarcassId = 4;
    state.huntPressure[12] = 0.45;
    state.player.huntSigns[12] = { species: { deer: 40 } };
    const back = deserialize(serialize(state))!.state;
    expect(back.carcasses).toEqual(state.carcasses);
    expect(back.nextCarcassId).toBe(4);
    expect(back.huntPressure).toEqual({ 12: 0.45 });
    expect(back.player.huntSigns).toEqual({ 12: { species: { deer: 40 } } });
  });

  it("initializes hunting recovery state in older saves", () => {
    const { state } = newGame(8);
    const old = JSON.parse(serialize(state));
    delete old.state.carcasses;
    delete old.state.nextCarcassId;
    delete old.state.huntPressure;
    delete old.state.player.huntSigns;
    const back = deserialize(JSON.stringify(old))!.state;
    expect(back.carcasses).toEqual([]);
    expect(back.nextCarcassId).toBe(1);
    expect(back.huntPressure).toEqual({});
    expect(back.player.huntSigns).toEqual({});
  });

  it("writes version 6 and reads 4 by wrapping the survivor as the first of the world", () => {
    const { state } = newGame(8);
    expect(JSON.parse(serialize(state)).version).toBe(8);
    const v4 = JSON.parse(serialize(state)) as { version: number; savedAt: number; state: Record<string, unknown> };
    v4.version = 4;
    delete v4.state.survivors;
    delete v4.state.year;
    delete v4.state.landing;
    delete v4.state.spine;
    const file = deserialize(JSON.stringify(v4))!;
    expect(file.state.year).toBe(1);
    expect(file.state.landing).toBeNull();
    expect(file.state.survivors).toHaveLength(1);
    expect(file.state.survivors[0].index).toBe(1);
    expect(file.state.survivors[0].name.first.length).toBeGreaterThan(0);
    expect(file.state.survivors[0].landed).toEqual({ year: 1, doy: file.state.startDoy });
    expect(file.state.spine).toEqual({ fired: {}, announced: {} });
    for (const st of Object.values(file.state.regions)) expect(campSite(st)?.structureAge ?? {}).toEqual({});
  });
});

describe("the version 6 save", () => {
  it("writes version 6 and fills the producers' fields into an older save", () => {
    const { state } = newGame(8);
    const text = serialize(state);
    expect(JSON.parse(text).version).toBe(8);
    const old = JSON.parse(text);
    old.version = 5;
    delete old.state.player.known;
    for (const st of Object.values(old.state.regions) as Record<string, unknown>[]) {
      delete st.sites;
      delete st.snares;
      // The old flat shape, from before turfHut and waterStore joined the other structure flags.
      st.structures = { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0, boughBed: false, hearth: false, snowShelter: false };
      st.racks = 0;
      st.boughBedAge = 0;
      st.meltDays = 0;
      st.structureAge = {};
      st.build = {};
      delete st.trap;
    }
    old.state.ledger = [{ day: 1, yield: { fish: 0, snare: 0, hunt: 0, berries: 0, kit: 0 }, eaten: 0, burn: { base: 0, activity: 0, walk: 0, cold: 0, sick: 0 }, sleepMin: 0, workMin: 0 }];
    const file = deserialize(JSON.stringify(old))!;
    expect(file).not.toBeNull();
    expect(file.state.player.known).toEqual({});
    for (const st of Object.values(file.state.regions)) {
      expect(campSite(st)?.structures.turfHut ?? false).toBe(false);
      expect(campSite(st)?.structures.waterStore ?? false).toBe(false);
      expect(st.trap).toBeNull();
    }
    expect(file.state.ledger[0].yield.trap).toBe(0);
  });

  it("a save carrying a region's roots as one number loads with every cell at full, and one from before the seasonal stocks gets its nests", () => {
    // A region's kilos say nothing about which cells they were dug from, so the number is dropped
    // and the ground reads full: what one survivor took out of nine hectares is inside the season's
    // regrowth anyway. The nests have no such ground to fall back on, so migrate marks them
    // unset with -1 and fillPopulations - which walks the same regions with the world in hand -
    // seeds them; without it every region read "the nests are empty" on a game that did nothing wrong.
    const { state, world } = newGame(17, 160);
    siteCamp(state, world);
    const id = state.player.region;
    const raw = JSON.parse(serialize(state)) as { version: number; state: GameState };
    raw.version = 6;
    for (const st of Object.values(raw.state.regions)) {
      delete (st as { rootCells?: Record<number, number> }).rootCells;
      (st as { roots?: number }).roots = 12;
      delete (st as { nests?: number }).nests;
    }
    const file = deserialize(JSON.stringify(raw))!;
    const st = file.state.regions[id]!;
    expect(st.rootCells).toEqual({});
    expect((st as { roots?: number }).roots).toBeUndefined();
    expect(rootKgLeft(st, world, id)).toBeCloseTo(rootStockFor(world, id), 6);
    expect(st.nests).toBe(-1);
    fillPopulations(file.state, world);
    expect(st.nests).toBeGreaterThan(0);
    // A heath really gathered out reads no clutches and is left alone.
    st.nests = 0;
    fillPopulations(file.state, world);
    expect(st.nests).toBe(0);
  });
});
