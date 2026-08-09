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
  | { kind: "faction"; factionId: string; article?: true }
  /** A land's passive status (src/passives.ts). Renders as its NAME alone,
   *  with the rule on the hover: a status is a standing property somebody may
   *  have to reason about several lines into a tooltip, and spelling out what
   *  each one does every time it is mentioned would bury the land it is
   *  about. */
  | { kind: "passive"; passiveId: string }
  /** A leader's standing ability (src/abilities.ts). The `passive` shape for
   *  the same reason: the name is the node, the rule waits on its hover. */
  | { kind: "ability"; abilityId: string }
  /** A KEYWORD (src/cards.ts), not one of the cards carrying it. Renders as
   *  the keyword's common noun, so "your next raid card" is one hoverable word
   *  rather than a list of the cards it happens to cover today - which is what
   *  a keyword is for. */
  | { kind: "keyword"; keywordId: string };

export const t = (text: string): Segment => ({ kind: "text", text });
export const card = (cardId: string): Segment => ({ kind: "card", cardId });
export const passive = (passiveId: string): Segment =>
  ({ kind: "passive", passiveId });

export const ability = (abilityId: string): Segment =>
  ({ kind: "ability", abilityId });

export const keyword = (keywordId: string): Segment =>
  ({ kind: "keyword", keywordId });
export const faction = (factionId: string): Segment => ({ kind: "faction", factionId });
/** "the Selonians", but "Lietuva" for the one faction named for a land.
 *  Mid-sentence only - write lines so a faction never opens a sentence. */
export const theFaction = (factionId: string): Segment =>
  ({ kind: "faction", factionId, article: true });
