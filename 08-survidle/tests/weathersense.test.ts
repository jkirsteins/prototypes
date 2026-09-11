import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { bodyStep, minutesToCamp, peekNeed } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { newGame, newPerson } from "../src/sim/newgame";
import { orderGate } from "../src/sim/ladder";
import { addOrder, orderMet, ordersHere, runOrders } from "../src/sim/orders";
import { current, record } from "../src/sim/record";
import { deserialize, serialize } from "../src/sim/save";
import { levelMinutes, masteryKey, skillOf } from "../src/sim/skills";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { TASK_IDS } from "../src/sim/types";
import * as weather from "../src/sim/weather";
import { filterRows } from "../src/ui/dopanel";
import { addItem, qty } from "../src/sim/inventory";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { cellAt, regionAt } from "../src/world/gen";
import { protectionOf } from "../src/sim/shelter";
import { passable } from "../src/world/route";
import type { GameState, GoalId, GoalOpportunity, Terrain } from "../src/sim/types";
import type { World } from "../src/world/gen";
import { introduceGoals } from "../src/sim/goals";
import { isKnown } from "../src/sim/mapped";
import { paintPatch, requireCamp } from "./siting-helpers";
import { testRain } from "./weather-helpers";

function game() {
  const g = newGame(17);
  testRain(0);
  current(g.state).person.quirks = [];
  return g;
}

const THROUGH_SHELTER: GoalId[] = [
  "site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook",
  "findUsefulCover", "makeUsefulShelter", "testShelter", "snareMeal", "huntMeal", "fishMeal",
  "trapMeal", "foodSource", "store", "fat", "firstOrder", "water", "keptDays",
];

function weatherLesson(state: ReturnType<typeof game>["state"], stormId: number, status: GoalOpportunity["status"] = "announced"): void {
  for (const id of THROUGH_SHELTER) state.goals.done[id] = true;
  state.minute = 7 * 1440;
  introduceGoals(state, ["readWeather"]);
  state.goals.opportunity = {
    goal: "readWeather", status, createdAt: state.minute, attempts: 1,
    stormId, source: "natural", area: null, announcedAt: state.minute, resolvedAt: null,
    minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
  };
}

