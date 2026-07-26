export interface Relation {
  status: number;
  might: number;
}

/** Pairwise relation store keyed "actorFactionId|targetFactionId".
 *  A missing key means { status: 0, might: 0 }. Values only grow;
 *  subjugation is always derived from them, never stored. */
export type Relations = Record<string, Relation>;

/** vassal faction id -> overlord faction id (derived, see computeOverlords) */
export type Overlords = Map<string, string>;

/** vassal faction id -> owner faction id (permanent annexation) */
export type Incorporated = Record<string, string>;

export function relKey(actor: string, target: string): string {
  return `${actor}|${target}`;
}

export function getRel(rel: Relations, actor: string, target: string): Relation {
  return rel[relKey(actor, target)] ?? { status: 0, might: 0 };
}

function bump(
  rel: Relations,
  actor: string,
  target: string,
  field: "status" | "might",
): Relations {
  const cur = getRel(rel, actor, target);
  return { ...rel, [relKey(actor, target)]: { ...cur, [field]: cur[field] + 1 } };
}

export function bumpStatus(rel: Relations, actor: string, target: string): Relations {
  return bump(rel, actor, target, "status");
}

export function bumpMight(rel: Relations, actor: string, target: string): Relations {
  return bump(rel, actor, target, "might");
}

/** A's best margin over B across the two tracks; positive = A qualifies
 *  to subjugate B. */
export function leadOf(rel: Relations, a: string, b: string): number {
  const ab = getRel(rel, a, b);
  const ba = getRel(rel, b, a);
  return Math.max(ab.status - ba.status, ab.might - ba.might);
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

/** +1 might from actor toward every id in others (the Fortify effect). */
export function bumpMightAll(
  rel: Relations,
  actor: string,
  others: string[],
): Relations {
  let out = rel;
  for (const target of others) out = bumpMight(out, actor, target);
  return out;
}

/** Greedy descending-lead overlord assignment. Biggest lead wins contested
 *  targets. Overlords are always free factions (never incorporated or vassal
 *  to another). A faction that becomes subjugated releases its vassals back
 *  into the pool, ensuring chains never form. */
export function computeOverlords(
  rel: Relations,
  incorporated: Incorporated,
  factionOrder: string[],
): Overlords {
  const free = factionOrder.filter((id) => !(id in incorporated));
  const index = new Map(free.map((id, i) => [id, i]));
  const edges: { actor: string; target: string; lead: number }[] = [];
  for (const actor of free) {
    for (const target of free) {
      if (actor === target) continue;
      const lead = leadOf(rel, actor, target);
      if (lead > 0) edges.push({ actor, target, lead });
    }
  }
  edges.sort(
    (a, b) =>
      b.lead - a.lead ||
      index.get(a.actor)! - index.get(b.actor)! ||
      index.get(a.target)! - index.get(b.target)!,
  );
  const overlords: Overlords = new Map();
  for (const e of edges) {
    if (overlords.has(e.target)) continue; // already claimed by a bigger lead
    if (overlords.has(e.actor)) continue; // the subjugated hold no vassals
    overlords.set(e.target, e.actor);
    for (const [vassal, lord] of overlords) {
      if (lord === e.target) overlords.delete(vassal);
    }
  }
  return overlords;
}

/** The faction ids in F's realm: itself, its vassals, its incorporated lands. */
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

/** Valid targets for a card, in faction order. Adjacency is keyed and
 *  valued by faction id (main.ts translates region adjacency). */
export function validTargets(
  factionId: string,
  cardId: string,
  overlords: Overlords,
  incorporated: Incorporated,
  adjacency: Record<string, string[]>,
  factionOrder: string[],
): string[] {
  if (cardId === "incorporate") {
    return factionOrder.filter((id) => overlords.get(id) === factionId);
  }
  if (cardId !== "raid" && cardId !== "shrewd-marriage") return [];
  const realm = realmOf(factionId, overlords, incorporated);
  const reach = new Set<string>();
  for (const member of realm) {
    for (const adj of adjacency[member] ?? []) reach.add(adj);
  }
  return factionOrder.filter(
    (id) => id !== factionId && !(id in incorporated) && reach.has(id),
  );
}
