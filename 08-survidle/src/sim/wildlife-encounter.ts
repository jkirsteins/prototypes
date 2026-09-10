import { Rng, derive } from "../rng";
import { DISTURBANCE_PROFILES, SPECIES_DEFS, type DisturbanceProfile } from "./species";
import type { AgentSpecies, Terrain, Weather } from "./types";
import type { EncounterGeometry, MetricPoint } from "./wildlife-space";

export { DISTURBANCE_PROFILES, type DisturbanceProfile } from "./species";

export interface MovementProfile {
  speedKmh: number;
  loadKg: number;
  noiseFactor: number;
  visibilityFactor: number;
  footingFactor: number;
  deliberateApproach: boolean;
}

/** Proficiency is neutral until a later movement system supplies different factors. */
export function neutralMovementProfile(speedKmh = 4, loadKg = 0): MovementProfile {
  return { speedKmh, loadKg, noiseFactor: 1, visibilityFactor: 1, footingFactor: 1, deliberateApproach: false };
}

export type StartlePerception =
  | { kind: "seen"; identification: "subject" | "species" | "ungulate" | "unknown" }
  | { kind: "heard"; identification: "species" | "ungulate" | "unknown"; uncertaintyM: number }
  | { kind: "none" };

export interface WildlifeStartleEvent {
  id: string;
  subjectId: number;
  source: MetricPoint;
  bearingRad: number;
  distanceM: number;
  uncertaintyM: number;
  perception: Exclude<StartlePerception, { kind: "none" }>;
  terrain: Terrain;
  body: "light" | "heavy";
  group: "single" | "group";
  logText: string;
}

export interface UngulateEncounterInput {
  seed: number;
  /** Stable evaluation key; callers include subject, episode and evaluation time. */
  eventId: string;
  species: AgentSpecies;
  geometry: EncounterGeometry;
  movement: MovementProfile;
  terrain: Terrain;
  lux: number;
  precip: Weather["precip"];
  /** Fraction obscured, 0..1. */
  cover: number;
  /** 1 is neutral; greater factors improve deliberate approach and classification. */
  huntingFactor: number;
  alarm: number;
  minutesSinceDetection: number;
  escaping: boolean;
  recognized?: boolean;
  speciesKnown?: boolean;
  /** Fraction of hearing masked by competing sound, 0..1. */
  competingNoise?: number;
  departureLoudness?: number;
  /** Animal sight roll, independent of animal hearing and survivor perception. */
  detectionRoll?: number;
  auditoryDetectionRoll?: number;
  sightRoll?: number;
  hearingRoll?: number;
}

export interface UngulateEncounterResult {
  detected: boolean;
  alarm: number;
  alert: boolean;
  fleeing: boolean;
  startsEscape: boolean;
  settled: boolean;
  perception: StartlePerception;
  visualDetectionProbability: number;
  auditoryDetectionProbability: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const rangeChance = (distance: number, range: number) => range > 0 ? clamp(1 - distance / range) : 0;

function seededRoll(seed: number, key: string, channel: number): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return new Rng(derive(derive(seed, hash >>> 0), channel)).next();
}

export function escapeDistanceM(seed: number, eventId: string, profile: DisturbanceProfile): number {
  return profile.escapeMinM + seededRoll(seed, eventId, 5) * (profile.escapeMaxM - profile.escapeMinM);
}

