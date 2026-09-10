import { afterEach, describe, expect, it, vi } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { fireSiteMinutes } from "../src/sim/fire";
import { addItem, pile, qty, removeItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { campSite, regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";
import { ensureGround } from "../src/sim/weather";
import { cellAt, type World } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

const cal = calendar(0);
afterEach(() => vi.restoreAllMocks());

/** Nothing anywhere in the region that could stand in for a stone. */
function stripStone(state: ReturnType<typeof newGame>["state"], world: World): void {
  const st = regionState(state, world, state.player.region);
  removeItem(state.player.pack, "stone", 999);
  removeItem(pile(state, st.campCell!), "stone", 999);
}

describe("the fire site", () => {
  it("is cleared ground, so a camp with no stone within reach can still make one and light a fire", () => {
    testAtmosphere({ temperatureC: 5 });
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    stripStone(state, world);
    const o = check(state, world, cal, "build", "firePit");
    expect(o.ok).toBe(true);
    expect(startTask(state, world, cal, "build", "firePit")).toBe(true);
    advance(state, world, o.duration);
    expect(campSite(st)!.structures.firePit).toBe(true);
    // And the fire that was gated behind it is now only a drill and a kilo of wood away.
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    expect(check(state, world, cal, "light").ok).toBe(true);
    expect(qty(state.player.pack, "stone")).toBe(0);
  });

  it("costs the work the ground asks for: bare ground quick, deep duff longer, peat longest, and deep snow on top of it", () => {
    expect(fireSiteMinutes("meadow", 0)).toBe(20);
    expect(fireSiteMinutes("spruce", 0)).toBe(30);
    expect(fireSiteMinutes("bog", 0)).toBe(60);
    expect(fireSiteMinutes("meadow", 40)).toBe(50);
    expect(fireSiteMinutes("bog", 40)).toBe(90);
    // Shallow snow is scraped aside with the vegetation and asks for nothing extra.
    expect(fireSiteMinutes("meadow", 5)).toBe(20);
  });

  it("charges the ground's own minutes at the camp cell, snow and all", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    const terrain = cellAt(world, st.campCell!).terrain;
    ensureGround(state, world, state.player.region).snowCm = 0;
    expect(check(state, world, cal, "build", "firePit").duration).toBe(fireSiteMinutes(terrain, 0));
    ensureGround(state, world, state.player.region).snowCm = 40;
    expect(check(state, world, cal, "build", "firePit").duration).toBe(fireSiteMinutes(terrain, 40));
  });
});
