import type { MapData } from "./types";

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