describe("weather sense", () => {
  it("describes only the facts actually knowable about a specific forecast storm", () => {
    const { state } = game();
    const storm = { id: 9, source: "natural" as const, kind: "gale" as const, from: 100, until: 520, warned: false };
    state.weather.storm = storm;
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 0, coming: false, arrivalMinute: null, kind: null, severity: null, durationMinutes: null,
    });
    state.minute = 40;
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 1, coming: true, arrivalMinute: null, kind: null, severity: null, durationMinutes: null,
    });
    state.skills.weatherSense.xp = levelMinutes(13);
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 2, coming: true, arrivalMinute: 100, kind: "gale", severity: "heavy", durationMinutes: null,
    });
    state.skills.weatherSense.xp = levelMinutes(25);
    expect(weather.forecastKnowledge(state, storm)).toEqual({
      stage: 3, coming: true, arrivalMinute: 100, kind: "gale", severity: "heavy", durationMinutes: 420,
    });
  });

  it("credits a matching announced sky read only when it reveals a new fact and binds the reader", () => {
    const { state, world } = game();
    weatherLesson(state, 7);
    state.weather.storm = { id: 7, source: "natural", kind: "rain", from: state.minute + 90, until: state.minute + 450, warned: false };
    const before = weather.forecastKnowledge(state, state.weather.storm);
    expect(before.stage).toBe(0);
    startTask(state, world, calendar(state.minute, state.startDoy), "readSky");
    stepTask(state, world, calendar(state.minute, state.startDoy), new Rng(1), 10);
    expect(state.goals.done.readWeather).toBe(true);
    expect(state.goals.opportunity?.readerIndex).toBe(current(state).index);
    expect(weather.forecastKnowledge(state, state.weather.storm).stage).toBeGreaterThan(0);
  });

  it("binds a new reader on a retry after the reading lesson is already complete", () => {
    const { state, world } = game();
    weatherLesson(state, 8);
    state.goals.done.readWeather = true;
    introduceGoals(state, ["prepareWeather"]);
    state.goals.opportunity!.attempts = 2;
    state.goals.opportunity!.readerIndex = null;
    state.weather.storm = { id: 8, source: "natural", kind: "rain", from: state.minute + 90, until: state.minute + 450, warned: false };

    expect(startTask(state, world, calendar(state.minute, state.startDoy), "readSky")).toBe(true);
    stepTask(state, world, calendar(state.minute, state.startDoy), new Rng(1), 10);

    expect(state.goals.opportunity?.readerIndex).toBe(current(state).index);
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
      expect(state.goals.done.readWeather, kind).toBeUndefined();
      expect(state.goals.opportunity?.readerIndex, kind).toBeFalsy();
    }

    const { state, world } = game();
    testRain(8, 5, 40);
    weatherLesson(state, 11, "reserved");
    state.weather.storm = { id: 11, source: "natural", kind: "rain", from: state.minute + 61, until: state.minute + 421, warned: false };
    advance(state, world, 1);
    expect(state.goals.opportunity?.status).toBe("announced");
    expect(state.goals.done.readWeather).toBeUndefined();
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
    expect(deserialize(serialize(state))?.state.player.skyReadDay).toBe(0);
    delete (state.player as Partial<typeof state.player>).skyReadDay;
    expect(deserialize(serialize(state))?.state.player.skyReadDay).toBeNull();
    state.player.skyReadDay = 0;
    newPerson(state, world, Math.floor(state.player.y) * world.w + Math.floor(state.player.x), state.player.region);
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
   * Paints a straight run of ground away from where the survivor stands,
   * walled either side by open water so the walk home is exactly this
   * corridor and its terrain sets the time. `kinds[0]` is the patch under the
   * survivor; the last is the camp.
   */
  function corridor(state: GameState, world: World, kinds: Terrain[]): { from: number; camp: number; path: number[] } {
    const from = cellOf(state, world);
    const region = state.player.region;
    const step = cellAt(world, from + kinds.length).region === region ? 1 : -1;
    const cells = kinds.map((_, i) => from + i * step);
    for (const cell of cells) {
      expect(cellAt(world, cell).region).toBe(region);
      expect(isKnown(state, cell)).toBe(true);
    }
    for (const [i, cell] of cells.entries()) {
      paintPatch(world, cell, kinds[i]);
      paintPatch(world, cell - world.w, "water");
      paintPatch(world, cell + world.w, "water");
    }
    expect(state.weather.iceCm).toBe(0);
    return { from, camp: cells[cells.length - 1], path: cells.slice(1) };
  }

  /**
   * A 600 m return that starts on rock and crosses onto meadow at the first
   * step: twelve meadow patches at the walking speed of this weather, which
   * is a 10.909-minute walk.
   */
  function rockReturn() {
    const g = game();
    testRain(8, 5, 40);
    const { state, world } = g;
    const kinds: Terrain[] = ["rock", ...Array(12).fill("meadow")];
    const { camp, path } = corridor(state, world, kinds);
    regionState(state, world, state.player.region).campCell = camp;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 13.25, until: 373.25, warned: false };
    return { ...g, camp, path };
  }

  it("keeps the feasible rock-to-meadow return across the terrain boundary", () => {
    const control = rockReturn();
    expect(startTask(control.state, control.world, calendar(0), "walk", `cell:${control.camp}`)).toBe(true);
    expect(control.state.route?.path).toEqual(control.path);
    // The 600 m walk takes 10.909 minutes, so the camp is reached on the 11th.
    advance(control.state, control.world, 10);
    expect(cellOf(control.state, control.world)).not.toBe(control.camp);
    advance(control.state, control.world, 1);
    expect(cellOf(control.state, control.world)).toBe(control.camp);
    advance(control.state, control.world, 3);
    expect(control.state.route).toBeNull();
    expect(control.state.player.x).toBe(control.camp % control.world.w + 0.5);

    const { state, world, camp, path } = rockReturn();
    expect(minutesToCamp(state, world, calendar(0))).toBeCloseTo(10.909);
    runOrders(state, world, calendar(0), new Rng(1));
    expect(state.route?.path).toEqual(path);
    for (let minute = 1; minute <= 10; minute++) {
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
    weather.ensureGround(state, world, state.player.region).snowCm = 40;
    advance(state, world, 1);
    expect(state.task?.id).toBe("findShelter");
    expect(state.route).toBeNull();
  });

  it("keeps an achievable return while the warning counts down mid-walk", () => {
    const { state, world } = game();
    testRain(8, 5, 40);
    const r = regionAt(world, state.player.region);
    const { from, camp } = corridor(state, world, Array(7).fill("spruce"));
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
    const r = regionAt(world, state.player.region);
    const { camp } = corridor(state, world, Array(7).fill("spruce"));
    regionState(state, world, r.id).campCell = camp;
    siteFor(regionState(state, world, r.id), camp).structures.leanTo = true;
    state.player.frostbite.feet = 1;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    expect(minutesToCamp(state, world, calendar(0))).toBeCloseTo(10);
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm", true)).toMatchObject({ id: "walk", arg: `cell:${camp}` });
  });

  it("finds cover instead of taking a three-hour walk against an hour's warning", () => {
    const { state, world } = game();
    const r = regionAt(world, state.player.region);
    const camp = requireCamp(r);
    regionState(state, world, r.id).campCell = camp;
    // The far corner of the region under 40 cm of snow. A walk this long needs
    // generated ground: its search evicts and regenerates painted chunks.
    const { x, y } = cellAt(world, camp);
    const far = r.cells.reduce((best, cell) => {
      const c = cellAt(world, cell);
      if (!passable(c.terrain) || !isKnown(state, cell)) return best;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      return d > best.d ? { cell, d } : best;
    }, { cell: camp, d: -1 }).cell;
    placeAt(state, world, far);
    weather.ensureGround(state, world, state.player.region).snowCm = 40;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    const minutes = minutesToCamp(state, world, calendar(0))!;
    expect(minutes).toBeCloseTo(193.25, 2);
    expect(minutes).toBeGreaterThan(weather.warningMinutes(state));
    expect(bodyStep(state, world, calendar(0), new Rng(1), "storm", true)?.id).toBe("findShelter");
  });

  it("finds and improves cover, then lights and feeds a field fire without a camp", () => {
    const { state, world } = game();
    const cell = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "spruce")!;
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
    const cell = regionAt(world, state.player.region).cells.find(c => cellAt(world, c).terrain === "meadow")!;
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
