import type { GameState } from "./game";

/** GameState with `overlords` as a plain record - the one field a
 *  JSON round-trip cannot carry (a Map stringifies to {}). Everything
 *  else on GameState is already records, arrays and primitives. */
export type SerializedGameState = Omit<GameState, "overlords"> & {
  overlords: Record<string, string>;
};

export function serializeGame(state: GameState): SerializedGameState {
  return { ...state, overlords: Object.fromEntries(state.overlords) };
}

export function deserializeGame(s: SerializedGameState): GameState {
  return { ...s, overlords: new Map(Object.entries(s.overlords)) };
}
