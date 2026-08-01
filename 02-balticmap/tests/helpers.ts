import type { Pact } from "../src/relations";

/** A pact expiring on `expiry`, buying its allies a Might lead over `against`.
 *
 *  `against` defaults to empty because most tests are about the truce half of
 *  Alliance - who may target whom, and until when - and an empty list makes the
 *  Might half provably absent rather than incidentally so. Tests about the
 *  bonus pass the list explicitly. */
export const pact = (expiry: number, against: string[] = []): Pact =>
  ({ expiry, against });

/** Every land in `factionIds` with the same number of further settlement sites.
 *  One by default, which is the old world exactly: each land could be founded
 *  in once, and `SETTLEMENT_BASE_CAP` allows exactly that with no boom spent. */
export const siteCaps = (
  factionIds: string[],
  each = 1,
): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, each]));

/** `settlements` for a list of lands each founded in once. */
export const settledOnce = (factionIds: string[]): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, 1]));
