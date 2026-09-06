import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { eat } from "../src/sim/actions";
import { calendar, dayNumber, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { addItem, qty, weight } from "../src/sim/inventory";
import { FOODS } from "../src/sim/items";
import { creditBurn, creditEaten, creditTime, creditYield, type DayLedger, emptyBurn, emptyYield, today, weekBefore, YIELD_SOURCES } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { BASE_KCAL_PER_HOUR, coldBurnFactor, feltTemperature, stepPlayer, WALK_KCAL_PER_HOUR } from "../src/sim/player";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { kitOut } from "../src/sim/reference";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask } from "../src/sim/tasks";
import { cellAt } from "../src/world/gen";

describe("the day number", () => {
  it("is 1 at the start, 2 from midnight of the first night", () => {
    expect(dayNumber(0)).toBe(1);
    expect(dayNumber(24 * 60 - START_MINUTE_OF_DAY - 1)).toBe(1);
    expect(dayNumber(24 * 60 - START_MINUTE_OF_DAY)).toBe(2);
    expect(dayNumber(25 * 1440)).toBe(26);
  });
});

describe("the ledger", () => {
  it("starts with one record for day 1 and pushes a fresh one when the day changes", () => {
    const { state } = newGame(1);
    expect(state.ledger.length).toBe(1);
    expect(state.ledger[0].day).toBe(1);
    expect(today(state)).toBe(state.ledger[0]);
    state.minute = 24 * 60 - START_MINUTE_OF_DAY;
    const d2 = today(state);
    expect(d2.day).toBe(2);
    expect(state.ledger.length).toBe(2);
    expect(today(state)).toBe(d2);
  });

  it("credits yield, intake, burn and time onto today's record", () => {
    const { state } = newGame(1);
    const kit = today(state).yield.kit;
    creditYield(state, "fish", 300);
    creditYield(state, "fish", 200);
    creditEaten(state, 525);
    creditBurn(state, { base: 70, activity: 30, walk: 0, cold: 10, sick: 0 });
    creditBurn(state, { base: 70, activity: 0, walk: 230, cold: 0, sick: 5 });
    creditTime(state, "sleep", 60);
    creditTime(state, "work", 90);
    creditTime(state, "idle", 30);
    const d = today(state);
    expect(d.yield).toEqual({ ...emptyYield(), fish: 500, kit });
    expect(d.eaten).toBe(525);
    expect(d.burn).toEqual({ base: 140, activity: 30, walk: 230, cold: 10, sick: 5 });
    expect(d.sleepMin).toBe(60);
    expect(d.workMin).toBe(90);
  });

  it("averages the seven records before a day, and reports how many it found", () => {
    const ledger: DayLedger[] = [];
    for (let day = 1; day <= 10; day++) {
      ledger.push({ day, yield: { ...emptyYield(), fish: day * 100 }, eaten: 50, burn: { ...emptyBurn(), base: 1680, cold: day }, sleepMin: 480, workMin: 600 });
    }
    const w = weekBefore(ledger, 9);
    expect(w.days).toBe(7);
    // Days 2 to 8: fish 200..800 averages 500; cold 2..8 averages 5.
    expect(w.yield.fish).toBeCloseTo(500, 6);
    expect(w.burn.cold).toBeCloseTo(5, 6);
    expect(w.burn.base).toBe(1680);
    expect(w.eaten).toBe(50);
    expect(w.sleepMin).toBe(480);
    expect(w.workMin).toBe(600);
    const early = weekBefore(ledger, 3);
    expect(early.days).toBe(2);
    expect(early.yield.fish).toBeCloseTo(150, 6);
    const none = weekBefore(ledger, 1);
    expect(none.days).toBe(0);
    expect(none.yield.fish).toBe(0);
    expect(none.burn.base).toBe(0);
  });

  it("lists the five sources once each", () => {
    expect(YIELD_SOURCES).toEqual(["fish", "trap", "snare", "hunt", "berries", "kit"]);
  });

  it("a save from before the ledger loads with an empty ledger", () => {
    const { state } = newGame(1);
    const text = serialize(state);
    const raw = JSON.parse(text);
    delete raw.state.ledger;
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.ledger).toEqual([]);
  });

  it("a save from before berries were perishable loads them as a stack, weighed once", () => {
    const { state } = newGame(1);
    const bare = weight(state.player.pack);
    const raw = JSON.parse(serialize(state));
    raw.state.player.pack.items.berries = 1.5;
    delete raw.state.player.pack.stacks.berries;
    const pack = deserialize(JSON.stringify(raw))!.state.player.pack;
    expect(qty(pack, "berries")).toBe(1.5);
    expect(pack.stacks.berries).toEqual([{ kg: 1.5, age: 0 }]);
    expect(pack.items.berries).toBeUndefined();
    expect(weight(pack)).toBeCloseTo(bare + 1.5, 9);
  });
});

/** The nearest open-forest cell to the player, for a walk with a known terrain divisor. */
function forestCell(g: ReturnType<typeof newGame>): number {
  const { state, world } = g;
  const here = cellOf(state, world);
  const hx = here % world.w;
  const hy = Math.floor(here / world.w);
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = hx + dx;
        const y = hy + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const t = cellAt(world, y * world.w + x).terrain;
        if (t === "spruce" || t === "pine" || t === "birch") return y * world.w + x;
      }
    }
  }
  throw new Error("no forest near the start");
}

