/** Every land in `factionIds` with the same number of further settlement sites.
 *  One by default: each land can be founded in once, and
 *  `SETTLEMENT_BASE_CAP` allows exactly that. */
export const siteCaps = (
  factionIds: string[],
  each = 1,
): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, each]));

/** `settlements` for a list of lands each founded in once. */
export const settledOnce = (factionIds: string[]): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, 1]));

/** `defenseMax` for a list of polygons at one shared ceiling. */
export const defenseMaxAll = (
  factionIds: string[],
  each = 600,
): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, each]));
