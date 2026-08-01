import type { MapData, Settlement } from "./types";

/** Faction id -> ids of the factions it can reach, derived from region borders.
 *  Regions are 1:1 with factions, so this is the region graph relabelled. */
export function factionAdjacencyOf(data: MapData): Record<string, string[]> {
  const factionByRegion = new Map(data.regions.map((r) => [r.id, r.faction]));
  return Object.fromEntries(
    data.regions.map((r) => [
      r.faction,
      r.adjacent.map((id) => factionByRegion.get(id)!),
    ]),
  );
}

/** The locked settlement dots each land still has to give, keyed by FACTION id
 *  and in the order the map authors them. One settlement per land is already
 *  standing (`unlocked`), so this is `maxSettlements - 1` in list form.
 *
 *  Here rather than in main.ts because the simulation plays the shipped map and
 *  has to see the same caps: defaulting it in `newGame` gave every land the
 *  same number, which would have made a two-slot island and a nine-slot
 *  heartland measure identically in the balance and rarity runs. */
export function siteListsOf(data: MapData): Map<string, Settlement[]> {
  const factionByRegion = new Map(data.regions.map((r) => [r.id, r.faction]));
  const out = new Map<string, Settlement[]>();
  for (const s of data.settlements) {
    if (s.unlocked) continue;
    const faction = factionByRegion.get(s.land);
    if (faction === undefined) continue;
    out.set(faction, [...(out.get(faction) ?? []), s]);
  }
  return out;
}

export function siteCapsOf(data: MapData): Record<string, number> {
  return Object.fromEntries(
    [...siteListsOf(data)].map(([faction, sites]) => [faction, sites.length]),
  );
}
