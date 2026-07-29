import pools from "./data/ruler-names.json";

export interface Ruler {
  name: string;
  /** Turn this ruler took over; 1 for the rulers a world starts with. No
   *  mechanics hang off it yet - it is the field ruler properties will need. */
  since: number;
}

/** Total over the world's faction ids. `initialRulers` is the only
 *  constructor and `replaceRuler` the only writer, so nothing else can
 *  create a gap. */
export type Rulers = Record<string, Ruler>;

const POOLS = pools as Record<string, string[]>;
const GENERIC = "generic";

function poolFor(ethnicity: string | undefined): string[] {
  return POOLS[ethnicity ?? GENERIC] ?? POOLS[GENERIC];
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

/** Seats a ruler for every faction. The only way to build a `Rulers`. */
export function initialRulers(
  factionIds: string[],
  ethnicities: Record<string, string> = {},
): Rulers {
  const rulers: Rulers = {};
  const taken = new Set<string>();
  for (const factionId of factionIds) {
    const name = rulerNameFor(factionId, ethnicities[factionId], 0, taken);
    taken.add(name);
    rulers[factionId] = { name, since: 1 };
  }
  return rulers;
}

/** Throws on a gap. A faction with no ruler is a bug in the model, and it
 *  should fail a test or a simulation rather than print "undefined" on a
 *  tooltip. */
export function rulerOf(rulers: Rulers, factionId: string): Ruler {
  const ruler = rulers[factionId];
  if (ruler === undefined) {
    throw new Error(`no ruler for faction "${factionId}"`);
  }
  return ruler;
}

/** The only writer. Returns both names so the caller can record what
 *  happened without asking twice and risking a different answer. */
export function replaceRuler(
  rulers: Rulers,
  ethnicities: Record<string, string>,
  factionId: string,
  turn: number,
): { rulers: Rulers; killed: string; successor: string } {
  const killed = rulerOf(rulers, factionId).name;
  const taken = new Set(Object.values(rulers).map((r) => r.name));
  const successor = rulerNameFor(factionId, ethnicities[factionId], turn, taken);
  return {
    rulers: { ...rulers, [factionId]: { name: successor, since: turn } },
    killed,
    successor,
  };
}
