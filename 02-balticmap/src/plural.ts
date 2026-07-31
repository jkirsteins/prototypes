/** The one place a number becomes a noun phrase: "1 land", "2 lands".
 *  Irregular plurals pass `many` explicitly.
 *
 *  It exists because the ternary was written inline four times - the deck
 *  screen's pack count and three separate places in target-explanations.ts -
 *  and because the round-summary titles had drifted in BOTH directions at
 *  once: "A vassal was taken" over a round that lost two, and "You lost your
 *  vassals" over a round that lost one. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Picks a form without printing the number - for verbs ("is"/"are") and for
 *  prose that names its subjects itself, where the count is already visible
 *  as the list of names. */
export function plural<T>(n: number, one: T, many: T): T {
  return n === 1 ? one : many;
}
