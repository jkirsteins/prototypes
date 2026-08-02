import { ACQUIRABLE_CARDS, CARDS, DECK_SIZE, STARTING_KNOWN_CARDS } from "./cards";
import { EARLY_PACKS, levelForXp, turnipPacksEarned } from "./xp";

/** Persistent progress: what the player may deck-build, and the two lifetime
 *  counters that pay out packs. `packsOpened` is the only bookkeeping stored -
 *  everything else about pack entitlement is derived, so the two can never
 *  disagree. */
export interface MetaRecord {
  knownCards: string[];
  xp: number;
  turnipsGrown: number;
  packsOpened: number;
  /** Runs that banked XP > 0. A run where nothing was played - an instant
   *  surrender - is not a completed game, so it neither earns nor burns a
   *  slot of the early-progression pity floor in `pendingPacks`. */
  gamesCompleted: number;
  /** The loadout confirmed at the last "Choose your lands": the cards the
   *  player picked, not the deck built from them - no Grow turnips filler. It
   *  seeds the deck screen so replaying the same deck is one click. */
  lastPicks: string[];
}

export const META_STORAGE_KEY = "balticmap-meta-v1";

export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory stand-in when localStorage is unavailable (private mode, tests). */
export function memoryStorage(): MetaStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function initialMeta(): MetaRecord {
  return {
    knownCards: ["grow-crops", ...STARTING_KNOWN_CARDS],
    xp: 0,
    turnipsGrown: 0,
    packsOpened: 0,
    gamesCompleted: 0,
    lastPicks: [],
  };
}

/** A card id the meta system tracks: exists and may appear in decks. */
const isTrackable = (id: unknown): id is string =>
  typeof id === "string" && CARDS[id]?.deckBuildable === true;

/** A sane lifetime counter: a whole number, non-negative, and capped well
 *  above anything reachable by play. Without the integer check and the
 *  ceiling, a hand-edited or corrupted record like `{"xp": 1e30}` loaded
 *  successfully and sent `levelForXp` spinning for roughly 2.8e14 iterations,
 *  freezing the tab. */
const isCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1e9;

const dedupe = (ids: string[]): string[] => [...new Set(ids)];

/** Records written before the XP refactor have no counters and fail this
 *  validation, so they reset to a fresh start. That is deliberate: a seen-pool
 *  has no meaning under the new system, and silently resetting is what corrupt
 *  data already did. */
export function loadMeta(storage: MetaStorage): MetaRecord {
  try {
    const raw = storage.getItem(META_STORAGE_KEY);
    if (raw === null) return initialMeta();
    const parsed: unknown = JSON.parse(raw);
    const rec = parsed as {
      knownCards?: unknown; xp?: unknown; turnipsGrown?: unknown;
      packsOpened?: unknown; gamesCompleted?: unknown; lastPicks?: unknown;
    };
    if (
      !Array.isArray(rec.knownCards) || !isCount(rec.xp) ||
      !isCount(rec.turnipsGrown) || !isCount(rec.packsOpened)
    ) {
      return initialMeta();
    }
    return {
      knownCards: dedupe([
        "grow-crops",
        ...STARTING_KNOWN_CARDS,
        ...rec.knownCards.filter(isTrackable),
      ]),
      xp: rec.xp,
      turnipsGrown: rec.turnipsGrown,
      packsOpened: rec.packsOpened,
      // Like lastPicks below, outside the validation gate: records written
      // before this field existed lack it, and resetting a whole collection
      // over a missing game counter would be absurd. Sanitizes to 0, which
      // can only under-count - the pity floor sits inside a max() with the
      // XP level, so nobody is owed fewer packs than their XP already pays.
      gamesCompleted: isCount(rec.gamesCompleted) ? rec.gamesCompleted : 0,
      // Deliberately outside the validation gate above: every record written
      // before this field existed lacks it, and the gate resets the whole
      // record. A missing or nonsense loadout means "nothing preselected",
      // never a wiped collection. Not filtered against knownCards - the deck
      // screen prunes to what is known on every render, and buildPlayerDeck
      // filters again before the deck is dealt.
      lastPicks: Array.isArray(rec.lastPicks)
        ? dedupe(rec.lastPicks.filter(isTrackable)).slice(0, DECK_SIZE)
        : [],
    };
  } catch {
    return initialMeta();
  }
}

