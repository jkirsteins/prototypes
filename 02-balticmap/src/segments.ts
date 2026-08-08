/** A run of player-facing prose. Card and faction names are nodes, never
 *  text - see the naming rule in AGENTS.md.
 *
 *  A leaf module with no imports, so `cards.ts` can author segments in card
 *  definitions while `rich-text.ts` (which imports CARDS to resolve names)
 *  renders them - importing the constructors from rich-text there would be a
 *  cycle that hits the TDZ on `t` during CARDS init. */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "card"; cardId: string }
  | { kind: "faction"; factionId: string; article?: true };

export const t = (text: string): Segment => ({ kind: "text", text });
export const card = (cardId: string): Segment => ({ kind: "card", cardId });
export const faction = (factionId: string): Segment => ({ kind: "faction", factionId });
/** "the Selonians", but "Lietuva" for the one faction named for a land.
 *  Mid-sentence only - write lines so a faction never opens a sentence. */
export const theFaction = (factionId: string): Segment =>
  ({ kind: "faction", factionId, article: true });
