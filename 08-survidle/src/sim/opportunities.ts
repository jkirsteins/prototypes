import type {
  OpportunityCategory,
  OpportunityDef,
  OpportunityEvent,
  OpportunityGroupDef,
  OpportunityGroupId,
  OpportunityKey,
  OpportunityState,
  OpportunityStepDef,
  Season,
} from "./types";
import type { FoodId } from "./items";
import type { Species } from "./species";
import type { StructureId, ToolId } from "./types";

export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

const one = (id: string, label: string, credit: (event: OpportunityEvent) => number, target = 1, unit?: string): OpportunityStepDef[] => [
  { id, label, credit, target, unit, final: true },
];

const noCredit = (_event: OpportunityEvent) => 0;
const defs = new Map<OpportunityKey, OpportunityDef>();

const staticTitles: Record<string, [string, OpportunityCategory]> = {
  site: ["Choose where to live", "survival"], drink: ["Drink water", "survival"], firewood: ["Gather firewood", "survival"],
  fire: ["Light a fire", "survival"], bed: ["Get off the cold ground", "camp"], roof: ["Put a roof over your head", "camp"],
  forageMeal: ["Forage and eat a meal", "food"], cook: ["Prepare and eat a hot meal", "food"], keptNight: ["Keep the fire alive overnight", "survival"],
  snareMeal: ["Eat a snared meal", "food"], huntMeal: ["Eat a hunted meal", "food"], fishMeal: ["Eat a fished meal", "food"], trapMeal: ["Eat a trapped meal", "food"],
  preserveHunt: ["Preserve a hunt", "food"], firstOrder: ["Place a first order", "survival"], findUsefulCover: ["Find useful cover", "weather"],
  makeUsefulShelter: ["Turn the ground into shelter", "weather"], testShelter: ["Put shelter to the test", "weather"], readWeather: ["Read the weather", "weather"],
  prepareWeather: ["Prepare for the weather", "weather"], surviveForecast: ["Survive a forecast", "weather"], water: ["Secure water", "survival"],
  keptDays: ["Keep the fire for days", "survival"], foodSource: ["Find a food source", "food"], store: ["Store food", "food"], fat: ["Eat fat", "food"],
  longOrder: ["Place a long order", "survival"], toolCare: ["Care for a tool", "mastery"], remoteRefuge: ["Find a remote refuge", "exploration"],
  fieldFire: ["Light a field fire", "survival"], fieldMeal: ["Make a field meal", "food"], remoteStorm: ["Weather a remote storm", "weather"],
  explore: ["Explore beyond home", "exploration"], secondCamp: ["Make a second camp", "exploration"], seasonalFood: ["Find seasonal food", "food"],
  durableRoof: ["Build a durable roof", "camp"], winterStores: ["Prepare winter stores", "survival"],
};

for (const [key, [title, category]] of Object.entries(staticTitles)) {
  const credit = key === "drink" ? (event: OpportunityEvent) => event.kind === "drank" ? 1 : 0
    : key === "firewood" ? (event: OpportunityEvent) => event.kind === "gathered" && (event.item === "firewood" || event.item === "wetFirewood") ? event.kg : 0
      : noCredit;
  defs.set(key as OpportunityKey, { key: key as OpportunityKey, title, category, steps: one(key, title, credit, key === "firewood" ? 10 : 1, key === "firewood" ? "kg" : undefined) });
}

for (const season of SEASONS) {
  const key = `season:${season}` as OpportunityKey;
  defs.set(key, { key, title: `Live through ${season}`, category: "weather", group: "seasons", steps: one(season, `Reach ${season}`, (event) => event.kind === "season" && event.season === season ? 1 : 0) });
}

const GROUPS: OpportunityGroupDef[] = [
  { id: "track-animals", title: "Track animals", category: "wildlife", keys: [] },
  { id: "hunt-animals", title: "Hunt animals", category: "wildlife", keys: [] },
  { id: "dress-carcasses", title: "Dress carcasses", category: "wildlife", keys: [] },
  { id: "recover-kills", title: "Recover kills", category: "wildlife", keys: [] },
  { id: "catch-fish", title: "Catch fish", category: "wildlife", keys: [] },
  { id: "trap-fish", title: "Trap fish", category: "wildlife", keys: [] },
  { id: "forage-foods", title: "Forage foods", category: "food", keys: [] },
  { id: "build-shelters", title: "Build shelters", category: "camp", keys: [] },
  { id: "make-tools", title: "Make tools", category: "mastery", keys: [] },
  { id: "seasons", title: "Seasons", category: "weather", keys: SEASONS.map((s) => `season:${s}` as OpportunityKey) },
];

