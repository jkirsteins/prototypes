import { cardById, cardNameInProse } from "./content/cards";
import { snapshot } from "./vitals";
import type { EventPiles, GameEvent, EventKind, GameState, Side } from "./types";

export function actorName(side: Side | "system"): string {
  if (side === "player") return "You";
  if (side === "convict") return "The Convict";
  return "";
}

/** Copies the hand so a later mutation cannot rewrite history. */
function pilesOf(state: GameState): EventPiles {
  return {
    player: {
      deck: state.playerPile.deck.length,
      discard: state.playerPile.discard.length,
      hand: [...state.playerPile.hand],
    },
    convict: {
      deck: state.convictPile.deck.length,
      discard: state.convictPile.discard.length,
      hand: state.convictPile.hand.length,
    },
  };
}

export function push(
  state: GameState,
  entry: Omit<GameEvent, "turn" | "vitals" | "piles">,
): void {
  state.log.push({
    ...entry,
    turn: state.turn,
    vitals: snapshot(state),
    piles: pilesOf(state),
  });
}

export function logCard(
  state: GameState,
  side: Side,
  kind: "lead" | "answer",
  cardId: string,
  deltas: string[],
): void {
  const card = cardById(cardId);
  push(state, {
    side,
    kind,
    cardId,
    text: `${actorName(side)} play${side === "player" ? "" : "s"} ${cardNameInProse(card.name)}. ${card.narration}`,
    deltas,
  });
}

export function logNote(
  state: GameState,
  side: Side | "system",
  kind: EventKind,
  text: string,
  deltas: string[] = [],
): void {
  push(state, { side, kind, text, deltas });
}

/** Structural marker: opens a turn. The UI uses these as segment boundaries
 *  and as the source of the turn banner, so one must be emitted at the top of
 *  every turn on both sides, after the turn counter increments. */
export function logTurn(state: GameState, side: Side): void {
  logNote(state, side, "turn", side === "player" ? "Your turn." : "His turn.");
}

export function logDraw(state: GameState, side: Side, cardId: string): void {
  push(state, {
    side,
    kind: "draw",
    cardId,
    text: side === "player" ? "You draw a card." : "He draws a card.",
    deltas: [],
  });
}

export function logReshuffle(state: GameState, side: Side): void {
  logNote(
    state,
    side,
    "reshuffle",
    side === "player" ? "You shuffle what you have left." : "He shuffles his hand back together.",
  );
}
