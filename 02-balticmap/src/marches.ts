/** Marches: an attack that has been DECLARED but has not landed yet.
 *
 *  A Raid played on turn T does not move a defense score. It commits an army
 *  out of one of the actor's lands, becomes a visible arrow on the map, and
 *  resolves at the start of that actor's next turn - which gives every other
 *  seat one turn to see it coming and answer. The answer is a Raid back down
 *  the same axis: the two forces meet in the middle and only the difference
 *  lands, on whichever side came second.
 *
 *  Pure helpers over two sparse stores; GameState owns them. This module knows
 *  nothing about realms or reach - who may march where is a reach question and
 *  lives in src/playability.ts, which already owns `attackReach`. Keeping this
 *  a leaf is what lets the reducer, the rules and the DOM layer all reach it.
 *
 *  A "polygon" is a land's own faction id, the same 1:1 identity src/defense.ts
 *  documents. */

import { sweepLapsed } from "./timed";

/** How many armies a land fields with nobody having raised one: its ceiling's
 *  worth, `armyCapFor(defenseMax)` in src/defense.ts. A big land musters more
 *  than a small one, and no card raises or spends armies - a march holds one
 *  of its source's until it lands, and returns it by lapsing. Callers pass the
 *  cap in, because this module knows nothing about defense scores and should
 *  not learn. */

export interface March {
  /** The faction that declared it. Not derivable from `from`: a lord may march
   *  out of a land its vassal holds. */
  actor: string;
  /** Source polygon. In the actor's full realm when declared, and holding one
   *  of that polygon's armies until this march resolves. */
  from: string;
  /** Target polygon. In the actor's `attackReach` when declared. */
  to: string;
  /** "raid" or "great-raid" - carried so the log and the arrow can name the
   *  card that sent it without a second lookup. */
  cardId: string;
  /** Frozen at declaration, deliberately. Favourable omens are cashed by
   *  `playCard` when the card is played, so a march that recomputed its damage
   *  on landing would find the stack already spent. Freezing is also what makes
   *  the number printed on the arrow a promise rather than an estimate. */
  damage: number;
  /** Whether this arrow is the one the army is actually marching under.
   *
   *  A Raid is always true: one army, one arrow. Great raid is a single sally
   *  that fans out, so the FIRST arrow out of each land holds that land's
   *  army and the rest of its fan ride along at no further cost. Without the
   *  distinction a one-land realm could draw exactly one arrow with Great
   *  raid, which is strictly worse than the Raid it costs the same turn as -
   *  the card would be dead until a realm grew a third land. */
  holdsArmy: boolean;
  /** The turn this lands on, the absolute-expiry convention of src/timed.ts:
   *  declared on turn T stores T + 1. `state.turn` is a ROUND counter that
   *  bumps on the wrap to seat 0, so T + 1 is the declaring seat's next turn
   *  whichever seat it is, and resolution runs in that seat's `beginTurn`. */
  expiry: number;
}

/** Key -> march. The key is `${from}>${to}#${slot}`, with `slot` the lowest
 *  free integer for that direction, so two armies marching the same way get
 *  distinct keys and a seeded run inserts them in the same order every time.
 *
 *  This is the third consumer of src/timed.ts after the post-escape respite,
 *  which is the point that module's doc names for weighing a declarative
 *  registry of timed statuses. Weighed and declined: a respite is a bare
 *  number keyed by faction and a march is a record keyed by direction, so a
 *  shared registry would have to be generic over both the payload and the key
 *  to buy anything, and there would still be exactly two of them. The shared
 *  primitives are doing their job. */
export type Marches = Readonly<Record<string, March>>;

/** Polygon id -> armies stationed there. Sparse with a default, the
 *  src/defense.ts convention: an absent key means the land's army CAP, not
 *  zero, so a fresh game writes no keys at all. Armies belong to the LAND, not
 *  to the faction, so they change hands with it on Subjugate and Incorporate
 *  without any bookkeeping. */
export type Armies = Readonly<Record<string, number>>;

