import { dayNumber, type Calendar } from "./calendar";
import { qty } from "./inventory";
import type { FoodId } from "./items";
import {
  allOpportunityDefs, catalogOpportunityDef, eventDiscoveryKeys,
  OPPORTUNITY_GROUPS, registerAuthoredOpportunityDefs, SEASONS,
} from "./opportunity-catalog";
import { straightKm } from "./position";
import { current } from "./record";
import { gainedForecastFact } from "./weather";
import type { World } from "../world/gen";
import type { GameState, OpportunityCategory, OpportunityDef, OpportunityEvent, OpportunityGroupDef, OpportunityGroupId, OpportunityKey, OpportunityState, OpportunityStepDef, RecipeId, Season, StaticOpportunityId, StructureId, TaskId, WeatherOpportunityContext } from "./types";
export type { OpportunityKey, OpportunityEvent, StormPlanSnapshot, StormPlanOption, StormPlanInputs, StormOptionKind, FoodMethod } from "./types";
import type { FoodMethod } from "./types";
export { allOpportunityDefs, discoverAvailableOpportunities, OPPORTUNITY_CATEGORIES, OPPORTUNITY_GROUPS, SEASONS } from "./opportunity-catalog";

const task = (...ids: TaskId[]) => (d: OpportunityEvent) => ((d.kind === "task" || d.kind === "taskCompleted") && ids.includes(d.id) ? 1 : 0);
const lit = (d: OpportunityEvent) => d.kind === "lit" || d.kind === "fireLit" ? 1 : 0;
const built = (...ids: StructureId[]) => (d: OpportunityEvent) => (d.kind === "built" && ids.includes(d.structure) ? 1 : 0);
const roof = (d: OpportunityEvent) => d.kind === "protectionChanged"
  ? (d.from < 2 && d.to >= 2 ? 1 : 0)
  : d.kind === "sheltered"
    ? (d.protection >= 2 ? 1 : 0)
    : built("leanTo", "turfHut", "snowShelter", "cabin")(d);

/** The kilos of firewood a gather actually produced, wet or dry: the goal is the gathering. */
const firewoodKg = (d: OpportunityEvent) => (d.kind === "gathered" && (d.item === "firewood" || d.item === "wetFirewood") ? d.kg : 0);
const awaitingContext = (_d: OpportunityEvent) => 0;

const one = (id: string, label: string, credit: OpportunityStepDef["credit"], target = 1, unit?: string): OpportunityStepDef[] => [
  { id, label, credit, target, unit, final: true },
];
const step = (id: string, label: string, credit: OpportunityStepDef["credit"], target = 1, unit?: string): OpportunityStepDef => ({ id, label, credit, target, unit });
const crafted = (recipe: RecipeId) => (d: OpportunityEvent) => (d.kind === "crafted" && d.recipe === recipe ? 1 : 0);
const acquired = (method?: FoodMethod) => (d: OpportunityEvent) => (d.kind === "foodAcquired" && (!method || d.method === method) ? 1 : 0);
const ate = (...items: (FoodId | "sap")[]) => (d: OpportunityEvent) => (d.kind === "ate" && items.includes(d.item) ? 1 : 0);
const preparedMeal = ate("berries", "cookedRoots", "seaweed", "eggs", "barkFlour", "cookedMeat", "cookedFish", "cookedOilyFish", "fat", "roe", "driedMeat", "sap");
const gatheredMeal = ate("berries", "cookedRoots", "seaweed", "eggs", "barkFlour", "sap");
const cookedMeat = ate("cookedMeat");
const cookedFish = ate("cookedFish", "cookedOilyFish");

/** The firewood goal's target, in kilos: named once so the title can never drift from the number the bar checks. */
const FIREWOOD_KG = 10;

export const WINTER_DRIED_MEAT_KG = 80;
export const WINTER_FAT_KG = 20;
export const WINTER_FIREWOOD_KG = 600;
export const WINTER_LOGS = 300;

