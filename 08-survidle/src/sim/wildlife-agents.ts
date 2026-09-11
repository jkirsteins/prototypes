import { derive, type Rng } from "../rng";
import { cellAt, regionAt, type World } from "../world/gen";
import { findRoute, passable } from "../world/route";
import { type FineNeighbour, fineNeighbours, PATCH_M, type PatchId, patchCenter, patchId, patchXY } from "../world/spatial";
import { calendar, type Calendar } from "./calendar";
import { popOf } from "./animals";
import { regionDensity } from "./animals";
import { regionState, siteAt } from "./regionstate";
import { oddsFactor, skillLevel } from "./skills";
import { noteHuntSign } from "./hunting";
import type { AgentSpecies, GameState, Species, WildlifeMode, WildlifeState, WildlifeSubject } from "./types";
import { cellOf } from "./position";
import { visibleCells } from "./sight";
import { record } from "./record";
import { DISTURBANCE_PROFILES, SPECIES_DEFS } from "./species";
import { carried, pile, qty, removeItem } from "./inventory";
import { log } from "./log";
import { die, sheltered, walkSpeed } from "./player";
import { hasQuirk } from "./person";
import { cue } from "./cues";
import { illuminance } from "./light";
import { cellForMetricPoint, encounterGeometry, metricAreaForCell, metricPointForPlayer, metricPointForWildlife, resolveSpatialEstimate, type MetricPoint } from "./wildlife-space";
import { escapeDistanceM, evaluateUngulateEncounter, neutralMovementProfile, startleLogText, type UngulateEncounterInput, type WildlifeStartleEvent } from "./wildlife-encounter";
import { emitWildlifeEvent } from "./wildlife-events";
import { notePopulationChange } from "./hunt-audit";

export const AGENT_SPECIES: AgentSpecies[] = ["deer", "reindeer", "elk", "wolf", "wolverine", "bear"];
export const MAX_ACTIVE_SUBJECTS = 12;
export const WILDLIFE_TICK_MINUTES = 10;

function inMonths(month: number, range: [number, number]): boolean {
  return range[0] <= range[1] ? month >= range[0] && month <= range[1] : month >= range[0] || month <= range[1];
}

const PROPER_NAMES = ["Mora", "Runa", "Otso", "Niva", "Salla", "Tavi", "Kuru", "Vesa"];
const FIELD_NAMES = ["River", "Greyback", "North Fell", "Split Ear", "Birchwood", "Long Track", "Red Hill", "Marsh"];

export function emptyWildlife(): WildlifeState {
  return { nextId: 1, activeRegion: null, subjects: [], lastSpatialTick: -1, familiarity: {}, inherited: {}, recognized: {}, visible: [], knownDens: {}, recognitionQueue: [] };
}

export function wildlifeMembers(subject: WildlifeSubject): number {
  return subject.cohorts.reduce((n, c) => n + c.count, 0);
}

/** A camp cell and whether its food pile is enclosed against large scavengers. */
function campStore(state: GameState, subjectRegion: number): { cell: number; protected: boolean } | null {
  const st = state.regions[subjectRegion];
  if (!st || st.campCell === null) return null;
  const structures = siteAt(st, st.campCell)?.structures;
  return { cell: st.campCell, protected: Boolean(structures?.cabin || structures?.turfHut) };
}

function habitatOf(species: AgentSpecies): Set<string> {
  return species === "reindeer" ? new Set(["fell", "rock", "bog", "pine"])
    : species === "elk" ? new Set(["spruce", "bog", "birch", "pine"])
      : new Set(["spruce", "pine", "birch", "bog", "meadow", "fell", "rock"]);
}

/** Every patch of a region this species could stand on. Whole-region work:
 * for placing a subject that has none, never for a step it is about to take. */
function suitableCells(world: World, region: number, species: AgentSpecies): number[] {
  const habitat = habitatOf(species);
  const cells = regionAt(world, region).cells.filter((idx) => {
    const c = cellAt(world, idx);
    return passable(c.terrain) && habitat.has(c.terrain);
  });
  return cells.length ? cells : regionAt(world, region).cells.filter((idx) => passable(cellAt(world, idx).terrain));
}

/** The 50 m strides an animal may take: its own region, passable ground, and
 * no diagonal that squeezes between two blocked patches. */
function stepCandidates(world: World, subject: WildlifeSubject, from: PatchId): FineNeighbour[] {
  return fineNeighbours(world, from).filter((n) => {
    const c = cellAt(world, n.patch);
    return c.region === subject.region && passable(c.terrain)
      && n.corners.every((corner) => passable(cellAt(world, corner).terrain));
  });
}

function stepPatches(world: World, subject: WildlifeSubject, from: PatchId): PatchId[] {
  return stepCandidates(world, subject, from).map((n) => n.patch);
}

function metresBetween(a: PatchId, b: PatchId): number {
  const from = patchCenter(a);
  const to = patchCenter(b);
  return Math.hypot(to.xM - from.xM, to.yM - from.yM);
}

/** How far an animal looks for water or feeding ground before settling for
 * what is around it. A patch is 50 m; a region is tens of thousands of them,
 * and no animal searches a region to decide its next step. */
const LOCAL_RANGE_M = 1200;

/** Wolves will not close on firelight. The standoff is the light's reach. */
const LIGHT_STANDOFF_M = 600;

/** Near enough that a survivor in the open hears the pack before it comes. */
const WOLF_WARNING_M = 300;

