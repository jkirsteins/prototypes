import { reveal } from "./opportunity-helpers";
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { bodyStep, minutesToCamp, peekNeed } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { newGame, newPerson } from "../src/sim/newgame";
import { orderGate } from "../src/sim/ladder";
import { addOrder, orderMet, ordersHere, runOrders } from "../src/sim/orders";
import { current, record } from "../src/sim/record";
import { readSave, serialize } from "../src/sim/save";
import { levelMinutes, masteryKey, skillOf } from "../src/sim/skills";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { TASK_IDS } from "../src/sim/types";
import * as weather from "../src/sim/weather";
import { filterRows } from "../src/ui/dopanel";
import { addItem, qty } from "../src/sim/inventory";
import { cellOf, placeAt } from "../src/sim/position";
import { patchCenter } from "../src/world/spatial";
import { regionState, siteFor } from "../src/sim/regionstate";
import { cellAt, regionAt } from "../src/world/gen";
import { protectionOf } from "../src/sim/shelter";
import type { OpportunityKey, WeatherOpportunityContext } from "../src/sim/types";
import { testRain } from "./weather-helpers";
import { terrainCellNear, terrainRunNear } from "./world-facts";
import { mapRegion } from "../src/sim/mapped";
import { passable } from "../src/world/route";

function game() {
  const g = newGame(17);
  testRain(0);
  current(g.state).person.quirks = [];
  return g;
}

const THROUGH_SHELTER: OpportunityKey[] = [
  "site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook",
  "findUsefulCover", "makeUsefulShelter", "testShelter", "snareMeal", "huntMeal", "fishMeal",
  "trapMeal", "foodSource", "store", "fat", "firstOrder", "water", "keptDays",
];

