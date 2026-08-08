import { timedActive } from "./timed";

/** Pairwise Might store keyed "actorFactionId|targetFactionId".
 *  A missing key means 0. Values only grow; subjugation is stored on
 *  GameState, never derived. */
export type Relations = Record<string, number>;

/** vassal faction id -> overlord faction id (stored on GameState) */
export type Overlords = Map<string, string>;

/** vassal faction id -> owner faction id (permanent annexation) */
export type Incorporated = Record<string, string>;

export function relKey(actor: string, target: string): string {
  return `${actor}|${target}`;
}

export function getRel(rel: Relations, actor: string, target: string): number {
  return rel[relKey(actor, target)] ?? 0;
}

export function bumpMightBy(
  rel: Relations, actor: string, target: string, amount: number,
): Relations {
  // A zero amount must not materialise a key; a missing key already means 0.
  if (amount <= 0) return rel;
  return {
    ...rel,
    [relKey(actor, target)]: getRel(rel, actor, target) + amount,
  };
}

export function bumpMight(rel: Relations, actor: string, target: string): Relations {
  return bumpMightBy(rel, actor, target, 1);
}

/** A's raw Might margin over B; positive = A is ahead. The store alone -
 *  what the rules see adds pact terms, and that is `leadIn`. */
export function leadOf(rel: Relations, a: string, b: string): number {
  return getRel(rel, a, b) - getRel(rel, b, a);
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
 *  This is the meaning wanted only where one fealty link is the subject: the
 *  vassal stripe overlay (stripes show who a land DIRECTLY answers to) and
 *  the AI's incorporate scoring (digestion keeps the target's annexations and
 *  frees its vassals, so the direct holding is what turns permanent).
 *
 *  Everything that scales with "the realm" - the subjugation bar, `reachOf`,
 *  `borderStrength`, the scoreboard, the win condition, the ownership shading
 *  - uses `fullRealmOf`, which walks chains of vassalage to any depth.
 *  Picking this one there is what put a land inside the player's own outline
 *  that the scoreboard refused to count. */
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

/** F plus the lands incorporated into F - no vassals. The pinned-log filter
 *  wants exactly the actors answerable as F: a vassal acts on its own and is
 *  watched by pinning it, while an incorporated land never acts and can only
 *  appear as a target. `incorporated` is flat (incorporate re-parents the
 *  target's annexations to the actor), so one pass reaches everything. */
export function incorporatedRealmOf(
  factionId: string,
  incorporated: Incorporated,
): Set<string> {
  const members = new Set([factionId]);
  for (const [land, owner] of Object.entries(incorporated)) {
    if (owner === factionId) members.add(land);
  }
  return members;
}

/** Raises BOTH directions' might counters to the max of the two, so the raw
 *  might lead becomes 0 (relation counters only grow; Assassinate ruler).
 *  Levels the STORE only: a pact term lives on the alliance, not here, so a
 *  visible lead bought by a live pact survives the levelling. */
export function levelMight(rel: Relations, a: string, b: string): Relations {
  const ab = getRel(rel, a, b);
  const ba = getRel(rel, b, a);
  const max = Math.max(ab, ba);
  if (ab === max && ba === max) return rel;
  return {
    ...rel,
    [relKey(a, b)]: max,
    [relKey(b, a)]: max,
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
  return timedActive(pactBetween(view, a, b)?.expiry, view.turn);
}
