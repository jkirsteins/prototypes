import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import type { AtmosphereSample, LocalGroundWeather } from "../src/sim/types";
import { atmosphereAt, integrateGroundHour, patchGroundModifiers } from "../src/sim/weather";
import { conditionsAt, dryGroundAt, ensureGround, groundAt } from "../src/sim/weather";
import { rebaseWeather } from "../src/sim/weather";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { migrate, serialize, readSave } from "../src/sim/save";
import { cellOf } from "../src/sim/position";
import { cellAt, regionAt, type World } from "../src/world/gen";
import { markKnown } from "../src/sim/mapped";
import { routeConditions, survivorRoute } from "../src/sim/routing";
import { ICE_SAFE_CM, ICE_THIN_CM } from "../src/sim/weather";
import { advance } from "../src/sim/advance";
import { stepSeeps } from "../src/sim/seep";
import { check } from "../src/sim/tasks";
import { siteCamp, requireCamp } from "./siting-helpers";
import { stepCamp } from "../src/sim/camp";
import { regionState, siteFor } from "../src/sim/regionstate";
import { addItem, pile, qty } from "../src/sim/inventory";
import { hourlyWorld } from "../src/sim/hazards";
import { Rng } from "../src/rng";
import { stepSpine } from "../src/sim/spine";
import { splitIsWet } from "../src/sim/fire";
import { sourceLitres } from "../src/sim/water";
import { watersideCell } from "../src/sim/position";

afterEach(() => vi.restoreAllMocks());

/**
 * What a region's cover comes to where it actually lies. The region drives
 * the snow; the patch's own crown and exposure decide its depth there.
 */
function lying(world: World, cell: number, regionSnowCm: number): number {
  return regionSnowCm * patchGroundModifiers(world, cell).snow;
}

function ground(over: Partial<LocalGroundWeather> = {}): LocalGroundWeather {
  return { updatedHour: 0, snowCm: 0, surfaceWaterMm: 0, soilMoisture: 0.5, frost: 0, iceCm: 0, dryHours: 0, temperatureSum: 0, temperatureHours: 0, ...over };
}
function air(over: Partial<AtmosphereSample> = {}): AtmosphereSample {
  return { temperatureC: 0, pressureHpa: 1013, relativeHumidity: 1, cloud: 0,
    precipMmPerHour: 0, rainMmPerHour: 0, snowCmPerHour: 0, precip: "none",
    windKmh: 0, windBearingDeg: 0, windXKmh: 0, windYKmh: 0, fog: 0,
    blowingSnow: 0, extinctionPerKm: 0.06, ...over };
}

describe("local ground integration", () => {
  it("accumulates both fractions of mixed precipitation and keeps snow after passage", () => {
    const before = ground();
    const wet = integrateGroundHour(before, air({ precip: "rain", precipMmPerHour: 4, rainMmPerHour: 2, snowCmPerHour: 2 }));
    expect(wet.snowCm).toBe(2);
    expect(wet.surfaceWaterMm).toBe(1);
    expect(wet.soilMoisture).toBeCloseTo(0.52);
    expect(integrateGroundHour(wet, air()).snowCm).toBe(2);
    expect(before).toEqual(ground());
  });

  it("settles only at midnight and turns melting snow into puddles", () => {
    expect(integrateGroundHour(ground({ updatedHour: 14, snowCm: 10 }), air()).snowCm).toBe(10);
    expect(integrateGroundHour(ground({ updatedHour: 15, snowCm: 10 }), air()).snowCm).toBe(9.5);
    const melted = integrateGroundHour(ground({ snowCm: 3, soilMoisture: 1 }), air({ temperatureC: 3 }));
    expect(melted.snowCm).toBe(1);
    expect(melted.surfaceWaterMm).toBe(2);
  });

  it("evaporates puddles before drawing from the soil store", () => {
    const hot = air({ temperatureC: 20, relativeHumidity: 0, windKmh: 20 });
    const wet = integrateGroundHour(ground({ soilMoisture: 1, surfaceWaterMm: 5 }), hot);
    expect(wet.surfaceWaterMm).toBe(1);
    expect(wet.soilMoisture).toBe(1);
    const dry = integrateGroundHour(ground({ soilMoisture: 1, surfaceWaterMm: 1 }), hot);
    expect(dry.surfaceWaterMm).toBe(0);
    expect(dry.soilMoisture).toBeCloseTo(0.94);
  });

  it("grows moist frost, thaws it, and measures drought in hours", () => {
    const frozen = integrateGroundHour(ground(), air({ temperatureC: -12 }));
    expect(frozen.frost).toBeCloseTo(1 / 24);
    expect(integrateGroundHour(frozen, air({ temperatureC: 12 })).frost).toBe(0);
    expect(integrateGroundHour(ground({ soilMoisture: 0, dryHours: 71 }), air()).dryHours).toBe(72);
    expect(integrateGroundHour(ground({ soilMoisture: 0, dryHours: 71 }), air({ precipMmPerHour: 0.2, snowCmPerHour: 0.2 })).dryHours).toBe(0);
    expect(integrateGroundHour(ground({ dryHours: 71 }), air()).dryHours).toBe(0);
  });

  it("applies Stefan growth and linear thaw from the complete local daily mean", () => {
    let g = ground({ updatedHour: -8 });
    for (let h = 0; h < 24; h++) g = integrateGroundHour(g, air({ temperatureC: -10 }));
    expect(g.iceCm).toBeCloseTo(Math.sqrt(72));
    for (let h = 0; h < 24; h++) g = integrateGroundHour(g, air({ temperatureC: h < 12 ? -1 : 3 }));
    expect(g.iceCm).toBeCloseTo(Math.sqrt(72) - 2);
    expect(g.temperatureHours).toBe(0);
  });
});