export function winterStoreProgress(state: GameState): { food: boolean; fuel: boolean } {
  const st = state.regions[state.player.region];
  const inv = st?.campCell === null || st?.campCell === undefined ? undefined : state.piles[st.campCell];
  const food = Boolean(inv && qty(inv, "driedMeat") >= WINTER_DRIED_MEAT_KG && qty(inv, "fat") >= WINTER_FAT_KG);
  const fuel = Boolean(inv && qty(inv, "firewood") + (st?.fire.fuelKg ?? 0) >= WINTER_FIREWOOD_KG && qty(inv, "log") >= WINTER_LOGS);
  return { food, fuel };
}

export function checkWinterStores(state: GameState): void {
  const progress = winterStoreProgress(state);
  if (progress.food && progress.fuel) recordOpportunityEvent(state, { kind: "winterStocked" });
}

/** The keeping goal's target, in days: named once so the title can never drift from the number the credit checks. */
export const KEPT_DAYS = 3;

const NOTES: Partial<Record<StaticOpportunityId, string>> = {
  drink: "Below 1 litre, the survivor drinks automatically from water at hand. If travel is needed, Self-care handles it through the activity queue.",
  firewood: "Dead wood burns without felling a tree.",
  fire: "Fire needs a site, fuel, and ignition.",
  bed: "A bed keeps sleep off the cold ground.",
  roof: "Shelter reduces wind and rain exposure.",
  forageMeal: "Some gathered foods must be cooked before eating.",
  cook: "Raw meat, fish, fat, and roots need a fire.",
  findUsefulCover: "Natural cover can break the wind before a built shelter is ready.",
  makeUsefulShelter: "Found cover can be improved, or temporary shelter can be built from the ground up.",
  testShelter: "Weatherproof protection proves its worth by keeping weather off the body.",
  snareMeal: "Snares catch food while other work continues, but must be checked.",
  huntMeal: "Hunts can fail.",
  trapMeal: "A basket trap catches fish while other work continues, but must be emptied.",
  foodSource: "Repeatable and passive methods can keep producing food.",
  store: "Raw meat rots quickly; drying makes it last.",
  fat: "Lean meat alone cannot sustain the body.",
  keptNight: "A fire survives only while fuel remains.",
  firstOrder: "Standing orders repeat work through the activity queue.",
  water: "Stored water avoids repeated journeys to a source.",
  keptDays: "Weather and fuel determine how long a fire lasts.",
  readWeather: "A sky reading can reveal time and facts that a passive warning does not.",
  prepareWeather: "A reachable camp, local shelter, or prepared refuge can answer coming weather.",
  surviveForecast: "Survive the same storm that was read and prepared for.",
  longOrder: "Longer orders continue without repeated clicks.",
  toolCare: "Damaged tools can be restored or replaced.",
  explore: "Other regions offer different ground, wildlife, and food.",
  remoteRefuge: "Weatherproof shelter beyond home makes a longer range usable.",
  fieldFire: "A carried fire kit can make warmth away from camp.",
  fieldMeal: "Cooking where you travel turns carried gear into independence.",
  remoteStorm: "A known refuge and a forecast make weather beyond home a choice instead of a retreat.",
  secondCamp: "Another camp extends the country the survivor can use.",
  seasonalFood: "Seasonal foods are available for only part of the year.",
  durableRoof: "Lasting shelter survives longer than a lean-to.",
  winterStores: "Winter requires both food and fuel.",
};