/** Armies stationed on a polygon, committed ones included. Clamped at 0 - the
 *  clamp is defensive, like `defenseOf`'s, because a boot override is the same
 *  attack surface as a hand-edited store. */
export function armiesOn(
  armies: Armies, polygon: string, cap: number,
): number {
  const n = armies[polygon];
  if (n === undefined) return cap;
  return Math.max(0, Math.floor(n));
}

export function marchesFrom(marches: Marches, polygon: string): March[] {
  return Object.values(marches).filter((m) => m.from === polygon);
}

export function marchesAgainst(marches: Marches, polygon: string): March[] {
  return Object.values(marches).filter((m) => m.to === polygon);
}

/** Armies on a polygon that are not already out on a march - what a new
 *  declaration may spend. Counts arrows that HOLD an army, not arrows: a Great
 *  raid's fan is one army going out several ways. Floored at 0 so a land whose
 *  armies were taken from under a march in flight reads as empty rather than
 *  negative. */
export function freeArmiesOn(
  armies: Armies, marches: Marches, polygon: string, cap: number,
): number {
  const out = marchesFrom(marches, polygon).filter((m) => m.holdsArmy).length;
  return Math.max(0, armiesOn(armies, polygon, cap) - out);
}

/** Declare a march, taking the lowest free slot for its direction. Reusing a
 *  freed slot rather than counting up forever keeps the keys short and keeps a
 *  replayed game's key set identical to the original's. */
export function addMarch(marches: Marches, m: March): Marches {
  let slot = 0;
  while (`${m.from}>${m.to}#${slot}` in marches) slot++;
  return { ...marches, [`${m.from}>${m.to}#${slot}`]: m };
}

export function clearMarches(marches: Marches, keys: readonly string[]): Marches {
  const drop = new Set(keys);
  const out: Record<string, March> = {};
  for (const [key, m] of Object.entries(marches)) {
    if (!drop.has(key)) out[key] = m;
  }
  return out;
}

/** The marches this seat declared, split into the ones landing now and the
 *  ones still in flight, on the shared src/timed.ts clock. */
export function lapsedMarchesOf(
  marches: Marches, actor: string, turn: number,
): { key: string; march: March }[] {
  const mine = Object.fromEntries(
    Object.entries(marches).filter(([, m]) => m.actor === actor),
  );
  return sweepLapsed(mine, turn, (m) => m.expiry).lapsed.map(([key, march]) => ({
    key, march,
  }));
}

/** The unordered pair a march runs along. Both directions of one clash share
 *  it, which is the whole point: the counter is recognised by the axis, not by
 *  who declared first. */
export function axisKeyOf(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface Axis {
  /** The two ends, sorted, so `fromA` and `fromB` mean the same thing to every
   *  caller without anyone having to remember who declared first. */
  a: string;
  b: string;
  keys: string[];
  fromA: March[];
  fromB: March[];
  /** Which end opened the quarrel - the side that declared first. The other
   *  side is the answer to it.
   *
   *  Nothing in the RULES cares: a clash is symmetric, and `resolveAxis` sums
   *  both sides the same way whoever moved first. The map cares. An attack and
   *  the counter-raid answering it drawn as two equal arrows nose to nose read
   *  as one confused shape, so the opening side is drawn full size on the axis
   *  and the answer smaller and off to one side.
   *
   *  Read off the expiry, which IS the declaration turn plus one, falling back
   *  to insertion order for two declared in the same round. */
  opening: "a" | "b";
}

/** Every axis these marches run along, ordered by axis key. Sorted rather than
 *  left in insertion order because resolution logs one event per axis and a
 *  seeded run must log them in the same order every time. */
export function axesOf(marches: Marches): Axis[] {
  const byKey = new Map<string, Axis>();
  /** First position in the record at which each side of an axis appeared -
   *  the tie-break for two sides declared in the same round. */
  const firstSeen = new Map<string, { a: number; b: number }>();
  let index = 0;
  for (const [key, m] of Object.entries(marches)) {
    const axisKey = axisKeyOf(m.from, m.to);
    let axis = byKey.get(axisKey);
    if (axis === undefined) {
      const [a, b] = m.from < m.to ? [m.from, m.to] : [m.to, m.from];
      axis = { a, b, keys: [], fromA: [], fromB: [], opening: "a" };
      byKey.set(axisKey, axis);
      firstSeen.set(axisKey, {
        a: Number.POSITIVE_INFINITY, b: Number.POSITIVE_INFINITY,
      });
    }
    axis.keys.push(key);
    const side = m.from === axis.a ? "a" : "b";
    (side === "a" ? axis.fromA : axis.fromB).push(m);
    const seen = firstSeen.get(axisKey)!;
    seen[side] = Math.min(seen[side], index);
    index++;
  }
  for (const [axisKey, axis] of byKey) {
    const earliest = (side: March[]): number =>
      side.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...side.map((m) => m.expiry));
    const ea = earliest(axis.fromA);
    const eb = earliest(axis.fromB);
    const seen = firstSeen.get(axisKey)!;
    axis.opening = ea !== eb ? (ea < eb ? "a" : "b") : seen.a <= seen.b ? "a" : "b";
  }
  return [...byKey.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([, axis]) => axis);
}

