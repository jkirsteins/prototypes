import { canAnswer, canLead } from "./legality";
import { cardById } from "./content/cards";
import { NOT_YET_ID } from "./content/cards-convict";
import type { CardDef, GameState } from "./types";

export function chooseConvictLead(state: GameState): string | null {
  for (const id of state.convictPile.hand) {
    if (canLead(state, "convict", cardById(id)).ok) return id;
  }
  return null;
}

export function chooseConvictAnswer(state: GameState, lead: CardDef): string | null {
  const candidates = state.notYetSpent
    ? state.convictPile.hand
    : [NOT_YET_ID, ...state.convictPile.hand];
  for (const id of candidates) {
    if (canAnswer(state, "convict", cardById(id), lead).ok) return id;
  }
  return null;
}
