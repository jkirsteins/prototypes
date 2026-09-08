import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { BOUGH_BED_DAYS, STRUCTURE_LIFE_DAYS } from "../src/sim/items";
import { beginAgain, land } from "../src/sim/landing";
import { knownShare } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { atCamp, campCellOf, cellOf, placeAt } from "../src/sim/position";
import { die, feltTemperature, INDOOR_C, sheltered } from "../src/sim/player";
import { campSite, newSite, regionState, siteAt, siteFor } from "../src/sim/regionstate";
import { migrate } from "../src/sim/save";
import { MAX_SNARES } from "../src/sim/items";
import { beginTask, check, NO_CAMP } from "../src/sim/tasks";
import { advance } from "../src/sim/advance";
import { doHtml } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";
import { regionAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

describe("the landing reads the ground it chooses on", () => {
  it("the first survivor lands with the region mapped and no camp", () => {
    const { state, world } = newGame(2);
    expect(regionState(state, world, state.player.region).campCell).toBeNull();
    expect(knownShare(state, world, state.player.region)).toBe(1);
  });

  it("an heir lands with no camp while the ancestor's camp still stands", () => {
    const { state, world } = newGame(2);
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "makeCamp")).toBe(true);
    advance(state, world, 20);
    const home = state.player.region;
    const homeCamp = regionState(state, world, home).campCell!;
    siteFor(regionState(state, world, home), homeCamp).structures.leanTo = true;
    die(state, "froze", regionAt(world, home).name);
    beginAgain(state, world);
    land(state, world, { first: "Test", last: "Name" });
    expect(regionState(state, world, home).campCell).toBe(homeCamp);
    expect(siteAt(regionState(state, world, home), homeCamp)!.structures.leanTo).toBe(true);
    if (state.player.region !== home) expect(regionState(state, world, state.player.region).campCell).toBeNull();
  });
});

describe("no camp until one is made", () => {
  it("a region never lived in has no camp", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(st.campCell).toBeNull();
    expect(campCellOf(state, world)).toBeNull();
    expect(atCamp(state, world)).toBe(false);
  });

  it("camp work says there is no camp yet", () => {
    const { state, world } = newGame(2);
    const cal = calendar(state.minute, state.startDoy);
    const o = check(state, world, cal, "night");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("no camp");
  });

  it("making camp gives the region its first camp", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    const here = cellOf(state, world);
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "makeCamp")).toBe(true);
    advance(state, world, 20);
    expect(st.campCell).toBe(here);
    expect(atCamp(state, world)).toBe(true);
  });

  it("the Do panel offers the siting and refuses the camp work, with no confirm to click through", () => {
    const { state, world } = newGame(2);
    const cal = calendar(state.minute, state.startDoy);
    const html = doHtml(state, world, cal, newUiState());
    expect(html).toContain("Make camp here");
    expect(html).toContain("no camp here yet");
    // The confirm is for moving a camp; there is none to move, so the row does not ask.
    expect(doHtml(state, world, cal, { ...newUiState(), confirmCamp: true })).not.toContain("Move camp here?");
  });

  it("every camp-addressed task refuses in the same words", () => {
    const { state, world } = newGame(2);
    const cal = calendar(state.minute, state.startDoy);
    for (const id of ["night", "wait", "haul", "hang", "melt", "thaw", "light", "lightIndoors", "cook"] as const) {
      const o = check(state, world, cal, id);
      expect(o.ok, id).toBe(false);
      expect(o.why, id).toBe(NO_CAMP);
    }
    expect(check(state, world, cal, "build", "leanTo").why).toBe(NO_CAMP);
  });

  it("snares still catch with no camp sited", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    expect(st.campCell).toBeNull();
    st.snares = MAX_SNARES;
    st.pop.hare = 50;
    for (let d = 0; d < 20; d++) {
      dailyCamp(state, world, calendar(state.minute, state.startDoy), new Rng(d), { region: state.player.region, atCamp: false });
    }
    expect(st.snareCatch.count).toBeGreaterThan(0);
  });
});

