import genericNames from "./data/ruler-names-generic.json";
import type { LeaderAbilities } from "./abilities";
import { activeRegion } from "./regions";

export interface Ruler {
  name: string;
  /** Turn this ruler took over; 1 for the rulers a world starts with. */
  since: number;
  /** Battle-hardening bought by War council plays; a raid adds it when this
   *  ruler holds the ability that makes it count (src/abilities.ts). Dies
   *  with the ruler: replaceRuler builds the successor as a fresh literal at
   *  0 - never spread the predecessor there, which is what makes
   *  assassination reset the stack for free. */
  leadership: number;
  /** Standing abilities this ruler holds (src/abilities.ts). Unlike
   *  `leadership` these SURVIVE an assassination: what a people have learned
   *  about war outlives the chief who taught them, and a successor who lost
   *  the ability too would make one card wipe out a build. Absent means
   *  none. */
  abilities?: readonly string[];
}

/** Faction id -> its ruler, for the factions that HAVE one. A missing key is
 *  a vacant seat: a land whose people follow nobody.
 *
 *  The vacancy is the whole difference between a faction that plays and one
 *  that does not - `advance` skips a faction with no ruler, and that is the
 *  only test anywhere. Grey lands START vacant and stop being vacant the
 *  moment somebody takes them (`seatRuler`); a seated faction never becomes
 *  vacant, because `replaceRuler` always seats a successor. */
export type Rulers = Record<string, Ruler>;

const GENERIC: readonly string[] = genericNames as string[];

/** The active region's pool for this people, or the shared fallback for a
 *  people the region names no pool for - a faction with no ethnicity at all,
 *  or one the region simply has not authored names for yet. */
function poolFor(ethnicity: string | undefined): readonly string[] {
  if (ethnicity !== undefined) {
    const pool = activeRegion().rulerNames[ethnicity];
    if (pool !== undefined && pool.length > 0) return pool;
  }
  return GENERIC;
}

/** FNV-1a, so a faction's place in its pool is stable across runs and
 *  machines.
 *
 *  Deliberately not the game's `Rng`: naming must never consume a draw from
 *  the stream that shuffles decks, or every seeded simulation would shift
 *  and the balance baseline would be invalidated by a cosmetic change. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A name for this faction's `sequence`-th ruler that no living ruler holds.
 *  `taken` is checked across the whole world, not just the ethnicity, so two
 *  pools sharing a form cannot collide. */
export function rulerNameFor(
  factionId: string,
  ethnicity: string | undefined,
  sequence: number,
  taken: ReadonlySet<string>,
): string {
  const pool = poolFor(ethnicity);
  const start = hash(factionId) % pool.length;
  for (let probe = 0; probe < pool.length; probe++) {
    const name = pool[(start + sequence + probe) % pool.length];
    if (!taken.has(name)) return name;
  }
  // Pool spent: a successor takes a patronymic, as the chronicles name one.
  for (let g = 0; g < pool.length; g++) {
    const given = pool[(start + sequence + g) % pool.length];
    for (let f = 0; f < pool.length; f++) {
      const father = pool[(start + f) % pool.length];
      if (father === given) continue;
      const name = `${given}, son of ${father}`;
      if (!taken.has(name)) return name;
    }
  }
  throw new Error(`no unique ruler name left for faction "${factionId}"`);
}

/** Seats a ruler for every faction named. The only way to build a `Rulers`;
 *  `vacateRulers` is how the lands nobody plays lose theirs at the deal. */
export function initialRulers(
  factionIds: string[],
  ethnicities: Record<string, string> = {},
): Rulers {
  const rulers: Rulers = {};
  const taken = new Set<string>();
  for (const factionId of factionIds) {
    const name = rulerNameFor(factionId, ethnicities[factionId], 0, taken);
    taken.add(name);
    rulers[factionId] = { name, since: 1, leadership: 0 };
  }
  return rulers;
}

/** Empties every seat except the ones named. What makes a land unplayable:
 *  no leader, so no turn, so no cards - until somebody takes it, and then
 *  `seatRuler` gives its people a chief and the quiet land joins the table as
 *  its new lord's vassal. The vacancy is where a land STARTS, not a mark that
 *  it can never play. */
export function vacateRulers(rulers: Rulers, seated: readonly string[]): Rulers {
  const out: Rulers = {};
  for (const [factionId, ruler] of Object.entries(rulers)) {
    if (seated.includes(factionId)) out[factionId] = ruler;
  }
  return out;
}

/** Whether this faction has a leader at all - the one question the turn loop
 *  asks, and the one legality test Assassinate ruler needs. */
export function hasRuler(rulers: Rulers, factionId: string): boolean {
  return rulers[factionId] !== undefined;
}

/** The ruler's name, or null for a vacant seat. For surfaces that describe
 *  any land on the map rather than only the ones being played. */
