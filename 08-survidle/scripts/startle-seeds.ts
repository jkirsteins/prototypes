/** Bounded, seeded encounter fixtures on unmodified generated terrain. */
import { Rng, derive } from "../src/rng";
import { CELL_KM } from "../src/units";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { visibleCells } from "../src/sim/sight";
import { activateWildlife, evaluateWildlifeDisturbance } from "../src/sim/wildlife-agents";
import { metricAreaForCell, resolveSpatialEstimate } from "../src/sim/wildlife-space";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";
import { passable } from "../src/world/route";
import type { GameState } from "../src/sim/types";

export const STARTLE_KINDS = ["visible", "heard-only", "same-area-remain", "bog", "snow", "blocked-edge"] as const;
export type StartleScenarioKind = typeof STARTLE_KINDS[number];
export interface StartleScenario {
  kind: StartleScenarioKind;
  seed: number;
  subjectId: number;
  startCell: number;
  survivorCell: number;
  x: number;
  y: number;
  approachX: number;
  approachY: number;
}
export interface StartleScene { state: GameState; world: World }

function baseScene(seed: number): StartleScene {
  const scene = newGame(seed, 90);
  activateWildlife(scene.state, scene.world, new Rng(derive(seed, 99)));
  return scene;
}

function configureScene(scene: StartleScene, scenario: StartleScenario): void {
  const { state, world } = scene;
  const subject = state.wildlife.subjects.find(s => s.id === scenario.subjectId);
  if (subject?.form !== "herd") throw new Error("Scenario subject is not a generated ungulate");
  // Isolate one naturally generated subject, retaining its identity and group.
  for (const other of state.wildlife.subjects) other.active = null;
  const position = resolveSpatialEstimate(state.seed, subject.id, metricAreaForCell(world, scenario.startCell)!);
  if (!position) throw new Error("Scenario subject position is invalid");
  subject.active = {
    cell: scenario.startCell, position, travel: null, hunger: 20, thirst: 20, rest: 20, alarm: 0, intent: "wander", target: null, route: [],
    escapeRemainingM: 0, escapeStartedMinute: null, lastDetectionMinute: null, escapeEpisode: 0,
  };
  state.minute = scenario.kind === "heard-only" ? 960 : 1;
  state.wildlife.lastSpatialTick = Math.floor(state.minute / 10);
  state.weather.precip = "none";
  state.weather.clear = true;
  state.weather.snowCm = scenario.kind === "snow" ? 10 : 0;
  state.player.x = scenario.x;
  state.player.y = scenario.y;
  state.task = null;
  state.route = null;
  state.intent = null;
  state.log = [];
  // Set only actual visible ground. Heard-only fixtures must start unmapped.
  state.mapped = {};
  const seen = visibleCells(state, world, calendar(state.minute, state.startDoy), cellOf(state, world));
  for (const cell of seen) state.mapped[cell] = 1;
  state.wildlife.visible = seen.has(scenario.startCell) ? [subject.id] : [];
}

export function prepareStartleScenario(scenario: StartleScenario): StartleScene {
  const scene = baseScene(scenario.seed);
  configureScene(scene, scenario);
  return scene;
}

/** One explicit movement sample, through the production encounter and live event path. */
export function stepStartleScenario(scene: StartleScene, scenario: StartleScenario, live = false): void {
  const { state, world } = scene;
  state.player.x = scenario.approachX;
  state.player.y = scenario.approachY;
  const cell = cellOf(state, world);
  state.route = { target: cell, path: [cell], walked: [scenario.survivorCell], label: "Approach", ice: "none", lastLand: cell };
  evaluateWildlifeDisturbance(state, world, calendar(state.minute, state.startDoy), live);
  state.route = null;
}

function outcome(scene: StartleScene, scenario: StartleScenario) {
  const { state, world } = scene;
  const active = state.wildlife.subjects.find(s => s.id === scenario.subjectId)!.active!;
  const text = state.log.map(entry => entry.text).join("\n");
  // Offline replay has no presentation sink. The emitted log vocabulary is
  // the public observation channel; integration tests also verify live events.
  const seen = text.includes("startles and bounds");
  const heard = text.includes("crash");
  const startVisible = visibleCells(state, world, calendar(state.minute, state.startDoy), cellOf(state, world)).has(scenario.startCell);
  let kind: StartleScenarioKind | null = null;
  if (scenario.kind === "same-area-remain") {
    if (active.alarm === 0 && active.cell === cellOf(state, world) && !text) kind = scenario.kind;
  } else if (active.escapeEpisode === 1 && (seen || heard)) {
    if (scenario.kind === "visible" && seen && startVisible) kind = scenario.kind;
    if (scenario.kind === "heard-only" && heard && !startVisible && state.mapped[scenario.startCell] === undefined) kind = scenario.kind;
    if (scenario.kind === "bog" && cellAt(world, scenario.startCell).terrain === "bog") kind = scenario.kind;
    if (scenario.kind === "snow" && state.weather.snowCm >= 5) kind = scenario.kind;
    if (scenario.kind === "blocked-edge" && neighbours(world, scenario.startCell).some(cell =>
      !passable(cellAt(world, cell).terrain) || cellAt(world, cell).region !== state.player.region)) kind = scenario.kind;
  }
  return { kind, endCell: active.cell, alarm: active.alarm, episode: active.escapeEpisode, text };
}

