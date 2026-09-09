import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { recordStormMinute, stepGoalOpportunity, stormMetrics } from "../src/sim/goalopportunity";
import { activeGoals, goalDeed, introduceGoals, type StormPlanSnapshot } from "../src/sim/goals";
import { beginAgain, land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { baseWalkSpeed, die } from "../src/sim/player";
import { markKnown } from "../src/sim/mapped";
import { fearsFell } from "../src/sim/fears";
import { cellOf, placeAt, straightKm } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { survivorRoute } from "../src/sim/routing";
import { current } from "../src/sim/record";
import { deserialize, serialize } from "../src/sim/save";
import { startTask, stepTask } from "../src/sim/tasks";
import type { GameState, GoalId } from "../src/sim/types";
import { skyReadDay, stepWeather } from "../src/sim/weather";
import { cellAt, regionAt } from "../src/world/gen";
import { findRoute, routeMinutes } from "../src/world/route";
import { siteCamp } from "./siting-helpers";

const THROUGH_SHELTER: GoalId[] = [
  "site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook",
  "findUsefulCover", "makeUsefulShelter",
];
const THROUGH_CAMP_SYSTEMS: GoalId[] = [
  ...THROUGH_SHELTER, "testShelter", "snareMeal", "huntMeal", "fishMeal", "trapMeal",
  "foodSource", "store", "fat", "firstOrder", "water", "keptDays",
];

function finish(state: GameState, ids: GoalId[]): void {
  for (const id of ids) state.goals.done[id] = true;
}

function activateShelterTest(state: GameState): void {
  finish(state, THROUGH_SHELTER);
  introduceGoals(state, ["testShelter"]);
}

function activateWeatherReading(state: GameState): void {
  finish(state, THROUGH_CAMP_SYSTEMS);
  state.minute = 7 * 1440;
  introduceGoals(state, ["readWeather"]);
}

function activateRemoteStorm(state: GameState): void {
  finish(state, [
    ...THROUGH_CAMP_SYSTEMS, "readWeather", "prepareWeather", "surviveForecast", "longOrder", "toolCare",
    "explore", "remoteRefuge", "fieldFire", "fieldMeal",
  ]);
  state.minute = 30 * 1440;
  introduceGoals(state, ["remoteStorm"]);
}

function activateRemoteRefuge(state: GameState): void {
  finish(state, [...THROUGH_CAMP_SYSTEMS, "readWeather", "prepareWeather", "surviveForecast"]);
  state.minute = 30 * 1440;
  introduceGoals(state, ["remoteRefuge"]);
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

  it("does not claim a forecast lesson while today's earlier sky reading prevents a meaningful new read", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    state.player.skyReadDay = calendar(state.minute, state.startDoy).dayIndex;
    state.weather.storm = {
      id: 9, source: "natural", kind: "rain", from: state.minute + 90,
      until: state.minute + 450, warned: false,
    };
    const rng = new Rng(23);

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ goal: "readWeather", status: "reserved", stormId: null });

    state.player.skyReadDay = null;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ goal: "readWeather", status: "announced", stormId: 9 });
  });

  it("releases a claimed storm after a premature empty read so a later announced read can teach something", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    state.weather.storm = {
      id: 10, source: "natural", kind: "rain", from: state.minute + 120,
      until: state.minute + 480, warned: false,
    };
    const rng = new Rng(24);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "reserved", stormId: 10 });

    expect(startTask(state, world, calendar(state.minute, state.startDoy), "readSky")).toBe(true);
    stepTask(state, world, calendar(state.minute, state.startDoy), rng, 10);
    expect(state.goals.done.readWeather).toBeUndefined();
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "reserved", stormId: null });

    state.player.skyReadDay = null;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    state.minute += 30;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "announced", stormId: 10 });
    expect(startTask(state, world, calendar(state.minute, state.startDoy), "readSky")).toBe(true);
    stepTask(state, world, calendar(state.minute, state.startDoy), rng, 10);
    expect(state.goals.done.readWeather).toBe(true);
  });

  it("releases a retry storm after a premature empty read when the new reader is not yet bound", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    finish(state, ["readWeather", "prepareWeather"]);
    introduceGoals(state, ["surviveForecast"]);
    state.weather.storm = {
      id: 11, source: "natural", kind: "rain", from: state.minute + 120,
      until: state.minute + 480, warned: false,
    };
    state.goals.opportunity = {
      goal: "readWeather", status: "reserved", createdAt: state.minute, attempts: 2,
      stormId: 11, source: "natural", area: null, announcedAt: null, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
      readerIndex: null, plan: null,
    };
    const rng = new Rng(25);

    expect(startTask(state, world, calendar(state.minute, state.startDoy), "readSky")).toBe(true);
    stepTask(state, world, calendar(state.minute, state.startDoy), rng, 10);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);

    expect(state.goals.opportunity).toMatchObject({ attempts: 2, status: "reserved", stormId: null, readerIndex: null });
    expect(state.goals.done.surviveForecast).toBeUndefined();
  });

  it("credits a read that completes exactly when a reserved storm first becomes readable", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    state.weather.storm = {
      id: 12, source: "natural", kind: "rain", from: state.minute + 120,
      until: state.minute + 480, warned: false,
    };
    const rng = new Rng(26);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "reserved", stormId: 12 });
    state.minute += 30;

    expect(startTask(state, world, calendar(state.minute, state.startDoy), "readSky")).toBe(true);
    stepTask(state, world, calendar(state.minute, state.startDoy), rng, 10);

    expect(state.goals.opportunity).toMatchObject({ status: "reserved", stormId: 12, readerIndex: current(state).index });
    expect(state.goals.done.readWeather).toBe(true);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity).toMatchObject({ status: "announced", stormId: 12, readerIndex: current(state).index });
  });

  it("waits past a current sky reading before synthesizing a forecast lesson", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    const rng = new Rng(27);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    state.minute += 3 * 1440;
    state.player.skyReadDay = skyReadDay(state);

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.weather.storm).toBeNull();
    expect(state.goals.opportunity).toMatchObject({ status: "reserved", stormId: null });

    state.player.skyReadDay = null;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.weather.storm).toMatchObject({ source: "synthetic" });
  });
});