export const OPPORTUNITIES: OpportunityDef[] = [
  { key: "site", title: "Choose where to live", category: "survival", steps: one("camp", "Make camp", task("makeCamp")) },
  { key: "drink", title: "Drink water", category: "survival", steps: one("drink", "Drink", (d) => (d.kind === "drank" ? 1 : 0)), prerequisites: ["site"] },
  { key: "firewood", title: `Gather ${FIREWOOD_KG} kg of firewood`, category: "survival", steps: one("wood", `Gather ${FIREWOOD_KG} kg`, firewoodKg, FIREWOOD_KG, "kg"), prerequisites: ["drink"] },
  { key: "fire", title: "Light a fire", category: "survival", steps: [
      step("site", "Establish a fire site", built("firePit")),
      step("fuel", "Provide fuel", (d) => (d.kind === "fuelled" ? 1 : 0)),
      step("ignition", "Provide ignition", crafted("fireDrill")),
      { ...step("light", "Light the fire", lit), final: true },
    ], prerequisites: ["firewood"] },
  { key: "bed", title: "Get off the cold ground", category: "survival", steps: one("bed", "Build a bed", built("boughBed")), prerequisites: ["fire"] },
  { key: "roof", title: "Put a roof over your head", category: "survival", steps: one("roof", "Build a roof", roof), prerequisites: ["fire"] },
  { key: "forageMeal", title: "Forage and eat a meal", category: "food", steps: [step("gather", "Gather edible food", acquired("forage")), { ...step("eat", "Eat gathered food", gatheredMeal), final: true }], prerequisites: ["bed","roof","keptNight"] },
  { key: "cook", title: "Prepare and eat a hot meal", category: "food", steps: [step("cook", "Cook food", (d) => (d.kind === "cooked" && d.kg > 0 ? 1 : 0)), { ...step("eat", "Eat the meal", preparedMeal), final: true }], prerequisites: ["bed","roof","keptNight"] },
  { key: "findUsefulCover", title: "Find useful cover", category: "weather", steps: one("cover", "Find useful cover", (d) => (d.kind === "protectionChanged" && d.source === "found" && d.to > d.from && d.to >= 1 ? 1 : 0)), prerequisites: ["forageMeal","cook"] },
  { key: "makeUsefulShelter", title: "Turn the ground into shelter", category: "weather", steps: one("shelter", "Reach weatherproof protection", awaitingContext), prerequisites: ["findUsefulCover"] },
  { key: "testShelter", title: "Put shelter to the test", category: "weather", steps: one("storm", "Weather the offered rain", awaitingContext), prerequisites: ["makeUsefulShelter"] },
  { key: "keptNight", title: "Keep the fire alive overnight", category: "survival", steps: one("night", "Keep the fire alive until dawn", (d) => (d.kind === "keptNight" ? 1 : 0)), prerequisites: ["fire"] },
  { key: "snareMeal", title: "Eat from a snare", category: "food", steps: [step("make", "Make a snare", crafted("snare")), step("set", "Set a snare", built("snare")), step("catch", "Collect its catch", acquired("snare")), { ...step("eat", "Eat cooked meat", cookedMeat), final: true }], prerequisites: ["remoteStorm"] },
  { key: "huntMeal", title: "Hunt, cook, and eat meat", category: "food", steps: [
      step("bow", "Make a bow", crafted("bow")),
      step("arrows", "Make arrows", crafted("arrows")),
      step("sign", "Find fresh animal sign", (d) => (d.kind === "signFound" ? 1 : 0)),
      step("recover", "Bring meat back to camp", (d) => (d.kind === "recoveredAtCamp" ? 1 : 0)),
      { ...step("eat", "Eat cooked meat", cookedMeat), final: true },
    ], prerequisites: ["remoteStorm"] },
  { key: "fishMeal", title: "Catch, cook, and eat fish", category: "food", steps: [step("spear", "Make a fishing spear", crafted("fishingSpear")), step("catch", "Catch fish", acquired("fish")), { ...step("eat", "Eat cooked fish", cookedFish), final: true }], prerequisites: ["remoteStorm"] },
  { key: "trapMeal", title: "Eat from a basket trap", category: "food", steps: [step("make", "Make a basket trap", crafted("basketTrap")), step("set", "Set the trap", task("setTrap")), step("catch", "Collect fish", acquired("trap")), { ...step("eat", "Eat cooked fish", cookedFish), final: true }], prerequisites: ["snareMeal","huntMeal","fishMeal"] },
  { key: "firstOrder", title: "Give a standing camp order", category: "mastery", steps: one("order", "Give a standing order", (d) => (d.kind === "ordered" && ["deadwood", "split", "splitWedges", "chop", "fill", "melt"].includes(d.task) ? 1 : 0)), prerequisites: ["fat"] },
  { key: "water", title: "Keep water at camp", category: "camp", steps: one("source", "Establish storage or a camp source", built("waterStore", "seep")), prerequisites: ["fat"] },
  { key: "readWeather", title: "Read approaching weather", category: "weather", steps: one("read", "Learn a new forecast fact", awaitingContext), prerequisites: ["testShelter"], notBeforeDay: 8 },
  { key: "prepareWeather", title: "Prepare for what is coming", category: "weather", steps: one("plan", "Have a viable plan at onset", awaitingContext), prerequisites: ["readWeather"], notBeforeDay: 8 },
  { key: "surviveForecast", title: "Come through the forecast storm", category: "weather", steps: one("survive", "Survive the forecast storm", awaitingContext), prerequisites: ["prepareWeather"], notBeforeDay: 8 },
  { key: "keptDays", title: "Keep a fire burning for three days", category: "survival", steps: one("fire", "Keep one fire alive for three days", (d) => (d.kind === "keptFor" && d.minutes >= KEPT_DAYS * 24 * 60 ? 1 : 0)), prerequisites: ["fat"] },
  { key: "foodSource", title: "Find a lasting food source", category: "food", steps: [step("source", "Establish a repeatable or passive source", acquired()), { ...step("eat", "Eat from that source", preparedMeal), final: true }], prerequisites: ["snareMeal","huntMeal","fishMeal"] },
  { key: "store", title: "Put food by for later", category: "food", steps: [step("preserve", "Preserve food", (d) => (d.kind === "preserved" ? 1 : 0)), { ...step("eat", "Eat preserved food", ate("driedMeat")), final: true }], prerequisites: ["snareMeal","huntMeal","fishMeal"] },
  { key: "fat", title: "Find food with fat", category: "food", steps: one("fat", "Eat food containing fat", (d) => (d.kind === "ateFat" ? 1 : 0)), prerequisites: ["trapMeal","foodSource","store","preserveHunt"] },
  { key: "longOrder", title: "Try a longer order", category: "mastery", steps: one("order", "Give a grind or keep order", (d) => (d.kind === "ordered" && d.long ? 1 : 0)), prerequisites: ["firstOrder","water","keptDays"] },
  { key: "toolCare", title: "Keep a tool working", category: "mastery", steps: one("care", "Restore or replace a tool", (d) => (d.kind === "toolCared" ? 1 : 0)), prerequisites: ["firstOrder","water","keptDays"] },
  { key: "remoteRefuge", title: "Prepare a refuge beyond home", category: "weather", steps: one("refuge", "Prepare shelter in another region", awaitingContext), prerequisites: ["surviveForecast"], notBeforeDay: 31 },
  { key: "fieldFire", title: "Light a fire away from camp", category: "weather", steps: one("fire", "Light away from camp", awaitingContext), prerequisites: ["remoteRefuge"], notBeforeDay: 31 },
  { key: "fieldMeal", title: "Make a meal away from camp", category: "weather", steps: one("meal", "Cook at a field fire", awaitingContext), prerequisites: ["fieldFire"], notBeforeDay: 31 },
  { key: "remoteStorm", title: "Ride out weather beyond home", category: "weather", steps: one("storm", "Weather the storm beyond home", awaitingContext), prerequisites: ["fieldMeal"], notBeforeDay: 31 },
  { key: "explore", title: "Explore another region", category: "exploration", steps: one("explore", "Explore another region", (d) => (d.kind === "explored" && d.anotherRegion ? 1 : 0)), prerequisites: ["longOrder","toolCare"] },
  { key: "secondCamp", title: "Establish a second camp", category: "camp", steps: one("camp", "Make camp in another region", (d) => (d.kind === "campedAgain" ? 1 : 0)), prerequisites: ["explore"] },
  { key: "seasonalFood", title: "Try a seasonal food", category: "food", steps: [step("gather", "Gather seasonal food", (d) => (d.kind === "seasonalFood" ? 1 : 0)), { ...step("eat", "Eat seasonal food", preparedMeal), final: true }], prerequisites: ["explore"] },
  { key: "durableRoof", title: "Build lasting shelter", category: "camp", steps: one("roof", "Build a turf hut or cabin", built("turfHut", "cabin")), prerequisites: ["explore"] },
  { key: "winterStores", title: "Prepare stores for winter", category: "food", steps: one("stores", "Store food and fuel", (d) => (d.kind === "winterStocked" ? 1 : 0)), prerequisites: ["secondCamp","seasonalFood","durableRoof"] },
  { key: "preserveHunt", title: "Preserve meat from a hunt", category: "food", prerequisites: ["snareMeal", "huntMeal", "fishMeal"], steps: [step("hunt", "Hunt any animal", (event) => event.kind === "animalKilled" ? 1 : 0), { ...step("preserve", "Preserve meat", (event) => event.kind === "preserved" ? 1 : 0), final: true }] },
];
for (const def of OPPORTUNITIES) def.note = NOTES[def.key as StaticOpportunityId];
for (const season of SEASONS) OPPORTUNITIES.push({ key: `season:${season}`, title: `Live through ${season}`, category: "exploration", group: "seasons", steps: one("season", `Live into ${season}`, (event) => event.kind === "season" && event.season === season ? 1 : 0) });
const defs = new Map(OPPORTUNITIES.map((def) => [def.key, def]));
registerAuthoredOpportunityDefs(OPPORTUNITIES);
export function newOpportunities(season: Season): OpportunityState {
  const state: OpportunityState = {
    discoveredAt: {}, completedAt: {}, stepProgress: {}, current: null,
    notices: [], nextNoticeId: 1, context: { weather: null, chapter3HomeRegion: null }, lastCategory: "survival", lastSeason: season,
  };
  for (const value of SEASONS) discoverOpportunity(state, `season:${value}`, 0, false);
  discoverOpportunity(state, "site", 0, true);
  state.current = "site";
  return state;
}

