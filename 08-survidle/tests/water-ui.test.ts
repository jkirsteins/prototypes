import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { siteLine, siteReport } from "../src/sim/camp";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { seepGround } from "../src/sim/seep";
import { waterLine, waterList } from "../src/ui/water";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";

const cal = calendar(0);

function wetCell(world: World): number {
  const c = regionAt(world, world.start).cells.find((c) => seepGround(world, c) !== null);
  if (c === undefined) throw new Error("no wet cell");
  return c;
}

describe("the water line", () => {
  it("reads the shore, the ice, the hole, camp water, the seep, wet ground and nothing", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    expect(waterLine(state, world, cal)).toBe("shore, endless");
    state.weather.iceCm = 10;
    expect(waterLine(state, world, cal)).toBe("iced over; an axe opens an ice hole");
    st.iceHole = { cell: st.campCell, minute: 0 };
    expect(waterLine(state, world, cal)).toBe("ice hole, open until morning");
    st.iceHole = null;
    state.weather.iceCm = 0;
    addItem(pile(state, st.campCell), "barkBucket", 2);
    addItem(pile(state, st.campCell), "water", 3);
    expect(waterLine(state, world, cal)).toBe("3.0 of 4.0 l at camp; shore, endless");
    const wet = wetCell(world);
    const rate = seepGround(world, wet) === "bog" ? 3 : 1;
    placeAt(state, world, wet);
    expect(waterLine(state, world, cal)).toBe(`none; a seep is possible here, 10 l, +${rate} l/h`);
    state.seeps[wet] = { class: seepGround(world, wet)!, litres: 6, ice: 0, dug: state.minute };
    expect(waterLine(state, world, cal)).toBe(`seep, 6.0 of 10 l, +${rate} l/h`);
    state.weather.dryDays = 14;
    expect(waterLine(state, world, cal)).toBe("seep, 6.0 of 10 l, +0 l/h, drought");
    state.weather.dryDays = 0;
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
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    expect(waterList(state, world, cal)).toMatch(/^shore \d+ min, endless$/);
    const wet = wetCell(world);
    state.seeps[wet] = { class: seepGround(world, wet)!, litres: 6, ice: 0, dug: state.minute };
    addItem(pile(state, st.campCell), "barkBucket", 1);
    addItem(pile(state, st.campCell), "water", 1.5);
    const list = waterList(state, world, cal);
    expect(list).toMatch(/shore \d+ min, endless/);
    expect(list).toMatch(/seep \d+ min, 6\.0 of 10 l/);
    expect(list).toMatch(/camp water 1\.5 l, 0 min/);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    state.weather.snowCm = 10;
    expect(waterList(state, world, cal)).toMatch(/snow at the fire, 1 l per 15 min and 1 kg wood/);
  });

  it("the site report says when a seep is possible", () => {
    const { state, world } = newGame(17);
    const wet = wetCell(world);
    expect(siteLine(siteReport(state, world, wet))).toMatch(/, seep possible$/);
    const st = regionState(state, world, state.player.region);
    expect(siteLine(siteReport(state, world, st.campCell))).not.toMatch(/seep possible/);
  });
});