function weatherLesson(state: ReturnType<typeof game>["state"], stormId: number, status: WeatherOpportunityContext["status"] = "announced"): void {
  for (const id of THROUGH_SHELTER) state.opportunities.completedAt[id] = 0;
  state.minute = 7 * 1440;
  reveal(state, ["readWeather"]);
  state.opportunities.context.weather = {
    opportunity: "readWeather", status, createdAt: state.minute, attempts: 1,
    stormId, source: "natural", area: null, announcedAt: state.minute, resolvedAt: null,
    minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
}

describe("weather sense", () => {
  it("describes only the facts actually knowable about a specific forecast storm", () => {
    const { state } = game();
    const storm = { id: 9, source: "natural" as const, kind: "gale" as const, from: 100, until: 520, warned: false };
    state.weather.storm = storm;
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 0, coming: false, arrivalMinute: null, kind: null, severity: null, durationMinutes: null });
    state.minute = 40;
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 1, coming: true, arrivalMinute: null, kind: null, severity: null, durationMinutes: null });
    state.skills.weatherSense.xp = levelMinutes(13);
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 2, coming: true, arrivalMinute: 100, kind: "gale", severity: "heavy", durationMinutes: null });
    state.skills.weatherSense.xp = levelMinutes(25);
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 3, coming: true, arrivalMinute: 100, kind: "gale", severity: "heavy", durationMinutes: 420 });
  });

  it("credits a matching announced sky read only when it reveals a new fact and binds the reader", () => {
    const { state, world } = game();
    weatherLesson(state, 7);
    state.weather.storm = { id: 7, source: "natural", kind: "rain", from: state.minute + 90, until: state.minute + 450, warned: false };
    const before = weather.forecastKnowledge(state, state.weather.storm);
    expect(before.stage).toBe(0);
    startTask(state, world, calendar(state.minute, state.startDoy), "readSky");
    stepTask(state, world, calendar(state.minute, state.startDoy), new Rng(1), 10);
    expect(state.opportunities.completedAt.readWeather).toBeDefined();
    expect(state.opportunities.context.weather?.readerIndex).toBe(current(state).index);
    expect(weather.forecastKnowledge(state, state.weather.storm).stage).toBeGreaterThan(0);
  });

  it("binds a new reader on a retry after the reading lesson is already complete", () => {
    const { state, world } = game();
    weatherLesson(state, 8);
    state.opportunities.completedAt.readWeather = 0;
    reveal(state, ["prepareWeather"]);
    state.opportunities.context.weather!.attempts = 2;
    state.opportunities.context.weather!.readerIndex = null;
    state.weather.storm = { id: 8, source: "natural", kind: "rain", from: state.minute + 90, until: state.minute + 450, warned: false };

    expect(startTask(state, world, calendar(state.minute, state.startDoy), "readSky")).toBe(true);
    stepTask(state, world, calendar(state.minute, state.startDoy), new Rng(1), 10);

    expect(state.opportunities.context.weather?.readerIndex).toBe(current(state).index);
  });

  it("does not credit a repeated read, a passive warning, an unrelated storm, or a read with no new fact", () => {
    const cases = ["repeated", "unrelated", "no-new-fact"] as const;
    for (const kind of cases) {
      const { state, world } = game();
      weatherLesson(state, 7);
      const stormId = kind === "unrelated" ? 8 : 7;
      state.weather.storm = { id: stormId, source: "natural", kind: "rain", from: state.minute + 60, until: state.minute + 420, warned: false };
      if (kind === "repeated") state.player.skyReadDay = weather.skyReadDay(state);
      startTask(state, world, calendar(state.minute, state.startDoy), "readSky");
      stepTask(state, world, calendar(state.minute, state.startDoy), new Rng(1), 10);
      expect(state.opportunities.completedAt.readWeather, kind).toBeUndefined();
      expect(state.opportunities.context.weather?.readerIndex, kind).toBeFalsy();
    }

    const { state, world } = game();
    testRain(8, 5, 40);
    weatherLesson(state, 11, "reserved");
    state.weather.storm = { id: 11, source: "natural", kind: "rain", from: state.minute + 61, until: state.minute + 421, warned: false };
    advance(state, world, 1);
    expect(state.opportunities.context.weather?.status).toBe("announced");
    expect(state.opportunities.completedAt.readWeather).toBeUndefined();
  });
  it("stacks practice, six survived storms, a weather eye and a current reading", () => {
    expect(weather.warningMinutes).toBeTypeOf("function");
    const { state } = game();
    expect(weather.warningMinutes(state)).toBe(60);
    state.skills.weatherSense.xp = levelMinutes(7);
    expect(weather.warningMinutes(state)).toBe(90);
    for (let i = 0; i < 9; i++) record(state, { kind: "storm" });
    expect(weather.warningMinutes(state)).toBe(150);
    current(state).person.quirks.push("weatherEye");
    expect(weather.warningMinutes(state)).toBe(180);
    state.player.skyReadDay = 0;
    expect(weather.warningMinutes(state)).toBe(210);
  });

  it.each([[1, 1], [12, 1], [13, 2], [24, 2], [25, 3]])("at level %i discloses stage %i", (level, stage) => {
    expect(weather.forecastStage).toBeTypeOf("function");
    const { state } = game();
    state.skills.weatherSense.xp = levelMinutes(level);
    expect(weather.forecastStage(state)).toBe(stage);
  });

  it("keeps an observation through midnight and expires it at sunrise", () => {
    expect(weather.warningMinutes).toBeTypeOf("function");
    const { state } = game();
    state.player.skyReadDay = 0;
    state.minute = 1000;
    expect(calendar(state.minute).dayIndex).toBe(1);
    expect(weather.warningMinutes(state)).toBe(90);
    const dawn = 1440 - 480 + calendar(1000).sunrise * 60;
    state.minute = dawn - 0.01;
    expect(weather.warningMinutes(state)).toBe(90);
    state.minute = dawn;
    expect(weather.warningMinutes(state)).toBe(60);
  });

  it("reads for ten actual minutes at every skill and trains the weather technique", () => {
    expect(TASK_IDS).toContain("readSky");
    const { state, world } = game();
    state.skills.weatherSense.xp = levelMinutes(25);
    const cal = calendar(state.minute);
    expect(check(state, world, cal, "readSky")).toMatchObject({ ok: true, duration: 10 });
    expect(skillOf("readSky")).toBe("weatherSense");
    expect(masteryKey(state, world, "readSky")).toBe("readSky");
    startTask(state, world, cal, "readSky");
    stepTask(state, world, cal, new Rng(1), 9);
    expect(state.player.skyReadDay).toBeNull();
    stepTask(state, world, cal, new Rng(1), 1);
    expect(state.player.skyReadDay).toBe(0);
    expect(state.task).toBeNull();
    expect(state.skills.weatherSense.mastery.readSky).toBeGreaterThan(0);
    expect(state.log.at(-1)?.text).toContain("no storm");
  });

  it("runs a daily sky order once and keeps it for the next day", () => {
    expect(TASK_IDS).toContain("readSky");
    const { state, world } = game();
    const cal = calendar(state.minute);
    const order = addOrder(state, world, { task: "readSky", where: "nearest", until: { kind: "daily", n: 1 }, deliver: "leave" }, "job");
    runOrders(state, world, cal, new Rng(1));
    expect(state.task?.id).toBe("readSky");
    stepTask(state, world, cal, new Rng(1), 10);
    runOrders(state, world, cal, new Rng(1));
    expect(order.done).toBe(1);
    expect(orderMet(state, world, cal, order, false)).toBe(true);
    expect(ordersHere(state, world)).toContain(order);
    state.minute += 1440;
    runOrders(state, world, calendar(state.minute), new Rng(1));
    expect(state.task?.id).toBe("readSky");
  });

  it("uses the ordinary weather-skill condition gate and can be found by forecast words", () => {
    const { state, world } = game();
    const req = { task: "readSky", where: "nearest", until: { kind: "daily", n: 1 }, deliver: "leave" } as const;
    expect(orderGate(state, req, "job")).toMatchObject({ ok: false, skill: "weatherSense" });
    state.skills.weatherSense.xp = levelMinutes(50);
    expect(orderGate(state, req, "job")).toEqual({ ok: true });
    const row = check(state, world, calendar(0), "readSky");
    for (const word of ["sky", "weather", "forecast", "storm", "warning", "rain", "snow"]) {
      expect(filterRows([row], word)).toEqual([row]);
    }
  });

  it.each([
    [1, "a storm is coming"],
    [7, "heavy snow storm in 1 h"],
    [19, "heavy snow storm in 1 h, lasting 6 h"],
  ])("a level %i observation reports exactly its newly available forecast", (level, detail) => {
    const { state, world } = game();
    state.skills.weatherSense.xp = levelMinutes(level);
    state.weather.offset = -30;
    state.weather.storm = { id: 1, source: "natural", kind: "snow", from: 60, until: 420, warned: false };
    const cal = calendar(0);
    startTask(state, world, cal, "readSky");
    stepTask(state, world, cal, new Rng(1), 10);
    expect(state.log.at(-1)?.text).toBe(`{You} {read} the sky: ${detail}.`);
  });

  it("saves an observation, defaults old saves, and starts each body without one", () => {
    const { state, world } = game();
    expect(state.player.skyReadDay).toBeNull();
    state.player.skyReadDay = 0;
    expect(readSave(serialize(state))?.state.player.skyReadDay).toBe(0);
    delete (state.player as Partial<typeof state.player>).skyReadDay;
    expect(readSave(serialize(state))?.state.player.skyReadDay).toBeNull();
    state.player.skyReadDay = 0;
    newPerson(state, world, cellOf(state, world), state.player.region);
    expect(state.player.skyReadDay).toBeNull();
  });

  it("lets the log and body notice the same longer warning", () => {
    expect(weather.warningMinutes).toBeTypeOf("function");
    const { state, world } = game();
    testRain(8, 5, 40);
    state.skills.weatherSense.xp = levelMinutes(13);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 120, until: 480, warned: false };
    expect(weather.stormComing(state)).toBe(true);
    expect(peekNeed(state, world, calendar(0))).toBe("storm");
    advance(state, world, 1);
    expect(state.weather.storm?.warned).toBe(true);
    expect(state.log.some((line) => line.text.includes("heavy") && line.text.includes("in"))).toBe(true);
  });

  it("learns from a storm ending alive but never from a future roll or an empty world", () => {
    expect(weather.warningMinutes).toBeTypeOf("function");
    const { state, world } = game();
    testRain(8, 5, 40);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 2, until: 3, warned: false };
    advance(state, world, 1);
    expect(weather.warningMinutes(state)).toBe(60);
    advance(state, world, 2);
    expect(weather.warningMinutes(state)).toBe(70);
    state.weather.storm = { id: 2, source: "natural", kind: "rain", from: 4, until: 5, warned: false };
    advance(state, world, 2, { nobody: true });
    expect(weather.warningMinutes(state)).toBe(70);
  });
});

