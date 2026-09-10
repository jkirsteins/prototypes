import { reveal } from "./opportunity-helpers";
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { addFirewood, eat } from "../src/sim/actions";
import { calendar } from "../src/sim/calendar";
import { bodyStep, campNeed, fireStep } from "../src/sim/body";
import { hourlyHazards } from "../src/sim/hazards";
import { tipHtml, tipKey } from "../src/ui/tip";
import { firelit } from "../src/sim/player";
import { illuminance } from "../src/sim/light";
import { instantHtml } from "../src/ui/panels";
import { stepCamp } from "../src/sim/camp";
import { addItem, carried, pile, qty, removeItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, stepPlayer } from "../src/sim/player";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";
import type { TaskId } from "../src/sim/types";
import { intentOption, startIntent } from "../src/sim/intent";
import { deserialize, serialize } from "../src/sim/save";
import { siteCamp } from "./siting-helpers";
import { OPPORTUNITIES } from "../src/sim/opportunities";
import { ensureGround } from "../src/sim/weather";
import { testRain } from "./weather-helpers";

const cal = calendar(0);
function field() {
  const game = newGame(3);
  testRain(0);
  game.state.player.tools = [];
  return game;
}
function finish(game: ReturnType<typeof newGame>, id: TaskId, arg?: string) {
  const { state, world } = game;
  expect(startTask(state, world, cal, id, arg), check(state, world, cal, id, arg).why).toBe(true);
  for (let n = 0; state.task && n < 200; n++) stepTask(state, world, cal, new Rng(1), 1);
  expect(state.task).toBeNull();
}
function lightField(creditFire = false) {
  const game = field();
  if (creditFire) {
    reveal(game.state, ["fire"]);
    game.state.opportunities.stepProgress.fire = { site: 1, fuel: 1, ignition: 1 };
  }
  addItem(game.state.player.pack, "fireDrill", 1);
  addItem(game.state.player.pack, "firewood", 10);
  finish(game, "light");
  return game;
}

