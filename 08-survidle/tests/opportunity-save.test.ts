import { describe, expect, it } from "vitest";
import { calendar, START_DOY } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { dismissOpportunityPresentation, newOpportunities, recordOpportunityEvent } from "../src/sim/opportunities";
import { DAY_ONE_CAPABILITY_KEYS } from "../src/sim/opportunity-catalog";
import { readSave, serialize } from "../src/sim/save";
import { newSite } from "../src/sim/regionstate";
import type { GameState, Species, LifeRecord as Survivor } from "../src/sim/types";

const newState = () => newGame(3).state;

/**
 * A current save still carrying the goals field an older build wrote. The
 * version cannot be older: a save below 10 stands on ground this build no
 * longer makes and is refused rather than read, so the legacy shape is what
 * reaches the migration, not the version number.
 */
function legacyGoalsFixture(goals: Record<string, unknown>): { version: number; state: GameState & Record<string, unknown> } {
  const state = newState();
  const raw = JSON.parse(serialize(state));
  delete raw.state.opportunities;
  raw.state["goals"] = {
    done: {}, progress: {}, stepProgress: {}, introduced: {}, queue: [],
    noticeQueue: [], opportunity: null, chapter3HomeRegion: null,
    lastSeason: calendar(state.minute, state.startDoy).season,
    ...goals,
  };
  return raw;
}

function legacyGoalsFixtureWithKill(species: Species): Record<string, unknown> {
  const raw = legacyGoalsFixture({});
  const state = (raw as { state: { survivors: Survivor[] } }).state;
  state.survivors[0].events.push({
    kind: "firstKill", species, day: 1, date: { year: 1, doy: START_DOY },
  });
  return raw;
}

const EARLY = ["site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook", "findUsefulCover", "makeUsefulShelter", "testShelter"];
const done = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, true]));
const read = (raw: unknown) => {
  const file = readSave(JSON.stringify(raw));
  expect(file).not.toBeNull();
  return file!.state;
};