describe("the storm choice", () => {
  /**
   * Two steps home over a terrain boundary: the walker stands on rock and the
   * camp is on meadow one cell beyond the first meadow cell. The two terrains, not the two
   * cell numbers, are what sets the ten and a half minutes the walk takes.
   */
  function rockReturn() {
    const g = game();
    testRain(8, 5, 40);
    const { state, world } = g;
    const [from, mid, camp] = terrainRunNear(world, state.player.region, ["rock", "meadow", "meadow"]);
    placeAt(state, world, from);
    // The walker knows the ground they are standing in; without that there is no
    // route home to weigh against the warning.
    mapRegion(state, world, state.player.region);
    regionState(state, world, state.player.region).campCell = camp;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 13.25, until: 373.25, warned: false };
    return { ...g, from, mid, camp };
  }

  it("keeps the feasible rock-to-meadow return across the terrain boundary", () => {
    const control = rockReturn();
    expect(startTask(control.state, control.world, calendar(0), "walk", `cell:${control.camp}`)).toBe(true);
    expect(control.state.route?.path).toEqual([control.mid, control.camp]);
    advance(control.state, control.world, 9);
    expect(cellOf(control.state, control.world)).not.toBe(control.camp);
    advance(control.state, control.world, 1);
    expect(cellOf(control.state, control.world)).toBe(control.camp);
    advance(control.state, control.world, 3);
    expect(control.state.route).toBeNull();
    expect(control.state.player.xM).toBe(patchCenter(control.camp).xM);

    const { state, world, mid, camp } = rockReturn();
    expect(minutesToCamp(state, world, calendar(0))).toBeCloseTo(10.909);
    runOrders(state, world, calendar(0), new Rng(1));
    expect(state.route?.path).toEqual([mid, camp]);
    for (let minute = 1; minute < 10; minute++) {
      advance(state, world, 1);
      expect(state.task?.id, `minute ${minute}`).toBe("walk");
    }
    advance(state, world, 1);
    expect(cellOf(state, world)).toBe(camp);
  });

  it("abandons the same return when deep snow makes its remaining walk too slow", () => {
    const { state, world } = rockReturn();
    runOrders(state, world, calendar(0), new Rng(1));
    expect(state.task?.id).toBe("walk");
    weather.ensureGround(state, world, state.player.region).snowCm = 120;
    advance(state, world, 1);
    expect(state.task?.id).toBe("findShelter");
    expect(state.route).toBeNull();
  });

  it("keeps an achievable return while the warning counts down mid-walk", () => {
    const { state, world } = game();
    testRain(8, 5, 40);
    const [from, camp] = terrainRunNear(world, state.player.region, ["spruce", "spruce"]);
    const r = regionAt(world, cellAt(world, camp).region);
    regionState(state, world, r.id).campCell = camp;
    siteFor(regionState(state, world, r.id), camp).structures.leanTo = true;
    state.player.frostbite.feet = 1;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 11, until: 371, warned: false };
    expect(minutesToCamp(state, world, calendar(0))).toBeCloseTo(10);
    runOrders(state, world, calendar(0), new Rng(1));
    expect(state.task?.id).toBe("walk");
    advance(state, world, 1);
    expect(cellOf(state, world)).not.toBe(camp);
    expect(state.task?.id).toBe("walk");
    advance(state, world, 9);
    expect(cellOf(state, world)).toBe(camp);
    // Nothing was built on the way: the return was worth keeping.
    expect(regionState(state, world, r.id).sites[from]?.cover ?? 0).toBe(0);
  });

  it("walks to a camp ten minutes away while the warning still allows it", () => {
    const { state, world } = game();
    const [, camp] = terrainRunNear(world, state.player.region, ["spruce", "spruce"]);
    const r = regionAt(world, cellAt(world, camp).region);
    regionState(state, world, r.id).campCell = camp;
    siteFor(regionState(state, world, r.id), camp).structures.leanTo = true;
    state.player.frostbite.feet = 1;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    expect(minutesToCamp(state, world, calendar(0))).toBeCloseTo(10);
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm", true)).toMatchObject({ id: "walk", arg: `cell:${camp}` });
  });

  it("finds cover instead of a walk home longer than the hour's warning", () => {
    const { state, world } = game();
    const r = regionAt(world, state.player.region);
    regionState(state, world, r.id).campCell = r.campCell;
    // The far corner of the region, through deep snow: which cell that is the
    // world decides, and the case is that the walk outlasts the warning.
    let far = r.campCell;
    let longest = 0;
    for (const cell of r.cells) {
      if (!passable(cellAt(world, cell).terrain)) continue;
      placeAt(state, world, cell);
      weather.ensureGround(state, world, state.player.region).snowCm = 40;
      const minutes = minutesToCamp(state, world, calendar(0)) ?? 0;
      if (minutes > longest) { longest = minutes; far = cell; }
    }
    placeAt(state, world, far);
    weather.ensureGround(state, world, state.player.region).snowCm = 40;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    expect(minutesToCamp(state, world, calendar(0))).toBeGreaterThan(60);
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm", true)?.id).toBe("findShelter");
  });

  it("finds and improves cover, then lights and feeds a field fire without a camp", () => {
    const { state, world } = game();
    const cell = terrainCellNear(world, state.player.region, "spruce").cell;
    placeAt(state, world, cell);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 10);
    for (const expected of ["findShelter", "improveCover", "light"] as const) {
      const step = bodyStep(state, world, calendar(0), new Rng(1), "storm", true)!;
      expect(step?.id).toBe(expected);
      expect(startTask(state, world, calendar(0), step.id, step.arg)).toBe(true);
      stepTask(state, world, calendar(0), new Rng(1), 100);
    }
    expect(protectionOf(siteFor(regionState(state, world, state.player.region), cell))).toBe(2);
    expect(state.player.fieldFire?.fuelKg).toBe(1);
    const wood = qty(state.player.pack, "firewood");
    bodyStep(state, world, calendar(0), new Rng(1), "storm", true);
    expect(qty(state.player.pack, "firewood")).toBe(wood);
    expect(state.player.fieldFire?.fuelKg).toBe(1);
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm")?.id).toBe("rest");
    expect(state.player.fieldFire!.fuelKg).toBeGreaterThan(1);
    expect(qty(state.player.pack, "firewood")).toBeLessThan(wood);
  });

  it("builds on open ground and stops work at weatherproof to light the fire", () => {
    const { state, world } = game();
    const cell = terrainCellNear(world, state.player.region, "meadow").cell;
    placeAt(state, world, cell);
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm", true)?.id).toBe("emergencyShelter");
    const site = siteFor(regionState(state, world, state.player.region), cellOf(state, world));
    site.emergencyMinutes = 89;
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm", true)?.id).toBe("emergencyShelter");
    site.emergencyMinutes = 90;
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm", true)?.id).toBe("light");
  });
});
