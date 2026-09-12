import { reveal } from "./opportunity-helpers";
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { STRUCTURES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { sheltered, workSpeed } from "../src/sim/player";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { readSave, serialize } from "../src/sim/save";
import { levelMinutes, skillLevel } from "../src/sim/skills";
import { builtProtection, COVER_CEILING, EMERGENCY_MINUTES, findCover, protectionOf, PROTECTION_WORDS } from "../src/sim/shelter";
import { check, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { TASK_IDS, type Terrain } from "../src/sim/types";
import { cellAt, regionAt } from "../src/world/gen";

type Game = ReturnType<typeof newGame>;

function emergencyGame() {
  // Guard the public registration so a missing task fails as a contract
  // assertion, before check's intentionally exhaustive switch is called.
  expect(TASK_IDS).toContain("emergencyShelter");
  const g = newGame(17);
  const meadow = cellWith(g, "meadow");
  placeAt(g.state, g.world, meadow);
  g.state.survivors[0].person.quirks = [];
  const site = siteFor(regionState(g.state, g.world, g.state.player.region), meadow);
  return { ...g, site, meadow };
}

function cellWith({ world }: Game, terrain: Terrain): number {
  const pending = [world.start];
  const visited = new Set<number>();
  for (let i = 0; i < pending.length && visited.size < 12; i++) {
    const id = pending[i];
    if (visited.has(id)) continue;
    visited.add(id);
    const region = regionAt(world, id);
    const cell = region.cells.find(cell => cellAt(world, cell).terrain === terrain);
    if (cell !== undefined) return cell;
    for (const neighbor of region.neighbours) if (!visited.has(neighbor.id)) pending.push(neighbor.id);
  }
  throw new Error(`no ${terrain} cell in the twelve regions around the start`);
}

function finishTask(g: Game): void {
  const duration = g.state.task?.duration ?? 0;
  stepTask(g.state, g.world, calendar(g.state.minute, g.state.startDoy), new Rng(1), duration);
}

describe("protection", () => {
  it("pays out as the minutes go in, and joins the lean-to at the top", () => {
    expect(builtProtection).toBeTypeOf("function");
    expect(builtProtection(0)).toBe(0);
    expect(builtProtection(29)).toBe(0);
    expect(builtProtection(30)).toBe(1);
    expect(builtProtection(89)).toBe(1);
    expect(builtProtection(90)).toBe(2);
    expect(builtProtection(239)).toBe(2);
    expect(builtProtection(240)).toBe(3);
    expect(builtProtection(500)).toBe(3);
    expect(EMERGENCY_MINUTES[3]).toBe(STRUCTURES.leanTo.minutes);
  });

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
  it.each([[1, 30, 1], [4, 27, 1], [5, 26, 2], [20, 11, 2], [21, 10, 2], [50, 10, 2]])("searches rock at level %i in %i base minutes for protection %i", (level, duration, protection) => {
    const g = newGame(17);
    const rock = cellWith(g, "rock");
    placeAt(g.state, g.world, rock);
    g.state.survivors[0].person.quirks = [];
    g.state.skills.naturalShelter = { xp: levelMinutes(level), mastery: {}, pool: 0 };
    const option = check(g.state, g.world, calendar(0), "findShelter");
    expect(option.duration).toBe(duration);
    expect(option.detail).toContain(PROTECTION_WORDS[protection as 1 | 2]);
    expect(startTask(g.state, g.world, calendar(0), "findShelter")).toBe(true);
    finishTask(g);
    expect(siteFor(regionState(g.state, g.world, g.state.player.region), rock).cover).toBe(protection);
    expect(g.state.skills.naturalShelter.mastery.findShelter).toBeGreaterThan(0);
  });

  it("keeps the search's promised result when its practice reaches level five during completion", () => {
    const g = newGame(17);
    const rock = cellWith(g, "rock");
    placeAt(g.state, g.world, rock);
    g.state.skills.naturalShelter = { xp: levelMinutes(5) - 1, mastery: {}, pool: 0 };
    expect(startTask(g.state, g.world, calendar(0), "findShelter")).toBe(true);
    finishTask(g);
    expect(skillLevel(g.state, "naturalShelter")).toBe(5);
    expect(siteFor(regionState(g.state, g.world, g.state.player.region), rock).cover).toBe(1);
    expect(g.state.opportunities.completedAt.roof).toBeUndefined();
  });

  it("looks on open ground, spends the time and says that it found nothing", () => {
    const g = newGame(17);
    const meadow = cellWith(g, "meadow");
    placeAt(g.state, g.world, meadow);
    const cal = calendar(g.state.minute, g.state.startDoy);
    const option = check(g.state, g.world, cal, "findShelter");
    expect(option.ok, option.why).toBe(true);
    expect(option.duration).toBe(30);
    expect(startTask(g.state, g.world, cal, "findShelter")).toBe(true);
    finishTask(g);
    const site = siteFor(regionState(g.state, g.world, g.state.player.region), meadow);
    expect(site.cover).toBe(0);
    expect(site.coverAge).toBe(0);
    expect(g.state.log.some((entry) => /nothing|no (?:shelter|cover)/i.test(entry.text))).toBe(true);
  });

  it("finds only a windbreak on rock and spruce as a novice", () => {
    for (const terrain of ["rock", "spruce"] as const) {
      const g = newGame(17);
      const cell = cellWith(g, terrain);
      placeAt(g.state, g.world, cell);
      const cal = calendar(g.state.minute, g.state.startDoy);
      expect(startTask(g.state, g.world, cal, "findShelter")).toBe(true);
      finishTask(g);
      const site = siteFor(regionState(g.state, g.world, g.state.player.region), cell);
      expect(site.cover, terrain).toBe(1);
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
    reveal(fresh.state, ["roof"]);
    fresh.state.skills.naturalShelter = { xp: levelMinutes(5), mastery: {}, pool: 0 };
    const rock = cellWith(fresh, "rock");
    placeAt(fresh.state, fresh.world, rock);
    expect(startTask(fresh.state, fresh.world, calendar(0), "findShelter")).toBe(true);
    finishTask(fresh);
    expect(fresh.state.opportunities.completedAt.roof).toBeDefined();

    const known = newGame(17);
    known.state.skills.naturalShelter = { xp: levelMinutes(5), mastery: {}, pool: 0 };
    const knownRock = cellWith(known, "rock");
    placeAt(known.state, known.world, knownRock);
    siteFor(regionState(known.state, known.world, known.state.player.region), knownRock).cover = 2;
    expect(startTask(known.state, known.world, calendar(0), "findShelter")).toBe(true);
    finishTask(known);
    expect(known.state.opportunities.completedAt.roof).toBeUndefined();
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
    reveal(g.state, ["roof"]);
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
    expect(g.state.opportunities.completedAt.roof).toBeDefined();
    expect(check(g.state, g.world, cal, "improveCover")).toMatchObject({ ok: false, why: "cover cannot be improved further" });
    expect(startTask(g.state, g.world, cal, "improveCover")).toBe(false);
    expect(site.cover).toBe(2);
  });

  it("never lowers worked cover when the same ground is searched again", () => {
    for (const [terrain, protection] of [["rock", 3], ["pine", 2]] as const) {
      const g = newGame(17);
      const cell = cellWith(g, terrain);
      placeAt(g.state, g.world, cell);
      const site = siteFor(regionState(g.state, g.world, g.state.player.region), cell);
      site.cover = protection;
      site.coverAge = 123;

      expect(startTask(g.state, g.world, calendar(0), "findShelter")).toBe(true);
      finishTask(g);

      expect(site.cover, terrain).toBe(protection);
      expect(site.coverAge, terrain).toBe(0);
    }
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
    expect(g.state.opportunities.completedAt.roof).toBeUndefined();
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

  it("stops without improving when found cover expires in the completion minute", () => {
    const g = newGame(17);
    const rock = cellWith(g, "rock");
    placeAt(g.state, g.world, rock);
    const site = siteFor(regionState(g.state, g.world, g.state.player.region), rock);
    site.cover = 2;
    site.coverAge = 7 * 1440 - 1;
    expect(startTask(g.state, g.world, calendar(g.state.minute, g.state.startDoy), "improveCover")).toBe(true);
    g.state.task!.progress = g.state.task!.duration - 1;
    const logAtStart = g.state.log.length;

    advance(g.state, g.world, 1);

    expect(site.cover).toBe(0);
    expect(g.state.opportunities.completedAt.roof).toBeUndefined();
    const completionLog = g.state.log.slice(logAtStart).map((entry) => entry.text);
    expect(completionLog).toContain("Improve shelter: no cover found here. {You} {stop}.");
    expect(completionLog.some((line) => line.includes("cover into something"))).toBe(false);
  });
});

describe("found cover keeping", () => {
  it("expires after exactly seven elapsed days when a search finishes just before the daily roll", () => {
    const g = newGame(17);
    const rock = cellWith(g, "rock");
    placeAt(g.state, g.world, rock);
    // The run starts at 08:00, so minute 1199 is 03:59 the next morning,
    // one minute before the camp's 04:00 daily roll.
    g.state.minute = 1169;
    g.state.lastHour = Math.floor(g.state.minute / 60);
    g.state.player.torch = { lit: true, minutes: 60 };
    expect(startTask(g.state, g.world, calendar(g.state.minute, g.state.startDoy), "findShelter")).toBe(true);
    advance(g.state, g.world, 30);
    expect(g.state.minute).toBe(1199);

    const st = regionState(g.state, g.world, g.state.player.region);
    const site = siteFor(st, rock);
    expect(site.cover).toBe(1);
    expect(site.coverAge).toBe(0);
    site.structures.cabin = true;
    site.structures.firePit = true;

    advance(g.state, g.world, 7 * 1440 - 1, { nobody: true });
    expect(site.cover).toBe(1);
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
    const loaded = readSave(JSON.stringify(raw))!;
    const savedSite = loaded.state.regions[g.state.player.region].sites[cell];
    expect(savedSite.cover).toBe(0);
    expect(savedSite.coverAge).toBe(0);
  });
});

describe("emergency shelter", () => {
  it("raises protection while the task is still running and emits the roof deed only on crossing two", () => {
    const g = emergencyGame();
    reveal(g.state, ["roof"]);
    const cal = calendar(g.state.minute, g.state.startDoy);
    expect(startTask(g.state, g.world, cal, "emergencyShelter")).toBe(true);
    const work = (minutes: number) => stepTask(g.state, g.world, cal, new Rng(1), minutes);
    work(29);
    expect(g.site.emergencyMinutes).toBe(29);
    expect(protectionOf(g.site)).toBe(0);
    expect(sheltered(g.state, g.world)).toBe(false);
    work(1);
    expect(protectionOf(g.site)).toBe(1);
    work(59);
    expect(g.state.opportunities.completedAt.roof).toBeUndefined();
    work(1);
    expect(protectionOf(g.site)).toBe(2);
    expect(g.state.task?.id).toBe("emergencyShelter");
    expect(sheltered(g.state, g.world)).toBe(true);
    expect(g.state.opportunities.completedAt.roof).toBeDefined();
    // A second emission would credit a newly empty ledger, even though the
    // ordinary opportunity ledger also protects against repeating completed opportunities.
    delete g.state.opportunities.completedAt.roof;
    delete g.state.opportunities.stepProgress.roof;
    work(150);
    expect(g.state.opportunities.completedAt.roof).toBeUndefined();
    expect(g.state.task).toBeNull();
    expect(protectionOf(g.site)).toBe(3);
    expect(check(g.state, g.world, cal, "emergencyShelter").ok).toBe(false);
    expect(Object.values(g.site.structures).some(Boolean)).toBe(false);
    expect(g.site.build).toEqual({});
  });

  it("keeps the strongest protection and does not repeat a roof already provided by cover", () => {
    const g = emergencyGame();
    g.site.cover = 2;
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    stepTask(g.state, g.world, calendar(0), new Rng(1), 90);
    expect(g.state.opportunities.completedAt.roof).toBeUndefined();
    expect(protectionOf(g.site)).toBe(2);
    g.site.structures.cabin = true;
    expect(protectionOf(g.site)).toBe(3);
  });

  it("counts effective work rather than elapsed minutes and applies the big-eater pace once", () => {
    const g = emergencyGame();
    g.state.player.energy = 10;
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    stepTask(g.state, g.world, calendar(0), new Rng(1), 60);
    expect(g.site.emergencyMinutes).toBe(30);
    expect(protectionOf(g.site)).toBe(1);
    stopTask(g.state, g.world);
    g.state.player.energy = 100;
    g.state.survivors[0].person.quirks = ["bigEater"];
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    stepTask(g.state, g.world, calendar(0), new Rng(1), 189);
    expect(g.site.emergencyMinutes).toBe(240);
    expect(g.state.task).toBeNull();
  });

  it("resumes site work without creating camp, spending materials, or clearing a shopping target", () => {
    const g = emergencyGame();
    const st = regionState(g.state, g.world, g.state.player.region);
    const pack = JSON.stringify(g.state.player.pack);
    g.state.shopping = { task: "craft", arg: "knife" };
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    stepTask(g.state, g.world, calendar(0), new Rng(1), 50);
    stopTask(g.state, g.world);
    expect(g.site.emergencyMinutes).toBe(50);
    expect(g.state.paused).toEqual({});
    expect(check(g.state, g.world, calendar(0), "emergencyShelter").duration).toBe(190);
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    finishTask(g);
    expect(g.site.emergencyMinutes).toBe(240);
    expect(st.campCell).toBeNull();
    expect(JSON.stringify(g.state.player.pack)).toBe(pack);
    expect(g.state.shopping).toEqual({ task: "craft", arg: "knife" });
  });

  it("binds selected or current land and refuses water at start and during work", async () => {
    const { resolveCell } = await import("../src/sim/intent");
    const g = emergencyGame();
    const named = cellWith(g, "rock");
    expect(resolveCell(g.state, g.world, calendar(0), "emergencyShelter", undefined, "nearest").cell).toBe(g.meadow);
    expect(resolveCell(g.state, g.world, calendar(0), "emergencyShelter", undefined, { cell: named }).cell).toBe(named);
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    const water = cellWith(g, "water");
    placeAt(g.state, g.world, water);
    stepTask(g.state, g.world, calendar(0), new Rng(1), 1);
    expect(g.state.task).toBeNull();
    expect(g.site.emergencyMinutes).toBe(0);
    expect(check(g.state, g.world, calendar(0), "emergencyShelter").ok).toBe(false);
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(false);
  });

  it("expires exactly fourteen elapsed days after work and reports its fall without removing structures", () => {
    const g = emergencyGame();
    g.state.minute = 1199;
    g.site.emergencyMinutes = 90;
    g.site.emergencyAge = 0;
    g.site.structures.firePit = true;
    advance(g.state, g.world, 14 * 1440 - 1, { nobody: true });
    expect(g.site.emergencyAge).toBe(14 * 1440 - 1);
    expect(protectionOf(g.site)).toBe(2);
    advance(g.state, g.world, 1, { nobody: true });
    expect(g.site.emergencyMinutes).toBe(0);
    expect(g.site.emergencyAge).toBe(0);
    expect(protectionOf(g.site)).toBe(0);
    expect(g.site.structures.firePit).toBe(true);
    expect(g.state.log.filter((entry) => /emergency shelter.*fallen/i.test(entry.text))).toHaveLength(1);
  });

  it("resets the idle age on new work and never resurrects expired progress in the completion minute", () => {
    const g = emergencyGame();
    g.site.emergencyMinutes = 239;
    g.site.emergencyAge = 14 * 1440 - 1;
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    advance(g.state, g.world, 1);
    expect(g.site.emergencyMinutes).toBe(1);
    expect(g.site.emergencyAge).toBe(0);
    expect(protectionOf(g.site)).toBe(0);
    expect(g.state.task?.id).toBe("emergencyShelter");
    expect(g.state.opportunities.completedAt.roof).toBeUndefined();
    stopTask(g.state, g.world);
    g.site.emergencyAge = 40;
    expect(startTask(g.state, g.world, calendar(0), "emergencyShelter")).toBe(true);
    expect(check(g.state, g.world, calendar(0), "emergencyShelter")).toMatchObject({ ok: true });
    expect(g.state.task).toMatchObject({ progress: 1, duration: 240 });
    expect(workSpeed(g.state, g.world)).toBeGreaterThan(0);
    stepTask(g.state, g.world, calendar(0), new Rng(1), 1);
    expect(cellOf(g.state, g.world)).toBe(g.meadow);
    expect(g.state.dead).toBeNull();
    expect(g.state.task?.id).toBe("emergencyShelter");
    expect(g.site.emergencyAge).toBe(0);
  });

  it("preserves partial work on save and defaults absent emergency fields in old saves", () => {
    const g = newGame(17);
    const here = cellOf(g.state, g.world);
    const site = siteFor(regionState(g.state, g.world, g.state.player.region), here);
    expect(site.emergencyMinutes).toBe(0);
    expect(site.emergencyAge).toBe(0);
    site.emergencyMinutes = 89;
    site.emergencyAge = 42;
    const raw = JSON.parse(serialize(g.state));
    const loaded = readSave(JSON.stringify(raw))!;
    expect(loaded.state.regions[g.state.player.region].sites[here]).toMatchObject({ emergencyMinutes: 89, emergencyAge: 42 });
    delete raw.state.regions[g.state.player.region].sites[here].emergencyMinutes;
    delete raw.state.regions[g.state.player.region].sites[here].emergencyAge;
    expect(readSave(JSON.stringify(raw))!.state.regions[g.state.player.region].sites[here]).toMatchObject({ emergencyMinutes: 0, emergencyAge: 0 });
  });
});