/** Pure encounter decision; neither observation nor alarm writes map knowledge. */
export function evaluateUngulateEncounter(input: UngulateEncounterInput): UngulateEncounterResult {
  const profile = DISTURBANCE_PROFILES[input.species];
  const result: UngulateEncounterResult = {
    detected: false, alarm: input.alarm, alert: false, fleeing: input.escaping,
    startsEscape: false, settled: false, perception: { kind: "none" },
    visualDetectionProbability: 0, auditoryDetectionProbability: 0,
  };
  const g = input.geometry;
  if (![g.actor.xM, g.actor.yM, g.subject.xM, g.subject.yM, g.distanceM, g.bearingRad, g.uncertaintyM].every(Number.isFinite)
    || g.distanceM < 0 || g.uncertaintyM < 0) {
    // biome-ignore lint/suspicious/noConsole: the spatial boundary requires a development assertion.
    if (!import.meta.env.PROD) console.assert(false, "wildlife encounter geometry must be finite and nonnegative");
    return result;
  }
  if (profile.alarmGain === 0) return result;

  const cover = clamp(input.cover);
  const light = clamp(input.lux / 100);
  const rainSight = input.precip === "heavy" ? 0.25 : input.precip === "light" ? 0.8 : 1;
  const rainSound = input.precip === "heavy" ? 0.2 : input.precip === "light" ? 0.75 : 1;
  const forest = input.terrain === "spruce" || input.terrain === "pine" || input.terrain === "birch";
  const terrainSound = forest ? 0.8 : input.terrain === "bog" ? 0.9 : 1;
  const hunting = Math.max(1, input.huntingFactor);
  const approach = input.movement.deliberateApproach ? 1 / hunting : 1;
  const speed = 0.5 + Math.max(0, input.movement.speedKmh) / 8;
  const soundSignature = Math.max(0, input.movement.noiseFactor) * Math.max(0, input.movement.footingFactor)
    * speed * (1 + Math.max(0, input.movement.loadKg) / 60) * approach;
  const sightSignature = Math.max(0, input.movement.visibilityFactor) * speed * approach;
  const sightContext = (1 - cover) * light * rainSight;
  const soundContext = (1 - cover * 0.25) * terrainSound * rainSound;
  result.visualDetectionProbability = clamp(rangeChance(g.distanceM, profile.visualRangeM) * sightContext * sightSignature);
  result.auditoryDetectionProbability = clamp(rangeChance(g.distanceM, profile.auditoryRangeM) * soundContext * soundSignature);
  const sees = (input.detectionRoll ?? seededRoll(input.seed, input.eventId, 1)) < result.visualDetectionProbability;
  const hears = (input.auditoryDetectionRoll ?? seededRoll(input.seed, input.eventId, 2)) < result.auditoryDetectionProbability;
  result.detected = sees || hears;
  result.settled = !result.detected && input.minutesSinceDetection >= profile.settleMinutes && g.distanceM >= profile.settleDistanceM;
  result.alarm = result.detected ? Math.min(100, input.alarm + profile.alarmGain) : result.settled ? 0 : input.alarm;
  result.alert = result.alarm >= profile.alertAlarm;
  result.fleeing = !result.settled && (input.escaping || result.alarm >= profile.flightAlarm);
  result.startsEscape = result.fleeing && !input.escaping;
  if (!result.startsEscape) return result;

  const sightChance = clamp(rangeChance(g.distanceM, profile.visualRangeM) * sightContext);
  const hearingChance = clamp(rangeChance(g.distanceM, profile.auditoryRangeM * 1.5) * soundContext
    * Math.max(0, input.departureLoudness ?? 1) * (1 - clamp(input.competingNoise ?? 0)));
  if ((input.sightRoll ?? seededRoll(input.seed, input.eventId, 3)) < sightChance) {
    const detail = sightChance >= 0.35;
    result.perception = { kind: "seen", identification: detail && input.recognized ? "subject"
      : detail && input.speciesKnown ? "species" : sightChance >= 0.15 ? "ungulate" : "unknown" };
  } else if ((input.hearingRoll ?? seededRoll(input.seed, input.eventId, 4)) < hearingChance) {
    result.perception = {
      kind: "heard",
      identification: hearingChance >= 0.5 && hunting >= 1.5 && input.speciesKnown ? "species"
        : hearingChance >= 0.45 ? "ungulate" : "unknown",
      uncertaintyM: Math.max(20, g.uncertaintyM, g.distanceM * (0.2 + cover * 0.4 + (1 - rainSound) * 0.3 + (input.competingNoise ?? 0) * 0.3)),
    };
  }
  return result;
}

export interface StartleLogInput {
  perception: StartlePerception;
  species: AgentSpecies;
  subjectName?: string;
  group: WildlifeStartleEvent["group"];
  terrain: Terrain;
  bearingRad: number;
  distanceM: number;
}

function groundPhrase(terrain: Terrain, seen: boolean): string {
  if (terrain === "birch") return seen ? "into the birches" : "through the birches";
  if (terrain === "spruce" || terrain === "pine") return `through the ${terrain}`;
  if (terrain === "bog") return "through the bog";
  if (terrain === "rock") return "over the rocks";
  if (terrain === "fell") return "across the fell";
  if (terrain === "water") return "along the shore";
  return "through the grass";
}

export function startleLogText(input: StartleLogInput): string | null {
  const p = input.perception;
  if (p.kind === "none") return null;
  const ground = groundPhrase(input.terrain, p.kind === "seen");
  const species = SPECIES_DEFS[input.species].name;
  if (p.kind === "seen") {
    const subject = p.identification === "subject" && input.subjectName ? `The ${input.subjectName}`
      : p.identification === "species" ? `${/^[aeiou]/i.test(species) ? "An" : "A"} ${species}${input.group === "group" ? " herd" : ""}`
      : p.identification === "ungulate" ? input.group === "group" ? "A herd of hoofed animals" : "A hoofed animal" : "Something";
    return `${subject} startles and bounds ${ground}.`;
  }
  const subject = p.identification === "unknown" ? "Something crashes" : p.identification === "species" ? `${species[0].toUpperCase()}${species.slice(1)} hooves crash` : "Hooves crash";
  const directions = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];
  const sector = ((Math.round(input.bearingRad / (Math.PI / 4)) % 8) + 8) % 8;
  const direction = input.distanceM > 0 && p.uncertaintyM <= input.distanceM * 0.5 ? ` to the ${directions[sector]}` : "";
  return `${subject} away ${ground}${direction}.`;
}
