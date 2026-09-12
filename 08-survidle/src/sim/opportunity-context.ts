import type { Rng } from "../rng";
import { routeMinutes } from "../world/route";
import type { World } from "../world/gen";
import { baseWalkSpeed } from "./player";
import { isOpportunityComplete, isOpportunityDiscovered, queueOpportunityMessage, refreshOpportunities } from "./opportunities";
import { fearsFell } from "./person";
import { cellOf } from "./position";
import { atCamp, straightKm } from "./position";
import { siteAt } from "./regionstate";
import { galeProtection, protectionOf } from "./shelter";
import { survivorRoute } from "./routing";
import type { Calendar } from "./calendar";
import { calendar } from "./calendar";
import type { GameState, OpportunityKey, WeatherOpportunityContext } from "./types";
import { atmosphereAtMinute, localStorm, scheduledStormMatches, skyReadDay, stormNow, type StormKind, walkableIce, warningMinutes } from "./weather";

const WEATHER_OPPORTUNITIES = new Set<OpportunityKey>(["testShelter", "readWeather", "remoteStorm"]);
const NATURAL_DAWNS = 3;
const RETRY_MINUTES = 24 * 60;
const ORDINARY_WARNING_MINUTES = 60;
const REMOTE_MARGIN_MINUTES = 30;
const MILD_RAIN_MAX_MINUTES = 10 * 60;
const SPATIAL_STORM_SEARCH_MINUTES = 30 * 24 * 60;
const SPATIAL_STORM_SCAN_STEP = 5;
const MIN_TEACHING_STORM_MINUTES = 60;

function discoveredWeatherOpportunity(state: GameState): OpportunityKey | null {
  return [...WEATHER_OPPORTUNITIES].find((key) => isOpportunityDiscovered(state.opportunities, key)
    && !isOpportunityComplete(state.opportunities, key)) ?? null;
}

function newOpportunity(opportunity: OpportunityKey, minute: number, attempts = 1): WeatherOpportunityContext {
  return {
    opportunity,
    status: "reserved",
    createdAt: minute,
    attempts,
    stormId: null,
    source: null,
    area: null,
    announcedAt: null,
    resolvedAt: null,
    minutesByProtection: [0, 0, 0, 0],
    atCampMinutes: 0,
    awayFromCampMinutes: 0,
    maxWetness: 0,
    readerIndex: null,
    plan: null,
  };
}

/** Record lived storm time from the survivor's current place, never a later one. */
export function recordStormMinute(state: GameState, world: World, stormId: number, stormKind: StormKind, minutes: number): void {
  if (minutes <= 0) return;
  const opportunity = state.opportunities.context.weather;
  if (!opportunity || opportunity.stormId !== stormId) return;
  opportunity.maxWetness = Math.max(opportunity.maxWetness, state.player.wetness);
  const homeCamp = opportunity.opportunity === "remoteStorm" && state.opportunities.context.chapter3HomeRegion !== null
    ? atCamp(state, world) && state.player.region === state.opportunities.context.chapter3HomeRegion
    : atCamp(state, world);
  if (homeCamp) opportunity.atCampMinutes += minutes;
  else opportunity.awayFromCampMinutes += minutes;
  const area = opportunity.area;
  const cell = cellOf(state, world);
  if (!area || state.player.region !== area.region) return;
  if (opportunity.opportunity !== "remoteStorm" && straightKm(world, area.centre, cell) > area.radiusKm) return;
  const site = siteAt(state.regions[state.player.region], cell);
  const protection = stormKind === "gale"
    ? galeProtection(state, world, cell, site)
    : protectionOf(site);
  opportunity.minutesByProtection[protection] += minutes;
}

