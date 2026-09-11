import { afterEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { activateWildlife, claimHuntableAnimal, dailyWildlife, emptyWildlife, evaluateWildlifeDisturbance, noteWildlifeSightings, resetWildlifeKnowledge, stepWildlife, takeWildlifeMember, visibleWildlife, wildlifeMembers } from "../src/sim/wildlife-agents";
import { calendar, monthStartDoy } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { setSkillLevel } from "../src/sim/horizon";
import { cellAt, neighbours, regionAt } from "../src/world/gen";
import { advance } from "../src/sim/advance";
import { cellOf } from "../src/sim/position";
import { mapHtml } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { passable } from "../src/world/route";
import { recognitionHtml } from "../src/ui/wildlife-panel";
import { SPECIES_DEFS } from "../src/sim/species";
import { addItem, pile, qty } from "../src/sim/inventory";
import { beginTask, check } from "../src/sim/tasks";
import { placeAt } from "../src/sim/position";
import { dailyAnimals } from "../src/sim/animals";
import { siteCamp } from "./siting-helpers";
import { resolveCell } from "../src/sim/intent";
import { setWildlifeEventSink } from "../src/sim/wildlife-events";
import type { WildlifeStartleEvent } from "../src/sim/wildlife-encounter";
import { metricAreaForCell, resolveSpatialEstimate } from "../src/sim/wildlife-space";
import { CHUNK } from "../src/world/cells";
import { paintWorld } from "./world-fixture";
import type { World } from "../src/world/gen";
import type { Terrain } from "../src/sim/types";
import { CELL_KM } from "../src/units";

const CELL_M = CELL_KM * 1000;

afterEach(() => setWildlifeEventSink(null));

const seesStartle = { detectionRoll: 0, auditoryDetectionRoll: 1, sightRoll: 0, hearingRoll: 1 };
const noDetection = { detectionRoll: 1, auditoryDetectionRoll: 1, sightRoll: 1, hearingRoll: 1 };

function disturbanceScene() {
  const { state, world } = newGame(79);
  const st = regionState(state, world, state.player.region);
  for (const species of ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const) st.pop[species] = 0;
  st.pop.deer = 4;
  activateWildlife(state, world, new Rng(1));
  const deer = state.wildlife.subjects[0];
  const startCell = regionAt(world, state.player.region).cells.find((cell) => passable(cellAt(world, cell).terrain)
    && neighbours(world, cell).length === 4
    && neighbours(world, cell).every((n) => cellAt(world, n).region === state.player.region && passable(cellAt(world, n).terrain)))!;
  deer.active!.cell = startCell;
  const point = resolveSpatialEstimate(state.seed, deer.id, metricAreaForCell(world, startCell)!)!;
  deer.active!.position = point;
  deer.active!.travel = null;
  // The fixture puts the survivor one metre from this herd's stable coarse estimate.
  state.player.x = (point.xM + 1) / CELL_M;
  state.player.y = point.yM / CELL_M;
  state.minute = 1;
  state.wildlife.lastSpatialTick = 0;
  state.weather.precip = "none";
  state.weather.clear = true;
  const cal = calendar(state.minute, state.startDoy);
  return { state, world, deer, startCell, cal };
}

function setGround(world: World, cell: number, terrain: Terrain, region?: number): void {
  const { x, y } = cellAt(world, cell);
  paintWorld(world, [cell], terrain);
  if (region === undefined) return;
  const chunk = world.chunks.get(Math.floor(y / CHUNK) * 4096 + Math.floor(x / CHUNK))!;
  chunk.region[(y % CHUNK) * CHUNK + x % CHUNK] = region;
}

function hiddenDisturbanceScene() {
  const scene = disturbanceScene();
  const { state, world, deer, startCell } = scene;
  const point = resolveSpatialEstimate(state.seed, deer.id, metricAreaForCell(world, startCell)!)!;
  // This herd is near its cell's south edge. From the next cell at midnight
  // its departure is close enough to hear but its ground is out of sight.
  state.player.x = point.xM / CELL_M;
  state.player.y = Math.floor(point.yM / CELL_M) + 1.01;
  setGround(world, cellOf(state, world), "spruce");
  state.minute = 960;
  const cal = calendar(state.minute, state.startDoy);
  expect(visibleWildlife(state, world, cal)).not.toContain(deer);
  // A prior sighting must not turn a currently hidden reaction into a sighting.
  state.wildlife.visible = [deer.id];
  return { ...scene, cal };
}

describe("immediate wildlife disturbance", () => {
  it.each([
    ["deer", "light"], ["reindeer", "light"], ["elk", "heavy"],
  ] as const)("emits the %s departure with a %s body class", (species, body) => {
    const { state, world, deer: subject, cal } = disturbanceScene();
    subject.species = species;
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ subjectId: subject.id, body });
  });

  it("starts escape immediately but waits for elapsed game time before moving", () => {
    const { state, world, deer, startCell, cal } = disturbanceScene();
    const point = { ...deer.active!.position };
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    expect(deer.active).toMatchObject({ intent: "flee", escapeEpisode: 1, escapeStartedMinute: 1, lastDetectionMinute: 1 });
    expect(deer.active!.cell).toBe(startCell);
    expect(deer.active!.position).toEqual(point);
    expect(neighbours(world, startCell)).toContain(deer.active!.travel?.cell);
    expect(deer.active!.escapeRemainingM).toBeGreaterThanOrEqual(420);
    expect(deer.active!.escapeRemainingM).toBeLessThanOrEqual(680);
    expect(events).toHaveLength(1);
    expect(state.log.filter((entry) => entry.text === events[0].logText)).toHaveLength(1);
  });

  it("advances an active escape during banked fractional world time", () => {
    const { state, world, deer, cal } = disturbanceScene();
    evaluateWildlifeDisturbance(state, world, cal, false, seesStartle);
    const from = { ...deer.active!.position };

    advance(state, world, 0.25, { wildlife: "detailed" });

    expect(state.minute).toBe(1);
    expect(state.advanceCarry).toBeCloseTo(0.25, 9);
    expect(Math.hypot(deer.active!.position.xM - from.xM, deer.active!.position.yM - from.yM)).toBeCloseTo(100, 6);
  });

  it("allows an undetected herd to remain in the survivor's coarse area", () => {
    const { state, world, deer, startCell, cal } = disturbanceScene();
    const before = state.log.length;
    evaluateWildlifeDisturbance(state, world, cal, true, noDetection);
    expect(deer.active!.cell).toBe(startCell);
    expect(deer.active!.cell).toBe(cellOf(state, world));
    expect(deer.active!.alarm).toBe(0);
    expect(deer.active!.intent).toBe("wander");
    expect(state.log).toHaveLength(before);
  });

  it("refreshes detected alarm without moving or presenting the same episode again", () => {
    const { state, world, deer, cal } = disturbanceScene();
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    const escaped = deer.active!.cell;
    const point = resolveSpatialEstimate(state.seed, deer.id, metricAreaForCell(world, escaped)!)!;
    state.player.x = point.xM / CELL_M;
    state.player.y = point.yM / CELL_M;
    state.minute = 2;
    evaluateWildlifeDisturbance(state, world, calendar(2), true, seesStartle);
    expect(deer.active!.lastDetectionMinute).toBe(2);
    expect(deer.active!.cell).toBe(escaped);
    expect(deer.active!.escapeEpisode).toBe(1);
    expect(events).toHaveLength(1);
    expect(state.log.filter((entry) => entry.text === events[0].logText)).toHaveLength(1);
  });

  it.each([false, true])("sees a currently visible herd depart even when both perception rolls fail (recognized: %s)", (recognized) => {
    const { state, world, deer, cal } = disturbanceScene();
    deer.name = recognized ? "River Herd" : null;
    if (recognized) state.wildlife.recognized[deer.id] = true;
    // Visibility used for recognition is refreshed only on spatial ticks.
    state.wildlife.visible = [];
    expect(visibleWildlife(state, world, cal)).toContain(deer);
    const ui = newUiState();
    ui.zoom = 1;
    expect(mapHtml(world, state, ui, cal)).toContain(`data-wildlife-id="${deer.id}"`);
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));

    evaluateWildlifeDisturbance(state, world, cal, true, { ...seesStartle, sightRoll: 1 });

    expect(deer.active!.intent).toBe("flee");
    expect(events).toHaveLength(1);
    expect(events[0].perception).toEqual({ kind: "seen", identification: recognized ? "subject" : "species" });
    expect(events[0].logText).toContain("startles and bounds");
    expect(state.log.filter((entry) => entry.text === events[0].logText)).toHaveLength(1);
    expect(state.wildlife.visible).toEqual([]);
  });

  it("changes only behavior when a hidden startle is unperceived", () => {
    const { state, world, deer, cal } = hiddenDisturbanceScene();
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    const before = state.log.length;
    evaluateWildlifeDisturbance(state, world, cal, true, { ...seesStartle, sightRoll: 1 });
    expect(deer.active!.intent).toBe("flee");
    expect(events).toHaveLength(0);
    expect(state.log).toHaveLength(before);
  });

  it("does not map, recognize or expose a heard-only departure", () => {
    const { state, world, deer, startCell, cal } = hiddenDisturbanceScene();
    deer.name = "River Herd";
    state.wildlife.recognized[deer.id] = true;
    delete state.mapped[startCell];
    const before = JSON.stringify({ mapped: state.mapped, discovered: state.discovered, wildlife: {
      visible: state.wildlife.visible, familiarity: state.wildlife.familiarity, lastKnownDay: deer.lastKnownDay,
    } });
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    evaluateWildlifeDisturbance(state, world, cal, true, { ...seesStartle, sightRoll: 1, hearingRoll: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].perception.kind).toBe("heard");
    expect(events[0].logText).not.toContain("River");
    expect(JSON.stringify({ mapped: state.mapped, discovered: state.discovered, wildlife: {
      visible: state.wildlife.visible, familiarity: state.wildlife.familiarity, lastKnownDay: deer.lastKnownDay,
    } })).toBe(before);
  });

  it("logs perceived offline events without sending a live presentation", () => {
    const { state, world, deer, cal } = disturbanceScene();
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    const before = state.log.length;
    evaluateWildlifeDisturbance(state, world, cal, false, seesStartle);
    expect(deer.active!.intent).toBe("flee");
    expect(state.log).toHaveLength(before + 1);
    expect(events).toHaveLength(0);
  });

  it("reacts to this minute's movement before the next ten-minute tick", () => {
    const { state, world, deer, startCell } = disturbanceScene();
    setGround(world, startCell, "meadow");
    const target = neighbours(world, startCell)[0];
    state.task = { id: "walk", arg: `cell:${target}`, progress: 0, duration: 20, repeat: false };
    state.route = { target, path: [target], walked: [startCell], label: "nearby", ice: "none", lastLand: startCell };
    const before = { x: state.player.x, y: state.player.y };
    advance(state, world, 1, { wildlife: "detailed", live: true });
    expect({ x: state.player.x, y: state.player.y }).not.toEqual(before);
    expect(state.wildlife.lastSpatialTick).toBe(0);
    expect(deer.active!.intent).toBe("flee");
    expect(deer.active!.cell).toBe(startCell);
    expect(neighbours(world, startCell)).toContain(deer.active!.travel?.cell);
    expect(deer.active!.escapeStartedMinute).toBe(2);
  });

  it("reacts to noisy work during a minute with no spatial tick", () => {
    const { state, world, deer } = disturbanceScene();
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    advance(state, world, 1, { wildlife: "detailed", live: true });
    expect(state.task?.progress).toBeGreaterThan(0);
    expect(state.wildlife.lastSpatialTick).toBe(0);
    expect(deer.active!.intent).toBe("flee");
  });

  it("spends escape distance continuously from elapsed game time without replay", () => {
    const { state, world, deer, cal } = disturbanceScene();
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    const fromPoint = { ...deer.active!.position };
    // An unfinished 700 m escape must continue even when the normal rhythm says rest.
    deer.active!.escapeRemainingM = 700;
    deer.active!.rest = 100;
    state.minute = 1.5;
    stepWildlife(state, world, calendar(1.5), new Rng(2), 0.5, "detailed", true);
    expect(Math.hypot(deer.active!.position.xM - fromPoint.xM, deer.active!.position.yM - fromPoint.yM)).toBeCloseTo(200, 6);
    expect(deer.active!.escapeRemainingM).toBeCloseTo(500, 6);
    expect(deer.active!.intent).toBe("flee");
    expect(events).toHaveLength(1);
  });

  it("integrates the same escape position when elapsed game time is split", () => {
    const { state, world, deer, cal } = disturbanceScene();
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    const whole = structuredClone(state);
    const split = structuredClone(state);
    whole.minute = 1.5;
    stepWildlife(whole, world, calendar(1.5), new Rng(9), 0.5, "detailed");
    split.minute = 1.25;
    stepWildlife(split, world, calendar(1.25), new Rng(9), 0.25, "detailed");
    split.minute = 1.5;
    stepWildlife(split, world, calendar(1.5), new Rng(9), 0.25, "detailed");
    const a = whole.wildlife.subjects.find((subject) => subject.id === deer.id)!.active!;
    const b = split.wildlife.subjects.find((subject) => subject.id === deer.id)!.active!;
    expect(a.position.xM).toBeCloseTo(b.position.xM, 8);
    expect(a.position.yM).toBeCloseTo(b.position.yM, 8);
    expect(a.escapeRemainingM).toBeCloseTo(b.escapeRemainingM, 8);
  });

  it.each(["water", "thin ice", "region edge"])("stays alarmed when all exits are blocked by %s", (barrier) => {
    const { state, world, deer, startCell, cal } = disturbanceScene();
    for (const cell of neighbours(world, startCell)) {
      setGround(world, cell, barrier === "region edge" ? "meadow" : "water", barrier === "region edge" ? state.player.region + 1 : undefined);
    }
    state.weather.iceCm = barrier === "thin ice" ? 3 : 0;
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    state.minute = 10;
    stepWildlife(state, world, calendar(10), new Rng(2), 1, "detailed");
    expect(deer.active!.cell).toBe(startCell);
    expect(deer.active!.alarm).toBeGreaterThanOrEqual(50);
    expect(deer.active!.intent).toBe("flee");
    expect(deer.active!.escapeRemainingM).toBeGreaterThan(0);
    expect(state.wildlife.subjects).toContain(deer);
  });

  it("uses a passable adjacent escape when the route directly away is blocked", () => {
    const { state, world, deer, startCell, cal } = disturbanceScene();
    const exits = neighbours(world, startCell);
    for (const cell of exits.slice(1)) setGround(world, cell, "water");
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    expect(deer.active!.cell).toBe(startCell);
    expect(deer.active!.travel?.cell).toBe(exits[0]);
  });

  it("requires both elapsed time and metric separation before settling", () => {
    const { state, world, deer, cal } = disturbanceScene();
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    const point = resolveSpatialEstimate(state.seed, deer.id, metricAreaForCell(world, deer.active!.cell)!)!;
    state.player.x = (point.xM + 500) / CELL_M;
    state.player.y = point.yM / CELL_M;
    state.minute = 30;
    evaluateWildlifeDisturbance(state, world, calendar(30), true, noDetection);
    expect(deer.active!.intent).toBe("flee");
    state.player.x = point.xM / CELL_M;
    state.minute = 31;
    evaluateWildlifeDisturbance(state, world, calendar(31), true, noDetection);
    expect(deer.active!.intent).toBe("flee");
    state.player.x = (point.xM + 500) / CELL_M;
    evaluateWildlifeDisturbance(state, world, calendar(31), true, noDetection);
    expect(deer.active).toMatchObject({ alarm: 0, intent: "wander", escapeStartedMinute: null, escapeRemainingM: 0 });
  });

  it("resumes a saved escape without replaying its cue or log", () => {
    const { state, world, deer, cal } = disturbanceScene();
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    const loaded = deserialize(serialize(state))!.state;
    expect(loaded.wildlife.subjects[0].active).toEqual(deer.active);
    const logBefore = loaded.log.length;
    loaded.minute = 10;
    stepWildlife(loaded, world, calendar(10), new Rng(2), 1, "detailed", true);
    expect(events).toHaveLength(1);
    expect(loaded.log).toHaveLength(logBefore);
    expect(loaded.wildlife.subjects[0].active!.escapeEpisode).toBe(1);
  });

  it("collapses escapes during offline advance and never queues a presentation", () => {
    const { state, world, deer, cal } = disturbanceScene();
    setWildlifeEventSink(null);
    evaluateWildlifeDisturbance(state, world, cal, false, seesStartle);
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    advance(state, world, 1);
    expect(deer.active).toBeNull();
    expect(state.wildlife.activeRegion).toBeNull();
    expect(events).toHaveLength(0);
  });

  it("pauses an alerted herd immediately without starting an escape", () => {
    const { state, world, deer, startCell, cal } = disturbanceScene();
    deer.active!.alarm = 30;
    evaluateWildlifeDisturbance(state, world, cal, true, noDetection);
    expect(deer.active!.intent).toBe("rest");
    expect(deer.active!.cell).toBe(startCell);
    expect(deer.active!.escapeStartedMinute).toBeNull();
  });

  it("does not impose flight on distant occupants of the same coarse cell during a tick", () => {
    const { state, world, deer, startCell } = disturbanceScene();
    const x = startCell % world.w;
    const y = Math.floor(startCell / world.w);
    const point = resolveSpatialEstimate(state.seed, deer.id, metricAreaForCell(world, startCell)!)!;
    state.player.x = x + (point.xM / CELL_M - x < 0.5 ? 0.999 : 0.001);
    state.player.y = y + (point.yM / CELL_M - y < 0.5 ? 0.999 : 0.001);
    deer.active!.rest = 100;
    state.minute = 10;
    stepWildlife(state, world, calendar(10), new Rng(2), 1, "detailed");
    expect(deer.active!.alarm).toBe(0);
    expect(deer.active!.cell).toBe(startCell);
    expect(deer.active!.cell).toBe(cellOf(state, world));
  });

  it("uses one seeded detection threshold across fractional updates in the same minute", () => {
    const { state, world, deer, cal } = disturbanceScene();
    evaluateWildlifeDisturbance(state, world, cal, false);
    expect(deer.active!.intent).toBe("wander");
    for (let frame = 1; frame < 60; frame++) {
      state.minute = 1 + frame / 60;
      evaluateWildlifeDisturbance(state, world, calendar(state.minute), false);
    }
    expect(deer.active!.intent).toBe("wander");
  });

  it("emits another unique event only after the first episode settles", () => {
    const { state, world, deer, cal } = disturbanceScene();
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    evaluateWildlifeDisturbance(state, world, cal, true, seesStartle);
    const point = resolveSpatialEstimate(state.seed, deer.id, metricAreaForCell(world, deer.active!.cell)!)!;
    state.minute = 31;
    state.player.x = (point.xM + 500) / CELL_M;
    state.player.y = point.yM / CELL_M;
    evaluateWildlifeDisturbance(state, world, calendar(31), true, noDetection);
    state.minute = 32;
    state.player.x = point.xM / CELL_M;
    evaluateWildlifeDisturbance(state, world, calendar(32), true, seesStartle);
    expect(deer.active!.escapeEpisode).toBe(2);
    expect(events).toHaveLength(2);
    expect(events[1].id).not.toBe(events[0].id);
  });

  it("sends no presentation from detailed advance unless live was explicitly requested", () => {
    const { state, world, deer } = disturbanceScene();
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const events: WildlifeStartleEvent[] = [];
    setWildlifeEventSink((event) => events.push(event));
    advance(state, world, 1, { wildlife: "detailed" });
    expect(deer.active!.intent).toBe("flee");
    expect(events).toHaveLength(0);
  });
});

