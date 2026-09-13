import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar, type Calendar } from "../src/sim/calendar";
import { popOf } from "../src/sim/animals";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import type { GameState, WildlifeSubject } from "../src/sim/types";
import { visibleCells } from "../src/sim/sight";
import { AGENT_SPECIES, activateWildlife, claimHuntableAnimal, dailyWildlife, evaluateWildlifeDisturbance, stepWildlife, visibleWildlife, wildlifeMembers } from "../src/sim/wildlife-agents";
import { cellForMetricPoint, encounterGeometry, metricPointForPlayer, metricPointForWildlife } from "../src/sim/wildlife-space";
import { cellAt, regionAt, type World } from "../src/world/gen";
import { FINE_PER_PARENT, PATCH_M, parentKey, parentXY, patchAtMetric, patchCenter, patchId, patchXY } from "../src/world/spatial";
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

/** Stands a subject on one patch of one region with one target and no route yet. */
function place(deer: WildlifeSubject, region: number, cell: number, target: number): WildlifeSubject {
  deer.region = region;
  deer.active = {
    cell, position: patchCenter(cell), travel: null, hunger: 20, thirst: 20, rest: 20,
    alarm: 0, intent: "forage", target, route: [],
    escapeRemainingM: 0, escapeStartedMinute: null, lastDetectionMinute: null, escapeEpisode: 0,
  };
  return deer;
}

interface BarrierScene {
  state: GameState;
  world: World;
  calendar: Calendar;
  animal: WildlifeSubject;
  barrierX: number;
  destination: number;
  /** A patch on the herd's own side of the band, so the pen's walkability is testable. */
  nearTarget: number;
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
  const nearTarget = patchId(barrierX - 1, y0 + 3);
  return { state, world, calendar: calendar(state.minute, state.startDoy), animal: place(deer, region, start, destination), barrierX, destination, nearTarget };
}

/**
 * The same pen, split instead by a column of walkable ground that belongs to
 * the neighbouring region's books. Terrain lets the herd through; the animal's
 * own region does not, so the only path to the far side leaves its region.
 */
