import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { activityLoop, ambienceMix, openCalls, surroundings, type Surroundings, windowOpen } from "../src/sim/soundscape";
import { cellAt, regionAt } from "../src/world/gen";
import { LATTICE_H, LATTICE_W } from "../src/world/terrain";
import { FIRE_LOW_KG } from "../src/sim/items";
import type { Species } from "../src/sim/species";

const base: Surroundings = { forest: 0, birch: 0, open: 0, bog: 0, lake: 0, sea: 0, footing: "grass", frozen: false, fire: "none", indoors: false, rain: "none", storm: false };
/** Minutes for a clock hour on run day d. */
const at = (d: number, hour: number) => 1440 * (d - 1) + (hour - 8) * 60;
const JUNE = 62;   // run day of 1 June
const JAN = 276;

describe("surroundings", () => {
  it("reads the footing from the ground, snow and ice", () => {
    const { state, world } = newGame(3);
    const r = regionAt(world, state.player.region);
    const on = (t: string) => r.cells.find((c) => cellAt(world, c).terrain === t);
    const forest = on("spruce") ?? on("pine");
    placeAt(state, world, forest!);
    expect(surroundings(state, world, 10).footing).toBe("leaves");
    expect(surroundings(state, world, 10).forest).toBeGreaterThan(0);
    const meadow = on("meadow");
    if (meadow) {
      placeAt(state, world, meadow);
      expect(surroundings(state, world, 10).footing).toBe("grass");
    }
    const bog = on("bog");
    if (bog) {
      placeAt(state, world, bog);
      expect(surroundings(state, world, 10).footing).toBe("bog");
    }
    state.weather.snowCm = 6;
    placeAt(state, world, forest!);
    expect(surroundings(state, world, -3).footing).toBe("snow");
    state.weather.snowCm = 0;
    const water = on("water");
    if (water) {
      state.weather.iceCm = 20;
      placeAt(state, world, water);
      expect(surroundings(state, world, -3).footing).toBe("ice");
      expect(surroundings(state, world, -3).frozen).toBe(true);
    }
  });

  it("knows the fire, the roof and the rain", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "camp");
    const st = regionState(state, world, state.player.region);
    expect(surroundings(state, world, 10).fire).toBe("none");
    st.fire.lit = true;
    st.fire.fuelKg = FIRE_LOW_KG - 1;
    expect(surroundings(state, world, 10).fire).toBe("low");
    st.fire.fuelKg = 20;
    expect(surroundings(state, world, 10).fire).toBe("fed");
    st.fire.lit = false;
    state.player.torch = { lit: true, minutes: 30 };
    expect(surroundings(state, world, 10).fire).toBe("torch");
    state.weather.precip = "heavy";
    expect(surroundings(state, world, 5).rain).toBe("heavy");
    expect(surroundings(state, world, -5).rain).toBe("none");
  });
});

describe("windows", () => {
  it("dawn is sunrise minus one to plus three, dusk sunset minus two to plus one", () => {
    const c = calendar(at(JUNE, 12));
    expect(windowOpen("dawn", calendar(at(JUNE, c.sunrise - 0.5)))).toBe(true);
    expect(windowOpen("dawn", calendar(at(JUNE, c.sunrise + 2.9)))).toBe(true);
    expect(windowOpen("dawn", calendar(at(JUNE, c.sunrise + 3.1)))).toBe(false);
    expect(windowOpen("dusk", calendar(at(JUNE, c.sunset - 1)))).toBe(true);
    expect(windowOpen("dusk", calendar(at(JUNE, c.sunset + 1.1)))).toBe(false);
    expect(windowOpen("day", calendar(at(JUNE, 12)))).toBe(true);
    expect(windowOpen("night", calendar(at(JUNE, 12)))).toBe(false);
    expect(windowOpen("any", calendar(at(JUNE, 12)))).toBe(true);
  });
});