/** Creates fresh state, uses no ambient randomness and emits no presentation. */
export function replayStartleScenario(scenario: StartleScenario) {
  const scene = prepareStartleScenario(scenario);
  stepStartleScenario(scene, scenario);
  return outcome(scene, scenario);
}

export function findStartleScenario(kind: StartleScenarioKind, firstSeed = 1, lastSeed = 5000): StartleScenario | null {
  if (!STARTLE_KINDS.includes(kind) || !Number.isInteger(firstSeed) || !Number.isInteger(lastSeed)
    || firstSeed < 1 || lastSeed > 5000) throw new Error("Use a known scenario and integer seeds within 1..5000");
  for (let seed = firstSeed; seed <= lastSeed; seed++) {
    const scene = baseScene(seed);
    const { state, world } = scene;
    const subject = state.wildlife.subjects.find(s => s.form === "herd" && s.active);
    if (!subject) continue;
    const cells = regionAt(world, state.player.region).cells.filter(cell => {
      const terrain = cellAt(world, cell).terrain;
      if (!passable(terrain)) return false;
      if (kind === "heard-only") return terrain === "spruce";
      if (kind === "bog") return terrain === "bog";
      if (kind === "blocked-edge") return neighbours(world, cell).some(n => !passable(cellAt(world, n).terrain) || cellAt(world, n).region !== state.player.region);
      return true;
    }).slice(0, 16);
    for (const startCell of cells) {
      const point = resolveSpatialEstimate(seed, subject.id, metricAreaForCell(world, startCell)!)!;
      const sx = point.xM / (CELL_KM * 1000);
      const sy = point.yM / (CELL_KM * 1000);
      for (const offset of [0.15, 0.35, 0.6, 0.9]) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const approachX = sx + dx * offset;
          const approachY = sy + dy * offset;
          // Start 15 m farther away and take one explicit approach sample.
          const x = approachX + dx * 0.05;
          const y = approachY + dy * 0.05;
          const survivorCell = Math.floor(y) * world.w + Math.floor(x);
          const approachCell = Math.floor(approachY) * world.w + Math.floor(approachX);
          if (survivorCell !== approachCell || !passable(cellAt(world, survivorCell).terrain)
            || cellAt(world, survivorCell).region !== state.player.region) continue;
          if (kind === "same-area-remain" && survivorCell !== startCell) continue;
          const scenario = { kind, seed, subjectId: subject.id, startCell, survivorCell, x, y, approachX, approachY };
          configureScene(scene, scenario);
          stepStartleScenario(scene, scenario);
          if (outcome(scene, scenario).kind === kind) return scenario;
        }
      }
    }
  }
  return null;
}

export function startleSetupCommand(scenario: StartleScenario): string {
  return `await window.survidle.startleSetup(${JSON.stringify(scenario)});`;
}

if (typeof process !== "undefined" && process.env.npm_lifecycle_event === "startle-seeds" && typeof window === "undefined") {
  console.log("kind | seed | subject | animal start | survivor | approach");
  for (const kind of STARTLE_KINDS) {
    const scenario = findStartleScenario(kind);
    if (!scenario) throw new Error(`No ${kind} fixture found within seeds 1..5000`);
    const result = replayStartleScenario(scenario);
    console.log(`${kind} | ${scenario.seed} | ${scenario.subjectId} | ${scenario.startCell} | ${scenario.survivorCell} | 15 m toward subject, then window.survidle.startleStep()`);
    console.log(startleSetupCommand(scenario));
    console.log(`Expected: ${result.text || "No reaction or log; shared cell remains calm."}`);
  }
  console.log("Development server only. Setup holds simulation time and autosave; step plays a live event. Run window.survidle.startleEnd() to restore the prior run.");
}
