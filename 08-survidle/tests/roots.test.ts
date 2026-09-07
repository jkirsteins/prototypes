import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { setSkillLevel } from "../src/sim/horizon";
import { addItem, qty } from "../src/sim/inventory";
import { FOODS, ROOT_GROWTH_FROM_DOY, ROOT_GROWTH_TO_DOY, ROOT_KG_PER_HOUR, ROOT_POOR_SHARE, ROOT_WINTER_KG_PER_HOUR } from "../src/sim/items";
import { resolveCell } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { RECOMMENDED } from "../src/sim/skills";
import { rootCellFullKg, rootCellKg, rootKgLeft, rootStockFor } from "../src/sim/stocks";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { cellAt, neighbours, regionAt, spotOf, type World } from "../src/world/gen";

/** A cell of the wanted ground near the start, hunted for rather than written down: the world is generated, not fixed. */
function findCell(world: World, from: number, want: (terrain: string, waterside: boolean) => boolean): number {
  const c0 = cellAt(world, from);
  for (let ring = 0; ring <= 60; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const x = c0.x + dx;
        const y = c0.y + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const idx = y * world.w + x;
        const t = cellAt(world, idx).terrain;
        if (want(t, neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water"))) return idx;
      }
    }
  }
  throw new Error("no such ground near the start");
}