export interface AxisOutcome {
  /** The polygon that takes the damage - the target of whichever side pushed
   *  harder. Null when the two sides cancelled exactly. */
  loser: string | null;
  /** What actually lands: the difference between the two sides. */
  delta: number;
  totalA: number;
  totalB: number;
}

/** The clash. Each side is summed rather than paired march by march, which is
 *  what makes two armies on one axis behave the obvious way and makes the
 *  uncontested case fall out for free - an axis with an empty side has a delta
 *  equal to its full strength. */
export function resolveAxis(
  a: string, b: string, fromA: readonly March[], fromB: readonly March[],
): AxisOutcome {
  const totalA = fromA.reduce((sum, m) => sum + m.damage, 0);
  const totalB = fromB.reduce((sum, m) => sum + m.damage, 0);
  const delta = Math.abs(totalA - totalB);
  if (delta === 0) return { loser: null, delta: 0, totalA, totalB };
  return { loser: totalA > totalB ? b : a, delta, totalA, totalB };
}

/** A SUBJUGATION in flight: a demand of fealty declared on one turn and
 *  answered at the start of the actor's next, exactly as a raid is.
 *
 *  Its own store rather than a 0-damage march, because a march is an army and
 *  the axis arithmetic in `resolveAxis` is about armies meeting each other. A
 *  claim meets nothing: it either finds the land still broken when it arrives,
 *  or it finds it standing and comes to nothing.
 *
 *  `from` is the land the demand is made out of - the actor's home for a
 *  Subjugate - and is what a defense transfer moves points from when the claim
 *  lands. */
export interface Claim {
  actor: string;
  from: string;
  to: string;
  expiry: number;
}

/** Key -> claim, keyed by direction like `Marches`: one claim per actor per
 *  target, so playing a second Subjugate at the same land replaces the first
 *  rather than queueing two answers to one question. */
export type Claims = Readonly<Record<string, Claim>>;

export const claimKeyOf = (actor: string, to: string): string =>
  `${actor}>${to}`;

export function addClaim(claims: Claims, claim: Claim): Claims {
  return { ...claims, [claimKeyOf(claim.actor, claim.to)]: claim };
}

export function clearClaims(claims: Claims, keys: string[]): Claims {
  const out: Record<string, Claim> = {};
  for (const [key, claim] of Object.entries(claims)) {
    if (!keys.includes(key)) out[key] = claim;
  }
  return out;
}

/** Every claim of this actor's whose turn has come. */
export function lapsedClaimsOf(
  claims: Claims, actor: string, turn: number,
): { key: string; claim: Claim }[] {
  return Object.entries(claims)
    .filter(([, c]) => c.actor === actor && c.expiry <= turn)
    .map(([key, claim]) => ({ key, claim }));
}