function campCell(st: { campCell: number | null }): number {
  if (st.campCell === null) throw new Error("test needs a camp");
  return st.campCell;
}

describe("large animal agents", () => {
  it("moves ordinary travel by physical speed and elapsed game time", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.wolf = Math.max(4, st.pop.wolf ?? 0);
    activateWildlife(state, world, new Rng(1));
    const wolf = state.wildlife.subjects.find((subject) => subject.species === "wolf")!;
    state.wildlife.subjects = [wolf];
    wolf.active!.intent = "wander";
    wolf.active!.target = null;
    wolf.active!.route = [];
    state.minute = 960;
    state.wildlife.lastSpatialTick = 95;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(4), 0, "detailed");
    expect(wolf.active!.travel).not.toBeNull();
    const before = { ...wolf.active!.position };
    state.minute += 0.1;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(4), 0.1, "detailed");
    expect(Math.hypot(wolf.active!.position.xM - before.xM, wolf.active!.position.yM - before.yM)).toBeCloseTo(5, 6);
  });

  it("keeps every modeled species' social and life-history rules in the catalogue", () => {
    for (const species of ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const) {
      expect(SPECIES_DEFS[species].agent).toBeDefined();
    }
    expect(SPECIES_DEFS.wolf.agent?.form).toBe("pack");
    expect(SPECIES_DEFS.bear.agent?.form).toBe("individual");
    expect(SPECIES_DEFS.bear.agent?.denMonths).toEqual([10, 2]);
  });
  it("materializes only the current region and never exceeds its populations", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));

    expect(state.wildlife.activeRegion).toBe(state.player.region);
    const active = state.wildlife.subjects.filter((s) => s.active !== null);
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThanOrEqual(12);
    for (const s of active) {
      expect(s.region).toBe(state.player.region);
      expect(regionAt(world, s.region).cells).toContain(s.active!.cell);
      expect(wildlifeMembers(s)).toBeLessThanOrEqual(Math.floor(regionState(state, world, s.region).pop[s.species] ?? 0));
    }
  });

  it("removes an active bear subject when no whole bear remains in its population", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    expect(state.wildlife.subjects.some((s) => s.species === "bear")).toBe(true);

    st.pop.bear = 0.69;
    activateWildlife(state, world, new Rng(2));
    expect(state.wildlife.subjects.some((s) => s.species === "bear")).toBe(false);
  });

  it("uses social group targets while solitary animals remain individuals", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    for (const species of ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const) st.pop[species] = 0;
    st.pop.deer = 18;
    st.pop.bear = 3;
    activateWildlife(state, world, new Rng(1));

    const deer = state.wildlife.subjects.filter((s) => s.species === "deer");
    expect(deer.length).toBeGreaterThan(1);
    expect(deer.every((s) => wildlifeMembers(s) >= 2 && wildlifeMembers(s) <= 8)).toBe(true);
    expect(state.wildlife.subjects.filter((s) => s.species === "bear").every((s) => wildlifeMembers(s) === 1)).toBe(true);
  });

  it("keeps bears dormant and off the winter map rather than making them easy prey", () => {
    const { state, world } = newGame(79, 45);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));

    const bear = state.wildlife.subjects.find((s) => s.species === "bear");
    expect(bear).toBeDefined();
    expect(bear!.active).toBeNull();
    expect(visibleWildlife(state, world, calendar(state.minute, state.startDoy))).not.toContain(bear);
  });

  it("offers skilled den tracking, then a known winter den POI and distinct den hunt", () => {
    const { state, world } = newGame(79, 45);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    setSkillLevel(state, "hunting", 5);
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    expect(bear.denCell).not.toBeNull();
    const tracking = check(state, world, calendar(state.minute, state.startDoy), "findDen");
    expect(tracking.ok).toBe(true);
    expect(tracking.label).toBe("Find bear den");
    state.wildlife.knownDens[bear.denCell!] = true;
    state.player.tools.push({ id: "bow", durability: 100 });
    addItem(state.player.pack, "arrow", 2);
    const hunt = check(state, world, calendar(state.minute, state.startDoy), "hunt", "bear");
    expect(hunt.ok).toBe(true);
    expect(hunt.label).toContain("at den");
    expect(resolveCell(state, world, calendar(state.minute, state.startDoy), "hunt", "bear", "nearest").cell).toBe(bear.denCell);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "hunt", "bear", false, new Rng(7))).toBe(true);
    expect(state.task?.wildlifeSubject).toBe(bear.id);
    const away = neighbours(world, bear.denCell!).find((cell) => passable(cellAt(world, cell).terrain) && cellAt(world, cell).region === state.player.region)!;
    placeAt(state, world, away);
    const ui = newUiState();
    ui.zoom = 0;
    const html = mapHtml(world, state, ui, calendar(state.minute, state.startDoy));
    expect(html).toContain("mk-den");
    expect(html).toMatch(/data-map-info="[^"]*known bear den/);
  });

  it("keeps a known bear den huntable throughout the modeled denning season", () => {
    const { state, world } = newGame(79, monthStartDoy(10));
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    expect(bear.denCell).not.toBeNull();
    state.wildlife.knownDens[bear.denCell!] = true;
    state.player.tools.push({ id: "bow", durability: 100 });
    addItem(state.player.pack, "arrow", 1);

    const hunt = check(state, world, calendar(state.minute, state.startDoy), "hunt", "bear");
    expect(hunt.ok).toBe(true);
    expect(hunt.label).toContain("at den");
  });

  it("collapses old cells and activates the new current region", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const old = state.player.region;
    const next = regionAt(world, old).neighbours[0].id;
    state.player.region = next;
    regionState(state, world, next);

    activateWildlife(state, world, new Rng(2));

    expect(state.wildlife.activeRegion).toBe(next);
    expect(state.wildlife.subjects.filter((s) => s.region === old).every((s) => s.active === null)).toBe(true);
    expect(state.wildlife.subjects.filter((s) => s.active !== null).every((s) => s.region === next)).toBe(true);
  });

  it("moves on ten-minute detailed ticks and never in aggregate mode", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active);
    expect(subject).toBeDefined();
    subject!.active!.intent = "wander";
    subject!.active!.target = null;

    stepWildlife(state, world, calendar(10), new Rng(4), 10, "aggregate");
    expect(subject!.active).toBeNull();
    expect(state.wildlife.activeRegion).toBeNull();
    state.minute = 20;
    stepWildlife(state, world, calendar(20), new Rng(4), 10, "detailed");
    expect(state.wildlife.lastSpatialTick).toBe(2);
    expect(regionAt(world, state.player.region).cells).toContain(subject!.active!.cell);
  });

  it.each(["campfire", "torch"] as const)("makes wolves steer around a lit %s without despawning", (light) => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.pop.wolf = Math.max(4, st.pop.wolf ?? 0);
    activateWildlife(state, world, new Rng(1));
    const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
    const center = light === "campfire" ? campCell(st) : cellOf(state, world);
    const distance = (cell: number) => Math.abs((cell % world.w) - (center % world.w)) + Math.abs(Math.floor(cell / world.w) - Math.floor(center / world.w));
    const source = regionAt(world, state.player.region).cells.find((cell) => passable(cellAt(world, cell).terrain) && distance(cell) === 3 && neighbours(world, cell).some((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region && distance(n) === 2));
    expect(source).toBeDefined();
    wolf.active!.cell = source!;
    wolf.active!.target = center;
    wolf.active!.intent = "hunt";
    if (light === "campfire") st.fire.lit = true;
    else state.player.torch.lit = true;

    state.minute = 10;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(2), 10, "detailed");
    expect(state.wildlife.subjects).toContain(wolf);
    expect(distance(wolf.active!.travel?.cell ?? wolf.active!.cell)).toBeGreaterThanOrEqual(3);

    st.fire.lit = false;
    state.player.torch.lit = false;
    wolf.active!.cell = source!;
    wolf.active!.travel = null;
    wolf.active!.target = center;
    state.minute = 20;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(2), 10, "detailed");
    const destination = wolf.active!.travel as { cell: number } | null;
    expect(distance(destination?.cell ?? wolf.active!.cell)).toBe(2);
  });

  it("resolves wolf pursuit from positions and decrements prey once", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.wolf = Math.max(4, st.pop.wolf ?? 0);
    st.pop.deer = Math.max(4, st.pop.deer ?? 0);
    activateWildlife(state, world, new Rng(1));
    const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
    const deer = state.wildlife.subjects.find((s) => s.species === "deer")!;
    state.wildlife.subjects = [wolf, deer];
    const deerCell = regionAt(world, state.player.region).cells.find((cell) => passable(cellAt(world, cell).terrain) && neighbours(world, cell).some((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region))!;
    const wolfCell = neighbours(world, deerCell).find((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region)!;
    deer.active!.cell = deerCell;
    deer.active!.rest = 100;
    wolf.active!.cell = wolfCell;
    wolf.active!.hunger = 100;
    const members = wildlifeMembers(deer);
    const population = st.pop.deer!;
    state.minute = 10;

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    state.minute += 10;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(wildlifeMembers(deer)).toBe(members - 1);
    expect(st.pop.deer).toBe(population - 1);
    expect(wolf.condition).toBeGreaterThan(70);
  });

  it("warns before a positional night wolf attack", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.wolf = Math.max(4, st.pop.wolf ?? 0);
    activateWildlife(state, world, new Rng(1));
    const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
    state.wildlife.subjects = state.wildlife.subjects.filter((subject) => subject.form !== "herd");
    st.pop.deer = 0;
    st.pop.reindeer = 0;
    st.pop.elk = 0;
    const playerCell = cellOf(state, world);
    wolf.active!.cell = neighbours(world, playerCell).find((n) => passable(cellAt(world, n).terrain) && cellAt(world, n).region === state.player.region)!;
    wolf.active!.hunger = 100;
    state.survivors[state.survivors.length - 1].person.quirks = [];
    const night = calendar(16 * 60, state.startDoy);

    state.minute = 16 * 60;
    stepWildlife(state, world, night, new Rng(3), 10, "detailed");
    expect(state.player.health).toBe(100);
    expect(state.log.some((entry) => entry.text.includes("Wolves"))).toBe(true);

    state.minute += 10;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    state.minute += 10;
    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(state.player.health).toBeLessThan(100);
  });

  it("will not attack from the survivor's cell through fire or a carried torch", () => {
    for (const light of ["fire", "torch"] as const) {
      const { state, world } = newGame(79);
      siteCamp(state, world);
      const st = regionState(state, world, state.player.region);
      st.pop.wolf = 4;
      activateWildlife(state, world, new Rng(1));
      const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
      state.wildlife.subjects = [wolf];
      wolf.active!.cell = cellOf(state, world);
      wolf.active!.hunger = 100;
      if (light === "fire") st.fire.lit = true;
      else state.player.torch.lit = true;
      state.minute = 16 * 60;

      stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
      expect(state.player.health).toBe(100);
      expect(wolf.active!.intent).toBe("flee");
    }
  });

  it("reconciles a local successful hunt without double-counting aggregate population", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.species === "deer")!;
    const members = wildlifeMembers(subject);
    const population = regionState(state, world, state.player.region).pop.deer!;

    expect(takeWildlifeMember(state, "deer")).toBe(subject);
    expect(wildlifeMembers(subject)).toBe(members - 1);
    expect(regionState(state, world, state.player.region).pop.deer).toBe(population);

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(2), 10, "aggregate");
    expect(takeWildlifeMember(state, "deer")).toBe(subject);
    expect(wildlifeMembers(subject)).toBe(members - 2);
  });

  it("cannot claim a fractional animal or harvest more whole animals than exist", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    const cell = cellOf(state, world);
    st.pop.hare = 1.69;

    expect(claimHuntableAnimal(state, world, "hare", cell)).toBe(true);
    expect(st.pop.hare).toBeCloseTo(0.69, 9);
    expect(claimHuntableAnimal(state, world, "hare", cell)).toBe(false);
    expect(st.pop.hare).toBeCloseTo(0.69, 9);
  });

  it("requires a targeted wildlife subject to exist before claiming its animal", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.deer = 2.4;
    expect(claimHuntableAnimal(state, world, "deer", cellOf(state, world), 99999)).toBe(false);
    expect(st.pop.deer).toBeCloseTo(2.4, 9);
  });

  it("does not claim a represented animal from another cell", () => {
    const { state, world } = newGame(79);
    const region = state.player.region;
    const st = regionState(state, world, region);
    st.pop.deer = 2;
    activateWildlife(state, world, new Rng(1));
    const deer = state.wildlife.subjects.find((subject) => subject.species === "deer")!;
    const encounter = regionAt(world, region).cells.find((cell) => cell !== deer.active?.cell)!;

    expect(claimHuntableAnimal(state, world, "deer", encounter)).toBe(false);
    expect(wildlifeMembers(deer)).toBe(2);
    expect(st.pop.deer).toBe(2);
  });

  it("claims a represented animal only at its encounter cell", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    st.pop.deer = 2;
    activateWildlife(state, world, new Rng(1));
    const deer = state.wildlife.subjects.find((subject) => subject.species === "deer")!;

    expect(claimHuntableAnimal(state, world, "deer", deer.active!.cell)).toBe(true);
    expect(st.pop.deer).toBe(1);
    expect(wildlifeMembers(deer)).toBe(1);
  });

  it("conserves aggregate animals across claims and explicit regional movement", () => {
    const { state, world } = newGame(79);
    const home = state.player.region;
    const neighbour = regionAt(world, home).neighbours.find((candidate) => regionAt(world, candidate.id).capacity.deer);
    expect(neighbour).toBeDefined();
    const a = regionState(state, world, home);
    const b = regionState(state, world, neighbour!.id);
    a.pop.deer = 3.6;
    b.pop.deer = 1.2;
    const starting = a.pop.deer + b.pop.deer;

    expect(claimHuntableAnimal(state, world, "deer", cellOf(state, world))).toBe(true);
    const afterHarvest = a.pop.deer + b.pop.deer;
    expect(afterHarvest).toBeCloseTo(starting - 1, 9);

    dailyAnimals(state, world, calendar(1440 * 220), new Rng(4), null);
    expect(a.pop.deer + b.pop.deer).toBeCloseTo(afterHarvest, 9);
  });

  it("is wired into advance only when detailed mode is requested", () => {
    const detailed = newGame(79);
    const aggregate = newGame(79);
    advance(detailed.state, detailed.world, 11, { wildlife: "detailed" });
    advance(aggregate.state, aggregate.world, 11, { wildlife: "aggregate" });
    expect(detailed.state.wildlife.subjects.some((s) => s.active)).toBe(true);
    expect(aggregate.state.wildlife.subjects).toHaveLength(0);
  });

  it("keeps a twelve-subject spatial tick below the frame budget", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    for (const species of ["deer", "reindeer", "elk", "wolf"] as const) st.pop[species] = 24;
    activateWildlife(state, world, new Rng(1));
    expect(state.wildlife.subjects.filter((subject) => subject.active).length).toBe(12);
    const started = performance.now();
    for (let tick = 1; tick <= 10; tick++) {
      state.minute = tick * 10;
      stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(tick), 10, "detailed");
    }
    expect((performance.now() - started) / 10).toBeLessThan(16);
  });

  it("turns a pregnant group's birth into a real cohort and population", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const herd = state.wildlife.subjects.find((s) => s.species === "deer")!;
    herd.reproductive = "pregnant";
    const before = wildlifeMembers(herd);
    const pop = regionState(state, world, herd.region).pop.deer!;
    dailyWildlife(state, world, calendar(35 * 1440, state.startDoy), new Rng(3));
    expect(state.wildlife.subjects.filter((subject) => subject.species === "deer").reduce((sum, subject) => sum + wildlifeMembers(subject), 0)).toBeGreaterThan(before);
    expect(regionState(state, world, herd.region).pop.deer).toBeGreaterThan(pop);
    expect(herd.reproductive).toBe("dependent");
  });

  it("splits an oversized social group without changing its total population", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    for (const species of ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"] as const) st.pop[species] = 0;
    st.pop.deer = 10;
    activateWildlife(state, world, new Rng(1));
    const groups = state.wildlife.subjects.filter((subject) => subject.species === "deer");
    groups[0].cohorts[0].count = 10;
    state.wildlife.subjects = [groups[0]];
    const before = st.pop.deer;

    dailyWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3));
    const after = state.wildlife.subjects.filter((subject) => subject.species === "deer");
    expect(after.length).toBe(2);
    expect(after.every((subject) => wildlifeMembers(subject) <= 8)).toBe(true);
    expect(after.reduce((sum, subject) => sum + wildlifeMembers(subject), 0)).toBe(10);
    expect(st.pop.deer).toBe(before);
  });

  it("lets a hungry solitary predator take exposed camp meat unless fire deters it", () => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    const camp = campCell(st);
    bear.active!.cell = camp;
    bear.active!.hunger = 100;
    addItem(pile(state, camp), "rawMeat", 3);
    state.minute = 10;

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(qty(pile(state, camp), "rawMeat")).toBeLessThan(3);
    expect(state.log.some((e) => e.text.includes("brown bear") && e.text.includes("meat"))).toBe(true);
  });

  it("does not turn fire into an absolute bear-proof bubble", () => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    st.fire.lit = true;
    st.rack.kg = 3;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    bear.active!.cell = campCell(st);
    bear.active!.hunger = 100;
    state.minute = 10;

    stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
    expect(st.rack.kg).toBeLessThan(3);
  });

  it("applies predator food risk in aggregate catch-up without spatial subjects", () => {
    const { state, world } = newGame(79);
    const st = regionState(state, world, state.player.region);
    regionAt(world, state.player.region).capacity.bear = 100;
    st.pop.bear = 100;
    st.rack.kg = 3;
    for (let day = 0; day < 2000 && st.rack.kg === 3; day++) {
      dailyWildlife(state, world, calendar(day * 1440, state.startDoy), new Rng(day), "aggregate");
    }
    expect(st.rack.kg).toBe(2);
    expect(state.wildlife.subjects).toHaveLength(0);
  });

  it("does not draw aggregate theft randomness for an empty camp", () => {
    const { state, world } = newGame(79);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    delete state.piles[campCell(st)];
    st.rack.kg = 0;
    const before = new Rng(9123);
    const actual = new Rng(9123);
    dailyWildlife(state, world, calendar(state.minute, state.startDoy), actual, "aggregate");
    expect(actual.s).toBe(before.s);
  });

  it("keeps a persistent denning bear in the population when it emerges", () => {
    const { state, world } = newGame(79, 45);
    const st = regionState(state, world, state.player.region);
    st.pop.bear = 1;
    activateWildlife(state, world, new Rng(1));
    const bear = state.wildlife.subjects.find((s) => s.species === "bear")!;
    for (const monthDay of [120, 150]) {
      const cal = calendar(12 * 60, monthDay);
      dailyAnimals(state, world, cal, new Rng(monthDay), null);
      dailyWildlife(state, world, cal, new Rng(monthDay));
    }
    expect(state.wildlife.subjects).toContain(bear);
    expect(st.pop.bear).toBeGreaterThanOrEqual(1);
  });
});

