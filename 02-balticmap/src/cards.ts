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
  "grow-crops": { id: "grow-crops", name: "Grow crops", targeted: false, maxPerDeck: null, deckBuildable: true, forced: false, text: "No effect - a quiet season. Fills out the deck." },
  "raid": { id: "raid", name: "Raid", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Gain +1 Might over one faction in reach of your realm." },
  "shrewd-marriage": { id: "shrewd-marriage", name: "Shrewd marriage", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Gain +1 Status over one faction in reach; your overlord is always courtable." },
  "fortify": { id: "fortify", name: "Fortify", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Gain +1 Might over every other living faction at once." },
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Turn a faction in reach into your vassal. Needs a lead of 2 in Might or Status. Vassals pay tribute." },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Permanently absorb one of your vassals into your realm." },
  "reclaim-independence": { id: "reclaim-independence", name: "Reclaim independence", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false, text: "Cast off your overlord. Playable while their lead in Might and Status is both under 2." },
  "pay-tribute": { id: "pay-tribute", name: "Pay tribute", targeted: false, maxPerDeck: null, deckBuildable: false, forced: true, text: "Forced: while a vassal, grant your overlord +1 Might or +1 Status." },
};

export const DECK_SIZE = 10;

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** The default (and AI) deck: every deck-buildable non-basic once,
 *  grow-crops filling the remaining slots. */
export function buildDeck(): string[] {
  const nonBasics = Object.values(CARDS)
    .filter((c) => c.deckBuildable && c.maxPerDeck !== null)
    .map((c) => c.id);
  return [
    ...nonBasics,
    ...Array.from({ length: DECK_SIZE - nonBasics.length }, () => "grow-crops"),
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
