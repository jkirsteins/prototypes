import { cardById } from "./content/cards";
import type { GameState, LogEntry, LogKind, Side } from "./types";

export function actorName(side: Side | "system"): string {
  if (side === "player") return "You";
  if (side === "convict") return "The Convict";
  return "";
}

export function push(state: GameState, entry: Omit<LogEntry, "turn">): void {
  state.log.push({ ...entry, turn: state.turn });
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
    text: `${actorName(side)} play${side === "player" ? "" : "s"} ${card.name}. ${card.narration}`,
    deltas,
  });
}

export function logNote(
  state: GameState,
  side: Side | "system",
  kind: LogKind,
  text: string,
  deltas: string[] = [],
): void {
  push(state, { side, kind, text, deltas });
}
