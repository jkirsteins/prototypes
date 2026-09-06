import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { roofed } from "../src/sim/fire";
import { SNOW_MELT_DAYS, SNOW_SHELTER_CM, STRUCTURES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, sheltered, SNOW_FLOOR_C } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { REFERENCE_ORDERS, wantOpen } from "../src/sim/reference";

const key = (w: (typeof REFERENCE_ORDERS)[number]) => `${w.req.task}:${w.req.arg ?? ""}:${w.kind}`;

describe("the snow shelter", () => {
  it("needs 40 cm of snow, nothing else, and no hut standing", () => {
    expect(STRUCTURES.snowShelter.needs).toEqual([]);
    expect(STRUCTURES.snowShelter.minutes).toBe(300);
    expect(SNOW_SHELTER_CM).toBe(40);
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(0, 334);
    state.weather.snowCm = 10;
    expect(check(state, world, cal, "build", "snowShelter").why).toBe("needs 40 cm of snow");
    state.weather.snowCm = 45;
    expect(check(state, world, cal, "build", "snowShelter").ok).toBe(true);
    st.structures.turfHut = true;
    expect(check(state, world, cal, "build", "snowShelter").why).toBe("the hut is warmer");
  });

  it("built, it is a roof and walls with a -3 C floor and no fire inside", () => {
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    state.weather.snowCm = 45;
    const cal = calendar(0, 334);
    startTask(state, world, cal, "build", "snowShelter");
    for (let m = 0; m < 300 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(st.structures.snowShelter).toBe(true);
    expect(roofed(st)).toBe(true);
    state.task = null;
    expect(sheltered(state, world)).toBe(true);
    const inside = feltTemperature(state, world, -25);
    const openAir = (() => { st.structures.snowShelter = false; const f = feltTemperature(state, world, -25); st.structures.snowShelter = true; return f; })();
    expect(inside - openAir).toBeCloseTo(SNOW_FLOOR_C + 25, 6);
    expect(check(state, world, cal, "lightIndoors").why).toBe("snow does not take a fire");
  });

  it("slumps on the third warm day in a row and stands through a cold one between", () => {
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    st.structures.snowShelter = true;
    state.weather.offset = 20;
    dailyCamp(state, world, calendar(0, 334), new Rng(1), null);
    dailyCamp(state, world, calendar(1440, 334), new Rng(2), null);
    expect(st.structures.snowShelter).toBe(true);
    state.weather.offset = -20;
    dailyCamp(state, world, calendar(2880, 334), new Rng(3), null);
    expect(st.meltDays).toBe(0);
    state.weather.offset = 20;
    for (let d = 0; d < SNOW_MELT_DAYS; d++) dailyCamp(state, world, calendar((3 + d) * 1440, 334), new Rng(d), null);
    expect(st.structures.snowShelter).toBe(false);
    expect(state.log.some((l) => l.text.includes("has slumped"))).toBe(true);
  });

  it("sits in the list after the bough bed keep and closes when a hut or cabin stands", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("build:snowShelter:job")).toBe(tasks.indexOf("build:boughBed:keep") + 1);
    const { state, world } = newGame(17, 334);
    const w = REFERENCE_ORDERS[tasks.indexOf("build:snowShelter:job")];
    expect(wantOpen(state, world, w, calendar(0, 334))).toBe(true);
    regionState(state, world, state.player.region).structures.turfHut = true;
    expect(wantOpen(state, world, w, calendar(0, 334))).toBe(false);
  });

  it("beside a lean-to, reads the better of the two roofs rather than colder than either", () => {
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    st.structures.snowShelter = true;
    st.structures.leanTo = true;
    state.task = null;
    // Mild cold: the lean-to's open-air bonus beats the snow floor, so both together read
    // no colder than the lean-to alone.
    const bothMild = feltTemperature(state, world, -4);
    st.structures.snowShelter = false;
    const leanToOnly = feltTemperature(state, world, -4);
    st.structures.snowShelter = true;
    expect(bothMild).toBeCloseTo(leanToOnly, 6);
    // Deep cold: the snow floor beats the lean-to's fixed bonus, so both together read the floor.
    const bothCold = feltTemperature(state, world, -25);
    st.structures.leanTo = false;
    const snowOnly = feltTemperature(state, world, -25);
    st.structures.leanTo = true;
    expect(bothCold).toBeCloseTo(snowOnly, 6);
  });

  it("beside a turf hut with its fire unlit, reads the better of the hut and the snow floor", () => {
    // Nothing clears a snow shelter but three warm days in a row, so a hut built beside a
    // still-standing one, its fire not yet lit indoors, is a reachable state.
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    st.structures.turfHut = true;
    st.structures.snowShelter = true;
    state.task = null;
    expect(st.fire.lit).toBe(false);
    // Mild cold: the hut's +10 roof bonus beats the snow floor, so both together read
    // no colder than the hut alone.
    const bothMild = feltTemperature(state, world, -4);
    st.structures.snowShelter = false;
    const hutOnly = feltTemperature(state, world, -4);
    st.structures.snowShelter = true;
    expect(bothMild).toBeCloseTo(hutOnly, 6);
    // Deep cold: ambient + 10 is still colder than the floor, so both together read the floor.
    const bothCold = feltTemperature(state, world, -25);
    st.structures.turfHut = false;
    const floorOnly = feltTemperature(state, world, -25);
    st.structures.turfHut = true;
    expect(bothCold).toBeCloseTo(floorOnly, 6);
  });
});
