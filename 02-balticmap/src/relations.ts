/** The realm walks and the fealty types. The pairwise Might store that used
 *  to live here retired with the defense-score design (2026-08-08): standing
 *  between factions is now the defense score on each polygon, and this module
 *  keeps only the questions about who holds what. */

/** vassal faction id -> overlord faction id (stored on GameState) */
export type Overlords = Map<string, string>;

/** vassal faction id -> owner faction id (permanent annexation) */
export type Incorporated = Record<string, string>;

/** What F holds DIRECTLY: itself, its vassals, its incorporated lands. One
 *  level out - a vassal's own annexations belong to the vassal, not to F.
 *
 *  This is the meaning wanted only where one fealty link is the subject: the
 *  vassal stripe overlay (stripes show who a land DIRECTLY answers to) and
 *  the AI's incorporate scoring (digestion keeps the target's annexations and
 *  frees its vassals, so the direct holding is what turns permanent).
 *
 *  Everything that scales with "the realm" - the win condition, reach, the
 *  scoreboard, the ownership shading - uses `fullRealmOf`, which walks chains
 *  of vassalage to any depth. Picking this one there is what put a land
 *  inside the player's own outline that the scoreboard refused to count. */
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

/** A land no realm holds: nobody's vassal and nobody's annexation. What the
 *  grey fill asks, together with the land being quiet - an unheld land that
 *  plays its own turns is simply a rival at full independence. */
export function isUnheld(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): boolean {
  return !overlords.has(factionId) && !(factionId in incorporated);
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
