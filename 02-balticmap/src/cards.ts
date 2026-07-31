/** Pack draw tier. Only "common" is populated today - rare and epic exist so
 *  the weighting machinery is real, and assigning cards to them is a separate
 *  balance pass. See the 2026-07-31 card-acquisition design doc. */
export type CardRarity = "common" | "rare" | "epic";

export interface CardDef {
  id: string;
  name: string;
  targeted: boolean;
  /** Copies allowed per deck; null = unlimited (basic filler). */
  maxPerDeck: number | null;
  /** May appear in a built deck. Pay Tribute is injection-only. */
  deckBuildable: boolean;
  /** While in hand, it is the only playable card. */
  forced: boolean;
  /** Pack draw tier. Every card is "common" today; see CardRarity. */
  rarity: CardRarity;
  /** One-line rules text shown to the player. */
  text: string;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow turnips", targeted: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "No effect - a quiet season. Fills out the deck." },
  "raid": { id: "raid", name: "Raid", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Gain Might over one faction in reach: +1 for your first land on their border, +2 for the second, +3 for the third, and so on." },
  "shrewd-marriage": { id: "shrewd-marriage", name: "Shrewd marriage", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Gain +1 Status over one faction in reach; your overlord is always courtable." },
  "fortify": { id: "fortify", name: "Fortify", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Gain +1 Might over every other living faction at once." },
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Turn a faction in reach into your vassal. Needs a lead of 2 per land of their realm. Vassals pay tribute." },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Permanently absorb one of your vassals into your realm." },
  "pay-tribute": { id: "pay-tribute", name: "Pay tribute", targeted: false, maxPerDeck: null, deckBuildable: false, forced: true, rarity: "common", text: "Forced: while a vassal, grant your overlord +1 Might or +1 Status." },
  "seeds-of-revolt": { id: "seeds-of-revolt", name: "Seeds of revolt", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "While a vassal: shuffle a Revolt into your deck. Only one Revolt at a time." },
  "revolt": { id: "revolt", name: "Revolt", targeted: false, maxPerDeck: 1, deckBuildable: false, forced: false, rarity: "common", text: "Cast off your overlord, no lead required. They lose 1 Might and 1 Status against you. Leaves your deck for good." },
  "assassinate-ruler": { id: "assassinate-ruler", name: "Assassinate ruler", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Even the score: the Status lead between you and one faction in reach resets to none." },
  "alliance": { id: "alliance", name: "Alliance", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Seal a pact with one faction in reach: no hostile cards between you for 5 turns." },
  "extended-diplomacy": { id: "extended-diplomacy", name: "Extended diplomacy", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Patient envoys: your next Alliance lasts twice as long." },
  "bodyguard": { id: "bodyguard", name: "Bodyguard", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Post a bodyguard: the next Assassinate ruler against you fails. No stacking." },
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "The signs are read: your next Might or Status gain counts double." },
  "found-settlement": { id: "found-settlement", name: "Found a settlement", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Settle the free site in one land of your realm. Each settlement adds +1 to the lead others need to subjugate you." },
};

/** Cards a Favourable omens reading doubles. Everything else resolves as
 *  normal and leaves the reading in reserve, so a reading is never spent on a
 *  card with no number to double. Pay tribute is deliberately included: a
 *  reading held while subjugated costs you, which is what stops the card from
 *  being free to sit on. */
export const DOUBLABLE_CARDS: ReadonlySet<string> = new Set([
  "raid", "shrewd-marriage", "fortify", "revolt", "pay-tribute",
]);

/** Cards the player knows from their very first game. Everything else in the
 *  roster is earned from packs. Raid, Subjugate and Fortify together cover the
 *  three verbs the game is about - hit someone, take someone, hold everyone -
 *  so a first run is a real game rather than ten turns of turnips.
 *
 *  Seeds of revolt is here for a different reason: it is the only route to a
 *  Revolt, and a Revolt is the only way a vassal frees itself. Pack-locking it
 *  meant a first-run player fell into vassalage around turn 6 (measured by the
 *  `new-player-potatoes` scenario) with no counterplay available to them at
 *  all, and now that a dead vassalage ends the run outright (see `isStranded`
 *  in src/game.ts) that would have been a locked door rather than a decision.
 *  It stays an ordinary optional pick: leaving it out of your ten is allowed,
 *  and being stranded is then what you chose. */
export const STARTING_KNOWN_CARDS: string[] = [
  "raid", "subjugate", "fortify", "seeds-of-revolt",
];

/** The pack pool: every deck-buildable non-basic you do not start with, in
 *  stable CARDS order. Grow turnips stays free filler outside the pool; Revolt
 *  and Pay tribute are injection-only and excluded by `deckBuildable`. */
export const ACQUIRABLE_CARDS: string[] = Object.values(CARDS)
  .filter(
    (c) =>
      c.deckBuildable &&
      c.maxPerDeck !== null &&
      !STARTING_KNOWN_CARDS.includes(c.id),
  )
  .map((c) => c.id);

export const DECK_SIZE = 10;

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** The deck the deck screen offers by default and the `full` simulation arm
 *  plays. Explicit rather than "the first DECK_SIZE entries of CARDS", because
 *  that made the declaration order of CARDS silently decide the default deck -
 *  which is how Favourable omens ended up absent from it: it was appended
 *  last in CARDS so that the old slice-based buildDeck() would not change,
 *  which also kept it out of the default deck entirely. See the 2026-07-29
 *  scaling-might design doc's correction section for the measured effect.
 *
 *  Do NOT reorder CARDS to "fix" this list matching CARDS order, and do not
 *  reorder CARDS for any other tidiness reason either: buildAiDeck() rolls
 *  `nonBasics.filter(() => rng() < 0.5)`, consuming one rng draw per entry in
 *  CARDS's declaration order, so reordering CARDS changes which card each
 *  draw maps to and silently moves every committed AI-deck band.
 *
 *  The grow-crops slot the Reclaim cut left behind now holds Found a
 *  settlement: a default deck that offers a do-nothing card where a real
 *  choice fits was a hole, not a design.
 *
 *  Revolt is no longer here: it is injection-only, like Pay tribute. Seeds of
 *  revolt takes its deck slot and injects the Revolt itself. Note that swapping
 *  one deck-buildable non-basic for another keeps `buildAiDeck`'s rng draw
 *  count identical, so committed AI-deck bands do not move. */
export const DEFAULT_DECK: string[] = [
  "raid", "shrewd-marriage", "fortify", "subjugate", "incorporate",
  "found-settlement", "seeds-of-revolt", "assassinate-ruler", "alliance",
  "favourable-omens",
];

/** The default (and human "full") deck: DEFAULT_DECK, padded with grow-crops
 *  if it is ever shorter than DECK_SIZE. The padding is a preserved invariant,
 *  not an assumption - DEFAULT_DECK is currently exactly DECK_SIZE long. */
export function buildDeck(): string[] {
  return [
    ...DEFAULT_DECK,
    ...Array.from(
      { length: Math.max(0, DECK_SIZE - DEFAULT_DECK.length) },
      () => "grow-crops",
    ),
  ];
}

/** Cards every enemy deck carries. A world where nobody holds Subjugate lets
 *  a passive player sit undisturbed for tens of turns; since falling is how a
 *  new player discovers the rest of the deck, sitting undisturbed is the worst
 *  outcome. Measured effect: see the 2026-07-29 new-player simulation spec. */
export const AI_DECK_GUARANTEED = ["subjugate", "raid"];

/** Randomized AI deck: every card in `guaranteed` plus each remaining
 *  deck-buildable non-basic at probability 0.5 (rolled per card, in stable
 *  CARDS order so a seeded rng is deterministic), grow-crops filling the rest.
 *
 *  Guaranteed ids are listed first so the DECK_SIZE cap can never drop one.
 *  Every non-basic is still rolled for, guaranteed or not, so a given seed
 *  consumes the same rng values whatever the guarantee list is and simulation
 *  arms stay comparable. Pass [] for the unarmed deck. */
export function buildAiDeck(
  rng: Rng,
  guaranteed: string[] = AI_DECK_GUARANTEED,
): string[] {
  const nonBasics = Object.values(CARDS)
    .filter((c) => c.deckBuildable && c.maxPerDeck !== null)
    .map((c) => c.id);
  const rolled = nonBasics.filter(() => rng() < 0.5);
  const forced = nonBasics.filter((id) => guaranteed.includes(id));
  const included = [
    ...forced,
    ...rolled.filter((id) => !forced.includes(id)),
  ].slice(0, DECK_SIZE);
  return [
    ...included,
    ...Array.from({ length: DECK_SIZE - included.length }, () => "grow-crops"),
  ];
}

/** Fisher-Yates; returns a new array, input untouched. */
export function shuffle(cards: string[], rng: Rng): string[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