describe("animal recognition", () => {
  it("credits at most once a day and recognizes faster with Hunting skill", () => {
    const { state, world } = newGame(79);
    state.wildlife = emptyWildlife();
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    setSkillLevel(state, "hunting", 11);

    noteWildlifeSightings(state, [subject.id], 1);
    noteWildlifeSightings(state, [subject.id], 1);
    expect(state.wildlife.familiarity[subject.id].points).toBe(3);
    expect(subject.name).toBeNull();
    noteWildlifeSightings(state, [subject.id], 2);

    expect(subject.name).not.toBeNull();
    expect(state.wildlife.recognitionQueue).toEqual([subject.id]);
    expect(recognitionHtml(state, subject.id)).toContain("You recognize this animal");
    expect(recognitionHtml(state, subject.id)).toContain(subject.name!);
  });

  it("drops a pending recognition when that subject dies", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.species === "bear") ?? state.wildlife.subjects[0];
    subject.cohorts = [{ sex: "m", bornYear: 1, count: 1 }];
    state.wildlife.recognitionQueue = [subject.id];
    takeWildlifeMember(state, subject.species, subject.id);
    expect(state.wildlife.recognitionQueue).toEqual([]);
  });

  it("gives an heir a hidden head start but requires a sighting in this life", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    subject.name = "Mora";
    state.wildlife.recognized[subject.id] = true;
    state.survivors[0].events.push({ kind: "animalRecognized", subject: subject.id, name: "Mora", day: 2, date: { year: 1, doy: 93 } });

    resetWildlifeKnowledge(state);
    expect(state.wildlife.inherited[subject.id]).toBe(3);
    expect(state.wildlife.recognized[subject.id]).toBeUndefined();
    expect(state.wildlife.recognitionQueue).toEqual([]);
    expect(state.wildlife.lastSpatialTick).toBe(-1);

    setSkillLevel(state, "hunting", 11);
    noteWildlifeSightings(state, [subject.id], 3);
    expect(state.wildlife.recognized[subject.id]).toBe(true);
    expect(subject.name).toBe("Mora");
    expect(state.wildlife.recognitionQueue).toEqual([subject.id]);
  });

  it("shows only currently visible subjects and gives a named subject its accent", () => {
    const { state, world } = newGame(79);
    activateWildlife(state, world, new Rng(1));
    const subject = state.wildlife.subjects.find((s) => s.active)!;
    subject.active!.cell = neighbours(world, cellOf(state, world)).find((c) => passable(cellAt(world, c).terrain) && cellAt(world, c).region === state.player.region)!;
    const cal = calendar(state.minute, state.startDoy);
    expect(visibleWildlife(state, world, cal).map((s) => s.id)).toContain(subject.id);

    subject.name = "Mora";
    state.wildlife.recognized[subject.id] = true;
    const close = newUiState();
    close.zoom = 0;
    const html = mapHtml(world, state, close, cal);
    expect(html).toContain("mk-animal");
    expect(html).toContain("Mora");
    expect(html).toContain(`wildlife-${subject.colour}`);
    const marker = html.match(new RegExp(`data-wildlife-id="${subject.id}"[^>]*--animal-x:([0-9.]+)px`));
    expect(marker).not.toBeNull();
    if (!marker) throw new Error("expected a visual wildlife slot");
    expect(Number(marker[1])).toBeGreaterThan(0);

    close.zoom = 3;
    expect(mapHtml(world, state, close, cal)).not.toContain("mk-animal");
  });

  it("round-trips version 9 and fills older saves with empty wildlife", () => {
    const { state } = newGame(79);
    const current = JSON.parse(serialize(state));
    expect(current.version).toBe(9);
    expect(deserialize(JSON.stringify(current))!.state.wildlife).toEqual(state.wildlife);

    current.version = 7;
    delete current.state.wildlife;
    const old = deserialize(JSON.stringify(current));
    expect(old!.state.wildlife).toEqual(emptyWildlife());
  });
});