export function opportunityDef(key: OpportunityKey): OpportunityDef | undefined {
  return defs.get(key) ?? catalogOpportunityDef(key);
}

export function opportunityStepDefs(key: OpportunityKey): OpportunityStepDef[] {
  return opportunityDef(key)?.steps ?? [];
}

export function opportunityEligible(def: OpportunityDef, minute: number): boolean {
  return def.notBeforeDay === undefined || dayNumber(minute) >= def.notBeforeDay;
}

/** First entry is calendar-gated; the world keeps an opened chapter across heirs. */
function chapterEligible(state: OpportunityState, def: OpportunityDef, minute: number): boolean {
  if (["prepareWeather", "surviveForecast"].includes(def.key) && state.discoveredAt.readWeather !== undefined) return true;
  if (["fieldFire", "fieldMeal", "remoteStorm"].includes(def.key) && state.discoveredAt.remoteRefuge !== undefined) return true;
  return opportunityEligible(def, minute);
}

export function setCurrentOpportunity(state: OpportunityState, key: OpportunityKey | null): boolean {
  if (key !== null && (state.discoveredAt[key] === undefined || state.completedAt[key] !== undefined)) return false;
  state.current = key;
  if (key !== null) state.lastCategory = opportunityDef(key)?.category ?? state.lastCategory;
  return true;
}

