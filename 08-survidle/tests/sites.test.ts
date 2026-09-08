import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { BOUGH_BED_DAYS, STRUCTURE_LIFE_DAYS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { feltTemperature, INDOOR_C } from "../src/sim/player";
import { campSite, newSite, regionState, siteAt, siteFor } from "../src/sim/regionstate";
import { migrate } from "../src/sim/save";

describe("sites", () => {
  it("a fresh region has no sites and no structures anywhere", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(Object.keys(st.sites)).toHaveLength(0);
    expect(siteAt(st, st.campCell)).toBeNull();
    expect(st.snares).toBe(0);
  });

  it("siteFor creates once and returns the same record", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const a = siteFor(st, st.campCell);
    a.structures.firePit = true;
    const b = siteFor(st, st.campCell);
    expect(b).toBe(a);
    expect(siteAt(st, st.campCell)!.structures.firePit).toBe(true);
    expect(Object.keys(st.sites)).toHaveLength(1);
  });

  it("siteAt never creates", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(siteAt(st, st.campCell + 1)).toBeNull();
    expect(Object.keys(st.sites)).toHaveLength(0);
  });

  it("campSite reads the camp cell", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell).structures.leanTo = true;
    expect(campSite(st)!.structures.leanTo).toBe(true);
  });

  it("campSite returns null with nothing built, and does not create", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(campSite(st)).toBeNull();
    expect(Object.keys(st.sites)).toHaveLength(0);
  });

  it("newSite starts blank", () => {
    const s = newSite();
    expect(s.structures.firePit).toBe(false);
    expect(s.racks).toBe(0);
    expect(s.structureAge).toEqual({});
    expect(s.build).toEqual({});
  });

  it("lifts a pre-sites save into one site at the old camp", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    delete st.sites;
    delete st.snares;
    st.structures = { firePit: true, leanTo: true, cabin: false, dryingRack: true, snares: 3, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    st.racks = 2;
    st.boughBedAge = 0;
    st.meltDays = 0;
    st.structureAge = { leanTo: 5000, dryingRack: 100 };
    st.build = { turfHut: 60 };
    migrate(state);
    const live = regionState(state, world, state.player.region);
    const site = siteAt(live, live.campCell)!;
    expect(site.structures.firePit).toBe(true);
    expect(site.structures.leanTo).toBe(true);
    expect(site.racks).toBe(2);
    expect(site.structureAge.leanTo).toBe(5000);
    expect(site.build.turfHut).toBe(60);
    expect(live.snares).toBe(3);
    expect((live as unknown as Record<string, unknown>).structures).toBeUndefined();
  });

  it("a save from before racks were counted recovers one rack from a standing drying rack", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    delete st.sites;
    delete st.snares;
    st.structures = { firePit: false, leanTo: false, cabin: false, dryingRack: true, snares: 0, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    // No racks field at all: the shape a save had before racks were counted separately.
    st.boughBedAge = 0;
    st.meltDays = 0;
    st.structureAge = {};
    st.build = {};
    migrate(state);
    const live = regionState(state, world, state.player.region);
    expect(siteAt(live, live.campCell)!.racks).toBe(1);
  });

  it("a touched but unlived region migrates to no site", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    delete st.sites;
    st.structures = { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    st.build = {};
    migrate(state);
    expect(Object.keys(regionState(state, world, state.player.region).sites)).toHaveLength(0);
  });

  it("a site away from the camp ages and falls on its own clock", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell + 1;
    const site = siteFor(st, away);
    site.structures.leanTo = true;
    site.structureAge.leanTo = STRUCTURE_LIFE_DAYS.leanTo * 1440 - 1440;
    const cal = calendar(state.minute, state.startDoy);
    dailyCamp(state, world, cal, new Rng(1), { region: state.player.region, atCamp: true });
    expect(siteAt(st, away)!.structures.leanTo).toBe(false);
    expect(state.log.some((e) => e.text.includes("fallen in"))).toBe(true);
  });

  it("a bough bed away from the camp goes flat on its own clock", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell + 1;
    const site = siteFor(st, away);
    site.structures.boughBed = true;
    site.boughBedAge = BOUGH_BED_DAYS * 1440 - 1440;
    dailyCamp(state, world, calendar(state.minute, state.startDoy), new Rng(1), { region: state.player.region, atCamp: true });
    expect(siteAt(st, away)!.structures.boughBed).toBe(false);
  });

  it("an abandoned lean-to shelters whoever sleeps under it", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell + 1;
    siteFor(st, away).structures.leanTo = true;
    placeAt(state, world, away);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    const under = feltTemperature(state, world, 0);
    placeAt(state, world, st.campCell);
    const open = feltTemperature(state, world, 0);
    expect(under).toBeGreaterThan(open);
  });

  it("bare ground gives no roof", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const bare = st.campCell + 2;
    placeAt(state, world, bare);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    const onBareGround = feltTemperature(state, world, 0);
    placeAt(state, world, st.campCell);
    expect(feltTemperature(state, world, 0)).toBe(onBareGround);
    expect(siteAt(st, bare)).toBeNull();
  });

  it("an indoor fire warms only the camp's own hut, not a second hut elsewhere", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell).structures.turfHut = true;
    st.fire.lit = true;
    st.fire.indoors = true;
    const away = st.campCell + 1;
    siteFor(st, away).structures.turfHut = true;
    placeAt(state, world, away);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    const atAwayHut = feltTemperature(state, world, -30);
    placeAt(state, world, st.campCell);
    const atCampHut = feltTemperature(state, world, -30);
    // The away hut is a passive roof only: no fire burns there, so the room-temperature
    // floor the camp's indoor fire gives must not follow the survivor to a second hut.
    expect(atAwayHut).toBeLessThan(atCampHut);
    expect(atAwayHut).toBeLessThan(INDOOR_C.turfHut);
  });
});
