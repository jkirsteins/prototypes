import { defenseMaxFromPopulations } from "./defense";
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

/** Each polygon's defense ceiling, keyed by FACTION id like `siteCapsOf` and
 *  for the same reason: the simulation plays the shipped map and must see the
 *  same ceilings the app does. */
export function defenseMaxOf(data: MapData): Record<string, number> {
  return defenseMaxFromPopulations(
    Object.fromEntries(data.regions.map((r) => [r.faction, r.population])),
  );
}

/** How many lands an army crosses going from `from` to `to`: 1 for a
 *  neighbour, null past `max` or for a land there is no path to at all.
 *
 *  Bounded rather than complete on purpose. The answer is wanted for a march,
 *  a march may not cross more than `MAX_MARCH_HOPS`, and a bounded walk stops
 *  at that ring instead of touring the map for an answer the caller will throw
 *  away. */
export function hopsBetween(
  adjacency: Record<string, string[]>,
  from: string,
  to: string,
  max: number,
): number | null {
  if (from === to) return 0;
  const seen = new Set([from]);
  let ring = [from];
  for (let hops = 1; hops <= max; hops++) {
    const next: string[] = [];
    for (const land of ring) {
      for (const neighbour of adjacency[land] ?? []) {
        if (seen.has(neighbour)) continue;
        if (neighbour === to) return hops;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) return null;
    ring = next;
  }
  return null;
}

/** How far an army may march. Three, stated as a rule rather than left to
 *  emerge from how long a fight lasts: the duel clock that would have capped
 *  it does not exist yet, and without a cap every land on the map is a legal
 *  target - an aim preview lighting up all 26 and an AI scoring every faction
 *  from every source. Three also keeps the rule sayable, which an emergent cap
 *  never is. */
export const MAX_MARCH_HOPS = 3;