/** Consume only this presentation; stale clicks cannot select or dismiss another batch. */
export function dismissOpportunityPresentation(state: GameState, noticeId: string, selected: OpportunityKey | null): boolean {
  const opportunities = state.opportunities;
  const index = opportunities.notices.findIndex((notice) => notice.id === noticeId);
  if (index < 0) return false;
  if (selected !== null && (!opportunities.notices[index].discovered.includes(selected)
    || !opportunityDef(selected) || !setCurrentOpportunity(opportunities, selected))) return false;
  opportunities.notices.splice(index, 1);
  return true;
}

export function isOpportunityDiscovered(state: OpportunityState, key: OpportunityKey): boolean {
  return state.discoveredAt[key] !== undefined;
}

export function isOpportunityComplete(state: OpportunityState, key: OpportunityKey): boolean {
  return state.completedAt[key] !== undefined;
}

export function discoverOpportunity(state: OpportunityState, key: OpportunityKey, minute: number, announce = true): boolean {
  if (!opportunityDef(key) || state.discoveredAt[key] !== undefined) return false;
  state.discoveredAt[key] = minute;
  if (announce) state.notices.push({ id: `${minute}:${state.nextNoticeId++}`, minute, completed: [], completedGroups: [], discovered: [key], messages: [] });
  return true;
}

export interface OpportunityEventResult {
  completed: OpportunityKey[];
  discovered: OpportunityKey[];
  completedGroups: OpportunityGroupId[];
}

export interface OpportunityGroupView extends OpportunityGroupDef {
  done: boolean;
  discovered: OpportunityKey[];
  completed: OpportunityKey[];
}

