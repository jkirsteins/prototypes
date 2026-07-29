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
  /** One-line rules text shown to the player. */
  text: string;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow potatoes", targeted: false, maxPerDeck: null, deckBuildable: true, forced: false, text: "No effect - a quiet season. Fills out the deck." },
  "raid": { id: "raid", name: "Raid", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Gain +1 Might over one faction in reach for each of your lands on their border." },
  "shrewd-marriage": { id: "shrewd-marriage", name: "Shrewd marriage", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Gain +1 Status over one faction in reach; your overlord is always courtable." },
  "fortify": { id: "fortify", name: "Fortify", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Gain +1 Might over every other living faction at once." },
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Turn a faction in reach into your vassal. Needs a lead of 2 per land of their realm. Vassals pay tribute." },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Permanently absorb one of your vassals into your realm." },
  "reclaim-independence": { id: "reclaim-independence", name: "Reclaim independence", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Cast off your overlord. Playable while their lead in Might and Status is under 2 per land of their other holdings." },
  "pay-tribute": { id: "pay-tribute", name: "Pay tribute", targeted: false, maxPerDeck: null, deckBuildable: false, forced: true, text: "Forced: while a vassal, grant your overlord +1 Might or +1 Status." },
  "revolt": { id: "revolt", name: "Revolt", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Cast off your overlord, no lead required. They lose 1 Might and 1 Status against you." },
  "assassinate-ruler": { id: "assassinate-ruler", name: "Assassinate ruler", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Even the score: the Status lead between you and one faction in reach resets to none." },
  "alliance": { id: "alliance", name: "Alliance", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Seal a pact with one faction in reach: no hostile cards between you for 5 turns." },
  "extended-diplomacy": { id: "extended-diplomacy", name: "Extended diplomacy", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Patient envoys: your next Alliance lasts twice as long." },
  "bodyguard": { id: "bodyguard", name: "Bodyguard", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Post a bodyguard: the next Assassinate ruler against you fails. No stacking." },
  "favourable-omens": { id: "favourable-omens", name: "Favourable omens", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "The signs are read: your next Might or Status gain counts double." },
};

/** Cards a Favourable omens reading doubles. Everything else resolves as
 *  normal and leaves the reading in reserve, so a reading is never spent on a
 *  card with no number to double. Pay tribute is deliberately included: a
 *  reading held while subjugated costs you, which is what stops the card from
 *  being free to sit on. */
export const DOUBLABLE_CARDS: ReadonlySet<string> = new Set([
  "raid", "shrewd-marriage", "fortify", "revolt", "pay-tribute",
]);

export const DECK_SIZE = 10;

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** The default (and AI) deck: every deck-buildable non-basic once,
 *  grow-crops filling the remaining slots. */
export function buildDeck(): string[] {
  const nonBasics = Object.values(CARDS)
    .filter((c) => c.deckBuildable && c.maxPerDeck !== null)
    .map((c) => c.id);
  const picked = nonBasics.slice(0, DECK_SIZE);
  return [
    ...picked,
    ...Array.from({ length: DECK_SIZE - picked.length }, () => "grow-crops"),
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