describe("Chapter 1 shelter storm evidence", () => {
  function shelterAttempt(state: GameState, world: ReturnType<typeof newGame>["world"], stormId = 7): void {
    const centre = cellOf(state, world);
    state.goals.opportunity = {
      goal: "testShelter", status: "running", createdAt: 0, attempts: 1,
      stormId, source: "natural", area: { region: state.player.region, centre, radiusKm: 1 },
      announcedAt: 0, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };
  }

  it("completes the shelter test only from sixty matching weatherproof minutes while alive", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    shelterAttempt(state, world);

    expect(goalDeed(state, {
      kind: "stormEnded", minute: 120, stormId: 7, stormKind: "rain", survivorAlive: true,
      minutesByProtection: [0, 0, 60, 0], atCampMinutes: 60, awayFromCampMinutes: 0, maxWetness: 12,
    })).toContain("testShelter");
  });

  it("does not accept a short, exposed, fatal, remote, or unrelated storm", () => {
    const cases = [
      { stormId: 7, survivorAlive: true, minutesByProtection: [0, 0, 59, 0] as [number, number, number, number] },
      { stormId: 7, survivorAlive: true, minutesByProtection: [0, 60, 0, 0] as [number, number, number, number] },
      { stormId: 7, survivorAlive: false, minutesByProtection: [0, 0, 60, 0] as [number, number, number, number] },
      { stormId: 8, survivorAlive: true, minutesByProtection: [0, 0, 60, 0] as [number, number, number, number] },
    ];
    for (const evidence of cases) {
      const { state, world } = newGame(17);
      activateShelterTest(state);
      shelterAttempt(state, world);
      goalDeed(state, {
        kind: "stormEnded", minute: 120, stormKind: "rain", ...evidence, atCampMinutes: 0, awayFromCampMinutes: 60, maxWetness: 70,
      });
      expect(state.goals.done.testShelter).toBeUndefined();
    }
  });

  it("counts each storm minute at the survivor's actual location instead of their final cell", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    const origin = cellOf(state, world);
    const nearby = regionAt(world, state.player.region).cells.find((cell) => cell !== origin && cellAt(world, cell).terrain !== "water" && straightKm(world, origin, cell) <= 1)!;
    const st = state.regions[state.player.region];
    siteFor(st, origin).cover = 1;
    siteFor(st, nearby).structures.leanTo = true;
    shelterAttempt(state, world, 20);
    state.weather.storm = { id: 20, source: "natural", kind: "rain", from: 0, until: 60, warned: true };

    advance(state, world, 30);
    placeAt(state, world, nearby);
    advance(state, world, 30);

    expect(state.goals.opportunity?.minutesByProtection).toEqual([0, 30, 30, 0]);
    expect((state.goals.opportunity?.atCampMinutes ?? 0) + (state.goals.opportunity?.awayFromCampMinutes ?? 0)).toBe(60);
    expect(state.goals.opportunity?.maxWetness).toBeGreaterThanOrEqual(state.player.wetness);
    expect(state.goals.done.testShelter).toBeUndefined();
  });

  it("does not count weatherproof minutes after the survivor leaves the taught shelter area", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    const origin = cellOf(state, world);
    const far = regionAt(world, state.player.region).cells.find((cell) => cellAt(world, cell).terrain !== "water" && straightKm(world, origin, cell) > 1);
    expect(far).toBeDefined();
    const st = state.regions[state.player.region];
    siteFor(st, origin).structures.leanTo = true;
    siteFor(st, far!).structures.leanTo = true;
    shelterAttempt(state, world, 21);
    state.weather.storm = { id: 21, source: "natural", kind: "rain", from: 0, until: 60, warned: true };

    advance(state, world, 30);
    placeAt(state, world, far!);
    advance(state, world, 30);

    expect(state.goals.opportunity?.minutesByProtection).toEqual([0, 0, 30, 0]);
    expect(state.goals.done.testShelter).toBeUndefined();
  });

  it("uses elapsed fractional storm time instead of one minute for every advance step", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    const centre = cellOf(state, world);
    siteFor(state.regions[state.player.region], centre).structures.leanTo = true;
    shelterAttempt(state, world, 22);
    state.weather.storm = { id: 22, source: "natural", kind: "rain", from: 0, until: 60, warned: true };

    for (let i = 0; i < 60; i++) advance(state, world, 0.1);

    const metrics = state.goals.opportunity!;
    expect(metrics.minutesByProtection[0]).toBe(0);
    expect(metrics.minutesByProtection[1]).toBe(0);
    expect(metrics.minutesByProtection[2]).toBeCloseTo(6);
    expect(metrics.minutesByProtection[3]).toBe(0);
    expect(metrics.atCampMinutes + metrics.awayFromCampMinutes).toBeCloseTo(6);
    expect(state.goals.done.testShelter).toBeUndefined();
  });

  it("completes the shelter test after sixty elapsed fractional storm minutes", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    const centre = cellOf(state, world);
    siteFor(state.regions[state.player.region], centre).structures.leanTo = true;
    shelterAttempt(state, world, 23);
    state.weather.storm = { id: 23, source: "natural", kind: "rain", from: 0, until: 60, warned: true };

    for (let i = 0; i < 600; i++) advance(state, world, 0.1);

    expect(state.goals.opportunity?.minutesByProtection).toEqual([0, 0, 60, 0]);
    expect(state.goals.done.testShelter).toBe(true);
  });

  it("clips fractional accounting to the actual storm overlap at both boundaries", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    const centre = cellOf(state, world);
    siteFor(state.regions[state.player.region], centre).structures.leanTo = true;
    shelterAttempt(state, world, 24);
    state.weather.storm = { id: 24, source: "natural", kind: "rain", from: 1, until: 2, warned: false };

    state.minute = 0.95;
    advance(state, world, 0.1);
    expect(state.goals.opportunity?.minutesByProtection[2]).toBeCloseTo(0.05);

    state.minute = 1.95;
    advance(state, world, 0.1);
    expect(state.goals.opportunity?.minutesByProtection[2]).toBeCloseTo(0.1);
  });

  it("completes a sixty-minute storm whose fractional overlaps total just below sixty", () => {
    const { state, world } = newGame(17);
    activateShelterTest(state);
    const centre = cellOf(state, world);
    siteFor(state.regions[state.player.region], centre).structures.leanTo = true;
    shelterAttempt(state, world, 25);
    state.weather.storm = { id: 25, source: "natural", kind: "rain", from: 1.03, until: 61.03, warned: false };

    for (let i = 0; i < 88; i++) advance(state, world, 0.7);

    expect(state.goals.opportunity?.minutesByProtection[2]).toBeCloseTo(60);
    expect(state.goals.done.testShelter).toBe(true);
  });
});

