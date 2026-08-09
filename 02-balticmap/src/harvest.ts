import { BUILDS, CARDS, NEUTRAL_POOL, type Rng, type Strategy } from "./cards";
import type { PlayerState } from "./game";

/** The Turnip harvest pick: keep one offered card - shuffled into the deck
 *  permanently - or skip and gain nothing. Skipping is a real choice: it
 *  keeps the deck lean. */
export type HarvestChoice = { cardId: string } | { skip: true };

/** The seat's harvest pool: its build's cards plus the deck-buildable
 *  neutrals, minus anything whose copies across deck, hand and discard have
 *  reached `maxPerDeck` (null = uncapped). Scanning all three piles is
 *  enough because the piles only cycle - nothing but the vassalage strips
 *  ever removes a card, and those remove only injected tribute. */
export function harvestPool(player: PlayerState): string[] {
  const held = [...player.deck, ...player.hand, ...player.discard];
  const copiesOf = (id: string): number =>
    held.filter((c) => c === id).length;
  return [...BUILDS[player.strategy], ...NEUTRAL_POOL].filter((id) => {
    const cap = CARDS[id]?.maxPerDeck;
    return cap === null || cap === undefined || copiesOf(id) < cap;
  });
}

/** Three distinct cards from the pool, uniform without replacement - EXACTLY
 *  three rng draws whatever the pool holds, the constant-draw pattern the old
 *  boon roll kept, so a short pool cannot shift a seeded stream. A pool
 *  shorter than three offers what exists. */
export function rollHarvestOffer(player: PlayerState, rng: Rng): string[] {
  const pool = harvestPool(player);
  const offer: string[] = [];
  for (let slot = 0; slot < 3; slot++) {
    const draw = rng();
    if (pool.length === 0) continue;
    const picked = Math.floor(draw * pool.length);
    offer.push(pool[picked]);
    pool.splice(picked, 1);
  }
  return offer;
}

/** Each strategy's pick order for a choiceless harvest, most wanted first.
 *  Subjugate is taken first by either strategy while none is in the piles -
 *  `harvestPool` has already dropped it when one is - and the heal cards
 *  outrank the remaining neutrals, matching policy step 5's heal-toward-a-
 *  gate priority. */
export const HARVEST_PRIORITY: Record<Strategy, readonly string[]> = {
  warpath: [
    "subjugate", "war-council", "raid", "favourable-omens", "great-raid",
    "fortify", "hillfort", "harvest-feast", "incorporate", "assassinate-ruler",
    "bodyguard", "found-settlement",
  ],
  pestilence: [
    "subjugate", "spread-disease", "plague", "localized-outbreak", "miasma",
    "foul-winds", "hillfort", "harvest-feast", "incorporate",
    "assassinate-ruler", "bodyguard", "found-settlement",
  ],
};

/** A choiceless play's pick - the sim, a `turns=` fast-forward, an AI seat.
 *  Rolls the same three slots (same three draws) and keeps the offered card
 *  its strategy ranks highest. Skips only when the offer is empty, which is
 *  the every-offer-at-cap case the design doc names. */
export function autoHarvestChoice(
  player: PlayerState,
  rng: Rng,
): HarvestChoice {
  const offer = rollHarvestOffer(player, rng);
  if (offer.length === 0) return { skip: true };
  const rank = (id: string): number => {
    const i = HARVEST_PRIORITY[player.strategy].indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const best = [...offer].sort((a, b) => rank(a) - rank(b))[0];
  return { cardId: best };
}
