import type { Calendar } from "../src/sim/calendar";
import { allOpportunityDefs } from "../src/sim/opportunity-catalog";
import { discoverOpportunity, refreshOpportunities } from "../src/sim/opportunities";
import type { GameState, OpportunityKey } from "../src/sim/types";

/** Arrange a discovered leaf without manufacturing survivor deeds. */
export function reveal(state: GameState, keys: readonly OpportunityKey[]): void {
  refreshOpportunities(state);
  for (const key of keys) discoverOpportunity(state.opportunities, key, state.minute);
}

/**
 * Read the discovered-but-unfinished set at a given day. Production never asks
 * this question - the UI renders from `discoveredAt` and `completedAt` directly -
 * so it lives here rather than in the kernel, and it opens the calendar gates
 * first because a gate can open on a quiet minute with no survivor deed.
 */
export function activeOpportunityKeys(state: GameState, cal: Calendar): OpportunityKey[] {
  refreshOpportunities(state, (cal.day - 1) * 1440);
  return allOpportunityDefs()
    .filter((def) => state.opportunities.discoveredAt[def.key] !== undefined && state.opportunities.completedAt[def.key] === undefined)
    .map((def) => def.key);
}

/** The leaves still waiting in an undismissed presentation, gates opened first. */
export function unpresentedOpportunityKeys(state: GameState, cal: Calendar): OpportunityKey[] {
  refreshOpportunities(state, (cal.day - 1) * 1440);
  return [...new Set(state.opportunities.notices.flatMap((notice) => notice.discovered))];
}
