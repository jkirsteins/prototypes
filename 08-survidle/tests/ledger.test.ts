import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { eat } from "../src/sim/actions";
import { calendar, dayNumber, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { addItem, pile, qty, weight } from "../src/sim/inventory";
import { FOODS } from "../src/sim/items";
import { creditBurn, creditEaten, creditTime, creditYield, type DayLedger, emptyBurn, emptyYield, today, weekBefore, YIELD_SOURCES } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { fatLandmarks, massFactor, medianPerson } from "../src/sim/person";
import { BASE_KCAL_PER_HOUR, coldBurnFactor, feltTemperature, stepPlayer, WALK_KCAL_PER_HOUR } from "../src/sim/player";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { kitOut } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { readSave, serialize } from "../src/sim/save";
import { beginTask } from "../src/sim/tasks";
import { cellAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";
import { ensureGround } from "../src/sim/weather";

beforeEach(() => testAtmosphere());

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
    creditEaten(state, 525, 400);
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
      ledger.push({ day, yield: { ...emptyYield(), fish: day * 100 }, eaten: 50, leanKcal: 0, nonLeanKcal: 50, leanAtCamp: false, burn: { ...emptyBurn(), base: 1680, cold: day }, sleepMin: 480, workMin: 600 });
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

  it("lists each source once, in order", () => {
    expect(YIELD_SOURCES).toEqual(["fish", "trap", "snare", "hunt", "berries", "kit", "marrow", "roe", "eggs", "bark", "roots", "sap", "seaweed"]);
  });

  it("a save from before the ledger loads with an empty ledger", () => {
    const { state } = newGame(1);
    const text = serialize(state);
    const raw = JSON.parse(text);
    delete raw.state.ledger;
    const file = readSave(JSON.stringify(raw))!;
    expect(file.state.ledger).toEqual([]);
  });

  it("a save from before berries were perishable loads them as a stack, weighed once", () => {
    const { state } = newGame(1);
    const bare = weight(state.player.pack);
    const raw = JSON.parse(serialize(state));
    raw.state.player.pack.items.berries = 1.5;
    delete raw.state.player.pack.stacks.berries;
    const pack = readSave(JSON.stringify(raw))!.state.player.pack;
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
    siteCamp(state, world);
    state.task = { id: "sleep", progress: 0, duration: 60, repeat: false };
    // A fresh survivor lands at exactly the typical reserve, so the first
    // minute's base burn reads exactly BASE_KCAL_PER_HOUR/60 - but the
    // reserve massFactor reads is what that very burn is spending, minute by
    // minute, so the hour is accumulated at the live reserve each step
    // actually sees rather than asserted as a flat BASE_KCAL_PER_HOUR.
    let expectedBase = 0;
    for (let m = 0; m < 60; m++) {
      expectedBase += (BASE_KCAL_PER_HOUR * massFactor(state)) / 60;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    }
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(expectedBase, 6);
    expect(b.activity).toBeCloseTo(0, 6);
    expect(b.walk).toBe(0);
    expect(b.cold).toBe(0);
    expect(b.sick).toBe(0);
    expect(today(state).sleepMin).toBe(60);
    expect(today(state).workMin).toBe(0);
  });

  it("an hour of heavy work at minus thirty is base, the rate above base, and the cold share of both", () => {
    const { state, world } = newGame(1);
    siteCamp(state, world);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const k0 = state.player.kcal;
    // Sixty one-minute steps, the way advance() actually calls stepPlayer
    // (its own dt is at most one minute). Clothing wears while worn outdoors
    // and the reserve massFactor reads is spent minute by minute, so both
    // the felt cold and the base burn it scales nudge down across the hour;
    // the expected base and cold buckets are accumulated minute by minute at
    // the live reserve and felt each step actually used, not read back once
    // from the state the loop leaves behind. The 430 above base is a fixed
    // rate off the person's build, not the reserve, so it alone stays flat.
    let expectedBase = 0;
    let expectedCold = 0;
    for (let m = 0; m < 60; m++) {
      const base = BASE_KCAL_PER_HOUR * massFactor(state);
      const heavyBurn = base + 430;
      const felt = feltTemperature(state, world, -30);
      expectedBase += base / 60;
      expectedCold += (heavyBurn * (coldBurnFactor(felt) - 1)) / 60;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), -30, 1);
    }
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(expectedBase, 6);
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
    // Pinned at the reference build's typical reserve, so the only mass
    // drift through the hour is the fat this walk itself burns, not a
    // confound from this survivor's own build. That drift is real - an
    // hour of walking spends some of the reserve it is scaled against - so
    // the expected bucket is accumulated minute by minute at the live
    // massFactor, the same reserve stepPlayer reads each step.
    const g = newGame(17, undefined, medianPerson("m"));
    siteCamp(g.state, g.world);
    const { state, world } = g;
    state.player.fat = fatLandmarks(medianPerson("m")).typical;
    placeAt(state, world, forestCell(g));
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    let expectedDry = 0;
    for (let m = 0; m < 60; m++) {
      expectedDry += (WALK_KCAL_PER_HOUR * massFactor(state) - BASE_KCAL_PER_HOUR) / 60;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    }
    const dry = today(state).burn.walk;
    expect(dry).toBeCloseTo(expectedDry, 6);
    expect(today(state).burn.activity).toBe(0);
    ensureGround(state, world, state.player.region).snowCm = 40;
    let expectedWet = 0;
    for (let m = 0; m < 60; m++) {
      expectedWet += (2 * WALK_KCAL_PER_HOUR * massFactor(state) - BASE_KCAL_PER_HOUR) / 60;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    }
    expect(today(state).burn.walk - dry).toBeCloseTo(expectedWet, 6);
  });

  it("sickness adds its own bucket on top of the cold one", () => {
    const { state, world } = newGame(1);
    siteCamp(state, world);
    state.player.sick = 600;
    state.task = null;
    // Sixty one-minute steps, for the same reason as the heavy-work case
    // above: the felt cold drifts across the hour as outdoor clothing wears,
    // and the reserve massFactor reads is spent minute by minute, so the
    // expected base, cold and sick buckets are all accumulated minute by
    // minute at the live reserve and felt each step actually used. The 30
    // above base is a fixed rate off the person's build, so it stays flat.
    let expectedBase = 0;
    let expectedCold = 0;
    let expectedSick = 0;
    for (let m = 0; m < 60; m++) {
      const base = BASE_KCAL_PER_HOUR * massFactor(state);
      const restBurn = base + 30;
      const felt = feltTemperature(state, world, -30);
      const factor = coldBurnFactor(felt);
      expectedBase += base / 60;
      expectedCold += (restBurn * (factor - 1)) / 60;
      expectedSick += (restBurn * factor * 0.2) / 60;
      stepPlayer(state, world, calendar(state.minute, state.startDoy), -30, 1);
    }
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(expectedBase, 6);
    expect(b.activity).toBeCloseTo(30, 6);
    // The cold burn grows with the felt cold rather than sitting at a flat factor.
    expect(b.cold).toBeCloseTo(expectedCold, 6);
    expect(b.sick).toBeCloseTo(expectedSick, 6);
  });

  it("over two hours of the real loop the buckets sum to what the fat reserve lost, net of what was eaten", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const fat0 = state.player.fat;
    advance(state, world, 120);
    const d = today(state);
    const burned = d.burn.base + d.burn.activity + d.burn.walk + d.burn.cold + d.burn.sick;
    // The stomach's fullness is a separate, clamped book now; fat is the one
    // that answers to the ledger with no clamp in the way, falling by every
    // burned kcal and rising by every eaten one, so it is what the buckets
    // and the day's eaten total have to reconcile against exactly.
    expect(burned).toBeCloseTo(fat0 - state.player.fat + d.eaten, 3);
  });

  it("an idle hour is neither sleep nor work", () => {
    const { state, world } = newGame(1);
    siteCamp(state, world);
    state.task = null;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(today(state).sleepMin).toBe(0);
    expect(today(state).workMin).toBe(0);
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(today(state).workMin).toBe(0);
  });
});

