export interface CardDef {
  id: string;
  name: string;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow crops" },
};

export const DECK_SIZE = 20;

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

export function buildDeck(): string[] {
  return Array.from({ length: DECK_SIZE }, () => "grow-crops");
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
