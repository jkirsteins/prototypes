export interface CardDef {
  id: string;
  name: string;
  targeted: boolean;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow crops", targeted: false },
  "raid": { id: "raid", name: "Raid", targeted: true },
  "shrewd-marriage": { id: "shrewd-marriage", name: "Shrewd marriage", targeted: true },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true },
};

export const DECK_SIZE = 20;

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

const DECK_COMPOSITION: [string, number][] = [
  ["grow-crops", 10],
  ["raid", 5],
  ["shrewd-marriage", 3],
  ["incorporate", 2],
];

export function buildDeck(): string[] {
  return DECK_COMPOSITION.flatMap(([id, n]) =>
    Array.from({ length: n }, () => id),
  );
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