export function rulerNameOf(rulers: Rulers, factionId: string): string | null {
  return rulers[factionId]?.name ?? null;
}

/** Throws on a VACANT seat. Callers that may be looking at a land nobody
 *  plays ask `hasRuler` or `rulerNameOf` first; this one is for the paths
 *  where a ruler is part of the rules being applied, and a missing one is a
 *  bug rather than a state. */
export function rulerOf(rulers: Rulers, factionId: string): Ruler {
  const ruler = rulers[factionId];
  if (ruler === undefined) {
    throw new Error(`no ruler for faction "${factionId}"`);
  }
  return ruler;
}

/** Seats a leader where nobody sat. The OTHER writer, and not a special case
 *  of `replaceRuler`: that one is a succession and reads the dead ruler
 *  through `rulerOf`, which throws on a vacant seat.
 *
 *  A land that has changed hands gets one of these, which is the whole of what
 *  makes a vassal act - `takesNoTurn` asks `hasRuler` and nothing else. The
 *  fields are stated rather than inherited because there is nobody to inherit
 *  from: a fresh name no living ruler holds, `since` at the turn the land
 *  fell, leadership 0, and whatever abilities its people's own build brings.
 *  Abilities are handed in rather than looked up so this module stays a leaf
 *  that knows nothing about decks or seats.
 *
 *  An occupied chair is returned untouched, so a caller does not have to ask
 *  first: a land taken from a lord who was already leading it keeps its
 *  leader, and a conquest is not an assassination. */
export function seatRuler(
  rulers: Rulers,
  ethnicities: Record<string, string>,
  factionId: string,
  turn: number,
  abilities: readonly string[],
): Rulers {
  if (rulers[factionId] !== undefined) return rulers;
  const taken = new Set(Object.values(rulers).map((r) => r.name));
  return {
    ...rulers,
    [factionId]: {
      name: rulerNameFor(factionId, ethnicities[factionId], turn, taken),
      since: turn,
      leadership: 0,
      ...(abilities.length > 0 ? { abilities: [...abilities] } : {}),
    },
  };
}

/** The succession writer: this ruler is dead and another takes the chair.
 *  `seatRuler` is the other one, for a chair nobody was sitting in. Returns
 *  both names so the caller can record what happened without asking twice and
 *  risking a different answer. */
export function replaceRuler(
  rulers: Rulers,
  ethnicities: Record<string, string>,
  factionId: string,
  turn: number,
): { rulers: Rulers; killed: string; successor: string } {
  const dead = rulerOf(rulers, factionId);
  const killed = dead.name;
  const taken = new Set(Object.values(rulers).map((r) => r.name));
  const successor = rulerNameFor(factionId, ethnicities[factionId], turn, taken);
  return {
    rulers: {
      ...rulers,
      [factionId]: {
        name: successor, since: turn, leadership: 0,
        // The abilities carry over; the leadership does not. See `Ruler`.
        ...(dead.abilities !== undefined ? { abilities: dead.abilities } : {}),
      },
    },
    killed,
    successor,
  };
}

/** Where a leader sits, by faction id - the vacancy projected into the
 *  RulesView in the `leadership` shape. Absent means nobody leads that land. */
export function leadersByFaction(rulers: Rulers): Record<string, boolean> {
  return Object.fromEntries(Object.keys(rulers).map((id) => [id, true]));
}

/** Prowess by faction id, the RulesView projection. A count map in the
 *  `omens` shape - absent means 0 - so a test-built view carrying no rulers
 *  reads as a world of unproven rulers rather than hitting `rulerOf`'s gap
 *  error. */
export function leadershipByFaction(rulers: Rulers): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [factionId, ruler] of Object.entries(rulers)) {
    if (ruler.leadership > 0) out[factionId] = ruler.leadership;
  }
  return out;
}

/** The abilities each seated ruler holds, the RulesView projection. Sparse
 *  like the two above: a seat with none contributes no key. */
export function abilitiesByFaction(rulers: Rulers): LeaderAbilities {
  const out: Record<string, readonly string[]> = {};
  for (const [factionId, ruler] of Object.entries(rulers)) {
    const held = ruler.abilities ?? [];
    if (held.length > 0) out[factionId] = held;
  }
  return out;
}

/** Grants an ability to the rulers of the named factions. The one writer, so
 *  a second ability is a call here and not a second way to seat one. */
export function grantAbility(
  rulers: Rulers, factionIds: readonly string[], abilityId: string,
): Rulers {
  const out: Rulers = { ...rulers };
  for (const factionId of factionIds) {
    const ruler = out[factionId];
    if (ruler === undefined) continue;
    const held = ruler.abilities ?? [];
    if (held.includes(abilityId)) continue;
    out[factionId] = { ...ruler, abilities: [...held, abilityId] };
  }
  return out;
}