export function applyOpportunityEvent(
  state: OpportunityState,
  event: OpportunityEvent,
  minute: number,
  contextual?: (completed: OpportunityKey[]) => void,
  discoveryKeys = eventDiscoveryKeys(event),
): OpportunityEventResult {
  const result: OpportunityEventResult = { completed: [], discovered: [], completedGroups: [] };
  for (const key of Object.keys(state.discoveredAt) as OpportunityKey[]) {
    if (state.completedAt[key] !== undefined) continue;
    const def = opportunityDef(key);
    // Discovery timestamps describe history across lives, whose clocks reset.
    // Only membership gates credit; no past event is ever replayed.
    if (!def) continue;
    const progress = state.stepProgress[key] ?? {};
    state.stepProgress[key] = progress;
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i];
      if (step.final && def.steps.slice(0, i).some((prior) => (progress[prior.id] ?? 0) + 1e-9 < prior.target)) break;
      const credit = Math.max(0, step.credit(event));
      if (credit) progress[step.id] = Math.min(step.target, (progress[step.id] ?? 0) + credit);
    }
    if (def.steps.every((step) => (progress[step.id] ?? 0) + 1e-9 >= step.target)) {
      state.completedAt[key] = minute;
      result.completed.push(key);
    }
  }
  contextual?.(result.completed);
  for (const def of allOpportunityDefs()) {
    const key = def.key;
    if (state.discoveredAt[key] !== undefined || state.completedAt[key] !== undefined || def.prerequisites?.some((pre) => state.completedAt[pre] === undefined)) continue;
    if (!chapterEligible(state, def, minute)) continue;
    if (def.prerequisites) { discoverOpportunity(state, key, minute, false); result.discovered.push(key); }
  }
  for (const key of discoveryKeys) {
    if (discoverOpportunity(state, key, minute, false)) result.discovered.push(key);
  }
  if (state.current !== null && state.completedAt[state.current] !== undefined) state.current = null;
  if (state.current === null && result.discovered.length === 1) setCurrentOpportunity(state, result.discovered[0]);
  for (const group of OPPORTUNITY_GROUPS) {
    if (group.keys.length && result.completed.some((key) => group.keys.includes(key)) && group.keys.every((key) => state.completedAt[key] !== undefined)) result.completedGroups.push(group.id);
  }
  if (result.completed.length || result.discovered.length || result.completedGroups.length) {
    state.notices.push({ id: `${minute}:${state.nextNoticeId++}`, minute, completed: result.completed, completedGroups: result.completedGroups, discovered: result.discovered, messages: [] });
  }
  return result;
}

export function opportunityGroupView(state: OpportunityState, id: OpportunityGroupId): OpportunityGroupView {
  const group = OPPORTUNITY_GROUPS.find((candidate) => candidate.id === id) ?? { id, title: id, category: "mastery" as OpportunityCategory, keys: [] };
  return { ...group, done: group.keys.length > 0 && group.keys.every((key) => state.completedAt[key] !== undefined), discovered: group.keys.filter((key) => state.discoveredAt[key] !== undefined), completed: group.keys.filter((key) => state.completedAt[key] !== undefined) };
}

function shelterOpportunity(opportunity: "makeUsefulShelter" | "testShelter", minute: number, area: { region: number; centre: number; radiusKm: 1 }): WeatherOpportunityContext | null {
  return {
    opportunity, status: "reserved", createdAt: minute, attempts: 1,
    stormId: null, source: null, area, announcedAt: null, resolvedAt: null,
    minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    readerIndex: null, plan: null,
  };
}

function fieldOpportunity(minute: number, area: { region: number; centre: number; radiusKm: 1 }): WeatherOpportunityContext | null {
  return {
    opportunity: "remoteStorm", status: "reserved", createdAt: minute, attempts: 1,
    stormId: null, source: null, area, announcedAt: null, resolvedAt: null,
    minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    readerIndex: null, plan: null,
  };
}

