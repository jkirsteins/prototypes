import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { qty } from "../src/sim/inventory";
import { today } from "../src/sim/ledger";
import { AUTO_EAT_ORDER, BERRY_PICK_KG, BERRY_WINTER_SHARE, FOODS, GUT, KCAL_FULL, SAP_FROM_DOY, SAP_KCAL, SAP_TAPS_PER_DAY, SEAWEED_KG_PER_HOUR } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { WATER_FULL } from "../src/sim/water";
import { cellAt, cellIdx, terrainOf, WORLD_H, WORLD_W, type World } from "../src/world/gen";
import { ensureGround } from "../src/sim/weather";
import { testAtmosphere } from "./weather-helpers";
import { watersideNear } from "./world-facts";

afterEach(() => vi.restoreAllMocks());

/**
 * No reference seed's home region has a birch cell (the brief's own
 * region-scoped lookup finds none for 17, 19, 42 or 79), so the sap test
 * scans the terrain grid directly, the way the seaweed test hand-finds a
 * coastline. Throws rather than skipping quietly: a birch-less world would
 * mean the test asserts nothing, which is the defect this replaces.
 */
function findBirchCell(world: World): number {
  for (let y = 0; y < WORLD_H; y += 3) {
    for (let x = 0; x < WORLD_W; x += 3) {
      if (terrainOf(world, x, y) === "birch") return cellIdx(world, x, y);
    }
  }
  throw new Error("no birch cell found anywhere in the world");
}

describe("sap, seaweed and winter berries", () => {
  it("the auto-eat order is the spec's, fat last", () => {
    expect(AUTO_EAT_ORDER).toEqual(["berries", "seaweed", "cookedRoots", "barkFlour", "eggs", "roe", "cookedFish", "cookedOilyFish", "cookedMeat", "driedMeat", "fat"]);
  });

  it("a birch tapped in the sap rise fills the body with water and 125 kcal, three taps a day", () => {
    const { state, world } = newGame(17, SAP_FROM_DOY);
    const birch = findBirchCell(world);
    placeAt(state, world, birch);
    state.player.tools.push({ id: "knife", durability: 100 });
    state.player.water = 1;
    // Half the pool, so the sap's kilocalories have room to land: at the cap
    // they would be clamped away and the reading below would be of nothing.
    const kcal0 = KCAL_FULL / 2;
    state.player.kcal = kcal0;
    const cal = calendar(0, SAP_FROM_DOY);
    expect(check(state, world, cal, "tapSap").duration).toBe(30);
    for (let t = 0; t < SAP_TAPS_PER_DAY; t++) {
      startTask(state, world, cal, "tapSap");
      for (let m = 0; m < 30 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    }
    expect(state.player.water).toBeCloseTo(WATER_FULL, 6);
    expect(state.player.kcal).toBeGreaterThanOrEqual(kcal0 + SAP_KCAL * SAP_TAPS_PER_DAY - 200);
    expect(check(state, world, cal, "tapSap").why).toBe("the birches have given today's sap");
    expect(check(state, world, calendar(0, 200), "tapSap").why).toBe("the sap has stopped");
  });

  it("seaweed is two kilos an hour on the sea shore and capped at two a day", () => {
    expect(FOODS.seaweed).toEqual({ kcalPerKg: 200, portionKg: 0.3, sickChance: 0, leanShare: 0 });
    expect(GUT.seaweed).toEqual({ fullCreditKg: 2, refuseKg: 2 });
    expect(SEAWEED_KG_PER_HOUR).toBe(2);
  });

  // Seaweed is the sea's and no lake's, so the check runs on the nearest land
  // cell beside a "sea"-kind water cell, stood on directly with placeAt rather
  // than reached by walking.
  it("seaweed loads at the sea shore while it is open, and is turned back once it ices", () => {
    testAtmosphere({ temperatureC: 5 });
    const { state, world } = newGame(17, 90);
    const idx = watersideNear(world, cellOf(state, world), "sea");
    expect(cellAt(world, idx).terrain).not.toBe("water");
    placeAt(state, world, idx);
    const cal = calendar(0, 90);
    ensureGround(state, world, state.player.region).iceCm = 0;
    const open = check(state, world, cal, "seaweed");
    expect(open.ok).toBe(true);
    expect(open.duration).toBe(60);
    startTask(state, world, cal, "seaweed");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "seaweed")).toBeCloseTo(SEAWEED_KG_PER_HOUR, 6);
    expect(today(state).yield.seaweed).toBeCloseTo(SEAWEED_KG_PER_HOUR * FOODS.seaweed.kcalPerKg, 6);
    ensureGround(state, world, state.player.region).iceCm = 2;
    expect(check(state, world, cal, "seaweed").why).toBe("the shore is iced over");
  });

  it("berries under the snow pick at a fifth from November to April where the snow is shallow", () => {
    testAtmosphere({ temperatureC: -5 });
    expect(BERRY_WINTER_SHARE).toBe(0.2);
    const { state, world } = newGame(17, 320);
    placeAtSpot(state, world, state.player.region, "heath");
    ensureGround(state, world, state.player.region).snowCm = 10;
    const cal = calendar(0, 320);
    const o = check(state, world, cal, "berries");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Pick frozen lingon under the snow");
    startTask(state, world, cal, "berries");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(BERRY_PICK_KG * BERRY_WINTER_SHARE, 6);
    ensureGround(state, world, state.player.region).snowCm = 40;
    expect(check(state, world, cal, "berries").why).toBe("under too much snow");
  });
});
