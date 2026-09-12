/**
 * What an heir inherits of a weather lesson. Every case here goes through
 * `beginAgain`, which steps the world minute by minute across the gap between a
 * death and the next boat, so they cost seconds apiece and live in the slow
 * suite; the rest of the opportunity-context cases stay per-commit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../../src/rng";
import { advance } from "../../src/sim/advance";
import { calendar } from "../../src/sim/calendar";
import { stepOpportunityContext } from "../../src/sim/opportunity-context";
import { queueOpportunityMessage, recordOpportunityEvent } from "../../src/sim/opportunities";
import { beginAgain, land } from "../../src/sim/landing";
import { newGame } from "../../src/sim/newgame";
import { die } from "../../src/sim/player";
import { cellOf, placeAt } from "../../src/sim/position";
import { current } from "../../src/sim/record";
import { readSave, serialize } from "../../src/sim/save";
import { regionAt } from "../../src/world/gen";
import { activeOpportunityKeys, reveal } from "../opportunity-helpers";
import {
  activateRemoteRefuge, activateShelterTest, activateWeatherReading, finish, remoteAttempt,
} from "../opportunity-context-helpers";
import { requireCamp, siteCamp } from "../siting-helpers";
import { landNeighbour } from "../world-facts";
import { testRain } from "../weather-helpers";

afterEach(() => vi.restoreAllMocks());

describe("Chapter 3 refuge storm evidence, inherited", () => {
  beforeEach(() => testRain(8, 5, 40));

  it("keeps an introduced remote-storm lesson completable by an heir before day thirty-one", () => {
    const { state, world } = newGame(17);
    const { remote } = remoteAttempt(state, world, 96);
    state.weather.storm = { id: 96, source: "natural", kind: "rain", from: state.minute, until: state.minute + 60, warned: true };
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    state.minute = 1440;
    stepOpportunityContext(state, world, calendar(state.minute, state.startDoy), new Rng(96));
    expect(activeOpportunityKeys(state, calendar(state.minute, state.startDoy))).toContain("remoteStorm");
    expect(state.opportunities.context.weather).toMatchObject({ opportunity: "remoteStorm", status: "reserved", attempts: 2 });

    state.opportunities.context.weather!.status = "running";
    state.opportunities.context.weather!.stormId = 97;
    state.opportunities.context.weather!.area = { region: remote.id, centre: remote.campCell!, radiusKm: 1 };
    recordOpportunityEvent(state, {
      kind: "stormEnded", minute: state.minute + 60, stormId: 97, stormKind: "rain", survivorAlive: true,
      minutesByProtection: [0, 0, 60, 0], atCampMinutes: 0, awayFromCampMinutes: 60, maxWetness: 10 }, world);
    expect(state.opportunities.completedAt.remoteStorm).toBeDefined();
  });

  it("keeps the next field lesson eligible for an heir when the refuge opportunity opened before its modal", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateRemoteRefuge(state);
    const remote = landNeighbour(world, state.player.region);
    const refuge = requireCamp(regionAt(world, remote));
    placeAt(state, world, refuge);
    recordOpportunityEvent(state, {
      kind: "protectionChanged", minute: state.minute, region: remote, cell: refuge,
      from: 1, to: 2, source: "improved" }, world);
    expect(state.opportunities.discoveredAt.fieldFire).toBeDefined();
    die(state, "froze", regionAt(world, remote).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    expect(activeOpportunityKeys(state, calendar(state.minute, state.startDoy))).toContain("fieldFire");
    reveal(state, ["fieldFire"]);
    state.player.fieldFire = { cell: cellOf(state, world), fuelKg: 1 };
    recordOpportunityEvent(state, { kind: "fireLit", minute: state.minute, region: state.player.region, cell: cellOf(state, world), atCamp: false }, world);
    expect(state.opportunities.completedAt.fieldFire).toBeDefined();
  });

  it("keeps the next forecast lesson eligible for an heir while its chapter opportunity remains", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateWeatherReading(state);
    finish(state, ["readWeather"]);
    state.opportunities.context.weather = {
      opportunity: "readWeather", status: "running", createdAt: state.minute, attempts: 1,
      stormId: 13, source: "natural", area: null, announcedAt: state.minute, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
      readerIndex: current(state).index, plan: null };
    state.weather.storm = { id: 13, source: "natural", kind: "rain", from: state.minute, until: state.minute + 60, warned: true };
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    expect(state.opportunities.discoveredAt.prepareWeather).toBeDefined();
    expect(activeOpportunityKeys(state, calendar(state.minute, state.startDoy))).toContain("prepareWeather");
  });
});

describe("misses and retries, inherited", () => {
  it("rebases a missed attempt through begin again and retries after one heir day", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateShelterTest(state);
    state.minute = 2000;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 1900, until: 2200, warned: true };
    state.weather.nextStormId = 2;
    state.opportunities.context.weather = {
      opportunity: "testShelter", status: "running", createdAt: 1800, attempts: 1,
      stormId: 1, source: "natural",
      area: { region: state.player.region, centre: cellOf(state, world), radiusKm: 1 },
      announcedAt: 1840, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
    state.opportunities.discoveredAt = { site: 0, testShelter: 0 };
    const area = structuredClone(state.opportunities.context.weather!.area);
    const completed = structuredClone(state.opportunities.completedAt);
    const introduced = structuredClone(state.opportunities.discoveredAt);
    die(state, "froze", regionAt(world, state.player.region).name);

    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });

    expect(state.minute).toBe(0);
    expect(state.weather.storm).toBeNull();
    expect(state.weather.stormFreeSince).toBe(0);
    expect(state.opportunities.completedAt).toEqual(completed);
    expect(state.opportunities.discoveredAt).toMatchObject(introduced);
    expect(state.opportunities.context.weather).toMatchObject({
      opportunity: "testShelter", status: "resolved", createdAt: 0, attempts: 1,
      area, resolvedAt: 0 });
    state.minute = 1439;
    stepOpportunityContext(state, world, calendar(state.minute, state.startDoy), new Rng(92));
    expect(state.opportunities.context.weather?.attempts).toBe(1);
    state.minute = 1440;
    stepOpportunityContext(state, world, calendar(state.minute, state.startDoy), new Rng(92));
    expect(state.opportunities.context.weather).toMatchObject({
      opportunity: "testShelter", status: "reserved", createdAt: 1440, attempts: 2,
      stormId: null, source: null, area });
  });

  it("normalizes a prior landing save on direct land before the heir retry day", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    activateShelterTest(state);
    state.minute = 2000;
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    const area = { region: state.player.region, centre: cellOf(state, world), radiusKm: 1 } as const;
    state.opportunities.context.weather = {
      opportunity: "testShelter", status: "resolved", createdAt: 81000, attempts: 4,
      stormId: 8, source: "natural", area, announcedAt: 81500, resolvedAt: 82000,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
    state.weather.stormFreeSince = 82750;
    state.opportunities.discoveredAt = { site: 0, testShelter: 0 };
    queueOpportunityMessage(state, "The rain passed without shelter being tested. Another opportunity will come.");
    const completed = structuredClone(state.opportunities.completedAt);
    const introduced = structuredClone(state.opportunities.discoveredAt);
    const notices = [...state.opportunities.notices.flatMap((notice) => notice.messages)];
    const loaded = readSave(serialize(state))!.state;

    land(loaded, world, { first: "Ilze", last: "Berg" });
    advance(loaded, world, 1439);
    expect(loaded.opportunities.context.weather?.attempts).toBe(4);
    advance(loaded, world, 1);

    expect(loaded.minute).toBe(1440);
    expect(loaded.weather.stormFreeSince).toBe(0);
    expect(loaded.opportunities.context.weather).toMatchObject({
      opportunity: "testShelter", status: "reserved", createdAt: 1440, attempts: 5,
      stormId: null, source: null, area });
    expect(loaded.opportunities.completedAt).toEqual(completed);
    expect(loaded.opportunities.discoveredAt).toMatchObject(introduced);
    expect(loaded.opportunities.notices.flatMap((notice) => notice.messages)).toEqual(notices);
  });
});