describe("sites", () => {
  it("a fresh region has no sites and no structures anywhere", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    expect(Object.keys(st.sites)).toHaveLength(0);
    expect(siteAt(st, st.campCell!)).toBeNull();
    expect(st.snares).toBe(0);
  });

  it("siteFor creates once and returns the same record", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const a = siteFor(st, st.campCell!);
    a.structures.firePit = true;
    const b = siteFor(st, st.campCell!);
    expect(b).toBe(a);
    expect(siteAt(st, st.campCell!)!.structures.firePit).toBe(true);
    expect(Object.keys(st.sites)).toHaveLength(1);
  });

  it("siteAt never creates", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    expect(siteAt(st, st.campCell! + 1)).toBeNull();
    expect(Object.keys(st.sites)).toHaveLength(0);
  });

  it("campSite reads the camp cell", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.leanTo = true;
    expect(campSite(st)!.structures.leanTo).toBe(true);
  });

  it("campSite returns null with nothing built, and does not create", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
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
    siteCamp(state, world);
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
    const site = siteAt(live, live.campCell!)!;
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
    siteCamp(state, world);
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
    expect(siteAt(live, live.campCell!)!.racks).toBe(1);
  });

  it("a touched but unlived region migrates to no site", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    delete st.sites;
    st.structures = { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    st.build = {};
    migrate(state);
    expect(Object.keys(regionState(state, world, state.player.region).sites)).toHaveLength(0);
  });

  it("a site away from the camp ages and falls on its own clock", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell! + 1;
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
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell! + 1;
    const site = siteFor(st, away);
    site.structures.boughBed = true;
    site.boughBedAge = BOUGH_BED_DAYS * 1440 - 1440;
    dailyCamp(state, world, calendar(state.minute, state.startDoy), new Rng(1), { region: state.player.region, atCamp: true });
    expect(siteAt(st, away)!.structures.boughBed).toBe(false);
  });

  it("an abandoned lean-to shelters whoever sleeps under it", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell! + 1;
    siteFor(st, away).structures.leanTo = true;
    placeAt(state, world, away);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    const under = feltTemperature(state, world, 0);
    placeAt(state, world, st.campCell!);
    const open = feltTemperature(state, world, 0);
    expect(under).toBeGreaterThan(open);
  });

  it("an abandoned lean-to keeps the rain off too, not only the cold out", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const away = st.campCell! + 1;
    siteFor(st, away).structures.leanTo = true;
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    placeAt(state, world, away);
    // A roof that warms you but does not keep the rain off is not a roof: sheltered
    // reads the same place feltTemperature does, so both answer for the cell underfoot.
    expect(sheltered(state, world)).toBe(true);
    placeAt(state, world, st.campCell!);
    expect(sheltered(state, world)).toBe(false);
  });

  it("bare ground gives no roof", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const bare = st.campCell! + 2;
    placeAt(state, world, bare);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    const onBareGround = feltTemperature(state, world, 0);
    placeAt(state, world, st.campCell!);
    expect(feltTemperature(state, world, 0)).toBe(onBareGround);
    expect(siteAt(st, bare)).toBeNull();
  });

  it("an indoor fire warms only the camp's own hut, not a second hut elsewhere", () => {
    const { state, world } = newGame(2);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.turfHut = true;
    st.fire.lit = true;
    st.fire.indoors = true;
    const away = st.campCell! + 1;
    siteFor(st, away).structures.turfHut = true;
    placeAt(state, world, away);
    state.task = { id: "sleep", progress: 0, duration: 480, repeat: false };
    const atAwayHut = feltTemperature(state, world, -30);
    placeAt(state, world, st.campCell!);
    const atCampHut = feltTemperature(state, world, -30);
    // The away hut is a passive roof only: no fire burns there, so the room-temperature
    // floor the camp's indoor fire gives must not follow the survivor to a second hut.
    expect(atAwayHut).toBeLessThan(atCampHut);
    expect(atAwayHut).toBeLessThan(INDOOR_C.turfHut);
  });
});
