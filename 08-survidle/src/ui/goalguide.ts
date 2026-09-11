import type { Calendar } from "../sim/calendar";
import { GOALS, goalDef, goalSteps, type GoalPhase } from "../sim/goals";
import type { GameState, GoalId } from "../sim/types";
import type { World } from "../world/gen";

export interface GoalStepView { label: string; done: boolean }
export interface GoalProgressView {
  at: number;
  target: number;
  unit?: string;
  steps: GoalStepView[];
}

export interface GoalGuide {
  id: GoalId;
  phase: GoalPhase;
  note?: string;
}

const NOTES: Partial<Record<GoalId, string>> = {
  drink: "Below 1 litre, Self-care drinks from water at hand, or walks to some, on the minutes the activity queue gives it.",
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

export const GOAL_GUIDES: GoalGuide[] = GOALS.map((goal) => goalGuide(goal.id));

export function goalGuide(id: GoalId): GoalGuide {
  return { id, phase: goalDef(id).phase, note: NOTES[id] };
}

export function goalProgress(state: GameState, _world: World | undefined, _cal: Calendar, id: GoalId): GoalProgressView {
  const def = goalDef(id);
  const steps = goalSteps(state, id);
  return {
    at: steps.filter((step) => step.done).length,
    target: steps.length,
    unit: def.unit,
    steps: steps.map((step) => ({ label: step.label, done: step.done })),
  };
}
