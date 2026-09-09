import type { Calendar } from "../sim/calendar";
import { fireAt } from "../sim/fire";
import { goalDef, type GoalPhase, winterStoreProgress } from "../sim/goals";
import { qty } from "../sim/inventory";
import { SNOW_SHELTER_CM, STRUCTURES } from "../sim/items";
import { atCamp } from "../sim/position";
import { campSite, regionState } from "../sim/regionstate";
import { check, inReach } from "../sim/tasks";
import type { GameState, GoalId, ItemId } from "../sim/types";
import type { World } from "../world/gen";

export interface GoalStepView { label: string; done: boolean }
export interface GoalProgressView {
  at: number;
  target: number;
  unit?: string;
  steps: GoalStepView[];
  deadline?: string;
}

export interface GoalGuide {
  id: GoalId;
  phase: GoalPhase;
  reason: string;
  path?: string;
  prompt?: string;
}

const GUIDES: Record<GoalId, Omit<GoalGuide, "id" | "phase">> = {
  site: { reason: "Camp anchors supplies, shelter, and fire.", path: "Build > Site" },
  drink: { reason: "Thirst becomes dangerous quickly.", path: "Water under your condition" },
  firewood: { reason: "Fire needs a steady fuel supply.", path: "Gather > Kindling" },
  fire: { reason: "Fire provides warmth and makes food safe.", path: "Build > Fire; Make > Fire; Camp > Fire" },
  bed: { reason: "A bed keeps sleep off the cold ground.", path: "Build > Shelter" },
  roof: { reason: "Shelter keeps wind and rain off the body.", path: "Build > Shelter" },
  cook: { reason: "Cooked food is safer and easier to live on.", path: "Camp > Food" },
  keptNight: { reason: "A live fire protects the coldest hours.", path: "Keep fuel at camp" },
  firstOrder: { reason: "Orders let the camp run while time passes.", path: "Open more on a fuel or water action" },
  water: { reason: "Stored water shortens every thirsty day.", prompt: "Try a store or a reliable camp source." },
  keptDays: { reason: "A steady fire makes weather easier to absorb.", prompt: "How much fuel keeps one fire alive?" },
  foodSource: { reason: "Dried meat will not last forever.", prompt: "Which food source suits this place?" },
  store: { reason: "Preserved food carries good days into lean ones.", prompt: "Put part of a catch by." },
  fat: { reason: "Lean food alone cannot sustain the body.", prompt: "Look beyond lean meat." },
  longOrder: { reason: "Longer orders turn skill into routine.", prompt: "Try a newly learned order." },
  toolCare: { reason: "A failed tool can stop a whole camp.", prompt: "Maintain one or prepare its replacement." },
  explore: { reason: "Nearby regions offer different ground and food.", prompt: "What lies beyond this camp?" },
  secondCamp: { reason: "Another camp extends the country you can use.", prompt: "Where would a second base help?" },
  seasonalFood: { reason: "Some foods appear for only part of the year.", prompt: "What is the land offering now?" },
  durableRoof: { reason: "Lasting shelter makes bad weather manageable.", prompt: "Build for more than one storm." },
  winterStores: { reason: "Winter tests both food and fuel reserves.", prompt: "Can this camp outlast the cold?" },
  spring: { reason: "Notice what the returning light changes.", prompt: "Live into spring." },
  summer: { reason: "Long days open new work and food.", prompt: "Live into summer." },
  autumn: { reason: "Autumn is the last easy time to prepare.", prompt: "Live into autumn." },
  winter: { reason: "Winter reveals what the camp can sustain.", prompt: "Live into winter." },
};

export const GOAL_GUIDES: GoalGuide[] = Object.entries(GUIDES).map(([id, copy]) => {
  const goal = goalDef(id as GoalId);
  return { id: goal.id, phase: goal.phase, ...copy };
});

export function goalGuide(id: GoalId): GoalGuide {
  const copy = GUIDES[id];
  const goal = goalDef(id);
  return { id, phase: goal.phase, ...copy };
}

function held(state: GameState, world: World, item: ItemId): number {
  const st = regionState(state, world, state.player.region);
  const camp = st.campCell === null ? 0 : qty(state.piles[st.campCell] ?? { items: {}, stacks: {} }, item);
  return qty(state.player.pack, item) + camp;
}

function hasMaterials(state: GameState, world: World, structure: keyof typeof STRUCTURES): boolean {
  return STRUCTURES[structure].needs.every((need) => held(state, world, need.item) >= need.qty
    || (need.alt !== undefined && held(state, world, need.alt) >= need.qty));
}

function building(site: ReturnType<typeof campSite>, structure: keyof typeof STRUCTURES): boolean {
  return site?.build[structure] !== undefined;
}

