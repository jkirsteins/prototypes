import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { addItem, carried, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { feltTemperature, stepPlayer } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { levelMinutes } from "../src/sim/skills";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { gearHtml, regionHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";

type G = ReturnType<typeof newGame>;
/** Steps until the task ends. */
function done(g: G, max = 2000) {
  const rng = new Rng(1);
  for (let i = 0; i < max && g.state.task; i++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
const cal = calendar(0);

describe("bedding", () => {
  it("a bough bed at camp warms you only while you sleep on it", () => {
    const { state, world } = newGame(1);
    const bare = feltTemperature(state, world, -10);
    regionState(state, world, state.player.region).structures.boughBed = true;
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bare, 5);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bare + 4, 5);
    // A bed is laid at a camp; away from it there is only ground.
    placeAtSpot(state, world, state.player.region, "forest");
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bare, 5);
  });

  it("a hide blanket warms you asleep or resting, anywhere, and not on the move", () => {
    const { state, world } = newGame(1);
    placeAtSpot(state, world, state.player.region, "forest");
    const bare = feltTemperature(state, world, -10);
    const walking = { id: "walk" as const, arg: "spot:camp", progress: 0, duration: 60, repeat: false };
    state.task = walking;
    const bareWalking = feltTemperature(state, world, -10);
    state.task = null;
    state.player.clothing.push({ id: "hideBlanket", durability: 100 });
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bare, 5);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bare + 8, 5);
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bare + 8, 5);
    state.task = walking;
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bareWalking, 5);
  });

  it("a worn blanket gives less, like any garment", () => {
    const { state, world } = newGame(1);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    const bare = feltTemperature(state, world, -10);
    state.player.clothing.push({ id: "hideBlanket", durability: 50 });
    expect(feltTemperature(state, world, -10)).toBeCloseTo(bare + 4, 5);
  });

  it("the blanket wears only while it is in use outdoors, not in the pack on a walk", () => {
    const { state, world } = newGame(1);
    placeAtSpot(state, world, state.player.region, "forest");
    state.player.clothing.push({ id: "hideBlanket", durability: 100 });
    const blanket = () => state.player.clothing.find((g) => g.id === "hideBlanket")!;
    state.task = { id: "walk", arg: "spot:camp", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 120; m++) stepPlayer(state, world, 5, 1);
    expect(blanket().durability).toBe(100);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    for (let m = 0; m < 120; m++) stepPlayer(state, world, 5, 1);
    expect(blanket().durability).toBeCloseTo(99, 5);
  });
});

describe("bough bed and blanket in play", () => {
  it("a bough bed is laid at camp from 12 sticks in half an hour", () => {
    const g = newGame(3);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    expect(check(state, world, cal, "build", "boughBed").ok).toBe(false);
    addItem(state.player.pack, "stick", 12);
    const o = check(state, world, cal, "build", "boughBed");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(30);
    expect(startTask(state, world, cal, "build", "boughBed")).toBe(true);
    done(g);
    expect(st.structures.boughBed).toBe(true);
    expect(qty(state.player.pack, "stick")).toBe(0);
    placeAtSpot(state, world, state.player.region, "forest");
    addItem(state.player.pack, "stick", 12);
    expect(check(state, world, cal, "build", "boughBed").why).toBe("walk to camp");
  });

  it("a bough bed rots away after a fortnight and can be laid again", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.boughBed = true;
    for (let d = 0; d < 13; d++) dailyCamp(state, world, calendar(state.minute), new Rng(1));
    expect(st.structures.boughBed).toBe(true);
    for (let d = 0; d < 2; d++) dailyCamp(state, world, calendar(state.minute), new Rng(1));
    expect(st.structures.boughBed).toBe(false);
    expect(state.log.some((e) => e.text.includes("bough bed"))).toBe(true);
    addItem(state.player.pack, "stick", 12);
    expect(check(state, world, cal, "build", "boughBed").ok).toBe(true);
  });

  it("a hide blanket is sewn from 4 kg hide and 2 sinew in four hours and goes in the worn list", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.player.tools.push({ id: "needle", durability: 100 });
    addItem(state.player.pack, "hide", 4);
    addItem(state.player.pack, "sinew", 2);
    const o = check(state, world, cal, "craft", "hideBlanket");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(240);
    const before = carried(state.player);
    // At Crafting 6, the recommended level, the piece always comes out; this test is about the recipe, not the odds.
    state.skills.crafting.xp = levelMinutes(6);
    startTask(state, world, cal, "craft", "hideBlanket");
    done(g);
    expect(state.player.clothing.some((g) => g.id === "hideBlanket")).toBe(true);
    // 4 kg of hide and two 50 g sinews become a 3 kg blanket that you carry.
    expect(carried(state.player)).toBeCloseTo(before - 4.1 + 3, 5);
  });

  it("sleep says what you lie on and under", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const detail = () => check(state, world, cal, "sleep").detail;
    expect(detail()).toContain("on bare ground, in the open");
    state.player.clothing.push({ id: "hideBlanket", durability: 100 });
    expect(detail()).toContain("on bare ground, under your blanket");
    st.structures.leanTo = true;
    st.structures.boughBed = true;
    st.fire.lit = true;
    expect(detail()).toContain("on a bough bed, under your blanket and the roof, by the fire");
    state.player.clothing = state.player.clothing.filter((g) => g.id !== "hideBlanket");
    expect(detail()).toContain("on a bough bed, under the roof, by the fire");
    placeAtSpot(state, world, state.player.region, "forest");
    expect(detail()).toContain("on bare ground, in the open");
  });

  it("a save from before bedding loads with no bed and an age of zero", () => {
    const { state, world } = newGame(3);
    const text = serialize(state, 1);
    const raw = JSON.parse(text);
    for (const id of Object.keys(raw.state.regions)) {
      delete raw.state.regions[id].structures.boughBed;
      delete raw.state.regions[id].boughBedAge;
    }
    const file = deserialize(JSON.stringify(raw));
    expect(file).not.toBeNull();
    const st = regionState(file!.state, world, file!.state.player.region);
    expect(st.structures.boughBed).toBe(false);
    expect(st.boughBedAge).toBe(0);
  });

  it("the worn list shows the blanket as warmth for sleeping, and the camp card lists the bed", () => {
    const { state, world } = newGame(3);
    state.player.clothing.push({ id: "hideBlanket", durability: 100 });
    expect(gearHtml(state)).toContain("hide blanket <small>+8 C asleep, 100%</small>");
    regionState(state, world, state.player.region).structures.boughBed = true;
    expect(regionHtml(state, world, cal, newUiState())).toContain("bough bed");
  });
});
