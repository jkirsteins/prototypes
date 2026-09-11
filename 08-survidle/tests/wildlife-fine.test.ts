import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar, type Calendar } from "../src/sim/calendar";
import { popOf } from "../src/sim/animals";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import type { GameState, WildlifeSubject } from "../src/sim/types";
import { visibleCells } from "../src/sim/sight";
import { AGENT_SPECIES, activateWildlife, dailyWildlife, evaluateWildlifeDisturbance, stepWildlife, visibleWildlife, wildlifeMembers } from "../src/sim/wildlife-agents";
import { cellForMetricPoint, encounterGeometry, metricPointForPlayer, metricPointForWildlife } from "../src/sim/wildlife-space";
import { cellAt, regionAt, type World } from "../src/world/gen";
import { FINE_PER_PARENT, PATCH_M, patchAtMetric, patchCenter, patchId, patchXY } from "../src/world/spatial";
import { paintPatch } from "./siting-helpers";

const seesStartle = { detectionRoll: 0, auditoryDetectionRoll: 1, sightRoll: 0, hearingRoll: 1 };

/** One deer, alone in its region's books, active and nothing else alive beside it. */
function loneDeer(seed = 79): { state: GameState; world: World; deer: WildlifeSubject } {
  const { state, world } = newGame(seed);
  const st = regionState(state, world, state.player.region);
  for (const species of AGENT_SPECIES) st.pop[species] = 0;
  st.pop.deer = 4;
  activateWildlife(state, world, new Rng(1));
  const deer = state.wildlife.subjects.find((s) => s.active)!;
  state.wildlife.subjects = [deer];
  st.pop.deer = wildlifeMembers(deer);
  state.weather.precip = "none";
  state.weather.clear = true;
  return { state, world, deer };
}

/** Paints a rectangle of one terrain into the survivor's own region. */
function paintBox(world: World, x0: number, y0: number, w: number, h: number, region: number, ground: "meadow" | "water"): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) paintPatch(world, patchId(x, y), ground, region);
}

const PEN_W = 9;
const PEN_H = 8;

interface BarrierScene {
  state: GameState;
  world: World;
  calendar: Calendar;
  animal: WildlifeSubject;
  barrierX: number;
  destination: number;
}

/**
 * A walled pen of open ground split by a six-patch band of water, two
 * kilometres east of the survivor so nothing here is a reaction to a person.
 * The herd stands west of the band and is sent to ground east of it.
 */
function wildlifeBarrierFixture(): BarrierScene {
  const { state, world, deer } = loneDeer();
  const here = patchXY(cellOf(state, world));
  const region = state.player.region;
  const x0 = here.x + 40;
  const y0 = here.y;
  const barrierX = x0 + 4;
  paintBox(world, x0, y0, PEN_W, PEN_H, region, "water");
  paintBox(world, x0 + 1, y0 + 1, PEN_W - 2, PEN_H - 2, region, "meadow");
  for (let y = y0 + 1; y < y0 + PEN_H - 1; y++) paintPatch(world, patchId(barrierX, y), "water", region);
  const start = patchId(x0 + 1, y0 + 3);
  const destination = patchId(x0 + PEN_W - 2, y0 + 3);
  deer.region = region;
  deer.active = {
    cell: start, position: patchCenter(start), travel: null, hunger: 20, thirst: 20, rest: 20,
    alarm: 0, intent: "forage", target: destination, route: [],
    escapeRemainingM: 0, escapeStartedMinute: null, lastDetectionMinute: null, escapeEpisode: 0,
  };
  return { state, world, calendar: calendar(state.minute, state.startDoy), animal: deer, barrierX, destination };
}

/** A herd on open painted ground with the survivor one metre to its east. */
function openGroundFixture(): { state: GameState; world: World; deer: WildlifeSubject; cal: Calendar } {
  const { state, world, deer } = loneDeer();
  const here = patchXY(cellOf(state, world));
  const region = state.player.region;
  paintBox(world, here.x - 8, here.y - 2, 17, 5, region, "meadow");
  const start = patchId(here.x, here.y);
  const position = patchCenter(start);
  deer.region = region;
  deer.active = {
    cell: start, position, travel: null, hunger: 20, thirst: 20, rest: 20,
    alarm: 0, intent: "wander", target: null, route: [],
    escapeRemainingM: 0, escapeStartedMinute: null, lastDetectionMinute: null, escapeEpisode: 0,
  };
  state.player.xM = position.xM + 1;
  state.player.yM = position.yM;
  state.minute = 1;
  state.wildlife.lastSpatialTick = 0;
  return { state, world, deer, cal: calendar(state.minute, state.startDoy) };
}

