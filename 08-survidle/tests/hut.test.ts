import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { needsMending } from "../src/sim/camp";
import { fireWarms, roofed, splitSheltered, stepSmoke } from "../src/sim/fire";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { shelterBonus, sheltered } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";

const cal = calendar(0);

function campWithPit(seed = 8) {
  const g = newGame(seed);
  const st = regionState(g.state, g.world, g.state.player.region);
  st.structures.firePit = true;
  const camp = pile(g.state, st.campCell);
  addItem(camp, "log", 4); addItem(camp, "stick", 20); addItem(camp, "bark", 40); addItem(camp, "cordage", 4);
  return { ...g, st, camp };
}

describe("the turf hut", () => {
  it("builds at camp after the fire pit, twenty hours, and stands as a roof", () => {
    const { state, world, st } = campWithPit();
    st.structures.firePit = false;
    expect(check(state, world, cal, "build", "turfHut")).toMatchObject({ ok: false, why: "build the fire pit first" });
    st.structures.firePit = true;
    expect(check(state, world, cal, "build", "turfHut")).toMatchObject({ ok: true, duration: 1200 });
    expect(startTask(state, world, cal, "build", "turfHut")).toBe(true);
    // Stepped by the task clock alone, not advance(): a raw, unattended
    // 1200-minute build is also 1200 minutes of a fresh survivor's mastery
    // gap on a first hut, with no fire lit and no roof yet to stand under -
    // exactly the exposure every other long build in this codebase runs
    // through an intent to avoid. This test is about the build and its
    // roof, not that survival economy.
    const rng = new Rng(1);
    for (let i = 0; i < 3000 && state.task; i++) stepTask(state, world, cal, rng, 1);
    expect(st.structures.turfHut).toBe(true);
    expect(st.structureAge.turfHut).toBeGreaterThanOrEqual(0);
    expect(roofed(st)).toBe(true);
    expect(splitSheltered(state, world, st.campCell)).toBe(true);
    expect(sheltered(state, world)).toBe(true);
  });

  it("is ten degrees of shelter, between the lean-to and the cabin", () => {
    const { st } = campWithPit();
    expect(shelterBonus(st)).toBe(0);
    st.structures.leanTo = true;
    expect(shelterBonus(st)).toBe(5);
    st.structures.turfHut = true;
    expect(shelterBonus(st)).toBe(10);
    st.structures.cabin = true;
    expect(shelterBonus(st)).toBe(15);
  });

  it("allows a fire indoors that warms and never fills the hut with smoke", () => {
    const { state, world, st } = campWithPit();
    st.structures.turfHut = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(state.player.pack, "firewood", 5);
    const o = check(state, world, cal, "lightIndoors");
    expect(o).toMatchObject({ ok: true, detail: "under the smoke hole" });
    st.fire.lit = true;
    st.fire.indoors = true;
    st.fire.fuelKg = 5;
    expect(fireWarms(st)).toBe(true);
    stepSmoke(st, true, 6 * 60);
    expect(st.smoke).toBe(0);
  });

  it("keeps the rain off like a cabin", () => {
    const { state, world, st } = campWithPit();
    st.structures.turfHut = true;
    state.weather.precip = "heavy";
    state.player.wetness = 0;
    advance(state, world, 120);
    expect(state.player.wetness).toBe(0);
  });

  it("needs re-roofing past a year, comes down after a year and a half, and a mend resets it", () => {
    const { state, world, st, camp } = campWithPit();
    st.structures.turfHut = true;
    st.structureAge.turfHut = 0;
    expect(needsMending(st, "turfHut")).toBe(false);
    st.structureAge.turfHut = 361 * 1440;
    expect(needsMending(st, "turfHut")).toBe(true);
    const m = check(state, world, cal, "mend", "turfHut");
    expect(m).toMatchObject({ ok: true, label: "Re-roof the hut", duration: 120 });
    addItem(camp, "bark", 20);
    expect(startTask(state, world, cal, "mend", "turfHut")).toBe(true);
    advance(state, world, 120 * 2);
    expect(st.structureAge.turfHut).toBeLessThan(10 * 1440);
    st.structureAge.turfHut = 541 * 1440;
    st.fire.indoors = true;
    state.dead = { cause: "starved", minute: state.minute };
    advance(state, world, 1440, { nobody: true });
    expect(st.structures.turfHut).toBe(false);
    expect(st.fire.indoors).toBe(false);
    expect(state.log.some((l) => l.text.includes("The roof of the hut"))).toBe(true);
  });
});
