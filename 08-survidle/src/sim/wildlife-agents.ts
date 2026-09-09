import { derive, type Rng } from "../rng";
import { cellAt, regionAt, type World } from "../world/gen";
import { findRoute, passable } from "../world/route";
import { calendar, type Calendar } from "./calendar";
import { popOf } from "./animals";
import { regionDensity } from "./animals";
import { regionState, siteAt } from "./regionstate";
import { oddsFactor, skillLevel } from "./skills";
import type { AgentSpecies, GameState, WildlifeMode, WildlifeState, WildlifeSubject } from "./types";
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

function suitableCells(world: World, region: number, species: AgentSpecies): number[] {
  const habitat = species === "reindeer" ? new Set(["fell", "rock", "bog", "pine"])
    : species === "elk" ? new Set(["spruce", "bog", "birch", "pine"])
      : new Set(["spruce", "pine", "birch", "bog", "meadow", "fell", "rock"]);
  const cells = regionAt(world, region).cells.filter((idx) => {
    const c = cellAt(world, idx);
    return passable(c.terrain) && habitat.has(c.terrain);
  });
  return cells.length ? cells : regionAt(world, region).cells.filter((idx) => passable(cellAt(world, idx).terrain));
}

function neighbours4(world: World, cell: number): number[] {
  const x = cell % world.w;
  return [cell - 1, cell + 1, cell - world.w, cell + world.w]
    .filter((idx) => idx >= 0 && idx < world.w * world.h && Math.abs((idx % world.w) - x) <= 1);
}

function cellDistance(world: World, a: number, b: number): number {
  return Math.abs((a % world.w) - (b % world.w)) + Math.abs(Math.floor(a / world.w) - Math.floor(b / world.w));
}

function denning(subject: WildlifeSubject, cal: Calendar): boolean {
  const months = SPECIES_DEFS[subject.species].agent?.denMonths;
  return Boolean(months && inMonths(cal.month, months));
}