export function saveMeta(storage: MetaStorage, meta: MetaRecord): void {
  try {
    storage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // storage full or unavailable: progress persists in memory only
  }
}

export function resetMeta(storage: MetaStorage): MetaRecord {
  try {
    storage.removeItem(META_STORAGE_KEY);
  } catch {
    // ignore
  }
  return initialMeta();
}

/** Packs the player has earned but not yet opened. Derived from the lifetime
 *  counters, so no code path can grant a pack without the XP, the games or
 *  the turnips to back it. The pity floor - one pack per completed game for
 *  the first EARLY_PACKS games - sits inside a max() with the XP level, not a
 *  sum: both pay for the same early packs, whichever runs ahead. Turnip packs
 *  stack on top. Both max() terms only ever grow, so `earned` is monotonic
 *  and `packsOpened` can never strand a pack. */
export function pendingPacks(meta: MetaRecord): number {
  const earned =
    Math.max(levelForXp(meta.xp), Math.min(meta.gamesCompleted, EARLY_PACKS)) +
    turnipPacksEarned(meta.turnipsGrown);
  return Math.max(0, earned - meta.packsOpened);
}

/** Folds a finished run's totals into the lifetime record. A nonsense total is
 *  dropped rather than written: progress is the one thing a bug here would
 *  corrupt permanently. */
export function bankRun(
  meta: MetaRecord, xpEarned: number, turnipsGrown: number,
): MetaRecord {
  const xp = isCount(xpEarned) ? xpEarned : 0;
  return {
    ...meta,
    xp: meta.xp + xp,
    turnipsGrown: meta.turnipsGrown + (isCount(turnipsGrown) ? turnipsGrown : 0),
    gamesCompleted: meta.gamesCompleted + (xp > 0 ? 1 : 0),
  };
}

/** Opens one pack: learns whatever is new and reports what each card was, so
 *  the reveal can tag it NEW or already-known. An empty draw still counts as
 *  opened - `pendingPacks` must always be able to reach zero. */
export function applyPack(
  meta: MetaRecord, drawn: string[],
): { meta: MetaRecord; results: { id: string; isNew: boolean }[] } {
  const known = new Set(meta.knownCards);
  const results = drawn.map((id) => {
    const isNew = !known.has(id);
    known.add(id);
    return { id, isNew };
  });
  return {
    meta: {
      ...meta,
      knownCards: dedupe([...meta.knownCards, ...drawn.filter(isTrackable)]),
      packsOpened: meta.packsOpened + 1,
    },
    results,
  };
}

/** How much of the pack pool the player owns. Starting cards are not part of
 *  the pool, so a fresh record reads 0 of 9 rather than 3 of 12. */
export function collectedCount(meta: MetaRecord): number {
  return ACQUIRABLE_CARDS.filter((id) => meta.knownCards.includes(id)).length;
}

/** The human deck: selected known non-basics (max 1 each) plus Grow potatoes
 *  filler to exactly DECK_SIZE. Invalid selections are dropped, not thrown. */
export function buildPlayerDeck(
  knownCards: string[],
  selectedIds: string[],
): string[] {
  const picks = dedupe(selectedIds)
    .filter(
      (id) =>
        isTrackable(id) &&
        CARDS[id].maxPerDeck !== null &&
        knownCards.includes(id),
    )
    .slice(0, DECK_SIZE);
  return [
    ...picks,
    ...Array.from({ length: DECK_SIZE - picks.length }, () => "grow-crops"),
  ];
}
