import { shuffle } from "./rng";
import type { Pile, RngState } from "./types";

export function newPile(deckIds: readonly string[], rng: RngState): Pile {
  return { deck: shuffle(rng, deckIds), discard: [], hand: [] };
}

export function drawCard(pile: Pile, rng: RngState): string | null {
  if (pile.deck.length === 0) {
    if (pile.discard.length === 0) return null;
    pile.deck = shuffle(rng, pile.discard);
    pile.discard = [];
  }
  const card = pile.deck.shift();
  if (card === undefined) return null;
  pile.hand.push(card);
  return card;
}

export function removeFromHand(pile: Pile, cardId: string): void {
  const index = pile.hand.indexOf(cardId);
  if (index === -1) throw new Error(`Card ${cardId} is not in hand`);
  pile.hand.splice(index, 1);
}

export function discardCard(pile: Pile, cardId: string): void {
  removeFromHand(pile, cardId);
  pile.discard.push(cardId);
}
