import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import { cellPossibilities } from "../src/sim/camp";
import { addItem, pile } from "../src/sim/inventory";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { seepGround } from "../src/sim/seep";
import { waterLine, waterList } from "../src/ui/water";
import { cellAt, neighbours, regionAt, regionPeek, type World } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";
import { ensureGround } from "../src/sim/weather";
import { testAtmosphere } from "./weather-helpers";

const cal = calendar(0);

afterEach(() => vi.restoreAllMocks());

function wetCell(world: World): number {
  const c = regionAt(world, world.start).cells.find((c) => seepGround(world, c) !== null);
  if (c === undefined) throw new Error("no wet cell");
  return c;
}

describe("the water line", () => {
  it("reads local shore ice instead of the legacy player summary", () => {
    const { state, world } = newGame(17);
    testAtmosphere({ temperatureC: 5 });
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    const ground = ensureGround(state, world, state.player.region);
    ground.iceCm = 0;
    state.weather.iceCm = 20;
    expect(waterLine(state, world, cal)).toBe("shore, endless");
  });

  it("reads the shore, the ice, the hole, camp water, the seep, wet ground and nothing", () => {
    const { state, world } = newGame(17);
    testAtmosphere({ temperatureC: 5 });
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    // This test changes water-source state explicitly; keep thawed air fixed.
    const campGround = ensureGround(state, world, state.player.region);
    campGround.iceCm = 0;
    expect(waterLine(state, world, cal)).toBe("shore, endless");
    campGround.iceCm = 10;
    expect(waterLine(state, world, cal)).toBe("iced over; an axe opens an ice hole");
    st.iceHole = { cell: st.campCell!, minute: 0 };
    expect(waterLine(state, world, cal)).toBe("ice hole, open until morning");
    st.iceHole = null;
    campGround.iceCm = 0;
    addItem(pile(state, st.campCell!), "barkBucket", 2);
    addItem(pile(state, st.campCell!), "water", 3);
    expect(waterLine(state, world, cal)).toBe("3.0 of 4.0 l at camp; shore, endless");
    const wet = wetCell(world);
    const rate = seepGround(world, wet) === "bog" ? 3 : 1;
    placeAt(state, world, wet);
    const wetPos = cellAt(world, wet);
    const wetGround = ensureGround(state, world, regionPeek(world, wetPos.x, wetPos.y));
    expect(waterLine(state, world, cal)).toBe(`none; a seep is possible here, 10 l, +${rate} l/h`);
    state.seeps[wet] = { class: seepGround(world, wet)!, litres: 6, ice: 0, dug: state.minute };
    expect(waterLine(state, world, cal)).toBe(`seep, 6.0 of 10 l, +${rate} l/h`);
    wetGround.dryHours = 14 * 24;
    expect(waterLine(state, world, cal)).toBe("seep, 6.0 of 10 l, +0 l/h, drought");
    wetGround.dryHours = 0;
    state.seeps[wet].ice = 2;
    state.seeps[wet].litres = 4;
    expect(waterLine(state, world, cal)).toBe(`seep, 4.0 of 10 l, +${rate} l/h, 2.0 l frozen`);
    const dry = regionAt(world, world.start).cells.find((c) => cellAt(world, c).terrain === "pine" && !neighbours(world, c).some((n) => cellAt(world, n).terrain === "water"));
    if (dry !== undefined) {
      placeAt(state, world, dry);
      expect(waterLine(state, world, cal)).toBe("none");
    }
  });

  it("the region's water list names the nearest of each kind with its walk, and the fire's melt with its wood", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    const campGround = ensureGround(state, world, state.player.region);
    campGround.iceCm = 0;
    mapRegion(state, world, state.player.region);
    expect(waterList(state, world, cal)).toMatch(/^shore \d+ min, endless$/);
    const wet = wetCell(world);
    state.seeps[wet] = { class: seepGround(world, wet)!, litres: 6, ice: 0, dug: state.minute };
    addItem(pile(state, st.campCell!), "barkBucket", 1);
    addItem(pile(state, st.campCell!), "water", 1.5);
    const list = waterList(state, world, cal);
    expect(list).toMatch(/shore \d+ min, endless/);
    expect(list).toMatch(/seep \d+ min, 6\.0 of 10 l/);
    expect(list).toMatch(/camp water 1\.5 l, 0 min/);
    siteFor(st, st.campCell!).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    campGround.snowCm = 10;
    expect(waterList(state, world, cal)).toMatch(/snow at the fire, 1 l per 15 min and 1 kg wood/);
  });

  it("the cell possibilities say when a seep is possible", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const wet = wetCell(world);
    expect(cellPossibilities(world, wet)).toEqual(["seep possible"]);
    const st = regionState(state, world, state.player.region);
    expect(cellPossibilities(world, st.campCell!)).toEqual([]);
  });
});