describe("roots and rhizomes", () => {
  it("a cell holds its stand's rhizome: a shore fringe, a wet cell's margins, a meadow's sparse taproots", () => {
    expect(FOODS.cookedRoots).toEqual({ kcalPerKg: 850, portionKg: 0.3, sickChance: 0, leanShare: 0 });
    expect(RECOMMENDED.roots).toEqual({ skill: "foraging", level: 3 });
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const here = regionAt(world, region).campCell;
    const shore = findCell(world, here, (t, water) => water && t !== "water" && t !== "bog" && t !== "meadow");
    const bog = findCell(world, here, (t, water) => t === "bog" && !water);
    const meadow = findCell(world, here, (t, water) => t === "meadow" && !water);
    // Nine hectares of cell: a 10 m reed fringe, the wet hollows of a wet cell, a meadow's scattered taproots.
    expect(rootCellFullKg(world, shore)).toBeCloseTo(810, 0);
    expect(rootCellFullKg(world, bog)).toBeCloseTo(1350, 0);
    expect(rootCellFullKg(world, meadow)).toBeCloseTo(90, 0);
    // Waterside bog is bog ground with a fringe on it, not the lesser of the two; open water is no ground at all.
    const bogShore = findCell(world, here, (t, water) => t === "bog" && water);
    expect(rootCellFullKg(world, bogShore)).toBeCloseTo(1350, 0);
    const water = findCell(world, here, (t) => t === "water");
    expect(rootCellFullKg(world, water)).toBe(0);
    const forest = findCell(world, here, (t, w) => t === "spruce" && !w);
    expect(rootCellFullKg(world, forest)).toBe(0);
    // Nothing dug: the region's ground and what is left in it read the same.
    const st = regionState(state, world, region);
    expect(rootKgLeft(st, world, region)).toBeCloseTo(rootStockFor(world, region), 6);
    expect(rootStockFor(world, region)).toBeGreaterThan(1000);
  });

  it("a dig draws from the cell it stands on and leaves its neighbours alone, at 0.3 kg an hour and half kept under Foraging 3", () => {
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    placeAtSpot(state, world, region, "heath");
    const at = cellOf(state, world);
    const full = rootCellFullKg(world, at);
    expect(full).toBeGreaterThan(0);
    const neighbour = neighbours(world, at).find((n) => rootCellFullKg(world, n) > 0)!;
    addItem(state.player.pack, "stick", 1);
    const cal = calendar(0, 130);
    expect(check(state, world, cal, "roots").ok).toBe(true);
    startTask(state, world, cal, "roots");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "roots")).toBeCloseTo(ROOT_KG_PER_HOUR / 2, 6);
    expect(rootCellKg(st, world, at)).toBeCloseTo(full - ROOT_KG_PER_HOUR, 6);
    expect(st.rootCells[neighbour]).toBeUndefined();
    expect(rootCellKg(st, world, neighbour)).toBeCloseTo(rootCellFullKg(world, neighbour), 6);
    setSkillLevel(state, "foraging", 3);
    startTask(state, world, cal, "roots");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "roots")).toBeCloseTo(ROOT_KG_PER_HOUR * 1.5, 6);
    expect(rootCellKg(st, world, at)).toBeCloseTo(full - ROOT_KG_PER_HOUR * 2, 6);
  });

  it("a patch under half digs slower and reads dug over; an empty one is dug out", () => {
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    placeAtSpot(state, world, region, "heath");
    const at = cellOf(state, world);
    const full = rootCellFullKg(world, at);
    addItem(state.player.pack, "stick", 1);
    setSkillLevel(state, "foraging", 3);
    const cal = calendar(0, 130);
    // A quarter of what it holds is half of the poor line: half the rate.
    st.rootCells[at] = full * (ROOT_POOR_SHARE / 2);
    const o = check(state, world, cal, "roots");
    expect(o.ok).toBe(true);
    expect(o.detail).toContain("dug over here, the next patch is better");
    expect(o.detail).toContain(`${ROOT_KG_PER_HOUR / 2} kg an hour`);
    startTask(state, world, cal, "roots");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "roots")).toBeCloseTo(ROOT_KG_PER_HOUR / 2, 6);
    // At full it says none of that.
    delete st.rootCells[at];
    expect(check(state, world, cal, "roots").detail).not.toContain("dug over");
    st.rootCells[at] = 0;
    expect(check(state, world, cal, "roots")).toMatchObject({ ok: false, why: "the ground is dug out" });
  });

  it("half of what a cell is short comes back across the growing season, and nothing comes back in October", () => {
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    const at = regionAt(world, region).cells.find((c) => rootCellFullKg(world, c) > 0)!;
    const full = rootCellFullKg(world, at);
    st.rootCells[at] = 0;
    for (let doy = ROOT_GROWTH_FROM_DOY; doy <= ROOT_GROWTH_TO_DOY; doy++) dailyCamp(state, world, calendar(0, doy), new Rng(doy), null);
    expect(rootCellKg(st, world, at)).toBeCloseTo(full / 2, 6);
    const afterSeason = rootCellKg(st, world, at);
    for (let doy = ROOT_GROWTH_TO_DOY + 1; doy <= ROOT_GROWTH_TO_DOY + 31; doy++) dailyCamp(state, world, calendar(0, doy), new Rng(doy), null);
    expect(rootCellKg(st, world, at)).toBeCloseTo(afterSeason, 9);
  });

  it("a cell back at full keeps no entry of its own", () => {
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    const at = regionAt(world, region).cells.find((c) => rootCellFullKg(world, c) > 0)!;
    st.rootCells[at] = rootCellFullKg(world, at);
    dailyCamp(state, world, calendar(0, ROOT_GROWTH_FROM_DOY), new Rng(1), null);
    expect(st.rootCells[at]).toBeUndefined();
    expect(rootCellKg(st, world, at)).toBeCloseTo(rootCellFullKg(world, at), 6);
  });

  it("the walk goes to a patch worth digging, and to whatever is left when none is", () => {
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    placeAtSpot(state, world, region, "heath");
    const here = cellOf(state, world);
    const cal = calendar(0, 130);
    expect(rootCellFullKg(world, here)).toBeGreaterThan(0);
    expect(resolveCell(state, world, cal, "roots", undefined, "nearest").cell).toBe(here);
    // Dug over under foot: the walk goes to a patch that is not.
    st.rootCells[here] = rootCellFullKg(world, here) * (ROOT_POOR_SHARE / 2);
    const better = resolveCell(state, world, cal, "roots", undefined, "nearest").cell;
    expect(better).not.toBe(here);
    expect(rootCellKg(st, world, better)).toBeGreaterThanOrEqual(rootCellFullKg(world, better) * ROOT_POOR_SHARE);
    // Every patch poor: the nearest with anything left, which is the one under foot.
    for (const c of regionAt(world, region).cells) if (rootCellFullKg(world, c) > 0) st.rootCells[c] = rootCellFullKg(world, c) * 0.1;
    expect(resolveCell(state, world, cal, "roots", undefined, "nearest").cell).toBe(here);
  });

  it("a winter dig needs an open ice hole at the shore; the bog and the meadow are frozen solid, hole or no hole", () => {
    const { state, world } = newGame(17);
    const region = state.player.region;
    const st = regionState(state, world, region);
    placeAtSpot(state, world, region, "shore");
    const shoreCell = cellOf(state, world);
    addItem(state.player.pack, "stick", 1);
    const winter = calendar(0, 350);
    expect(check(state, world, winter, "roots")).toMatchObject({ ok: false, why: "the ground is frozen; an ice hole reaches the rhizomes" });
    st.iceHole = { cell: shoreCell, minute: state.minute };
    const o = check(state, world, winter, "roots");
    expect(o.ok).toBe(true);
    expect(o.detail).toContain(`${ROOT_WINTER_KG_PER_HOUR} kg an hour`);
    const full = rootCellFullKg(world, shoreCell);
    startTask(state, world, winter, "roots");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, winter, new Rng(m), 1);
    expect(rootCellKg(st, world, shoreCell)).toBeCloseTo(full - ROOT_WINTER_KG_PER_HOUR, 6);
    placeAt(state, world, findCell(world, shoreCell, (t, water) => t === "meadow" && !water));
    expect(check(state, world, winter, "roots")).toMatchObject({ ok: false, why: "the ground is frozen; an ice hole reaches the rhizomes" });
  });

  it("a winter dig is sent to the open ice hole, not to the nearest root ground", () => {
    // The want opens in winter on an axe in reach, but the walk went to the bog, where the dig
    // is refused with "the ground is frozen" whatever the hole at the shore is doing: ruling R5,
    // and the reason a winter roots row on the list never once ran.
    const { state, world } = newGame(17);
    const region = state.player.region;
    const st = regionState(state, world, region);
    placeAtSpot(state, world, region, "heath");
    const winter = calendar(0, 350);
    const summer = calendar(0, 200);
    const shore = spotOf(regionAt(world, region), "shore")!.cell;
    st.iceHole = { cell: shore, minute: state.minute };
    expect(resolveCell(state, world, winter, "roots", undefined, "nearest").cell).toBe(shore);
    // In the digging season the ground itself is open and the hole is beside the point.
    expect(resolveCell(state, world, summer, "roots", undefined, "nearest").cell).not.toBe(shore);
    // No hole cut: the walk falls back to the nearest root ground, where the task says why it is shut.
    st.iceHole = null;
    expect(resolveCell(state, world, winter, "roots", undefined, "nearest").cell).not.toBe(shore);
  });
});