/** The nearest patch within local range that answers `want`, by true distance. */
function nearestLocalPatch(world: World, from: PatchId, want: (patch: PatchId) => boolean): PatchId | undefined {
  const reach = Math.round(LOCAL_RANGE_M / PATCH_M);
  const origin = patchXY(from);
  const x0 = Math.max(0, origin.x - reach);
  const x1 = Math.min(world.w - 1, origin.x + reach);
  const y0 = Math.max(0, origin.y - reach);
  const y1 = Math.min(world.h - 1, origin.y + reach);
  let best: PatchId | undefined;
  let bestM = Number.POSITIVE_INFINITY;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const metres = Math.hypot(x - origin.x, y - origin.y) * PATCH_M;
      if (metres > LOCAL_RANGE_M || metres >= bestM) continue;
      const patch = patchId(x, y);
      if (!want(patch)) continue;
      best = patch;
      bestM = metres;
    }
  }
  return best;
}

/** Feeding ground of this animal's own kind, within its own region. */
function localForage(world: World, subject: WildlifeSubject, from: PatchId): PatchId | undefined {
  const habitat = habitatOf(subject.species);
  return nearestLocalPatch(world, from, (patch) => {
    const c = cellAt(world, patch);
    return c.region === subject.region && passable(c.terrain) && habitat.has(c.terrain);
  });
}

/** Land beside open water: where an animal drinks. */
function localShore(world: World, subject: WildlifeSubject, from: PatchId): PatchId | undefined {
  return nearestLocalPatch(world, from, (patch) => {
    const c = cellAt(world, patch);
    if (c.region !== subject.region || !passable(c.terrain)) return false;
    return fineNeighbours(world, patch).some((n) => cellAt(world, n.patch).terrain === "water");
  });
}

function denning(subject: WildlifeSubject, cal: Calendar): boolean {
  const months = SPECIES_DEFS[subject.species].agent?.denMonths;
  return Boolean(months && inMonths(cal.month, months));
}

function reconcileRegion(state: GameState, world: World, region: number, cal: Calendar): void {
  const st = regionState(state, world, region);
  for (const species of AGENT_SPECIES) {
    const subjects = state.wildlife.subjects.filter((s) => s.region === region && s.species === species && !denning(s, cal));
    let excess = subjects.reduce((sum, subject) => sum + wildlifeMembers(subject), 0) - Math.floor(popOf(st, species));
    if (excess <= 0) continue;
    subjects.sort((a, b) => Number(Boolean(state.wildlife.recognized[a.id])) - Number(Boolean(state.wildlife.recognized[b.id])));
    for (const subject of subjects) {
      while (excess > 0 && wildlifeMembers(subject) > 0) {
        removeMember(subject);
        excess--;
      }
      if (wildlifeMembers(subject) === 0) removeSubject(state, subject);
      if (excess <= 0) break;
    }
  }
}

function makeSubject(state: GameState, species: AgentSpecies, region: number, count: number): WildlifeSubject {
  const id = state.wildlife.nextId++;
  const form = SPECIES_DEFS[species].agent!.form;
  return {
    id, species, form, region,
    cohorts: [{ sex: id % 2 ? "f" : "m", bornYear: Math.max(1, state.year - 2), count }],
    condition: 70, reproductive: "none", dependentUntilYear: 0,
    name: null, nameKind: form === "individual" ? "proper" : "field",
    colour: derive(state.seed, 7000 + id) % 6, lastKnownDay: -1, denCell: null, active: null,
  };
}

/** Collapses every cell and materializes a bounded cohort in the current region. */
export function activateWildlife(state: GameState, world: World, rng: Rng): void {
  const region = state.player.region;
  if (state.wildlife.activeRegion !== region) {
    for (const s of state.wildlife.subjects) s.active = null;
    state.wildlife.activeRegion = region;
  }
  const cal = calendar(state.minute, state.startDoy);
  reconcileRegion(state, world, region, cal);
  const st = regionState(state, world, region);
  for (const species of AGENT_SPECIES) {
    let represented = state.wildlife.subjects.filter((s) => s.region === region && s.species === species).reduce((n, s) => n + wildlifeMembers(s), 0);
    let available = Math.max(0, Math.floor(popOf(st, species)) - represented);
    while (available > 0 && state.wildlife.subjects.filter((s) => s.region === region).length < MAX_ACTIVE_SUBJECTS) {
      const profile = SPECIES_DEFS[species].agent!;
      const solitary = profile.form === "individual";
      if (!solitary && available < profile.group[0]) break;
      const groups = solitary ? available : Math.ceil(available / profile.group[1]);
      const n = solitary ? 1 : Math.ceil(available / groups);
      state.wildlife.subjects.push(makeSubject(state, species, region, n));
      represented += n;
      available -= n;
    }
  }
  const ground = new Map<AgentSpecies, number[]>();
  const groundFor = (species: AgentSpecies): number[] => {
    let cells = ground.get(species);
    if (!cells) {
      cells = suitableCells(world, region, species);
      ground.set(species, cells);
    }
    return cells;
  };
  for (const subject of state.wildlife.subjects.filter((s) => s.region === region)) {
    if (subject.species === "bear" && subject.denCell === null) {
      const dens = groundFor("bear");
      if (dens.length) subject.denCell = dens[derive(state.seed, 9000 + subject.id) % dens.length];
    }
    if (denning(subject, cal)) {
      subject.active = null;
      continue;
    }
    if (subject.active) continue;
    const cells = groundFor(subject.species);
    if (!cells.length) continue;
    const cell = cells[rng.int(cells.length)];
    const position = subjectPoint(state, world, subject, cell);
    if (!position) continue;
    subject.active = {
      cell, position, travel: null, hunger: 20, thirst: 20, rest: 20, alarm: 0, intent: "wander", target: null, route: [],
      escapeRemainingM: 0, escapeStartedMinute: null, lastDetectionMinute: null, escapeEpisode: 0,
    };
  }
}

const COVER = { water: 0, fell: 0.05, rock: 0.1, bog: 0.2, spruce: 0.85, pine: 0.5, birch: 0.4, meadow: 0.1 };
const NOISY_WORK = new Set(["chop", "split", "splitWedges", "build", "mend", "iceHole", "crack", "stone"]);
type EncounterRolls = Pick<UngulateEncounterInput, "detectionRoll" | "auditoryDetectionRoll" | "sightRoll" | "hearingRoll">;