function reconcileRegion(state: GameState, world: World, region: number, cal: Calendar): void {
  const st = regionState(state, world, region);
  for (const species of AGENT_SPECIES) {
    // Regional bear abundance used to fall to zero while bears were "away".
    // A persistent bear is instead still here in its den, so that seasonal
    // aggregate convention must never erase its identity at emergence.
    if (species === "bear") continue;
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
  for (const subject of state.wildlife.subjects.filter((s) => s.region === region)) {
    if (subject.species === "bear" && subject.denCell === null) {
      const dens = suitableCells(world, region, "bear");
      if (dens.length) subject.denCell = dens[derive(state.seed, 9000 + subject.id) % dens.length];
    }
    if (denning(subject, cal)) {
      subject.active = null;
      continue;
    }
    if (subject.active) continue;
    const cells = suitableCells(world, region, subject.species);
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

/** Selects a passable escape segment without moving through it. */
function beginEscapeSegment(state: GameState, world: World, subject: WildlifeSubject): boolean {
  const active = subject.active;
  if (!active || active.travel || active.escapeRemainingM <= 0) return false;
  const actor = metricPointForPlayer(state, world);
  const from = metricPointForWildlife(state, world, subject);
  if (!actor || !from) return false;
  const candidates = neighbours4(world, active.cell)
    .filter((cell) => cellAt(world, cell).region === subject.region && passable(cellAt(world, cell).terrain))
    .map((cell) => ({ cell, point: subjectPoint(state, world, subject, cell) }))
    .filter((candidate): candidate is { cell: number; point: MetricPoint } => candidate.point !== null)
    .sort((a, b) => Math.hypot(b.point.xM - actor.xM, b.point.yM - actor.yM) - Math.hypot(a.point.xM - actor.xM, a.point.yM - actor.yM));
  const next = candidates[0];
  return next ? beginSegment(state, world, subject, next.cell) : false;
}

function continueSegment(state: GameState, world: World, subject: WildlifeSubject, rng: Rng): boolean {
  const active = subject.active;
  if (!active || active.travel) return false;
  if (active.intent === "flee") return beginEscapeSegment(state, world, subject);
  if (active.target !== null) {
    if (active.cell === active.target) return false;
    const candidates = neighbours4(world, active.cell)
      .filter((cell) => cellAt(world, cell).region === subject.region && passable(cellAt(world, cell).terrain));
    const routeStillFits = active.route.length > 0 && active.route.at(-1) === active.target && candidates.includes(active.route[0]);
    if (!routeStillFits) active.route = findRoute(world, active.cell, active.target)?.filter((cell) => cellAt(world, cell).region === subject.region) ?? [];
    const next = active.route.shift();
    return next !== undefined && candidates.includes(next) ? beginSegment(state, world, subject, next) : false;
  }
  if (active.intent !== "wander") return false;
  const candidates = neighbours4(world, active.cell)
    .filter((cell) => cellAt(world, cell).region === subject.region && passable(cellAt(world, cell).terrain));
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
    // Live advance receives fractional frame time. Hold the random threshold
    // for one simulation minute while movement and activity change its odds.
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
    const shore = regionAt(world, subject.region).cells
      .filter((cell) => passable(cellAt(world, cell).terrain) && neighbours4(world, cell).some((n) => cellAt(world, n).terrain === "water"))
      .sort((a, b) => cellDistance(world, active.cell, a) - cellDistance(world, active.cell, b))[0];
    if (shore !== undefined) {
      active.intent = "drink";
      active.target = shore;
    }
  }
  if (active.alarm < 50 && active.thirst < 60 && subject.species === "wolf" && active.hunger >= 60) {
    const prey = state.wildlife.subjects
      .filter((s) => s.region === subject.region && s.active && (s.form === "herd") && wildlifeMembers(s) > 0)
      .sort((a, b) => {
        const distance = (s: WildlifeSubject) => Math.abs((s.active!.cell % world.w) - (active.cell % world.w)) + Math.abs(Math.floor(s.active!.cell / world.w) - Math.floor(active.cell / world.w));
        return distance(a) - distance(b);
      })[0];
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
    const forage = suitableCells(world, subject.region, subject.species).sort((a, b) => cellDistance(world, active.cell, a) - cellDistance(world, active.cell, b))[0];
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
  const x = active.cell % world.w;
  let candidates = neighbours4(world, active.cell)
    .filter((idx) => idx >= 0 && idx < world.w * world.h && Math.abs((idx % world.w) - x) <= 1)
    .filter((idx) => cellAt(world, idx).region === subject.region && passable(cellAt(world, idx).terrain));
  if (subject.species === "wolf") {
    const lit = [] as number[];
    if (st?.fire.lit && st.campCell !== null) lit.push(st.campCell);
    if (state.player.region === subject.region && state.player.torch.lit) lit.push(cellOf(state, world));
    if (lit.length) {
      const lightDistance = (cell: number) => Math.min(...lit.map((center) => Math.abs((cell % world.w) - (center % world.w)) + Math.abs(Math.floor(cell / world.w) - Math.floor(center / world.w))));
      const here = lightDistance(active.cell);
      const safe = candidates.filter((cell) => lightDistance(cell) > 2 && (here > 2 || lightDistance(cell) > here));
      candidates = safe.length ? safe : candidates.filter((cell) => lightDistance(cell) >= here && lightDistance(cell) > 2);
      if (active.target !== null && lightDistance(active.target) <= 2) {
        active.target = null;
        active.route = [];
        active.intent = "flee";
      }
    }
  }
  let routedStep: number | undefined;
  if (active.target !== null && active.cell !== active.target) {
    const routeStillFits = active.route.length > 0 && active.route.at(-1) === active.target && candidates.includes(active.route[0]);
    if (!routeStillFits) active.route = findRoute(world, active.cell, active.target)?.filter((cell) => cellAt(world, cell).region === subject.region) ?? [];
    if (active.route.length && candidates.includes(active.route[0])) routedStep = active.route.shift();
    const tx = active.target % world.w;
    const ty = Math.floor(active.target / world.w);
    candidates.sort((a, b) => Math.abs((a % world.w) - tx) + Math.abs(Math.floor(a / world.w) - ty) - (Math.abs((b % world.w) - tx) + Math.abs(Math.floor(b / world.w) - ty)));
  } else {
    active.route = [];
    if (active.intent === "flee") candidates.sort((a, b) => cellDistance(world, b, playerCell) - cellDistance(world, a, playerCell));
  }
  if (subject.species === "wolf" && active.target === cellOf(state, world) && cal.isNight) {
    const distance = Math.abs((active.cell % world.w) - (active.target % world.w)) + Math.abs(Math.floor(active.cell / world.w) - Math.floor(active.target / world.w));
    if (distance === 1 && active.alarm === 0) {
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
    const atFire = Boolean(st?.fire.lit && st.campCell !== null && cellDistance(world, active.cell, st.campCell) <= 2);
    const atTorch = state.player.region === subject.region && state.player.torch.lit && cellDistance(world, active.cell, cellOf(state, world)) <= 2;
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
  for (const subject of state.wildlife.subjects) {
    if (subject.region === state.player.region) advanceWildlifeTravel(state, world, subject, rng, _dt);
  }
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
    if (!subject || state.wildlife.recognized[id]) continue;
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

/** Removes one represented member after another system has already reduced aggregate population. */
export function takeWildlifeMember(state: GameState, species: AgentSpecies, subjectId?: number): WildlifeSubject | null {
  const candidates = state.wildlife.subjects.filter((s) => s.region === state.player.region && s.species === species && wildlifeMembers(s) > 0);
  const subject = candidates.find((s) => s.id === subjectId) ?? candidates.find((s) => s.active) ?? candidates[0];
  if (!subject) return null;
  if (!removeMember(subject)) return null;
  if (wildlifeMembers(subject) === 0) removeSubject(state, subject);
  return subject;
}

export function knownBearDen(state: GameState, cal: Calendar): WildlifeSubject | null {
  if (cal.month < 1 || cal.month > 2) return null;
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
      deaths--;
    }
    if (wildlifeMembers(subject) === 0) removeSubject(state, subject);
    else splitOversizedGroup(state, subject);
  }
}