function regionSplitFixture(): BarrierScene {
  const { state, world, deer } = loneDeer();
  const here = patchXY(cellOf(state, world));
  const region = state.player.region;
  const x0 = here.x + 40;
  const y0 = here.y;
  const barrierX = x0 + 4;
  paintBox(world, x0, y0, PEN_W, PEN_H, region, "water");
  paintBox(world, x0 + 1, y0 + 1, PEN_W - 2, PEN_H - 2, region, "meadow");
  for (let y = y0 + 1; y < y0 + PEN_H - 1; y++) paintPatch(world, patchId(barrierX, y), "meadow", region + 1);
  const start = patchId(x0 + 1, y0 + 3);
  const destination = patchId(x0 + PEN_W - 2, y0 + 3);
  state.minute = 0;
  state.wildlife.lastSpatialTick = -1;
  return {
    state, world, calendar: calendar(state.minute, state.startDoy),
    animal: place(deer, region, start, destination), barrierX, destination,
    nearTarget: patchId(barrierX - 1, y0 + 3),
  };
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
    const active = scene.animal.active!;
    const start = active.cell;
    const trail: number[] = [active.cell];
    const run = (minutes: number): void => {
      const last = scene.state.minute + minutes;
      for (let minute = scene.state.minute + 1; minute <= last; minute++) {
        scene.state.minute = minute;
        stepWildlife(scene.state, scene.world, calendar(minute, scene.state.startDoy), new Rng(minute), 1, "detailed");
        if (active.cell !== trail[trail.length - 1]) trail.push(active.cell);
      }
    };

    // The pen's own side is walkable and the herd walks a route across it, so
    // the far side being unreached below is the water band and not an animal
    // that only ever wandered. The walk in is read patch by patch: it arrives,
    // each step is to a touching patch, and every step closes on the target,
    // which a wander does not do.
    active.target = scene.nearTarget;
    run(60);
    const arrival = trail.indexOf(scene.nearTarget);
    expect(arrival).toBeGreaterThan(0);
    const away = (cell: number): number => {
      const a = patchXY(cell);
      const b = patchXY(scene.nearTarget);
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    };
    for (let i = 1; i <= arrival; i++) {
      const from = patchXY(trail[i - 1]);
      const to = patchXY(trail[i]);
      expect(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))).toBe(1);
      expect(away(trail[i])).toBeLessThan(away(trail[i - 1]));
    }
    expect(active.cell).not.toBe(start);

    active.target = scene.destination;
    active.route = [];
    run(60);

    expect(patchXY(active.cell).x).toBeLessThan(scene.barrierX);
    expect(cellAt(scene.world, active.cell).terrain).toBe("meadow");
  });

  it("reaches a target whose path leaves its region or gives it up, never standing on it", () => {
    const scene = regionSplitFixture();
    const active = scene.animal.active!;
    const start = active.cell;
    let held = 0;
    let previous = active.cell;
    for (let minute = 1; minute <= 120; minute++) {
      scene.state.minute = minute;
      stepWildlife(scene.state, scene.world, calendar(minute, scene.state.startDoy), new Rng(minute), 1, "detailed");
      if (active.target === scene.destination && active.cell === previous) held++;
      previous = active.cell;
    }

    expect(active.cell === scene.destination || active.target !== scene.destination).toBe(true);
    expect(held).toBeLessThan(12);
    expect(active.cell).not.toBe(start);
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

describe("fine hunting reach", () => {
  it("claims an animal a field away but not one beyond a hunter's reach", () => {
    const { state, world, deer } = loneDeer();
    const st = regionState(state, world, state.player.region);
    const here = patchXY(cellOf(state, world));
    const shot = cellOf(state, world);

    deer.active!.cell = patchId(here.x + 2, here.y);
    expect(claimHuntableAnimal(state, world, "deer", shot, deer.id)).toBe(true);
    expect(popOf(st, "deer")).toBe(3);

    deer.active!.cell = patchId(here.x + 8, here.y);
    expect(claimHuntableAnimal(state, world, "deer", shot, deer.id)).toBe(false);
    expect(claimHuntableAnimal(state, world, "deer", shot)).toBe(false);
    expect(popOf(st, "deer")).toBe(3);

    deer.active!.cell = patchId(here.x, here.y + 2);
    expect(claimHuntableAnimal(state, world, "deer", shot)).toBe(true);
    expect(popOf(st, "deer")).toBe(2);
  });
});

describe("fine wildlife detection", () => {
  it("reads alarm from exact metres inside one former parent area", () => {
    const { state, world, deer, cal } = openGroundFixture();
    const here = patchXY(cellOf(state, world));
    // The two stands are the nearest and furthest patches of the one parent
    // square the survivor is standing in, so the coarse world cannot tell them
    // apart at all and only their own metres can.
    const parentX0 = Math.floor(here.x / FINE_PER_PARENT) * FINE_PER_PARENT;
    const offsets = [];
    for (let x = parentX0; x < parentX0 + FINE_PER_PARENT; x++) if (x !== here.x) offsets.push(x);
    offsets.sort((a, b) => Math.abs(a - here.x) - Math.abs(b - here.x));
    const near = patchId(offsets[0], here.y);
    const far = patchId(offsets[offsets.length - 1], here.y);
    const parentOf = (cell: number): number => {
      const p = parentXY(cell);
      return parentKey(p.x, p.y);
    };
    expect(parentOf(near)).toBe(parentOf(far));
    expect(parentOf(near)).toBe(parentOf(cellOf(state, world)));
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

    const stand = (cell: number): void => {
      deer.active!.cell = cell;
      deer.active!.position = patchCenter(cell);
    };

    stand(here);
    expect(visibleWildlife(state, world, cal)).toContain(deer);

    stand(hidden);
    expect(visibleWildlife(state, world, cal)).not.toContain(deer);
  });
});
