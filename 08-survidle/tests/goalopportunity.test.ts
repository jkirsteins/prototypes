import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { stepGoalOpportunity } from "../src/sim/goalopportunity";
import { beginAgain, land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { cellOf } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import type { GameState, GoalId } from "../src/sim/types";
import { stepWeather } from "../src/sim/weather";
import { regionAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";

const THROUGH_SHELTER: GoalId[] = [
  "site", "drink", "firewood", "fire", "bed", "roof", "cook", "findUsefulCover", "makeUsefulShelter",
];

function finish(state: GameState, ids: GoalId[]): void {
  for (const id of ids) state.goals.done[id] = true;
}

function activateShelterTest(state: GameState): void {
  finish(state, THROUGH_SHELTER);
}

function activateWeatherReading(state: GameState): void {
  finish(state, [...THROUGH_SHELTER, "testShelter", "keptNight"]);
  state.minute = 7 * 1440;
}

function activateRemoteStorm(state: GameState): void {
  finish(state, [
    ...THROUGH_SHELTER, "testShelter", "keptNight", "readWeather", "prepareWeather", "surviveForecast",
    "remoteRefuge", "fieldFire", "fieldMeal",
  ]);
  state.minute = 30 * 1440;
}

describe("weather teaching opportunity lifecycle", () => {
  it("moves one stable natural storm through reserved, announced, running, and resolved at its exact minutes", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.weather.offset = 10;
    state.weather.storm = { id: 7, source: "natural", kind: "rain", from: 120, until: 480, warned: false };
    state.weather.nextStormId = 8;
    const rng = new Rng(12);

    stepGoalOpportunity(state, world, calendar(0, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({
      goal: "testShelter", status: "reserved", createdAt: 0, attempts: 1,
      stormId: 7, source: "natural", announcedAt: null, resolvedAt: null,
    });

    state.minute = 59;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity?.status).toBe("reserved");
    state.minute = 60;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "announced", announcedAt: 60, stormId: 7 });
    state.minute = 120;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "running", stormId: 7 });
    state.minute = 480;
    state.weather.storm = null;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "resolved", resolvedAt: 480, stormId: 7 });
  });

  it("is called from ordinary advance and keeps the storm id from warning through its end", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.weather.offset = 10;
    state.weather.storm = { id: 4, source: "natural", kind: "rain", from: 120, until: 480, warned: false };
    state.weather.nextStormId = 5;
    advance(state, world, 60);
    expect(state.goals.opportunity).toMatchObject({ status: "announced", announcedAt: 60, stormId: 4 });
    advance(state, world, 60);
    expect(state.goals.opportunity).toMatchObject({ status: "running", stormId: 4 });
    advance(state, world, 360);
    expect(state.goals.opportunity).toMatchObject({ status: "resolved", resolvedAt: 480, stormId: 4 });
  });

  it("lets a running ordinary storm finish before reserving a teaching attempt", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.minute = 100;
    state.weather.storm = { id: 1, source: "natural", kind: "gale", from: 0, until: 200, warned: true };
    state.weather.nextStormId = 2;
    const rng = new Rng(22);
    const before = rng.s;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toBeNull();
    expect(state.weather.storm).toEqual({ id: 1, source: "natural", kind: "gale", from: 0, until: 200, warned: true });
    expect(rng.s).toBe(before);
  });
});

