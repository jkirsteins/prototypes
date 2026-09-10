import { discoverOpportunity, refreshOpportunities } from "../src/sim/opportunities";
import type { GameState, OpportunityKey } from "../src/sim/types";

/** Arrange a discovered leaf without manufacturing survivor deeds. */
export function reveal(state: GameState, keys: readonly OpportunityKey[]): void {
  refreshOpportunities(state);
  for (const key of keys) discoverOpportunity(state.opportunities, key, state.minute);
}
