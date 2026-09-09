import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { COVER_CEILING, findCover, protectionOf, PROTECTION_WORDS } from "../src/sim/shelter";
import { check, startTask, stepTask } from "../src/sim/tasks";
import type { Terrain } from "../src/sim/types";
import { cellAt } from "../src/world/gen";

type Game = ReturnType<typeof newGame>;

function cellWith({ world }: Game, terrain: Terrain): number {
  for (let cell = 0; cell < world.w * world.h; cell++) if (cellAt(world, cell).terrain === terrain) return cell;
  throw new Error(`no ${terrain} cell in world`);
}

function finishTask(g: Game): void {
  const duration = g.state.task?.duration ?? 0;
  stepTask(g.state, g.world, calendar(g.state.minute, g.state.startDoy), new Rng(1), duration);
}

describe("protection", () => {
  it("reads nothing as open ground", () => {
    expect(protectionOf(null)).toBe(0);
    expect(PROTECTION_WORDS[0]).toBe("open ground");
  });

  it("puts the existing structures on the scale they already imply", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell ?? 0);
    expect(protectionOf(site)).toBe(0);
    site.structures.snowShelter = true;
    expect(protectionOf(site)).toBe(2);
    site.structures.leanTo = true;
    expect(protectionOf(site)).toBe(2);
    site.structures.turfHut = true;
    expect(protectionOf(site)).toBe(3);
  });

  it("finds cover by terrain and never above the ceiling", () => {
    expect(COVER_CEILING.rock).toBe(2);
    expect(COVER_CEILING.spruce).toBe(2);
    expect(COVER_CEILING.pine).toBe(1);
    expect(COVER_CEILING.meadow).toBe(0);
    expect(COVER_CEILING.bog).toBe(0);
    expect(COVER_CEILING.fell).toBe(0);
  });

  it("lets skill find no more than the ground holds", () => {
    const g = newGame(17);
    expect(findCover(g.world, cellWith(g, "rock"), 1)).toBe(1);
    expect(findCover(g.world, cellWith(g, "rock"), 5)).toBe(2);
    expect(findCover(g.world, cellWith(g, "pine"), 50)).toBe(1);
    expect(findCover(g.world, cellWith(g, "meadow"), 50)).toBe(0);
  });

  it("keeps the better of found cover and a structure", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, cellOf(state, world));
    site.cover = 2;
    expect(protectionOf(site)).toBe(2);
    site.structures.cabin = true;
    expect(protectionOf(site)).toBe(3);
  });

  it("keeps level-three found cover at its true maximum", () => {
    const { state, world } = newGame(17);
    const site = siteFor(regionState(state, world, state.player.region), cellOf(state, world));
    site.cover = 3;
    expect(protectionOf(site)).toBe(3);
  });
});

describe("finding shelter", () => {
  it("looks on open ground, spends the time and says that it found nothing", () => {
    const g = newGame(17);
    const meadow = cellWith(g, "meadow");
    placeAt(g.state, g.world, meadow);
    const cal = calendar(g.state.minute, g.state.startDoy);
    const option = check(g.state, g.world, cal, "findShelter");
    expect(option.ok, option.why).toBe(true);
    expect(option.duration).toBe(26);
    expect(startTask(g.state, g.world, cal, "findShelter")).toBe(true);
    finishTask(g);
    const site = siteFor(regionState(g.state, g.world, g.state.player.region), meadow);
    expect(site.cover).toBe(0);
    expect(site.coverAge).toBe(0);
    expect(g.state.log.some((entry) => /nothing|no (?:shelter|cover)/i.test(entry.text))).toBe(true);
  });

  it("finds the ceiling on rock and spruce at the temporary level floor", () => {
    for (const terrain of ["rock", "spruce"] as const) {
      const g = newGame(17);
      const cell = cellWith(g, terrain);
      placeAt(g.state, g.world, cell);
      const cal = calendar(g.state.minute, g.state.startDoy);
      expect(startTask(g.state, g.world, cal, "findShelter")).toBe(true);
      finishTask(g);
      const site = siteFor(regionState(g.state, g.world, g.state.player.region), cell);
      expect(site.cover, terrain).toBe(2);
      expect(site.coverAge).toBe(0);
    }
  });

  it("is refused only on impassable water", () => {
    const g = newGame(17);
    placeAt(g.state, g.world, cellWith(g, "water"));
    expect(check(g.state, g.world, calendar(0), "findShelter").ok).toBe(false);
  });

  it("credits the roof deed only when the search first reaches weatherproof protection", () => {
    const fresh = newGame(17);
    const rock = cellWith(fresh, "rock");
    placeAt(fresh.state, fresh.world, rock);
    expect(startTask(fresh.state, fresh.world, calendar(0), "findShelter")).toBe(true);
    finishTask(fresh);
    expect(fresh.state.goals.done.roof).toBe(true);

    const known = newGame(17);
    const knownRock = cellWith(known, "rock");
    placeAt(known.state, known.world, knownRock);
    siteFor(regionState(known.state, known.world, known.state.player.region), knownRock).cover = 2;
    expect(startTask(known.state, known.world, calendar(0), "findShelter")).toBe(true);
    finishTask(known);
    expect(known.state.goals.done.roof).toBeUndefined();
  });

  it("binds an order to its named cell and otherwise searches underfoot", async () => {
    const { resolveCell } = await import("../src/sim/intent");
    const g = newGame(17);
    const here = cellOf(g.state, g.world);
    const named = cellWith(g, "rock");
    expect(resolveCell(g.state, g.world, calendar(0), "findShelter", undefined, "nearest").cell).toBe(here);
    expect(resolveCell(g.state, g.world, calendar(0), "findShelter", undefined, { cell: named }).cell).toBe(named);
  });

  it("does not clear an unrelated shopping target", () => {
    const g = newGame(17);
    const rock = cellWith(g, "rock");
    placeAt(g.state, g.world, rock);
    g.state.shopping = { task: "craft", arg: "knife" };
    expect(startTask(g.state, g.world, calendar(0), "findShelter")).toBe(true);
    finishTask(g);
    expect(g.state.shopping).toEqual({ task: "craft", arg: "knife" });
  });
});