describe("one-way opportunity save migration", () => {
  it("migrates old goal progress once and serializes only opportunities", () => {
    const old = legacyGoalsFixture({
      done: { site: true, drink: true }, introduced: { firewood: true },
      stepProgress: { firewood: { wood: 6 } }, queue: ["drink"],
    });
    const loaded = read(old);
    expect(loaded.opportunities.completedAt.site).toBeDefined();
    expect(loaded.opportunities.stepProgress.firewood?.wood).toBe(6);
    expect(loaded.opportunities.current).toBe("firewood");
    const saved = JSON.parse(serialize(loaded));
    expect(saved.version).toBe(10);
    expect(saved.state["goals"]).toBeUndefined();
    expect(read(saved).opportunities).toEqual(loaded.opportunities);
  });

  it.each([
    { completed: [], current: "site" },
    { completed: ["site", "drink"], current: "firewood" },
  ])("presents the previously unintroduced selected $current once", ({ completed, current }) => {
    const loaded = read(legacyGoalsFixture({ done: done(completed) }));
    expect(loaded.opportunities.current).toBe(current);
    expect(loaded.opportunities.notices.flatMap((notice) => notice.discovered)).toEqual([current]);
    expect(read(JSON.parse(serialize(loaded))).opportunities.notices).toEqual(loaded.opportunities.notices);
    expect(dismissOpportunityPresentation(loaded, loaded.opportunities.notices[0].id, null)).toBe(true);
    expect(read(JSON.parse(serialize(loaded))).opportunities.notices).toEqual([]);
    expect(loaded.opportunities.current).toBe(current);
  });

  it("does not replay introduced leaves or already presented completions", () => {
    const loaded = read(legacyGoalsFixture({ done: { site: true, drink: true }, introduced: { firewood: true } }));
    expect(loaded.opportunities.notices).toEqual([]);
    expect(loaded.opportunities.discoveredAt.firewood).toBe(0);
  });

  it("batches queued completions, messages, and the new selected leaf with stable notice identity", () => {
    const loaded = read(legacyGoalsFixture({
      done: { site: true, drink: true }, queue: ["drink", "site", "drink", "obsolete", "hunt:deer"],
      noticeQueue: ["Weather passed.", "The storm cleared.", 3],
    }));
    expect(loaded.opportunities.notices).toEqual([{
      id: "legacy:1", minute: 0, completed: ["drink", "site"], completedGroups: [],
      discovered: ["firewood"], messages: ["Weather passed.", "The storm cleared."],
    }]);
    const again = read(JSON.parse(serialize(loaded)));
    expect(again.opportunities.notices).toEqual(loaded.opportunities.notices);
    recordOpportunityEvent(again, { kind: "gathered", item: "firewood", kg: 10 });
    expect(new Set(again.opportunities.notices.map((notice) => notice.id)).size).toBe(again.opportunities.notices.length);
  });

  it("validates static keys and compatible finite non-negative progress without inferring multi-step deeds", () => {
    const loaded = read(legacyGoalsFixture({
      done: { site: true, obsolete: true, "hunt:deer": true, drink: "true" },
      introduced: { fire: true, firewood: true, obsolete: true, "build:leanTo": true, roof: 1 },
      progress: { firewood: 6, huntMeal: 10, obsolete: 2 },
      stepProgress: { fire: { site: 1, fuel: -2, light: "1", obsolete: 8 }, bed: { bed: null } },
    }));
    expect(loaded.opportunities.completedAt).toEqual({ site: 0 });
    expect(loaded.opportunities.discoveredAt.roof).toBeUndefined();
    // A day-one capability is seeded by the fresh state, not honoured from the
    // legacy save, so it arrives known and uncredited either way.
    expect(loaded.opportunities.discoveredAt["build:leanTo"]).toBe(0);
    expect(loaded.opportunities.completedAt["build:leanTo"]).toBeUndefined();
    expect(loaded.opportunities.discoveredAt["hunt:deer"]).toBeUndefined();
    expect(loaded.opportunities.stepProgress).toEqual({ firewood: { wood: 6 }, fire: { site: 1 } });
  });

  it("keeps explicit step progress instead of replacing it with an aggregate", () => {
    const loaded = read(legacyGoalsFixture({ introduced: { firewood: true }, progress: { firewood: 9 }, stepProgress: { firewood: { wood: 4.5 } } }));
    expect(loaded.opportunities.stepProgress.firewood).toEqual({ wood: 4.5 });
  });

  it.each([
    { minute: 9599, current: "snareMeal" },
    { minute: 9600, current: "readWeather" },
  ])("keeps the old visible leaf at minute $minute", ({ minute, current }) => {
    const raw = legacyGoalsFixture({ done: done(EARLY) });
    raw.state.minute = minute;
    const loaded = read(raw);
    expect(loaded.opportunities.current).toBe(current);
    expect(loaded.opportunities.notices.flatMap((notice) => notice.discovered)).toEqual([current]);
  });

  it("keeps an introduced weather chapter eligible across a survivor clock reset", () => {
    const loaded = read(legacyGoalsFixture({ done: done(EARLY), introduced: { readWeather: true } }));
    expect(loaded.opportunities.current).toBe("readWeather");
    expect(loaded.opportunities.notices).toEqual([]);
  });

  it("maps old seasons and selects the next unfinished old seasonal leaf", () => {
    const authored = [...EARLY, "readWeather", "prepareWeather", "surviveForecast", "remoteRefuge", "fieldFire", "fieldMeal", "remoteStorm", "snareMeal", "huntMeal", "fishMeal", "trapMeal", "foodSource", "store", "fat", "firstOrder", "water", "keptDays", "longOrder", "toolCare", "explore", "secondCamp", "seasonalFood", "durableRoof", "winterStores"];
    const loaded = read(legacyGoalsFixture({ done: done([...authored, "spring"]), lastSeason: "summer" }));
    expect(loaded.opportunities.completedAt["season:spring"]).toBe(0);
    expect(loaded.opportunities.current).toBe("season:autumn");
    expect(loaded.opportunities.lastSeason).toBe("summer");
    const finished = read(legacyGoalsFixture({ done: done([...authored, "spring", "summer", "autumn", "winter"]) }));
    expect(finished.opportunities.current).toBeNull();
    expect(finished.opportunities.completedAt.preserveHunt).toBeUndefined();
  });

  it("does not backfill wildlife collections from old life records", () => {
    const loaded = read(legacyGoalsFixtureWithKill("deer"));
    expect(loaded.opportunities.discoveredAt["hunt:deer"]).toBeUndefined();
    expect(loaded.opportunities.completedAt["hunt:deer"]).toBeUndefined();
  });

  it("does not backfill collections or chapter home from inventory, structures, kills, or knowledge", () => {
    const raw = legacyGoalsFixture({});
    raw.state.player.pack.items.firewood = 100;
    raw.state.player.known[123] = { minute: 0, fish: ["trout"] };
    raw.state.stats.kills.deer = 3;
    const region = raw.state.regions[raw.state.player.region];
    region.campCell = 123;
    region.sites[123] = newSite();
    region.sites[123].structures.leanTo = true;
    const loaded = read(raw);
    expect(loaded.opportunities.completedAt).toEqual({});
    expect(loaded.opportunities.stepProgress).toEqual({});
    const seeded = new Set<string>([...DAY_ONE_CAPABILITY_KEYS]);
    expect(Object.keys(loaded.opportunities.discoveredAt).filter((key) => key.includes(":") && !key.startsWith("season:") && !seeded.has(key))).toEqual([]);
    expect(loaded.opportunities.context.chapter3HomeRegion).toBeNull();
  });

  it.each(["testShelter", "readWeather", "remoteStorm", "fieldFire", "fieldMeal"])("preserves the legacy %s reservation and home", (goal) => {
    const weather = { goal, status: "running", createdAt: 200, attempts: 3,
      stormId: 7, source: "natural", area: { region: 9, centre: 72, radiusKm: 1 },
      announcedAt: 300, resolvedAt: null, minutesByProtection: [1, 2, 3, 4],
      atCampMinutes: 5, awayFromCampMinutes: 6, maxWetness: 70, readerIndex: 2, plan: null };
    const loaded = read(legacyGoalsFixture({ opportunity: weather, chapter3HomeRegion: 5 }));
    const { goal: _goal, ...context } = weather;
    expect(loaded.opportunities.context).toEqual({
      weather: { ...context, opportunity: goal === "fieldFire" || goal === "fieldMeal" ? "remoteStorm" : goal },
      chapter3HomeRegion: 5,
    });
    expect(read(JSON.parse(serialize(loaded))).opportunities.context).toEqual(loaded.opportunities.context);
  });

  it("defaults missing historical weather metrics without discarding the reservation", () => {
    const loaded = read(legacyGoalsFixture({ opportunity: {
      goal: "testShelter", status: "reserved", createdAt: 20, attempts: 1,
      stormId: null, source: null, area: null, announcedAt: null, resolvedAt: null,
    } }));
    expect(loaded.opportunities.context.weather).toMatchObject({
      opportunity: "testShelter", minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0,
      awayFromCampMinutes: 0, maxWetness: 0, readerIndex: null, plan: null,
    });
  });

  it("preserves a current opportunity save when stale legacy input is also present", () => {
    const state = newState();
    state.opportunities.current = "season:winter";
    state.opportunities.lastCategory = "exploration";
    const raw = JSON.parse(serialize(state));
    raw.state["goals"] = { done: { site: true }, introduced: { firewood: true } };
    const loaded = read(raw);
    expect(loaded.opportunities).toEqual(state.opportunities);
    expect(JSON.parse(serialize(loaded)).state["goals"]).toBeUndefined();
  });

  it("never serializes an accidental legacy field or mutates the caller", () => {
    const state = newState();
    const raw = state as unknown as Record<string, unknown>;
    raw["goals"] = { done: { site: true } };
    expect(JSON.parse(serialize(state)).state["goals"]).toBeUndefined();
    expect(raw["goals"]).toEqual({ done: { site: true } });
  });

  it("defaults saves predating both ledgers to a fresh opportunity state", () => {
    const raw = legacyGoalsFixture({});
    delete raw.state["goals"];
    expect(read(raw).opportunities).toEqual(newOpportunities(calendar(raw.state.minute, raw.state.startDoy).season));
  });
});
