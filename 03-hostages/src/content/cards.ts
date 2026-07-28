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

/**
 * A card's `name` is a standalone title. Some names (the "secret" cards) are
 * themselves complete quoted sentences ending in a period inside the closing
 * quote, e.g. `"The safe is behind the headboard."`. Interpolating a name
 * like that mid-sentence produces a doubled full stop: `play "...". You...`.
 *
 * This returns the name transformed so it is safe to interpolate into prose:
 * the sentence-ending period just inside the closing quote is dropped, and
 * the closing quote itself is preserved. It is a no-op for every ordinary
 * card name that does not end in `."`.
 */
export function cardNameInProse(name: string): string {
  return name.endsWith('."') ? name.slice(0, -2) + '"' : name;
}

export { PLAYER_CARDS, PLAYER_DECK, SECRETS, VICTORY_CARD_ID } from "./cards-player";
export { CONVICT_CARDS, CONVICT_DECK, NOT_YET_ID } from "./cards-convict";