describe("fine wildlife space", () => {
  it("buckets player and wildlife points with the same fine conversion", () => {
    const { world } = newGame(79);
    const point = { xM: 53_425, yM: 15_625 };

    expect(cellForMetricPoint(world, point)).toBe(patchAtMetric(point));
  });

  it("allocates no fine agents for inactive populations", () => {
    const { state, world, deer } = loneDeer();
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    const population = popOf(st, "deer");
    expect(deer.active).not.toBeNull();

    stepWildlife(state, world, cal, new Rng(1), 10, "aggregate");
    dailyWildlife(state, world, cal, new Rng(1), "aggregate");

    expect(state.wildlife.subjects).toContain(deer);
    expect(state.wildlife.subjects.every((s) => s.active === null)).toBe(true);
    expect(state.wildlife.activeRegion).toBeNull();
    expect(popOf(st, "deer")).toBe(population);
  });

  it("activates an animal on a passable patch at its own metric point", () => {
    const { state, world } = loneDeer();
    const active = state.wildlife.subjects[0].active!;

    expect(cellAt(world, active.cell).terrain).not.toBe("water");
    expect(cellForMetricPoint(world, active.position)).toBe(active.cell);
    expect(patchAtMetric(active.position)).toBe(active.cell);
  });
});

describe("fine wildlife movement", () => {
  it("an active animal cannot cross an impassable fine band", () => {
    const scene = wildlifeBarrierFixture();
    for (let minute = 1; minute <= 60; minute++) {
      scene.state.minute = minute;
      stepWildlife(scene.state, scene.world, calendar(minute, scene.state.startDoy), new Rng(minute), 1, "detailed");
    }

    expect(patchXY(scene.animal.active!.cell).x).toBeLessThan(scene.barrierX);
    expect(cellAt(scene.world, scene.animal.active!.cell).terrain).toBe("meadow");
  });

  it("spends escape metres in a straight line across fine patches", () => {
    const { state, world, deer, cal } = openGroundFixture();
    evaluateWildlifeDisturbance(state, world, cal, false, seesStartle);
    const from = { ...deer.active!.position };
    deer.active!.escapeRemainingM = 700;
    deer.active!.rest = 100;
    state.minute = 1.5;

    stepWildlife(state, world, calendar(1.5, state.startDoy), new Rng(2), 0.5, "detailed");

    const moved = Math.hypot(deer.active!.position.xM - from.xM, deer.active!.position.yM - from.yM);
    expect(moved).toBeCloseTo(200, 6);
    expect(deer.active!.escapeRemainingM).toBeCloseTo(500, 6);
    expect(cellAt(world, deer.active!.cell).terrain).not.toBe("water");
  });
});

describe("fine wildlife detection", () => {
  it("reads alarm from exact metres inside one former parent area", () => {
    const { state, world, deer, cal } = openGroundFixture();
    const here = patchXY(cellOf(state, world));
    const near = patchId(here.x + 1, here.y);
    const far = patchId(here.x + 5, here.y);
    // Both stand inside what one parent square spans, the coarse world's
    // smallest step. Only their own metres can tell them apart.
    expect(PATCH_M * 5).toBeLessThanOrEqual(PATCH_M * FINE_PER_PARENT);
    const alarmAt = (cell: number): number => {
      deer.active!.cell = cell;
      deer.active!.position = patchCenter(cell);
      deer.active!.alarm = 0;
      deer.active!.escapeStartedMinute = null;
      deer.active!.escapeRemainingM = 0;
      deer.active!.escapeEpisode = 0;
      evaluateWildlifeDisturbance(state, world, cal, false, seesStartle);
      return deer.active!.alarm;
    };

    expect(alarmAt(near)).toBeGreaterThan(alarmAt(far));
  });

  it("separates two animals a former cell apart by their own metres", () => {
    const { state, world, deer } = openGroundFixture();
    const player = metricPointForPlayer(state, world)!;
    const here = patchXY(cellOf(state, world));
    const distanceFrom = (cell: number): number => {
      deer.active!.cell = cell;
      deer.active!.position = patchCenter(cell);
      return encounterGeometry(player, metricPointForWildlife(state, world, deer)!)!.distanceM;
    };

    expect(distanceFrom(patchId(here.x + 1, here.y))).toBeCloseTo(PATCH_M - 1, 6);
    expect(distanceFrom(patchId(here.x + 5, here.y))).toBeCloseTo(PATCH_M * 5 - 1, 6);
  });

  it("shows only wildlife on patches the viewshed keeps", () => {
    const { state, world, deer, cal } = openGroundFixture();
    const here = cellOf(state, world);
    const visible = visibleCells(state, world, cal, here);
    const hidden = regionAt(world, state.player.region).cells.find((cell) => !visible.has(cell))!;
    expect(hidden).toBeDefined();

    deer.active!.cell = here;
    expect(visibleWildlife(state, world, cal)).toContain(deer);

    deer.active!.cell = hidden;
    expect(visibleWildlife(state, world, cal)).not.toContain(deer);
  });
});
