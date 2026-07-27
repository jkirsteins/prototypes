import type { CardDef } from "../types";
import { PLAYER_CARDS } from "./cards-player";
import { CONVICT_CARDS } from "./cards-convict";

export const ALL_CARDS: CardDef[] = [...PLAYER_CARDS, ...CONVICT_CARDS];

const BY_ID = new Map<string, CardDef>(ALL_CARDS.map((card) => [card.id, card]));

export function cardById(id: string): CardDef {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export { PLAYER_CARDS, PLAYER_DECK, SECRETS, VICTORY_CARD_ID } from "./cards-player";
export { CONVICT_CARDS, CONVICT_DECK, NOT_YET_ID } from "./cards-convict";
