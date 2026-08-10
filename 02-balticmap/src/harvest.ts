import {
  BUILDS, CARDS, LADDER_DEPTH, type Rng, type Strategy, type UpgradeCost,
  upgradeCostOf, upgradesInto,
} from "./cards";
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

/** Whether the seat holds the copies `cardId` costs. A free card is always
 *  affordable, which is most of them. */
export function canAfford(player: PlayerState, cardId: string): boolean {
  const cost = upgradeCostOf(cardId);
  return cost === null || copiesOf(player, cost.from) >= cost.count;
}

/** One row of the build as the player reads it: the card, its price, what the
 *  seat holds of that price, and whether the price is met.
 *
 *  A row the seat cannot pay for is still a ROW. The harvest offer is the only
 *  route by which a player learns a card exists, so a Great raid hidden until
 *  two Strong raids happen to be in hand is a card most runs never mention. */
export interface BuildOption {
  cardId: string;
  cost: UpgradeCost | null;
  /** Copies of `cost.from` the seat holds; 0 on a free card. */
  held: number;
  affordable: boolean;
}

/** The whole of this seat's build, in build order, priced - what the picker
 *  renders. Cap is the one thing that removes a row: a card the seat may never
 *  hold another of is not a decision waiting on a price. */
export function buildListing(player: PlayerState): BuildOption[] {
  return BUILDS[player.strategy]
    .filter((id) => underCap(player, id))
    .map((cardId) => {
      const cost = upgradeCostOf(cardId);
      return {
        cardId,
        cost,
        held: cost === null ? 0 : copiesOf(player, cost.from),
        affordable: canAfford(player, cardId),
      };
    });
}

/** The build cards this seat may actually TAKE, in build order: under cap and
 *  paid for. Both the resolution (`harvestCard`) and the multiplayer validator
 *  gate on this, so an unaffordable pick is refused wherever it arrives from. */
export function buildOffer(player: PlayerState): string[] {
  return buildListing(player).filter((o) => o.affordable).map((o) => o.cardId);
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

/** A seat's three piles by name - what `removeCopies` searches, in the order
 *  its caller names them. */
export type Pile = "deck" | "hand" | "discard";

/** The order a BURNED card is hunted for: the copies are identical, and
 *  hunting for a particular one would be a distinction the player cannot see.
 *  Deck first because that is where most of a small deck sits. */
export const BURN_ORDER: readonly Pile[] = ["deck", "hand", "discard"];

/** The order a card SPENT on an upgrade is taken from: what is already spent
 *  goes first, and a card is taken out of the player's hand only when the other
 *  two piles are dry. Paying with the card somebody was about to play is the
 *  one way this trade can feel like a theft. */
export const SPEND_ORDER: readonly Pile[] = ["discard", "deck", "hand"];

/** Takes up to `count` copies of `cardId` out of the seat's piles, each from
 *  the first pile in `order` that still holds one, and says how many it found.
 *  The removed cards are gone: no discard, no reshuffle, they leave the game.
 *
 *  `removed < count` is the caller's problem to notice. Both callers check
 *  affordability first, and neither should paper over a short payment. */
export function removeCopies(
  player: PlayerState,
  cardId: string,
  count: number,
  order: readonly Pile[],
): { player: PlayerState; removed: number } {
  let out = player;
  let removed = 0;
  while (removed < count) {
    const pile = order.find((p) => out[p].includes(cardId));
    if (pile === undefined) break;
    const at = out[pile].indexOf(cardId);
    out = { ...out, [pile]: out[pile].filter((_, i) => i !== at) };
    removed += 1;
  }
  return { player: out, removed };
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
 *  can take, and the AI always takes one where it can.
 *
 *  A priced card is named at the rank the SEAT wants it, not at the rank it can
 *  pay for it - the walk below drops to its currency on its own. */
export const HARVEST_PRIORITY: Record<Strategy, readonly string[]> = {
  warpath: [
    "war-council", "strong-raid", "favourable-omens", "great-raid",
    "strong-fortify", "raid", "fortify",
  ],
  pestilence: [
    "plague", "spread-disease", "localized-outbreak", "miasma", "foul-winds",
  ],
};

/** Copies of a build card an AI seat wants before it starts looking outside
 *  its build. One: deepening is what the build is for, but a seat that only
 *  ever deepened could never hold a neutral card at all. */
export const HARVEST_BUILD_COPIES = 1;

/** Whether the seat is done wanting `cardId` - it holds one, or it holds
 *  something further up the ladder that this card was SPENT on.
 *
 *  The second half is what stops the walk from buying its own currency back
 *  forever. A seat that turned four Raids into a Great raid holds no Raid and
 *  no Strong raid, and a policy reading only the count would set out to rebuild
 *  both, every harvest, and never look at a neutral card again. */
function heldOrSuperseded(player: PlayerState, cardId: string): boolean {
  let id: string | null = cardId;
  for (let rung = 0; id !== null && rung < LADDER_DEPTH; rung++) {
    if (copiesOf(player, id) >= HARVEST_BUILD_COPIES) return true;
    id = upgradesInto(id);
  }
  return false;
}

/** What to buy TOWARDS `cardId`: the card itself where the seat can pay for
 *  it, otherwise the currency it is bought with, and so on down. The bottom
 *  rung is free, so the walk always lands on something. */
function nextPurchase(player: PlayerState, cardId: string): string {
  let id = cardId;
  for (let rung = 0; rung < LADDER_DEPTH; rung++) {
    const cost = upgradeCostOf(id);
    if (cost === null || canAfford(player, id)) return id;
    id = cost.from;
  }
  return id;
}

/** A choiceless play's pick - the sim, a `turns=` fast-forward, an AI seat.
 *  Deepen, then broaden, then grow: the highest-ranked build card it does not
 *  yet hold; failing that a card from everything the game knows; failing that
 *  a land, which is never capped and so never comes back with nothing.
 *
 *  Deepening now CLIMBS. The card it wants may carry a price it cannot pay, in
 *  which case the pick is the currency instead and the same want brings it back
 *  next harvest - four Raids into two Strong raids into one Great raid, over
 *  three harvests, with nothing else deciding it.
 *
 *  The middle step is not a nicety. `random` is the ONLY route to
 *  `NEUTRAL_POOL`, and a policy that never took it left six cards -
 *  Incorporate, Assassinate ruler, Bodyguard, Found a settlement, Hillfort,
 *  Harvest feast - unable to reach four seats in five. No rival could annex,
 *  and the player could never learn those cards by witnessing one. The ladder
 *  must not eat it: a seat reaches the top of its build in about six harvests
 *  and broadens from then on, which is what `heldOrSuperseded` buys.
 *
 *  No rng: which option an AI takes is a decision. The draw that picks WHICH
 *  neutral belongs to `harvestCard`, where a seeded run can account for it. */
export function autoHarvestChoice(player: PlayerState): HarvestChoice {
  const want = HARVEST_PRIORITY[player.strategy]
    .filter((id) => underCap(player, id))
    .find((id) => !heldOrSuperseded(player, id));
  if (want !== undefined) {
    const buy = nextPurchase(player, want);
    if (buildOffer(player).includes(buy)) return { kind: "build", cardId: buy };
  }
  if (randomPool(player).length > 0) return { kind: "random" };
  return { kind: "growth" };
}
