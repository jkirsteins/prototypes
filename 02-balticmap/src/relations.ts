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
