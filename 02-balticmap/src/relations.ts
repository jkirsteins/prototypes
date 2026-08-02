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

/** +amount on one track from actor toward every id in others - the Fortify
 *  effect on Might, the A feast effect on Status. One function taking the
 *  track, because the two cards differ in nothing else and a second copy is a
 *  second place for the fan-out to drift. */
export function bumpAllBy(
  rel: Relations,
  actor: string,
  others: string[],
  track: "status" | "might",
  amount: number,
): Relations {
  let out = rel;
  for (const target of others) out = bumpBy(out, actor, target, track, amount);
  return out;
}

/** +amount might from actor toward every id in others (the Fortify effect). */
export function bumpMightAllBy(
  rel: Relations, actor: string, others: string[], amount: number,
): Relations {
  return bumpAllBy(rel, actor, others, "might", amount);
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

/** Every ancestor of `factionId` in the overlord chain, nearest first: its
 *  lord, that lord's lord, and so on to the root. Empty for a free faction.
 *  The liege rule in src/playability.ts is what keeps `overlords` acyclic -
 *  a Subjugate may never target the actor's own ancestor - so this walk
 *  terminates; the `seen` set only defends against a corrupted store. */
export function overlordChainOf(
  factionId: string,
  overlords: Overlords,
): string[] {
  const chain: string[] = [];
  const seen = new Set([factionId]);
  let cur = overlords.get(factionId);
  while (cur !== undefined && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    cur = overlords.get(cur);
  }
  return chain;
}

/** The realm F belongs to, named by its root: whoever holds F if F has been
 *  incorporated, then the top of that faction's overlord chain. */
export function realmRootOf(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): string {
  const held = incorporated[factionId] ?? factionId;
  const chain = overlordChainOf(held, overlords);
  return chain.length === 0 ? held : chain[chain.length - 1];
}

/** EVERY land under one root: vassals of vassals to any depth, plus each
 *  member's own incorporated lands. This is the answer to "how much of the
 *  map is theirs" - the scoreboard, the win condition, the postmortem, the
 *  ownership shading and the hover halo all count it. `incorporated` itself
 *  stays flat (incorporate re-parents annexations to the actor), so only the
 *  vassal edges recurse. */
export function fullRealmOf(
  root: string,
  overlords: Overlords,
  incorporated: Incorporated,
): Set<string> {
  const members = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const member = queue.pop()!;
    for (const [vassal, lord] of overlords) {
      if (lord === member && !members.has(vassal)) {
        members.add(vassal);
        queue.push(vassal);
      }
    }
    for (const [land, owner] of Object.entries(incorporated)) {
      if (owner === member && !members.has(land)) {
        members.add(land);
        queue.push(land);
      }
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

/** One sealed pact: when it lapses, and which factions it buys both allies a
 *  Might lead over.
 *
 *  `against` is FROZEN at the moment of sealing - the factions bordering both
 *  realms then, and not a step later. Recomputing it live would have been
 *  cheaper to write and is the wrong rule: either ally conquering a land, or a
 *  shared neighbour being incorporated, would silently move the human's Might
 *  lead with no event behind it, and `src/standings.ts` walks a batch backwards
 *  from the current leads on the assumption that every move was recorded. See
 *  the `amount` rule in CLAUDE.md. Frozen, the bonus moves exactly twice - the
 *  `play` that seals it and the `pact-lapsed` that ends it - and both say so.
 *
 *  It is also what makes the pact previewable: the card tip can name the
 *  factions the pact would buy a lead over, before the player commits. */
export interface Pact {
  expiry: number;
  against: string[];
}

/** Sorted-pair key -> the pact between that pair. An entry is deleted the turn
 *  it lapses (see `sweepLapsedPacts` in src/game.ts), so a key present here has
 *  not necessarily been checked against the clock but has at least not been
 *  swept yet. `allianceActive` is still the only truth. */
export type Alliances = Record<string, Pact>;

export function pactBetween(
  view: { alliances: Alliances },
  a: string,
  b: string,
): Pact | undefined {
  return view.alliances[allianceKey(a, b)];
}

/** True while a pact between a and b has not yet expired. */
export function allianceActive(
  view: { alliances: Alliances; turn: number },
  a: string,
  b: string,
): boolean {
  const pact = pactBetween(view, a, b);
  return pact !== undefined && view.turn < pact.expiry;
}