function daysToSeason(cal: Calendar, id: "spring" | "summer" | "autumn" | "winter"): number {
  const starts = { spring: 59, summer: 151, autumn: 243, winter: 334 };
  return ((starts[id] - cal.dayOfYear) % 365 + 365) % 365;
}

export function goalProgress(state: GameState, world: World | undefined, _cal: Calendar, id: GoalId): GoalProgressView {
  const def = goalDef(id);
  const deedAt = state.goals.progress[id] ?? (state.goals.done[id] ? def.target : 0);
  const base: GoalProgressView = { at: Math.min(def.target, deedAt), target: def.target, unit: def.unit, steps: [] };
  if (!world) return base;
  const st = regionState(state, world, state.player.region);
  const site = campSite(st);
  if (id === "fire") {
    const fire = fireAt(state, world);
    const campFireSite = atCamp(state, world) && Boolean(site?.structures.firePit || site?.structures.hearth);
    const steps = [
      { label: "Site", done: Boolean(fire || campFireSite || check(state, world, _cal, "light").ok) },
      { label: "Fuel", done: Boolean(fire) || st.fire.fuelKg > 0 || inReach(state, world, "firewood") > 0 },
      { label: "Ignition", done: Boolean(fire) || state.player.tools.some((tool) => tool.id === "fireDrill") || inReach(state, world, "fireDrill") > 0 },
    ];
    return { ...base, at: state.goals.done.fire ? 3 : steps.filter((step) => step.done).length, target: 3, steps };
  }
  if (id === "keptDays") {
    const days = st.fire.litSince === null ? 0 : Math.max(0, state.minute - st.fire.litSince) / 1440;
    return { ...base, at: state.goals.done.keptDays ? 3 : Math.min(3, days), target: 3, unit: "days", steps: [{ label: "Fire alive", done: st.fire.lit || st.fire.embers > 0 }] };
  }
  if (id === "cook") {
    const food: ItemId[] = ["rawMeat", "fish", "oilyFish", "rawFat", "roots"];
    const steps = [
      { label: "Fire", done: fireAt(state, world) !== null },
      { label: "Food", done: food.some((item) => inReach(state, world, item) > 0) },
      { label: "Cook", done: Boolean(state.goals.done.cook) },
    ];
    return { ...base, at: state.goals.done.cook ? 3 : steps.filter((step) => step.done).length, target: 3, steps };
  }
  if (id === "store") {
    const steps = [
      { label: "Rack", done: Boolean(site?.structures.dryingRack) },
      { label: "Food hung", done: Boolean(state.goals.done.store) },
    ];
    return { ...base, at: state.goals.done.store ? 2 : steps.filter((step) => step.done).length, target: 2, steps };
  }
  if (id === "winterStores") {
    const { food, fuel } = winterStoreProgress(state);
    const steps = [{ label: "Food", done: food }, { label: "Fuel", done: fuel }];
    return { ...base, at: state.goals.done.winterStores ? 2 : steps.filter((step) => step.done).length, target: 2, steps };
  }
  if (id === "spring" || id === "summer" || id === "autumn" || id === "winter") {
    const days = daysToSeason(_cal, id);
    return { ...base, steps: [{ label: days === 1 ? "1 day" : `${days} days`, done: Boolean(state.goals.done[id]) }] };
  }
  if (id === "bed") {
    const steps = [
      { label: "12 sticks", done: hasMaterials(state, world, "boughBed") || building(site, "boughBed") },
      { label: "Bed", done: Boolean(site?.structures.boughBed || state.goals.done.bed) },
    ];
    return { ...base, at: state.goals.done.bed ? 2 : steps.filter((step) => step.done).length, target: 2, steps, deadline: _cal.day === 1 && _cal.hour < _cal.sunset ? "before dusk" : undefined };
  }
  if (id === "roof") {
    const roof = Boolean(site?.structures.leanTo || site?.structures.turfHut || site?.structures.snowShelter || site?.structures.cabin || state.goals.done.roof);
    const materials = hasMaterials(state, world, "leanTo") || hasMaterials(state, world, "turfHut")
      || hasMaterials(state, world, "cabin") || state.weather.snowCm >= SNOW_SHELTER_CM
      || (["leanTo", "turfHut", "cabin", "snowShelter"] as const).some((id) => building(site, id));
    const steps = [{ label: "Materials", done: materials }, { label: "Roof", done: roof }];
    return { ...base, at: state.goals.done.roof ? 2 : steps.filter((step) => step.done).length, target: 2, steps, deadline: _cal.day === 1 && _cal.hour < _cal.sunset ? "before dusk" : undefined };
  }
  const oneStep: Partial<Record<GoalId, GoalStepView>> = {
    site: { label: "Make camp", done: Boolean(state.goals.done.site) },
    drink: { label: "Drink", done: Boolean(state.goals.done.drink) },
  };
  if (oneStep[id]) base.steps = [oneStep[id]!];
  return base;
}
