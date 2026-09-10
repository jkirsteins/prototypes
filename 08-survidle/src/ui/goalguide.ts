import type { Calendar } from "../sim/calendar";
import { OPPORTUNITIES, opportunityDef, opportunitySteps } from "../sim/opportunities";
import type { GameState, OpportunityKey } from "../sim/types";
import type { World } from "../world/gen";

export interface GoalStepView { label: string; done: boolean }
export interface GoalProgressView {
  at: number;
  target: number;
  unit?: string;
  steps: GoalStepView[];
}

export interface GoalGuide {
  id: OpportunityKey;
  note?: string;
}


export const GOAL_GUIDES: GoalGuide[] = OPPORTUNITIES.map((goal) => goalGuide(goal.key));

export function goalGuide(id: OpportunityKey): GoalGuide {
  return { id, note: opportunityDef(id)?.note };
}

export function goalProgress(state: GameState, _world: World | undefined, _cal: Calendar, id: OpportunityKey): GoalProgressView {
  const steps = opportunitySteps(state, id);
  return {
    at: steps.filter((step) => step.done).length,
    target: steps.length,
    steps: steps.map((step) => ({ label: step.label, done: step.done })),
  };
}
