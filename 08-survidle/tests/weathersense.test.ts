import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { peekNeed } from "../src/sim/body";
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

function game() {
  const g = newGame(17);
  current(g.state).person.quirks = [];
  return g;
}

describe("weather sense", () => {
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
    state.weather.storm = { from: 60, until: 420, warned: false };
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
    state.skills.weatherSense.xp = levelMinutes(13);
    state.weather.storm = { from: 120, until: 480, warned: false };
    expect(weather.stormComing(state)).toBe(true);
    expect(peekNeed(state, world, calendar(0))).toBe("storm");
    advance(state, world, 1);
    expect(state.weather.storm?.warned).toBe(true);
    expect(state.log.some((line) => line.text.includes("heavy") && line.text.includes("in"))).toBe(true);
  });

  it("learns from a storm ending alive but never from a future roll or an empty world", () => {
    expect(weather.warningMinutes).toBeTypeOf("function");
    const { state, world } = game();
    state.weather.storm = { from: 2, until: 3, warned: false };
    advance(state, world, 1);
    expect(weather.warningMinutes(state)).toBe(60);
    advance(state, world, 2);
    expect(weather.warningMinutes(state)).toBe(70);
    state.weather.storm = { from: 4, until: 5, warned: false };
    advance(state, world, 2, { nobody: true });
    expect(weather.warningMinutes(state)).toBe(70);
  });
});
