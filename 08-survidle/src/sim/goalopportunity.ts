import type { Rng } from "../rng";
import { routeMinutes } from "../world/route";
import type { World } from "../world/gen";
import { baseWalkSpeed } from "./player";
import { activeGoals } from "./goals";
import { fearsFell } from "./person";
import { cellOf } from "./position";
import { atCamp, straightKm } from "./position";
import { siteAt } from "./regionstate";
import { galeProtection, protectionOf } from "./shelter";
import { survivorRoute } from "./routing";
import type { Calendar } from "./calendar";
import { calendar } from "./calendar";
import type { GameState, GoalId, GoalOpportunity } from "./types";
import { ambientTemperature, createStorm, skyReadDay, stormNow, type StormKind, walkableIce, warningMinutes } from "./weather";

const WEATHER_GOALS = new Set<GoalId>(["testShelter", "readWeather", "remoteStorm"]);
const NATURAL_DAWNS = 3;
const RETRY_MINUTES = 24 * 60;
const ORDINARY_WARNING_MINUTES = 60;
const REMOTE_MARGIN_MINUTES = 30;
const MILD_RAIN_MAX_MINUTES = 10 * 60;

function activeWeatherGoal(state: GameState, cal: Calendar): GoalId | null {
  return activeGoals(state, cal).find((id) => WEATHER_GOALS.has(id)) ?? null;
}

function newOpportunity(goal: GoalId, minute: number, attempts = 1): GoalOpportunity {
  return {
    goal,
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
  const opportunity = state.goals.opportunity;
  if (!opportunity || opportunity.stormId !== stormId) return;
  opportunity.maxWetness = Math.max(opportunity.maxWetness, state.player.wetness);
  if (atCamp(state, world)) opportunity.atCampMinutes += minutes;
  else opportunity.awayFromCampMinutes += minutes;
  const area = opportunity.area;
  const cell = cellOf(state, world);
  if (!area || state.player.region !== area.region) return;
  if (opportunity.goal !== "remoteStorm" && straightKm(world, area.centre, cell) > area.radiusKm) return;
  const site = siteAt(state.regions[state.player.region], cell);
  const protection = stormKind === "gale"
    ? galeProtection(world, cell, site)
    : protectionOf(site);
  opportunity.minutesByProtection[protection] += minutes;
}

/** Snapshot the matching attempt's accumulated general storm facts for GoalEvent. */
export function stormMetrics(state: GameState, stormId: number): { minutesByProtection: [number, number, number, number]; atCampMinutes: number; awayFromCampMinutes: number; maxWetness: number } {
  const opportunity = state.goals.opportunity;
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

function remoteLead(state: GameState, world: World, cal: Calendar, opportunity: GoalOpportunity): number | null {
  if (!opportunity.area) return null;
  const from = cellOf(state, world);
  const to = opportunity.area.centre;
  const ice = walkableIce(state.weather);
  const route = survivorRoute(state, world, from, to, ice, fearsFell(state));
  if (!route) return null;
  return routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather), ice) + REMOTE_MARGIN_MINUTES;
}

function eligible(state: GameState, world: World, cal: Calendar, opportunity: GoalOpportunity): boolean {
  const storm = state.weather.storm;
  if (storm?.source !== "natural" || storm.from <= state.minute) return false;
  if (opportunity.goal === "testShelter") {
    const duration = storm.until - storm.from;
    const onset = ambientTemperature(calendar(storm.from, state.startDoy), { ...state.weather, precip: "heavy" });
    return storm.kind === "rain" && onset > 0 && duration <= MILD_RAIN_MAX_MINUTES;
  }
  if (opportunity.goal === "readWeather") {
    return storm.from - state.minute > ORDINARY_WARNING_MINUTES && readableWarningMinutes(state) > ORDINARY_WARNING_MINUTES;
  }
  if (opportunity.goal === "remoteStorm") {
    const lead = remoteLead(state, world, cal, opportunity);
    return lead !== null && storm.from - state.minute >= lead;
  }
  return false;
}

function announceLead(state: GameState, world: World, cal: Calendar, opportunity: GoalOpportunity): number {
  if (opportunity.goal === "readWeather") return readableWarningMinutes(state);
  if (opportunity.goal === "remoteStorm") return remoteLead(state, world, cal, opportunity) ?? warningMinutes(state);
  return warningMinutes(state);
}

function claim(state: GameState, world: World, cal: Calendar, opportunity: GoalOpportunity): void {
  const storm = state.weather.storm;
  if (!storm || !eligible(state, world, cal, opportunity)) return;
  opportunity.stormId = storm.id;
  opportunity.source = storm.source;
}