/** Discovered leaves can earn credit regardless of presentation or current focus. */
export function recordOpportunityEvent(state: GameState, d: OpportunityEvent, world?: World): OpportunityKey[] {
  captureChapterHome(state);
  const known = new Set(Object.keys(state.opportunities.discoveredAt) as OpportunityKey[]);
  const pending = new Set([...known].filter((key) => state.opportunities.completedAt[key] === undefined));
  const result = applyOpportunityEvent(state.opportunities, d, state.minute, (finished) => {
    if (d.kind === "protectionChanged" && finished.includes("findUsefulCover")) {
      state.opportunities.context.weather = shelterOpportunity("makeUsefulShelter", d.minute, { region: d.region, centre: d.cell, radiusKm: 1 });
    }
    if (d.kind === "protectionChanged") {
      const opportunity = state.opportunities.context.weather;
      const area = opportunity?.area;
      if (opportunity?.opportunity === "makeUsefulShelter" && area && world && pending.has("makeUsefulShelter")
        && d.to > d.from && d.to >= 2 && d.region === area.region
        && straightKm(world, area.centre, d.cell) <= area.radiusKm) {
        finishOpportunity(state, "makeUsefulShelter", finished);
        state.opportunities.context.weather = shelterOpportunity("testShelter", d.minute, area);
      }
      if (pending.has("remoteRefuge") && d.to > d.from && d.to >= 2
        && state.opportunities.context.chapter3HomeRegion !== null && d.region !== state.opportunities.context.chapter3HomeRegion) {
        finishOpportunity(state, "remoteRefuge", finished);
        state.opportunities.context.weather = fieldOpportunity(d.minute, { region: d.region, centre: d.cell, radiusKm: 1 });
      }
    }
    if (d.kind === "fireLit" && !d.atCamp) {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "remoteStorm" && opportunity.area && pending.has("fieldFire")) {
        finishOpportunity(state, "fieldFire", finished);
      }
    }
    if (d.kind === "taskCompleted" && d.id === "cook" && !d.atCamp) {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "remoteStorm" && opportunity.area && pending.has("fieldMeal")) {
        finishOpportunity(state, "fieldMeal", finished);
      }
    }
    if (d.kind === "forecastChanged") {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "readWeather" && (opportunity.status === "announced" || opportunity.status === "reserved")
        && opportunity.stormId === d.stormId && known.has("readWeather")
        && d.source === "readSky" && gainedForecastFact(d.before, d.after)) {
        opportunity.readerIndex = current(state).index;
        if (pending.has("readWeather")) finishOpportunity(state, "readWeather", finished);
      }
    }
    if (d.kind === "stormStarted") {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "readWeather" && opportunity.stormId === d.stormId && d.plan.stormId === d.stormId) {
        opportunity.plan ??= structuredClone(d.plan);
        if (pending.has("prepareWeather") && d.plan.options.some((option) => option.viable)) {
          finishOpportunity(state, "prepareWeather", finished);
        }
      }
    }
    if (d.kind === "stormEnded") {
      const opportunity = state.opportunities.context.weather;
      if (opportunity?.opportunity === "testShelter" && opportunity.stormId === d.stormId && pending.has("testShelter")
        && d.survivorAlive && d.minutesByProtection[2] + d.minutesByProtection[3] + 1e-9 >= 60) {
        finishOpportunity(state, "testShelter", finished);
      }
      if (opportunity?.opportunity === "readWeather" && opportunity.stormId === d.stormId && pending.has("surviveForecast")
        && d.survivorAlive && opportunity.readerIndex === current(state).index) {
        finishOpportunity(state, "surviveForecast", finished);
      }
      const adequateMinutes = d.stormKind === "snow"
        ? d.minutesByProtection[1] + d.minutesByProtection[2] + d.minutesByProtection[3]
        : d.minutesByProtection[2] + d.minutesByProtection[3];
      if (opportunity?.opportunity === "remoteStorm" && opportunity.stormId === d.stormId && pending.has("remoteStorm")
        && d.survivorAlive && d.atCampMinutes <= 1e-9 && adequateMinutes + 1e-9 >= 60) {
        finishOpportunity(state, "remoteStorm", finished);
      }
    }
  }, eventDiscoveryKeys(d, state));
  captureChapterHome(state);
  return result.completed;
}