function subjectPoint(state: GameState, world: World, subject: WildlifeSubject, cell: number): MetricPoint | null {
  const area = metricAreaForCell(world, cell);
  return area && resolveSpatialEstimate(state.seed, subject.id, area);
}

function beginSegment(state: GameState, world: World, subject: WildlifeSubject, cell: number): boolean {
  const active = subject.active;
  if (!active || active.travel || cell === active.cell) return false;
  const position = metricPointForWildlife(state, world, subject);
  const destination = subjectPoint(state, world, subject, cell);
  if (!position || !destination) return false;
  active.position = position;
  active.travel = { destination, cell };
  return true;
}

/**
 * One 50 m stride directly away from the disturbance, chosen but not walked.
 * The stride translates the animal by exactly one patch offset, so a held
 * direction keeps the flight straight: the metres an escape spends are the
 * metres it puts between the animal and what frightened it.
 */
function beginEscapeSegment(state: GameState, world: World, subject: WildlifeSubject): boolean {
  const active = subject.active;
  if (!active || active.travel || active.escapeRemainingM <= 0) return false;
  const actor = metricPointForPlayer(state, world);
  const from = metricPointForWildlife(state, world, subject);
  if (!actor || !from) return false;
  const awayX = from.xM - actor.xM;
  const awayY = from.yM - actor.yM;
  const away = Math.hypot(awayX, awayY) || 1;
  const here = patchXY(active.cell);
  const stride = stepCandidates(world, subject, active.cell)
    .map((n) => {
      const step = patchXY(n.patch);
      const dx = (step.x - here.x) * PATCH_M;
      const dy = (step.y - here.y) * PATCH_M;
      return { patch: n.patch, dx, dy, alignment: (dx * awayX + dy * awayY) / (n.distanceM * away) };
    })
    .sort((a, b) => b.alignment - a.alignment)[0];
  if (!stride) return false;
  active.position = from;
  active.travel = { destination: { xM: from.xM + stride.dx, yM: from.yM + stride.dy }, cell: stride.patch };
  return true;
}

/**
 * Keeps one hierarchical route per destination: a route is searched when the
 * animal takes a target and not again while its steps still fit under the
 * animal's feet. Ground it cannot reach gives the target up rather than
 * paying for the same failed search on every stride.
 */
function followRoute(world: World, subject: WildlifeSubject, candidates: readonly PatchId[]): boolean {
  const active = subject.active;
  if (!active || active.target === null) return false;
  if (active.route.length > 0 && active.route.at(-1) === active.target && candidates.includes(active.route[0])) return true;
  const route = findRoute(world, active.cell, active.target);
  if (!route) {
    active.route = [];
    active.target = null;
    return false;
  }
  active.route = route.filter((cell) => cellAt(world, cell).region === subject.region);
  return true;
}

function continueSegment(state: GameState, world: World, subject: WildlifeSubject, rng: Rng): boolean {
  const active = subject.active;
  if (!active || active.travel) return false;
  if (active.intent === "flee") return beginEscapeSegment(state, world, subject);
  if (active.target !== null) {
    if (active.cell === active.target) return false;
    const candidates = stepPatches(world, subject, active.cell);
    if (!followRoute(world, subject, candidates)) return false;
    const next = active.route.shift();
    return next !== undefined && candidates.includes(next) ? beginSegment(state, world, subject, next) : false;
  }
  if (active.intent !== "wander") return false;
  const candidates = stepPatches(world, subject, active.cell);
  return candidates.length ? beginSegment(state, world, subject, candidates[rng.int(candidates.length)]) : false;
}

/** Advances only travel that existed during this elapsed interval. */
function advanceWildlifeTravel(state: GameState, world: World, subject: WildlifeSubject, rng: Rng, dtMinutes: number): void {
  const active = subject.active;
  if (!active?.travel || dtMinutes <= 0) return;
  const position = metricPointForWildlife(state, world, subject);
  if (!position) return;
  active.position = position;
  let distanceBudget = DISTURBANCE_PROFILES[subject.species][active.intent === "flee" ? "escapeSpeedKmh" : "travelSpeedKmh"] * 1000 / 60 * dtMinutes;
  let guard = 0;
  while (active.travel && distanceBudget > 1e-9 && guard++ < 32) {
    const dx = active.travel.destination.xM - active.position.xM;
    const dy = active.travel.destination.yM - active.position.yM;
    const segmentM = Math.hypot(dx, dy);
    const escapeBudget = active.intent === "flee" ? active.escapeRemainingM : Number.POSITIVE_INFINITY;
    const moveM = Math.min(distanceBudget, segmentM, escapeBudget);
    if (moveM <= 1e-9) {
      active.travel = null;
      break;
    }
    const share = moveM / segmentM;
    active.position = { xM: active.position.xM + dx * share, yM: active.position.yM + dy * share };
    distanceBudget -= moveM;
    if (active.intent === "flee") active.escapeRemainingM = Math.max(0, active.escapeRemainingM - moveM);
    const crossed = cellForMetricPoint(world, active.position);
    if (crossed !== null) active.cell = crossed;
    if (moveM + 1e-9 < segmentM) break;
    const arrivedCell = active.travel.cell;
    active.position = active.travel.destination;
    active.cell = arrivedCell;
    active.travel = null;
    if (active.intent === "drink" && active.cell === active.target) {
      active.thirst = 0;
      active.target = null;
      break;
    }
    if (!continueSegment(state, world, subject, rng)) break;
  }
}

/** Advances authoritative positions without running a new behavior decision. */
export function advanceWildlifeMotion(state: GameState, world: World, rng: Rng, dtMinutes: number): void {
  for (const subject of state.wildlife.subjects) {
    if (subject.region === state.player.region) advanceWildlifeTravel(state, world, subject, rng, dtMinutes);
  }
}