describe("ambience mix", () => {
  it("lake is quiet when frozen, fire is loud when fed, the chorus sings at a June dawn in birch", () => {
    const june = calendar(at(JUNE, 12));
    expect(ambienceMix({ ...base, lake: 0.4 }, june, 10).lake).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, lake: 0.4, frozen: true }, june, -5).lake ?? 0).toBe(0);
    expect(ambienceMix({ ...base, fire: "fed" }, june, 10).fire).toBe(1);
    expect(ambienceMix({ ...base, fire: "low" }, june, 10).fire).toBe(0.7);
    expect(ambienceMix({ ...base, fire: "torch" }, june, 10).fire).toBe(0.5);
    const dawn = calendar(at(JUNE, june.sunrise + 1));
    expect(ambienceMix({ ...base, birch: 0.5, forest: 0.5 }, dawn, 10).chorus).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, birch: 0.5, forest: 0.5 }, june, 10).chorus ?? 0).toBe(0);
    expect(ambienceMix({ ...base, birch: 0.5, forest: 0.5 }, calendar(at(JAN, 12)), -10).leaves ?? 0).toBe(0);
    expect(ambienceMix({ ...base, open: 1, storm: true }, june, 10).open).toBeGreaterThan(ambienceMix({ ...base, open: 1 }, june, 10).open);
    expect(ambienceMix({ ...base, rain: "heavy" }, june, 5).rain_heavy).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, bog: 0.5 }, calendar(at(JUNE + 20, 20)), 14).insects).toBeGreaterThan(0);
    expect(ambienceMix({ ...base, bog: 0.5 }, calendar(at(JUNE + 20, 12)), 14).insects ?? 0).toBe(0);
  });
});

describe("open calls", () => {
  function regionWith(_state: ReturnType<typeof newGame>["state"], world: ReturnType<typeof newGame>["world"], s: Species): number {
    for (let id = 0; id < LATTICE_W * LATTICE_H; id++) if (regionAt(world, id).capacity[s]) return id;
    throw new Error(`no ${s}`);
  }

  it("a loon calls on its lake at a June dusk, not in January, and an owl only where owls are", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "loon");
    placeAt(state, world, regionAt(world, id).campCell);
    const st = regionState(state, world, id);
    st.pop.loon = regionAt(world, id).capacity.loon;
    const c = calendar(at(JUNE, 12));
    const dusk = calendar(at(JUNE, c.sunset - 1));
    expect(openCalls(state, world, dusk).some((o) => o.slot === "loon")).toBe(true);
    expect(openCalls(state, world, calendar(at(JAN, 20))).some((o) => o.slot === "loon")).toBe(false);
    if (!regionAt(world, id).capacity.owl) expect(openCalls(state, world, calendar(at(JUNE, 1))).some((o) => o.slot === "owl")).toBe(false);
  });

  it("wolves howl to the moon", () => {
    const { state, world } = newGame(5);
    const id = regionWith(state, world, "wolf");
    placeAt(state, world, regionAt(world, id).campCell);
    regionState(state, world, id).pop.wolf = regionAt(world, id).capacity.wolf;
    const full = calendar(at(3, 1));
    const dark = calendar(at(3 + 15, 1));
    expect(full.moonLight).toBeGreaterThan(0.95);
    expect(dark.moonLight).toBeLessThan(0.05);
    const rate = (cal: ReturnType<typeof calendar>) => openCalls(state, world, cal).find((o) => o.slot === "wolf")?.rate ?? 0;
    expect(rate(full)).toBeGreaterThan(3 * rate(dark));
    expect(rate(dark)).toBeGreaterThan(0);
    expect(rate(calendar(at(3, 13)))).toBe(0);
  });
});

describe("activity loop", () => {
  it("steps on the footing while walking, swings the axe while felling, is quiet asleep", () => {
    const { state } = newGame(3);
    state.task = { id: "walk", progress: 0, duration: 10, repeat: false };
    expect(activityLoop(state, { ...base, footing: "snow" })).toEqual({ slot: "step_snow", period: 0.6 });
    state.task = { id: "chop", progress: 0, duration: 50, repeat: false };
    expect(activityLoop(state, base)).toEqual({ slot: "axe", period: 1.5 });
    state.task = { id: "split", progress: 0, duration: 15, repeat: false };
    expect(activityLoop(state, base)).toEqual({ slot: "axe", period: 2 });
    state.task = { id: "craft", arg: "knife", progress: 0, duration: 45, repeat: false };
    expect(activityLoop(state, base)).toEqual({ slot: "knap", period: 1.2 });
    state.task = { id: "craft", arg: "cordage", progress: 0, duration: 20, repeat: false };
    expect(activityLoop(state, base)).toBeNull();
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    expect(activityLoop(state, base)).toBeNull();
    state.task = null;
    expect(activityLoop(state, base)).toBeNull();
  });
});
