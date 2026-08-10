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

/** Whether a JSON round-trip hands the value back unchanged. A Map or a Set
 *  stringifies to `{}` and takes a whole rule with it; a Date comes back a
 *  string; a function vanishes. Recurses through arrays and objects, because
 *  the shape that would slip past a shallow check is a Map nested inside a
 *  store rather than one sitting on GameState itself. */
type JsonSafe<T> =
  T extends string | number | boolean | null | undefined ? true :
  T extends Map<unknown, unknown> | Set<unknown> | Date ? false :
  T extends (...a: never[]) => unknown ? false :
  T extends readonly (infer U)[] ? JsonSafe<U> :
  T extends object
    ? (false extends { [K in keyof T]-?: JsonSafe<T[K]> }[keyof T] ? false : true)
    : false;

/** The names of the fields that would not survive the trip. */
type NotJsonSafe<T> = {
  [K in keyof T]-?: JsonSafe<T[K]> extends true ? never : K;
}[keyof T];

/** The codec is a spread plus one repair, so a new field on GameState crosses
 *  the wire for free - and this is what makes that TRUE rather than hopeful.
 *  A field the spread cannot carry and the repair does not fix is a COMPILE
 *  ERROR here, and the error names the field.
 *
 *  Checked on `SerializedGameState` and not on `GameState`, deliberately: a
 *  field the codec repairs is a field this must accept. `overlords` is the
 *  standing example, and the day a second one needs repairing this assertion
 *  is what will say so.
 *
 *  It cannot see through `any`, and a type says nothing about what a value
 *  actually holds, so `tests/net-codec.test.ts` walks a real mid-game state
 *  as well. */
const _everyFieldSurvivesTheWire:
  [NotJsonSafe<SerializedGameState>] extends [never]
    ? true
    : ["this field of GameState cannot cross the wire - repair it in serializeGame:", NotJsonSafe<SerializedGameState>] = true;
void _everyFieldSurvivesTheWire;