/** Evaluated after player movement/work and again after a detailed animal tick. */
export function evaluateWildlifeDisturbance(state: GameState, world: World, cal: Calendar, live: boolean, rolls: EncounterRolls = {}): void {
  if (state.wildlife.activeRegion !== state.player.region) return;
  const actor = metricPointForPlayer(state, world);
  if (!actor) return;
  const playerTerrain = cellAt(world, cellOf(state, world)).terrain;
  const movement = neutralMovementProfile(state.route ? walkSpeed(state, cal, state.weather, playerTerrain, undefined, state.route.ice) : 0, carried(state.player));
  movement.deliberateApproach = state.task?.id === "hunt";
  if (state.task && NOISY_WORK.has(state.task.id)) movement.noiseFactor = 3;
  if (state.task?.id === "sleep" || state.task?.id === "rest") {
    movement.noiseFactor = 0.1;
    movement.visibilityFactor = 0.3;
  }
  movement.footingFactor = playerTerrain === "bog" ? 1.3 : playerTerrain === "rock" ? 1.15 : 1;
  for (const subject of state.wildlife.subjects) {
    const active = subject.active;
    const profile = DISTURBANCE_PROFILES[subject.species];
    if (!active || subject.region !== state.player.region || profile.alarmGain === 0) continue;
    const area = metricAreaForCell(world, active.cell);
    if (!area) continue;
    // Broad-phase bounds come from the metric adapter, never a fixed cell radius.
    const range = Math.max(profile.visualRangeM, profile.auditoryRangeM);
    if (active.alarm === 0 && active.escapeStartedMinute === null && area.kind === "area") {
      const dx = Math.max(area.min.xM - actor.xM, 0, actor.xM - area.max.xM);
      const dy = Math.max(area.min.yM - actor.yM, 0, actor.yM - area.max.yM);
      if (Math.hypot(dx, dy) > range) continue;
    }
    const point = metricPointForWildlife(state, world, subject);
    if (!point) continue;
    const geometry = encounterGeometry(actor, point, 0);
    if (!geometry) continue;
    const terrain = cellAt(world, active.cell).terrain;
    const eventId = `wildlife:${state.seed}:${state.year}:${subject.id}:${state.minute}:${active.escapeEpisode + 1}`;
    // Hold the random threshold for one simulation minute while movement and
    // activity change its odds.
    const evaluationId = `wildlife:${state.seed}:${state.year}:${subject.id}:${Math.floor(state.minute)}:${active.escapeEpisode + 1}`;
    const result = evaluateUngulateEncounter({
      seed: state.seed, eventId: evaluationId, species: subject.species, geometry, movement, terrain,
      lux: illuminance(state, world, cal, active.cell), precip: state.weather.precip,
      cover: Math.max(COVER[playerTerrain], COVER[terrain]), huntingFactor: oddsFactor(state, subject.species),
      alarm: active.alarm, minutesSinceDetection: active.lastDetectionMinute === null ? 0 : state.minute - active.lastDetectionMinute,
      escaping: active.escapeStartedMinute !== null,
      recognized: Boolean(state.wildlife.recognized[subject.id]), speciesKnown: skillLevel(state, "hunting") >= 4,
      competingNoise: state.task && NOISY_WORK.has(state.task.id) ? 0.5 : 0,
      ...rolls,
    });
    active.alarm = result.alarm;
    if (result.detected) active.lastDetectionMinute = state.minute;
    if (result.settled) {
      active.escapeRemainingM = 0;
      active.escapeStartedMinute = null;
      if (active.intent === "flee" || active.intent === "rest") active.intent = "wander";
    } else if (result.alert && !result.fleeing) {
      active.intent = "rest";
      active.target = null;
      active.route = [];
    }
    if (!result.startsEscape) continue;
    // The map already discloses these subjects and their species. A failed
    // independent perception roll cannot hide a departure already in sight.
    // Read current visibility before movement, not the spatial-tick sighting cache.
    if (visibleWildlife(state, world, cal).includes(subject)) {
      result.perception = { kind: "seen", identification: state.wildlife.recognized[subject.id] ? "subject" : "species" };
    }
    active.escapeEpisode++;
    active.escapeStartedMinute = state.minute;
    active.escapeRemainingM = escapeDistanceM(state.seed, eventId, profile);
    active.intent = "flee";
    active.target = null;
    active.route = [];
    const group = wildlifeMembers(subject) > 1 ? "group" : "single";
    const logText = startleLogText({
      perception: result.perception, species: subject.species, subjectName: subject.name ?? undefined,
      group, terrain, bearingRad: geometry.bearingRad, distanceM: geometry.distanceM,
    });
    if (result.perception.kind !== "none" && logText !== null) {
      const event: WildlifeStartleEvent = {
        id: eventId, subjectId: subject.id, source: geometry.subject,
        bearingRad: geometry.bearingRad, distanceM: geometry.distanceM,
        uncertaintyM: result.perception.kind === "heard" ? result.perception.uncertaintyM : geometry.uncertaintyM,
        perception: result.perception, terrain, body: subject.species === "elk" ? "heavy" : "light", group, logText,
      };
      log(state, event.logText);
      if (live) emitWildlifeEvent(event);
    }
    beginEscapeSegment(state, world, subject);
  }
}

