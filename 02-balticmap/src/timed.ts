/** The absolute-expiry clock every multi-turn status runs on.
 *
 *  A status set on turn T to last N turns stores `expiry = T + N`: active
 *  while `turn < expiry`, over ON turn `expiry`. "Until turn N" in player
 *  prose always quotes that stored number, and a countdown badge shows
 *  `expiry - turn`. Alliances and the post-escape respite are the current
 *  consumers; a new multi-turn status must run on these helpers rather than
 *  hand-rolling a second clock, and a third consumer is the point to weigh a
 *  declarative registry of timed statuses over these shared primitives.
 *
 *  This is a leaf module on purpose - it imports nothing, so the rules, the
 *  reducer and the DOM layer can all reach it without a cycle. */

/** True while the status is running. `undefined` means no status at all. */
export function timedActive(expiry: number | undefined, turn: number): boolean {
  return expiry !== undefined && turn < expiry;
}

/** The expiry while it is still running, else undefined - the shape every
 *  "is there one, and until when" caller wants in one read. */
export function activeExpiry(expiry: number | undefined, turn: number): number | undefined {
  return timedActive(expiry, turn) ? expiry : undefined;
}

/** Entries the clock has run out on, split from those still running. `kept`
 *  is reference-equal to `entries` when nothing lapsed, so a quiet sweep
 *  churns no state. Deleting-and-reporting is what makes "still in the
 *  record" the guard against reporting a lapse twice - `beginTurn` runs once
 *  per seat per round. What to DO with `lapsed` is the caller's domain: a
 *  pact lapse moves a Might term and must become a `pact-lapsed` event, while
 *  a lapse that moves nothing is discarded silently. */
export function sweepLapsed<T>(
  entries: Record<string, T>,
  turn: number,
  expiryOf: (entry: T) => number,
): { kept: Record<string, T>; lapsed: [string, T][] } {
  const lapsed = Object.entries(entries).filter(([, e]) => turn >= expiryOf(e));
  if (lapsed.length === 0) return { kept: entries, lapsed };
  const kept: Record<string, T> = {};
  for (const [key, e] of Object.entries(entries)) {
    if (turn < expiryOf(e)) kept[key] = e;
  }
  return { kept, lapsed };
}

/** The one spelling of the phrase, so every surface agrees that "until turn
 *  N" means legal - or over - again ON turn N. */
export function untilTurn(expiry: number): string {
  return `until turn ${expiry}`;
}
