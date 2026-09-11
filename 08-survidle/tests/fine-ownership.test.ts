/**
 * Everything a survivor leaves behind belongs to the 50 m patch it was left
 * on, and every stock a patch holds is what 0.0025 km2 of that ground grows.
 * These are the reads that used to be answered by a 300 m square.
 */
import { describe, expect, it } from "vitest";
import { forestGame, passableNeighbor, siteCamp } from "./siting-helpers";
import { calendar } from "../src/sim/calendar";
import { advance } from "../src/sim/advance";
import { warmthAtFire } from "../src/sim/fire";
import { addItem, pile, pileAt, qty, reach } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAtPatch } from "../src/sim/position";
import { regionState, siteAt, siteFor } from "../src/sim/regionstate";
import { rootCellFullKg } from "../src/sim/stocks";
import { pausedList, startTask, stopTask } from "../src/sim/tasks";
import { iceHoleOpen } from "../src/sim/water";
import { parentSummary, resourcePotentialAt, TREES_PER_FOREST_KM2 } from "../src/world/aggregate";
import { terrainPeek, type World } from "../src/world/gen";
import { FINE_PER_PARENT, PATCH_KM, patchId, patchXY } from "../src/world/spatial";
import type { Terrain } from "../src/sim/types";

/**
 * The nearest patch of a terrain to a starting patch, hunted for ring by ring
 * rather than written down: a seed places its own ground. Read without filling
 * chunks, so the search does not evict the ground the test is standing on.
 */
function findTerrainPatch(world: World, from: number, terrain: Terrain): number {
  const origin = patchXY(from);
  for (let ring = 0; ring <= 200; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      const edge = Math.abs(dy) === ring;
      for (let dx = -ring; dx <= ring; dx += edge ? 1 : 2 * ring) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        if (terrainPeek(world, x, y) === terrain) return patchId(x, y);
      }
    }
  }
  throw new Error(`no ${terrain} near patch ${from}`);
}

describe("fine ownership of local state", () => {
  it("leaves work and output on one exact 50 m patch", () => {
    const { state, world } = forestGame(21);
    const work = cellOf(state, world);
    expect(startTask(state, world, calendar(state.minute, state.startDoy), "deadwood")).toBe(true);
    advance(state, world, 30);
    stopTask(state, world);
    expect(pausedList(state, world, calendar(state.minute, state.startDoy)).some((entry) => entry.here)).toBe(true);
    const neighbor = passableNeighbor(world, work);
    // The unfinished share is remembered under the patch it was left on, so
    // 50 m away it is work that is somewhere else rather than work in hand.
    addItem(pile(state, work), "firewood", 3);
    placeAtPatch(state, world, neighbor);
    expect(pausedList(state, world, calendar(state.minute, state.startDoy)).some((entry) => entry.here)).toBe(false);
    expect(pileAt(state, work)).not.toBe(pileAt(state, neighbor));
    expect(qty(pileAt(state, neighbor), "firewood")).toBe(0);
  });

  it("gives a pile only to the patch it lies on", () => {
    const { state, world } = forestGame(21);
    const here = cellOf(state, world);
    const neighbor = passableNeighbor(world, here);
    addItem(pile(state, neighbor), "stone", 4);
    expect(reach(state, world).reduce((n, inv) => n + qty(inv, "stone"), 0)).toBe(0);
    placeAtPatch(state, world, neighbor);
    expect(reach(state, world).reduce((n, inv) => n + qty(inv, "stone"), 0)).toBe(4);
  });

  it("keeps camp structures, warmth and the roof on the camp patch", () => {
    const { state, world } = newGame(17, 130);
    const camp = siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, camp).structures.leanTo = true;
    st.fire.lit = true;
    st.fire.fuelKg = 5;
    placeAtPatch(state, world, camp);
    expect(warmthAtFire(state, world, true)).toBeGreaterThan(0);
    const neighbor = passableNeighbor(world, camp);
    expect(siteAt(st, neighbor)).toBe(null);
    placeAtPatch(state, world, neighbor);
    expect(warmthAtFire(state, world, true)).toBe(0);
  });

  it("puts out a field fire the moment its patch is left", () => {
    const { state, world } = forestGame(21);
    const here = cellOf(state, world);
    state.player.fieldFire = { cell: here, fuelKg: 3 };
    expect(warmthAtFire(state, world, false)).toBeGreaterThan(0);
    placeAtPatch(state, world, passableNeighbor(world, here));
    expect(state.player.fieldFire).toBe(null);
  });

  it("sets the trap, the ice hole and the seep on exact patches", () => {
    const { state, world } = newGame(17, 130);
    const camp = siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const neighbor = passableNeighbor(world, camp);
    st.trap = { cell: camp, kg: 0, oilyKg: 0, fish: [], age: 0 };
    st.iceHole = { cell: camp, minute: state.minute };
    state.seeps[camp] = { class: "bog", litres: 2, ice: 0, dug: state.minute };
    expect(st.trap.cell).toBe(camp);
    expect(iceHoleOpen(state, camp)).toBe(true);
    expect(iceHoleOpen(state, neighbor)).toBe(false);
    expect(state.seeps[neighbor]).toBeUndefined();
  });

  it("leaves a carcass on the patch it fell on", () => {
    const { state, world } = forestGame(21);
    const here = cellOf(state, world);
    const neighbor = passableNeighbor(world, here);
    state.carcasses.push({ id: 1, species: "hare", cell: here, killedAt: state.minute, warmAge: 0, yields: { meatKg: 2 } });
    expect(state.carcasses.some((c) => c.cell === cellOf(state, world))).toBe(true);
    placeAtPatch(state, world, neighbor);
    expect(state.carcasses.some((c) => c.cell === cellOf(state, world))).toBe(false);
  });

  it("shelters only the patch the cover was found on", () => {
    const { state, world } = forestGame(21);
    const here = cellOf(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, here).cover = 2;
    expect(siteAt(st, here)?.cover).toBe(2);
    expect(siteAt(st, passableNeighbor(world, here))).toBe(null);
  });
});