describe("ground on one patch", () => {
  it("lies deeper on open ground than under a closed crown in the same region", () => {
    const { state, world } = newGame(42, 334);
    const region = state.player.region;
    const cells = regionAt(world, region).cells;
    const open = cells.find((cell) => cellAt(world, cell).terrain === "meadow" || cellAt(world, cell).terrain === "bog");
    // Whichever crown the region grows: spruce holds most of a snowfall off the
    // ground, pine less, birch least, and any of the three is a crown overhead.
    const crown = ["spruce", "pine", "birch"].find((t) => cells.some((cell) => cellAt(world, cell).terrain === t));
    const under = cells.find((cell) => cellAt(world, cell).terrain === crown);
    expect(open).toBeDefined();
    expect(under).toBeDefined();
    ensureGround(state, world, region).snowCm = 40;
    const cal = calendar(state.minute, state.startDoy);
    const depth = (cell: number) => conditionsAt(state, world, cal, cell).ground.snowCm;
    // One region drives both; the crown holds part of it off the ground below.
    expect(depth(under!)).toBeLessThan(depth(open!));
    expect(depth(under!)).toBeGreaterThan(0);
    expect(groundAt(state, world, region).snowCm).toBe(40);
  });

  it("stops a cached route from crossing water once its ice is no longer safe", () => {
    const { state, world } = newGame(42, 334);
    const region = state.player.region;
    const from = cellOf(state, world);
    const water = regionAt(world, region).cells.find((cell) => cellAt(world, cell).terrain === "water");
    expect(water).toBeDefined();
    for (const cell of regionAt(world, region).cells) markKnown(state, cell);
    ensureGround(state, world, region).iceCm = ICE_SAFE_CM + 5;
    const overIce = survivorRoute(state, world, from, water!);
    expect(overIce).not.toBeNull();
    const safeKey = routeConditions(state, world).key;

    ensureGround(state, world, region).iceCm = ICE_THIN_CM - 1;
    // The cache is keyed by the conditions, so the safe-ice answer cannot survive the thaw.
    expect(routeConditions(state, world).key).not.toBe(safeKey);
    expect(survivorRoute(state, world, from, water!)).toBeNull();
  });
});