describe("yield and intake", () => {
  it("the arrival kit is a kilo of dried meat, credited on day 1; the kitted camp adds five more", () => {
    const { state, world } = newGame(1);
    siteCamp(state, world);
    expect(state.ledger[0].yield.kit).toBe(FOODS.driedMeat.kcalPerKg);
    kitOut(state, world);
    expect(state.ledger[0].yield.kit).toBe(6 * FOODS.driedMeat.kcalPerKg);
  });

  it("eating credits the kcal the stomach and the fat received", () => {
    const { state, world } = newGame(1);
    siteCamp(state, world);
    addItem(state.player.pack, "driedMeat", 1);
    eat(state, world, "driedMeat", new Rng(1));
    expect(today(state).eaten).toBeCloseTo(0.15 * FOODS.driedMeat.kcalPerKg, 6);
  });

  it("a berry pick credits the kilos picked at the berry's kcal", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
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

  it("a day whose lean intake hit the ceiling with lean food at camp and nothing else eaten is a lean-wall day", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "cookedMeat", 10);
    state.player.kcal = 100;
    const rng = new Rng(1);
    let n = 0;
    while (n++ < 40 && eat(state, world, "cookedMeat", rng)) {}
    advance(state, world, 1440);
    const w = weekBefore(state.ledger, 2);
    expect(w.leanWallDays).toBe(1);
  });
});