/** Snapshot the matching attempt's accumulated general storm facts for OpportunityEvent. */
export function stormMetrics(state: GameState, stormId: number): { minutesByProtection: [number, number, number, number]; atCampMinutes: number; awayFromCampMinutes: number; maxWetness: number } {
  const opportunity = state.opportunities.context.weather;
  if (!opportunity || opportunity.stormId !== stormId) {
    return { minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
  }
  return {
    minutesByProtection: [...opportunity.minutesByProtection] as [number, number, number, number],
    atCampMinutes: opportunity.atCampMinutes,
    awayFromCampMinutes: opportunity.awayFromCampMinutes,
    maxWetness: opportunity.maxWetness,
  };
}

function dawnOrdinal(minute: number, startDoy: number): number {
  const cal = calendar(minute, startDoy);
  return cal.dayIndex + (cal.hour >= cal.sunrise ? 1 : 0);
}

function readableWarningMinutes(state: GameState): number {
  return warningMinutes(state) + (state.player.skyReadDay === skyReadDay(state) ? 0 : 30);
}

function canMakeTeachingRead(state: GameState): boolean {
  return state.player.skyReadDay !== skyReadDay(state);
}

function remoteLead(state: GameState, world: World, cal: Calendar, opportunity: WeatherOpportunityContext): number | null {
  if (!opportunity.area) return null;
  const from = cellOf(state, world);
  const to = opportunity.area.centre;
  const ice = walkableIce(state.weather);
  const route = survivorRoute(state, world, from, to, ice, fearsFell(state));
  if (!route) return null;
  return routeMinutes(world, route, from, baseWalkSpeed(state, cal, state.weather), ice) + REMOTE_MARGIN_MINUTES;
}

function eligible(state: GameState, world: World, cal: Calendar, opportunity: WeatherOpportunityContext): boolean {
  const storm = state.weather.storm;
  if (storm?.source !== "natural" || storm.from <= state.minute) return false;
  const stormCell = opportunity.area?.centre ?? cellOf(state, world);
  if (!scheduledStormMatches(state, world, stormCell, storm)) return false;
  if (opportunity.opportunity === "testShelter") {
    const duration = storm.until - storm.from;
    const onset = atmosphereAtMinute(state, world, cellOf(state, world), storm.from).temperatureC;
    return storm.kind === "rain" && onset > 0 && duration <= MILD_RAIN_MAX_MINUTES;
  }
  if (opportunity.opportunity === "readWeather") {
    return canMakeTeachingRead(state)
      && storm.from - state.minute > ORDINARY_WARNING_MINUTES
      && readableWarningMinutes(state) > ORDINARY_WARNING_MINUTES;
  }
  if (opportunity.opportunity === "remoteStorm") {
    const lead = remoteLead(state, world, cal, opportunity);
    // Compare absolute times: subtracting a large world minute can round a
    // fractional diagonal-route estimate below its exact arrival threshold.
    return lead !== null && storm.from >= state.minute + lead;
  }
  return false;
}

function announceLead(state: GameState, world: World, cal: Calendar, opportunity: WeatherOpportunityContext): number {
  if (opportunity.opportunity === "readWeather") return readableWarningMinutes(state);
  if (opportunity.opportunity === "remoteStorm") return remoteLead(state, world, cal, opportunity) ?? warningMinutes(state);
  return warningMinutes(state);
}

function claim(state: GameState, world: World, cal: Calendar, opportunity: WeatherOpportunityContext): void {
  const storm = state.weather.storm;
  if (!storm) return;
  const stormCell = opportunity.area?.centre ?? cellOf(state, world);
  if (!scheduledStormMatches(state, world, stormCell, storm)) {
    state.weather.storm = null;
    state.weather.stormFreeSince = state.minute;
    return;
  }
  if (!eligible(state, world, cal, opportunity)) return;
  opportunity.stormId = storm.id;
  opportunity.source = storm.source;
}

/** Reject restored or already claimed metadata before it can announce clear air. */
export function validateScheduledOpportunityStorm(state: GameState, world: World): void {
  const storm = state.weather.storm;
  const opportunity = state.opportunities.context.weather;
  if (!storm) return;
  const stormCell = opportunity?.area?.centre ?? cellOf(state, world);
  if (scheduledStormMatches(state, world, stormCell, storm)) return;
  state.weather.storm = null;
  state.weather.stormFreeSince = state.minute;
  if (!opportunity || opportunity.stormId !== storm.id) return;
  opportunity.status = "reserved";
  opportunity.createdAt = state.minute;
  opportunity.stormId = null;
  opportunity.source = null;
  opportunity.announcedAt = null;
}

function spatialStormKind(state: GameState, world: World, cell: number, minute: number): "rain" | "snow" | null {
  const air = atmosphereAtMinute(state, world, cell, minute);
  return localStorm(air) && air.precip !== "none" ? air.precip : null;
}

/**
 * Find a complete future feature in coordinate-owned air. Coarse probes make
 * the rare teaching search bounded; transitions are then refined minute by
 * minute so the persisted schedule names the field's real timing.
 */
function nextSpatialStorm(
  state: GameState,
  world: World,
  cell: number,
  from: number,
  maxDuration: number | undefined,
  kinds: readonly ("rain" | "snow" | "gale")[],
): { kind: StormKind; from: number; until: number } | null {
  const limit = from + SPATIAL_STORM_SEARCH_MINUTES;
  let previousMinute = from - 1;
  let previousKind = spatialStormKind(state, world, cell, previousMinute);
  for (let probe = from; probe <= limit; probe += SPATIAL_STORM_SCAN_STEP) {
    const probeKind = spatialStormKind(state, world, cell, probe);
    if (previousKind === null && probeKind !== null) {
      let onset = previousMinute + 1;
      while (onset < probe && spatialStormKind(state, world, cell, onset) === null) onset++;
      const kind = spatialStormKind(state, world, cell, onset);
      if (kind === null) continue;
      let endProbe = probe;
      let endKind: "rain" | "snow" | null = probeKind;
      while (endKind !== null && endProbe <= limit) {
        endProbe += SPATIAL_STORM_SCAN_STEP;
        endKind = spatialStormKind(state, world, cell, endProbe);
      }
      if (endKind === null) {
        let until = Math.max(onset + 1, endProbe - SPATIAL_STORM_SCAN_STEP + 1);
        while (until < endProbe && spatialStormKind(state, world, cell, until) !== null) until++;
        const duration = until - onset;
        if (duration >= MIN_TEACHING_STORM_MINUTES && duration <= (maxDuration ?? Infinity)
          && (kinds.includes(kind) || kinds.includes("gale"))) {
          return { kind: kinds.includes(kind) ? kind : "gale", from: onset, until };
        }
        previousMinute = endProbe;
        previousKind = endKind;
        probe = endProbe;
        continue;
      }
    }
    previousMinute = probe;
    previousKind = probeKind;
  }
  return null;
}

function synthesize(state: GameState, world: World, cal: Calendar, opportunity: WeatherOpportunityContext): void {
  if (opportunity.opportunity === "readWeather" && !canMakeTeachingRead(state)) return;
  let minLead = 60;
  let maxDuration: number | undefined;
  let kinds: readonly ("rain" | "snow" | "gale")[] = ["rain", "snow", "gale"];
  if (opportunity.opportunity === "testShelter") {
    maxDuration = MILD_RAIN_MAX_MINUTES;
    kinds = ["rain"];
  } else if (opportunity.opportunity === "readWeather") {
    minLead = ORDINARY_WARNING_MINUTES + 1;
  } else if (opportunity.opportunity === "remoteStorm") {
    const lead = remoteLead(state, world, cal, opportunity);
    if (lead === null) return;
    minLead = lead;
  }
  const cell = opportunity.area?.centre ?? cellOf(state, world);
  const feature = nextSpatialStorm(state, world, cell, state.minute + Math.ceil(minLead), maxDuration, kinds);
  if (!feature) {
    opportunity.createdAt = state.minute;
    return;
  }
  const storm = { id: state.weather.nextStormId++, source: "synthetic" as const,
    kind: feature.kind, from: feature.from, until: feature.until, warned: false };
  state.weather.storm = storm;
  opportunity.stormId = storm.id;
  opportunity.source = storm.source;
}

function attemptSucceeded(state: GameState, opportunity: WeatherOpportunityContext): boolean {
  if (opportunity.opportunity === "testShelter") return (state.opportunities.completedAt.testShelter !== undefined);
  if (opportunity.opportunity === "readWeather") return (state.opportunities.completedAt.surviveForecast !== undefined);
  return (state.opportunities.completedAt.remoteStorm !== undefined);
}

function failureNotice(opportunity: WeatherOpportunityContext, death: boolean): string {
  if (death) return "The survivor died before the offered storm ended. Another opportunity will come.";
  if (opportunity.opportunity === "testShelter") return "The rain passed without shelter being tested. Another opportunity will come.";
  if (opportunity.opportunity === "readWeather") return "The storm passed before the forecast lesson was completed. Another opportunity will come.";
  return "The storm passed before the refuge was tested. Another opportunity will come.";
}

function resolve(state: GameState, opportunity: WeatherOpportunityContext, death: boolean): void {
  opportunity.status = "resolved";
  opportunity.resolvedAt = state.minute;
  if (!attemptSucceeded(state, opportunity)) queueOpportunityMessage(state, failureNotice(opportunity, death));
}

/** Rebase world-owned opportunity timestamps when an heir's life clock returns to zero. */
export function rebaseOpportunityContextClock(state: GameState): void {
  state.weather.stormFreeSince = 0;
  const opportunity = state.opportunities.context.weather;
  if (!opportunity) return;
  opportunity.createdAt = 0;
  if (opportunity.announcedAt !== null) opportunity.announcedAt = 0;
  if (opportunity.resolvedAt !== null) opportunity.resolvedAt = 0;
}

function stepClaimed(state: GameState, world: World, cal: Calendar, opportunity: WeatherOpportunityContext): void {
  const storm = state.weather.storm;
  if (!storm || storm.id !== opportunity.stormId) {
    resolve(state, opportunity, Boolean(state.dead));
    return;
  }
  if (state.dead) {
    resolve(state, opportunity, true);
    return;
  }
  if (state.minute >= storm.until) {
    resolve(state, opportunity, false);
    return;
  }
  if (state.minute >= storm.from) {
    opportunity.status = "running";
    return;
  }
  // A read made while the reserved event is still too distant can reveal
  // nothing, yet it consumes today's observation. Release that event so the
  // lesson can later reserve a storm for which a new read is meaningful.
  if (opportunity.opportunity === "readWeather" && opportunity.status === "reserved"
    && opportunity.readerIndex == null && !canMakeTeachingRead(state)) {
    opportunity.stormId = null;
    opportunity.source = null;
    opportunity.createdAt = state.minute;
    return;
  }
  const announcedAt = storm.from - announceLead(state, world, cal, opportunity);
  if (state.minute >= announcedAt) {
    opportunity.status = "announced";
    opportunity.announcedAt ??= state.minute;
  }
}

/** Claims or creates weather for a discovered lesson. It never starts survivor work. */
export function stepOpportunityContext(state: GameState, world: World, cal: Calendar, _rng: Rng): void {
  let opportunity = state.opportunities.context.weather;
  if (opportunity && opportunity.status !== "resolved" && state.dead) {
    resolve(state, opportunity, true);
    return;
  }
  refreshOpportunities(state, (cal.day - 1) * 1440);
  const key = discoveredWeatherOpportunity(state);
  if (opportunity?.status === "resolved" && attemptSucceeded(state, opportunity)) {
    state.opportunities.context.weather = null;
    opportunity = null;
  }
  if (!opportunity) {
    if (!key || state.dead || state.landing || stormNow(state.weather, state.minute) || key === "remoteStorm") return;
    opportunity = newOpportunity(key, state.minute);
    state.opportunities.context.weather = opportunity;
  }
  if (opportunity.status === "resolved") {
    if (attemptSucceeded(state, opportunity) || state.dead || state.landing) return;
    const stormFreeSince = Math.max(opportunity.resolvedAt ?? state.minute, state.weather.stormFreeSince);
    if (state.weather.storm || opportunity.resolvedAt === null || state.minute - stormFreeSince < RETRY_MINUTES) return;
    const area = opportunity.area;
    opportunity = newOpportunity(opportunity.opportunity, state.minute, opportunity.attempts + 1);
    opportunity.area = area;
    state.opportunities.context.weather = opportunity;
  }
  // Chapter 1 uses this slot as local-cover context until the shelter exists.
  // It must not reserve or synthesize weather before that outcome is earned.
  if (opportunity.opportunity === "makeUsefulShelter") return;
  // Chapter 3 reserves weather as soon as the refuge exists. The same remote
  // opportunity stays alive through the field-fire and field-meal lessons.
  if (!WEATHER_OPPORTUNITIES.has(opportunity.opportunity)) return;
  if (opportunity.stormId !== null) {
    stepClaimed(state, world, cal, opportunity);
    return;
  }
  claim(state, world, cal, opportunity);
  if (opportunity.stormId === null && !state.weather.storm
    && dawnOrdinal(state.minute, state.startDoy) - dawnOrdinal(opportunity.createdAt, state.startDoy) >= NATURAL_DAWNS) {
    synthesize(state, world, cal, opportunity);
  }
  if (opportunity.stormId !== null) stepClaimed(state, world, cal, opportunity);
}