describe("improving shelter", () => {
  it("works found pine cover to weatherproof in 30 effective minutes", () => {
    const g = newGame(17);
    const pine = cellWith(g, "pine");
    placeAt(g.state, g.world, pine);
    const site = siteFor(regionState(g.state, g.world, g.state.player.region), pine);
    site.cover = 1;
    site.coverAge = 123;
    const cal = calendar(g.state.minute, g.state.startDoy);

    expect(check(g.state, g.world, cal, "improveCover")).toMatchObject({ ok: true, duration: 30 });
    expect(startTask(g.state, g.world, cal, "improveCover")).toBe(true);
    finishTask(g);

    expect(site.cover).toBe(2);
    expect(site.coverAge).toBe(0);
    expect(g.state.goals.done.roof).toBe(true);
  });

  it("works found rock cover to liveable in 75 effective minutes without repeating the roof deed", () => {
    const g = newGame(17);
    const rock = cellWith(g, "rock");
    placeAt(g.state, g.world, rock);
    const site = siteFor(regionState(g.state, g.world, g.state.player.region), rock);
    site.cover = 2;
    site.coverAge = 456;
    const cal = calendar(g.state.minute, g.state.startDoy);

    expect(check(g.state, g.world, cal, "improveCover")).toMatchObject({ ok: true, duration: 75 });
    expect(startTask(g.state, g.world, cal, "improveCover")).toBe(true);
    finishTask(g);

    expect(site.cover).toBe(3);
    expect(site.coverAge).toBe(0);
    expect(g.state.goals.done.roof).toBeUndefined();
    expect(check(g.state, g.world, cal, "improveCover")).toMatchObject({ ok: false });
    expect(startTask(g.state, g.world, cal, "improveCover")).toBe(false);
    expect(site.cover).toBe(3);
  });

  it("refuses open meadow because there is no found cover to improve", () => {
    const g = newGame(17);
    const meadow = cellWith(g, "meadow");
    placeAt(g.state, g.world, meadow);
    const option = check(g.state, g.world, calendar(g.state.minute, g.state.startDoy), "improveCover");
    expect(option).toMatchObject({ ok: false, why: "no cover found here" });
  });

  it("binds improvement to its named cell and otherwise works underfoot", async () => {
    const { resolveCell } = await import("../src/sim/intent");
    const g = newGame(17);
    const here = cellOf(g.state, g.world);
    const named = cellWith(g, "rock");
    expect(resolveCell(g.state, g.world, calendar(0), "improveCover", undefined, "nearest").cell).toBe(here);
    expect(resolveCell(g.state, g.world, calendar(0), "improveCover", undefined, { cell: named }).cell).toBe(named);
  });

  it("does not clear an unrelated shopping target", () => {
    const g = newGame(17);
    const pine = cellWith(g, "pine");
    placeAt(g.state, g.world, pine);
    siteFor(regionState(g.state, g.world, g.state.player.region), pine).cover = 1;
    g.state.shopping = { task: "craft", arg: "knife" };
    expect(startTask(g.state, g.world, calendar(0), "improveCover")).toBe(true);
    finishTask(g);
    expect(g.state.shopping).toEqual({ task: "craft", arg: "knife" });
  });
});

describe("found cover keeping", () => {
  it("expires after exactly seven elapsed days when a search finishes just before the daily roll", () => {
    const g = newGame(17);
    const rock = cellWith(g, "rock");
    placeAt(g.state, g.world, rock);
    // The run starts at 08:00, so minute 1199 is 03:59 the next morning,
    // one minute before the camp's 04:00 daily roll.
    g.state.minute = 1173;
    g.state.lastHour = Math.floor(g.state.minute / 60);
    g.state.player.torch = { lit: true, minutes: 60 };
    expect(startTask(g.state, g.world, calendar(g.state.minute, g.state.startDoy), "findShelter")).toBe(true);
    advance(g.state, g.world, 26);
    expect(g.state.minute).toBe(1199);

    const st = regionState(g.state, g.world, g.state.player.region);
    const site = siteFor(st, rock);
    expect(site.cover).toBe(2);
    expect(site.coverAge).toBe(0);
    site.structures.cabin = true;
    site.structures.firePit = true;

    advance(g.state, g.world, 7 * 1440 - 1, { nobody: true });
    expect(site.cover).toBe(2);
    expect(site.coverAge).toBe(7 * 1440 - 1);
    advance(g.state, g.world, 1, { nobody: true });
    expect(site.cover).toBe(0);
    expect(site.coverAge).toBe(0);
    expect(site.structures.cabin).toBe(true);
    expect(site.structures.firePit).toBe(true);
  });

  it("fills missing cover fields when an older save is loaded", () => {
    const g = newGame(17);
    const st = regionState(g.state, g.world, g.state.player.region);
    const cell = cellOf(g.state, g.world);
    siteFor(st, cell);
    const raw = JSON.parse(serialize(g.state));
    delete raw.state.regions[g.state.player.region].sites[cell].cover;
    delete raw.state.regions[g.state.player.region].sites[cell].coverAge;
    const loaded = deserialize(JSON.stringify(raw))!;
    const savedSite = loaded.state.regions[g.state.player.region].sites[cell];
    expect(savedSite.cover).toBe(0);
    expect(savedSite.coverAge).toBe(0);
  });
});
