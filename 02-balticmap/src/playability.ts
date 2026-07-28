import { CARDS } from "./cards";
import {
  leadsOf, realmOf,
  type Incorporated, type Overlords, type Relations,
} from "./relations";

export const SUBJUGATE_THRESHOLD = 2;

/** The slice of game state the rules need. GameState satisfies this
 *  structurally; tests build it directly. */
export interface RulesView {
  relations: Relations;
  overlords: Overlords; // stored vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>; // faction id -> adjacent faction ids
  factionIds: string[];
}

function reachOf(view: RulesView, factionId: string): Set<string> {
  const realm = realmOf(factionId, view.overlords, view.incorporated);
  const reach = new Set<string>();
  for (const member of realm) {
    for (const adj of view.adjacency[member] ?? []) {
      reach.add(view.incorporated[adj] ?? adj);
    }
  }
  return reach;
}

/** Valid targets for a targeted card, in faction order. */
export function validTargetsFor(
  view: RulesView,
  factionId: string,
  cardId: string,
): string[] {
  const overlord = view.overlords.get(factionId);
  const subjugated = overlord !== undefined;
  if (cardId === "incorporate") {
    if (subjugated) return [];
    return view.factionIds.filter((id) => view.overlords.get(id) === factionId);
  }
  if (cardId === "raid" || cardId === "shrewd-marriage") {
    const reach = reachOf(view, factionId);
    const inReach = (id: string) =>
      id !== factionId && !(id in view.incorporated) && reach.has(id);
    if (cardId === "raid") {
      return view.factionIds.filter((id) => inReach(id) && id !== overlord);
    }
    // Marriage: the overlord is always courtable, adjacent or not.
    return view.factionIds.filter((id) => inReach(id) || id === overlord);
  }
  if (cardId === "subjugate") {
    if (subjugated) return [];
    const reach = reachOf(view, factionId);
    return view.factionIds.filter((id) => {
      if (id === factionId || id in view.incorporated || !reach.has(id)) return false;
      if (view.overlords.get(id) === factionId) return false; // already yours
      const l = leadsOf(view.relations, factionId, id);
      const needed =
        SUBJUGATE_THRESHOLD * realmOf(id, view.overlords, view.incorporated).length;
      return Math.max(l.status, l.might) >= needed;
    });
  }
  return [];
}

export function isCardPlayable(
  view: RulesView,
  factionId: string,
  cardId: string,
): boolean {
  const card = CARDS[cardId];
  if (!card) return false;
  const overlord = view.overlords.get(factionId);
  if (cardId === "grow-crops" || cardId === "fortify") return true;
  if (cardId === "pay-tribute") return overlord !== undefined;
  if (cardId === "revolt") return overlord !== undefined;
  if (cardId === "reclaim-independence") {
    if (overlord === undefined) return false;
    const l = leadsOf(view.relations, overlord, factionId);
    // The overlord's realm always includes factionId itself (as its vassal);
    // the grip strength is the overlord's OTHER holdings, excluding the
    // very vassal weighing whether to leave.
    const overlordRealm = realmOf(overlord, view.overlords, view.incorporated)
      .filter((id) => id !== factionId);
    const grip = SUBJUGATE_THRESHOLD * overlordRealm.length;
    return l.status < grip && l.might < grip;
  }
  if (card.targeted) return validTargetsFor(view, factionId, cardId).length > 0;
  return false;
}

export interface PlayableSet {
  mode: "play" | "discard";
  cardIndexes: number[];
}

/** Which hand indexes may be played this turn. Forced cards (Pay Tribute)
 *  monopolize the set; an empty playable set means a forced discard of any
 *  card in hand. */
export function playableSet(
  view: RulesView,
  factionId: string,
  hand: string[],
): PlayableSet {
  const forced: number[] = [];
  hand.forEach((c, i) => {
    if (CARDS[c]?.forced && isCardPlayable(view, factionId, c)) forced.push(i);
  });
  if (forced.length > 0) return { mode: "play", cardIndexes: forced };
  const playable: number[] = [];
  hand.forEach((c, i) => {
    if (!CARDS[c]?.forced && isCardPlayable(view, factionId, c)) playable.push(i);
  });
  if (playable.length > 0) return { mode: "play", cardIndexes: playable };
  return { mode: "discard", cardIndexes: hand.map((_, i) => i) };
}