describe("Chapter 2 forecast evidence", () => {
  function chapter2Attempt(state: GameState, stormId = 40): void {
    activateWeatherReading(state);
    finish(state, ["readWeather"]);
    introduceGoals(state, ["prepareWeather"]);
    state.goals.opportunity = {
      goal: "readWeather", status: "announced", createdAt: state.minute, attempts: 1,
      stormId, source: "natural", area: null, announcedAt: state.minute, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
      readerIndex: current(state).index, plan: null,
    };
  }

  function snapshot(kind: "returnCamp" | "localShelter" | "remoteRefuge", viable = true): StormPlanSnapshot {
    return {
      stormId: 40,
      minute: 100,
      knowledge: { stage: 2, coming: true, arrivalMinute: 100, kind: "rain", severity: "heavy", durationMinutes: null },
      recommended: kind,
      options: [{
        kind, target: { region: 1, cell: 20 },
        inputs: {
          forecast: { stage: 2, coming: true, arrivalMinute: 100, kind: "rain", severity: "heavy", durationMinutes: null },
          route: [], travelMinutes: 0, protection: 2, effectiveProtection: 2,
          fireLit: true, fuelKg: 12, activeGear: ["fireDrill"], packedGear: {},
          supplies: { firewoodKg: 4, foodKg: 1, waterLitres: 2 },
        },
        arrivalMargin: 0,
        viable,
        survivalScore: viable ? 300 : 100,
      }],
    };
  }

  it.each(["returnCamp", "localShelter", "remoteRefuge"] as const)("accepts a viable %s plan frozen at matching onset", (kind) => {
    const { state } = newGame(17);
    chapter2Attempt(state);
    expect(goalDeed(state, { kind: "stormStarted", minute: 100, stormId: 40, plan: snapshot(kind) })).toContain("prepareWeather");
  });

  it("rejects a wrong storm or a snapshot with only unfinished preparation", () => {
    for (const [stormId, plan] of [[41, snapshot("returnCamp")], [40, snapshot("localShelter", false)]] as const) {
      const { state } = newGame(17);
      chapter2Attempt(state);
      goalDeed(state, { kind: "stormStarted", minute: 100, stormId, plan });
      expect(state.goals.done.prepareWeather).toBeUndefined();
    }
  });

  it("freezes the onset plan after work in the interval ending at onset and never rewrites it", () => {
    const { state, world } = newGame(17);
    chapter2Attempt(state, 42);
    const meadow = regionAt(world, state.player.region).cells.find((cell) => cellAt(world, cell).terrain === "meadow")!;
    placeAt(state, world, meadow);
    const site = siteFor(state.regions[state.player.region], meadow);
    site.emergencyMinutes = 89;
    state.weather.storm = { id: 42, source: "natural", kind: "rain", from: state.minute + 1, until: state.minute + 361, warned: true };
    expect(startTask(state, world, calendar(state.minute, state.startDoy), "emergencyShelter")).toBe(true);
    advance(state, world, 1);
    expect(site.emergencyMinutes).toBe(90);
    const frozen = structuredClone(state.goals.opportunity?.plan);
    expect(frozen?.options.find((option) => option.kind === "localShelter")?.inputs.protection).toBe(2);
    expect(frozen?.options.some((option) => option.viable)).toBe(true);
    site.emergencyMinutes = 240;
    state.player.fieldFire = { cell: meadow, fuelKg: 30 };
    expect(state.goals.opportunity?.plan).toEqual(frozen);
    expect(state.goals.done.prepareWeather).toBe(true);
  });

  it("splits a fractional onset to freeze its exact pre-task state", () => {
    const { state, world } = newGame(17);
    chapter2Attempt(state, 43);
    const meadow = regionAt(world, state.player.region).cells.find((cell) => cellAt(world, cell).terrain === "meadow")!;
    placeAt(state, world, meadow);
    const site = siteFor(state.regions[state.player.region], meadow);
    site.emergencyMinutes = 89;
    const onset = state.minute + 0.25;
    state.weather.storm = { id: 43, source: "natural", kind: "rain", from: onset, until: onset + 360, warned: true };
    expect(startTask(state, world, calendar(state.minute, state.startDoy), "emergencyShelter")).toBe(true);

    advance(state, world, 1);

    expect(state.goals.opportunity?.plan?.minute).toBe(onset);
    expect(state.goals.opportunity?.plan?.options.find((option) => option.kind === "localShelter")?.inputs.protection).toBe(1);
    expect(site.emergencyMinutes).toBe(90);
    expect(state.minute).toBe(onset + 0.75);
  });

  it("completes survival only for the matching storm, alive, with the same reader still current", () => {
    const ended = (stormId: number, survivorAlive: boolean) => ({
      kind: "stormEnded" as const, minute: 500, stormId, stormKind: "rain" as const, survivorAlive,
      minutesByProtection: [0, 0, 360, 0] as [number, number, number, number],
      atCampMinutes: 360, awayFromCampMinutes: 0, maxWetness: 10,
    });
    const good = newGame(17).state;
    chapter2Attempt(good);
    finish(good, ["prepareWeather"]);
    introduceGoals(good, ["surviveForecast"]);
    expect(goalDeed(good, ended(40, true))).toContain("surviveForecast");

    for (const mode of ["wrong-storm", "dead", "heir"] as const) {
      const state = newGame(17).state;
      chapter2Attempt(state);
      finish(state, ["prepareWeather"]);
      introduceGoals(state, ["surviveForecast"]);
      if (mode === "heir") state.survivors.push({ ...structuredClone(current(state)), index: current(state).index + 1 });
      goalDeed(state, ended(mode === "wrong-storm" ? 41 : 40, mode !== "dead"));
      expect(state.goals.done.surviveForecast, mode).toBeUndefined();
    }
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
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity!.stormId).toBe(1);
  });

  it("claims Chapter 3 weather from a stored refuge while the survivor is still at home", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateRemoteStorm(state);
    const home = cellOf(state, world);
    const remote = regionAt(world, state.player.region).neighbours
      .map((neighbour) => regionAt(world, neighbour.id))
      .find((region) => findRoute(world, home, region.campCell) !== null)!;
    const refuge = remote.campCell;
    const mapped = findRoute(world, home, refuge);
    expect(mapped).not.toBeNull();
    for (const cell of [home, ...(mapped ?? [])]) markKnown(state, cell);
    const route = survivorRoute(state, world, home, refuge, "none", fearsFell(state));
    expect(route).not.toBeNull();
    const lead = routeMinutes(world, route!, baseWalkSpeed(state, calendar(state.minute, state.startDoy), state.weather), "none") + 30;
    state.goals.opportunity = {
      goal: "remoteStorm", status: "reserved", createdAt: state.minute, attempts: 1,
      stormId: null, source: null, area: { region: remote.id, centre: refuge, radiusKm: 1 },
      announcedAt: null, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
      atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };
    state.weather.storm = { id: 80, source: "natural", kind: "rain", from: state.minute + lead - 0.01, until: state.minute + lead + 360, warned: false };
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(80));
    expect(state.goals.opportunity?.stormId).toBeNull();

    state.weather.storm = { id: 81, source: "natural", kind: "rain", from: state.minute + lead, until: state.minute + lead + 360, warned: false };
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(81));
    expect(cellOf(state, world)).toBe(home);
    expect(state.goals.opportunity).toMatchObject({ stormId: 81, source: "natural" });
  });

  it("claims and retries refuge weather from home before the field fire and meal lessons", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateRemoteRefuge(state);
    const home = state.player.region;
    const remote = regionAt(world, home).neighbours[0].id;
    const refuge = regionAt(world, remote).campCell;
    placeAt(state, world, refuge);
    siteFor(regionState(state, world, remote), refuge).cover = 2;
    goalDeed(state, {
      kind: "protectionChanged", minute: state.minute, region: remote, cell: refuge,
      from: 1, to: 2, source: "improved",
    }, world);
    const opportunity = state.goals.opportunity!;
    const homeCell = state.regions[home].campCell!;
    const mapped = findRoute(world, refuge, homeCell);
    expect(mapped).not.toBeNull();
    for (const cell of [refuge, ...(mapped ?? [])]) markKnown(state, cell);
    placeAt(state, world, homeCell);
    const route = survivorRoute(state, world, homeCell, refuge, "none", fearsFell(state));
    expect(route).not.toBeNull();
    const lead = routeMinutes(world, route!, baseWalkSpeed(state, calendar(state.minute, state.startDoy), state.weather), "none") + 30;
    state.weather.storm = {
      id: 82, source: "natural", kind: "rain", from: state.minute + lead,
      until: state.minute + lead + 360, warned: false,
    };

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(82));

    expect(cellOf(state, world)).toBe(homeCell);
    expect(state.goals.done.fieldFire).toBeUndefined();
    expect(state.goals.done.fieldMeal).toBeUndefined();
    expect(state.goals.opportunity).toBe(opportunity);
    expect(state.goals.opportunity).toMatchObject({ goal: "remoteStorm", stormId: 82, source: "natural" });

    const stormEnd = state.weather.storm.until;
    state.minute = stormEnd;
    state.weather.storm = null;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(82));
    expect(state.goals.opportunity).toMatchObject({ status: "resolved", attempts: 1 });
    state.weather.stormFreeSince = stormEnd;
    state.minute = stormEnd + 1440;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(82));
    expect(state.goals.opportunity).toMatchObject({
      goal: "remoteStorm", status: "reserved", attempts: 2, stormId: null,
      area: { region: remote, centre: refuge, radiusKm: 1 },
    });
    expect(state.goals.done.fieldFire).toBeUndefined();
    expect(state.goals.done.fieldMeal).toBeUndefined();
  });

  it("synthesizes Chapter 3 weather after three dawns even before field lessons finish", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateRemoteRefuge(state);
    const remote = regionAt(world, state.player.region).neighbours[0].id;
    const refuge = regionAt(world, remote).campCell;
    placeAt(state, world, refuge);
    goalDeed(state, {
      kind: "protectionChanged", minute: state.minute, region: remote, cell: refuge,
      from: 1, to: 2, source: "improved",
    }, world);
    state.minute += 3 * 1440;

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(83));

    expect(state.goals.done.fieldFire).toBeUndefined();
    expect(state.goals.opportunity).toMatchObject({ goal: "remoteStorm", source: "synthetic" });
    expect(state.weather.storm).toMatchObject({ source: "synthetic" });
  });
});

