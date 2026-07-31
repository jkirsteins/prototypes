export interface Relation {
  status: number;
  might: number;
}

/** Pairwise relation store keyed "actorFactionId|targetFactionId".
 *  A missing key means { status: 0, might: 0 }. Values only grow;
 *  subjugation is stored on GameState, never derived. */
export type Relations = Record<string, Relation>;

/** vassal faction id -> overlord faction id (stored on GameState) */
export type Overlords = Map<string, string>;

/** vassal faction id -> owner faction id (permanent annexation) */
export type Incorporated = Record<string, string>;

export function relKey(actor: string, target: string): string {
  return `${actor}|${target}`;
}

export function getRel(rel: Relations, actor: string, target: string): Relation {
  return rel[relKey(actor, target)] ?? { status: 0, might: 0 };
}

function bumpBy(
  rel: Relations,
  actor: string,
  target: string,
  field: "status" | "might",
  amount: number,
): Relations {
  // A zero amount must not materialise a key; a missing key already means 0.
  if (amount <= 0) return rel;
  const cur = getRel(rel, actor, target);
  return {
    ...rel,
    [relKey(actor, target)]: { ...cur, [field]: cur[field] + amount },
  };
}

export function bumpStatusBy(
  rel: Relations, actor: string, target: string, amount: number,
): Relations {
  return bumpBy(rel, actor, target, "status", amount);
}

export function bumpMightBy(
  rel: Relations, actor: string, target: string, amount: number,
): Relations {
  return bumpBy(rel, actor, target, "might", amount);
}

export function bumpStatus(rel: Relations, actor: string, target: string): Relations {
  return bumpStatusBy(rel, actor, target, 1);
}

export function bumpMight(rel: Relations, actor: string, target: string): Relations {
  return bumpMightBy(rel, actor, target, 1);
}

/** Per-track margins of A over B; positive = A is ahead on that track. */
export function leadsOf(
  rel: Relations,
  a: string,
  b: string,
): { status: number; might: number } {
  const ab = getRel(rel, a, b);
  const ba = getRel(rel, b, a);
  return { status: ab.status - ba.status, might: ab.might - ba.might };
}

/** +amount might from actor toward every id in others (the Fortify effect). */
export function bumpMightAllBy(
  rel: Relations, actor: string, others: string[], amount: number,
): Relations {
  let out = rel;
  for (const target of others) out = bumpMightBy(out, actor, target, amount);
  return out;
}

export function bumpMightAll(
  rel: Relations, actor: string, others: string[],
): Relations {
  return bumpMightAllBy(rel, actor, others, 1);
}

/** What F holds DIRECTLY: itself, its vassals, its incorporated lands. One
 *  level out - a vassal's own annexations belong to the vassal, not to F.
 *
 *  This is the meaning the rules that scale to direct holding want, and only
 *  those: the subjugation bar and `borderStrength` in `playability.ts`, and the
 *  vassal stripe overlay. Subjugate frees its target's vassals the moment it
 *  lands, so they must not raise that target's bar.
 *
 *  For "how much of the map is F's" - the scoreboard, the win condition, the
 *  ownership shading - use `fullRealmOf`. Picking this one there is what put a
 *  land inside the player's own outline that the scoreboard refused to count. */
export function realmOf(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): string[] {
  const out = [factionId];
  for (const [vassal, lord] of overlords) {
    if (lord === factionId) out.push(vassal);
  }
  for (const [land, owner] of Object.entries(incorporated)) {
    if (owner === factionId) out.push(land);
  }
  return out;
}

/** The realm F belongs to, named by its root: whoever holds F if F has been
 *  incorporated, then that faction's overlord if it has one. */
export function realmRootOf(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): string {
  const held = incorporated[factionId] ?? factionId;
  return overlords.get(held) ?? held;
}

/** EVERY land under one root, including each vassal's own incorporated lands -
 *  which `realmOf` alone misses, since it only walks one level out from the
 *  faction it is given.
 *
 *  This is the answer to "how much of the map is theirs", so it is what the
 *  scoreboard, the win condition, the postmortem, the ownership shading and the
 *  hover halo all count. `incorporate` re-parents a target's own annexations to
 *  the actor, so `incorporated` is never deeper than one level and these two
 *  steps reach everything. */
export function fullRealmOf(
  root: string,
  overlords: Overlords,
  incorporated: Incorporated,
): Set<string> {
  const members = new Set(realmOf(root, overlords, incorporated));
  for (const member of [...members]) {
    for (const [land, owner] of Object.entries(incorporated)) {
      if (owner === member) members.add(land);
    }
  }
  return members;
}

/** Raises BOTH directions' status counters to the max of the two, so the
 *  status lead becomes 0 (relation counters only grow; Assassinate ruler). */
export function levelStatus(rel: Relations, a: string, b: string): Relations {
  const ab = getRel(rel, a, b);
  const ba = getRel(rel, b, a);
  const max = Math.max(ab.status, ba.status);
  if (ab.status === max && ba.status === max) return rel;
  return {
    ...rel,
    [relKey(a, b)]: { ...ab, status: max },
    [relKey(b, a)]: { ...ba, status: max },
  };
}

/** Sorted pair key for symmetric per-pair state keyed by two faction ids
 *  (e.g. GameState.alliances), order-independent. */
export function allianceKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** True while a pact between a and b (recorded in `alliances`, sorted-pair
 *  key -> expiry turn) has not yet expired. */
export function allianceActive(
  view: { alliances: Record<string, number>; turn: number },
  a: string,
  b: string,
): boolean {
  const expiry = view.alliances[allianceKey(a, b)];
  return expiry !== undefined && view.turn < expiry;
}