function stealCampFood(state: GameState, subject: WildlifeSubject): boolean {
  const active = subject.active;
  if (!active || (subject.species !== "bear" && subject.species !== "wolverine") || active.hunger < 60) return false;
  const st = state.regions[subject.region];
  const camp = campStore(state, subject.region);
  if (!st || !camp || active.cell !== camp.cell || (subject.species === "wolverine" && st.fire.lit)) return false;
  if (st.rack.kg > 0) {
    const taken = Math.min(1, st.rack.kg);
    st.rack.kg -= taken;
    if (st.rack.kg <= 0) st.rack.dried = 0;
    active.hunger = Math.max(0, active.hunger - 50);
    subject.condition = Math.min(100, subject.condition + 4);
    log(state, `A ${SPECIES_DEFS[subject.species].name} takes ${taken.toFixed(1)} kg of meat from the drying rack.`, "bad");
    return true;
  }
  if (camp.protected) return false;
  const store = pile(state, camp.cell);
  for (const item of ["rawMeat", "cookedMeat", "driedMeat", "rawFat", "fat"] as const) {
    const taken = removeItem(store, item, Math.min(1, qty(store, item)));
    if (taken <= 0) continue;
    active.hunger = Math.max(0, active.hunger - 50);
    subject.condition = Math.min(100, subject.condition + 4);
    log(state, `A ${SPECIES_DEFS[subject.species].name} takes ${taken.toFixed(1)} kg of meat from camp.`, "bad");
    return true;
  }
  return false;
}

function removeMember(subject: WildlifeSubject): boolean {
  const cohort = [...subject.cohorts].sort((a, b) => b.bornYear - a.bornYear)[0];
  if (!cohort) return false;
  cohort.count--;
  subject.cohorts = subject.cohorts.filter((c) => c.count > 0);
  return true;
}

function removeSubject(state: GameState, subject: WildlifeSubject): void {
  const index = state.wildlife.subjects.indexOf(subject);
  if (index >= 0) state.wildlife.subjects.splice(index, 1);
  state.wildlife.recognitionQueue = state.wildlife.recognitionQueue.filter((id) => id !== subject.id);
  state.wildlife.visible = state.wildlife.visible.filter((id) => id !== subject.id);
  delete state.wildlife.familiarity[subject.id];
  delete state.wildlife.recognized[subject.id];
}

function splitOversizedGroup(state: GameState, subject: WildlifeSubject): void {
  const max = SPECIES_DEFS[subject.species].agent?.group[1] ?? 1;
  const excess = wildlifeMembers(subject) - max;
  if (subject.form === "individual" || excess <= 0) return;
  if (state.wildlife.subjects.filter((other) => other.region === subject.region).length >= MAX_ACTIVE_SUBJECTS) return;
  const split = makeSubject(state, subject.species, subject.region, 0);
  split.condition = subject.condition;
  split.cohorts = [];
  let remaining = excess;
  for (const cohort of [...subject.cohorts].reverse()) {
    if (remaining <= 0) break;
    const moved = Math.min(remaining, cohort.count);
    cohort.count -= moved;
    split.cohorts.unshift({ ...cohort, count: moved });
    remaining -= moved;
  }
  subject.cohorts = subject.cohorts.filter((cohort) => cohort.count > 0);
  state.wildlife.subjects.push(split);
}

function activeNow(subject: WildlifeSubject, cal: Calendar): boolean {
  const rhythm = SPECIES_DEFS[subject.species].agent?.active;
  if (rhythm === "night") return cal.isNight;
  if (rhythm === "day") return !cal.isNight;
  return Math.abs(cal.hour - cal.sunrise) <= 2 || Math.abs(cal.hour - cal.sunset) <= 2;
}