describe("natural-first weather", () => {
  it("claims the first eligible natural rain without changing its event or random state", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.weather.offset = 10;
    const storm = { id: 3, source: "natural" as const, kind: "rain" as const, from: 180, until: 540, warned: false };
    state.weather.storm = storm;
    state.weather.nextStormId = 4;
    const rng = new Rng(27);
    const beforeState = rng.s;
    const beforeStorm = structuredClone(storm);
    stepGoalOpportunity(state, world, calendar(0, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ stormId: 3, source: "natural", status: "reserved" });
    expect(state.weather.storm).toEqual(beforeStorm);
    expect(state.weather.nextStormId).toBe(4);
    expect(rng.s).toBe(beforeState);
  });

  it("lets the ordinary dawn roll claim first on the third dawn", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.weather.offset = 10;
    const rng = new Rng(31);
    stepGoalOpportunity(state, world, calendar(0, state.startDoy), rng);
    state.minute = 3 * 1440;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: state.minute + 180, until: state.minute + 540, warned: false };
    state.weather.nextStormId = 2;
    const before = rng.s;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ stormId: 1, source: "natural" });
    expect(state.weather.nextStormId).toBe(2);
    expect(rng.s).toBe(before);
  });

  it("creates exactly one mild synthetic rain on the third dawn using the factory's two draws", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.weather.offset = 10;
    const rng = new Rng(41);
    stepGoalOpportunity(state, world, calendar(0, state.startDoy), rng);
    for (const minute of [1440, 2880]) {
      state.minute = minute;
      stepGoalOpportunity(state, world, calendar(minute, state.startDoy), rng);
      expect(state.weather.storm).toBeNull();
    }
    const beforeSynthesis = rng.s;
    const expected = new Rng(beforeSynthesis);
    expected.next();
    expected.next();
    state.minute = 4320;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    const storm = state.weather.storm;
    expect(storm).toMatchObject({ id: 1, source: "synthetic", kind: "rain" });
    expect(storm!.from).toBeGreaterThanOrEqual(state.minute + 60);
    expect(storm!.from).toBeLessThanOrEqual(state.minute + 180);
    expect(storm!.until - storm!.from).toBeGreaterThanOrEqual(360);
    expect(storm!.until - storm!.from).toBeLessThanOrEqual(600);
    expect(state.goals.opportunity).toMatchObject({ stormId: 1, source: "synthetic" });
    expect(state.weather.nextStormId).toBe(2);
    expect(rng.s).toBe(expected.s);

    const exactStorm = structuredClone(storm);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.weather.storm).toEqual(exactStorm);
    expect(state.weather.nextStormId).toBe(2);
  });

  it("does not overlap, reroll, weaken, or replace an ineligible scheduled storm", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    const rng = new Rng(51);
    stepGoalOpportunity(state, world, calendar(0, state.startDoy), rng);
    state.minute = 4320;
    const gale = { id: 1, source: "natural" as const, kind: "gale" as const, from: state.minute + 120, until: state.minute + 1200, warned: false };
    state.weather.storm = gale;
    state.weather.nextStormId = 2;
    const beforeRng = rng.s;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.weather.storm).toEqual(gale);
    expect(state.goals.opportunity).toMatchObject({ status: "reserved", stormId: null, source: null });
    expect(state.weather.nextStormId).toBe(2);
    expect(rng.s).toBe(beforeRng);
  });

  it("accepts Chapter 2 weather only while it can be read before the ordinary warning", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    const rng = new Rng(61);
    state.weather.storm = { id: 1, source: "natural", kind: "snow", from: state.minute + 60, until: state.minute + 500, warned: false };
    state.weather.nextStormId = 2;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ goal: "readWeather", stormId: null });

    state.weather.storm = { id: 2, source: "natural", kind: "snow", from: state.minute + 90, until: state.minute + 500, warned: false };
    state.weather.nextStormId = 3;
    const before = rng.s;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ goal: "readWeather", stormId: 2, source: "natural", status: "announced" });
    expect(rng.s).toBe(before);
  });

  it("keeps the ordinary gale distribution for a synthetic Chapter 2 storm", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    const rng = new Rng(4);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    state.minute += 3 * 1440;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.weather.storm).toMatchObject({ source: "synthetic", kind: "gale" });
    expect(["rain", "snow", "gale"]).toContain(state.weather.storm?.kind);
  });

  it("waits for Chapter 3's contextual refuge area, then requires its known travel time plus 30 minutes", () => {
    const { state, world } = newGame(17);
    activateRemoteStorm(state);
    const rng = new Rng(71);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: state.minute + 60, until: state.minute + 500, warned: false };
    state.weather.nextStormId = 2;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toBeNull();

    state.goals.opportunity = {
      goal: "remoteStorm", status: "reserved", createdAt: state.minute, attempts: 1,
      stormId: null, source: null,
      area: { region: state.player.region + 1, centre: cellOf(state, world), radiusKm: 1 },
      announcedAt: null, resolvedAt: null,
    };
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity.stormId).toBe(1);
  });
});

