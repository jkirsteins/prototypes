import { ACQUIRABLE_CARDS, CARDS, RARITY_TIERS } from "./cards";

/** Paints a card element's tier band.
 *
 *  One helper rather than three call sites each reaching into RARITY_TIERS,
 *  for the reason CLAUDE.md records about `cardName` being written twice: a
 *  colour spelled in three files follows a rename in none of them. The colour
 *  travels as a custom property so `src/style.css` needs one rule for every
 *  tier, present and future.
 *
 *  A card outside the pack pool gets no band. Rarity says how a card is
 *  acquired, and Grow turnips, the tribute cards and Revolt are never drawn. */
export function applyRarityBand(el: HTMLElement, cardId: string): void {
  if (!ACQUIRABLE_CARDS.includes(cardId)) return;
  const tier = RARITY_TIERS.find((t) => t.id === CARDS[cardId]?.rarity);
  if (tier === undefined) return;
  el.classList.add("rarity-band");
  el.style.setProperty("--rarity", tier.colour);
}