function moveOne(state: GameState, world: World, cal: Calendar, subject: WildlifeSubject, rng: Rng): void {
  const active = subject.active;
  if (!active) return;
  active.hunger = Math.min(100, active.hunger + 2);
  active.thirst = Math.min(100, active.thirst + 3);
  active.rest = Math.min(100, active.rest + 1);
  if (stealCampFood(state, subject)) return;
  if (active.travel) return;
  const st = state.regions[subject.region];
  const playerCell = cellOf(state, world);
  if (subject.form === "herd") {
    if (active.escapeStartedMinute !== null) {
      active.intent = "flee";
      beginEscapeSegment(state, world, subject);
      return;
    }
    if (active.alarm >= DISTURBANCE_PROFILES[subject.species].alertAlarm) {
      active.intent = "rest";
      active.target = null;
      active.route = [];
      return;
    }
  }
  if (active.alarm >= 50) {
    active.intent = "flee";
    active.target = null;
  } else if (active.thirst >= 60) {
    const shore = localShore(world, subject, active.cell);
    if (shore !== undefined) {
      active.intent = "drink";
      active.target = shore;
    }
  }
  if (active.alarm < 50 && active.thirst < 60 && subject.species === "wolf" && active.hunger >= 60) {
    const prey = state.wildlife.subjects
      .filter((s) => s.region === subject.region && s.active && (s.form === "herd") && wildlifeMembers(s) > 0)
      .sort((a, b) => metresBetween(a.active!.cell, active.cell) - metresBetween(b.active!.cell, active.cell))[0];
    if (prey?.active) {
      active.intent = "hunt";
      active.target = prey.active.cell;
    } else if (cal.isNight && !sheltered(state, world)) {
      active.intent = "hunt";
      active.target = cellOf(state, world);
    }
  }
  if (active.alarm < 50 && active.thirst < 60 && (subject.species === "bear" || subject.species === "wolverine") && active.hunger >= 60 && st) {
    const camp = campStore(state, subject.region);
    const store = camp ? pile(state, camp.cell) : undefined;
    const pileExposed = Boolean(camp && !camp.protected && ["rawMeat", "cookedMeat", "driedMeat", "rawFat", "fat"].some((item) => store && qty(store, item as Parameters<typeof qty>[1]) > 0));
    const exposed = st.rack.kg > 0 || pileExposed;
    if (camp && exposed && (subject.species === "bear" || !st.fire.lit)) {
      active.intent = "camp";
      active.target = camp.cell;
    }
  }
  if (active.alarm < 50 && active.thirst < 60 && subject.form === "herd" && active.hunger >= 60) {
    const forage = localForage(world, subject, active.cell);
    if (forage === active.cell) {
      active.hunger = Math.max(0, active.hunger - 40);
      subject.condition = Math.min(100, subject.condition + 4);
      active.intent = "forage";
      active.target = null;
      return;
    }
    if (forage !== undefined) {
      active.intent = "forage";
      active.target = forage;
    }
  }
  if (active.target === null && (active.rest >= 60 || !activeNow(subject, cal)) && active.hunger < 60 && active.thirst < 60) {
    active.intent = "rest";
    active.target = null;
    active.rest = Math.max(0, active.rest - 5);
    return;
  }
  let candidates = stepPatches(world, subject, active.cell);
  if (subject.species === "wolf") {
    const lit = [] as number[];
    if (st?.fire.lit && st.campCell !== null) lit.push(st.campCell);
    if (state.player.region === subject.region && state.player.torch.lit) lit.push(cellOf(state, world));
    if (lit.length) {
      const lightDistance = (cell: number) => Math.min(...lit.map((center) => metresBetween(cell, center)));
      const here = lightDistance(active.cell);
      // Beyond the standoff where that is one stride away; otherwise a wolf
      // already inside it gives ground, and one outside never closes.
      const safe = candidates.filter((cell) => lightDistance(cell) > LIGHT_STANDOFF_M && (here > LIGHT_STANDOFF_M || lightDistance(cell) > here));
      const giving = candidates.filter((cell) => lightDistance(cell) > here);
      candidates = safe.length ? safe
        : here <= LIGHT_STANDOFF_M ? giving
          : candidates.filter((cell) => lightDistance(cell) >= here);
      if (active.target !== null && lightDistance(active.target) <= LIGHT_STANDOFF_M) {
        active.target = null;
        active.route = [];
        active.intent = "flee";
      }
    }
  }
  let routedStep: number | undefined;
  if (active.target !== null && active.cell !== active.target) {
    followRoute(world, subject, candidates);
    if (active.route.length && candidates.includes(active.route[0])) routedStep = active.route.shift();
    const target = active.target;
    if (target !== null) candidates.sort((a, b) => metresBetween(a, target) - metresBetween(b, target));
  } else {
    active.route = [];
    if (active.intent === "flee") candidates.sort((a, b) => metresBetween(b, playerCell) - metresBetween(a, playerCell));
  }
  if (subject.species === "wolf" && active.target === cellOf(state, world) && cal.isNight) {
    const distance = metresBetween(active.cell, active.target);
    if (distance > 0 && distance <= WOLF_WARNING_M && active.alarm === 0) {
      active.alarm = 1;
      log(state, "Wolves pace just beyond the dark. They are coming closer.", "bad");
      if (routedStep !== undefined) beginSegment(state, world, subject, routedStep);
      else if (candidates.length) beginSegment(state, world, subject, candidates[0]);
      return;
    }
  }
  if (routedStep !== undefined) beginSegment(state, world, subject, routedStep);
  else if (candidates.length) beginSegment(state, world, subject, candidates[active.target !== null || active.intent === "flee" ? 0 : rng.int(candidates.length)]);
  if (active.intent === "drink" && active.cell === active.target) {
    active.thirst = 0;
    active.target = null;
  }
  if (subject.species === "wolf") {
    const prey = state.wildlife.subjects.find((s) => s !== subject && s.form === "herd" && s.region === subject.region && s.active?.cell === active.cell && wildlifeMembers(s) > 0);
    if (prey && removeMember(prey)) {
      const preyState = regionState(state, world, prey.region);
      preyState.pop[prey.species] = Math.max(0, popOf(preyState, prey.species) - 1);
      notePopulationChange(state, world, prey.region, prey.species, "predation", 1);
      subject.condition = Math.min(100, subject.condition + 4);
      active.hunger = Math.max(0, active.hunger - 60);
      if (prey.active) {
        prey.active.intent = "flee";
        prey.active.alarm = 100;
        // A wolf's pursuit already caused this flight. Do not reinterpret it
        // as a newly perceived reaction to the survivor on the next evaluation.
        prey.active.escapeStartedMinute ??= state.minute;
        prey.active.lastDetectionMinute = state.minute;
        prey.active.escapeRemainingM = Math.max(prey.active.escapeRemainingM,
          escapeDistanceM(state.seed, `predation:${prey.id}:${state.minute}`, DISTURBANCE_PROFILES[prey.species]));
      }
      if (wildlifeMembers(prey) === 0) removeSubject(state, prey);
    }
    const atFire = Boolean(st?.fire.lit && st.campCell !== null && metresBetween(active.cell, st.campCell) <= LIGHT_STANDOFF_M);
    const atTorch = state.player.region === subject.region && state.player.torch.lit && metresBetween(active.cell, cellOf(state, world)) <= LIGHT_STANDOFF_M;
    if (active.cell === cellOf(state, world) && cal.isNight && !sheltered(state, world) && !atFire && !atTorch) {
      cue("wolves");
      if (hasQuirk(state, "sleepsLight")) {
        log(state, "{You} {wake} at the wolves and {sit} up until they go.", "bad");
      } else {
        state.player.health = Math.max(0, state.player.health - 25);
        state.player.injured = Math.max(state.player.injured, 24 * 60);
        log(state, "Wolves out of the dark. {You} {fight} them off, bleeding.", "bad");
        if (state.player.health <= 0) die(state, "wolves", regionAt(world, state.player.region).name);
      }
      active.alarm = 100;
      active.intent = "flee";
      active.target = null;
    }
  }
}

