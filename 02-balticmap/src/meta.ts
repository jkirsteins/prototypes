import { CARDS, DECK_SIZE } from "./cards";

/** Persistent roguelite progress: cards the player may deck-build, and
 *  cards seen in past runs but not yet unlocked. */
export interface MetaRecord {
  knownCards: string[];
  seenPool: string[];
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
  return { knownCards: ["grow-crops"], seenPool: [] };
}

/** A card id the meta system tracks: exists and may appear in decks. */
const isTrackable = (id: unknown): id is string =>
  typeof id === "string" && CARDS[id]?.deckBuildable === true;

const dedupe = (ids: string[]): string[] => [...new Set(ids)];

export function loadMeta(storage: MetaStorage): MetaRecord {
  try {
    const raw = storage.getItem(META_STORAGE_KEY);
    if (raw === null) return initialMeta();
    const parsed: unknown = JSON.parse(raw);
    const rec = parsed as { knownCards?: unknown; seenPool?: unknown };
    if (!Array.isArray(rec.knownCards) || !Array.isArray(rec.seenPool)) {
      return initialMeta();
    }
    const knownCards = dedupe([
      "grow-crops",
      ...rec.knownCards.filter(isTrackable),
    ]);
    const seenPool = dedupe(
      rec.seenPool.filter(
        (id): id is string => isTrackable(id) && !knownCards.includes(id),
      ),
    );
    return { knownCards, seenPool };
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

/** Permanently learns a card from the seen pool. */
export function unlockCard(meta: MetaRecord, cardId: string): MetaRecord {
  if (!meta.seenPool.includes(cardId)) return meta;
  return {
    knownCards: [...meta.knownCards, cardId],
    seenPool: meta.seenPool.filter((id) => id !== cardId),
  };
}

/** Learns everything in the seen pool at once, and reports what was learned so
 *  the player can be told.
 *
 *  Replaces the old one-unlock-per-game choice. Picking one card out of five
 *  witnessed was a decision made with no information - you have not played any
 *  of them yet - and it gated the deck the player could experiment with behind
 *  several more runs. Witnessing a card is the achievement; rationing it
 *  afterwards only slowed the loop down.
 *
 *  Returns the same record when the pool is empty, so callers can skip the save
 *  and the modal on the common path. */
export function unlockAllSeen(
  meta: MetaRecord,
): { meta: MetaRecord; learned: string[] } {
  if (meta.seenPool.length === 0) return { meta, learned: [] };
  const learned = meta.seenPool;
  return {
    meta: { knownCards: [...meta.knownCards, ...learned], seenPool: [] },
    learned,
  };
}

/** Banks a run's seen cards as unlock candidates. */
export function mergeSeen(meta: MetaRecord, seen: string[]): MetaRecord {
  const fresh = dedupe(seen).filter(
    (id) =>
      isTrackable(id) &&
      CARDS[id].maxPerDeck !== null && // non-basics only
      !meta.knownCards.includes(id) &&
      !meta.seenPool.includes(id),
  );
  if (fresh.length === 0) return meta;
  return { ...meta, seenPool: [...meta.seenPool, ...fresh] };
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