export function newOpportunities(season: Season): OpportunityState {
  const state: OpportunityState = {
    discoveredAt: {}, completedAt: {}, stepProgress: {}, current: null,
    notices: [], nextNoticeId: 1, context: { weather: null, chapter3HomeRegion: null }, lastCategory: "survival",
  };
  for (const value of SEASONS) discoverOpportunity(state, `season:${value}`, 0, false);
  discoverOpportunity(state, "site", 0, true);
  state.current = "site";
  state.lastCategory = season === "winter" ? "weather" : "survival";
  return state;
}

export function opportunityDef(key: OpportunityKey): OpportunityDef | undefined {
  const existing = defs.get(key);
  if (existing) return existing;
  const [kind] = key.split(":");
  const category: OpportunityCategory = kind === "forage" ? "food" : kind === "build" ? "camp" : kind === "make" ? "mastery" : "wildlife";
  const generated: OpportunityDef = { key, title: key, category, steps: one(key, key, noCredit) };
  defs.set(key, generated);
  return generated;
}

export function opportunitySteps(key: OpportunityKey): OpportunityStepDef[] {
  return opportunityDef(key)?.steps ?? [];
}

export function setCurrentOpportunity(state: OpportunityState, key: OpportunityKey | null): boolean {
  if (key !== null && (state.discoveredAt[key] === undefined || state.completedAt[key] !== undefined)) return false;
  state.current = key;
  if (key !== null) state.lastCategory = opportunityDef(key)?.category ?? state.lastCategory;
  return true;
}

export function discoverOpportunity(state: OpportunityState, key: OpportunityKey, minute: number, announce = true): boolean {
  if (state.discoveredAt[key] !== undefined) return false;
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

export function applyOpportunityEvent(state: OpportunityState, event: OpportunityEvent, minute: number): OpportunityEventResult {
  const result: OpportunityEventResult = { completed: [], discovered: [], completedGroups: [] };
  for (const key of Object.keys(state.discoveredAt) as OpportunityKey[]) {
    if (state.completedAt[key] !== undefined) continue;
    const def = opportunityDef(key);
    if (!def || state.discoveredAt[key]! > minute) continue;
    const progress = state.stepProgress[key] ?? {};
    state.stepProgress[key] = progress;
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i];
      if (step.final && def.steps.slice(0, i).some((prior) => (progress[prior.id] ?? 0) < prior.target)) break;
      const credit = Math.max(0, step.credit(event));
      if (credit) progress[step.id] = Math.min(step.target, (progress[step.id] ?? 0) + credit);
    }
    if (def.steps.every((step) => (progress[step.id] ?? 0) >= step.target)) {
      state.completedAt[key] = minute;
      result.completed.push(key);
    }
  }
  for (const [key, def] of defs) {
    if (state.discoveredAt[key] !== undefined || def.prerequisites?.some((pre) => state.completedAt[pre] === undefined)) continue;
    if (def.notBeforeDay !== undefined && minute / 1440 < def.notBeforeDay) continue;
    if (def.prerequisites) { discoverOpportunity(state, key, minute, false); result.discovered.push(key); }
  }
  for (const group of GROUPS) {
    if (group.keys.length && group.keys.every((key) => state.completedAt[key] !== undefined)) result.completedGroups.push(group.id);
  }
  if (result.completed.length || result.discovered.length || result.completedGroups.length) {
    state.notices.push({ id: `${minute}:${state.nextNoticeId++}`, minute, completed: result.completed, completedGroups: result.completedGroups, discovered: result.discovered, messages: [] });
  }
  return result;
}

export function opportunityGroupView(state: OpportunityState, id: OpportunityGroupId): OpportunityGroupView {
  const group = GROUPS.find((candidate) => candidate.id === id) ?? { id, title: id, category: "mastery" as OpportunityCategory, keys: [] };
  return { ...group, done: group.keys.length > 0 && group.keys.every((key) => state.completedAt[key] !== undefined), discovered: group.keys.filter((key) => state.discoveredAt[key] !== undefined), completed: group.keys.filter((key) => state.completedAt[key] !== undefined) };
}

export type { FoodId, Species, StructureId, ToolId };