export function stepWildlife(state: GameState, world: World, cal: Calendar, rng: Rng, _dt: number, mode: WildlifeMode, live = false): void {
  if (mode !== "detailed") {
    if (state.wildlife.activeRegion !== null) {
      for (const subject of state.wildlife.subjects) subject.active = null;
      state.wildlife.activeRegion = null;
      state.wildlife.visible = [];
    }
    return;
  }
  activateWildlife(state, world, rng);
  advanceWildlifeMotion(state, world, rng, _dt);
  evaluateWildlifeDisturbance(state, world, cal, live);
  const tick = Math.floor(state.minute / WILDLIFE_TICK_MINUTES);
  if (tick <= state.wildlife.lastSpatialTick) return;
  state.wildlife.lastSpatialTick = tick;
  for (const subject of [...state.wildlife.subjects]) if (subject.region === state.player.region) moveOne(state, world, cal, subject, rng);
  evaluateWildlifeDisturbance(state, world, cal, live);
  const visible = visibleWildlife(state, world, cal).map((s) => s.id);
  const previous = new Set(state.wildlife.visible);
  noteWildlifeSightings(state, visible.filter((id) => !previous.has(id)), cal.day);
  state.wildlife.visible = visible;
}

function unusedName(state: GameState, subject: WildlifeSubject): string {
  const names = subject.nameKind === "proper" ? PROPER_NAMES : FIELD_NAMES.map((n) => `${n} ${subject.form === "pack" ? "Pack" : "Herd"}`);
  const used = new Set(state.wildlife.subjects.map((s) => s.name).filter((n): n is string => n !== null));
  const start = derive(state.seed, 8000 + subject.id) % names.length;
  for (let i = 0; i < names.length; i++) {
    const name = names[(start + i) % names.length];
    if (!used.has(name)) return name;
  }
  return `${names[start]} ${subject.id}`;
}

/** Credits a subject once per day; sameness stays hidden until the threshold. */
export function noteWildlifeSightings(state: GameState, visible: number[], day: number): void {
  const gain = 1 + Math.floor((skillLevel(state, "hunting") - 1) / 5);
  for (const id of visible) {
    const subject = state.wildlife.subjects.find((s) => s.id === id);
    if (!subject) continue;
    if (subject.active) noteHuntSign(state, subject.active.cell, subject.species);
    if (state.wildlife.recognized[id]) continue;
    const f = state.wildlife.familiarity[id] ?? { points: state.wildlife.inherited[id] ?? 0, lastDay: -1 };
    if (f.lastDay === day) continue;
    f.lastDay = day;
    f.points += gain;
    state.wildlife.familiarity[id] = f;
    if (f.points < 6) continue;
    subject.name ??= unusedName(state, subject);
    subject.lastKnownDay = day;
    state.wildlife.recognized[id] = true;
    state.wildlife.recognitionQueue.push(id);
    record(state, { kind: "animalRecognized", subject: id, name: subject.name });
  }
}

/** Clears personal familiarity while preserving the names and lives of animals in the world. */
export function resetWildlifeKnowledge(state: GameState): void {
  const inherited: Record<number, 3> = {};
  for (const survivor of state.survivors) {
    for (const event of survivor.events) if (event.kind === "animalRecognized") inherited[event.subject] = 3;
  }
  state.wildlife.familiarity = {};
  state.wildlife.inherited = inherited;
  state.wildlife.recognized = {};
  state.wildlife.visible = [];
  state.wildlife.recognitionQueue = [];
  state.wildlife.lastSpatialTick = -1;
}

/** Removes one member from a concrete wildlife subject without touching aggregate abundance. */
export function takeWildlifeMember(state: GameState, species: AgentSpecies, subjectId?: number, region = state.player.region): WildlifeSubject | null {
  const candidates = state.wildlife.subjects.filter((s) => s.region === region && s.species === species && wildlifeMembers(s) > 0);
  const subject = subjectId === undefined
    ? candidates.find((s) => s.active) ?? candidates[0]
    : candidates.find((s) => s.id === subjectId);
  if (!subject) return null;
  if (!removeMember(subject)) return null;
  if (wildlifeMembers(subject) === 0) removeSubject(state, subject);
  return subject;
}

function isAgentSpecies(species: Species): species is AgentSpecies {
  return AGENT_SPECIES.includes(species as AgentSpecies);
}

/**
 * Atomically claims one whole animal from aggregate abundance. Agent species
 * must also resolve to a concrete subject: an explicit target is authoritative,
 * while a generic successful search may materialize an unrepresented member at
 * the encounter cell before removing it.
 */
export function claimHuntableAnimal(state: GameState, world: World, species: Species, cell: number, subjectId?: number): boolean {
  const region = cellAt(world, cell).region;
  const st = regionState(state, world, region);
  const population = popOf(st, species);
  if (Math.floor(population + 1e-9) < 1) return false;
  if (!isAgentSpecies(species)) {
    st.pop[species] = population - 1;
    return true;
  }

  let subject = subjectId === undefined
    ? state.wildlife.subjects.find((candidate) => candidate.region === region && candidate.species === species && candidate.active?.cell === cell && wildlifeMembers(candidate) > 0)
    : state.wildlife.subjects.find((candidate) => candidate.id === subjectId && candidate.region === region && candidate.species === species
      && (candidate.active?.cell === cell || candidate.denCell === cell) && wildlifeMembers(candidate) > 0);
  if (!subject && subjectId === undefined) {
    const represented = state.wildlife.subjects
      .filter((candidate) => candidate.region === region && candidate.species === species)
      .reduce((sum, candidate) => sum + wildlifeMembers(candidate), 0);
    if (Math.floor(population + 1e-9) <= represented) return false;
    subject = makeSubject(state, species, region, 1);
    const position = subjectPoint(state, world, subject, cell);
    if (!position) return false;
    subject.active = {
      cell, position, travel: null, hunger: 20, thirst: 20, rest: 20, alarm: 0, intent: "wander", target: null, route: [],
      escapeRemainingM: 0, escapeStartedMinute: null, lastDetectionMinute: null, escapeEpisode: 0,
    };
    state.wildlife.subjects.push(subject);
  }
  if (!subject) return false;

  const removed = takeWildlifeMember(state, species, subject.id, region);
  if (!removed) return false;
  st.pop[species] = population - 1;
  return true;
}