describe("persistent regional weather", () => {
  it("samples one identical current-coordinate atmosphere and invalidates every physical input", () => {
    const { state, world } = newGame(42, 196);
    const sameSeedWorld = newGame(42, 196).world;
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockImplementation(() => air({ pressureHpa: 1000 + sample.mock.calls.length }));
    const cell = cellOf(state, world);

    const first = atmosphereAt(state, world, cell, 3);
    expect(atmosphereAt(state, world, cell, 3)).toEqual(first);
    first.temperatureC = 99;
    expect(atmosphereAt(state, world, cell, 3).temperatureC).toBe(0);
    expect(sample).toHaveBeenCalledTimes(1);
    state.minute++;
    atmosphereAt(state, world, cell, 3);
    atmosphereAt(state, world, cell + 1, 3);
    atmosphereAt(state, world, cell + 1, 4);
    atmosphereAt(state, sameSeedWorld, cell + 1, 4);
    state.weather.startDoy++;
    atmosphereAt(state, sameSeedWorld, cell + 1, 4);
    expect(sample).toHaveBeenCalledTimes(6);
  });

  it("keys current atmosphere by absolute weather time across a survivor rebase", () => {
    const { state, world } = newGame(42, 334);
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ temperatureC: -3 }));
    const cell = cellOf(state, world);
    state.minute = 240;
    atmosphereAt(state, world, cell, 0);
    rebaseWeather(state);
    state.startDoy += 1;
    state.minute = 0;
    expect(atmosphereAt(state, world, cell, 0).temperatureC).toBe(-3);
    expect(sample).toHaveBeenCalledTimes(1);
    state.weather.elapsedMinutes++;
    atmosphereAt(state, world, cell, 0);
    expect(sample).toHaveBeenCalledTimes(2);
  });

  it("bounds a repeated current-cell workload to one atmospheric sample", () => {
    const { state, world } = newGame(42, 196);
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ temperatureC: 7 }));
    const cell = cellOf(state, world);
    let checksum = 0;
    for (let i = 0; i < 10_000; i++) checksum += atmosphereAt(state, world, cell, 2).temperatureC;
    expect(checksum).toBe(70_000);
    expect(sample).toHaveBeenCalledTimes(1);
  });

  it("samples each alternating current coordinate once within a minute", () => {
    const { state, world } = newGame(42, 196);
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ temperatureC: 7 }));
    const cell = cellOf(state, world);
    for (let i = 0; i < 1_000; i++) {
      atmosphereAt(state, world, cell, 2);
      atmosphereAt(state, world, cell + 1, 2);
    }
    expect(sample).toHaveBeenCalledTimes(2);
    state.minute++;
    atmosphereAt(state, world, cell, 2);
    atmosphereAt(state, world, cell + 1, 2);
    expect(sample).toHaveBeenCalledTimes(4);
  });

  it("keeps distinct Object.is snow inputs within one coordinate epoch", () => {
    const { state, world } = newGame(42, 196);
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air());
    const cell = cellOf(state, world);
    atmosphereAt(state, world, cell, -0);
    atmosphereAt(state, world, cell, -0);
    atmosphereAt(state, world, cell, 0);
    expect(sample).toHaveBeenCalledTimes(2);
  });

  it("reuses current air through one minute of the advance loop", () => {
    const { state, world } = newGame(42, 196);
    ensureGround(state, world, state.player.region);
    state.minute = 1;
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ temperatureC: 7 }));
    advance(state, world, 1, { nobody: true });
    expect(sample).toHaveBeenCalledTimes(1);
  });

  it("invalidates pre-migration air when legacy cover becomes local snow", () => {
    const { state, world } = newGame(42, 196);
    state.minute = 1;
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air());
    const cell = cellOf(state, world);
    atmosphereAt(state, world, cell, 0);
    Object.assign(state.weather, { version: undefined, ground: undefined, snowCm: 17, iceCm: 0, dryDays: 0, wetDay: false });
    migrate(state);
    const lies = lying(world, cell, 17);
    expect(lies).toBeGreaterThan(0);
    expect(conditionsAt(state, world, calendar(state.minute, state.startDoy), cell).ground.snowCm).toBeCloseTo(lies, 10);
    expect(sample).toHaveBeenCalledTimes(2);
    expect(sample.mock.calls[1][0].snowCm).toBeCloseTo(lies, 10);
  });

  it("checks water and split wood at the requested remote cell", () => {
    const { state, world } = newGame(42, 196);
    const remoteRegion = regionAt(world, state.player.region).neighbours
      .map(({ id }) => regionAt(world, id))
      .find(region => region.cells.some(cell => watersideCell(world, cell)))!;
    const remoteId = remoteRegion.id;
    const remote = remoteRegion.cells.find((cell) => watersideCell(world, cell))!;
    expect(remote).toBeDefined();
    vi.spyOn(climate, "sampleAtmosphere").mockImplementation((_w, _world, _minute, x, y) =>
      air({ temperatureC: 10, precipMmPerHour: y * world.w + x === remote ? 2 : 0 }));
    ensureGround(state, world, state.player.region).iceCm = 0;
    ensureGround(state, world, remoteId).iceCm = 20;
    expect(sourceLitres(state, world, remote)).toBe(0);
    expect(splitIsWet(state, world, remote)).toBe(true);
  });
  it("reads local drought thresholds in hours", () => {
    const { state, world } = newGame(42, 196);
    const ground = ensureGround(state, world, state.player.region);
    ground.dryHours = 71;
    expect(dryGroundAt(state, world, cellOf(state, world), 3)).toBe(false);
    ground.dryHours = 72;
    expect(dryGroundAt(state, world, cellOf(state, world), 3)).toBe(true);
  });
  it("updates a cold seep and camp independently of the warm player's cell", () => {
    const { state, world } = newGame(42, 196);
    const here = cellOf(state, world);
    const remoteId = regionAt(world, state.player.region).neighbours[0].id;
    const st = regionState(state, world, remoteId);
    st.campCell = requireCamp(regionAt(world, remoteId));
    const remote = st.campCell;
    vi.spyOn(climate, "sampleAtmosphere").mockImplementation((_w, _world, _minute, x, y) =>
      air({ temperatureC: y * world.w + x === remote ? -12 : 20 }));
    state.seeps[here] = { class: "bog", dug: 0, litres: 5, ice: 0 };
    state.seeps[remote] = { class: "bog", dug: 0, litres: 5, ice: 0 };
    stepSeeps(state, world, 20, 1);
    expect(state.seeps[here].litres).toBeGreaterThan(5);
    expect(state.seeps[remote].ice).toBe(5);
    addItem(pile(state, remote), "water", 3);
    hourlyWorld(state, world, calendar(0, 196), 20, new Rng(1), null);
    expect(qty(pile(state, remote), "ice")).toBe(3);
  });

  it("does not sample local weather for a pile with nothing that can dry or spoil", () => {
    const { state, world } = newGame(42, 196);
    const dryCell = cellOf(state, world) + 10;
    const spoilCell = dryCell + 1;
    addItem(pile(state, dryCell), "firewood", 1);
    addItem(pile(state, spoilCell), "firewood", 1);
    ensureGround(state, world, state.player.region);
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ temperatureC: 7 }));
    stepCamp(state, world, 7, 1, null);
    const sampled = (cell: number) => sample.mock.calls.some((call) => call[3] === cell % world.w && call[4] === Math.floor(cell / world.w));
    expect(sampled(dryCell)).toBe(false);
    expect(sampled(spoilCell)).toBe(false);

    addItem(pile(state, dryCell), "wetFirewood", 1);
    addItem(pile(state, spoilCell), "rawMeat", 1);
    state.minute++;
    stepCamp(state, world, 7, 1, null);
    expect(sampled(dryCell)).toBe(true);
    expect(sampled(spoilCell)).toBe(true);
  });

  it("detects a local cold snap for the seasonal journal", () => {
    vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ temperatureC: -25 }));
    const { state, world } = newGame(42, 15);
    stepSpine(state, calendar(0, 15), null, world);
    expect(state.spine.fired.coldSnap).toBeDefined();
  });

  it("keeps atmosphere and ground continuous when a new survivor rebases the run clock", () => {
    const { state, world } = newGame(42, 334);
    state.minute = 3 * 1440;
    ensureGround(state, world, state.player.region);
    const before = conditionsAt(state, world, calendar(state.minute, state.startDoy), cellOf(state, world));
    rebaseWeather(state);
    state.startDoy += 3;
    state.minute = 0;
    expect(conditionsAt(state, world, calendar(0, state.startDoy), cellOf(state, world))).toEqual(before);
  });
  it("uses the target cell's snow for task legality instead of the player's old global cover", () => {
    const { state, world } = newGame(42, 334);
    siteCamp(state, world);
    state.weather.snowCm = 0;
    // Deep enough to build in where the survivor stands, whatever this patch's
    // crown and exposure take off the region's cover.
    ensureGround(state, world, state.player.region).snowCm = 45 / patchGroundModifiers(world, cellOf(state, world)).snow;
    expect(check(state, world, calendar(0, 334), "build", "snowShelter").ok).toBe(true);
  });

  it("burns distant camp fuel and freezes its water from that camp's local cold", () => {
    const { state, world } = newGame(42, 15);
    const id = regionAt(world, state.player.region).neighbours[0].id;
    const st = regionState(state, world, id);
    st.campCell = requireCamp(regionAt(world, id));
    siteFor(st, st.campCell).structures.firePit = true;
    const air = conditionsAt(state, world, calendar(0, 15), st.campCell);
    expect(air.temperatureC).toBeLessThan(-1);
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    stepCamp(state, world, 30, 60, null);
    expect(st.fire.fuelKg).toBeLessThan(8);
    st.fire.lit = false;
    addItem(pile(state, st.campCell), "water", 3);
    hourlyWorld(state, world, calendar(0, 15), 30, new Rng(1), null);
    expect(qty(pile(state, st.campCell), "water")).toBe(0);
    expect(qty(pile(state, st.campCell), "ice")).toBe(3);
  });
  it("advances local conditions without legacy random weather rolls", () => {
    const { state, world } = newGame(42, 196);
    state.weather.offset = -100;
    state.weather.precip = "heavy";
    state.weather.storm = { id: 1, source: "synthetic", kind: "rain", from: 0, until: 9999, warned: false };
    state.minute = 59;
    advance(state, world, 1, { nobody: true });
    expect(state.weather.ground[state.player.region].updatedHour).toBe(1);
    // Nobody observes the player-local compatibility facade. Its stale fields
    // remain inert while authoritative regional ground still advances.
    expect(state.weather.offset).toBe(-100);
    expect(state.weather.storm?.until).toBe(9999);
  });

  it("freezes each seep from its own air even when the caller supplies warm air", () => {
    const { state, world } = newGame(42, 15);
    const cell = cellOf(state, world);
    expect(conditionsAt(state, world, calendar(0, 15), cell).temperatureC).toBeLessThan(-1);
    state.seeps[cell] = { class: "bog", dug: 0, litres: 5, ice: 0 };
    stepSeeps(state, world, 30, 1);
    expect(state.seeps[cell].litres).toBe(0);
    expect(state.seeps[cell].ice).toBe(5);
  });

  it("catches dormant ground up identically to hourly visits without consuming game rng", () => {
    const { state, world } = newGame(42, 334);
    const dormant = structuredClone(state);
    const rng = state.rng;
    for (let hour = 1; hour <= 72; hour++) {
      state.minute = hour * 60;
      ensureGround(state, world, state.player.region);
    }
    dormant.minute = 72 * 60;
    expect(ensureGround(dormant, world, dormant.player.region)).toEqual(ensureGround(state, world, state.player.region));
    expect(state.rng).toBe(rng);
    expect(dormant.rng).toBe(rng);
  });

  it("reads a distinct region's ground and atmosphere without materializing or writing state", () => {
    const { state, world } = newGame(42, 334);
    const here = cellOf(state, world);
    const other = regionAt(world, state.player.region).neighbours[0].id;
    const cell = requireCamp(regionAt(world, other));
    ensureGround(state, world, state.player.region).snowCm = 43;
    ensureGround(state, world, other).snowCm = 3;
    const before = serialize(state, 0);
    expect(conditionsAt(state, world, calendar(state.minute, state.startDoy), here).ground.snowCm).toBeCloseTo(lying(world, here, 43), 10);
    expect(conditionsAt(state, world, calendar(state.minute, state.startDoy), cell).ground.snowCm).toBeCloseTo(lying(world, cell, 3), 10);
    expect(groundAt(state, world, other).snowCm).toBe(3);
    expect(serialize(state, 0)).toBe(before);
  });

  it("replays one unmaterialized region only once within the same absolute hour", () => {
    const { state, world } = newGame(42, 334);
    const other = regionAt(world, state.player.region).neighbours[0].id;
    state.minute = 10 * 1440;
    const before = serialize(state, 0);
    const original = climate.sampleAtmosphere;
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockImplementation(original);
    const first = groundAt(state, world, other);
    const expected = { ...first };
    const replayCalls = sample.mock.calls.length;
    expect(replayCalls).toBeGreaterThan(200);
    first.snowCm = 999;
    expect(groundAt(state, world, other)).toEqual(expected);
    expect(sample).toHaveBeenCalledTimes(replayCalls);
    expect(state.weather.ground[other]).toBeUndefined();
    expect(serialize(state, 0)).toBe(before);
  });

  it("advances an absent-region shadow once per new hour despite changing facade snow", () => {
    const { state, world } = newGame(42, 334);
    const other = regionAt(world, state.player.region).neighbours[0].id;
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air());
    groundAt(state, world, other);
    for (let hour = 1; hour <= 72; hour++) {
      state.minute = hour * 60;
      state.weather.snowCm = hour / 10;
      groundAt(state, world, other);
    }
    expect(sample).toHaveBeenCalledTimes(73);
    expect(state.weather.ground[other]).toBeUndefined();
  });

  it("resets absent-ground reads on every physical epoch input and bypasses them once stored", () => {
    const { state, world } = newGame(42, 334);
    const sameSeedWorld = newGame(42, 334).world;
    const other = regionAt(world, state.player.region).neighbours[0].id;
    state.minute = 1;
    const sample = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air());
    groundAt(state, world, other);
    expect(sample).toHaveBeenCalledTimes(1);

    rebaseWeather(state);
    state.startDoy++;
    state.minute = 0;
    groundAt(state, world, other);
    expect(sample).toHaveBeenCalledTimes(1);

    state.minute = 60;
    groundAt(state, world, other);
    expect(sample).toHaveBeenCalledTimes(2);
    groundAt(state, sameSeedWorld, other);
    expect(sample).toHaveBeenCalledTimes(4);
    sameSeedWorld.seed++;
    groundAt(state, sameSeedWorld, other);
    expect(sample).toHaveBeenCalledTimes(6);
    state.weather.startDoy++;
    groundAt(state, sameSeedWorld, other);
    expect(sample).toHaveBeenCalledTimes(8);
    state.weather.snowCm = 1;
    groundAt(state, sameSeedWorld, other);
    // The facade snow reading is copied from the player's local ground every
    // minute. It is not an input to an absent region's seeded trajectory.
    expect(sample).toHaveBeenCalledTimes(8);

    sample.mockRestore();
    const replacement = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air());
    groundAt(state, sameSeedWorld, other);
    expect(replacement).toHaveBeenCalledTimes(2);
    state.weather.ground[other] = ground({ updatedHour: 1, snowCm: 77 });
    expect(groundAt(state, sameSeedWorld, other).snowCm).toBe(77);
    expect(replacement).toHaveBeenCalledTimes(2);
  });

  it("matches fresh jump-ahead replay and never returns a future shadow to a past query", () => {
    const cached = newGame(42, 334);
    const other = regionAt(cached.world, cached.state.player.region).neighbours[0].id;
    cached.state.weather.snowCm = 0;
    groundAt(cached.state, cached.world, other);
    cached.state.minute = 72 * 60;
    const later = groundAt(cached.state, cached.world, other);

    const freshLater = newGame(42, 334);
    freshLater.state.weather.snowCm = 0;
    freshLater.state.minute = 72 * 60;
    expect(later).toEqual(groundAt(freshLater.state, freshLater.world, other));

    cached.state.minute = 24 * 60;
    const past = groundAt(cached.state, cached.world, other);
    const freshPast = newGame(42, 334);
    freshPast.state.weather.snowCm = 0;
    freshPast.state.minute = 24 * 60;
    expect(past).toEqual(groundAt(freshPast.state, freshPast.world, other));
    cached.state.minute = 72 * 60;
    expect(groundAt(cached.state, cached.world, other)).toEqual(later);
  });

  it("migrates legacy persistent cover into every materialized region and keeps v2 data on reload", () => {
    const { state, world } = newGame(42);
    const other = regionAt(world, state.player.region).neighbours[0].id;
    state.regions[other] = structuredClone(state.regions[state.player.region]);
    state.minute = 185;
    const rng = state.rng;
    Object.assign(state.weather, { version: undefined, ground: undefined, snowCm: 17, iceCm: 23, dryDays: 9, wetDay: true });
    migrate(state);
    for (const id of [state.player.region, other]) {
      expect(state.weather.ground[id]).toMatchObject({ snowCm: 17, iceCm: 23, dryHours: 216, updatedHour: 3, soilMoisture: 0.5, frost: 0 });
      expect(state.weather.ground[id].surfaceWaterMm).toBeGreaterThan(0);
    }
    state.weather.ground[other].snowCm = 29;
    expect(readSave(serialize(state))!.state.weather.ground[other].snowCm).toBe(29);
    expect(state.rng).toBe(rng);
  });
});
