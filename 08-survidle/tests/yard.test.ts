import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { newGame } from "../src/sim/newgame";
import { orderByHand, orderGate } from "../src/sim/ladder";
import { levelMinutes } from "../src/sim/skills";
import type { IntentRequest } from "../src/sim/types";
import { addOrder, removeOrderByHand } from "../src/sim/orders";
import { regionState, siteAt, siteFor } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { calendar } from "../src/sim/calendar";
import { migrate, migrateSites } from "../src/sim/save";
import { campHtml } from "../src/ui/panels";
import { clearM2PerHour, FOOTPRINT_M2, YARD_START_M2, yardFree, yardUsed } from "../src/sim/yard";
import { siteCamp } from "./siting-helpers";

describe("the yard", () => {
  it("gates counted yard clearing on Building instead of throwing for a missing skill", () => {
    const { state } = newGame(21);
    const req: IntentRequest = { task: "widenYard", until: { kind: "times", n: 2 }, deliver: "leave", where: "nearest" };
    expect(orderGate(state, req, "job")).toMatchObject({ ok: false, skill: "building", at: 3 });
    state.skills.building.xp = levelMinutes(3);
    expect(orderGate(state, req, "job")).toEqual({ ok: true });
  });

  it("counts what stands on the ground and nothing that does not", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.structures.firePit = true;      // 4
    site.structures.leanTo = true;       // 6
    site.structures.boughBed = true;     // inside the lean-to, no ground of its own
    site.racks = 2;                      // 4 each
    site.woodsheds = 1;                  // 6
    expect(yardUsed(site)).toBe(24);
    expect(yardFree(site)).toBe(YARD_START_M2 - 24);
  });

  it("reads its clearing rate off the fire site's own minutes", () => {
    // The fire site is 4 m2: 20 minutes on meadow, 30 under spruce, 60 on peat.
    expect(clearM2PerHour("meadow", 0)).toBe(12);
    expect(clearM2PerHour("spruce", 0)).toBe(8);
    expect(clearM2PerHour("bog", 0)).toBe(4);
  });

  it("blocks a build that does not fit and says how much ground it wants", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.yardM2 = FOOTPRINT_M2.cabin! - 1;
    const o = check(state, world, calendar(state.minute, state.startDoy), "build", "cabin");
    expect(o.ok).toBe(false);
    expect(o.why).toContain("yard");
  });
});

describe("a camp from before the yard", () => {
  it("keeps everything it built, because its yard is at least what stands on it", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.structures.cabin = true;
    site.structures.firePit = true;
    site.racks = 2;
    // What a save written before the field carries.
    delete (site as Partial<typeof site>).yardM2;
    const revived = JSON.parse(JSON.stringify({ ...state })) as typeof state;
    migrateSites(revived);
    const after = revived.regions[state.player.region].sites[st.campCell!];
    expect(after.yardM2).toBeGreaterThanOrEqual(yardUsed(after));
  });

  it("keeps a heavily built camp possible when lifted from the older flat-structures format", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region) as unknown as Record<string, unknown>;
    // The shape a save had before sites existed: one camp's structures flat on the region.
    delete st.sites;
    delete st.snares;
    st.structures = { firePit: true, leanTo: true, cabin: true, dryingRack: true, snares: 0, boughBed: false, hearth: false, turfHut: false, waterStore: false, snowShelter: false };
    st.racks = 2;
    st.boughBedAge = 0;
    st.meltDays = 0;
    st.structureAge = {};
    st.build = {};
    migrate(state);
    const live = regionState(state, world, state.player.region);
    const site = siteAt(live, live.campCell!)!;
    expect(site.yardM2).toBeGreaterThanOrEqual(yardUsed(site));
  });
});

describe("a planned build", () => {
  it("stands on the camp sheet with its blockers before any work is done", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    orderByHand(state, world, cal, new Rng(1), { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: { cell: regionState(state, world, state.player.region).campCell! } }, "job");
    const html = campHtml(state, world, cal);
    expect(html).toContain("vedbod");
    expect(html).toContain("planned");
    expect(html).toContain("logs");
  });

  it("leaves no trace when the order is struck off before any work is done, the way it did before an order raised the entry", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    const req = { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: { cell: st.campCell! } } as const;
    const order = orderByHand(state, world, cal, new Rng(1), req, "job");
    // removeOrderByHand is the mutator behind the "order-remove" UI action (main.ts), not a lower-level helper.
    removeOrderByHand(state, world, cal, new Rng(2), order.id);
    expect(siteAt(st, st.campCell!)?.build.vedbod).toBeUndefined();
    expect(campHtml(state, world, cal)).not.toContain("vedbod");
  });

  it("keeps real progress when the order behind it is struck off", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    const req = { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: { cell: st.campCell! } } as const;
    const order = orderByHand(state, world, cal, new Rng(1), req, "job");
    // Stands in for minutes the survivor actually banked before the order was struck off: sunk work, not a plan.
    siteFor(st, st.campCell!).build.vedbod = 42;
    removeOrderByHand(state, world, cal, new Rng(2), order.id);
    expect(siteAt(st, st.campCell!)!.build.vedbod).toBe(42);
  });

  it("keeps the entry while a second order still wants the same structure", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    const req = { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: { cell: st.campCell! } } as const;
    const first = orderByHand(state, world, cal, new Rng(1), req, "job");
    // The same click again would count the first row up rather than add a
    // second, so the second wanter is a counted job, a row of its own.
    addOrder(state, world, { ...req, until: { kind: "times", n: 2 } }, "job");
    removeOrderByHand(state, world, cal, new Rng(3), first.id);
    expect(siteAt(st, st.campCell!)?.build.vedbod).toBe(0);
  });
});