describe("Chapter 3 refuge storm evidence", () => {
  function remoteAttempt(state: GameState, world: ReturnType<typeof newGame>["world"], stormId = 90) {
    siteCamp(state, world);
    activateRemoteStorm(state);
    const home = state.player.region;
    const remote = regionAt(world, regionAt(world, home).neighbours[0].id);
    state.goals.opportunity = {
      goal: "remoteStorm", status: "running", createdAt: state.minute, attempts: 1,
      stormId, source: "natural", area: { region: remote.id, centre: remote.campCell, radiusKm: 1 },
      announcedAt: state.minute, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
      atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };
    return { home, remote };
  }

  it("counts adequate protection anywhere in the refuge region, beyond the local one-kilometre radius", () => {
    const { state, world } = newGame(17);
    const { remote } = remoteAttempt(state, world);
    const far = remote.cells.reduce((best, cell) => straightKm(world, remote.campCell, cell) > straightKm(world, remote.campCell, best) ? cell : best, remote.campCell);
    expect(straightKm(world, remote.campCell, far)).toBeGreaterThan(1);
    placeAt(state, world, far);
    siteFor(state.regions[remote.id], far).structures.leanTo = true;
    state.weather.storm = { id: 90, source: "natural", kind: "rain", from: state.minute, until: state.minute + 60, warned: true };

    advance(state, world, 60);

    expect(state.goals.opportunity?.minutesByProtection[2]).toBe(60);
    expect(state.goals.opportunity?.atCampMinutes).toBe(0);
    expect(state.goals.done.remoteStorm).toBe(true);
  });

  it("accepts a snow windbreak but rejects a high-profile lean-to in a gale", () => {
    const snow = newGame(17);
    const snowAttempt = remoteAttempt(snow.state, snow.world, 92);
    const snowCell = snowAttempt.remote.cells[0];
    placeAt(snow.state, snow.world, snowCell);
    siteFor(snow.state.regions[snowAttempt.remote.id], snowCell).cover = 1;
    snow.state.weather.storm = { id: 92, source: "natural", kind: "snow", from: snow.state.minute, until: snow.state.minute + 60, warned: true };
    recordStormMinute(snow.state, snow.world, 92, "snow", 60);
    expect(stormMetrics(snow.state, 92).minutesByProtection).toEqual([0, 60, 0, 0]);
    goalDeed(snow.state, {
      kind: "stormEnded", minute: snow.state.minute + 60, stormId: 92, stormKind: "snow", survivorAlive: true,
      ...stormMetrics(snow.state, 92),
    }, snow.world);
    expect(snow.state.goals.done.remoteStorm).toBe(true);

    const gale = newGame(17);
    const galeAttempt = remoteAttempt(gale.state, gale.world, 93);
    const exposed = galeAttempt.remote.cells.find((cell) => cellAt(gale.world, cell).terrain === "meadow")!;
    placeAt(gale.state, gale.world, exposed);
    siteFor(gale.state.regions[galeAttempt.remote.id], exposed).structures.leanTo = true;
    gale.state.weather.storm = { id: 93, source: "natural", kind: "gale", from: gale.state.minute, until: gale.state.minute + 60, warned: true };
    recordStormMinute(gale.state, gale.world, 93, "gale", 60);
    expect(stormMetrics(gale.state, 93).minutesByProtection).toEqual([0, 60, 0, 0]);
    goalDeed(gale.state, {
      kind: "stormEnded", minute: gale.state.minute + 60, stormId: 93, stormKind: "gale", survivorAlive: true,
      ...stormMetrics(gale.state, 93),
    }, gale.world);
    expect(gale.state.goals.done.remoteStorm).toBeUndefined();

    const lee = newGame(17);
    const leeAttempt = remoteAttempt(lee.state, lee.world, 94);
    const spruce = leeAttempt.remote.cells.find((cell) => cellAt(lee.world, cell).terrain === "spruce")!;
    placeAt(lee.state, lee.world, spruce);
    siteFor(lee.state.regions[leeAttempt.remote.id], spruce).cover = 1;
    lee.state.weather.storm = { id: 94, source: "natural", kind: "gale", from: lee.state.minute, until: lee.state.minute + 60, warned: true };

    advance(lee.state, lee.world, 60);

    expect(lee.state.goals.opportunity?.minutesByProtection).toEqual([0, 0, 60, 0]);
    expect(lee.state.goals.done.remoteStorm).toBe(true);
  });

  it("records camp time globally, resolves a homeward miss, and retries without undoing earlier lessons", () => {
    const { state, world } = newGame(17);
    const { home } = remoteAttempt(state, world, 91);
    const camp = state.regions[home].campCell!;
    placeAt(state, world, camp);
    siteFor(state.regions[home], camp).structures.leanTo = true;
    state.weather.storm = { id: 91, source: "natural", kind: "rain", from: state.minute, until: state.minute + 60, warned: true };

    advance(state, world, 60);

    expect(state.goals.opportunity).toMatchObject({ status: "resolved", attempts: 1, atCampMinutes: 60 });
    expect(state.goals.done.remoteStorm).toBeUndefined();
    for (const id of ["remoteRefuge", "fieldFire", "fieldMeal"] as const) expect(state.goals.done[id]).toBe(true);
    const resolvedAt = state.goals.opportunity!.resolvedAt!;
    state.minute = resolvedAt + 1440;
    state.weather.storm = null;
    state.weather.stormFreeSince = resolvedAt;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(91));
    expect(state.goals.opportunity).toMatchObject({ status: "reserved", attempts: 2, stormId: null });
    for (const id of ["remoteRefuge", "fieldFire", "fieldMeal"] as const) expect(state.goals.done[id]).toBe(true);
  });

  it("keeps an introduced remote-storm lesson completable by an heir before day thirty-one", () => {
    const { state, world } = newGame(17);
    const { remote } = remoteAttempt(state, world, 96);
    state.weather.storm = { id: 96, source: "natural", kind: "rain", from: state.minute, until: state.minute + 60, warned: true };
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    state.minute = 1440;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(96));
    expect(activeGoals(state, calendar(state.minute, state.startDoy))).toContain("remoteStorm");
    expect(state.goals.opportunity).toMatchObject({ goal: "remoteStorm", status: "reserved", attempts: 2 });

    state.goals.opportunity!.status = "running";
    state.goals.opportunity!.stormId = 97;
    state.goals.opportunity!.area = { region: remote.id, centre: remote.campCell, radiusKm: 1 };
    goalDeed(state, {
      kind: "stormEnded", minute: state.minute + 60, stormId: 97, stormKind: "rain", survivorAlive: true,
      minutesByProtection: [0, 0, 60, 0], atCampMinutes: 0, awayFromCampMinutes: 60, maxWetness: 10,
    }, world);
    expect(state.goals.done.remoteStorm).toBe(true);
  });

  it("keeps the next field lesson eligible for an heir when the refuge opportunity opened before its modal", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateRemoteRefuge(state);
    const remote = regionAt(world, state.player.region).neighbours[0].id;
    const refuge = regionAt(world, remote).campCell;
    placeAt(state, world, refuge);
    goalDeed(state, {
      kind: "protectionChanged", minute: state.minute, region: remote, cell: refuge,
      from: 1, to: 2, source: "improved",
    }, world);
    expect(state.goals.introduced.fieldFire).toBeUndefined();
    die(state, "froze", regionAt(world, remote).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    expect(activeGoals(state, calendar(state.minute, state.startDoy))).toContain("fieldFire");
    introduceGoals(state, ["fieldFire"]);
    state.player.fieldFire = { cell: cellOf(state, world), fuelKg: 1 };
    goalDeed(state, { kind: "fireLit", minute: state.minute, region: state.player.region, cell: cellOf(state, world), atCamp: false }, world);
    expect(state.goals.done.fieldFire).toBe(true);
  });

  it("keeps the next forecast lesson eligible for an heir while its chapter opportunity remains", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateWeatherReading(state);
    finish(state, ["readWeather"]);
    state.goals.opportunity = {
      goal: "readWeather", status: "running", createdAt: state.minute, attempts: 1,
      stormId: 13, source: "natural", area: null, announcedAt: state.minute, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
      readerIndex: current(state).index, plan: null,
    };
    state.weather.storm = { id: 13, source: "natural", kind: "rain", from: state.minute, until: state.minute + 60, warned: true };
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    expect(state.goals.introduced.prepareWeather).toBeUndefined();
    expect(activeGoals(state, calendar(state.minute, state.startDoy))).toContain("prepareWeather");
  });

  it("treats a later camp in the refuge region as beyond the original home", () => {
    const { state, world } = newGame(17);
    const { remote } = remoteAttempt(state, world, 95);
    state.goals.chapter3HomeRegion = state.player.region;
    state.regions[remote.id] = structuredClone(state.regions[state.player.region]);
    state.regions[remote.id].campCell = remote.campCell;
    placeAt(state, world, remote.campCell);
    siteFor(state.regions[remote.id], remote.campCell).structures.leanTo = true;
    state.weather.storm = { id: 95, source: "natural", kind: "rain", from: state.minute, until: state.minute + 60, warned: true };

    advance(state, world, 60);

    expect(state.goals.opportunity?.atCampMinutes).toBe(0);
    expect(state.goals.done.remoteStorm).toBe(true);
  });
});