describe("misses and retries", () => {
  it("replaces a successful Chapter 1 opportunity when Chapter 2 becomes active", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    state.goals.opportunity = {
      goal: "testShelter", status: "resolved", createdAt: 100, attempts: 1,
      stormId: 1, source: "natural", area: null, announcedAt: 200, resolvedAt: 600,
    };

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(76));

    expect(state.goals.opportunity).toEqual({
      goal: "readWeather", status: "reserved", createdAt: state.minute, attempts: 1,
      stormId: null, source: null, area: null, announcedAt: null, resolvedAt: null,
    });
  });

  it("clears a successful Chapter 2 opportunity so contextual Chapter 3 can own the slot", () => {
    const { state, world } = newGame(17);
    activateRemoteStorm(state);
    state.goals.opportunity = {
      goal: "readWeather", status: "resolved", createdAt: 100, attempts: 2,
      stormId: 2, source: "synthetic", area: null, announcedAt: 200, resolvedAt: 700,
    };

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(77));

    expect(state.goals.opportunity).toBeNull();
  });

  it("retries the Chapter 2 opportunity while its final storm goal remains open", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    finish(state, ["readWeather", "prepareWeather"]);
    state.goals.opportunity = {
      goal: "readWeather", status: "resolved", createdAt: state.minute - 500, attempts: 1,
      stormId: 1, source: "natural", area: null, announcedAt: state.minute - 400, resolvedAt: state.minute,
    };
    state.weather.stormFreeSince = state.minute;
    state.minute += 1440;

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(80));

    expect(state.goals.done.surviveForecast).toBeUndefined();
    expect(state.goals.opportunity).toMatchObject({
      goal: "readWeather", status: "reserved", attempts: 2, createdAt: state.minute,
      stormId: null, source: null,
    });
  });

  it("resolves a miss with a factual notice and retries after one storm-free day", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.weather.offset = 10;
    const rng = new Rng(81);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    state.weather.nextStormId = 2;
    stepGoalOpportunity(state, world, calendar(0, state.startDoy), rng);
    state.minute = 60;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    state.minute = 420;
    state.weather.storm = null;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "resolved", attempts: 1, resolvedAt: 420 });
    expect(state.goals.noticeQueue).toHaveLength(1);
    expect(state.goals.noticeQueue[0]).toContain("Another opportunity will come.");
    expect(state.goals.done.testShelter).toBeUndefined();

    const completedBefore = structuredClone(state.goals.done);
    state.minute = 420 + 1439;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity?.status).toBe("resolved");
    state.minute = 420 + 1440;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({
      status: "reserved", attempts: 2, createdAt: 1860, stormId: null, source: null,
      announcedAt: null, resolvedAt: null,
    });
    expect(state.goals.done).toEqual(completedBefore);
  });

  it("requires a fresh storm-free day after an unrelated cooldown storm", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.goals.opportunity = {
      goal: "testShelter", status: "resolved", createdAt: 0, attempts: 1,
      stormId: 1, source: "natural", area: null, announcedAt: 0, resolvedAt: 420,
    };
    state.weather.nextStormId = 3;
    state.minute = 1000;
    state.weather.storm = { id: 2, source: "natural", kind: "snow", from: 900, until: 1100, warned: true };
    const rng = new Rng(86);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity.status).toBe("resolved");

    state.minute = 1100;
    stepWeather(state.weather, calendar(state.minute, state.startDoy), rng, 1, state.minute);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.weather.storm).toBeNull();
    state.minute = 2539;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity.status).toBe("resolved");
    state.minute = 2540;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "reserved", attempts: 2, createdAt: 2540 });
  });

  it("resolves the active attempt on death without restarting completed goals", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    state.weather.offset = 10;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 0, until: 360, warned: true };
    state.weather.nextStormId = 2;
    state.goals.opportunity = {
      goal: "testShelter", status: "running", createdAt: 0, attempts: 1,
      stormId: 1, source: "natural", area: null, announcedAt: 0, resolvedAt: null,
    };
    const completedBefore = structuredClone(state.goals.done);
    state.minute = 10;
    state.dead = { cause: "froze", minute: 10 };
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(91));
    expect(state.goals.opportunity).toMatchObject({ status: "resolved", resolvedAt: 10, stormId: 1 });
    expect(state.goals.noticeQueue).toHaveLength(1);
    expect(state.goals.done).toEqual(completedBefore);
  });

  it("rebases a missed attempt through begin again and retries after one heir day", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateShelterTest(state);
    state.minute = 2000;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 1900, until: 2200, warned: true };
    state.weather.nextStormId = 2;
    state.goals.opportunity = {
      goal: "testShelter", status: "running", createdAt: 1800, attempts: 1,
      stormId: 1, source: "natural",
      area: { region: state.player.region, centre: cellOf(state, world), radiusKm: 1 },
      announcedAt: 1840, resolvedAt: null,
    };
    state.goals.introduced = { site: true, testShelter: true };
    const area = structuredClone(state.goals.opportunity.area);
    const completed = structuredClone(state.goals.done);
    const introduced = structuredClone(state.goals.introduced);
    die(state, "froze", regionAt(world, state.player.region).name);

    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    expect(state.minute).toBe(0);
    expect(state.weather.storm).toBeNull();
    expect(state.weather.stormFreeSince).toBe(0);
    expect(state.goals.done).toEqual(completed);
    expect(state.goals.introduced).toEqual(introduced);
    expect(state.goals.opportunity).toMatchObject({
      goal: "testShelter", status: "resolved", createdAt: 0, attempts: 1,
      area, resolvedAt: 0,
    });
    state.minute = 1439;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(92));
    expect(state.goals.opportunity?.attempts).toBe(1);
    state.minute = 1440;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(92));
    expect(state.goals.opportunity).toMatchObject({
      goal: "testShelter", status: "reserved", createdAt: 1440, attempts: 2,
      stormId: null, source: null, area,
    });
  });

  it("normalizes a prior landing save on direct land before the heir retry day", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateShelterTest(state);
    state.minute = 2000;
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    const area = { region: state.player.region, centre: cellOf(state, world), radiusKm: 1 } as const;
    state.goals.opportunity = {
      goal: "testShelter", status: "resolved", createdAt: 81000, attempts: 4,
      stormId: 8, source: "natural", area, announcedAt: 81500, resolvedAt: 82000,
    };
    state.weather.stormFreeSince = 82750;
    state.goals.introduced = { site: true, testShelter: true };
    state.goals.noticeQueue = ["The rain passed without shelter being tested. Another opportunity will come."];
    const completed = structuredClone(state.goals.done);
    const introduced = structuredClone(state.goals.introduced);
    const notices = [...state.goals.noticeQueue];
    const loaded = deserialize(serialize(state))!.state;

    land(loaded, world, { first: "Ilze", last: "Berg" });
    advance(loaded, world, 1439);
    expect(loaded.goals.opportunity?.attempts).toBe(4);
    advance(loaded, world, 1);

    expect(loaded.minute).toBe(1440);
    expect(loaded.weather.stormFreeSince).toBe(0);
    expect(loaded.goals.opportunity).toMatchObject({
      goal: "testShelter", status: "reserved", createdAt: 1440, attempts: 5,
      stormId: null, source: null, area,
    });
    expect(loaded.goals.done).toEqual(completed);
    expect(loaded.goals.introduced).toEqual(introduced);
    expect(loaded.goals.noticeQueue).toEqual(notices);
  });
});