describe("burn in buckets", () => {
  it("an hour asleep in the warm is base and nothing else", () => {
    const { state, world } = newGame(1);
    state.task = { id: "sleep", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(BASE_KCAL_PER_HOUR, 6);
    expect(b.activity).toBeCloseTo(0, 6);
    expect(b.walk).toBe(0);
    expect(b.cold).toBe(0);
    expect(b.sick).toBe(0);
    expect(today(state).sleepMin).toBe(60);
    expect(today(state).workMin).toBe(0);
  });

  it("an hour of heavy work at minus thirty is base, the rate above base, and the cold share of both", () => {
    const { state, world } = newGame(1);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const k0 = state.player.kcal;
    // Sixty one-minute steps, the way advance() actually calls stepPlayer
    // (its own dt is at most one minute). Clothing wears while worn outdoors,
    // so the felt cold nudges down across the hour; the expected cold bucket
    // is accumulated minute by minute at the felt each step actually used,
    // not read back once from the state the loop leaves behind.
    let expectedCold = 0;
    for (let m = 0; m < 60; m++) {
      const felt = feltTemperature(state, world, -30);
      expectedCold += (500 * (coldBurnFactor(felt) - 1)) / 60;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), -30, 1);
    }
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(70, 6);
    // Heavy work at 500 kcal/h: the MET tables' 6 to 7 MET at 72 kg for axe work.
    expect(b.activity).toBeCloseTo(430, 6);
    expect(b.walk).toBe(0);
    // The cold burn grows with the felt cold rather than sitting at a flat factor; -30 ambient is well below zero here.
    expect(b.cold).toBeCloseTo(expectedCold, 6);
    expect(b.sick).toBe(0);
    expect(b.base + b.activity + b.cold).toBeCloseTo(k0 - state.player.kcal, 6);
    expect(today(state).workMin).toBe(60);
  });

  it("a walk puts everything above base in the walk bucket, and deep snow doubles it", () => {
    const g = newGame(17);
    const { state, world } = g;
    placeAt(state, world, forestCell(g));
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    const dry = today(state).burn.walk;
    expect(dry).toBeCloseTo(WALK_KCAL_PER_HOUR - BASE_KCAL_PER_HOUR, 6);
    expect(today(state).burn.activity).toBe(0);
    state.weather.snowCm = 40;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(today(state).burn.walk - dry).toBeCloseTo(2 * WALK_KCAL_PER_HOUR - BASE_KCAL_PER_HOUR, 6);
  });

  it("sickness adds its own bucket on top of the cold one", () => {
    const { state, world } = newGame(1);
    state.player.sick = 600;
    state.task = null;
    // Sixty one-minute steps, for the same reason as the heavy-work case
    // above: the felt cold drifts across the hour as outdoor clothing wears,
    // so the expected cold and sick buckets are accumulated minute by minute
    // at the felt each step actually used.
    let expectedCold = 0;
    let expectedSick = 0;
    for (let m = 0; m < 60; m++) {
      const felt = feltTemperature(state, world, -30);
      const factor = coldBurnFactor(felt);
      expectedCold += (100 * (factor - 1)) / 60;
      expectedSick += (100 * factor * 0.2) / 60;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), -30, 1);
    }
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(70, 6);
    expect(b.activity).toBeCloseTo(30, 6);
    // The cold burn grows with the felt cold rather than sitting at a flat factor.
    expect(b.cold).toBeCloseTo(expectedCold, 6);
    expect(b.sick).toBeCloseTo(expectedSick, 6);
  });

  it("over two hours of the real loop the buckets sum to what the stomach and the fat lost", () => {
    const { state, world } = newGame(17);
    const k0 = state.player.kcal + state.player.fat;
    advance(state, world, 120);
    const d = today(state);
    const burned = d.burn.base + d.burn.activity + d.burn.walk + d.burn.cold + d.burn.sick;
    expect(burned).toBeCloseTo(k0 - (state.player.kcal + state.player.fat) + d.eaten, 3);
  });

  it("an idle hour is neither sleep nor work", () => {
    const { state, world } = newGame(1);
    state.task = null;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(today(state).sleepMin).toBe(0);
    expect(today(state).workMin).toBe(0);
    state.task = { id: "wait", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(today(state).workMin).toBe(0);
  });
});

describe("yield and intake", () => {
  it("the arrival kit is a kilo of dried meat, credited on day 1; the kitted camp adds five more", () => {
    const { state, world } = newGame(1);
    expect(state.ledger[0].yield.kit).toBe(FOODS.driedMeat.kcalPerKg);
    kitOut(state, world);
    expect(state.ledger[0].yield.kit).toBe(6 * FOODS.driedMeat.kcalPerKg);
  });

  it("eating credits the kcal the stomach and the fat received", () => {
    const { state, world } = newGame(1);
    addItem(state.player.pack, "driedMeat", 1);
    eat(state, world, "driedMeat", new Rng(1));
    expect(today(state).eaten).toBeCloseTo(0.15 * FOODS.driedMeat.kcalPerKg, 6);
  });

  it("a berry pick credits the kilos picked at the berry's kcal", () => {
    const { state, world } = newGame(3);
    // 120 days on from 1 April is the end of July, in season.
    state.minute = 120 * 1440;
    const cal = calendar(state.minute);
    placeAtSpot(state, world, state.player.region, "heath");
    expect(beginTask(state, world, cal, "berries")).toBe(true);
    const before = qty(state.player.pack, "berries");
    advance(state, world, 61);
    const picked = qty(state.player.pack, "berries") - before;
    expect(picked).toBeGreaterThan(0);
    expect(today(state).yield.berries).toBeCloseTo(picked * FOODS.berries.kcalPerKg, 6);
  });
});