function synthesize(state: GameState, world: World, cal: Calendar, rng: Rng, opportunity: GoalOpportunity): void {
  let minLead = 60;
  let maxDuration: number | undefined;
  let kinds: readonly ("rain" | "snow" | "gale")[] = ["rain", "snow", "gale"];
  if (opportunity.goal === "testShelter") {
    maxDuration = MILD_RAIN_MAX_MINUTES;
    kinds = ["rain"];
  } else if (opportunity.goal === "readWeather") {
    minLead = ORDINARY_WARNING_MINUTES + 1;
  } else if (opportunity.goal === "remoteStorm") {
    const lead = remoteLead(state, world, cal, opportunity);
    if (lead === null) return;
    minLead = lead;
  }
  const storm = createStorm(state.weather, cal, rng, state.minute, "synthetic", { minLead, maxDuration, kinds });
  if (!storm) {
    opportunity.createdAt = state.minute;
    return;
  }
  opportunity.stormId = storm.id;
  opportunity.source = storm.source;
}

function attemptSucceeded(state: GameState, opportunity: GoalOpportunity): boolean {
  if (opportunity.goal === "testShelter") return Boolean(state.goals.done.testShelter);
  if (opportunity.goal === "readWeather") return Boolean(state.goals.done.surviveForecast);
  return Boolean(state.goals.done.remoteStorm);
}

function failureNotice(opportunity: GoalOpportunity, death: boolean): string {
  if (death) return "The survivor died before the offered storm ended. Another opportunity will come.";
  if (opportunity.goal === "testShelter") return "The rain passed without shelter being tested. Another opportunity will come.";
  if (opportunity.goal === "readWeather") return "The storm passed before the forecast lesson was completed. Another opportunity will come.";
  return "The storm passed before the refuge was tested. Another opportunity will come.";
}

function resolve(state: GameState, opportunity: GoalOpportunity, death: boolean): void {
  opportunity.status = "resolved";
  opportunity.resolvedAt = state.minute;
  if (!attemptSucceeded(state, opportunity)) state.goals.noticeQueue.push(failureNotice(opportunity, death));
}

/** Rebase world-owned opportunity timestamps when an heir's life clock returns to zero. */
export function rebaseGoalOpportunityClock(state: GameState): void {
  state.weather.stormFreeSince = 0;
  const opportunity = state.goals.opportunity;
  if (!opportunity) return;
  opportunity.createdAt = 0;
  if (opportunity.announcedAt !== null) opportunity.announcedAt = 0;
  if (opportunity.resolvedAt !== null) opportunity.resolvedAt = 0;
}

function stepClaimed(state: GameState, world: World, cal: Calendar, opportunity: GoalOpportunity): void {
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
  const announcedAt = storm.from - announceLead(state, world, cal, opportunity);
  if (state.minute >= announcedAt) {
    opportunity.status = "announced";
    opportunity.announcedAt ??= state.minute;
  }
}

/** Claims or creates weather for an active lesson. It never starts survivor work. */
export function stepGoalOpportunity(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  let opportunity = state.goals.opportunity;
  if (opportunity && opportunity.status !== "resolved" && state.dead) {
    resolve(state, opportunity, true);
    return;
  }
  const goal = activeWeatherGoal(state, cal);
  if (opportunity?.status === "resolved" && attemptSucceeded(state, opportunity)) {
    state.goals.opportunity = null;
    opportunity = null;
  }
  if (!opportunity) {
    if (!goal || state.dead || state.landing || stormNow(state.weather, state.minute) || goal === "remoteStorm") return;
    opportunity = newOpportunity(goal, state.minute);
    state.goals.opportunity = opportunity;
  }
  if (opportunity.status === "resolved") {
    if (attemptSucceeded(state, opportunity) || state.dead || state.landing) return;
    const stormFreeSince = Math.max(opportunity.resolvedAt ?? state.minute, state.weather.stormFreeSince);
    if (state.weather.storm || opportunity.resolvedAt === null || state.minute - stormFreeSince < RETRY_MINUTES) return;
    const area = opportunity.area;
    opportunity = newOpportunity(opportunity.goal, state.minute, opportunity.attempts + 1);
    opportunity.area = area;
    state.goals.opportunity = opportunity;
  }
  // Chapter 1 uses this slot as local-cover context until the shelter exists.
  // It must not reserve or synthesize weather before that outcome is earned.
  if (opportunity.goal === "makeUsefulShelter") return;
  // Chapter 3 carries the refuge through its field-fire and field-meal lessons.
  // Weather waits until the final lesson is active, but never waits for the
  // survivor to stand at the refuge before evaluating travel to it.
  if (!WEATHER_GOALS.has(opportunity.goal)) return;
  if (opportunity.stormId !== null) {
    stepClaimed(state, world, cal, opportunity);
    return;
  }
  claim(state, world, cal, opportunity);
  if (opportunity.stormId === null && !state.weather.storm
    && dawnOrdinal(state.minute, state.startDoy) - dawnOrdinal(opportunity.createdAt, state.startDoy) >= NATURAL_DAWNS) {
    synthesize(state, world, cal, rng, opportunity);
  }
  if (opportunity.stormId !== null) stepClaimed(state, world, cal, opportunity);
}