describe("misses and retries", () => {
  it("replaces a successful Chapter 1 opportunity when Chapter 2 becomes active", () => {
    const { state, world } = newGame(17);
    activateWeatherReading(state);
    state.goals.opportunity = {
      goal: "testShelter", status: "resolved", createdAt: 100, attempts: 1,
      stormId: 1, source: "natural", area: null, announcedAt: 200, resolvedAt: 600,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };

    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), new Rng(76));

    expect(state.goals.opportunity).toEqual({
      goal: "readWeather", status: "reserved", createdAt: state.minute, attempts: 1,
      stormId: null, source: null, area: null, announcedAt: null, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
      readerIndex: null, plan: null,
    });
  });

  it("clears a successful Chapter 2 opportunity so contextual Chapter 3 can own the slot", () => {
    const { state, world } = newGame(17);
    activateRemoteStorm(state);
    state.goals.opportunity = {
      goal: "readWeather", status: "resolved", createdAt: 100, attempts: 2,
      stormId: 2, source: "synthetic", area: null, announcedAt: 200, resolvedAt: 700,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
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
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
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
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };
    state.weather.nextStormId = 3;
    state.minute = 1000;
    state.weather.storm = { id: 2, source: "natural", kind: "snow", from: 900, until: 1100, warned: true };
    const rng = new Rng(86);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity!.status).toBe("resolved");

    state.minute = 1100;
    stepWeather(state.weather, calendar(state.minute, state.startDoy), rng, 1, state.minute);
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.weather.storm).toBeNull();
    state.minute = 2539;
    stepGoalOpportunity(state, world, calendar(state.minute, state.startDoy), rng);
    expect(state.goals.opportunity!.status).toBe("resolved");
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
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
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
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };
    state.goals.introduced = { site: true, testShelter: true };
    const area = structuredClone(state.goals.opportunity!.area);
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
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
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
