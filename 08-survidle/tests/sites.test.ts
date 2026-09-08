import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
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
    campSite(st).structures.leanTo = true;
    expect(siteAt(st, st.campCell)!.structures.leanTo).toBe(true);
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

  it("a touched but unlived region migrates to no site", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    delete st.sites;
    st.structures = { firePit: false, leanTo: false, cabin: false, dryingRack: false, snares: 0, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    st.build = {};
    migrate(state);
    expect(Object.keys(regionState(state, world, state.player.region).sites)).toHaveLength(0);
  });
});