describe("a fire where you stand", () => {
  it("lights without a camp or pit, taking up the drill and crediting the fire deed", () => {
    const { state, world } = lightField(true);
    expect(state.player.fieldFire).toEqual({ cell: cellOf(state, world), fuelKg: 1 });
    expect(state.player.tools.some(t => t.id === "fireDrill" && t.durability < 100)).toBe(true);
    expect(state.opportunities.completedAt.fire).toBeDefined();
    expect(regionState(state, world, state.player.region).fire.lit).toBe(false);
  });
  it("requires a drill, dry fuel and weather in which tinder can catch", () => {
    const { state, world } = field();
    expect(check(state, world, cal, "light").why).toContain("fire drill");
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "wetFirewood", 5);
    expect(check(state, world, cal, "light").why).toContain("1 kg firewood");
    addItem(state.player.pack, "firewood", 2);
    testRain(10);
    expect(check(state, world, calendar(90 * 1440), "light").why).toContain("too wet");
  });
  it("cooks away from camp and credits the existing cook goal", () => {
    const game = lightField();
    reveal(game.state, ["cook"]);
    addItem(game.state.player.pack, "rawMeat", 1);
    finish(game, "cook", "rawMeat");
    expect(qty(game.state.player.pack, "cookedMeat")).toBe(1);
    expect(game.state.opportunities.stepProgress.cook?.cook).toBe(1);
    expect(game.state.opportunities.completedAt.cook).toBeUndefined();
    expect(eat(game.state, game.world, "cookedMeat", new Rng(1))).toBeGreaterThan(0);
    expect(game.state.opportunities.completedAt.cook).toBeDefined();
  });
  it("credits the introduced field lessons only after a successful field light and productive cook", () => {
    const game = field();
    const { state, world } = game;
    for (const goal of OPPORTUNITIES) state.opportunities.completedAt[goal.key] = 0;
    delete state.opportunities.completedAt.fieldFire;
    delete state.opportunities.completedAt.fieldMeal;
    delete state.opportunities.completedAt.remoteStorm;
    state.minute = 30 * 1440;
    reveal(state, ["fieldFire"]);
    state.opportunities.context.weather = {
      opportunity: "remoteStorm", status: "reserved", createdAt: state.minute, attempts: 1,
      stormId: null, source: null, area: { region: state.player.region, centre: cellOf(state, world), radiusKm: 1 },
      announcedAt: null, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
      atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    finish(game, "light");
    expect(state.opportunities.completedAt.fieldFire).toBeDefined();

    reveal(state, ["fieldMeal"]);
    addItem(state.player.pack, "rawMeat", 1);
    finish(game, "cook", "rawMeat");
    expect(state.opportunities.completedAt.fieldMeal).toBeDefined();
  });

  it("does not credit a failed field light or an empty cook completion", () => {
    const game = field();
    const { state, world } = game;
    for (const goal of OPPORTUNITIES) state.opportunities.completedAt[goal.key] = 0;
    delete state.opportunities.completedAt.fieldFire;
    delete state.opportunities.completedAt.fieldMeal;
    delete state.opportunities.completedAt.remoteStorm;
    state.minute = 30 * 1440;
    reveal(state, ["fieldFire", "fieldMeal"]);
    state.opportunities.context.weather = {
      opportunity: "remoteStorm", status: "reserved", createdAt: state.minute, attempts: 1,
      stormId: null, source: null, area: { region: state.player.region, centre: cellOf(state, world), radiusKm: 1 },
      announcedAt: null, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
      atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    testRain(2);
    expect(startTask(state, world, cal, "light")).toBe(true);
    for (let n = 0; state.task && n < 60; n++) stepTask(state, world, cal, new Rng(7), 1);
    expect(state.player.fieldFire).toBeNull();
    expect(state.opportunities.completedAt.fieldFire).toBeUndefined();

    state.opportunities.completedAt.fieldFire = 0;
    testRain(0);
    state.player.fieldFire = { cell: cellOf(state, world), fuelKg: 3 };
    addItem(state.player.pack, "rawMeat", 1);
    expect(startTask(state, world, cal, "cook", "rawMeat")).toBe(true);
    removeItem(state.player.pack, "rawMeat", 1);
    for (let n = 0; state.task && n < 60; n++) stepTask(state, world, cal, new Rng(1), 1);
    expect(state.opportunities.completedAt.fieldMeal).toBeUndefined();
  });
  it("stops field cooking without output or goal credit when rain extinguishes the fire in progress", () => {
    const game = lightField();
    const { state, world } = game;
    for (const goal of OPPORTUNITIES) state.opportunities.completedAt[goal.key] = 0;
    delete state.opportunities.completedAt.fieldMeal;
    delete state.opportunities.completedAt.remoteStorm;
    reveal(state, ["fieldMeal"]);
    state.opportunities.context.weather = {
      opportunity: "remoteStorm", status: "reserved", createdAt: state.minute, attempts: 1,
      stormId: null, source: null, area: { region: state.player.region, centre: cellOf(state, world), radiusKm: 1 },
      announcedAt: null, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
      atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
    addItem(state.player.pack, "rawMeat", 1);
    expect(startTask(state, world, cal, "cook", "rawMeat")).toBe(true);
    stepTask(state, world, cal, new Rng(1), 1);
    testRain(10);
    stepCamp(state, world, 5, 1, { region: state.player.region, atCamp: false });
    expect(state.player.fieldFire).toBeNull();

    stepTask(state, world, cal, new Rng(1), 20);
    expect(state.task).toBeNull();
    expect(qty(state.player.pack, "rawMeat")).toBe(1);
    expect(qty(state.player.pack, "cookedMeat")).toBe(0);
    expect(state.opportunities.completedAt.fieldMeal).toBeUndefined();
  });
  it("requires a lit fire to crack bones or grind bark", () => {
    const { state, world } = field();
    addItem(state.player.pack, "bone", 1);
    addItem(state.player.pack, "driedBark", 1);
    addItem(state.player.pack, "stone", 1);
    expect(check(state, world, cal, "crack")).toMatchObject({ ok: false, why: "needs a lit fire" });
    expect(check(state, world, cal, "grindBark")).toMatchObject({ ok: false, why: "needs a lit fire" });
  });
  it.each(["axe", "stoneAxe", "flakedAxe"] as const)("takes up a nearby %s for marrow, with its weight still carried", axe => {
    const game = lightField();
    const { state, world } = game;
    addItem(state.player.pack, "bone", 1);
    addItem(pile(state, cellOf(state, world)), axe, 1);
    const before = carried(state.player);
    finish(game, "crack");
    expect(state.player.tools.some(t => t.id === axe)).toBe(true);
    expect(carried(state.player)).toBeGreaterThan(before);
    expect(qty(state.player.pack, "fat")).toBeGreaterThan(0);
  });
  it("grinds with a stone in the pack, and refuses missing equipment by name", () => {
    const game = lightField();
    const { state, world } = game;
    addItem(state.player.pack, "driedBark", 1);
    addItem(state.player.pack, "bone", 1);
    expect(check(state, world, cal, "crack").why).toContain("stone or the axe");
    expect(check(state, world, cal, "grindBark").why).toContain("stone");
    addItem(state.player.pack, "stone", 1);
    finish(game, "grindBark");
    expect(qty(state.player.pack, "barkFlour")).toBeGreaterThan(0);
  });
  it("melts and thaws with a vessel, spending the field fire's fuel", () => {
    const game = lightField();
    const { state, world } = game;
    ensureGround(state, world, state.player.region).snowCm = 10;
    expect(check(state, world, cal, "melt").why).toContain("bark bucket");
    expect(check(state, world, cal, "thaw").why).toContain("vessel");
    addItem(state.player.pack, "barkBucket", 1);
    expect(addFirewood(state, world, 4)).toBe(4);
    state.player.water = 3;
    finish(game, "melt");
    const vessel = state.player.tools.find(t => t.id === "barkBucket")!;
    expect(vessel.litres).toBe(1);
    expect(state.player.fieldFire?.fuelKg).toBe(4);
    vessel.frozen = true;
    finish(game, "thaw");
    expect(vessel.frozen).toBe(false);
  });
  it.each(["hang", "lightIndoors", "mend", "build", "haul", "night"] as TaskId[])("keeps %s camp-only", id => {
    const { state, world } = field();
    expect(check(state, world, cal, id, id === "build" || id === "mend" ? "leanTo" : undefined).why).toContain("camp");
  });
  it("does not redirect field cooking to an existing camp", () => {
    const game = lightField();
    const { state, world } = game;
    const fieldCell = cellOf(state, world);
    siteCamp(state, world);
    regionState(state, world, state.player.region).campCell = fieldCell + 1;
    addItem(state.player.pack, "rawMeat", 1);
    expect(intentOption(state, world, cal, "cook", "rawMeat", "nearest").ok).toBe(true);
  });
  it("warms and dries the body and pack beside it", () => {
    const { state, world } = lightField();
    const warm = feltTemperature(state, world, 0);
    state.player.fieldFire = null;
    expect(warm - feltTemperature(state, world, 0)).toBeCloseTo(15);
    state.player.fieldFire = { cell: cellOf(state, world), fuelKg: 10 };
    testRain(0);
    state.player.wetness = 50;
    addItem(state.player.pack, "wetFirewood", 1);
    stepPlayer(state, world, cal, 0, 1);
    expect(state.player.wetness).toBeLessThan(50);
    testRain(2);
    const dryBefore = qty(state.player.pack, "firewood");
    stepCamp(state, world, 0, 1, { region: state.player.region, atCamp: false });
    expect(qty(state.player.pack, "firewood")).toBeGreaterThan(dryBefore);
  });
  it("burns down without automatic feeding or embers, and credits no hearth goals", () => {
    const { state, world } = lightField();
    const before = qty(state.player.pack, "firewood");
    stepCamp(state, world, 0, 60, { region: state.player.region, atCamp: false });
    expect(state.player.fieldFire).toBeNull();
    expect(qty(state.player.pack, "firewood")).toBe(before);
    expect(regionState(state, world, state.player.region).fire.embers).toBe(0);
    expect(state.opportunities.completedAt.keptNight).toBeUndefined();
    expect(state.opportunities.completedAt.keptDays).toBeUndefined();
  });
  it("dies immediately when leaving its cell and never returns on walking back", () => {
    const { state, world } = lightField();
    const cell = cellOf(state, world);
    placeAt(state, world, cell + 1);
    expect(state.player.fieldFire).toBeNull();
    placeAt(state, world, cell);
    expect(state.player.fieldFire).toBeNull();
  });
  it("round-trips the player-local fire through a save", () => {
    const { state } = lightField();
    expect(deserialize(serialize(state))?.state.player.fieldFire).toEqual(state.player.fieldFire);
  });
  it("offers a field light step without trying to build a permanent pit", () => {
    const { state, world } = field();
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    expect(fireStep(state, world, cal, cellOf(state, world))?.id).toBe("light");
  });
  it("lights the current cell and offers manual feeding", () => {
    const { state, world } = lightField();
    expect(firelit(state, world)).toBe(true);
    expect(instantHtml(state, world)).toContain('data-act="feed"');
    const lit = illuminance(state, world, cal, cellOf(state, world));
    state.player.fieldFire = null;
    expect(lit - illuminance(state, world, cal, cellOf(state, world))).toBeCloseTo(20);
  });
  it("keeps a carried vessel thawed by the field fire", () => {
    const { state, world } = lightField();
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 1, frozen: false });
    hourlyHazards(state, world, -10, 10, new Rng(1));
    expect(state.player.tools.find(t => t.id === "barkBucket")?.frozen).toBe(false);
  });
  it("rests beside the field fire for warmth without offering camp care", () => {
    const { state, world } = lightField();
    const fieldCell = cellOf(state, world);
    siteCamp(state, world);
    regionState(state, world, state.player.region).campCell = fieldCell + 1;
    expect(bodyStep(state, world, cal, new Rng(1), "cold", true)?.id).toBe("rest");
    expect(campNeed(state, world, cal)).toBeNull();
  });
  it("shows a field fire on its cell tooltip and invalidates it on extinction", () => {
    const { state, world } = lightField();
    const cell = cellOf(state, world);
    expect(tipHtml(state, world, cal, cell)).toContain("field fire");
    const before = tipKey(state, world, cell);
    state.player.fieldFire = null;
    expect(tipKey(state, world, cell)).not.toBe(before);
  });
  it("provisions a grinding stone through the normal order kit", () => {
    const { state, world } = field();
    siteCamp(state, world);
    const camp = cellOf(state, world);
    addItem(pile(state, camp), "stone", 1);
    addItem(pile(state, camp), "driedBark", 1);
    const fire = regionState(state, world, state.player.region).fire;
    fire.lit = true;
    fire.fuelKg = 3;
    expect(startIntent(state, world, cal, new Rng(1), { task: "grindBark", until: { kind: "once" }, deliver: "leave", where: { cell: camp } })).toBe(true);
    expect(qty(state.player.pack, "stone")).toBe(1);
    expect(qty(pile(state, camp), "stone")).toBe(0);
  });
  it("lights a torch from the field fire without a drill", () => {
    const game = lightField();
    const { state, world } = game;
    state.player.tools = [];
    addItem(state.player.pack, "torch", 1);
    expect(check(state, world, cal, "lightTorch").duration).toBe(1);
    finish(game, "lightTorch");
    expect(state.player.torch.lit).toBe(true);
  });
  it("credits no hearth goals after three days of hand-fed field fire in rain", () => {
    const { state, world } = lightField();
    testRain(2);
    for (let m = 0; m < 3 * 1440; m += 60) {
      state.minute += 60;
      addItem(state.player.pack, "firewood", 6);
      addFirewood(state, world, 6);
      stepCamp(state, world, 0, 60, { region: state.player.region, atCamp: false });
    }
    expect(state.player.fieldFire).not.toBeNull();
    expect(state.opportunities.completedAt.keptNight).toBeUndefined();
    expect(state.opportunities.completedAt.keptDays).toBeUndefined();
    expect(regionState(state, world, state.player.region).fire.litSince).toBeNull();
  });
  it("keeps a field fire useful when camp is sited on its cell without making it a hearth", () => {
    const { state, world } = lightField();
    const before = feltTemperature(state, world, 0);
    siteCamp(state, world);
    expect(feltTemperature(state, world, 0)).toBeCloseTo(before);
    expect(addFirewood(state, world, 2)).toBe(2);
    expect(regionState(state, world, state.player.region).fire.lit).toBe(false);
  });
});
