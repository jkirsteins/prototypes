import { BUILDS, CARDS, type Rng, type Strategy } from "./cards";
import type { PlayerState } from "./game";

/** The Turnip harvest: five ways to spend it, three of which grant a card.
 *
 *  - `growth` grows a land - the card that raises a ceiling.
 *  - `build` takes a card from the seat's OWN build, chosen by name. The
 *    build's cards only: the harvest is how a build deepens, and offering the
 *    neutrals here made every seat's deck converge on the same pile.
 *  - `random` takes one card from everything the game knows, sight unseen.
 *
 *  - `destroy` burns one card out of the seat's own piles for good.
 *  - `skip` takes nothing, which is a real answer when every card on offer
 *    would only dilute a deck that is already drawing what it wants. */
export type HarvestChoice =
  | { kind: "growth" }
  | { kind: "build"; cardId: string }
  | { kind: "random" }
  /** Burn a card out of the deck for good. A deck this small draws its best
   *  card sooner for every card that is not in it, so thinning is a real use
   *  of a harvest and not a consolation prize. */
  | { kind: "destroy"; cardId: string }
  | { kind: "skip" };

/** The card `growth` grants. Named here rather than at the call site so the
 *  offer, the resolution and the AI all mean the same card. */
export const GROWTH_CARD = "prosperous-proliferation";

/** Copies of `cardId` across a seat's piles - deck, hand and discard. The
 *  piles only cycle, so this is the whole count. */
function copiesOf(player: PlayerState, cardId: string): number {
  return [...player.deck, ...player.hand, ...player.discard]
    .filter((c) => c === cardId).length;
}

const underCap = (player: PlayerState, cardId: string): boolean => {
  const cap = CARDS[cardId]?.maxPerDeck;
  return cap === null || cap === undefined || copiesOf(player, cardId) < cap;
};

/** The build cards this seat may still take, in build order. */
export function buildOffer(player: PlayerState): string[] {
  return BUILDS[player.strategy].filter((id) => underCap(player, id));
}

/** Everything the game knows that this seat may still take - what `random`
 *  draws from. Deck-buildable only: the injection-only cards (tribute, the
 *  harvest itself) are not cards anybody may be handed. */
export function randomPool(player: PlayerState): string[] {
  return Object.values(CARDS)
    .filter((c) => c.deckBuildable && underCap(player, c.id))
    .map((c) => c.id);
}

/** The card a choice actually grants, or null when there is nothing left to
 *  give. EXACTLY one rng draw on the random path and none on any other, so a
 *  seeded run's stream depends on what was chosen and not on what was
 *  offered. */
export function harvestCard(
  player: PlayerState, choice: HarvestChoice, rng: Rng,
): string | null {
  if (choice.kind === "skip" || choice.kind === "destroy") return null;
  if (choice.kind === "growth") return GROWTH_CARD;
  if (choice.kind === "build") {
    return buildOffer(player).includes(choice.cardId) ? choice.cardId : null;
  }
  const pool = randomPool(player);
  const draw = rng();
  return pool.length === 0 ? null : pool[Math.floor(draw * pool.length)];
}

/** Every card the seat holds anywhere, deduplicated and in a stable order -
 *  what `destroy` may be aimed at. The tribute cards are excluded: they are
 *  injected by a vassalage and stripped by its end, and burning one would be
 *  a way to duck a demand the rules mean to be forced. */
export function destroyOffer(player: PlayerState): string[] {
  const held = [...player.deck, ...player.hand, ...player.discard];
  return [...new Set(held)].filter((id) => CARDS[id]?.forced !== true).sort();
}

/** Each strategy's pick order for a choiceless harvest, most wanted first.
 *  Only the build's own cards appear: those are the only ones a `build` choice
 *  can take, and the AI always takes one where it can. */
export const HARVEST_PRIORITY: Record<Strategy, readonly string[]> = {
  warpath: [
    "war-council", "strong-raid", "favourable-omens", "great-raid",
    "strong-fortify",
  ],
  pestilence: [
    "plague", "spread-disease", "localized-outbreak", "miasma", "foul-winds",
  ],
};

/** Copies of a build card an AI seat wants before it starts looking outside
 *  its build. One: deepening is what the build is for, but a seat that only
 *  ever deepened could never hold a neutral card at all. */
export const HARVEST_BUILD_COPIES = 1;

/** A choiceless play's pick - the sim, a `turns=` fast-forward, an AI seat.
 *  Deepen, then broaden, then grow: the highest-ranked build card it does not
 *  yet hold; failing that a card from everything the game knows; failing that
 *  a land, which is never capped and so never comes back with nothing.
 *
 *  The middle step is not a nicety. `random` is the ONLY route to
 *  `NEUTRAL_POOL`, and a policy that never took it left six cards -
 *  Incorporate, Assassinate ruler, Bodyguard, Found a settlement, Hillfort,
 *  Harvest feast - unable to reach four seats in five. No rival could annex,
 *  and the player could never learn those cards by witnessing one.
 *
 *  No rng: which option an AI takes is a decision. The draw that picks WHICH
 *  neutral belongs to `harvestCard`, where a seeded run can account for it. */
export function autoHarvestChoice(player: PlayerState): HarvestChoice {
  const rank = (id: string): number => {
    const i = HARVEST_PRIORITY[player.strategy].indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const best = buildOffer(player)
    .filter((id) => copiesOf(player, id) < HARVEST_BUILD_COPIES)
    .sort((a, b) => rank(a) - rank(b))[0];
  if (best !== undefined) return { kind: "build", cardId: best };
  if (randomPool(player).length > 0) return { kind: "random" };
  return { kind: "growth" };
}
