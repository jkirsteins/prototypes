import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { qty } from "../src/sim/inventory";
import { FOODS, ROE_SHARE } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { readShore } from "../src/sim/knowledge";
import { cellOf, placeAt } from "../src/sim/position";
import { lakeShoreNear } from "./world-facts";
import { regionState } from "../src/sim/regionstate";
import { fishItem, inSpawn, SPECIES_DEFS } from "../src/sim/species";
import { startTask, stepTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";
import { ensureGround } from "../src/sim/weather";
import { testAtmosphere } from "./weather-helpers";

afterEach(() => vi.restoreAllMocks());

describe("lean and oily fish", () => {
  it("the class is defined once and a species carries only the flag and its window", () => {
    expect(FOODS.cookedOilyFish).toEqual({ kcalPerKg: 1500, portionKg: 0.3, sickChance: 0, leanShare: 0.4 });
    expect(FOODS.roe).toEqual({ kcalPerKg: 1600, portionKg: 0.2, sickChance: 0, leanShare: 0.5 });
    expect(ROE_SHARE).toBe(0.1);
    expect(fishItem("herring")).toBe("oilyFish");
    expect(fishItem("char")).toBe("oilyFish");
    expect(fishItem("trout")).toBe("oilyFish");
    expect(fishItem("whitefish")).toBe("fish");
    expect(fishItem("perch")).toBe("fish");
    expect(SPECIES_DEFS.perch.spawn).toEqual([3, 4]);
    expect(SPECIES_DEFS.char.spawn).toEqual([8, 9]);
    expect(inSpawn("perch", 3)).toBe(true);
    expect(inSpawn("perch", 6)).toBe(false);
    expect(inSpawn("burbot", 0)).toBe(true);
  });

  it("a perch caught in April brings roe at a tenth of its weight; a char caught brings oily fish", () => {
    testAtmosphere({ temperatureC: 5 });
    const { state, world } = newGame(17);
    // Perch are a lake fish, so the cast is made from a lake shore; a landing
    // whose own shore is salt has none of them to catch.
    placeAt(state, world, lakeShoreNear(world, state.player.region).cell);
    const st = regionState(state, world, state.player.region);
    const r = regionAt(world, state.player.region);
    ensureGround(state, world, state.player.region).iceCm = 0;
    state.player.tools.push({ id: "fishingSpear", durability: 100 });
    r.capacity.perch = 100000;
    st.pop.perch = 100000;
    readShore(state, world, cellOf(state, world));
    const cal = calendar(0);
    let caught = 0;
    for (let i = 0; i < 20 && caught === 0; i++) {
      startTask(state, world, cal, "fish", "perch");
      for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(i * 100 + m), 1);
      caught = qty(state.player.pack, "fish");
    }
    expect(caught).toBeGreaterThan(0);
    expect(state.opportunities.completedAt["catch:perch"]).toBe(state.minute);
    expect(qty(state.player.pack, "roe")).toBeCloseTo(caught * ROE_SHARE, 6);
    expect(qty(state.player.pack, "oilyFish")).toBe(0);
  });
});