describe("resources a fine patch grows", () => {
  it("derives forest stock from 0.0025 square kilometres", () => {
    const { state, world } = forestGame(21);
    const patch = findTerrainPatch(world, cellOf(state, world), "spruce");
    const potential = resourcePotentialAt(world, patch);
    expect(potential.areaKm2).toBeCloseTo(0.0025, 8);
    expect(potential.trees).toBeGreaterThan(0);
    expect(potential.trees).toBeCloseTo(PATCH_KM * PATCH_KM * TREES_PER_FOREST_KM2, 8);
  });

  it("gives open ground no trees to fell", () => {
    const { state, world } = newGame(17, 130);
    const water = findTerrainPatch(world, cellOf(state, world), "water");
    expect(resourcePotentialAt(world, water).trees).toBe(0);
    expect(resourcePotentialAt(world, water).areaKm2).toBeCloseTo(0.0025, 8);
  });

  it("sums a parent's resource potential from its own thirty-six patches", () => {
    const { state, world } = forestGame(21);
    const { x, y } = patchXY(cellOf(state, world));
    const px = Math.floor(x / FINE_PER_PARENT);
    const py = Math.floor(y / FINE_PER_PARENT);
    const summary = parentSummary(world, px, py);
    let trees = 0;
    let areaKm2 = 0;
    for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
      for (let dx = 0; dx < FINE_PER_PARENT; dx++) {
        const potential = resourcePotentialAt(world, patchId(px * FINE_PER_PARENT + dx, py * FINE_PER_PARENT + dy));
        trees += potential.trees;
        areaKm2 += potential.areaKm2;
      }
    }
    expect(summary.resourcePotential.trees).toBeCloseTo(trees, 8);
    expect(summary.resourcePotential.areaKm2).toBeCloseTo(areaKm2, 8);
    expect(summary.resourcePotential.areaKm2).toBeCloseTo(36 * PATCH_KM * PATCH_KM, 8);
  });

  it("holds a patch of rhizome, not a nine-hectare cell of it", () => {
    const { state, world } = newGame(17, 130);
    const bog = findTerrainPatch(world, cellOf(state, world), "bog");
    // The stand's share of 2500 m2 at its density, times what a digging stick lifts.
    expect(rootCellFullKg(world, bog)).toBeCloseTo(37.5, 3);
  });
});
