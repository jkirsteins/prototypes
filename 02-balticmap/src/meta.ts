import { ACQUIRABLE_CARDS, CARDS, DECK_SIZE, STARTING_KNOWN_CARDS } from "./cards";
import { levelForXp, turnipPacksEarned } from "./xp";

/** Persistent progress: what the player may deck-build, and the two lifetime
 *  counters that pay out packs. `packsOpened` is the only bookkeeping stored -
 *  everything else about pack entitlement is derived, so the two can never
 *  disagree. */
export interface MetaRecord {
  knownCards: string[];
  xp: number;
  turnipsGrown: number;
  packsOpened: number;
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
  };
}

/** A card id the meta system tracks: exists and may appear in decks. */
const isTrackable = (id: unknown): id is string =>
  typeof id === "string" && CARDS[id]?.deckBuildable === true;

const isCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

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
      knownCards?: unknown; xp?: unknown;
      turnipsGrown?: unknown; packsOpened?: unknown;
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

/** Packs the player has earned but not yet opened. Derived from the two
 *  lifetime counters, so no code path can grant a pack without the XP or the
 *  turnips to back it. */
export function pendingPacks(meta: MetaRecord): number {
  const earned = levelForXp(meta.xp) + turnipPacksEarned(meta.turnipsGrown);
  return Math.max(0, earned - meta.packsOpened);
}

/** Folds a finished run's totals into the lifetime record. A nonsense total is
 *  dropped rather than written: progress is the one thing a bug here would
 *  corrupt permanently. */
export function bankRun(
  meta: MetaRecord, xpEarned: number, turnipsGrown: number,
): MetaRecord {
  return {
    ...meta,
    xp: meta.xp + (isCount(xpEarned) ? xpEarned : 0),
    turnipsGrown: meta.turnipsGrown + (isCount(turnipsGrown) ? turnipsGrown : 0),
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