function finishOpportunity(state: GameState, key: OpportunityKey, finished: OpportunityKey[]): void {
  if (state.opportunities.completedAt[key] !== undefined) return;
  const def = opportunityDef(key)!;
  state.opportunities.stepProgress[key] = Object.fromEntries(def.steps.map((step) => [step.id, step.target]));
  state.opportunities.completedAt[key] = state.minute;
  finished.push(key);
}

/** Live context can initialize after migration or after the first camp appears. */
function captureChapterHome(state: GameState): void {
  if (state.dead || state.landing || state.opportunities.discoveredAt.remoteRefuge === undefined
    || state.opportunities.completedAt.remoteRefuge !== undefined
    || state.opportunities.context.chapter3HomeRegion !== null) return;
  const here = state.regions[state.player.region];
  const home = here?.campCell !== null && here?.campCell !== undefined
    ? state.player.region : Number(Object.entries(state.regions).find(([, region]) => region.campCell !== null)?.[0]);
  state.opportunities.context.chapter3HomeRegion = Number.isFinite(home) ? home : null;
}

/** Calendar gates can open on a quiet minute without a survivor deed. */
export function refreshOpportunities(state: GameState, minute = state.minute): void {
  const discovered: OpportunityKey[] = [];
  for (const def of allOpportunityDefs()) {
    if (state.opportunities.completedAt[def.key] !== undefined) continue;
    if (!def.prerequisites || !chapterEligible(state.opportunities, def, minute) || def.prerequisites.some((key) => state.opportunities.completedAt[key] === undefined)) continue;
    if (discoverOpportunity(state.opportunities, def.key, state.minute, false)) discovered.push(def.key);
  }
  captureChapterHome(state);
  if (discovered.length) {
    state.opportunities.notices.push({ id: `${state.minute}:${state.opportunities.nextNoticeId++}`, minute: state.minute, completed: [], completedGroups: [], discovered, messages: [] });
    if (state.opportunities.current === null && discovered.length === 1) setCurrentOpportunity(state.opportunities, discovered[0]);
  }
}

export function activeOpportunityKeys(state: GameState, cal: Calendar): OpportunityKey[] {
  refreshOpportunities(state, (cal.day - 1) * 1440);
  return allOpportunityDefs().filter((def) => state.opportunities.discoveredAt[def.key] !== undefined && state.opportunities.completedAt[def.key] === undefined).map((def) => def.key);
}

export function unpresentedOpportunityKeys(state: GameState, cal: Calendar): OpportunityKey[] {
  refreshOpportunities(state, (cal.day - 1) * 1440);
  return [...new Set(state.opportunities.notices.flatMap((notice) => notice.discovered))];
}

export function acknowledgeOpportunities(state: GameState, discovered: OpportunityKey[], completed: OpportunityKey[] = [], messages: string[] = []): void {
  for (const notice of state.opportunities.notices) {
    notice.discovered = notice.discovered.filter((key) => !discovered.includes(key));
    notice.completed = notice.completed.filter((key) => !completed.includes(key));
    notice.messages = notice.messages.filter((message) => !messages.includes(message));
  }
  state.opportunities.notices = state.opportunities.notices.filter((notice) => notice.discovered.length || notice.completed.length || notice.completedGroups.length || notice.messages.length);
}

export function queueOpportunityMessage(state: GameState, message: string): void {
  state.opportunities.notices.push({ id: `${state.minute}:${state.opportunities.nextNoticeId++}`, minute: state.minute, completed: [], completedGroups: [], discovered: [], messages: [message] });
}

export function opportunitySteps(state: GameState, key: OpportunityKey): { id: string; label: string; at: number; target: number; unit?: string; done: boolean }[] {
  const progress = state.opportunities.stepProgress[key] ?? {};
  return opportunityStepDefs(key).map((step) => {
    const at = Math.min(step.target, progress[step.id] ?? (state.opportunities.completedAt[key] !== undefined ? step.target : 0));
    return { id: step.id, label: step.label, at, target: step.target, unit: step.unit, done: at + 1e-9 >= step.target };
  });
}

export function legacyStaticOpportunityKey(id: string): OpportunityKey | undefined {
  if (SEASONS.includes(id as Season)) return `season:${id as Season}`;
  return OPPORTUNITIES.find((def) => def.key === id && !def.group)?.key;
}