export function knownBearDen(state: GameState, cal: Calendar): WildlifeSubject | null {
  return state.wildlife.subjects.find((subject) => subject.species === "bear" && subject.region === state.player.region && subject.denCell !== null && state.wildlife.knownDens[subject.denCell] && denning(subject, cal) && wildlifeMembers(subject) > 0) ?? null;
}

export function unknownBearDen(state: GameState, cal: Calendar): WildlifeSubject | null {
  const trackingSeason = cal.month >= 9 || cal.month <= 1;
  if (!trackingSeason) return null;
  return state.wildlife.subjects.find((subject) => subject.species === "bear" && subject.region === state.player.region && subject.denCell !== null && !state.wildlife.knownDens[subject.denCell] && wildlifeMembers(subject) > 0) ?? null;
}

export function visibleWildlife(state: GameState, world: World, cal: Calendar): WildlifeSubject[] {
  if (state.wildlife.activeRegion !== state.player.region) return [];
  const visible = visibleCells(state, world, cal, cellOf(state, world));
  return state.wildlife.subjects.filter((s) => s.region === state.player.region && s.active !== null && visible.has(s.active.cell));
}

/** One cheap life-history pass for persistent subjects, whether spatial or dormant. */
export function dailyWildlife(state: GameState, world: World, cal: Calendar, rng: Rng, mode: WildlifeMode = "detailed"): void {
  const year = state.year + Math.floor((state.startDoy + cal.dayIndex) / 365);
  for (const region of Object.keys(state.regions).map(Number)) reconcileRegion(state, world, region, cal);
  if (mode === "aggregate") {
    for (const [key, st] of Object.entries(state.regions)) {
      const region = Number(key);
      const camp = campStore(state, region);
      for (const species of ["bear", "wolverine"] as const) {
        const rackExposed = st.rack.kg > 0;
        const store = camp ? state.piles[camp.cell] : undefined;
        const item = camp && !camp.protected
          ? (["rawMeat", "cookedMeat", "driedMeat", "rawFat", "fat"] as const).find((id) => store && qty(store, id) > 0)
          : undefined;
        const pileExposed = item !== undefined;
        if (!rackExposed && !pileExposed) continue;
        const fireFactor = st.fire.lit ? (species === "bear" ? 0.25 : 0) : 1;
        // Aggregate wildlife has its own stable daily roll. It must not move
        // the survivor simulation's seeded RNG merely because food is exposed.
        const speciesSalt = species === "bear" ? 1 : 2;
        const roll = derive(state.seed, 810_000 + cal.dayIndex * 65_537 + region * 3 + speciesSalt) / 0x1_0000_0000;
        if (roll >= 0.01 * fireFactor * regionDensity(state, world, region, species, cal)) continue;
        if (rackExposed) {
          st.rack.kg = Math.max(0, st.rack.kg - 1);
          if (st.rack.kg === 0) st.rack.dried = 0;
          log(state, `A ${SPECIES_DEFS[species].name} takes meat from the drying rack.`, "bad");
          break;
        }
        if (!item || !store) continue;
        removeItem(store, item, Math.min(1, qty(store, item)));
        log(state, `A ${SPECIES_DEFS[species].name} takes food from camp.`, "bad");
        break;
      }
    }
  }
  for (const subject of [...state.wildlife.subjects]) {
    const profile = SPECIES_DEFS[subject.species].agent;
    if (!profile) continue;
    const st = regionState(state, world, subject.region);
    if (subject.reproductive === "pregnant" && inMonths(cal.month, profile.birthMonths)) {
      const born = profile.litter[0] + rng.int(profile.litter[1] - profile.litter[0] + 1);
      subject.cohorts.push({ sex: rng.chance(0.5) ? "f" : "m", bornYear: year, count: born });
      st.pop[subject.species] = popOf(st, subject.species) + born;
      notePopulationChange(state, world, subject.region, subject.species, "birth", born);
      subject.reproductive = "dependent";
      subject.dependentUntilYear = year + profile.independentYears;
    } else if (subject.reproductive === "dependent" && year >= subject.dependentUntilYear) {
      subject.reproductive = "none";
    }
    const matureFemale = subject.cohorts.some((c) => c.sex === "f" && c.count > 0 && year - c.bornYear >= profile.maturityYears);
    if (subject.reproductive === "none" && subject.condition >= 50 && matureFemale && inMonths(cal.month, profile.matingMonths)) subject.reproductive = "pregnant";
    const hungry = subject.active ? subject.active.hunger >= 90 : false;
    const denLoss = denning(subject, cal) && cal.day % 7 === 0 ? 1 : 0;
    const winterLoss = cal.season === "winter" && subject.form === "herd" ? 1 : 0;
    subject.condition = Math.max(0, Math.min(100, subject.condition + (hungry ? -3 : 0) - denLoss - winterLoss));
    let deaths = subject.condition === 0 ? 1 : 0;
    for (const cohort of subject.cohorts) {
      const age = year - cohort.bornYear;
      if (age < profile.oldAgeYears) continue;
      const chance = Math.min(0.02, 0.001 * (age - profile.oldAgeYears + 1));
      for (let i = 0; i < cohort.count; i++) if (rng.chance(chance)) deaths++;
    }
    while (deaths > 0 && removeMember(subject)) {
      st.pop[subject.species] = Math.max(0, popOf(st, subject.species) - 1);
      notePopulationChange(state, world, subject.region, subject.species, "naturalDeath", 1);
      deaths--;
    }
    if (wildlifeMembers(subject) === 0) removeSubject(state, subject);
    else splitOversizedGroup(state, subject);
  }
}
